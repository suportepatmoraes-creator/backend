import { TRPCError } from '@trpc/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.EXPO_PUBLIC_TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Supported languages for questions
type SupportedLocale = 'pt' | 'es' | 'ko' | 'en';
const SUPPORTED_LOCALES: SupportedLocale[] = ['pt', 'es', 'ko', 'en'];

// TMDb language codes mapping
const TMDB_LANGUAGE_CODES: Record<SupportedLocale, string> = {
    pt: 'pt-BR',
    es: 'es-ES',
    ko: 'ko-KR',
    en: 'en-US'
};

// Question templates for each type and language
const QUESTION_TEMPLATES = {
    release_year: {
        pt: 'Em qual ano o drama "${name}" foi lançado oficialmente?',
        es: '¿En qué año se estrenó oficialmente el drama "${name}"?',
        ko: '"${name}" 드라마는 몇 년도에 공식 방영되었나요?',
        en: 'In what year was the drama "${name}" officially released?'
    },
    drama_to_actor: {
        pt: 'Qual destes atores faz parte do elenco principal de "${name}"?',
        es: '¿Cuál de estos actores forma parte del reparto principal de "${name}"?',
        ko: '"${name}"의 주연 배우는 누구인가요?',
        en: 'Which of these actors is part of the main cast of "${name}"?'
    },
    actor_to_drama: {
        pt: 'Em qual destes dramas o(a) ator/atriz "${actor}" participou?',
        es: '¿En cuál de estos dramas participó el/la actor/actriz "${actor}"?',
        ko: '"${actor}" 배우가 출연한 드라마는 어느 것인가요?',
        en: 'In which of these dramas did the actor "${actor}" appear?'
    },
    scene_to_drama: {
        pt: 'De qual drama é esta cena?',
        es: '¿De qué drama es esta escena?',
        ko: '이 장면은 어떤 드라마인가요?',
        en: 'Which drama is this scene from?'
    },
    character_actor: {
        pt: 'Quem interpretou o personagem "${character}" no drama "${name}"?',
        es: '¿Quién interpretó al personaje "${character}" en el drama "${name}"?',
        ko: '"${name}"에서 "${character}" 역할을 연기한 배우는 누구인가요?',
        en: 'Who played the character "${character}" in the drama "${name}"?'
    },
    episode_count: {
        pt: 'Quantos episódios tem o drama "${name}" no total?',
        es: '¿Cuántos episodios tiene el drama "${name}" en total?',
        ko: '"${name}" 드라마의 총 에피소드 수는 몇 개인가요?',
        en: 'How many episodes does the drama "${name}" have in total?'
    },
    true_false_actor: {
        pt: 'O ator/atriz "${actor}" participou do drama "${name}"?',
        es: '¿El/la actor/actriz "${actor}" participó en el drama "${name}"?',
        ko: '"${actor}" 배우가 "${name}" 드라마에 출연했나요?',
        en: 'Did the actor "${actor}" participate in the drama "${name}"?'
    },
    true_false_year: {
        pt: 'O drama "${name}" foi lançado oficialmente em ${year}?',
        es: '¿El drama "${name}" se estrenó oficialmente en ${year}?',
        ko: '"${name}" 드라마는 ${year}년에 공식 방영되었나요?',
        en: 'Was the drama "${name}" officially released in ${year}?'
    },
    true_false_scene: {
        pt: 'Esta cena faz parte do drama "${name}"?',
        es: '¿Esta escena forma parte del drama "${name}"?',
        ko: '이 장면은 "${name}" 드라마의 일부인가요?',
        en: 'Is this scene part of the drama "${name}"?'
    }
};

export type GeneratedQuestion = {
    question_type: 'actor_to_drama' | 'drama_to_actor' | 'release_year' | 'scene_to_drama' | 'character_actor' | 'episode_count' | 'true_false';
    question_text: string; // Legacy field (PT for backward compatibility)
    question_text_pt: string;
    question_text_es: string;
    question_text_ko: string;
    question_text_en: string;
    image_url?: string;
    options: { text: string; image_url?: string }[]; // Legacy (PT)
    options_pt: { text: string; image_url?: string }[];
    options_es: { text: string; image_url?: string }[];
    options_ko: { text: string; image_url?: string }[];
    options_en: { text: string; image_url?: string }[];
    correct_index: number;
    tmdb_drama_id?: number;
    tmdb_actor_id?: number;
    difficulty: 'easy' | 'medium' | 'hard';
};


