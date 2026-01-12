import { z } from 'zod';
import { publicProcedure } from '../../create-context';

export const getHomepageCollections = publicProcedure
  .input(z.object({
    language: z.enum(['pt', 'en', 'es', 'ko']).optional().default('pt')
  }).optional())
  .query(async ({ input, ctx }) => {
    try {
      const language = input?.language || 'pt';

      const { data, error } = await ctx.supabase
        .rpc('get_homepage_collections', { p_language: language });

      if (error) {
        console.error('[Collections] Supabase RPC error:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('[Collections] Homepage collections error:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to fetch homepage collections');
    }
  });

// Helper to map language codes to TMDB language format
const mapLanguageToTMDB = (lang: string): string => {
  const mapping: Record<string, string> = {
    'pt': 'pt-BR',
    'en': 'en-US',
    'es': 'es-ES',
    'ko': 'ko-KR',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'it': 'it-IT',
    'pl': 'pl-PL',
    'id': 'id-ID',
    'th': 'th-TH',
  };
  return mapping[lang] || 'en-US';
};

export const getCollectionDramas = publicProcedure
  .input(z.object({
    collectionId: z.string().uuid(),
    limit: z.number().min(1).max(50).optional().default(20),
    language: z.string().optional().default('pt'),
  }))
  .query(async ({ input, ctx }) => {
    try {
      console.log('[Collections] Fetching dramas for collection:', input.collectionId, 'language:', input.language);

      const { data, error } = await ctx.supabase
        .rpc('get_collection_dramas', {
          collection_uuid: input.collectionId
        });

      if (error) {
        console.error('[Collections] Supabase RPC error:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      const limitedData = data?.slice(0, input.limit) || [];
      console.log('[Collections] Found', limitedData.length, 'dramas (limit:', input.limit, ')');

      // If language is pt (default), use cached titles from database
      if (input.language === 'pt') {
        return limitedData;
      }

      // For other languages, fetch titles from TMDB
      const tmdbLanguage = mapLanguageToTMDB(input.language);
      const tmdbApiKey = process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY;

      if (!tmdbApiKey) {
        console.warn('[Collections] No TMDB API key found, using cached titles');
        return limitedData;
      }

      // Fetch drama details from TMDB in parallel for all dramas
      const enrichedData = await Promise.all(
        limitedData.map(async (drama: any) => {
          try {
            const response = await fetch(
              `https://api.themoviedb.org/3/tv/${drama.drama_id}?language=${tmdbLanguage}`,
              {
                headers: {
                  'Authorization': `Bearer ${tmdbApiKey}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (response.ok) {
              const tmdbData = await response.json();
              return {
                ...drama,
                drama_title: tmdbData.name || drama.drama_title,
              };
            }
            return drama;
          } catch (err) {
            console.error('[Collections] TMDB fetch error for drama', drama.drama_id, err);
            return drama;
          }
        })
      );

      return enrichedData;
    } catch (error) {
      console.error('[Collections] Collection dramas error:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to fetch collection dramas');
    }
  });

export const getCollectionById = publicProcedure
  .input(z.object({
    collectionId: z.string().uuid(),
  }))
  .query(async ({ input, ctx }) => {
    try {
      console.log('[Collections] Fetching collection by ID:', input.collectionId);

      const { data, error } = await ctx.supabase
        .from('custom_collections')
        .select('*')
        .eq('id', input.collectionId)
        .eq('is_visible', true)
        .maybeSingle();

      if (error) {
        console.error('[Collections] Supabase error:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data) {
        console.error('[Collections] Collection not found:', input.collectionId);
        throw new Error('Collection not found or is not visible');
      }

      console.log('[Collections] Successfully fetched collection:', data.title);
      return data;
    } catch (error) {
      console.error('[Collections] Collection fetch error:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to fetch collection');
    }
  });