const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function debugFrankKontermatsch() {
  console.log('🔍 Debugge Frank\'s Kontermatsch-Daten...\n');
  
  try {
    // Finde Frank's Player-ID
    const groupDoc = await db.collection('groups').doc('Tz0wgIHMTlhvTtFastiJ').get();
    const groupData = groupDoc.data();
    
    let frankPlayerId = null;
    for (const [playerId, player] of Object.entries(groupData.players)) {
      if (player.displayName === 'Frank') {
        frankPlayerId = playerId;
        break;
      }
    }
    
    if (!frankPlayerId) {
      console.log('❌ Frank nicht gefunden!');
      return;
    }
    
    console.log(`👤 Frank Player-ID: ${frankPlayerId}`);
    
    // Lade alle Sessions
    const sessionsSnap = await db.collection('jassGameSummaries')
      .where('groupId', '==', 'Tz0wgIHMTlhvTtFastiJ')
      .where('status', '==', 'completed')
      .get();
    
    console.log(`\n📊 Analysiere ${sessionsSnap.docs.length} Sessions...\n`);
    
    let totalKontermatschMade = 0;
    let totalKontermatschReceived = 0;
    
    for (const sessionDoc of sessionsSnap.docs) {
      const session = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      // Prüfe ob Frank in dieser Session war
      const participantPlayerIds = session.participantPlayerIds || [];
      if (!participantPlayerIds.includes(frankPlayerId)) {
        continue;
      }
      
      console.log(`\n🎮 Session ${sessionId} (${session.tournamentId ? 'TURNIER' : 'REGULAR'}):`);
      
      // Finde Frank's Team
      let frankTeam = null;
      if (session.teams?.top?.players.some(p => p.playerId === frankPlayerId)) {
        frankTeam = 'top';
      } else if (session.teams?.bottom?.players.some(p => p.playerId === frankPlayerId)) {
        frankTeam = 'bottom';
      }
      
      if (!frankTeam) {
        console.log('   ❌ Frank\'s Team nicht gefunden');
        continue;
      }
      
      const opponentTeam = frankTeam === 'top' ? 'bottom' : 'top';
      
      if (session.tournamentId) {
        // TURNIER: Verwende gameResults
        if (session.gameResults) {
          for (const [gameIndex, game] of session.gameResults.entries()) {
            // Finde Frank's Team in diesem Spiel
            let gameTeam = null;
            if (game.teams?.top?.players.some(p => p.playerId === frankPlayerId)) {
              gameTeam = 'top';
            } else if (game.teams?.bottom?.players.some(p => p.playerId === frankPlayerId)) {
              gameTeam = 'bottom';
            }
            
            if (gameTeam && game.finalStriche) {
              const frankStriche = game.finalStriche[gameTeam] || {};
              const opponentStriche = game.finalStriche[gameTeam === 'top' ? 'bottom' : 'top'] || {};
              
              const kontermatschMade = frankStriche.kontermatsch || 0;
              const kontermatschReceived = opponentStriche.kontermatsch || 0;
              
              if (kontermatschMade > 0 || kontermatschReceived > 0) {
                console.log(`   🎯 Spiel ${gameIndex + 1}: ${kontermatschMade} gemacht, ${kontermatschReceived} bekommen`);
                totalKontermatschMade += kontermatschMade;
                totalKontermatschReceived += kontermatschReceived;
              }
            }
          }
        }
      } else {
        // REGULAR SESSION: Verwende eventCounts
        if (session.eventCounts) {
          const frankEventCounts = session.eventCounts[frankTeam] || {};
          const opponentEventCounts = session.eventCounts[opponentTeam] || {};
          
          const kontermatschMade = frankEventCounts.kontermatsch || 0;
          const kontermatschReceived = opponentEventCounts.kontermatsch || 0;
          
          if (kontermatschMade > 0 || kontermatschReceived > 0) {
            console.log(`   🎯 Session: ${kontermatschMade} gemacht, ${kontermatschReceived} bekommen`);
            totalKontermatschMade += kontermatschMade;
            totalKontermatschReceived += kontermatschReceived;
          }
        }
      }
    }
    
    console.log(`\n📋 FRANK'S KONTERMATSCH-BILANZ:`);
    console.log(`   Gemacht: ${totalKontermatschMade}`);
    console.log(`   Bekommen: ${totalKontermatschReceived}`);
    console.log(`   Bilanz: ${totalKontermatschMade - totalKontermatschReceived}`);
    console.log(`\n✅ Erwartete Bilanz: 0 (1 gemacht, 1 bekommen)`);
    
    if (totalKontermatschMade !== 1 || totalKontermatschReceived !== 1) {
      console.log(`\n❌ FEHLER GEFUNDEN! Berechnung ist falsch.`);
    } else {
      console.log(`\n✅ Berechnung ist korrekt!`);
    }
    
  } catch (error) {
    console.error('❌ Fehler beim Debug:', error);
  }
}

debugFrankKontermatsch()
  .then(() => {
    console.log('\n🎯 Kontermatsch-Debug abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Script-Fehler:', error);
    process.exit(1);
  });