// Helper to get drama details in all languages
async function getDramaInAllLanguages(dramaId: number): Promise<Record<SupportedLocale, any>> {
    const results: Record<string, any> = {};

    for (const locale of SUPPORTED_LOCALES) {
        try {
            const data = await fetchFromTMDb(`/tv/${dramaId}`, TMDB_LANGUAGE_CODES[locale]);
            results[locale] = data;
        } catch (err) {
            console.warn(`[QUIZ-GEN] Failed to fetch drama ${dramaId} in ${locale}, using EN fallback`);
            if (results['en']) {
                results[locale] = results['en'];
            }
        }
    }

    // Ensure all locales have data (use EN as fallback)
    for (const locale of SUPPORTED_LOCALES) {
        if (!results[locale] && results['en']) {
            results[locale] = results['en'];
        }
    }

    return results as Record<SupportedLocale, any>;
}

// Generate question text for all languages
function generateQuestionTexts(
    templateKey: keyof typeof QUESTION_TEMPLATES,
    variables: Record<SupportedLocale, Record<string, string>>
): Record<SupportedLocale, string> {
    const result: Record<string, string> = {};

    for (const locale of SUPPORTED_LOCALES) {
        let template = QUESTION_TEMPLATES[templateKey][locale];
        const vars = variables[locale] || variables['en'];

        // Replace all ${varName} with actual values
        for (const [key, value] of Object.entries(vars)) {
            template = template.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
        }

        result[locale] = template;
    }

    return result as Record<SupportedLocale, string>;
}

async function fetchFromTMDb(endpoint: string, language?: string) {
    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);

    let headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (TMDB_API_KEY && TMDB_API_KEY.startsWith('eyJ')) {
        headers['Authorization'] = `Bearer ${TMDB_API_KEY}`;
    } else if (TMDB_API_KEY) {
        url.searchParams.set('api_key', TMDB_API_KEY);
    } else {
        throw new Error('TMDB_API_KEY not configured');
    }

    // Set language (default to pt-BR for backward compatibility)
    url.searchParams.set('language', language || 'pt-BR');

    console.log(`[QUIZ-GEN] Fetching: ${url.pathname}${url.search}`);
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error body');
        console.error(`[QUIZ-GEN] TMDb API error ${response.status}: ${errorText}`);
        throw new Error(`TMDb API error: ${response.status}`);
    }
    return response.json();
}

/**
 * Configuration for generating questions by type
 */
export type QuestionTypeConfig = {
    release_year?: number;
    drama_to_actor?: number;
    actor_to_drama?: number;
    scene_to_drama?: number;
    character_actor?: number;
    episode_count?: number;
    true_false?: number;
    dramaIds?: number[]; // Optional: specific TMDb drama IDs to use
};

// Helper to fetch dramas pool
async function fetchDramasPool() {
    const randomPage1 = Math.floor(Math.random() * 10) + 1;
    const randomPage2 = Math.floor(Math.random() * 10) + 1;

    const [popularData, topRatedData, trendingData] = await Promise.all([
        fetchFromTMDb(`/discover/tv?with_origin_country=KR&sort_by=popularity.desc&page=${randomPage1}`),
        fetchFromTMDb(`/discover/tv?with_origin_country=KR&sort_by=vote_average.desc&vote_count.gte=100&page=${randomPage2}`),
        fetchFromTMDb(`/trending/tv/week?language=ko-KR`)
    ]);

    const allDramas = [
        ...(popularData.results || []),
        ...(topRatedData.results || []),
        ...((trendingData.results || []).filter((d: any) => d.origin_country?.includes('KR')))
    ];

    const seenIds = new Set<number>();
    return allDramas.filter((d: any) => {
        if (seenIds.has(d.id)) return false;
        seenIds.add(d.id);
        return true;
    }).sort(() => Math.random() - 0.5);
}

/**
 * Generates automated quiz questions by type with specific counts
 */
