import { z } from 'zod';
import { publicProcedure, protectedProcedure } from '../../create-context';
import { TRPCError } from '@trpc/server';
import { generateQuestions, generateQuestionsByType, QuestionTypeConfig } from './generator';

// =====================================================
// USER-FACING QUIZ PROCEDURES
// =====================================================

// Get all active seasons
export const getActiveSeasonsProcedure = publicProcedure
    .query(async ({ ctx }) => {
        try {
            const today = new Date().toISOString().split('T')[0];

            const { data, error } = await ctx.supabase
                .from('quiz_seasons')
                .select('*')
                .eq('is_active', true)
                .lte('start_date', today)
                .gte('end_date', today)
                .order('start_date', { ascending: false });

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Error fetching active seasons:', error);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch seasons' });
        }
    });

// Get upcoming seasons
export const getUpcomingSeasonsProcedure = publicProcedure
    .query(async ({ ctx }) => {
        try {
            const today = new Date().toISOString().split('T')[0];

            // If user is logged in, we also want to know which ones they joined
            let query = ctx.supabase
                .from('quiz_seasons')
                .select(`
                    *,
                    quiz_scores (
                        user_id
                    )
                `)
                .eq('is_active', true)
                .gt('start_date', today)
                .order('start_date', { ascending: true });

            const { data, error } = await query;

            if (error) throw error;

            // Process data to check if user joined
            const seasons = (data || []).map((season: any) => {
                const joined = ctx.user ? season.quiz_scores?.some((s: any) => s.user_id === ctx.user?.id) : false;
                // Remove the joined array to clean up response
                const { quiz_scores, ...rest } = season;
                return {
                    ...rest,
                    is_joined: joined
                };
            });

            return seasons;
        } catch (error) {
            console.error('Error fetching upcoming seasons:', error);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch upcoming seasons' });
        }
    });

// Join a season (pre-registration)
export const joinSeasonProcedure = protectedProcedure
    .input(z.object({ seasonId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
        try {
            // Check if already joined
            const { data: existing } = await ctx.supabase
                .from('quiz_scores')
                .select('id')
                .eq('season_id', input.seasonId)
                .eq('user_id', ctx.user.id)
                .single();

            if (existing) {
                return { success: true, message: 'Already joined' };
            }

            // Join by initializing score
            const { error } = await ctx.supabase
                .from('quiz_scores')
                .insert({
                    season_id: input.seasonId,
                    user_id: ctx.user.id,
                    total_points: 0,
                    correct_answers: 0,
                    current_streak: 0
                });

            if (error) throw error;

            return { success: true };
        } catch (error: any) {
            console.error('Error joining season:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Failed to join season: ${error.message || 'Unknown error'}`
            });
        }
    });

// Get all seasons (including upcoming and past)
export const getAllSeasonsProcedure = publicProcedure
    .query(async ({ ctx }) => {
        try {
            const { data, error } = await ctx.supabase
                .from('quiz_seasons')
                .select('*')
                .order('start_date', { ascending: false });

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Error fetching all seasons:', error);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch seasons' });
        }
    });

// Get season details
export const getSeasonDetailsProcedure = publicProcedure
    .input(z.object({
        seasonId: z.string().uuid()
    }))
    .query(async ({ input, ctx }) => {
        try {
            const { data: season, error } = await ctx.supabase
                .from('quiz_seasons')
                .select('*')
                .eq('id', input.seasonId)
                .single();

            if (error) throw error;

            // Calculate current day of season
            const startDate = new Date(season.start_date);
            const today = new Date();
            const currentDay = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            // Get total participants
            // Get total participants
            const { count: participantsCount } = await ctx.supabase
                .from('quiz_scores')
                .select('id', { count: 'exact', head: true })
                .eq('season_id', input.seasonId);

            // Check if user joined
            let isJoined = false;
            if (ctx.user) {
                const { data: score } = await ctx.supabase
                    .from('quiz_scores')
                    .select('id')
                    .eq('season_id', input.seasonId)
                    .eq('user_id', ctx.user.id)
                    .single();
                isJoined = !!score;
            }

            return {
                ...season,
                current_day: Math.max(1, Math.min(currentDay, 15)),
                participants_count: participantsCount || 0,
                is_joined: isJoined
            };
        } catch (error) {
            console.error('Error fetching season details:', error);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch season details' });
        }
    });

