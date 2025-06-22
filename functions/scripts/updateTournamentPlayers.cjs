const admin = require("firebase-admin");
const path = require("path");
const logger = console;

// --- Initialize Firebase Admin SDK ---
const serviceAccountKeyPath = path.join(__dirname, '../serviceAccountKey.json');
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKeyPath),
  });
  logger.info("Firebase Admin SDK initialized successfully.");
} catch (e) {
  logger.info("Firebase Admin SDK already initialized or an error occurred:", e.message);
}

const db = admin.firestore();
const { updatePlayerStats } = require('../lib/playerStatsCalculator');

// --- Main Script Logic ---
const updateStatsForTournamentPlayers = async (tournamentId) => {
    if (!tournamentId) {
        logger.error("Tournament ID is required.");
        process.exit(1);
    }
    logger.info(`Starting stats update for players of tournament: ${tournamentId}`);

    try {
        const tournamentRef = db.collection("tournaments").doc(tournamentId);
        const tournamentSnap = await tournamentRef.get();

        if (!tournamentSnap.exists) {
            logger.error(`Tournament ${tournamentId} not found.`);
            return;
        }

        const tournamentData = tournamentSnap.data();
        const participantUids = tournamentData.participantUids || [];

        if (participantUids.length === 0) {
            logger.warn(`No participants found for tournament ${tournamentId}. Exiting.`);
            return;
        }
        
        logger.info(`Found ${participantUids.length} participants to update.`);

        const playerDocPromises = participantUids.map(uid => 
            db.collection('players').where('userId', '==', uid).limit(1).get()
        );

        const playerSnapshots = await Promise.all(playerDocPromises);
        const playerIdsToUpdate = [];

        playerSnapshots.forEach((snap, index) => {
            if (!snap.empty) {
                playerIdsToUpdate.push(snap.docs[0].id);
            } else {
                logger.warn(`Could not find player document for authUid: ${participantUids[index]}`);
            }
        });

        if (playerIdsToUpdate.length === 0) {
            logger.error("Found no valid player document IDs to update.");
            return;
        }

        logger.info(`Triggering updates for player IDs: ${playerIdsToUpdate.join(', ')}`);
        
        const updatePromises = playerIdsToUpdate.map(playerId => {
            return updatePlayerStats(playerId).then(() => {
                logger.info(`  ✅ Successfully updated stats for player ${playerId}`);
            }).catch(err => {
                logger.error(`  ❌ Failed to update stats for player ${playerId}`, err);
            });
        });

        await Promise.all(updatePromises);
        
        logger.info(`\n🎉 Success! All statistics updates for tournament ${tournamentId} have been triggered.`);

    } catch (error) {
        logger.error(`Failed to update stats for tournament players for ${tournamentId}.`, { error });
    }
};

// --- Execute the script ---
// Holt die Turnier-ID aus den Kommandozeilen-Argumenten
const tournamentIdFromArgs = process.argv[2];
if (!tournamentIdFromArgs) {
    console.error("Please provide a tournament ID as a command-line argument.");
    console.error("Usage: node functions/scripts/updateTournamentPlayers.cjs <TOURNAMENT_ID>");
    process.exit(1);
}

updateStatsForTournamentPlayers(tournamentIdFromArgs).then(() => {
    logger.info("Script finished.");
}); 