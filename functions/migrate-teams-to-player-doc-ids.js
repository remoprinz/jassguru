const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren mit serviceAccountKey.json
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

async function migrateTeamsToPlayerDocIds() {
  console.log('🔄 Migrating teams structure from Auth UIDs to Player Doc IDs...\n');
  
  try {
    // Lade alle completed Sessions
    const sessionsQuery = await db.collection('jassGameSummaries')
      .where('status', '==', 'completed')
      .get();
    
    console.log(`🔍 Found ${sessionsQuery.docs.length} completed sessions to analyze...`);
    
    let migratedCount = 0;
    let alreadyCorrectCount = 0;
    let errorCount = 0;
    
    for (const sessionDoc of sessionsQuery.docs) {
      const sessionData = sessionDoc.data();
      
      console.log(`\n📊 Session: ${sessionDoc.id}`);
      
      // Prüfe ob participantUids und participantPlayerIds vorhanden sind
      if (!sessionData.participantUids || !sessionData.participantPlayerIds) {
        console.log(`   ⚠️  Missing participantUids or participantPlayerIds - skipping`);
        continue;
      }
      
      if (sessionData.participantUids.length !== sessionData.participantPlayerIds.length) {
        console.log(`   ⚠️  Mismatched array lengths - skipping`);
        continue;
      }
      
      // Prüfe ob teams-Struktur existiert
      if (!sessionData.teams?.teamA?.players || !sessionData.teams?.teamB?.players) {
        console.log(`   ⚠️  No teams structure - skipping`);
        continue;
      }
      
      // Erstelle Mapping von Auth UIDs zu Player Doc IDs
      const uidToPlayerIdMap = new Map();
      for (let i = 0; i < sessionData.participantUids.length; i++) {
        uidToPlayerIdMap.set(sessionData.participantUids[i], sessionData.participantPlayerIds[i]);
      }
      
      // Prüfe ob Migration notwendig ist
      let needsMigration = false;
      const allTeamPlayerIds = [
        ...sessionData.teams.teamA.players.map(p => p.playerId),
        ...sessionData.teams.teamB.players.map(p => p.playerId)
      ];
      
      // Prüfe ob irgendein playerId eine Auth UID ist (und nicht Player Doc ID)
      for (const playerId of allTeamPlayerIds) {
        if (sessionData.participantUids.includes(playerId) && !sessionData.participantPlayerIds.includes(playerId)) {
          needsMigration = true;
          break;
        }
      }
      
      if (!needsMigration) {
        console.log(`   ✅ Already using Player Doc IDs - no migration needed`);
        alreadyCorrectCount++;
        continue;
      }
      
      try {
        // Führe Migration durch
        const correctedTeams = {
          teamA: {
            ...sessionData.teams.teamA,
            players: sessionData.teams.teamA.players.map(player => ({
              ...player,
              playerId: uidToPlayerIdMap.get(player.playerId) || player.playerId
            }))
          },
          teamB: {
            ...sessionData.teams.teamB,
            players: sessionData.teams.teamB.players.map(player => ({
              ...player,
              playerId: uidToPlayerIdMap.get(player.playerId) || player.playerId
            }))
          }
        };
        
        // Update Session
        await sessionDoc.ref.update({
          teams: correctedTeams,
          migratedAt: admin.firestore.Timestamp.now(),
          migratedBy: 'migrate-teams-to-player-doc-ids-script'
        });
        
        console.log(`   ✅ Migrated teams structure successfully`);
        console.log(`   TeamA: ${correctedTeams.teamA.players.map(p => `${p.displayName}(${p.playerId})`).join(', ')}`);
        console.log(`   TeamB: ${correctedTeams.teamB.players.map(p => `${p.displayName}(${p.playerId})`).join(', ')}`);
        
        migratedCount++;
      } catch (updateError) {
        console.error(`   ❌ Error migrating session ${sessionDoc.id}:`, updateError);
        errorCount++;
      }
    }
    
    console.log('\n🎉 Migration completed!');
    console.log(`   ✅ Migrated sessions: ${migratedCount}`);
    console.log(`   ➡️  Already correct: ${alreadyCorrectCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    
    if (migratedCount > 0) {
      console.log('\n🔄 Recommendation: Run group statistics recalculation to update stats with the migrated data.');
    }
    
  } catch (error) {
    console.error('❌ Critical error during migration:', error);
  }
}

// Führe die Migration aus
migrateTeamsToPlayerDocIds()
  .then(() => {
    console.log('\n🎉 Migration script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  }); 