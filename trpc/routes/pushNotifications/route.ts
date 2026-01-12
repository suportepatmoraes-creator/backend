import { z } from 'zod';
import { protectedProcedure } from '../../create-context';
import { TRPCError } from '@trpc/server';

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

// Types for Expo Push API
interface ExpoPushMessage {
    to: string;
    title?: string;
    body: string;
    data?: Record<string, any>;
    sound?: 'default' | null;
    badge?: number;
    channelId?: string;
    priority?: 'default' | 'normal' | 'high';
}

interface ExpoPushTicket {
    status: 'ok' | 'error';
    id?: string;
    message?: string;
    details?: any;
}

// Helper function to get localized content
function getLocalizedContent(
    language: string,
    translations: { pt: string; en: string; es: string; ko: string }
): string {
    const lang = language?.split('-')[0] || 'pt';
    switch (lang) {
        case 'pt': return translations.pt;
        case 'en': return translations.en;
        case 'es': return translations.es;
        case 'ko': return translations.ko;
        default: return translations.en;
    }
}

// Send push notification via Expo Push API
async function sendExpoPushNotifications(
    messages: ExpoPushMessage[]
): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) return [];

    try {
        // Expo API accepts max 100 notifications per request
        const chunks: ExpoPushMessage[][] = [];
        for (let i = 0; i < messages.length; i += 100) {
            chunks.push(messages.slice(i, i + 100));
        }

        const tickets: ExpoPushTicket[] = [];

        for (const chunk of chunks) {
            const response = await fetch(EXPO_PUSH_API_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(chunk),
            });

            const data = await response.json();
            tickets.push(...(data.data || []));
        }

        return tickets;
    } catch (error) {
        console.error('[Push] Error sending notifications:', error);
        throw error;
    }
}

// Send push notification to specific users
export const sendPushNotificationProcedure = protectedProcedure
    .input(z.object({
        title_pt: z.string().min(1),
        title_en: z.string().min(1),
        title_es: z.string().min(1),
        title_ko: z.string().min(1),
        body_pt: z.string().min(1),
        body_en: z.string().min(1),
        body_es: z.string().min(1),
        body_ko: z.string().min(1),
        data: z.record(z.string(), z.any()).optional(),
        image_url: z.string().url().optional(),
        target_type: z.enum(['all', 'segment', 'individual']).default('all'),
        target_locale: z.enum(['all', 'pt', 'en', 'es', 'ko']).default('all'),
        target_user_ids: z.array(z.string().uuid()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
        console.log('[Push] sendPush called with input:', JSON.stringify(input));
        console.log('[Push] User ID:', ctx.user?.id);

        // Check if user is admin
        const { data: userData, error: userError } = await ctx.supabase
            .from('users')
            .select('user_type')
            .eq('id', ctx.user.id)
            .single();

        console.log('[Push] User data:', userData, 'Error:', userError);

        if (!userData || !['official', 'admin'].includes(userData.user_type)) {
            console.log('[Push] FORBIDDEN - user type:', userData?.user_type);
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'Only admins can send push notifications'
            });
        }

        try {
            // Get target tokens based on target_type
            let tokensQuery = ctx.supabase
                .from('user_push_tokens')
                .select('expo_push_token, user_id, device_locale')
                .eq('is_active', true);

            if (input.target_type === 'individual' && input.target_user_ids) {
                tokensQuery = tokensQuery.in('user_id', input.target_user_ids);
            }

            // Filter by target locale if specified
            if (input.target_locale && input.target_locale !== 'all') {
                tokensQuery = tokensQuery.eq('device_locale', input.target_locale);
            }

            const { data: tokens, error: tokensError } = await tokensQuery;

            if (tokensError) {
                console.error('[Push] Error fetching tokens:', tokensError);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to fetch push tokens: ' + tokensError.message
                });
            }

            if (!tokens || tokens.length === 0) {
                return {
                    success: true,
                    sent_count: 0,
                    message: 'No active push tokens found'
                };
            }

            // Build messages with localized content (using device_locale)
            const messages: ExpoPushMessage[] = tokens.map((token: any) => {
                const language = token.device_locale || 'pt';

                return {
                    to: token.expo_push_token,
                    title: getLocalizedContent(language, {
                        pt: input.title_pt,
                        en: input.title_en,
                        es: input.title_es,
                        ko: input.title_ko,
                    }),
                    body: getLocalizedContent(language, {
                        pt: input.body_pt,
                        en: input.body_en,
                        es: input.body_es,
                        ko: input.body_ko,
                    }),
                    data: {
                        ...input.data,
                        image_url: input.image_url,
                    },
                    sound: 'default',
                    channelId: 'default',
                    priority: 'high',
                };
            });

            // Send notifications
            const tickets = await sendExpoPushNotifications(messages);

            // Count successes and failures
            const successCount = tickets.filter(t => t.status === 'ok').length;
            const failureCount = tickets.filter(t => t.status === 'error').length;

            // Save campaign to database
            const { data: campaign, error: campaignError } = await ctx.supabase
                .from('push_notification_campaigns')
                .insert({
                    title_pt: input.title_pt,
                    title_en: input.title_en,
                    title_es: input.title_es,
                    title_ko: input.title_ko,
                    body_pt: input.body_pt,
                    body_en: input.body_en,
                    body_es: input.body_es,
                    body_ko: input.body_ko,
                    data: input.data || {},
                    image_url: input.image_url,
                    target_type: input.target_type,
                    target_user_ids: input.target_user_ids,
                    sent_count: tokens.length,
                    success_count: successCount,
                    failure_count: failureCount,
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    created_by: ctx.user.id,
                })
                .select()
                .single();

            if (campaignError) {
                console.error('[Push] Error saving campaign:', campaignError);
            }

            return {
                success: true,
                campaign_id: campaign?.id,
                sent_count: tokens.length,
                success_count: successCount,
                failure_count: failureCount,
            };
        } catch (error) {
            console.error('[Push] Error sending push notifications:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to send push notifications'
            });
        }
    });

