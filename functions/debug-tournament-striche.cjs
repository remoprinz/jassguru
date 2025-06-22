const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

async function debugTournamentStriche() {
  console.log('🔍 [DEBUG] Analysiere Tournament-Striche für Schmuuuudii...');
  
  const schmuddiPlayerId = 'TPBwj8bP9W59n5LoGWP5';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  try {
    // 1. Lade alle Sessions für Schmuuuudii
    console.log('\n📊 [SESSIONS] Lade alle Sessions...');
    const sessionsSnap = await db.collection('jassGameSummaries')
      .where('groupId', '==', groupId)
      .where('status', '==', 'completed')
      .where('participantPlayerIds', 'array-contains', schmuddiPlayerId)
      .orderBy('startedAt', 'asc')
      .get();
    
    console.log(`Gefunden: ${sessionsSnap.docs.length} Sessions für Schmuuuudii`);
    
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      const isTournament = Boolean(sessionData.tournamentId);
      
      console.log(`\n--- SESSION: ${sessionDoc.id} ---`);
      console.log(`Typ: ${isTournament ? 'TOURNAMENT' : 'REGULAR'}`);
      console.log(`TournamentId: ${sessionData.tournamentId || 'N/A'}`);
      console.log(`Spiele: ${sessionData.gamesPlayed || 0}`);
      
      // Bestimme Schmuuuudiis Team
      let playerTeam = null;
      if (sessionData.teams?.top?.players?.some(p => p.playerId === schmuddiPlayerId)) {
        playerTeam = 'top';
      } else if (sessionData.teams?.bottom?.players?.some(p => p.playerId === schmuddiPlayerId)) {
        playerTeam = 'bottom';
      }
      
      console.log(`Schmuuuudii's Team: ${playerTeam}`);
      
      if (playerTeam) {
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        
        // Zeige Session-Level Striche
        const playerStriche = sessionData.finalStriche?.[playerTeam] || {};
        const opponentStriche = sessionData.finalStriche?.[opponentTeam] || {};
        
        const playerStricheTotal = (playerStriche.sieg || 0) + (playerStriche.berg || 0) + 
                                  (playerStriche.matsch || 0) + (playerStriche.schneider || 0) + 
                                  (playerStriche.kontermatsch || 0);
        const opponentStricheTotal = (opponentStriche.sieg || 0) + (opponentStriche.berg || 0) + 
                                    (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + 
                                    (opponentStriche.kontermatsch || 0);
        
        console.log(`Session Striche - Gemacht: ${playerStricheTotal}, Erhalten: ${opponentStricheTotal}, Differenz: ${playerStricheTotal - opponentStricheTotal}`);
        console.log(`Striche Details:`, playerStriche);
        
        // Für Turniere: Zeige auch Game-Level Daten
        if (isTournament && sessionData.gameResults) {
          console.log('\n  GAME-LEVEL STRICHE:');
          sessionData.gameResults.forEach((game, index) => {
            const gamePlayerTeam = game.teams?.[playerTeam] ? playerTeam : 
                                  game.teams?.[opponentTeam] ? opponentTeam : null;
            
            if (gamePlayerTeam) {
              const gameOpponentTeam = gamePlayerTeam === 'top' ? 'bottom' : 'top';
              const gamePlayerStriche = game.finalStriche?.[gamePlayerTeam] || {};
              const gameOpponentStriche = game.finalStriche?.[gameOpponentTeam] || {};
              
              const gamePlayerStricheTotal = (gamePlayerStriche.sieg || 0) + (gamePlayerStriche.berg || 0) + 
                                            (gamePlayerStriche.matsch || 0) + (gamePlayerStriche.schneider || 0) + 
                                            (gamePlayerStriche.kontermatsch || 0);
              const gameOpponentStricheTotal = (gameOpponentStriche.sieg || 0) + (gameOpponentStriche.berg || 0) + 
                                              (gameOpponentStriche.matsch || 0) + (gameOpponentStriche.schneider || 0) + 
                                              (gameOpponentStriche.kontermatsch || 0);
              
              console.log(`    Spiel ${index + 1}: Gemacht: ${gamePlayerStricheTotal}, Erhalten: ${gameOpponentStricheTotal}, Diff: ${gamePlayerStricheTotal - gameOpponentStricheTotal}`);
              console.log(`      Details:`, gamePlayerStriche);
            }
          });
        }
      }
    }
    
    // 2. Berechne erwartete Gesamtdifferenz
    console.log('\n🧮 [BERECHNUNG] Erwartete Gesamt-Striche-Differenz:');
    let totalExpectedDiff = 0;
    
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      let playerTeam = null;
      if (sessionData.teams?.top?.players?.some(p => p.playerId === schmuddiPlayerId)) {
        playerTeam = 'top';
      } else if (sessionData.teams?.bottom?.players?.some(p => p.playerId === schmuddiPlayerId)) {
        playerTeam = 'bottom';
      }
      
      if (playerTeam) {
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        const playerStriche = sessionData.finalStriche?.[playerTeam] || {};
        const opponentStriche = sessionData.finalStriche?.[opponentTeam] || {};
        
        const playerStricheTotal = (playerStriche.sieg || 0) + (playerStriche.berg || 0) + 
                                  (playerStriche.matsch || 0) + (playerStriche.schneider || 0) + 
                                  (playerStriche.kontermatsch || 0);
        const opponentStricheTotal = (opponentStriche.sieg || 0) + (opponentStriche.berg || 0) + 
                                    (opponentStriche.matsch || 0) + (opponentStriche.schneider || 0) + 
                                    (opponentStriche.kontermatsch || 0);
        
        const sessionDiff = playerStricheTotal - opponentStricheTotal;
        totalExpectedDiff += sessionDiff;
        console.log(`  ${sessionDoc.id}: ${sessionDiff}`);
      }
    }
    
    console.log(`\n🎯 Erwartete Gesamt-Striche-Differenz: ${totalExpectedDiff}`);
    
  } catch (error) {
    console.error('❌ [ERROR] Fehler beim Debug:', error);
  }
}

debugTournamentStriche().then(() => {
  console.log('\n✅ Debug abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('❌ Debug fehlgeschlagen:', error);
  process.exit(1);
}); 