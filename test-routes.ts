// Test script to verify tRPC routes are properly registered
import { appRouter } from './trpc/app-router';

console.log('Testing tRPC Router Configuration\n');

// Get the router type
const router = appRouter;

// Check achievements routes
console.log('Achievements Routes:');
console.log('  - getUserAchievements:', 'getUserAchievements' in (router as any)._def.procedures ? '✅' : '❌');
console.log('  - getUserCompletedAchievements:', 'getUserCompletedAchievements' in (router as any)._def.procedures ? '✅' : '❌');
console.log('  - getUserAchievementStats:', 'getUserAchievementStats' in (router as any)._def.procedures ? '✅' : '❌');
console.log('  - unlockAchievement:', 'unlockAchievement' in (router as any)._def.procedures ? '✅' : '❌');

// Check collections routes
console.log('\nCollections Routes:');
console.log('  - getHomepage:', 'getHomepage' in (router as any)._def.procedures ? '✅' : '❌');
console.log('  - getDramas:', 'getDramas' in (router as any)._def.procedures ? '✅' : '❌');
console.log('  - getById:', 'getById' in (router as any)._def.procedures ? '✅' : '❌');

// List all available routes
console.log('\nAll Router Keys:');
try {
    const procedures = (router as any)._def.procedures || {};
    const queries = (router as any)._def.queries || {};
    const mutations = (router as any)._def.mutations || {};

    console.log('Procedures:', Object.keys(procedures));
    console.log('Queries:', Object.keys(queries));
    console.log('Mutations:', Object.keys(mutations));

    // Check nested routers
    const record = (router as any)._def.record || {};
    console.log('\nNested routers:', Object.keys(record));

    // Check achievements specifically
    if (record.achievements) {
        console.log('\nAchievements nested router procedures:');
        const achProcedures = record.achievements._def.procedures || {};
        console.log('  Keys:', Object.keys(achProcedures));
    }

    // Check collections specifically
    if (record.collections) {
        console.log('\nCollections nested router procedures:');
        const collProcedures = record.collections._def.procedures || {};
        console.log('  Keys:', Object.keys(collProcedures));
    }
} catch (error) {
    console.error('Error inspecting router:', error);
}
