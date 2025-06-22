const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function debugOpponentStriche() {
  console.log('🔍 [DEBUG] Analysiere Gegner-Striche für Schmuuudii...');
  
  const schmuddiPlayerId = 'TPBwj8bP9W59n5LoGWP5';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  try {
    // Lade alle Sessions für Schmuuudii
    const sessionsSnap = await db.collection('jassGameSummaries')
      .where('groupId', '==', groupId)
      .where('status', '==', 'completed')
      .where('participantPlayerIds', 'array-contains', schmuddiPlayerId)
      .get();
    
    console.log(`Gefunden: ${sessionsSnap.docs.length} Sessions`);
    
    let totalStricheMade = 0;
    let totalStricheReceived = 0;
    
    for (const sessionDoc of sessionsSnap.docs) {
      const session = sessionDoc.data();
      const sessionId = sessionDoc.id;
      const isTournament = !!session.tournamentId;
      
      console.log(`\n🎯 [SESSION ${sessionId.substring(0,8)}] ${isTournament ? 'TOURNAMENT' : 'REGULAR'}`);
      
      // Finde Schmuuudiis Team
      let schmuddiTeam = null;
      let opponentTeam = null;
      
      if (session.teams?.top?.players) {
        const isInTop = session.teams.top.players.some(p => p.playerId === schmuddiPlayerId);
        if (isInTop) {
          schmuddiTeam = 'top';
          opponentTeam = 'bottom';
        }
      }
      if (session.teams?.bottom?.players) {
        const isInBottom = session.teams.bottom.players.some(p => p.playerId === schmuddiPlayerId);
        if (isInBottom) {
          schmuddiTeam = 'bottom';
          opponentTeam = 'top';
        }
      }
      
      console.log(`  Schmuuudii's Team: ${schmuddiTeam || 'NICHT GEFUNDEN'}`);
      console.log(`  Opponent Team: ${opponentTeam || 'NICHT GEFUNDEN'}`);
      
      if (schmuddiTeam && opponentTeam) {
        // Session-Level Striche
        const sessionStricheMade = session.finalStriche?.[schmuddiTeam];
        const sessionStricheReceived = session.finalStriche?.[opponentTeam];
        
        if (sessionStricheMade && sessionStricheReceived) {
          const totalSessionStricheMade = (sessionStricheMade.sieg || 0) + 
                                         (sessionStricheMade.berg || 0) + 
                                         (sessionStricheMade.matsch || 0) + 
                                         (sessionStricheMade.schneider || 0) + 
                                         (sessionStricheMade.kontermatsch || 0);
          
          const totalSessionStricheReceived = (sessionStricheReceived.sieg || 0) + 
                                             (sessionStricheReceived.berg || 0) + 
                                             (sessionStricheReceived.matsch || 0) + 
                                             (sessionStricheReceived.schneider || 0) + 
                                             (sessionStricheReceived.kontermatsch || 0);
          
          console.log(`  📊 Session-Level:`);
          console.log(`    Schmuuudii (${schmuddiTeam}): ${totalSessionStricheMade} Striche`);
          console.log(`    Gegner (${opponentTeam}): ${totalSessionStricheReceived} Striche`);
          console.log(`    Differenz: ${totalSessionStricheMade - totalSessionStricheReceived}`);
          
          totalStricheMade += totalSessionStricheMade;
          totalStricheReceived += totalSessionStricheReceived;
        }
      }
    }
    
    console.log(`\n🎯 [GESAMT]`);
    console.log(`  Total Striche Made: ${totalStricheMade}`);
    console.log(`  Total Striche Received: ${totalStricheReceived}`);
    console.log(`  Total Differenz: ${totalStricheMade - totalStricheReceived}`);
    
  } catch (error) {
    console.error('❌ Fehler beim Debug:', error);
  }
}

debugOpponentStriche().then(() => {
  console.log('\n🏁 Debug abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 