export const generateQuestionsByType = async (config: QuestionTypeConfig): Promise<GeneratedQuestion[]> => {
    console.log(`[QUIZ-GEN] Starting generation by type:`, config);
    const questions: GeneratedQuestion[] = [];

    let dramas: any[];

    // If specific drama IDs are provided, fetch those dramas
    if (config.dramaIds && config.dramaIds.length > 0) {
        console.log(`[QUIZ-GEN] Using ${config.dramaIds.length} specific dramas`);
        const dramaDetails = await Promise.all(
            config.dramaIds.map(async (id) => {
                try {
                    return await fetchFromTMDb(`/tv/${id}`);
                } catch (err) {
                    console.warn(`[QUIZ-GEN] Failed to fetch drama ${id}:`, err);
                    return null;
                }
            })
        );
        dramas = dramaDetails.filter(Boolean);
        console.log(`[QUIZ-GEN] Successfully fetched ${dramas.length} specific dramas`);
    } else {
        // Fallback to random pool
        dramas = await fetchDramasPool();
        console.log(`[QUIZ-GEN] Found ${dramas.length} unique dramas from pool`);
    }

    // Always fetch a broad distractor pool for better variety in False cases
    const distractorPool = await fetchDramasPool();


    if (dramas.length === 0) {
        throw new Error('No dramas found to generate questions');
    }

    // Helper to generate N questions of a type
    const generateN = async (
        type: string,
        count: number,
        generator: (drama: any) => Promise<GeneratedQuestion | null>
    ) => {
        let generated = 0;
        let attempts = 0;
        const maxAttempts = count * 3;

        // Shuffle dramas once per type generation to avoid same order every time
        const shuffledPool = [...dramas].sort(() => Math.random() - 0.5);

        while (generated < count && attempts < maxAttempts) {
            const drama = shuffledPool[attempts % shuffledPool.length];
            attempts++;

            try {
                const q = await generator(drama);
                if (q) {
                    console.log(`[QUIZ-GEN] [${type}] Generated ${generated + 1}/${count}`);
                    questions.push(q);
                    generated++;
                }
            } catch (err) {
                console.error(`[QUIZ-GEN] Error generating ${type}:`, err);
            }
        }
        console.log(`[QUIZ-GEN] [${type}] Finished: ${generated}/${count}`);
    };

    // Generate each type
    if (config.release_year && config.release_year > 0) {
        await generateN('release_year', config.release_year, generateReleaseYearQuestion);
    }
    if (config.drama_to_actor && config.drama_to_actor > 0) {
        await generateN('drama_to_actor', config.drama_to_actor, generateDramaToActorQuestion);
    }
    if (config.actor_to_drama && config.actor_to_drama > 0) {
        await generateN('actor_to_drama', config.actor_to_drama, () => generateActorToDramaQuestion(distractorPool));
    }
    if (config.scene_to_drama && config.scene_to_drama > 0) {
        await generateN('scene_to_drama', config.scene_to_drama, (d) => generateSceneToDramaQuestion(d, distractorPool));
    }
    if (config.character_actor && config.character_actor > 0) {
        await generateN('character_actor', config.character_actor, (d) => generateCharacterToActorQuestion(d, distractorPool));
    }
    if (config.episode_count && config.episode_count > 0) {
        await generateN('episode_count', config.episode_count, generateEpisodeCountQuestion);
    }
    if (config.true_false && config.true_false > 0) {
        await generateN('true_false', config.true_false, (d) => generateTrueFalseQuestion(d, distractorPool));
    }

    console.log(`[QUIZ-GEN] Total generated: ${questions.length}`);
    return questions;
};

/**
 * Generates automated quiz questions using TMDb data in all supported languages
 */
export const generateQuestions = async (count: number = 5, type?: string): Promise<GeneratedQuestion[]> => {
    console.log(`[QUIZ-GEN] Starting multilingual generation: count=${count}, type=${type || 'all'}`);
    const questions: GeneratedQuestion[] = [];

    // Get Korean dramas from multiple random pages for variety
    console.log('[QUIZ-GEN] Fetching dramas from multiple sources...');

    // Random page between 1 and 10 for popular dramas
    const randomPage1 = Math.floor(Math.random() * 10) + 1;
    const randomPage2 = Math.floor(Math.random() * 10) + 1;

    // Fetch from different sources for variety
    const [popularData, topRatedData, trendingData] = await Promise.all([
        fetchFromTMDb(`/discover/tv?with_origin_country=KR&sort_by=popularity.desc&page=${randomPage1}`),
        fetchFromTMDb(`/discover/tv?with_origin_country=KR&sort_by=vote_average.desc&vote_count.gte=100&page=${randomPage2}`),
        fetchFromTMDb(`/trending/tv/week?language=ko-KR`)
    ]);

    // Combine and deduplicate dramas
    const allDramas = [
        ...(popularData.results || []),
        ...(topRatedData.results || []),
        ...((trendingData.results || []).filter((d: any) => d.origin_country?.includes('KR')))
    ];

    // Remove duplicates by ID
    const seenIds = new Set<number>();
    const popularDramas = allDramas.filter((d: any) => {
        if (seenIds.has(d.id)) return false;
        seenIds.add(d.id);
        return true;
    });

    // Shuffle the array for more randomness
    const shuffledDramas = popularDramas.sort(() => Math.random() - 0.5);

    console.log(`[QUIZ-GEN] Found ${shuffledDramas.length} unique dramas from pages ${randomPage1}, ${randomPage2}`);

    if (shuffledDramas.length === 0) {
        throw new Error('No popular dramas found to generate questions');
    }


    const types = type ? [type] : ['actor_to_drama', 'drama_to_actor', 'release_year', 'scene_to_drama', 'character_actor', 'episode_count', 'true_false'];

    for (let i = 0; i < count * 2 && questions.length < count; i++) {
        const randomType = types[Math.floor(Math.random() * types.length)];
        const drama = shuffledDramas[Math.floor(Math.random() * shuffledDramas.length)];

        console.log(`[QUIZ-GEN] [Attempt ${i + 1}] Generating ${randomType} for "${drama.name}" (${drama.id})`);

        try {
            let q: GeneratedQuestion | null = null;
            if (randomType === 'release_year') {
                q = await generateReleaseYearQuestion(drama);
            } else if (randomType === 'drama_to_actor') {
                q = await generateDramaToActorQuestion(drama);
            } else if (randomType === 'actor_to_drama') {
                q = await generateActorToDramaQuestion(shuffledDramas);
            } else if (randomType === 'scene_to_drama') {
                q = await generateSceneToDramaQuestion(drama, shuffledDramas);
            } else if (randomType === 'character_actor') {
                q = await generateCharacterToActorQuestion(drama);
            } else if (randomType === 'episode_count') {
                q = await generateEpisodeCountQuestion(drama);
            } else if (randomType === 'true_false') {
                q = await generateTrueFalseQuestion(drama, shuffledDramas);
            }

            if (q) {
                console.log(`[QUIZ-GEN] [Success] Generated: ${q.question_text_en.substring(0, 30)}...`);
                questions.push(q);
            } else {
                console.warn(`[QUIZ-GEN] [Failure] Question generator returned null for ${randomType}`);
            }
        } catch (err) {
            console.error(`[QUIZ-GEN] Error generating question bit:`, err);
        }
    }

    console.log(`[QUIZ-GEN] Finished. Generated ${questions.length}/${count} questions`);
    return questions;
};

