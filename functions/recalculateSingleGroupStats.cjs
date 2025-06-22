const admin = require('firebase-admin');

/**
 * @description
 * This script manually triggers a complete recalculation of the statistics for a single group.
 * It calls the 'updateGroupComputedStatsAfterSession' which reads all jassGameSummaries for that group
 * and rebuilds the groupComputedStats document from scratch.
 *
 * @usage
 * node recalculateSingleGroupStats.cjs <groupId>
 *
 * @example
 * node recalculateSingleGroupStats.cjs Tz0wgIHMTlhvTtFastiJ
 */

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'jassguru'
  });
}

// IMPORTANT: Import the calculator AFTER initializing the app
const { updateGroupComputedStatsAfterSession } = require('./lib/groupStatsCalculator');

async function recalculateGroup(groupId) {
  if (!groupId) {
    console.error('❌ Error: A groupId is required.');
    console.log('Usage: node recalculateSingleGroupStats.cjs <groupId>');
    process.exit(1);
  }

  console.log(`🔧 Triggering recalculation for group: ${groupId}`);

  try {
    await updateGroupComputedStatsAfterSession(groupId);
    console.log(`✅ Successfully triggered and completed statistics recalculation for group ${groupId}.`);
  } catch (error) {
    console.error(`❌ An error occurred during the recalculation for group ${groupId}:`, error);
    process.exit(1);
  }
}

// Run the script
const groupId = process.argv[2];
recalculateGroup(groupId)
  .then(() => {
    console.log('\n✅ Script finished successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed with an unhandled error:', error);
    process.exit(1);
  }); 