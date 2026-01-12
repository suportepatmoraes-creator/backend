import { createTRPCRouter } from "./create-context";
import hiRoute from "./routes/example/hi/route";

// Community routes
import {
  getCommunityPostsProcedure,
  createCommunityPostProcedure,
  getPostDetailsProcedure,
  togglePostLikeProcedure,
  addPostCommentProcedure,
  deletePostCommentProcedure,
  togglePostCommentLikeProcedure,
  getNewsPostsProcedure,
  getNewsPostByIdProcedure,
  deletePostProcedure
} from "./routes/community/posts/route";

// News comments routes
import {
  getCommentsProcedure,
  addCommentProcedure,
  toggleCommentLikeProcedure,
  getArticleLikesProcedure,
  getUserLikedArticleProcedure,
  toggleArticleLikeProcedure,
  deleteCommentProcedure
} from "./routes/news/comments/route";

// Rankings routes
import {
  getUserRankingsProcedure,
  getRankingDetailsProcedure,
  saveRankingProcedure,
  toggleRankingLikeProcedure,
  addRankingCommentProcedure,
  deleteRankingCommentProcedure,
  toggleRankingCommentLikeProcedure,
  deleteRankingProcedure
} from "./routes/rankings/route";

// Users routes
import {
  getUserProfileProcedure,
  updateUserProfileProcedure,
  toggleFollowUserProcedure,
  getUserFollowersProcedure,
  getUserFollowingProcedure,
  getUserCompletedDramasProcedure,
  getFollowersWithDetailsProcedure,
  getFollowingWithDetailsProcedure,
  getUserStatsProcedure,
  updateUserStatsProcedure,
  markEpisodeWatchedProcedure,
  completeDramaWithDateRangeProcedure,
  updateUserProfileCoverProcedure,
  checkUserPremiumStatusProcedure,
  getProfileAvatarsProcedure,
  deleteAccountProcedure
} from "./routes/users/route";
import {
  blockUserProcedure,
  unblockUserProcedure,
  isUserBlockedProcedure,
  getBlockedUsersProcedure
} from "./routes/users/blocks/route";

// Discover routes
import {
  getDiscoverDramasProcedure,
  skipDramaProcedure,
  getDailySwipesStatusProcedure,
  incrementDailySwipesProcedure,
  cleanExpiredSkippedDramasProcedure,
  addBonusSwipesProcedure
} from "./routes/discover/route";

// Subscription routes
import { subscriptionProcedures } from "./routes/subscription/route";

// Completion routes
import {
  completeDramaProcedure,
  getCompletionHistoryProcedure,
  getCompletionStatsProcedure,
  checkDramaCompletionProcedure
} from "./routes/completions/route";

// Drama categories routes
import {
  backfillDramaCategoriesProcedure,
  getDramaCategoryStatsProcedure
} from "./routes/dramas/categories/route";

// Drama cache routes
import {
  getDramaById,
  searchDramas,
  getPopularDramas,
  getTrendingDramas,
  syncSeriesCache,
  cleanupCache,
  getDramaProviders
} from "./routes/dramas/cache/route";

// Comment reports routes
import {
  createCommentReportProcedure,
  getCommentReportsProcedure,
  checkUserReportedCommentProcedure,
  getCommentReportCountProcedure
} from "./routes/comments/reports/route";

// Collections routes
import {
  getHomepageCollections,
  getCollectionDramas,
  getCollectionById
} from "./routes/collections/route";

// Episodes routes
import { episodesRouter } from "./routes/episodes/route";

// Achievements routes
import {
  getUserAchievementsProcedure,
  getUserCompletedAchievementsProcedure,
  getUserAchievementStatsProcedure,
  unlockAchievementProcedure
} from "./routes/achievements/route";

// Notifications routes
import {
  getNotificationsProcedure,
  getUnreadCountProcedure,
  markAsReadProcedure,
  markAllAsReadProcedure
} from "./routes/notifications/route";

