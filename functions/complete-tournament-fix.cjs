const admin = require('firebase-admin');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert('./serviceAccountKey.json'),
  });
}

const db = admin.firestore();

// Hilfsfunktion zur Umwandlung von authUid in playerDocId
async function getPlayerDocId(authUid) {
  // Zuerst im User-Dokument nachsehen
  const userRef = db.collection('users').doc(authUid);
  const userSnap = await userRef.get();
  if (userSnap.exists && userSnap.data()?.playerId) {
    return userSnap.data().playerId;
  }
  
  // Fallback: Direkte Abfrage der players-Collection
  const playerQuery = db.collection('players').where('userId', '==', authUid).limit(1);
  const playerSnap = await playerQuery.get();
  if (!playerSnap.empty) {
    return playerSnap.docs[0].id;
  }

  console.warn(`Could not find player document ID for authUid: ${authUid}. Returning authUid as fallback.`);
  return authUid;
}

// ✅ NEUE FUNKTION: Berechne eventCounts basierend auf Tournament-Settings
function calculateEventCountsForGame(game, tournamentSettings) {
  const eventCounts = {
    top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
    bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
  };

  const scoreEnabled = tournamentSettings?.scoreSettings?.enabled || {};
  const strokeSettings = tournamentSettings?.strokeSettings || {};

  for (const team of ['top', 'bottom']) {
    const teamStriche = game.teamStrichePasse?.[team] || {};
    
    // Berg: Immer 1 Event wenn enabled
    if (scoreEnabled.berg && teamStriche.berg > 0) {
      eventCounts[team].berg = teamStriche.berg; // Normalerweise 1
    }
    
    // Sieg: Immer 1 Event pro Sieg (Sieg = 2 Striche, aber 1 Event)
    if (teamStriche.sieg > 0) {
      eventCounts[team].sieg = teamStriche.sieg / 2; // 2 Striche = 1 Event
    }
    
    // Matsch: Immer 1 Event pro Matsch
    if (teamStriche.matsch > 0) {
      eventCounts[team].matsch = teamStriche.matsch;
    }
    
    // Schneider: Basierend auf Tournament-Settings (0, 1 oder 2 Events)
    if (scoreEnabled.schneider && teamStriche.schneider > 0) {
      const schneiderEventValue = strokeSettings.schneider || 1; // Default 1
      eventCounts[team].schneider = teamStriche.schneider * schneiderEventValue;
    }
    
    // Kontermatsch: Basierend auf Tournament-Settings (0, 1 oder 2 Events)
    if (teamStriche.kontermatsch > 0) {
      const kontermatchEventValue = strokeSettings.kontermatsch || 1; // Default 1
      eventCounts[team].kontermatsch = teamStriche.kontermatsch * kontermatchEventValue;
    }
  }

  return eventCounts;
}

