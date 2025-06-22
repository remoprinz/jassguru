const admin = require("firebase-admin");
const path = require("path");
const logger = console;

// --- Initialize Firebase Admin SDK ---
const serviceAccountKeyPath = path.join(__dirname, '../serviceAccountKey.json');
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKeyPath),
  });
} catch (e) { /* Already initialized */ }

// Wir importieren die *tatsächliche Berechnungslogik*, nicht den onCall-Wrapper
const { updateGroupComputedStatsAfterSession } = require('../lib/groupStatsCalculator');

const triggerGroupRecalc = async (groupId) => {
  if (!groupId) {
    logger.error("Group ID is required.");
    return;
  }
  logger.info(`Manually triggering stats recalculation for group: ${groupId}`);
  
  try {
    // Direkter Aufruf der Kernfunktion
    await updateGroupComputedStatsAfterSession(groupId);
    
    logger.info(`✅ Successfully triggered recalculation for group ${groupId}.`);
  } catch (error) {
    logger.error(`Failed to trigger recalculation for group ${groupId}.`, { error });
  }
};

// --- Execute the script ---
const GROUP_ID_TO_RECALC = "Tz0wgIHMTlhvTtFastiJ";
triggerGroupRecalc(GROUP_ID_TO_RECALC).then(() => {
    logger.info("Script finished.");
    // Optional: Prozess explizit beenden, wenn er nicht von selbst stoppt
    process.exit(0); 
}); 