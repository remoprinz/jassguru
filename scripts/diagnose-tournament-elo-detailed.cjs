/**
 * Detaillierte Analyse der Elo-Berechnungen für ein Turnier
 * 
 * Untersucht:
 * - Alle Spiele (Passen) und deren Ergebnisse
 * - Die Elo-Änderungen pro Passe
 * - Die ratingHistory Einträge für jeden Spieler
 * - Ob Gewinner tatsächlich Punkte gewinnen
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

// Player ID zu Name Mapping (wird dynamisch gefüllt)
const playerNames = new Map();

async function loadPlayerNames(playerIds) {
  for (const playerId of playerIds) {
    try {
      const playerDoc = await db.collection('players').doc(playerId).get();
      if (playerDoc.exists) {
        playerNames.set(playerId, playerDoc.data().displayName || playerId.substring(0, 8));
      } else {
        playerNames.set(playerId, playerId.substring(0, 8));
      }
    } catch (e) {
      playerNames.set(playerId, playerId.substring(0, 8));
    }
  }
}

function getName(playerId) {
  return playerNames.get(playerId) || playerId.substring(0, 8);
}

async function analyzeTournament() {
  console.log('🔍 DETAILLIERTE TURNIER-ANALYSE\n');
  console.log('='.repeat(80));
  
  // 1. Lade Turnier-Daten
  const tournamentRef = db.collection('tournaments').doc(TOURNAMENT_ID);
  const tournamentDoc = await tournamentRef.get();
  
  if (!tournamentDoc.exists) {
    console.log('❌ Turnier nicht gefunden!');
    return;
  }
  
  const tournament = tournamentDoc.data();
  console.log(`\n📦 TURNIER: ${tournament.name}`);
  console.log(`   Gruppe: ${tournament.groupId}`);
  console.log(`   Status: ${tournament.status}`);
  console.log(`   Abgeschlossene Passen: ${tournament.completedPasseCount}`);
  
  // Lade Player Names
  const participantPlayerIds = tournament.participantPlayerIds || [];
  await loadPlayerNames(participantPlayerIds);
  
  console.log(`   Teilnehmer: ${participantPlayerIds.map(id => getName(id)).join(', ')}`);
  
  // 2. Lade alle Spiele (Passen)
  const gamesSnap = await tournamentRef.collection('games').orderBy('startedAt', 'asc').get();
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 SPIELE (${gamesSnap.size} Passen)`);
  console.log('='.repeat(80));
  
  const gameResults = [];
  
  for (const gameDoc of gamesSnap.docs) {
    const game = gameDoc.data();
    const gameId = gameDoc.id;
    
    console.log(`\n📋 PASSE ${game.passeNumber || '?'} (${gameId})`);
    console.log(`   Status: ${game.status}`);
    console.log(`   Gestartet: ${game.startedAt?.toDate?.() || 'N/A'}`);
    console.log(`   Beendet: ${game.completedAt?.toDate?.() || 'N/A'}`);
    
    // Team-Zusammensetzung
    const players = game.players || {};
    const team1 = [players['1'], players['3']].filter(Boolean);
    const team2 = [players['2'], players['4']].filter(Boolean);
    
    console.log(`\n   Team Oben (1+3): ${team1.map(p => p.name || p.uid?.substring(0,8)).join(' & ')}`);
    console.log(`   Team Unten (2+4): ${team2.map(p => p.name || p.uid?.substring(0,8)).join(' & ')}`);
    
    // Ergebnisse
    const scores = game.scores || game.currentScores || {};
    const scoreTop = scores.top || scores['1'] || 0;
    const scoreBottom = scores.bottom || scores['2'] || 0;
    
    const strokes = game.strokes || game.currentStrokes || {};
    const strokesTop = strokes.top || strokes['1'] || 0;
    const strokesBottom = strokes.bottom || strokes['2'] || 0;
    
    console.log(`\n   📊 ERGEBNIS:`);
    console.log(`   Punkte: Team Oben ${scoreTop} - ${scoreBottom} Team Unten`);
    console.log(`   Striche: Team Oben ${strokesTop} - ${strokesBottom} Team Unten`);
    
    // Gewinner bestimmen
    let winner = 'tie';
    if (strokesTop > strokesBottom) {
      winner = 'top';
      console.log(`   🏆 GEWINNER: Team Oben (${team1.map(p => p.name).join(' & ')})`);
    } else if (strokesBottom > strokesTop) {
      winner = 'bottom';
      console.log(`   🏆 GEWINNER: Team Unten (${team2.map(p => p.name).join(' & ')})`);
    } else {
      console.log(`   🤝 UNENTSCHIEDEN`);
    }
    
    // Speichere für spätere Analyse
    gameResults.push({
      gameId,
      passeNumber: game.passeNumber,
      team1: team1.map(p => ({ name: p.name, playerId: p.playerId, uid: p.uid })),
      team2: team2.map(p => ({ name: p.name, playerId: p.playerId, uid: p.uid })),
      strokesTop,
      strokesBottom,
      scoreTop,
      scoreBottom,
      winner,
      status: game.status
    });
    
    // Elo-Updates für dieses Spiel (falls vorhanden)
    const eloUpdates = game.eloUpdates || game.ratingUpdates || {};
    if (Object.keys(eloUpdates).length > 0) {
      console.log(`\n   📈 ELO-UPDATES in diesem Spiel:`);
      for (const [playerId, update] of Object.entries(eloUpdates)) {
        const u = update;
        console.log(`      ${getName(playerId)}: ${u.previousRating?.toFixed(2) || '?'} → ${u.newRating?.toFixed(2) || '?'} (Δ ${u.delta?.toFixed(2) || u.ratingDelta?.toFixed(2) || '?'})`);
      }
    }
  }
  
  // 3. Analysiere playerRankings
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🏅 PLAYER RANKINGS`);
  console.log('='.repeat(80));
  
  const rankingsSnap = await tournamentRef.collection('playerRankings').get();
  
  for (const rankingDoc of rankingsSnap.docs) {
    const playerId = rankingDoc.id;
    const ranking = rankingDoc.data();
    
    console.log(`\n👤 ${getName(playerId)} (${playerId})`);
    console.log(`   Rang: ${ranking.rank || 'N/A'}`);
    console.log(`   Gesamt-Striche: ${ranking.totalStriche || 0}`);
    console.log(`   Spiele gespielt: ${ranking.gamesPlayed || 0}`);
    console.log(`   Gewonnen: ${ranking.gamesWon || 0}`);
    console.log(`   Verloren: ${ranking.gamesLost || 0}`);
    
    // Round Results
    const roundResults = ranking.roundResults || [];
    if (roundResults.length > 0) {
      console.log(`\n   📊 Round Results (${roundResults.length}):`);
      roundResults.forEach((rr, i) => {
        if (rr.participated) {
          const won = rr.won ? '✅ Gewonnen' : (rr.lost ? '❌ Verloren' : '🤝 Unent.');
          const eloStr = rr.eloRating ? `Elo: ${rr.eloRating.toFixed(2)}` : '';
          console.log(`      Passe ${rr.passeNumber || i+1}: ${won} | Striche: ${rr.strokes || 0} | ${eloStr}`);
        }
      });
    }
  }
  
  // 4. Analysiere ratingHistory für jeden Spieler
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📈 RATING HISTORY (pro Spieler)`);
  console.log('='.repeat(80));
  
  for (const playerId of participantPlayerIds) {
    console.log(`\n👤 ${getName(playerId)} (${playerId})`);
    
    try {
      const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
        .where('tournamentId', '==', TOURNAMENT_ID)
        .orderBy('passeNumber', 'asc')
        .get();
      
      if (historySnap.empty) {
        console.log(`   ⚠️ Keine ratingHistory für dieses Turnier`);
        continue;
      }
      
      console.log(`   📊 ${historySnap.size} Einträge:`);
      
      let totalDelta = 0;
      
      historySnap.docs.forEach((hDoc, i) => {
        const h = hDoc.data();
        const delta = typeof h.delta === 'number' ? h.delta : 0;
        totalDelta += delta;
        
        const won = h.won ? '✅' : '❌';
        const deltaStr = delta >= 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2);
        
        console.log(`      Passe ${h.passeNumber || i+1}: ${won} | Rating: ${h.rating?.toFixed(2) || '?'} | Delta: ${deltaStr}`);
        
        // Details
        if (h.partner) console.log(`         Partner: ${getName(h.partner)}`);
        if (h.opponents) console.log(`         Gegner: ${h.opponents.map(o => getName(o)).join(', ')}`);
        if (h.teamStrokes !== undefined) console.log(`         Team-Striche: ${h.teamStrokes}`);
        if (h.opponentStrokes !== undefined) console.log(`         Gegner-Striche: ${h.opponentStrokes}`);
      });
      
      console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`   GESAMT-DELTA: ${totalDelta >= 0 ? '+' : ''}${totalDelta.toFixed(2)}`);
      
    } catch (e) {
      console.log(`   ❌ Fehler: ${e.message}`);
    }
  }
  
  // 5. Zusammenfassung: Wer hat gewonnen vs Elo-Änderung
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 ZUSAMMENFASSUNG: SIEGE vs ELO-ÄNDERUNG`);
  console.log('='.repeat(80));
  
  // Hole jassGameSummary für finale Ratings
  const summaryDoc = await db.collection(`groups/${tournament.groupId}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const summary = summaryDoc.data() || {};
  const playerFinalRatings = summary.playerFinalRatings || {};
  
  console.log('\nSpieler | Siege | Niederlagen | Striche-Diff | Elo-Delta');
  console.log('-'.repeat(70));
  
  for (const playerId of participantPlayerIds) {
    const rankingDoc = await tournamentRef.collection('playerRankings').doc(playerId).get();
    const ranking = rankingDoc.data() || {};
    
    const finalRating = playerFinalRatings[playerId] || {};
    let eloDelta = finalRating.ratingDelta;
    
    // Falls noch String, parsen
    if (typeof eloDelta === 'string') {
      eloDelta = parseFloat(eloDelta);
    }
    
    const stricheDiff = (ranking.totalStriche || 0);
    const gamesWon = ranking.gamesWon || 0;
    const gamesLost = ranking.gamesLost || 0;
    
    const deltaStr = typeof eloDelta === 'number' && !isNaN(eloDelta) 
      ? (eloDelta >= 0 ? `+${eloDelta.toFixed(2)}` : eloDelta.toFixed(2))
      : 'N/A';
    
    const name = getName(playerId).padEnd(15);
    console.log(`${name} | ${gamesWon}     | ${gamesLost}           | ${stricheDiff >= 0 ? '+' : ''}${stricheDiff}           | ${deltaStr}`);
    
    // Warnung bei Inkonsistenz
    if (gamesWon > gamesLost && typeof eloDelta === 'number' && eloDelta < 0) {
      console.log(`   ⚠️  INKONSISTENT: Mehr Siege als Niederlagen, aber Elo sinkt!`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Analyse abgeschlossen');
}

analyzeTournament()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
