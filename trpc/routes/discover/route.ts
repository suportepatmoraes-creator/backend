import { z } from 'zod';
import { protectedProcedure } from '../../create-context';

// Procedure para obter dramas e filmes pré-carregados para descobrir
export const getDiscoverDramasProcedure = protectedProcedure
  .input(z.object({
    limit: z.number().min(1).max(50).default(30)
  }))
  .query(async ({ ctx, input }) => {
    try {
      console.log(`Fetching discover content for user ${ctx.user.id}, limit: ${input.limit}`);

      // Get user's drama/movie lists to exclude
      const { data: userLists, error: listsError } = await ctx.supabase
        .from('user_drama_lists')
        .select('drama_id, media_type')
        .eq('user_id', ctx.user.id);

      if (listsError) {
        console.error('Error fetching user lists:', listsError);
      }

      // Filter by type for exclusion
      const excludedTvIds = userLists?.filter(i => i.media_type === 'tv').map(item => item.drama_id) || [];
      const excludedMovieIds = userLists?.filter(i => i.media_type === 'movie').map(item => item.drama_id) || [];

      // Get skipped content
      const { data: skippedData, error: skippedError } = await ctx.supabase
        .from('user_skipped_dramas')
        .select('drama_id, media_type')
        .eq('user_id', ctx.user.id)
        .gt('expires_at', new Date().toISOString());

      if (skippedError) {
        console.error('Error fetching skipped items:', skippedError);
      }

      const skippedTvIds = skippedData?.filter(i => (i as any).media_type === 'tv' || !(i as any).media_type).map(item => item.drama_id) || [];
      const skippedMovieIds = skippedData?.filter(i => (i as any).media_type === 'movie').map(item => item.drama_id) || [];

      const tvExclusions = [...excludedTvIds, ...skippedTvIds];
      const movieExclusions = [...excludedMovieIds, ...skippedMovieIds];

      const tmdbApiKey = '8265bd1679663a7ea12ac168da84d2e8';
      let allTvIds: number[] = [];
      let allMovieIds: number[] = [];

      // Fetch TV Shows - Top rated and Popular (Global)
      for (let page = 1; page <= 5; page++) {
        try {
          const [topRated, popular] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${tmdbApiKey}&sort_by=vote_average.desc&page=${page}&vote_count.gte=20&with_runtime.gte=15`).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${tmdbApiKey}&sort_by=popularity.desc&page=${page}`).then(r => r.json())
          ]);
          allTvIds.push(...(topRated.results?.map((d: any) => d.id) || []));
          allTvIds.push(...(popular.results?.map((d: any) => d.id) || []));
        } catch (error) {
          console.error(`Error fetching TMDB TV page ${page}:`, error);
        }
      }

      // Fetch Movies - Top rated and Popular (Global)
      for (let page = 1; page <= 5; page++) {
        try {
          const [topRated, popular] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbApiKey}&sort_by=vote_average.desc&page=${page}&vote_count.gte=20`).then(r => r.json()),
            fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbApiKey}&sort_by=popularity.desc&page=${page}`).then(r => r.json())
          ]);
          allMovieIds.push(...(topRated.results?.map((d: any) => d.id) || []));
          allMovieIds.push(...(popular.results?.map((d: any) => d.id) || []));
        } catch (error) {
          console.error(`Error fetching TMDB Movie page ${page}:`, error);
        }
      }

      // Remove duplicates and filter exclusions
      const uniqueTvIds = [...new Set(allTvIds)].filter(id => !tvExclusions.includes(id));
      const uniqueMovieIds = [...new Set(allMovieIds)].filter(id => !movieExclusions.includes(id));

      // Prepare final results interleaved
      const result: { id: number, type: 'tv' | 'movie' }[] = [];
      const maxLength = Math.max(uniqueTvIds.length, uniqueMovieIds.length);

      for (let i = 0; i < maxLength; i++) {
        if (uniqueTvIds[i]) result.push({ id: uniqueTvIds[i], type: 'tv' });
        if (uniqueMovieIds[i]) result.push({ id: uniqueMovieIds[i], type: 'movie' });
        if (result.length >= input.limit) break;
      }

      console.log(`Returning ${result.length} discover items (${result.filter(r => r.type === 'tv').length} TV, ${result.filter(r => r.type === 'movie').length} Movie)`);
      return result;

    } catch (error) {
      console.error('Error in getDiscoverDramasProcedure:', error);
      throw new Error('Failed to fetch discover content');
    }
  });

// Procedure para pular um drama ou filme
export const skipDramaProcedure = protectedProcedure
  .input(z.object({
    dramaId: z.number(),
    mediaType: z.enum(['tv', 'movie']).default('tv')
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      const { error } = await ctx.supabase
        .from('user_skipped_dramas')
        .upsert({
          user_id: ctx.user.id,
          drama_id: input.dramaId,
          media_type: input.mediaType,
          skipped_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 dias
        }, {
          onConflict: 'user_id,drama_id,media_type'
        });

      if (error) {
        console.error('Error skipping item:', error);
        throw new Error('Failed to skip item');
      }

      return { success: true };
    } catch (error) {
      console.error('Error in skipDramaProcedure:', error);
      throw new Error('Failed to skip item');
    }
  });