const generateReleaseYearQuestion = async (drama: any): Promise<GeneratedQuestion | null> => {
    if (!drama.first_air_date) return null;

    // Get drama names in all languages
    const dramaLocalized = await getDramaInAllLanguages(drama.id);

    const year = new Date(drama.first_air_date).getFullYear();
    const options = [
        { text: year.toString() },
        { text: (year - 1).toString() },
        { text: (year + 1).toString() },
        { text: (year - 2).toString() }
    ].sort(() => Math.random() - 0.5);

    const correctIndex = options.findIndex(o => o.text === year.toString());

    // Generate localized question texts
    const variables: Record<SupportedLocale, Record<string, string>> = {
        pt: { name: dramaLocalized.pt?.name || drama.name },
        es: { name: dramaLocalized.es?.name || drama.name },
        ko: { name: dramaLocalized.ko?.name || drama.name },
        en: { name: dramaLocalized.en?.name || drama.name }
    };

    const texts = generateQuestionTexts('release_year', variables);

    return {
        question_type: 'release_year',
        question_text: texts.pt, // Legacy field
        question_text_pt: texts.pt,
        question_text_es: texts.es,
        question_text_ko: texts.ko,
        question_text_en: texts.en,
        image_url: drama.backdrop_path ? `https://image.tmdb.org/t/p/w300${drama.backdrop_path}` : undefined,
        options, // Legacy (PT)
        options_pt: options,
        options_es: options,
        options_ko: options,
        options_en: options,
        correct_index: correctIndex,
        tmdb_drama_id: drama.id,
        difficulty: 'easy'
    };
};

