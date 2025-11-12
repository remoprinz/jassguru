/**
 * 🔄 BACKFILL: WeisPoints für bestehende Tournaments
 * Ergänzt sessionTotalWeisPoints in jassGameSummaries für alle Tournaments
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

async function backfillTournamentWeisPoints() {
  console.log('🔄 Backfill: WeisPoints für alle Tournaments\n');
  
  // Finde alle Tournaments
  const tournamentsSnap = await db.collection('tournaments')
    .where('status', '==', 'completed')
    .get();
  
  console.log(`📊 Gefunden: ${tournamentsSnap.size} Tournaments\n`);
  
  let updated = 0;
  let errors = 0;
  
  for (const tournamentDoc of tournamentsSnap.docs) {
    const tournamentId = tournamentDoc.id;
    const tournamentData = tournamentDoc.data();
    const groupId = tournamentData.groupId;
    
    if (!groupId) {
      console.log(`⚠️  Tournament ${tournamentId}: Keine groupId`);
      continue;
    }
    
    console.log(`\n📋 Tournament: ${tournamentId} (${tournamentData.name || 'Unbenannt'})`);
    
    // Hole alle Games
    const gamesSnap = await db.collection(`tournaments/${tournamentId}/games`).get();
    
    if (gamesSnap.empty) {
      console.log(`  ⚠️  Keine Games gefunden`);
      continue;
    }
    
    console.log(`  📊 ${gamesSnap.size} Games gefunden`);
    
    // Berechne sessionTotalWeisPoints aus roundHistory
    let sessionTotalWeisPoints = { top: 0, bottom: 0 };
    
    gamesSnap.docs.forEach(gameDoc => {
      const game = gameDoc.data();
      
      // ✅ Korrigiert: Verwende roundHistory statt playerDetails.weisInPasse
      if (game.roundHistory && Array.isArray(game.roundHistory)) {
        game.roundHistory.forEach((round) => {
          const weisPoints = round.weisPoints || {};
          
          if (weisPoints.top) sessionTotalWeisPoints.top += weisPoints.top;
          if (weisPoints.bottom) sessionTotalWeisPoints.bottom += weisPoints.bottom;
        });
      }
    });
    
    console.log(`  ✅ WeisPoints berechnet: Top=${sessionTotalWeisPoints.top}, Bottom=${sessionTotalWeisPoints.bottom}`);
    
    // Update jassGameSummary - Suche nach Session mit tournamentId
    try {
      const sessionsQuery = db.collection(`groups/${groupId}/jassGameSummaries`)
        .where('tournamentId', '==', tournamentId)
        .limit(1);
      
      const sessionsSnap = await sessionsQuery.get();
      
      if (sessionsSnap.empty) {
        console.log(`  ⚠️  Keine Session gefunden für Tournament ${tournamentId}`);
        continue;
      }
      
      const sessionDoc = sessionsSnap.docs[0];
      await sessionDoc.ref.update({ sessionTotalWeisPoints });
      
      console.log(`  ✅ Update erfolgreich (Session: ${sessionDoc.id})`);
      updated++;
    } catch (error) {
      console.error(`  ❌ Update fehlgeschlagen:`, error.message);
      errors++;
    }
  }
  
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`📊 ZUSAMMENFASSUNG`);
  console.log(`═══════════════════════════════════════════════`);
  console.log(`✅ Aktualisiert: ${updated}`);
  console.log(`❌ Fehler: ${errors}`);
  console.log(`📋 Total: ${tournamentsSnap.size}`);
  
  process.exit(0);
}

backfillTournamentWeisPoints();

