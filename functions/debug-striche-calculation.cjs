const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function debugStricheCalculation() {
  console.log('🔍 [DEBUG] Analysiere Striche-Berechnung im Detail...');
  
  const schmuddiPlayerId = 'TPBwj8bP9W59n5LoGWP5';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  try {
    // 1. Lade alle Sessions für Schmuuudii
    console.log('\n📊 [SESSIONS] Lade alle Sessions...');
    const sessionsSnap = await db.collection('jassGameSummaries')
      .where('groupId', '==', groupId)
      .where('status', '==', 'completed')
      .where('participantPlayerIds', 'array-contains', schmuddiPlayerId)
      .get();
    
    console.log(`Gefunden: ${sessionsSnap.docs.length} Sessions`);
    
    for (const sessionDoc of sessionsSnap.docs) {
      const session = sessionDoc.data();
      const sessionId = sessionDoc.id;
      const isTournament = !!session.tournamentId;
      
      console.log(`\n🎯 [SESSION ${sessionId.substring(0,8)}] ${isTournament ? 'TOURNAMENT' : 'REGULAR'}`);
      
      // Finde Schmuuudiis Team
      let schmuddiTeam = null;
      if (session.teams?.top?.players) {
        const isInTop = session.teams.top.players.some(p => p.playerId === schmuddiPlayerId);
        if (isInTop) schmuddiTeam = 'top';
      }
      if (session.teams?.bottom?.players) {
        const isInBottom = session.teams.bottom.players.some(p => p.playerId === schmuddiPlayerId);
        if (isInBottom) schmuddiTeam = 'bottom';
      }
      
      console.log(`  Schmuuudii's Team: ${schmuddiTeam || 'NICHT GEFUNDEN'}`);
      
      if (schmuddiTeam) {
        // Session-Level Striche
        const sessionStriche = session.finalStriche?.[schmuddiTeam];
        if (sessionStriche) {
          const totalSessionStriche = (sessionStriche.sieg || 0) + 
                                     (sessionStriche.berg || 0) + 
                                     (sessionStriche.matsch || 0) + 
                                     (sessionStriche.schneider || 0) + 
                                     (sessionStriche.kontermatsch || 0);
          console.log(`  Session-Level Striche: ${totalSessionStriche}`);
          console.log(`    Details: sieg=${sessionStriche.sieg}, berg=${sessionStriche.berg}, matsch=${sessionStriche.matsch}, schneider=${sessionStriche.schneider}, kontermatsch=${sessionStriche.kontermatsch}`);
        }
        
        // Game-Level Striche (nur für Tournament)
        if (isTournament && session.gameResults) {
          console.log(`  🎮 Analysiere ${session.gameResults.length} Einzelspiele:`);
          let totalGameStriche = 0;
          
          for (let i = 0; i < session.gameResults.length; i++) {
            const game = session.gameResults[i];
            if (game.finalStriche && game.finalStriche[schmuddiTeam]) {
              const gameStriche = game.finalStriche[schmuddiTeam];
              const gameTotal = (gameStriche.sieg || 0) + 
                               (gameStriche.berg || 0) + 
                               (gameStriche.matsch || 0) + 
                               (gameStriche.schneider || 0) + 
                               (gameStriche.kontermatsch || 0);
              totalGameStriche += gameTotal;
              console.log(`    Spiel ${i+1}: ${gameTotal} Striche (sieg=${gameStriche.sieg}, berg=${gameStriche.berg}, matsch=${gameStriche.matsch})`);
            } else {
              console.log(`    Spiel ${i+1}: KEINE finalStriche für ${schmuddiTeam}`);
            }
          }
          console.log(`  🎯 Total Game-Level Striche: ${totalGameStriche}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Debug:', error);
  }
}

debugStricheCalculation().then(() => {
  console.log('\n🏁 Debug abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 