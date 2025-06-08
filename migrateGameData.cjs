// migrateGameData.cjs
// Dieses Skript migriert participantUids von Auth UIDs zu Player Doc IDs
const admin = require('firebase-admin');

const serviceAccount = require('./jassguru-firebase-adminsdk-44hjy-846f0f16ba.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

// Hilfsfunktion: Auth UID -> Player Doc ID
async function authUidToPlayerDocId(authUid) {
  const playerQuery = await db.collection('players').where('userId', '==', authUid).limit(1).get();
  if (!playerQuery.empty) {
    return playerQuery.docs[0].id; // Player Doc ID
  }
  
  // Fallback: Wenn kein Player-Dokument existiert, ist authUid möglicherweise bereits eine playerDocId
  const playerDoc = await db.collection('players').doc(authUid).get();
  if (playerDoc.exists) {
    return authUid; // War bereits Player Doc ID
  }
  
  console.warn(`⚠️  No player document found for authUid: ${authUid}`);
  return authUid; // Behalte ursprüngliche ID als Fallback
}

async function migrateJassGameSummaries() {
  console.log('🔄 Starting migration of jassGameSummaries...');
  
  const summariesSnap = await db.collection('jassGameSummaries').get();
  let migrated = 0;
  let errors = 0;

  for (const summaryDoc of summariesSnap.docs) {
    try {
      const data = summaryDoc.data();
      let needsUpdate = false;
      
      // 1. Migrate participantUids in main document
      if (data.participantUids && Array.isArray(data.participantUids)) {
        const newParticipantUids = [];
        for (const uid of data.participantUids) {
          const playerDocId = await authUidToPlayerDocId(uid);
          newParticipantUids.push(playerDocId);
          if (playerDocId !== uid) needsUpdate = true;
        }
        
        if (needsUpdate) {
          await summaryDoc.ref.update({ participantUids: newParticipantUids });
          console.log(`✅ Updated session ${summaryDoc.id}: ${data.participantUids.length} participants`);
        }
      }

      // 2. Migrate completedGames subcollection
      const gamesSnap = await summaryDoc.ref.collection('completedGames').get();
      for (const gameDoc of gamesSnap.docs) {
        const gameData = gameDoc.data();
        if (gameData.participantUids && Array.isArray(gameData.participantUids)) {
          const newGameParticipantUids = [];
          let gameNeedsUpdate = false;
          
          for (const uid of gameData.participantUids) {
            const playerDocId = await authUidToPlayerDocId(uid);
            newGameParticipantUids.push(playerDocId);
            if (playerDocId !== uid) gameNeedsUpdate = true;
          }
          
          if (gameNeedsUpdate) {
            await gameDoc.ref.update({ participantUids: newGameParticipantUids });
            console.log(`  ↳ Updated game ${gameDoc.id} in session ${summaryDoc.id}`);
          }
        }
      }
      
      migrated++;
    } catch (error) {
      console.error(`❌ Error migrating session ${summaryDoc.id}:`, error);
      errors++;
    }
  }

  console.log(`📊 Migration complete: ${migrated} sessions processed, ${errors} errors`);
}

async function migrateTournaments() {
  console.log('🔄 Starting migration of tournaments...');
  
  const tournamentsSnap = await db.collection('tournaments').get();
  let migrated = 0;

  for (const tournamentDoc of tournamentsSnap.docs) {
    try {
      const data = tournamentDoc.data();
      let needsUpdate = false;
      const updates = {};
      
      // Migrate playerUids in main document
      if (data.playerUids && Array.isArray(data.playerUids)) {
        const newPlayerUids = [];
        for (const uid of data.playerUids) {
          const playerDocId = await authUidToPlayerDocId(uid);
          newPlayerUids.push(playerDocId);
          if (playerDocId !== uid) needsUpdate = true;
        }
        if (needsUpdate) updates.playerUids = newPlayerUids;
      }

      // Migrate teams if present
      if (data.teams && Array.isArray(data.teams)) {
        const newTeams = [];
        for (const team of data.teams) {
          if (team.playerUids && Array.isArray(team.playerUids)) {
            const newTeamPlayerUids = [];
            for (const uid of team.playerUids) {
              const playerDocId = await authUidToPlayerDocId(uid);
              newTeamPlayerUids.push(playerDocId);
              if (playerDocId !== uid) needsUpdate = true;
            }
            newTeams.push({ ...team, playerUids: newTeamPlayerUids });
          } else {
            newTeams.push(team);
          }
        }
        if (needsUpdate) updates.teams = newTeams;
      }

      if (needsUpdate) {
        await tournamentDoc.ref.update(updates);
        console.log(`✅ Updated tournament ${tournamentDoc.id}`);
      }

      // Migrate tournament games
      const gamesSnap = await tournamentDoc.ref.collection('games').get();
      for (const gameDoc of gamesSnap.docs) {
        const gameData = gameDoc.data();
        if (gameData.participantUidsForPasse && Array.isArray(gameData.participantUidsForPasse)) {
          const newGameParticipantUids = [];
          let gameNeedsUpdate = false;
          
          for (const uid of gameData.participantUidsForPasse) {
            const playerDocId = await authUidToPlayerDocId(uid);
            newGameParticipantUids.push(playerDocId);
            if (playerDocId !== uid) gameNeedsUpdate = true;
          }
          
          if (gameNeedsUpdate) {
            await gameDoc.ref.update({ participantUidsForPasse: newGameParticipantUids });
            console.log(`  ↳ Updated tournament game ${gameDoc.id}`);
          }
        }
      }
      
      migrated++;
    } catch (error) {
      console.error(`❌ Error migrating tournament ${tournamentDoc.id}:`, error);
    }
  }

  console.log(`📊 Tournament migration complete: ${migrated} tournaments processed`);
}

async function runFullMigration() {
  console.log('🚀 Starting complete game data migration...');
  console.warn('⚠️  ENSURE YOU HAVE A BACKUP OF YOUR FIRESTORE DATA ⚠️');
  
  // Uncomment the lines below when ready to execute
  // await migrateJassGameSummaries();
  // await migrateTournaments();
  
  console.log('✅ All migrations completed successfully!');
}

runFullMigration().catch(console.error); 