const generateDramaToActorQuestion = async (drama: any): Promise<GeneratedQuestion | null> => {
    const credits = await fetchFromTMDb(`/tv/${drama.id}/credits`);
    const mainCast = (credits.cast || []).filter((c: any) => c.profile_path).slice(0, 10);
    if (mainCast.length === 0) return null;

    const correctActor = mainCast[Math.floor(Math.random() * mainCast.length)];

    // Fetch actors from OTHER K-dramas (not Hollywood popular actors)
    const randomPage = Math.floor(Math.random() * 20) + 1;
    const otherKDramasData = await fetchFromTMDb('/discover/tv?with_origin_country=KR&sort_by=popularity.desc&page=' + randomPage);
    const otherKDramas = (otherKDramasData.results || []).filter((d: any) => d.id !== drama.id).sort(() => Math.random() - 0.5).slice(0, 15);

    // Get cast from other K-dramas
    const otherActors: any[] = [];
    for (const otherDrama of otherKDramas) {
        if (otherActors.length >= 3) break;
        try {
            const otherCredits = await fetchFromTMDb(`/tv/${otherDrama.id}/credits`);
            const otherCast = (otherCredits.cast || [])
                .filter((c: any) => c.profile_path && c.id !== correctActor.id && !otherActors.some(a => a.id === c.id))
                .slice(0, 2);
            otherActors.push(...otherCast);
        } catch (err) {
            console.warn(`[QUIZ-GEN] Failed to get cast for drama ${otherDrama.id}`);
        }
    }

    if (otherActors.length < 3) return null;

    const distractorActors = otherActors.sort(() => Math.random() - 0.5).slice(0, 3);

    const options = [
        { text: correctActor.name, image_url: correctActor.profile_path ? `https://image.tmdb.org/t/p/w185${correctActor.profile_path}` : undefined },
        ...distractorActors.map((actor: any) => ({
            text: actor.name,
            image_url: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : undefined
        }))
    ].sort(() => Math.random() - 0.5);

    const correctIndex = options.findIndex(o => o.text === correctActor.name);

    // Get drama names in all languages
    const dramaLocalized = await getDramaInAllLanguages(drama.id);

    const variables: Record<SupportedLocale, Record<string, string>> = {
        pt: { name: dramaLocalized.pt?.name || drama.name },
        es: { name: dramaLocalized.es?.name || drama.name },
        ko: { name: dramaLocalized.ko?.name || drama.name },
        en: { name: dramaLocalized.en?.name || drama.name }
    };

    const texts = generateQuestionTexts('drama_to_actor', variables);

    return {
        question_type: 'drama_to_actor',
        question_text: texts.pt,
        question_text_pt: texts.pt,
        question_text_es: texts.es,
        question_text_ko: texts.ko,
        question_text_en: texts.en,
        image_url: drama.backdrop_path ? `https://image.tmdb.org/t/p/w300${drama.backdrop_path}` : undefined,
        options, // Legacy
        options_pt: options, // Actor names don't translate
        options_es: options,
        options_ko: options,
        options_en: options,
        correct_index: correctIndex,
        tmdb_drama_id: drama.id,
        difficulty: 'medium'
    };
};

