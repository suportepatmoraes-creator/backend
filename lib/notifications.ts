import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

type ReleaseReminderSettings = { offsetDays: number; enableGlobal: boolean; enableCustom: boolean };

const REMINDERS_KEY = 'releaseReminders';
const SETTINGS_KEY = 'releaseReminderSettings';

Notifications.setNotificationHandler({
  handleNotification: async (): Promise<Notifications.NotificationBehavior> => {
    return {
      // propriedades comuns
      shouldShowAlert: true,     // se quiser mostrar um alerta modal/vizual
      shouldPlaySound: false,
      shouldSetBadge: false,
      // propriedades requeridas em versões mais novas das types
      shouldShowBanner: true,    // mostra banner (iOS/Android dependendo da plataforma)
      shouldShowList: true,      // adiciona à lista de notificações (centro de notificações)
    };
  },
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    const importance = (Notifications as any).AndroidImportance?.DEFAULT ?? 3; // fallback numeric
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance,
    });
  } catch (e) {
    console.warn('Não foi possível criar channel Android:', e);
  }
}

export async function requestPermissions(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    const status = (settings as any).status ?? (settings as any).granted ? 'granted' : 'undetermined';
    let granted = status === 'granted' || (settings as any).granted === true;

    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      const reqStatus = (req as any).status ?? (req as any).granted ? 'granted' : 'undetermined';
      granted = reqStatus === 'granted' || (req as any).granted === true;
    }

    if (granted) await ensureAndroidChannel();
    return granted;
  } catch (e) {
    console.error('Erro ao solicitar permissões de notificação:', e);
    return false;
  }
}

export async function getSettings(): Promise<ReleaseReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as ReleaseReminderSettings;
  } catch (e) {
    console.warn('Erro ao ler settings:', e);
  }
  return { offsetDays: 1, enableGlobal: true, enableCustom: true };
}

export async function saveSettings(s: ReleaseReminderSettings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    console.error('Erro ao salvar settings:', e);
  }
}

export async function getReminders(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(REMINDERS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch (e) {
    console.warn('Erro ao ler reminders:', e);
  }
  return {};
}

export async function saveReminders(map: Record<string, string>) {
  try {
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('Erro ao salvar reminders:', e);
  }
}

export async function scheduleReleaseReminder(
  dramaId: number,
  dramaName: string,
  releaseDateISO: string,
  offsetDays: number
): Promise<string | null> {
  try {
    const ok = await requestPermissions();
    if (!ok) return null;

    const releaseDate = new Date(releaseDateISO);
    if (isNaN(releaseDate.getTime())) {
      console.warn('releaseDateISO inválido:', releaseDateISO);
      return null;
    }

    const triggerDate = new Date(releaseDate.getTime() - offsetDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const finalDate = triggerDate > now ? triggerDate : releaseDate > now ? releaseDate : null;
    if (!finalDate) return null;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Estreia chegando',
        body: `${dramaName} estreia em breve!`,
        data: { dramaId, releaseDate: releaseDateISO },
      },
      trigger: {
        type: 'date',
        date: finalDate,
        // só passe channelId em android (expo cuida disso), mas é seguro passar condicionalmente
        ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
      } as any,
    });

    const map = await getReminders();
    map[String(dramaId)] = id;
    await saveReminders(map);
    return id;
  } catch (e) {
    console.error('Erro ao agendar reminder:', e);
    return null;
  }
}

export async function cancelReleaseReminder(dramaId: number) {
  try {
    const map = await getReminders();
    const id = map[String(dramaId)];
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id);
      delete map[String(dramaId)];
      await saveReminders(map);
    }
  } catch (e) {
    console.error('Erro ao cancelar reminder:', e);
  }
}