// Procedure para obter status de swipes diários
export const getDailySwipesStatusProcedure = protectedProcedure
  .query(async ({ ctx }) => {
    try {
      console.log(`Getting daily swipes status for user ${ctx.user.id}`);

      // Check if user is premium
      const { data: premiumData } = await ctx.supabase
        .from('premium_subscriptions')
        .select('status, expires_at')
        .eq('user_id', ctx.user.id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .single();

      const isPremium = !!premiumData;
      console.log(`User premium status: ${isPremium}`);

      // Get today's swipes
      const today = new Date().toISOString().split('T')[0];
      const { data: swipeData, error: swipeError } = await ctx.supabase
        .from('user_daily_swipes')
        .select('swipes_used, daily_limit')
        .eq('user_id', ctx.user.id)
        .eq('swipe_date', today)
        .single();

      if (swipeError && swipeError.code !== 'PGRST116') {
        console.error('Error fetching swipe data:', swipeError);
      }

      const swipesUsed = swipeData?.swipes_used || 0;
      const dailyLimit = swipeData?.daily_limit || 20;
      const remainingSwipes = isPremium ? -1 : Math.max(0, dailyLimit - swipesUsed);

      console.log(`Swipes used: ${swipesUsed}, Daily limit: ${dailyLimit}, Remaining: ${remainingSwipes}`);

      return {
        swipes_used: swipesUsed,
        daily_limit: dailyLimit,
        remaining_swipes: remainingSwipes,
        can_swipe: isPremium || swipesUsed < dailyLimit,
        is_premium: isPremium
      };
    } catch (error) {
      console.error('Error in getDailySwipesStatusProcedure:', error);
      // Return default values on error
      return {
        swipes_used: 0,
        daily_limit: 20,
        remaining_swipes: 20,
        can_swipe: true,
        is_premium: false
      };
    }
  });

// Procedure para incrementar contador de swipes
export const incrementDailySwipesProcedure = protectedProcedure
  .mutation(async ({ ctx }) => {
    try {
      console.log(`Incrementing daily swipes for user ${ctx.user.id}`);

      // Check if user is premium
      const { data: premiumData } = await ctx.supabase
        .from('premium_subscriptions')
        .select('status, expires_at')
        .eq('user_id', ctx.user.id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .single();

      const isPremium = !!premiumData;
      const today = new Date().toISOString().split('T')[0];
      const defaultDailyLimit = 20;

      console.log(`User premium status: ${isPremium}, Today: ${today}`);

      // Get current swipes for today
      const { data: currentData, error: fetchError } = await ctx.supabase
        .from('user_daily_swipes')
        .select('swipes_used, daily_limit')
        .eq('user_id', ctx.user.id)
        .eq('swipe_date', today)
        .single();

      let newSwipesUsed = 1;
      // Use the daily_limit from database if exists, otherwise use default
      let actualDailyLimit = currentData?.daily_limit || defaultDailyLimit;

      if (fetchError && fetchError.code === 'PGRST116') {
        // No record exists, create new one
        console.log('Creating new daily swipes record');
        actualDailyLimit = defaultDailyLimit;
        const { error: insertError } = await ctx.supabase
          .from('user_daily_swipes')
          .insert({
            user_id: ctx.user.id,
            swipe_date: today,
            swipes_used: 1,
            daily_limit: actualDailyLimit,
            is_premium: isPremium
          });

        if (insertError) {
          console.error('Error inserting new swipes record:', insertError);
          throw new Error('Failed to create swipes record');
        }
      } else if (currentData) {
        // Record exists, increment it
        newSwipesUsed = currentData.swipes_used + 1;
        actualDailyLimit = currentData.daily_limit || defaultDailyLimit;
        console.log(`Updating existing record. Current: ${currentData.swipes_used}, New: ${newSwipesUsed}, DailyLimit: ${actualDailyLimit}`);

        // Check if user has reached limit (only for non-premium users)
        if (!isPremium && newSwipesUsed > actualDailyLimit) {
          console.log(`User has reached daily limit of ${actualDailyLimit}`);
          return {
            success: false,
            swipes_used: currentData.swipes_used,
            daily_limit: actualDailyLimit,
            remaining_swipes: 0,
            is_premium: isPremium,
            message: 'Daily limit reached'
          };
        }

        const { error: updateError } = await ctx.supabase
          .from('user_daily_swipes')
          .update({
            swipes_used: newSwipesUsed,
            is_premium: isPremium,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', ctx.user.id)
          .eq('swipe_date', today);

        if (updateError) {
          console.error('Error updating swipes record:', updateError);
          throw new Error('Failed to update swipes record');
        }
      } else {
        console.error('Unexpected error fetching swipes data:', fetchError);
        throw new Error('Failed to fetch swipes data');
      }

      const remainingSwipes = isPremium ? -1 : Math.max(0, actualDailyLimit - newSwipesUsed);
      const canSwipe = isPremium || newSwipesUsed < actualDailyLimit;

      console.log(`Swipe successful. Used: ${newSwipesUsed}, Limit: ${actualDailyLimit}, Remaining: ${remainingSwipes}, Can swipe: ${canSwipe}`);

      return {
        success: true,
        swipes_used: newSwipesUsed,
        daily_limit: actualDailyLimit,
        remaining_swipes: remainingSwipes,
        is_premium: isPremium,
        message: 'Swipe successful'
      };
    } catch (error) {
      console.error('Error in incrementDailySwipesProcedure:', error);
      // Return a permissive response on error to not block the user
      return {
        success: true,
        swipes_used: 1,
        daily_limit: 20,
        remaining_swipes: 19,
        is_premium: false,
        message: 'Swipe successful (fallback)'
      };
    }
  });

// Procedure para limpar dramas pulados expirados (para uso administrativo)
export const cleanExpiredSkippedDramasProcedure = protectedProcedure
  .mutation(async ({ ctx }) => {
    try {
      const { data, error } = await ctx.supabase
        .rpc('clean_expired_skipped_dramas');

      if (error) {
        console.error('Error cleaning expired skipped dramas:', error);
        throw new Error('Failed to clean expired skipped dramas');
      }

      return { deletedCount: data || 0 };
    } catch (error) {
      console.error('Error in cleanExpiredSkippedDramasProcedure:', error);
      throw new Error('Failed to clean expired skipped dramas');
    }
  });

// Procedure para adicionar swipes bônus (recompensa por assistir anúncio)
export const addBonusSwipesProcedure = protectedProcedure
  .input(z.object({
    bonusAmount: z.number().min(1).max(100).default(20)
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      console.log(`Adding ${input.bonusAmount} bonus swipes for user ${ctx.user.id}`);

      const today = new Date().toISOString().split('T')[0];

      // Get current swipes for today
      const { data: currentData, error: fetchError } = await ctx.supabase
        .from('user_daily_swipes')
        .select('swipes_used, daily_limit')
        .eq('user_id', ctx.user.id)
        .eq('swipe_date', today)
        .single();

      if (fetchError && fetchError.code === 'PGRST116') {
        // No record exists, create new one with bonus limit
        console.log('Creating new daily swipes record with bonus');
        const newDailyLimit = 20 + input.bonusAmount;
        const { error: insertError } = await ctx.supabase
          .from('user_daily_swipes')
          .insert({
            user_id: ctx.user.id,
            swipe_date: today,
            swipes_used: 0,
            daily_limit: newDailyLimit,
            is_premium: false
          });

        if (insertError) {
          console.error('Error inserting bonus swipes record:', insertError);
          throw new Error('Failed to add bonus swipes');
        }

        console.log(`Bonus added! New daily limit: ${newDailyLimit}`);
        return {
          success: true,
          swipes_used: 0,
          daily_limit: newDailyLimit,
          remaining_swipes: newDailyLimit,
          bonus_added: input.bonusAmount,
          message: `+${input.bonusAmount} swipes adicionados!`
        };
      } else if (currentData) {
        // Record exists, increase daily_limit
        const newDailyLimit = currentData.daily_limit + input.bonusAmount;
        const remainingSwipes = Math.max(0, newDailyLimit - currentData.swipes_used);

        console.log(`Updating daily limit. Current: ${currentData.daily_limit}, New: ${newDailyLimit}`);

        const { error: updateError } = await ctx.supabase
          .from('user_daily_swipes')
          .update({
            daily_limit: newDailyLimit,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', ctx.user.id)
          .eq('swipe_date', today);

        if (updateError) {
          console.error('Error updating bonus swipes:', updateError);
          throw new Error('Failed to add bonus swipes');
        }

        console.log(`Bonus added! New daily limit: ${newDailyLimit}, Remaining: ${remainingSwipes}`);
        return {
          success: true,
          swipes_used: currentData.swipes_used,
          daily_limit: newDailyLimit,
          remaining_swipes: remainingSwipes,
          bonus_added: input.bonusAmount,
          message: `+${input.bonusAmount} swipes adicionados!`
        };
      } else {
        console.error('Unexpected error fetching swipes data:', fetchError);
        throw new Error('Failed to fetch swipes data');
      }
    } catch (error) {
      console.error('Error in addBonusSwipesProcedure:', error);
      return {
        success: false,
        swipes_used: 0,
        daily_limit: 20,
        remaining_swipes: 0,
        bonus_added: 0,
        message: 'Erro ao adicionar swipes bônus'
      };
    }
  });