const generateActorToDramaQuestion = async (popularDramas: any[]): Promise<GeneratedQuestion | null> => {
    const randomDrama = popularDramas[Math.floor(Math.random() * popularDramas.length)];
    const credits = await fetchFromTMDb(`/tv/${randomDrama.id}/credits`);
    const cast = (credits.cast || []).filter((c: any) => c.profile_path);
    if (cast.length === 0) return null;
    const actor = cast[Math.floor(Math.random() * Math.min(cast.length, 5))];

    const actorCredits = await fetchFromTMDb(`/person/${actor.id}/tv_credits`);
    const actorDramaIds = new Set((actorCredits.cast || []).map((c: any) => c.id));

    const distractors = popularDramas
        .filter(d => !actorDramaIds.has(d.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

    if (distractors.length < 3) return null;

    // Get localized drama names for ALL options (correct + distractors)
    const allDramas = [randomDrama, ...distractors];
    const localizedDramas = await Promise.all(
        allDramas.map(d => getDramaInAllLanguages(d.id))
    );

    // Create localized options for each language
    const createOptionsForLocale = (locale: SupportedLocale) => {
        return allDramas.map((d, idx) => ({
            text: localizedDramas[idx][locale]?.name || d.name,
            image_url: d.poster_path ? `https://image.tmdb.org/t/p/w154${d.poster_path}` : undefined
        })).sort(() => Math.random() - 0.5);
    };

    const options_pt = createOptionsForLocale('pt');
    const options_es = createOptionsForLocale('es');
    const options_ko = createOptionsForLocale('ko');
    const options_en = createOptionsForLocale('en');

    // Use PT for legacy and correct index calculation
    const ptCorrectName = localizedDramas[0].pt?.name || randomDrama.name;
    const correctIndex = options_pt.findIndex(o => o.text === ptCorrectName);

    const variables: Record<SupportedLocale, Record<string, string>> = {
        pt: { actor: actor.name },
        es: { actor: actor.name },
        ko: { actor: actor.name },
        en: { actor: actor.name }
    };

    const texts = generateQuestionTexts('actor_to_drama', variables);

    return {
        question_type: 'actor_to_drama',
        question_text: texts.pt,
        question_text_pt: texts.pt,
        question_text_es: texts.es,
        question_text_ko: texts.ko,
        question_text_en: texts.en,
        image_url: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : undefined,
        options: options_pt, // Legacy
        options_pt,
        options_es,
        options_ko,
        options_en,
        correct_index: correctIndex,
        tmdb_actor_id: actor.id,
        difficulty: 'medium'
    };
};

const generateSceneToDramaQuestion = async (drama: any, popularDramas: any[]): Promise<GeneratedQuestion | null> => {
    try {
        // 1. Get drama details to find seasons
        const details = await fetchFromTMDb(`/tv/${drama.id}`);
        const seasons = (details.seasons || []).filter((s: any) => s.season_number > 0 && s.episode_count > 0);
        if (seasons.length === 0) return null;

        // 2. Pick a random season
        const season = seasons[Math.floor(Math.random() * seasons.length)];

        // 3. Get season details to find episodes
        const seasonDetails = await fetchFromTMDb(`/tv/${drama.id}/season/${season.season_number}`);
        const episodes = (seasonDetails.episodes || []).filter((e: any) => e.still_path);
        if (episodes.length === 0) return null;

        // 4. Pick a random episode
        const episode = episodes[Math.floor(Math.random() * episodes.length)];

        // 5. Generate distractors
        const distractors = popularDramas
            .filter(d => d.id !== drama.id)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3);

        if (distractors.length < 3) return null;

        // 6. Get localized drama names for ALL options
        const allDramas = [drama, ...distractors];
        const localizedDramas = await Promise.all(
            allDramas.map(d => getDramaInAllLanguages(d.id))
        );

        // Create localized options for each language
        const createOptionsForLocale = (locale: SupportedLocale) => {
            return allDramas.map((d, idx) => ({
                text: localizedDramas[idx][locale]?.name || d.name,
                image_url: d.poster_path ? `https://image.tmdb.org/t/p/w154${d.poster_path}` : undefined
            })).sort(() => Math.random() - 0.5);
        };

        const options_pt = createOptionsForLocale('pt');
        const options_es = createOptionsForLocale('es');
        const options_ko = createOptionsForLocale('ko');
        const options_en = createOptionsForLocale('en');

        const ptCorrectName = localizedDramas[0].pt?.name || drama.name;
        const correctIndex = options_pt.findIndex(o => o.text === ptCorrectName);

        // Scene question doesn't need drama name in question text
        const texts = generateQuestionTexts('scene_to_drama', {
            pt: {}, es: {}, ko: {}, en: {}
        });

        return {
            question_type: 'scene_to_drama',
            question_text: texts.pt,
            question_text_pt: texts.pt,
            question_text_es: texts.es,
            question_text_ko: texts.ko,
            question_text_en: texts.en,
            image_url: `https://image.tmdb.org/t/p/w300${episode.still_path}`,
            options: options_pt, // Legacy
            options_pt,
            options_es,
            options_ko,
            options_en,
            correct_index: correctIndex,
            tmdb_drama_id: drama.id,
            difficulty: 'hard'
        };
    } catch (err) {
        console.error(`[QUIZ-GEN] Error in generateSceneToDramaQuestion:`, err);
        return null;
    }
};

const generateCharacterToActorQuestion = async (drama: any, popularDramas: any[] = []): Promise<GeneratedQuestion | null> => {
    try {
        const credits = await fetchFromTMDb(`/tv/${drama.id}/credits`);
        const mainCast = (credits.cast || [])
            .filter((c: any) => c.character && c.name && c.profile_path)
            .slice(0, 15);
        if (mainCast.length === 0) return null;

        const correctActor = mainCast[Math.floor(Math.random() * Math.min(mainCast.length, 10))];
        const characterName = correctActor.character;

        // Use popularDramas as pool for distractors if available, else fetch (fallback)
        let otherDramas = popularDramas.filter(d => d.id !== drama.id);

        if (otherDramas.length < 5) {
            const randomPage = Math.floor(Math.random() * 20) + 1;
            const otherKDramasData = await fetchFromTMDb('/discover/tv?with_origin_country=KR&sort_by=popularity.desc&page=' + randomPage);
            otherDramas = (otherKDramasData.results || []).filter((d: any) => d.id !== drama.id);
        }

        const shuffledOtherDramas = otherDramas.sort(() => Math.random() - 0.5).slice(0, 10);

        // Get cast from other K-dramas
        const otherActors: any[] = [];
        for (const otherDrama of shuffledOtherDramas) {
            if (otherActors.length >= 3) break;
            try {
                const otherCredits = await fetchFromTMDb(`/tv/${otherDrama.id}/credits`);
                const otherCast = (otherCredits.cast || [])
                    .filter((c: any) => c.profile_path && c.id !== correctActor.id && !otherActors.some(a => a.id === c.id))
                    .slice(0, 2);
                otherActors.push(...otherCast);
            } catch (err) {
                // Silent fail for individual drama credits
            }
        }

        if (otherActors.length < 3) return null;

        const distractorActors = otherActors.sort(() => Math.random() - 0.5).slice(0, 3);

        const options = [
            { text: correctActor.name, image_url: correctActor.profile_path ? `https://image.tmdb.org/t/p/w185${correctActor.profile_path}` : undefined },
            ...distractorActors.map((actor: any) => ({
                text: actor.name,
                image_url: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : undefined
            }))
        ].sort(() => Math.random() - 0.5);

        const correctIndex = options.findIndex(o => o.text === correctActor.name);

        // Get drama names in all languages
        const dramaLocalized = await getDramaInAllLanguages(drama.id);

        const variables: Record<SupportedLocale, Record<string, string>> = {
            pt: { name: dramaLocalized.pt?.name || drama.name, character: characterName },
            es: { name: dramaLocalized.es?.name || drama.name, character: characterName },
            ko: { name: dramaLocalized.ko?.name || drama.name, character: characterName },
            en: { name: dramaLocalized.en?.name || drama.name, character: characterName }
        };

        const texts = generateQuestionTexts('character_actor', variables);

        return {
            question_type: 'character_actor',
            question_text: texts.pt,
            question_text_pt: texts.pt,
            question_text_es: texts.es,
            question_text_ko: texts.ko,
            question_text_en: texts.en,
            image_url: drama.backdrop_path ? `https://image.tmdb.org/t/p/w300${drama.backdrop_path}` : undefined,
            options, // Legacy
            options_pt: options, // Actor names don't translate
            options_es: options,
            options_ko: options,
            options_en: options,
            correct_index: correctIndex,
            tmdb_drama_id: drama.id,
            tmdb_actor_id: correctActor.id,
            difficulty: 'medium'
        };
    } catch (err) {
        console.error(`[QUIZ-GEN] Error in generateCharacterToActorQuestion:`, err);
        return null;
    }
};

const generateEpisodeCountQuestion = async (drama: any): Promise<GeneratedQuestion | null> => {
    try {
        const details = await fetchFromTMDb(`/tv/${drama.id}`);
        const count = details.number_of_episodes;
        if (!count) return null;

        // Generate plausible distractors based on common K-drama lengths (12, 16, 20, 50)
        const possible = [12, 16, 20, 24, 32, 50, 100].filter(n => n !== count);
        const distractors = [
            count + 2,
            count - 2 > 0 ? count - 2 : count + 4,
            possible[Math.floor(Math.random() * possible.length)]
        ];

        const options = [
            { text: count.toString() },
            ...distractors.map(d => ({ text: d.toString() }))
        ].sort(() => Math.random() - 0.5);

        const correctIndex = options.findIndex(o => o.text === count.toString());

        // Get drama names in all languages
        const dramaLocalized = await getDramaInAllLanguages(drama.id);

        const variables: Record<SupportedLocale, Record<string, string>> = {
            pt: { name: dramaLocalized.pt?.name || drama.name },
            es: { name: dramaLocalized.es?.name || drama.name },
            ko: { name: dramaLocalized.ko?.name || drama.name },
            en: { name: dramaLocalized.en?.name || drama.name }
        };

        const texts = generateQuestionTexts('episode_count', variables);

        return {
            question_type: 'episode_count',
            question_text: texts.pt,
            question_text_pt: texts.pt,
            question_text_es: texts.es,
            question_text_ko: texts.ko,
            question_text_en: texts.en,
            image_url: drama.poster_path ? `https://image.tmdb.org/t/p/w154${drama.poster_path}` : undefined,
            options, // Legacy
            options_pt: options, // Numbers don't translate
            options_es: options,
            options_ko: options,
            options_en: options,
            correct_index: correctIndex,
            tmdb_drama_id: drama.id,
            difficulty: 'easy'
        };
    } catch (err) {
        console.error(`[QUIZ-GEN] Error in generateEpisodeCountQuestion:`, err);
        return null;
    }
};

const generateTrueFalseQuestion = async (drama: any, popularDramas: any[]): Promise<GeneratedQuestion | null> => {
    try {
        const isTrue = Math.random() > 0.5;
        const variants: ('actor' | 'year' | 'scene')[] = ['actor', 'year', 'scene'];
        const variant = variants[Math.floor(Math.random() * variants.length)];

        let templateKey: 'true_false_actor' | 'true_false_year' | 'true_false_scene';
        let variables: Record<SupportedLocale, Record<string, string>> = {
            pt: { name: drama.name },
            es: { name: drama.name },
            ko: { name: drama.name },
            en: { name: drama.name }
        };
        let imageUrl = drama.backdrop_path ? `https://image.tmdb.org/t/p/w300${drama.backdrop_path}` : undefined;

        // Fetch localized drama names
        const dramaLocalized = await getDramaInAllLanguages(drama.id);
        SUPPORTED_LOCALES.forEach(locale => {
            variables[locale].name = dramaLocalized[locale]?.name || drama.name;
        });

        if (variant === 'actor') {
            templateKey = 'true_false_actor';
            const credits = await fetchFromTMDb(`/tv/${drama.id}/credits`);
            const cast = credits.cast || [];

            if (isTrue) {
                if (cast.length === 0) return null;
                const actor = cast[Math.floor(Math.random() * Math.min(cast.length, 10))];
                SUPPORTED_LOCALES.forEach(locale => {
                    variables[locale].actor = actor.name;
                });
                if (actor.profile_path) {
                    imageUrl = `https://image.tmdb.org/t/p/w300${actor.profile_path}`;
                }
            } else {
                // Pick a random distractor actor from another drama
                const otherDramas = popularDramas.filter(d => d.id !== drama.id);
                if (otherDramas.length === 0) return null;
                const otherDrama = otherDramas[Math.floor(Math.random() * otherDramas.length)];

                const otherCredits = await fetchFromTMDb(`/tv/${otherDrama.id}/credits`);
                const otherCast = otherCredits.cast || [];
                if (otherCast.length === 0) return null;
                const actor = otherCast[Math.floor(Math.random() * Math.min(otherCast.length, 10))];
                SUPPORTED_LOCALES.forEach(locale => {
                    variables[locale].actor = actor.name;
                });
                if (actor.profile_path) {
                    imageUrl = `https://image.tmdb.org/t/p/w300${actor.profile_path}`;
                }
            }
        } else if (variant === 'year') {
            templateKey = 'true_false_year';
            if (!drama.first_air_date) return null;
            const realYear = new Date(drama.first_air_date).getFullYear();

            if (isTrue) {
                SUPPORTED_LOCALES.forEach(locale => {
                    variables[locale].year = realYear.toString();
                });
            } else {
                const fakeYear = realYear + (Math.random() > 0.5 ? 1 : -1);
                SUPPORTED_LOCALES.forEach(locale => {
                    variables[locale].year = fakeYear.toString();
                });
            }
        } else {
            // variant === 'scene'
            templateKey = 'true_false_scene';
            if (isTrue) {
                const details = await fetchFromTMDb(`/tv/${drama.id}`);
                const seasons = (details.seasons || []).filter((s: any) => s.season_number > 0 && s.episode_count > 0);
                if (seasons.length === 0) return null;
                const season = seasons[Math.floor(Math.random() * seasons.length)];
                const seasonDetails = await fetchFromTMDb(`/tv/${drama.id}/season/${season.season_number}`);
                const validEpisodes = (seasonDetails.episodes || []).filter((e: any) => e.still_path);
                if (validEpisodes.length === 0) return null;
                const episode = validEpisodes[Math.floor(Math.random() * validEpisodes.length)];
                imageUrl = `https://image.tmdb.org/t/p/w300${episode.still_path}`;
            } else {
                // Pick a scene from another random drama
                const otherDramas = popularDramas.filter(d => d.id !== drama.id);
                if (otherDramas.length === 0) return null;
                const otherDrama = otherDramas[Math.floor(Math.random() * otherDramas.length)];

                const details = await fetchFromTMDb(`/tv/${otherDrama.id}`);
                const seasons = (details.seasons || []).filter((s: any) => s.season_number > 0 && s.episode_count > 0);
                if (seasons.length === 0) return null;
                const season = seasons[Math.floor(Math.random() * seasons.length)];
                const seasonDetails = await fetchFromTMDb(`/tv/${otherDrama.id}/season/${season.season_number}`);
                const validEpisodes = (seasonDetails.episodes || []).filter((e: any) => e.still_path);
                if (validEpisodes.length === 0) return null;
                const episode = validEpisodes[Math.floor(Math.random() * validEpisodes.length)];
                imageUrl = `https://image.tmdb.org/t/p/w300${episode.still_path}`;
            }
        }

        const texts = generateQuestionTexts(templateKey, variables);

        // Options for True/False
        const options_pt = [{ text: 'Verdadeiro' }, { text: 'Falso' }];
        const options_es = [{ text: 'Verdadero' }, { text: 'Falso' }];
        const options_ko = [{ text: '진실' }, { text: '거짓' }];
        const options_en = [{ text: 'True' }, { text: 'False' }];

        const correctIndex = isTrue ? 0 : 1;

        return {
            question_type: 'true_false',
            question_text: texts.pt,
            question_text_pt: texts.pt,
            question_text_es: texts.es,
            question_text_ko: texts.ko,
            question_text_en: texts.en,
            image_url: imageUrl,
            options: options_pt,
            options_pt,
            options_es,
            options_ko,
            options_en,
            correct_index: correctIndex,
            tmdb_drama_id: drama.id,
            difficulty: 'easy'
        };
    } catch (err) {
        console.error(`[QUIZ-GEN] Error in generateTrueFalseQuestion:`, err);
        return null;
    }
};

