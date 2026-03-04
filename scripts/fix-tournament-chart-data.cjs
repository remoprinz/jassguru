/**
 * FIX TOURNAMENT CHART DATA (16.01.2026)
 * 
 * Dieses Script repariert:
 * 1. Das jassGameSummary für das Turnier (fügt fehlende Root-Level Felder hinzu)
 * 2. Die scoresHistory-Einträge für alle Teilnehmer (korrigiert 0-Werte)
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

// DRY RUN: Auf true setzen für Simulation, auf false für echte Änderungen
const DRY_RUN = false;

async function fix() {
  console.log('🔧 FIX TOURNAMENT CHART DATA\n');
  console.log(`   Group: ${GROUP_ID}`);
  console.log(`   Tournament: ${TOURNAMENT_ID}`);
  console.log(`   DRY_RUN: ${DRY_RUN}\n`);
  
  // 1. Lade jassGameSummary
  const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
  const summaryDoc = await summaryRef.get();
  
  if (!summaryDoc.exists) {
    console.log('❌ jassGameSummary nicht gefunden!');
    return;
  }
  
  const data = summaryDoc.data();
  const participantPlayerIds = data.participantPlayerIds || [];
  const gameResults = data.gameResults || [];
  
  console.log(`📊 Tournament hat ${participantPlayerIds.length} Teilnehmer und ${gameResults.length} Games\n`);
  
  // 2. Berechne aggregierte Felder
  console.log('📊 Berechne aggregierte Felder...\n');
  
  // finalScores
  const aggregatedFinalScores = { top: 0, bottom: 0 };
  gameResults.forEach(game => {
    aggregatedFinalScores.top += game.topScore || 0;
    aggregatedFinalScores.bottom += game.bottomScore || 0;
  });
  console.log(`   finalScores: top=${aggregatedFinalScores.top}, bottom=${aggregatedFinalScores.bottom}`);
  
  // finalStriche
  const aggregatedFinalStriche = {
    top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
    bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
  };
  gameResults.forEach(game => {
    if (game.finalStriche?.top) {
      aggregatedFinalStriche.top.berg += game.finalStriche.top.berg || 0;
      aggregatedFinalStriche.top.sieg += game.finalStriche.top.sieg || 0;
      aggregatedFinalStriche.top.matsch += game.finalStriche.top.matsch || 0;
      aggregatedFinalStriche.top.schneider += game.finalStriche.top.schneider || 0;
      aggregatedFinalStriche.top.kontermatsch += game.finalStriche.top.kontermatsch || 0;
    }
    if (game.finalStriche?.bottom) {
      aggregatedFinalStriche.bottom.berg += game.finalStriche.bottom.berg || 0;
      aggregatedFinalStriche.bottom.sieg += game.finalStriche.bottom.sieg || 0;
      aggregatedFinalStriche.bottom.matsch += game.finalStriche.bottom.matsch || 0;
      aggregatedFinalStriche.bottom.schneider += game.finalStriche.bottom.schneider || 0;
      aggregatedFinalStriche.bottom.kontermatsch += game.finalStriche.bottom.kontermatsch || 0;
    }
  });
  console.log(`   finalStriche.top: ${JSON.stringify(aggregatedFinalStriche.top)}`);
  console.log(`   finalStriche.bottom: ${JSON.stringify(aggregatedFinalStriche.bottom)}`);
  
  // eventCounts
  const aggregatedEventCounts = {
    top: { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 },
    bottom: { sieg: 0, berg: 0, matsch: 0, kontermatsch: 0, schneider: 0 }
  };
  gameResults.forEach(game => {
    if (game.eventCounts?.top) {
      aggregatedEventCounts.top.sieg += game.eventCounts.top.sieg || 0;
      aggregatedEventCounts.top.berg += game.eventCounts.top.berg || 0;
      aggregatedEventCounts.top.matsch += game.eventCounts.top.matsch || 0;
      aggregatedEventCounts.top.kontermatsch += game.eventCounts.top.kontermatsch || 0;
      aggregatedEventCounts.top.schneider += game.eventCounts.top.schneider || 0;
    }
    if (game.eventCounts?.bottom) {
      aggregatedEventCounts.bottom.sieg += game.eventCounts.bottom.sieg || 0;
      aggregatedEventCounts.bottom.berg += game.eventCounts.bottom.berg || 0;
      aggregatedEventCounts.bottom.matsch += game.eventCounts.bottom.matsch || 0;
      aggregatedEventCounts.bottom.kontermatsch += game.eventCounts.bottom.kontermatsch || 0;
      aggregatedEventCounts.bottom.schneider += game.eventCounts.bottom.schneider || 0;
    }
  });
  console.log(`   eventCounts.top: ${JSON.stringify(aggregatedEventCounts.top)}`);
  console.log(`   eventCounts.bottom: ${JSON.stringify(aggregatedEventCounts.bottom)}`);
  
  // 3. Update jassGameSummary
  console.log('\n📝 Update jassGameSummary...');
  if (!DRY_RUN) {
    await summaryRef.update({
      finalScores: aggregatedFinalScores,
      finalStriche: aggregatedFinalStriche,
      eventCounts: aggregatedEventCounts
    });
    console.log('   ✅ jassGameSummary aktualisiert');
  } else {
    console.log('   [DRY RUN] Würde jassGameSummary aktualisieren');
  }
  
  // 4. Korrigiere scoresHistory für jeden Spieler
  console.log('\n📝 Korrigiere scoresHistory für alle Spieler...\n');
  
  let fixedCount = 0;
  
  for (const playerId of participantPlayerIds) {
    // Finde den scoresHistory-Eintrag für dieses Turnier
    const scoresHistorySnap = await db.collection(`players/${playerId}/scoresHistory`)
      .where('sessionId', '==', TOURNAMENT_ID)
      .limit(1)
      .get();
    
    if (scoresHistorySnap.empty) {
      console.log(`   ⚠️ ${playerId.substring(0, 12)}...: Kein scoresHistory-Eintrag gefunden`);
      continue;
    }
    
    const entryDoc = scoresHistorySnap.docs[0];
    const entryData = entryDoc.data();
    
    // Berechne korrekte Werte aus Tournament-Daten
    const playerPoints = data.totalPointsByPlayer?.[playerId] || 0;
    const playerStriche = data.totalStricheByPlayer?.[playerId];
    const playerEvents = data.totalEventCountsByPlayer?.[playerId];
    const playerWins = data.gameWinsByPlayer?.[playerId];
    
    // Berechne Gegner-Punkte
    let opponentPointsTotal = 0;
    let playerStricheTotal = 0;
    let opponentStricheTotal = 0;
    
    gameResults.forEach(game => {
      const playerInTop = game.teams?.top?.players?.some(p => p.playerId === playerId);
      const playerInBottom = game.teams?.bottom?.players?.some(p => p.playerId === playerId);
      
      if (playerInTop) {
        opponentPointsTotal += game.bottomScore || 0;
        if (game.finalStriche?.top) {
          playerStricheTotal += sumStriche(game.finalStriche.top);
        }
        if (game.finalStriche?.bottom) {
          opponentStricheTotal += sumStriche(game.finalStriche.bottom);
        }
      } else if (playerInBottom) {
        opponentPointsTotal += game.topScore || 0;
        if (game.finalStriche?.bottom) {
          playerStricheTotal += sumStriche(game.finalStriche.bottom);
        }
        if (game.finalStriche?.top) {
          opponentStricheTotal += sumStriche(game.finalStriche.top);
        }
      }
    });
    
    const correctedData = {
      stricheDiff: playerStricheTotal - opponentStricheTotal,
      pointsDiff: playerPoints - opponentPointsTotal,
      matschBilanz: (playerEvents?.matschMade || 0) - (playerEvents?.matschReceived || 0),
      schneiderBilanz: (playerEvents?.schneiderMade || 0) - (playerEvents?.schneiderReceived || 0),
      kontermatschBilanz: (playerEvents?.kontermatschMade || 0) - (playerEvents?.kontermatschReceived || 0),
      wins: playerWins?.wins || 0,
      losses: playerWins?.losses || 0,
      gameNumber: gameResults.length
    };
    
    // Vergleiche mit aktuellen Werten
    const needsUpdate = 
      entryData.stricheDiff !== correctedData.stricheDiff ||
      entryData.pointsDiff !== correctedData.pointsDiff ||
      entryData.matschBilanz !== correctedData.matschBilanz;
    
    if (needsUpdate) {
      console.log(`   🔧 ${playerId.substring(0, 12)}...:`);
      console.log(`      Vorher:  stricheDiff=${entryData.stricheDiff}, pointsDiff=${entryData.pointsDiff}, matschBilanz=${entryData.matschBilanz}`);
      console.log(`      Nachher: stricheDiff=${correctedData.stricheDiff}, pointsDiff=${correctedData.pointsDiff}, matschBilanz=${correctedData.matschBilanz}`);
      
      if (!DRY_RUN) {
        await entryDoc.ref.update(correctedData);
        console.log(`      ✅ Korrigiert`);
      } else {
        console.log(`      [DRY RUN] Würde korrigieren`);
      }
      fixedCount++;
    } else {
      console.log(`   ✅ ${playerId.substring(0, 12)}...: Bereits korrekt`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 ZUSAMMENFASSUNG:');
  console.log('='.repeat(70));
  console.log(`   jassGameSummary aktualisiert: ✅`);
  console.log(`   scoresHistory korrigiert: ${fixedCount} von ${participantPlayerIds.length} Spielern`);
  
  if (DRY_RUN) {
    console.log('\n   ⚠️ DRY RUN - Keine echten Änderungen durchgeführt!');
    console.log('   Setze DRY_RUN = false für echte Änderungen.');
  }
}

function sumStriche(stricheRecord) {
  if (!stricheRecord) return 0;
  return (
    (stricheRecord.berg || 0) +
    (stricheRecord.sieg || 0) +
    (stricheRecord.matsch || 0) +
    (stricheRecord.schneider || 0) +
    (stricheRecord.kontermatsch || 0)
  );
}

fix()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
