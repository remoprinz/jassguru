const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'jassguru'
  });
}

const db = admin.firestore();

async function debugRoundData() {
  console.log('🔍 DEBUG: RUNDENDATEN-STRUKTUR ANALYSE');
  console.log('=' .repeat(80));

  try {
    const groupId = 'UYYJnqdIOhZlygFG2lMo';
    
    // 1. Lade Sessions
    const sessionsSnap = await db.collection('jassGameSummaries')
      .where("groupId", "==", groupId)
      .where("status", "==", "completed")
      .limit(3)
      .get();

    console.log(`📊 Gefundene Sessions: ${sessionsSnap.docs.length}`);

    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      console.log(`\n🎯 SESSION: ${sessionDoc.id}`);
      console.log(`  - Spiele: ${sessionData.gamesPlayed || 0}`);
      
      // 2. Lade Spiele dieser Session
      for (let gameNumber = 1; gameNumber <= (sessionData.gamesPlayed || 0); gameNumber++) {
        try {
          const gameDoc = await sessionDoc.ref.collection('completedGames').doc(gameNumber.toString()).get();
          
          if (gameDoc.exists) {
            const gameData = gameDoc.data();
            console.log(`\n  🎮 SPIEL ${gameNumber}:`);
            console.log(`    - durationMillis: ${gameData.durationMillis || 'FEHLT'}`);
            
            // 3. Analysiere roundHistory
            if (gameData.roundHistory && Array.isArray(gameData.roundHistory)) {
              console.log(`    - Runden: ${gameData.roundHistory.length}`);
              
              // Analysiere erste 3 Runden im Detail
              gameData.roundHistory.slice(0, 3).forEach((round, index) => {
                console.log(`\n      🔄 RUNDE ${index + 1}:`);
                console.log(`        - durationMillis: ${round.durationMillis || 'FEHLT'}`);
                console.log(`        - duration: ${round.duration || 'FEHLT'}`);
                console.log(`        - startTime: ${round.startTime ? 'VORHANDEN' : 'FEHLT'}`);
                console.log(`        - endTime: ${round.endTime ? 'VORHANDEN' : 'FEHLT'}`);
                console.log(`        - timestamp: ${round.timestamp ? 'VORHANDEN' : 'FEHLT'}`);
                console.log(`        - farbe: ${round.farbe || 'FEHLT'}`);
                
                // Zeige alle verfügbaren Felder
                const availableFields = Object.keys(round);
                console.log(`        - Verfügbare Felder: ${availableFields.join(', ')}`);
                
                // Zeige Zeitstempel-Details falls vorhanden
                if (round.startTime && round.endTime) {
                  const startTime = round.startTime instanceof admin.firestore.Timestamp ? round.startTime.toMillis() : round.startTime;
                  const endTime = round.endTime instanceof admin.firestore.Timestamp ? round.endTime.toMillis() : round.endTime;
                  if (typeof startTime === 'number' && typeof endTime === 'number') {
                    const calculatedDuration = endTime - startTime;
                    console.log(`        - Berechnete Dauer: ${calculatedDuration}ms (${Math.round(calculatedDuration/1000)}s)`);
                  }
                }
              });
            } else {
              console.log(`    - ❌ KEINE roundHistory gefunden!`);
            }
          }
        } catch (gameError) {
          console.log(`    - ❌ Fehler beim Laden von Spiel ${gameNumber}:`, gameError.message);
        }
      }
    }

    console.log('\n🎯 TEAM-PAARUNGEN ANALYSE:');
    
    // 4. Analysiere Team-Strukturen
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      console.log(`\n📋 SESSION ${sessionDoc.id}:`);
      
      if (sessionData.teams) {
        console.log(`  - Team A: ${sessionData.teams.teamA?.players?.map(p => p.displayName).join(' & ') || 'FEHLT'}`);
        console.log(`  - Team B: ${sessionData.teams.teamB?.players?.map(p => p.displayName).join(' & ') || 'FEHLT'}`);
        console.log(`  - Gewinner: ${sessionData.winnerTeamKey || 'FEHLT'}`);
      } else {
        console.log(`  - ❌ KEINE Team-Daten gefunden!`);
      }
    }

  } catch (error) {
    console.error('❌ Fehler beim Debug:', error);
  }
}

// Führe Debug aus
debugRoundData().then(() => {
  console.log('\n✅ Debug abgeschlossen');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug-Fehler:', error);
  process.exit(1);
}); 