// Push Notifications routes
import {
  sendPushNotificationProcedure,
  getCampaignsProcedure,
  getStatsProcedure
} from "./routes/pushNotifications/route";

// Quiz routes
import {
  getActiveSeasonsProcedure,
  getUpcomingSeasonsProcedure,
  joinSeasonProcedure,
  getAllSeasonsProcedure,
  getSeasonDetailsProcedure,
  getTodayQuestionsProcedure,
  submitAnswerProcedure,
  unlockExtraQuestionsProcedure,
  getSeasonRankingProcedure,
  getGlobalRankingProcedure,
  getUserSeasonStatsProcedure,
  createSeasonProcedure,
  updateSeasonProcedure,
  createQuestionProcedure,
  getSeasonQuestionsProcedure,
  getPendingQuestionsProcedure,
  approveQuestionProcedure,
  rejectQuestionProcedure,
  deleteQuestionProcedure,
  generateQuestionsProcedure,
  generateQuestionsByTypeProcedure
} from "./routes/quiz/route";

// Shopee Affiliate routes
import { searchProductsProcedure } from "./routes/shopee/route";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiRoute,
  }),

  community: createTRPCRouter({
    getPosts: getCommunityPostsProcedure,
    createPost: createCommunityPostProcedure,
    getPostDetails: getPostDetailsProcedure,
    togglePostLike: togglePostLikeProcedure,
    addPostComment: addPostCommentProcedure,
    deletePostComment: deletePostCommentProcedure,
    togglePostCommentLike: togglePostCommentLikeProcedure,
    deletePost: deletePostProcedure,
  }),

  news: createTRPCRouter({
    getPosts: getNewsPostsProcedure,
    getPostById: getNewsPostByIdProcedure,
    getComments: getCommentsProcedure,
    addComment: addCommentProcedure,
    toggleCommentLike: toggleCommentLikeProcedure,
    getArticleLikes: getArticleLikesProcedure,
    getUserLikedArticle: getUserLikedArticleProcedure,
    toggleArticleLike: toggleArticleLikeProcedure,
    deleteComment: deleteCommentProcedure,
  }),

  rankings: createTRPCRouter({
    getUserRankings: getUserRankingsProcedure,
    getRankingDetails: getRankingDetailsProcedure,
    saveRanking: saveRankingProcedure,
    toggleRankingLike: toggleRankingLikeProcedure,
    addRankingComment: addRankingCommentProcedure,
    deleteRankingComment: deleteRankingCommentProcedure,
    toggleRankingCommentLike: toggleRankingCommentLikeProcedure,
    deleteRanking: deleteRankingProcedure,
  }),

  users: createTRPCRouter({
    getUserProfile: getUserProfileProcedure,
    updateUserProfile: updateUserProfileProcedure,
    toggleFollowUser: toggleFollowUserProcedure,
    getUserFollowers: getUserFollowersProcedure,
    getUserFollowing: getUserFollowingProcedure,
    getUserCompletedDramas: getUserCompletedDramasProcedure,
    getFollowersWithDetails: getFollowersWithDetailsProcedure,
    getFollowingWithDetails: getFollowingWithDetailsProcedure,
    getStats: getUserStatsProcedure,
    updateStats: updateUserStatsProcedure,
    markEpisodeWatched: markEpisodeWatchedProcedure,
    completeDramaWithDateRange: completeDramaWithDateRangeProcedure,
    updateProfileCover: updateUserProfileCoverProcedure,
    checkPremiumStatus: checkUserPremiumStatusProcedure,
    getProfileAvatars: getProfileAvatarsProcedure,
    deleteAccount: deleteAccountProcedure,
    blockUser: blockUserProcedure,
    unblockUser: unblockUserProcedure,
    isUserBlocked: isUserBlockedProcedure,
    getBlockedUsers: getBlockedUsersProcedure,
  }),

  discover: createTRPCRouter({
    getDramas: getDiscoverDramasProcedure,
    skipDrama: skipDramaProcedure,
    getDailySwipesStatus: getDailySwipesStatusProcedure,
    incrementDailySwipes: incrementDailySwipesProcedure,
    cleanExpiredSkippedDramas: cleanExpiredSkippedDramasProcedure,
    addBonusSwipes: addBonusSwipesProcedure,
  }),

  subscription: createTRPCRouter({
    getPlans: subscriptionProcedures.getPlans,
    getUserSubscription: subscriptionProcedures.getUserSubscription,
    createSubscription: subscriptionProcedures.createSubscription,
    cancelSubscription: subscriptionProcedures.cancelSubscription,
    hasActiveSubscription: subscriptionProcedures.hasActiveSubscription,
  }),

  completions: createTRPCRouter({
    completeDrama: completeDramaProcedure,
    getHistory: getCompletionHistoryProcedure,
    getStats: getCompletionStatsProcedure,
    checkCompletion: checkDramaCompletionProcedure,
  }),

  dramas: createTRPCRouter({
    // Categories
    backfillCategories: backfillDramaCategoriesProcedure,
    getCategoryStats: getDramaCategoryStatsProcedure,
    // Cache system
    getById: getDramaById,
    search: searchDramas,
    getPopular: getPopularDramas,
    getTrending: getTrendingDramas,
    syncCache: syncSeriesCache,
    cleanupCache: cleanupCache,
    getProviders: getDramaProviders,
  }),

  comments: createTRPCRouter({
    reports: createTRPCRouter({
      create: createCommentReportProcedure,
      getAll: getCommentReportsProcedure,
      checkUserReported: checkUserReportedCommentProcedure,
      getCount: getCommentReportCountProcedure,
    }),
  }),

  collections: createTRPCRouter({
    getHomepage: getHomepageCollections,
    getDramas: getCollectionDramas,
    getById: getCollectionById,
  }),

  episodes: episodesRouter,

  achievements: createTRPCRouter({
    getUserAchievements: getUserAchievementsProcedure,
    getUserCompletedAchievements: getUserCompletedAchievementsProcedure,
    getUserAchievementStats: getUserAchievementStatsProcedure,
    unlockAchievement: unlockAchievementProcedure,
  }),

  notifications: createTRPCRouter({
    getNotifications: getNotificationsProcedure,
    getUnreadCount: getUnreadCountProcedure,
    markAsRead: markAsReadProcedure,
    markAllAsRead: markAllAsReadProcedure,
    // Push notifications
    sendPush: sendPushNotificationProcedure,
    getPushCampaigns: getCampaignsProcedure,
    getPushStats: getStatsProcedure,
  }),

  quiz: createTRPCRouter({
    // User-facing procedures
    getActiveSeasons: getActiveSeasonsProcedure,
    getUpcomingSeasons: getUpcomingSeasonsProcedure,
    joinSeason: joinSeasonProcedure,
    getAllSeasons: getAllSeasonsProcedure,
    getSeasonDetails: getSeasonDetailsProcedure,
    getTodayQuestions: getTodayQuestionsProcedure,
    submitAnswer: submitAnswerProcedure,
    unlockExtraQuestions: unlockExtraQuestionsProcedure,
    getSeasonRanking: getSeasonRankingProcedure,
    getGlobalRanking: getGlobalRankingProcedure,
    getUserSeasonStats: getUserSeasonStatsProcedure,
    // Admin procedures
    createSeason: createSeasonProcedure,
    updateSeason: updateSeasonProcedure,
    createQuestion: createQuestionProcedure,
    getSeasonQuestions: getSeasonQuestionsProcedure,
    getPendingQuestions: getPendingQuestionsProcedure,
    approveQuestion: approveQuestionProcedure,
    rejectQuestion: rejectQuestionProcedure,
    deleteQuestion: deleteQuestionProcedure,
    generateQuestions: generateQuestionsProcedure,
    generateQuestionsByType: generateQuestionsByTypeProcedure,
  }),

  shopee: createTRPCRouter({
    searchProducts: searchProductsProcedure,
  }),
});

export type AppRouter = typeof appRouter;