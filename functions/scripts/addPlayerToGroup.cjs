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
  // SDK was likely already initialized
}

const db = admin.firestore();

const addPlayerToGroup = async (playerId, groupId) => {
  if (!playerId || !groupId) {
    logger.error("Player ID and Group ID are required.");
    return;
  }
  logger.info(`Attempting to add player ${playerId} to group ${groupId}...`);

  try {
    const groupRef = db.collection('groups').doc(groupId);
    const playerRef = db.collection('players').doc(playerId);

    const [groupSnap, playerSnap] = await Promise.all([groupRef.get(), playerRef.get()]);

    if (!groupSnap.exists) {
      logger.error(`Group ${groupId} not found.`);
      return;
    }
    if (!playerSnap.exists) {
      logger.error(`Player ${playerId} not found.`);
      return;
    }

    const groupData = groupSnap.data();
    const playerData = playerSnap.data();

    // Add player to group's playerIds array
    await groupRef.update({
      playerIds: admin.firestore.FieldValue.arrayUnion(playerId)
    });

    // Add group to player's groupIds array
    await playerRef.update({
      groupIds: admin.firestore.FieldValue.arrayUnion(groupId)
    });

    // Add player to the `players` map within the group document
    const playerMapUpdate = {};
    playerMapUpdate[`players.${playerId}`] = {
        displayName: playerData.displayName || 'Unbekannter Spieler',
        joinedAt: new Date()
    };
    await groupRef.update(playerMapUpdate);

    logger.info(`✅ Successfully added player ${playerData.displayName} (${playerId}) to group ${groupData.name} (${groupId}).`);

  } catch (error) {
    logger.error(`Failed to add player to group.`, { error });
  }
};

// --- Execute the script ---
const PLAYER_ID_TO_ADD = "TPBwj8bP9W59n5LoGWP5"; // Schmuddi's Player ID
const GROUP_ID_TO_ADD_TO = "Tz0wgIHMTlhvTtFastiJ"; // die OG's

addPlayerToGroup(PLAYER_ID_TO_ADD, GROUP_ID_TO_ADD_TO); 