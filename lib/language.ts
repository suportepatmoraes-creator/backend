import i18n from '../lib/i18n';

/**
 * Maps i18n language codes to TMDb-compatible language codes.
 * TMDb uses language-region codes like 'pt-BR', 'en-US', 'es-ES', etc.
 */
const TMDB_LANGUAGE_MAP: Record<string, string> = {
    'en': 'en-US',
    'en-US': 'en-US',
    'pt': 'pt-BR',
    'pt-BR': 'pt-BR',
    'es': 'es-ES',
    'es-ES': 'es-ES',
    'ko': 'ko-KR',
    'ko-KR': 'ko-KR',
    'ja': 'ja-JP',
    'ja-JP': 'ja-JP',
    'zh': 'zh-CN',
    'zh-CN': 'zh-CN',
    'fr': 'fr-FR',
    'fr-FR': 'fr-FR',
};

/**
 * Gets the current language from i18n and converts it to TMDb format.
 * Falls back to 'pt-BR' if language is not supported.
 */
export const getTMDbLanguage = (): string => {
    const currentLanguage = i18n.language || 'pt-BR';
    const tmdbLang = TMDB_LANGUAGE_MAP[currentLanguage] || 'pt-BR';
    console.log(`[LANG] getTMDbLanguage: i18n.language="${currentLanguage}" => TMDb="${tmdbLang}"`);
    return tmdbLang;
};