// Get push notification campaigns
export const getCampaignsProcedure = protectedProcedure
    .input(z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().uuid().optional(),
    }))
    .query(async ({ input, ctx }) => {
        try {
            let query = ctx.supabase
                .from('push_notification_campaigns')
                .select(`
                    *,
                    created_by_user:users!push_notification_campaigns_created_by_fkey (
                        id,
                        username,
                        display_name
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(input.limit + 1);

            if (input.cursor) {
                const { data: cursorData } = await ctx.supabase
                    .from('push_notification_campaigns')
                    .select('created_at')
                    .eq('id', input.cursor)
                    .single();

                if (cursorData) {
                    query = query.lt('created_at', cursorData.created_at);
                }
            }

            const { data, error } = await query;

            if (error) throw error;

            const hasMore = data && data.length > input.limit;
            const campaigns = hasMore ? data.slice(0, -1) : (data || []);
            const nextCursor = hasMore && campaigns.length > 0
                ? campaigns[campaigns.length - 1].id
                : undefined;

            return {
                campaigns,
                nextCursor,
                hasMore,
            };
        } catch (error) {
            console.error('[Push] Error fetching campaigns:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch campaigns'
            });
        }
    });

// Get push notification stats
export const getStatsProcedure = protectedProcedure
    .query(async ({ ctx }) => {
        try {
            // Get total active tokens
            const { count: activeTokens } = await ctx.supabase
                .from('user_push_tokens')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true);

            // Get total campaigns
            const { count: totalCampaigns } = await ctx.supabase
                .from('push_notification_campaigns')
                .select('*', { count: 'exact', head: true });

            // Get today's campaigns
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const { count: todayCampaigns } = await ctx.supabase
                .from('push_notification_campaigns')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', todayStart.toISOString());

            // Get total sent/success/failure counts
            const { data: totals } = await ctx.supabase
                .from('push_notification_campaigns')
                .select('sent_count, success_count, failure_count');

            const totalSent = totals?.reduce((acc, c) => acc + (c.sent_count || 0), 0) || 0;
            const totalSuccess = totals?.reduce((acc, c) => acc + (c.success_count || 0), 0) || 0;
            const totalFailure = totals?.reduce((acc, c) => acc + (c.failure_count || 0), 0) || 0;

            // Get tokens by locale
            const { data: allTokens } = await ctx.supabase
                .from('user_push_tokens')
                .select('device_locale')
                .eq('is_active', true);

            const tokensByLocale: Record<string, number> = {};
            (allTokens || []).forEach((t: any) => {
                const locale = t.device_locale || 'pt';
                tokensByLocale[locale] = (tokensByLocale[locale] || 0) + 1;
            });

            return {
                active_tokens: activeTokens || 0,
                tokens_by_locale: tokensByLocale,
                total_campaigns: totalCampaigns || 0,
                today_campaigns: todayCampaigns || 0,
                total_sent: totalSent,
                total_success: totalSuccess,
                total_failure: totalFailure,
                success_rate: totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0,
            };
        } catch (error) {
            console.error('[Push] Error fetching stats:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to fetch stats'
            });
        }
    });

// Send targeted push notification to a single user (for likes, follows, etc.)
export async function sendPushToUser(
    supabase: any,
    userId: string,
    title: { pt: string; en: string; es: string; ko: string },
    body: { pt: string; en: string; es: string; ko: string },
    data?: Record<string, any>
): Promise<boolean> {
    try {
        // Get user's push tokens and language preference
        const { data: tokens, error } = await supabase
            .from('user_push_tokens')
            .select(`
                expo_push_token,
                users!inner (
                    preferred_language
                )
            `)
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error || !tokens || tokens.length === 0) {
            console.log('[Push] No active tokens for user:', userId);
            return false;
        }

        // Check user's notification preferences
        const { data: prefs } = await supabase
            .from('user_notification_preferences')
            .select('push_enabled')
            .eq('user_id', userId)
            .single();

        if (prefs && !prefs.push_enabled) {
            console.log('[Push] User has disabled push notifications:', userId);
            return false;
        }

        const messages: ExpoPushMessage[] = tokens.map((token: any) => {
            const language = token.users?.preferred_language || 'pt';

            return {
                to: token.expo_push_token,
                title: getLocalizedContent(language, title),
                body: getLocalizedContent(language, body),
                data: data || {},
                sound: 'default',
                channelId: 'default',
            };
        });

        const tickets = await sendExpoPushNotifications(messages);
        const success = tickets.some(t => t.status === 'ok');

        console.log('[Push] Sent to user:', userId, 'Success:', success);
        return success;
    } catch (error) {
        console.error('[Push] Error sending to user:', error);
        return false;
    }
}