async function completeTournamentFix() {
  console.log('🚀 [COMPLETE] Starte vollständige Tournament-Aggregation mit eventCounts...');
  
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  
  try {
    // 1. Lösche alte Tournament-Sessions
    console.log('\n🗑️ [CLEANUP] Lösche alte Tournament-Sessions...');
    const oldSessionsSnap = await db.collection('jassGameSummaries')
      .where('tournamentId', '==', tournamentId)
      .get();
    
    for (const doc of oldSessionsSnap.docs) {
      console.log(`  - Lösche altes Dokument: ${doc.id}`);
      await doc.ref.delete();
    }
    
    // 2. Lade Tournament-Daten UND Settings
    console.log('\n🏆 [LOAD] Lade Tournament-Daten und Settings...');
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();
    
    if (!tournamentSnap.exists) {
      console.log('❌ Tournament nicht gefunden!');
      return;
    }
    
    const tournamentData = tournamentSnap.data();
    console.log(`  - Name: ${tournamentData.name}`);
    console.log(`  - GroupId: ${tournamentData.groupId}`);
    console.log(`  - Settings: ${JSON.stringify(tournamentData.settings)}`);
    
    // 3. Lade Tournament-Spiele
    console.log('\n🎮 [GAMES] Lade Tournament-Spiele...');
    const gamesSnapshot = await db.collection('tournaments').doc(tournamentId).collection('games').get();
    
    if (gamesSnapshot.empty) {
      console.log('❌ Keine Spiele im Tournament gefunden!');
      return;
    }
    
    console.log(`  - Gefunden: ${gamesSnapshot.docs.length} Spiele`);
    
    const games = gamesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Nach completedAt sortieren
    games.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    
    // 4. Erstelle VOLLSTÄNDIGE Tournament-Summary mit eventCounts
    console.log('\n📝 [CREATE] Erstelle vollständige Tournament-Summary...');
    
    const completeSummary = {
      // ✅ WICHTIGE TOURNAMENT-FELDER
      gameResults: [],
      participantPlayerIds: [],
      gamesPlayed: games.length,
      durationSeconds: 0,
      createdAt: tournamentData.createdAt,
      startedAt: games[0].completedAt,
      endedAt: games[games.length - 1].completedAt,
      status: 'completed',
      groupId: tournamentData.groupId,
      tournamentId: tournamentId,
      
      // ✅ NEU: eventCounts basierend auf Tournament-Settings
      eventCounts: {
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
      }
    };
    
    let totalDurationMillis = 0;
    const allPlayerIds = new Set();
    
    // 5. Verarbeite jedes Spiel (gameResults + eventCounts)
    console.log('\n⚡ [PROCESS] Verarbeite Spiele für gameResults und eventCounts...');
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      console.log(`  - Spiel ${i + 1}: ${game.teamScoresPasse?.top || 0} : ${game.teamScoresPasse?.bottom || 0}`);
      
      totalDurationMillis += game.durationMillis || 0;
      
      // Winner bestimmen
      let winnerTeam = 'tie';
      if (game.teamScoresPasse?.top > game.teamScoresPasse?.bottom) {
        winnerTeam = 'top';
      } else if (game.teamScoresPasse?.bottom > game.teamScoresPasse?.top) {
        winnerTeam = 'bottom';
      }
      
      // Teams für dieses Spiel
      const topPlayers = [];
      const bottomPlayers = [];
      
      for (const player of game.playerDetails || []) {
        const playerDocId = await getPlayerDocId(player.playerId);
        allPlayerIds.add(playerDocId);
        
        const playerInfo = {
          playerId: playerDocId,
          displayName: player.playerName
        };
        
        if (player.team === 'top') {
          topPlayers.push(playerInfo);
        } else {
          bottomPlayers.push(playerInfo);
        }
      }
      
      // ✅ gameResults befüllen
      completeSummary.gameResults.push({
        gameNumber: i + 1,
        topScore: game.teamScoresPasse?.top || 0,
        bottomScore: game.teamScoresPasse?.bottom || 0,
        winnerTeam: winnerTeam,
        teams: {
          top: { players: topPlayers },
          bottom: { players: bottomPlayers }
        },
        finalStriche: game.teamStrichePasse || { top: {}, bottom: {} },
        durationSeconds: Math.round((game.durationMillis || 0) / 1000),
        completedAt: game.completedAt,
      });
      
      // ✅ NEU: eventCounts für dieses Spiel berechnen und aggregieren
      const gameEventCounts = calculateEventCountsForGame(game, tournamentData.settings);
      
      for (const team of ['top', 'bottom']) {
        for (const eventType of ['berg', 'sieg', 'matsch', 'schneider', 'kontermatsch']) {
          completeSummary.eventCounts[team][eventType] += gameEventCounts[team][eventType];
        }
      }
      
      console.log(`    - Events Top: ${JSON.stringify(gameEventCounts.top)}`);
      console.log(`    - Events Bottom: ${JSON.stringify(gameEventCounts.bottom)}`);
    }
    
    // 6. Finalisiere Summary
    completeSummary.participantPlayerIds = Array.from(allPlayerIds);
    completeSummary.durationSeconds = Math.round(totalDurationMillis / 1000);
    
    // 7. Speichere die VOLLSTÄNDIGE Tournament-Summary
    console.log('\n💾 [SAVE] Speichere vollständige Tournament-Summary...');
    const newDocRef = await db.collection('jassGameSummaries').add(completeSummary);
    
    console.log(`✅ SUCCESS: Vollständige Tournament-Summary erstellt: ${newDocRef.id}`);
    console.log(`\n📊 [STRUCTURE] Vollständige Struktur:`);
    console.log(`  ✅ gameResults: ${completeSummary.gameResults.length} Spiele`);
    console.log(`  ✅ participantPlayerIds: ${completeSummary.participantPlayerIds.length} Spieler`);
    console.log(`  ✅ gamesPlayed: ${completeSummary.gamesPlayed}`);
    console.log(`  ✅ durationSeconds: ${completeSummary.durationSeconds}`);
    console.log(`  ✅ tournamentId: ${completeSummary.tournamentId}`);
    console.log(`  ✅ eventCounts: ${JSON.stringify(completeSummary.eventCounts)}`);
    
    // 8. Triggere Player Stats Update
    console.log('\n🔄 [STATS] Triggere Player Stats Update...');
    const { updatePlayerStats } = require('./lib/playerStatsCalculator');
    
    for (const playerId of completeSummary.participantPlayerIds) {
      try {
        await updatePlayerStats(playerId);
        console.log(`  ✅ Stats updated for player: ${playerId}`);
      } catch (error) {
        console.log(`  ❌ Stats update failed for player ${playerId}:`, error.message);
      }
    }
    
    console.log('\n🎯 [RESULT] Tournament-Summary ist jetzt VOLLSTÄNDIG:');
    console.log(`  - Korrekte eventCounts basierend auf Tournament-Settings`);
    console.log(`  - Berücksichtigt Schneider/Kontermatsch Event-Werte`);
    console.log(`  - Saubere gameResults-Struktur`);
    console.log(`  - Konsistent mit Regular Sessions`);
    
  } catch (error) {
    console.error('❌ Fehler bei vollständiger Tournament-Aggregation:', error);
  }
}

completeTournamentFix().then(() => {
  console.log('\n🏁 Vollständige Tournament-Aggregation abgeschlossen.');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fataler Fehler:', error);
  process.exit(1);
}); 