// Get today's questions for a season
export const getTodayQuestionsProcedure = publicProcedure
    .input(z.object({
        seasonId: z.string().uuid(),
        deviceId: z.string().optional(),
        locale: z.enum(['pt', 'es', 'ko', 'en']).optional().default('en')
    }))
    .query(async ({ input, ctx }) => {
        try {
            // Get season start date and config to calculate current day
            const { data: season, error: seasonError } = await ctx.supabase
                .from('quiz_seasons')
                .select('*')
                .eq('id', input.seasonId)
                .single();

            if (seasonError || !season) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Season not found' });
            }

            // Config values (with defaults for backward compatibility)
            const TOTAL_QUESTIONS = season.daily_questions_total || 9;
            const FREE_QUESTIONS = season.daily_free_questions || 3;
            const EASY_MEDIUM_COUNT = season.daily_easy_medium_count || 6;
            const HARD_COUNT = season.daily_hard_count || 3;

            const startDate = new Date(season.start_date);
            const today = new Date();
            const currentDay = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            const seasonDuration = season.season_duration_days || 15;

            // Calculate when the next day starts (midnight)
            const nextDayDate = new Date(startDate);
            nextDayDate.setDate(startDate.getDate() + currentDay);
            nextDayDate.setHours(0, 0, 0, 0);
            const nextQuestionsAt = nextDayDate.toISOString();

            const isSeasonCompleted = currentDay > seasonDuration;

            if (currentDay < 1 || isSeasonCompleted) {
                return {
                    questions: [],
                    current_day: currentDay,
                    daily_progress: null,
                    next_questions_at: nextQuestionsAt,
                    is_season_completed: isSeasonCompleted
                };
            }

            // Get already answered questions for this season
            let answeredQuestionIds: string[] = [];
            let answeredTodayIds: string[] = [];
            const userId = ctx.user?.id;
            const deviceId = input.deviceId;
            const todayStr = new Date().toISOString().split('T')[0];

            if (userId || deviceId) {
                const query = ctx.supabase
                    .from('quiz_answers')
                    .select('question_id, answered_at')
                    .eq('season_id', input.seasonId);

                if (userId) query.eq('user_id', userId);
                else query.eq('device_id', deviceId);

                const { data: answers } = await query;
                answeredQuestionIds = (answers || []).map((a: any) => a.question_id);
                answeredTodayIds = (answers || [])
                    .filter((a: any) => a.answered_at.startsWith(todayStr))
                    .map((a: any) => a.question_id);
            }

            // 1. Get questions already answered today
            let finalQuestions: any[] = [];
            if (answeredTodayIds.length > 0) {
                const { data: todayQs } = await ctx.supabase
                    .from('quiz_questions')
                    .select('id, question_type, question_text, question_text_pt, question_text_es, question_text_ko, question_text_en, image_url, options, options_pt, options_es, options_ko, options_en, time_limit_seconds, difficulty')
                    .in('id', answeredTodayIds);
                if (todayQs) {
                    // Sort them in the order they were answered
                    finalQuestions = answeredTodayIds.map(id => todayQs.find(q => q.id === id)).filter(Boolean);
                }
            }

            // 2. If less than TOTAL_QUESTIONS, fill with random unanswered questions
            if (finalQuestions.length < TOTAL_QUESTIONS) {
                // Determine how many of each difficulty we need
                const currentEasyMedium = finalQuestions.filter(q => q.difficulty === 'easy' || q.difficulty === 'medium').length;
                const currentHard = finalQuestions.filter(q => q.difficulty === 'hard').length;

                const neededEasyMedium = EASY_MEDIUM_COUNT - currentEasyMedium;
                const neededHard = HARD_COUNT - currentHard;

                // Fetch potential Easy/Medium questions
                const { data: availableEM } = await ctx.supabase
                    .from('quiz_questions')
                    .select('id, question_type, difficulty')
                    .eq('season_id', input.seasonId)
                    .eq('is_active', true)
                    .in('difficulty', ['easy', 'medium'])
                    .not('id', 'in', `(${answeredQuestionIds.length > 0 ? answeredQuestionIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);

                // Fetch potential Hard questions
                const { data: availableHard } = await ctx.supabase
                    .from('quiz_questions')
                    .select('id, question_type, difficulty')
                    .eq('season_id', input.seasonId)
                    .eq('is_active', true)
                    .eq('difficulty', 'hard')
                    .not('id', 'in', `(${answeredQuestionIds.length > 0 ? answeredQuestionIds.join(',') : '00000000-0000-0000-0000-000000000000'})`);

                let selectedIds: string[] = [];

                // Select Easy/Medium questions with type variety
                if (availableEM && availableEM.length > 0) {
                    const shuffledEM = availableEM.sort(() => Math.random() - 0.5);
                    const selectedEM: string[] = [];
                    const typesPresent = new Set(finalQuestions.map(q => q.question_type));

                    // Try to pick one of each type first
                    for (const q of shuffledEM) {
                        if (selectedEM.length >= neededEasyMedium) break;
                        if (!typesPresent.has(q.question_type)) {
                            selectedEM.push(q.id);
                            typesPresent.add(q.question_type);
                        }
                    }

                    // Fill the rest if needed
                    for (const q of shuffledEM) {
                        if (selectedEM.length >= neededEasyMedium) break;
                        if (!selectedEM.includes(q.id)) {
                            selectedEM.push(q.id);
                        }
                    }
                    selectedIds = [...selectedIds, ...selectedEM];
                }

                // Select Hard questions
                if (availableHard && availableHard.length > 0) {
                    const selectedHard = availableHard
                        .sort(() => Math.random() - 0.5)
                        .slice(0, neededHard)
                        .map(q => q.id);
                    selectedIds = [...selectedIds, ...selectedHard];
                }

                if (selectedIds.length > 0) {
                    const { data: newQs } = await ctx.supabase
                        .from('quiz_questions')
                        .select('id, question_type, question_text, question_text_pt, question_text_es, question_text_ko, question_text_en, image_url, options, options_pt, options_es, options_ko, options_en, time_limit_seconds, difficulty')
                        .in('id', selectedIds);

                    if (newQs) {
                        // We need to carefully order them:
                        // First 3 MUST be Easy/Medium (free questions).
                        // The rest (4-9) is 3 E/M + 3 Hard, shuffled, no 3 Hard consecutive.

                        const allEM = [...finalQuestions.filter(q => q.difficulty !== 'hard'), ...newQs.filter(q => q.difficulty !== 'hard')];
                        const allHard = [...finalQuestions.filter(q => q.difficulty === 'hard'), ...newQs.filter(q => q.difficulty === 'hard')];

                        // Ensure we have exactly EASY_MEDIUM_COUNT E/M and HARD_COUNT Hard (if available)
                        const finalEM = allEM.slice(0, EASY_MEDIUM_COUNT);
                        const finalHard = allHard.slice(0, HARD_COUNT);

                        const freeQs = finalEM.slice(0, FREE_QUESTIONS);
                        const remainingEM = finalEM.slice(FREE_QUESTIONS);

                        // Shuffle the remaining 6 (3 E/M + 3 Hard)
                        let lockedQs = [...remainingEM, ...finalHard];

                        // Shuffle function that avoids 3 consecutive H
                        const shuffleLocked = (arr: any[]) => {
                            for (let i = 0; i < 10; i++) { // Max 10 attempts
                                const shuffled = [...arr].sort(() => Math.random() - 0.5);
                                let consecutiveHard = 0;
                                let valid = true;
                                for (const q of shuffled) {
                                    if (q.difficulty === 'hard') consecutiveHard++;
                                    else consecutiveHard = 0;
                                    if (consecutiveHard >= 3) {
                                        valid = false;
                                        break;
                                    }
                                }
                                if (valid) return shuffled;
                            }
                            return arr; // fallback
                        };

                        lockedQs = shuffleLocked(lockedQs);
                        finalQuestions = [...freeQs, ...lockedQs];
                    }
                }
            }

            // Get user's daily progress
            let dailyProgress = null;
            if (userId) {
                const { data: progress } = await ctx.supabase
                    .from('quiz_daily_progress')
                    .select('*')
                    .eq('season_id', input.seasonId)
                    .eq('user_id', userId)
                    .eq('progress_date', todayStr)
                    .single();
                dailyProgress = progress;
            } else if (deviceId) {
                const { data: progress } = await ctx.supabase
                    .from('quiz_daily_progress')
                    .select('*')
                    .eq('season_id', input.seasonId)
                    .eq('device_id', deviceId)
                    .eq('progress_date', todayStr)
                    .single();
                dailyProgress = progress;
            }

            // Mark status and localize
            const questionsWithStatus = finalQuestions.map((q: any) => {
                const locale = input.locale || 'pt';
                return {
                    ...q,
                    question_text: q[`question_text_${locale}`] || q.question_text,
                    options: q[`options_${locale}`] || q.options,
                    is_answered: answeredQuestionIds.includes(q.id)
                };
            });

            // Season is completed if we are past the duration 
            // OR if it's the last day and all questions for today are answered
            const allTodayAnswered = questionsWithStatus.length > 0 && questionsWithStatus.every((q: any) => q.is_answered);
            const finalIsCompleted = isSeasonCompleted || (currentDay === seasonDuration && allTodayAnswered);

            return {
                questions: questionsWithStatus,
                current_day: currentDay,
                daily_progress: dailyProgress,
                next_questions_at: nextQuestionsAt,
                is_season_completed: finalIsCompleted
            };
        } catch (error) {
            console.error('Error fetching today questions:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch questions' });
        }
    });

// Submit answer to a question
export const submitAnswerProcedure = publicProcedure
    .input(z.object({
        seasonId: z.string().uuid(),
        questionId: z.string().uuid(),
        selectedOption: z.number().min(-1).max(3),
        timeTakenSeconds: z.number().min(0).max(60),
        deviceId: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            const userId = ctx.user?.id;
            const deviceId = input.deviceId;

            if (!userId && !deviceId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'User ID or Device ID required' });
            }

            // Check if already answered
            let existingAnswer = null;
            if (userId) {
                const { data } = await ctx.supabase
                    .from('quiz_answers')
                    .select('id')
                    .eq('question_id', input.questionId)
                    .eq('user_id', userId)
                    .single();
                existingAnswer = data;
            } else if (deviceId) {
                const { data } = await ctx.supabase
                    .from('quiz_answers')
                    .select('id')
                    .eq('question_id', input.questionId)
                    .eq('device_id', deviceId)
                    .single();
                existingAnswer = data;
            }

            if (existingAnswer) {
                throw new TRPCError({ code: 'CONFLICT', message: 'Question already answered' });
            }

            // Get correct answer
            const { data: question, error: questionError } = await ctx.supabase
                .from('quiz_questions')
                .select('correct_index')
                .eq('id', input.questionId)
                .single();

            if (questionError || !question) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Question not found' });
            }

            const isCorrect = input.selectedOption === question.correct_index;
            const pointsEarned = isCorrect ? 10 : 0;

            // Insert answer
            const answerData: any = {
                season_id: input.seasonId,
                question_id: input.questionId,
                selected_option: input.selectedOption,
                is_correct: isCorrect,
                points_earned: pointsEarned,
                time_taken_seconds: input.timeTakenSeconds
            };

            if (userId) {
                answerData.user_id = userId;
            } else {
                answerData.device_id = deviceId;
            }

            const { error: answerError } = await ctx.supabase
                .from('quiz_answers')
                .insert(answerData);

            if (answerError) throw answerError;

            // Update daily progress
            const today = new Date().toISOString().split('T')[0];
            const progressData: any = {
                season_id: input.seasonId,
                progress_date: today,
                questions_answered: 1,
                points_today: pointsEarned
            };

            if (userId) {
                progressData.user_id = userId;

                // Upsert daily progress
                const { data: existingProgress } = await ctx.supabase
                    .from('quiz_daily_progress')
                    .select('*')
                    .eq('season_id', input.seasonId)
                    .eq('user_id', userId)
                    .eq('progress_date', today)
                    .single();

                if (existingProgress) {
                    await ctx.supabase
                        .from('quiz_daily_progress')
                        .update({
                            questions_answered: existingProgress.questions_answered + 1,
                            points_today: existingProgress.points_today + pointsEarned,
                            free_question_answered: (existingProgress.questions_answered + 1) >= 3 ? true : existingProgress.free_question_answered
                        })
                        .eq('id', existingProgress.id);
                } else {
                    progressData.free_question_answered = false; // Need 3 to be true
                    await ctx.supabase
                        .from('quiz_daily_progress')
                        .insert(progressData);
                }
            } else if (deviceId) {
                progressData.device_id = deviceId;

                const { data: existingProgress } = await ctx.supabase
                    .from('quiz_daily_progress')
                    .select('*')
                    .eq('season_id', input.seasonId)
                    .eq('device_id', deviceId)
                    .eq('progress_date', today)
                    .single();

                if (existingProgress) {
                    await ctx.supabase
                        .from('quiz_daily_progress')
                        .update({
                            questions_answered: existingProgress.questions_answered + 1,
                            points_today: existingProgress.points_today + pointsEarned,
                            free_question_answered: (existingProgress.questions_answered + 1) >= 3 ? true : existingProgress.free_question_answered
                        })
                        .eq('id', existingProgress.id);
                } else {
                    progressData.free_question_answered = false; // Need 3 to be true
                    await ctx.supabase
                        .from('quiz_daily_progress')
                        .insert(progressData);
                }
            }

            return {
                is_correct: isCorrect,
                correct_index: question.correct_index,
                points_earned: pointsEarned
            };
        } catch (error) {
            console.error('Error submitting answer:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to submit answer' });
        }
    });

// Unlock extra questions after watching rewarded ad
export const unlockExtraQuestionsProcedure = publicProcedure
    .input(z.object({
        seasonId: z.string().uuid(),
        deviceId: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            const userId = ctx.user?.id;
            const deviceId = input.deviceId;
            const today = new Date().toISOString().split('T')[0];

            if (!userId && !deviceId) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'User ID or Device ID required' });
            }

            const progressFilter: any = {
                season_id: input.seasonId,
                progress_date: today
            };

            if (userId) {
                progressFilter.user_id = userId;
            } else {
                progressFilter.device_id = deviceId;
            }

            // Check if progress exists
            const { data: existingProgress } = await ctx.supabase
                .from('quiz_daily_progress')
                .select('*')
                .match(progressFilter)
                .single();

            if (existingProgress) {
                // Update to unlock extra questions
                const { error } = await ctx.supabase
                    .from('quiz_daily_progress')
                    .update({ extra_questions_unlocked: true })
                    .eq('id', existingProgress.id);

                if (error) throw error;
            } else {
                // Create new progress with extra questions unlocked
                const { error } = await ctx.supabase
                    .from('quiz_daily_progress')
                    .insert({
                        ...progressFilter,
                        extra_questions_unlocked: true
                    });

                if (error) throw error;
            }

            return { success: true };
        } catch (error) {
            console.error('Error unlocking extra questions:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to unlock extra questions' });
        }
    });

// Get season ranking
export const getSeasonRankingProcedure = publicProcedure
    .input(z.object({
        seasonId: z.string().uuid(),
        limit: z.number().min(10).max(100).default(50)
    }))
    .query(async ({ input, ctx }) => {
        try {
            const { data, error } = await ctx.supabase
                .from('quiz_scores')
                .select(`
          *,
          users!inner (
            username,
            display_name,
            profile_image
          )
        `)
                .eq('season_id', input.seasonId)
                .order('total_points', { ascending: false })
                .order('correct_answers', { ascending: false })
                .limit(input.limit);

            if (error) throw error;

            // Add rank position
            const rankedData = (data || []).map((item: any, index: number) => ({
                ...item,
                rank_position: index + 1
            }));

            return rankedData;
        } catch (error) {
            console.error('Error fetching season ranking:', error);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch ranking' });
        }
    });

// Get global ranking (sum of all seasons)
export const getGlobalRankingProcedure = publicProcedure
    .input(z.object({
        limit: z.number().min(3).max(100).default(50)
    }))
    .query(async ({ input, ctx }) => {
        try {
            // Get all scores grouped by user, summing points across seasons
            const { data, error } = await ctx.supabase
                .from('quiz_scores')
                .select(`
                    user_id,
                    users!inner (
                        username,
                        display_name,
                        profile_image
                    )
                `);

            if (error) throw error;

            // Aggregate points by user
            const userPoints: Record<string, {
                user_id: string;
                total_points: number;
                total_correct: number;
                seasons_count: number;
                users: any;
            }> = {};

            // Get full scores with points
            const { data: scores, error: scoresError } = await ctx.supabase
                .from('quiz_scores')
                .select('user_id, total_points, correct_answers');

            if (scoresError) throw scoresError;

            for (const score of scores || []) {
                if (!score.user_id) continue;

                if (!userPoints[score.user_id]) {
                    const userData = data?.find(d => d.user_id === score.user_id);
                    userPoints[score.user_id] = {
                        user_id: score.user_id,
                        total_points: 0,
                        total_correct: 0,
                        seasons_count: 0,
                        users: userData?.users || null
                    };
                }

                userPoints[score.user_id].total_points += score.total_points || 0;
                userPoints[score.user_id].total_correct += score.correct_answers || 0;
                userPoints[score.user_id].seasons_count += 1;
            }

            // Convert to array, sort, and add rank
            const ranking = Object.values(userPoints)
                .filter(u => u.users && u.total_points > 0)
                .sort((a, b) => b.total_points - a.total_points || b.total_correct - a.total_correct)
                .slice(0, input.limit)
                .map((item, index) => ({
                    ...item,
                    rank_position: index + 1
                }));

            return ranking;
        } catch (error) {
            console.error('Error fetching global ranking:', error);
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch global ranking' });
        }
    });

// Get user's stats for a season
export const getUserSeasonStatsProcedure = publicProcedure
    .input(z.object({
        seasonId: z.string().uuid(),
        userId: z.string().uuid().optional(),
        deviceId: z.string().optional()
    }))
    .query(async ({ input, ctx }) => {
        try {
            const userId = input.userId || ctx.user?.id;
            const deviceId = input.deviceId;

            if (!userId && !deviceId) {
                return null;
            }

            let query = ctx.supabase
                .from('quiz_scores')
                .select('*')
                .eq('season_id', input.seasonId);

            if (userId) {
                query = query.eq('user_id', userId);
            } else {
                query = query.eq('device_id', deviceId);
            }

            const { data: score, error } = await query.single();

            if (error && error.code !== 'PGRST116') throw error;

            if (!score) {
                return null;
            }

            // Get user's rank position
            const { count: betterScoresCount } = await ctx.supabase
                .from('quiz_scores')
                .select('id', { count: 'exact', head: true })
                .eq('season_id', input.seasonId)
                .gt('total_points', score.total_points);

            return {
                ...score,
                rank_position: (betterScoresCount || 0) + 1
            };
        } catch (error) {
            console.error('Error fetching user season stats:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch stats' });
        }
    });

// =====================================================
// ADMIN QUIZ PROCEDURES
// =====================================================

// Check if user is official (admin)
const isOfficialUser = async (supabase: any, userId: string): Promise<boolean> => {
    const { data } = await supabase
        .from('users')
        .select('user_type')
        .eq('id', userId)
        .single();

    return data?.user_type === 'official';
};

// Create new season (admin only)
export const createSeasonProcedure = protectedProcedure
    .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        coverImage: z.string().url().optional(),
        startDate: z.string(), // ISO date string
        endDate: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            // Check if user is official
            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can create seasons' });
            }

            const { data, error } = await ctx.supabase
                .from('quiz_seasons')
                .insert({
                    name: input.name,
                    description: input.description,
                    cover_image: input.coverImage,
                    start_date: input.startDate,
                    end_date: input.endDate,
                    created_by: ctx.user.id
                })
                .select()
                .single();

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('Error creating season:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create season' });
        }
    });

// Update season (admin only)
export const updateSeasonProcedure = protectedProcedure
    .input(z.object({
        seasonId: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        coverImage: z.string().url().optional(),
        isActive: z.boolean().optional()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can update seasons' });
            }

            const updateData: any = {};
            if (input.name !== undefined) updateData.name = input.name;
            if (input.description !== undefined) updateData.description = input.description;
            if (input.coverImage !== undefined) updateData.cover_image = input.coverImage;
            if (input.isActive !== undefined) updateData.is_active = input.isActive;

            const { data, error } = await ctx.supabase
                .from('quiz_seasons')
                .update(updateData)
                .eq('id', input.seasonId)
                .select()
                .single();

            if (error) throw error;

            return data;
        } catch (error) {
            console.error('Error updating season:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update season' });
        }
    });

// Create question (admin only)
export const createQuestionProcedure = protectedProcedure
    .input(z.object({
        seasonId: z.string().uuid(),
        questionType: z.enum(['actor_to_drama', 'drama_to_actor', 'scene_to_drama', 'true_false', 'release_year', 'character_actor', 'episode_count']),
        questionText: z.string().min(1), // Legacy field (PT)
        questionTextPt: z.string().optional(),
        questionTextEs: z.string().optional(),
        questionTextKo: z.string().optional(),
        questionTextEn: z.string().optional(),
        imageUrl: z.string().url().optional(),
        options: z.array(z.object({
            text: z.string(),
            image_url: z.string().optional()
        })).length(4),
        optionsPt: z.array(z.object({ text: z.string(), image_url: z.string().optional() })).optional(),
        optionsEs: z.array(z.object({ text: z.string(), image_url: z.string().optional() })).optional(),
        optionsKo: z.array(z.object({ text: z.string(), image_url: z.string().optional() })).optional(),
        optionsEn: z.array(z.object({ text: z.string(), image_url: z.string().optional() })).optional(),
        correctIndex: z.number().min(0).max(3),
        dayNumber: z.number().min(1).max(15).optional(),
        questionOrder: z.number().min(1).max(3).optional(),
        tmdbDramaId: z.number().optional(),
        tmdbActorId: z.number().optional(),
        difficulty: z.enum(['easy', 'medium', 'hard']).default('medium')
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can create questions' });
            }

            const { data, error } = await ctx.supabase
                .from('quiz_questions')
                .insert({
                    season_id: input.seasonId,
                    question_type: input.questionType,
                    question_text: input.questionText,
                    question_text_pt: input.questionTextPt || input.questionText,
                    question_text_es: input.questionTextEs,
                    question_text_ko: input.questionTextKo,
                    question_text_en: input.questionTextEn,
                    image_url: input.imageUrl,
                    options: input.options,
                    options_pt: input.optionsPt || input.options,
                    options_es: input.optionsEs,
                    options_ko: input.optionsKo,
                    options_en: input.optionsEn,
                    correct_index: input.correctIndex,
                    day_number: input.dayNumber,
                    question_order: input.questionOrder,
                    tmdb_drama_id: input.tmdbDramaId,
                    tmdb_actor_id: input.tmdbActorId,
                    difficulty: input.difficulty,
                    time_limit_seconds: 30
                })
                .select()
                .single();

            if (error) throw error;

            // Update season total questions count
            await ctx.supabase.rpc('increment_season_questions', { season_uuid: input.seasonId });

            return data;
        } catch (error) {
            console.error('Error creating question:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create question' });
        }
    });


// Get season questions (admin only)
export const getSeasonQuestionsProcedure = protectedProcedure
    .input(z.object({
        seasonId: z.string().uuid()
    }))
    .query(async ({ input, ctx }) => {
        try {
            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can view all questions' });
            }

            const { data, error } = await ctx.supabase
                .from('quiz_questions')
                .select('*')
                .eq('season_id', input.seasonId)
                .order('day_number', { ascending: true })
                .order('question_order', { ascending: true });

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Error fetching season questions:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch questions' });
        }
    });

// Get pending questions (admin only)
export const getPendingQuestionsProcedure = protectedProcedure
    .query(async ({ ctx }) => {
        try {
            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can view pending questions' });
            }

            const { data, error } = await ctx.supabase
                .from('quiz_pending_questions')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: true });

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('Error fetching pending questions:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch pending questions' });
        }
    });

// Approve pending question (admin only)
export const approveQuestionProcedure = protectedProcedure
    .input(z.object({
        pendingQuestionIds: z.array(z.string().uuid()),
        seasonId: z.string().uuid(),
        dayNumber: z.number().min(1).max(15).optional(),
        questionOrder: z.number().min(1).max(3).optional()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            console.log('APPROVE_QUESTIONS_START:', { count: input.pendingQuestionIds.length, seasonId: input.seasonId });
            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can approve questions' });
            }

            // Get all pending questions
            const { data: pendingList, error: pendingError } = await ctx.supabase
                .from('quiz_pending_questions')
                .select('*')
                .in('id', input.pendingQuestionIds);

            if (pendingError || !pendingList || pendingList.length === 0) {
                console.error('APPROVE_QUESTIONS_NOT_FOUND:', pendingError);
                throw new TRPCError({ code: 'NOT_FOUND', message: 'No pending questions found' });
            }

            const results = [];
            for (const pending of pendingList) {
                // Create approved question
                const { error: insertError } = await ctx.supabase
                    .from('quiz_questions')
                    .insert({
                        season_id: input.seasonId,
                        question_type: pending.question_type,
                        question_text: pending.question_text,
                        question_text_pt: pending.question_text_pt,
                        question_text_es: pending.question_text_es,
                        question_text_ko: pending.question_text_ko,
                        question_text_en: pending.question_text_en,
                        image_url: pending.image_url,
                        options: pending.options,
                        options_pt: pending.options_pt,
                        options_es: pending.options_es,
                        options_ko: pending.options_ko,
                        options_en: pending.options_en,
                        correct_index: pending.correct_index,
                        tmdb_drama_id: pending.tmdb_drama_id,
                        tmdb_actor_id: pending.tmdb_actor_id,
                        difficulty: pending.difficulty,
                        day_number: input.dayNumber,
                        question_order: input.questionOrder,
                        time_limit_seconds: 30,
                        is_auto_generated: true
                    });

                if (insertError) {
                    console.error('INSERT_QUESTION_ERROR:', insertError);
                    results.push({ id: pending.id, success: false, error: insertError.message });
                    continue;
                }

                // Update pending question status
                const { error: updateError } = await ctx.supabase
                    .from('quiz_pending_questions')
                    .update({
                        status: 'approved',
                        season_id: input.seasonId,
                        reviewed_by: ctx.user.id,
                        reviewed_at: new Date().toISOString()
                    })
                    .eq('id', pending.id);

                if (updateError) {
                    console.error('UPDATE_PENDING_STATUS_ERROR:', updateError);
                    results.push({ id: pending.id, success: false, error: updateError.message });
                } else {
                    results.push({ id: pending.id, success: true });
                }
            }

            const successCount = results.filter(r => r.success).length;
            console.log(`APPROVE_QUESTIONS_FINISHED: ${successCount}/${input.pendingQuestionIds.length} succeeded`);

            return {
                success: successCount > 0,
                total: input.pendingQuestionIds.length,
                succeeded: successCount,
                results
            };
        } catch (error) {
            console.error('Error approving questions:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to approve questions' });
        }
    });

// Reject pending question (admin only)
export const rejectQuestionProcedure = protectedProcedure
    .input(z.object({
        pendingQuestionId: z.string().uuid()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can reject questions' });
            }

            const { error } = await ctx.supabase
                .from('quiz_pending_questions')
                .update({
                    status: 'rejected',
                    reviewed_by: ctx.user.id,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', input.pendingQuestionId);

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('Error rejecting question:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to reject question' });
        }
    });

// Delete question (admin only)
export const deleteQuestionProcedure = protectedProcedure
    .input(z.object({
        questionId: z.string().uuid()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can delete questions' });
            }

            const { error } = await ctx.supabase
                .from('quiz_questions')
                .delete()
                .eq('id', input.questionId);

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('Error deleting question:', error);
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete question' });
        }
    });

// Generate automated questions (admin only)
export const generateQuestionsProcedure = protectedProcedure
    .input(z.object({
        count: z.number().min(1).max(20).default(5),
        type: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            console.log(`[QUIZ-ROUTE] Generating questions: count=${input.count}, type=${input.type || 'any'}`);

            // Validate API Key presence
            const apiKey = process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY;
            if (!apiKey) {
                console.error('[QUIZ-ROUTE] TMDB_API_KEY is missing from environment variables');
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Erro de configuração: TMDB_API_KEY não encontrada no servidor.'
                });
            }

            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                console.warn(`[QUIZ-ROUTE] Unauthorized generation attempt by user ${ctx.user.id}`);
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can generate questions' });
            }

            const questions = await generateQuestions(input.count, input.type);

            if (questions.length === 0) {
                console.error('[QUIZ-ROUTE] Generator returned zero questions');
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível gerar perguntas. Verifique os logs do servidor.' });
            }

            console.log(`[QUIZ-ROUTE] Questions generated. Saving ${questions.length} to DB...`);

            // Save to pending questions
            const pendingToInsert = questions.map(q => ({
                question_type: q.question_type,
                question_text: q.question_text,
                question_text_pt: q.question_text_pt,
                question_text_es: q.question_text_es,
                question_text_ko: q.question_text_ko,
                question_text_en: q.question_text_en,
                image_url: q.image_url,
                options: q.options,
                options_pt: q.options_pt,
                options_es: q.options_es,
                options_ko: q.options_ko,
                options_en: q.options_en,
                correct_index: q.correct_index,
                tmdb_drama_id: q.tmdb_drama_id,
                tmdb_actor_id: q.tmdb_actor_id,
                difficulty: q.difficulty,
                status: 'pending'
            }));

            const { data, error } = await ctx.supabase
                .from('quiz_pending_questions')
                .insert(pendingToInsert)
                .select();

            if (error) {
                console.error('[QUIZ-ROUTE] Supabase insert error:', error);
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro ao salvar no banco: ${error.message}` });
            }

            console.log(`[QUIZ-ROUTE] Successfully saved ${data?.length || 0} questions`);

            return {
                success: true,
                count: data?.length || 0
            };
        } catch (error) {
            console.error('[QUIZ-ROUTE] Error in generateQuestionsProcedure:', error);
            if (error instanceof TRPCError) throw error;
            const message = error instanceof Error ? error.message : 'Erro desconhecido na geração de perguntas';
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Falha ao gerar perguntas: ${message}`
            });
        }
    });

// Generate automated questions by type with specific counts (admin only)
export const generateQuestionsByTypeProcedure = protectedProcedure
    .input(z.object({
        config: z.object({
            release_year: z.number().min(0).max(20).optional(),
            drama_to_actor: z.number().min(0).max(20).optional(),
            actor_to_drama: z.number().min(0).max(20).optional(),
            scene_to_drama: z.number().min(0).max(20).optional(),
            character_actor: z.number().min(0).max(20).optional(),
            episode_count: z.number().min(0).max(20).optional(),
            true_false: z.number().min(0).max(20).optional(),
            dramaIds: z.array(z.number()).max(10).optional(),
        })
    }))
    .mutation(async ({ input, ctx }) => {
        try {
            const totalCount = Object.values(input.config)
                .filter((v): v is number => typeof v === 'number')
                .reduce((sum, n) => sum + (n || 0), 0);
            console.log(`[QUIZ-ROUTE] Generating questions by type: total=${totalCount}`, input.config);

            if (totalCount === 0) {
                throw new TRPCError({ code: 'BAD_REQUEST', message: 'Selecione pelo menos um tipo de pergunta' });
            }

            const apiKey = process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY;
            if (!apiKey) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Erro de configuração: TMDB_API_KEY não encontrada.'
                });
            }

            const isOfficial = await isOfficialUser(ctx.supabase, ctx.user.id);
            if (!isOfficial) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Only official users can generate questions' });
            }

            const questions = await generateQuestionsByType(input.config as QuestionTypeConfig);

            if (questions.length === 0) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível gerar perguntas.' });
            }

            // Save to pending questions
            const pendingToInsert = questions.map(q => ({
                question_type: q.question_type,
                question_text: q.question_text,
                question_text_pt: q.question_text_pt,
                question_text_es: q.question_text_es,
                question_text_ko: q.question_text_ko,
                question_text_en: q.question_text_en,
                image_url: q.image_url,
                options: q.options,
                options_pt: q.options_pt,
                options_es: q.options_es,
                options_ko: q.options_ko,
                options_en: q.options_en,
                correct_index: q.correct_index,
                tmdb_drama_id: q.tmdb_drama_id,
                tmdb_actor_id: q.tmdb_actor_id,
                difficulty: q.difficulty,
                status: 'pending'
            }));

            const { data, error } = await ctx.supabase
                .from('quiz_pending_questions')
                .insert(pendingToInsert)
                .select();

            if (error) {
                throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro ao salvar: ${error.message}` });
            }

            console.log(`[QUIZ-ROUTE] Saved ${data?.length || 0} questions by type`);

            return {
                success: true,
                count: data?.length || 0,
                breakdown: {
                    release_year: questions.filter(q => q.question_type === 'release_year').length,
                    drama_to_actor: questions.filter(q => q.question_type === 'drama_to_actor').length,
                    actor_to_drama: questions.filter(q => q.question_type === 'actor_to_drama').length,
                    scene_to_drama: questions.filter(q => q.question_type === 'scene_to_drama').length,
                    character_actor: questions.filter(q => q.question_type === 'character_actor').length,
                    episode_count: questions.filter(q => q.question_type === 'episode_count').length,
                    true_false: questions.filter(q => q.question_type === 'true_false').length,
                }
            };
        } catch (error) {
            console.error('[QUIZ-ROUTE] Error in generateQuestionsByTypeProcedure:', error);
            if (error instanceof TRPCError) throw error;
            const message = error instanceof Error ? error.message : 'Erro desconhecido';
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Falha: ${message}` });
        }
    });
