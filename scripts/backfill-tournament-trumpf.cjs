const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '..', 'serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';

const DRY_RUN = false; // ✅ Auf false setzen zum Ausführen

async function backfillTournamentTrumpf() {
  console.log('\n🔄 BACKFILL: Trumpfansagen für Turnier korrigieren\n');
  console.log('='.repeat(120));
  console.log(`Turnier: ${TOURNAMENT_ID}`);
  console.log(`Gruppe: ${GROUP_ID}`);
  console.log(`Modus: ${DRY_RUN ? '🔍 DRY RUN (keine Änderungen)' : '✏️  LIVE (schreibt Daten)'}`);
  console.log('='.repeat(120));

  // 1. Lade Turnier-Dokument
  const tournamentRef = db.collection('tournaments').doc(TOURNAMENT_ID);
  const tournamentDoc = await tournamentRef.get();
  
  if (!tournamentDoc.exists) {
    console.error('❌ Turnier nicht gefunden!');
    return;
  }

  const tournamentData = tournamentDoc.data();
  const participantPlayerIds = tournamentData.participantPlayerIds || [];
  const playerNames = tournamentData.playerNames || {};
  
  console.log(`\n📋 Teilnehmer: ${participantPlayerIds.length}`);
  participantPlayerIds.forEach((pid, idx) => {
    console.log(`   ${idx + 1}. ${playerNames[pid] || pid} (${pid})`);
  });

  // 2. Lade jassGameSummary für das Turnier
  const summaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
  const summaryDoc = await summaryRef.get();
  
  if (!summaryDoc.exists) {
    console.error('❌ jassGameSummary nicht gefunden!');
    return;
  }

  const summaryData = summaryDoc.data();
  
  console.log(`\n✅ jassGameSummary geladen`);

  // 4. Initialisiere korrigierte Trumpf-Counts
  const correctedTrumpfCounts = {};
  participantPlayerIds.forEach(pid => {
    correctedTrumpfCounts[pid] = {};
  });

  // 5. Lade alle Spiele aus tournaments/{tournamentId}/games
  console.log('\n🔍 Lade Spiele aus tournaments/{tournamentId}/games...\n');
  
  const gamesRef = db.collection(`tournaments/${TOURNAMENT_ID}/games`);
  const gamesSnapshot = await gamesRef.get();
  
  console.log(`✅ Gefunden: ${gamesSnapshot.size} Spiele\n`);

  // 6. Analysiere jedes Spiel und zähle nur Trumpfansagen für Spieler, die im Spiel waren
  for (const gameDoc of gamesSnapshot.docs) {
    const gameData = gameDoc.data();
    const passeId = gameDoc.id;
    const passeLabel = gameData.passeLabel || `Passe ${passeId}`;
    const passeNumber = gameData.passeNumber || 0;
    
    // Finde Spieler in dieser Passe (aus participantPlayerIds dieser Passe)
    const passeParticipantPlayerIds = gameData.participantPlayerIds || [];
    const playersInThisPasse = new Set(passeParticipantPlayerIds);
    
    // Erstelle Player-Mapping für diese Passe (startingPlayer ist 1-basiert)
    const passePlayerNumberToIdMap = new Map();
    passeParticipantPlayerIds.forEach((pid, index) => {
      passePlayerNumberToIdMap.set(index + 1, pid);
    });
    
    // Finde Teams für diese Passe
    const topPlayerIds = gameData.teams?.top?.players?.map(p => p.playerId) || [];
    const bottomPlayerIds = gameData.teams?.bottom?.players?.map(p => p.playerId) || [];
    
    console.log(`\n📋 ${passeLabel} (Passe ${passeNumber}, ID: ${passeId}):`);
    console.log(`   Teilnehmer: ${passeParticipantPlayerIds.map(pid => playerNames[pid] || pid).join(', ')}`);
    console.log(`   Top: ${topPlayerIds.map(pid => playerNames[pid] || pid).join(', ')}`);
    console.log(`   Bottom: ${bottomPlayerIds.map(pid => playerNames[pid] || pid).join(', ')}`);

    const roundHistory = gameData.roundHistory || [];
    
    console.log(`   Runden: ${roundHistory.length}`);
    
    let trumpfCountInGame = 0;
    const trumpfByPlayerInGame = {};
    
    roundHistory.forEach((round, roundIndex) => {
      if (round.startingPlayer && round.farbe) {
        // ✅ WICHTIG: startingPlayer bezieht sich auf participantPlayerIds dieser Passe!
        const trumpfPlayerId = passePlayerNumberToIdMap.get(round.startingPlayer);
        
        if (trumpfPlayerId) {
          // ✅ KORRIGIERT: Nur zählen wenn Spieler in dieser Passe war!
          if (playersInThisPasse.has(trumpfPlayerId)) {
            const farbeKey = round.farbe.toLowerCase();
            correctedTrumpfCounts[trumpfPlayerId][farbeKey] = 
              (correctedTrumpfCounts[trumpfPlayerId][farbeKey] || 0) + 1;
            
            trumpfCountInGame++;
            trumpfByPlayerInGame[trumpfPlayerId] = (trumpfByPlayerInGame[trumpfPlayerId] || 0) + 1;
          } else {
            console.log(`     ⚠️  Runde ${roundIndex + 1}: ${playerNames[trumpfPlayerId] || trumpfPlayerId} hat ${round.farbe} angesagt, war aber nicht in dieser Passe! (Übersprungen)`);
          }
        } else {
          console.log(`     ⚠️  Runde ${roundIndex + 1}: startingPlayer ${round.startingPlayer} konnte nicht gemappt werden`);
        }
      }
    });
    
    console.log(`   ✅ Trumpfansagen in dieser Passe: ${trumpfCountInGame}`);
    if (Object.keys(trumpfByPlayerInGame).length > 0) {
      Object.entries(trumpfByPlayerInGame).forEach(([pid, count]) => {
        console.log(`      ${playerNames[pid] || pid}: ${count}`);
      });
    }
  }

  // 6. Vergleiche alte vs. neue Werte
  console.log('\n\n📊 VERGLEICH: Alt vs. Neu\n');
  console.log('='.repeat(120));
  
  const oldTrumpfCounts = summaryData.aggregatedTrumpfCountsByPlayer || {};
  const updates = [];
  
  for (const playerId of participantPlayerIds) {
    const playerName = playerNames[playerId] || playerId;
    const oldCounts = oldTrumpfCounts[playerId] || {};
    const newCounts = correctedTrumpfCounts[playerId] || {};
    
    const oldTotal = Object.values(oldCounts).reduce((sum, count) => sum + (count || 0), 0);
    const newTotal = Object.values(newCounts).reduce((sum, count) => sum + (count || 0), 0);
    
    if (oldTotal !== newTotal) {
      console.log(`\n👤 ${playerName} (${playerId}):`);
      console.log(`   ALT: ${oldTotal} Trumpfansagen`);
      Object.entries(oldCounts).forEach(([farbe, count]) => {
        console.log(`      ${farbe}: ${count}`);
      });
      console.log(`   NEU: ${newTotal} Trumpfansagen`);
      Object.entries(newCounts).forEach(([farbe, count]) => {
        console.log(`      ${farbe}: ${count}`);
      });
      console.log(`   📉 Differenz: ${oldTotal - newTotal} (${oldTotal > newTotal ? 'WENIGER' : 'MEHR'})`);
      
      updates.push({
        playerId,
        playerName,
        oldCounts,
        newCounts,
        oldTotal,
        newTotal
      });
    } else {
      console.log(`✅ ${playerName}: ${newTotal} Trumpfansagen (unverändert)`);
    }
  }

  if (updates.length === 0) {
    console.log('\n✅ Keine Korrekturen nötig - alle Trumpfansagen sind bereits korrekt!');
    return;
  }

  console.log(`\n\n📝 ZUSAMMENFASSUNG:`);
  console.log(`   ${updates.length} Spieler benötigen Korrekturen`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN - Keine Änderungen vorgenommen');
    console.log('   Setze DRY_RUN = false zum Ausführen');
    return;
  }

  // 7. Update jassGameSummary
  console.log('\n\n✏️  SCHREIBE KORREKTUREN...\n');
  
  const batch = db.batch();
  
  // Update jassGameSummary
  batch.update(summaryRef, {
    aggregatedTrumpfCountsByPlayer: correctedTrumpfCounts
  });
  
  console.log(`✅ jassGameSummary aktualisiert`);

  // 8. Update player globalStats.current für jeden betroffenen Spieler
  for (const update of updates) {
    const playerRef = db.collection('players').doc(update.playerId);
    const playerDoc = await playerRef.get();
    
    if (!playerDoc.exists) {
      console.log(`⚠️  Spieler ${update.playerName} nicht gefunden, überspringe...`);
      continue;
    }

    const playerData = playerDoc.data();
    const currentGlobalStats = playerData.globalStats?.current || {};
    
    // Berechne neue trumpfStatistik
    const oldTrumpfStatistik = currentGlobalStats.trumpfStatistik || {};
    const oldTotalTrumpfCount = currentGlobalStats.totalTrumpfCount || 0;
    
    // Entferne alte Turnier-Trumpfansagen
    const oldTurnierTrumpf = oldTrumpfCounts[update.playerId] || {};
    let correctedTrumpfStatistik = { ...oldTrumpfStatistik };
    let correctedTotalTrumpfCount = oldTotalTrumpfCount;
    
    Object.entries(oldTurnierTrumpf).forEach(([farbe, count]) => {
      const farbeKey = farbe.toLowerCase();
      correctedTrumpfStatistik[farbeKey] = (correctedTrumpfStatistik[farbeKey] || 0) - (count || 0);
      correctedTotalTrumpfCount -= (count || 0);
      if (correctedTrumpfStatistik[farbeKey] <= 0) {
        delete correctedTrumpfStatistik[farbeKey];
      }
    });
    
    // Füge neue Turnier-Trumpfansagen hinzu
    Object.entries(update.newCounts).forEach(([farbe, count]) => {
      const farbeKey = farbe.toLowerCase();
      correctedTrumpfStatistik[farbeKey] = (correctedTrumpfStatistik[farbeKey] || 0) + (count || 0);
      correctedTotalTrumpfCount += (count || 0);
    });
    
    // Entferne leere Einträge
    Object.keys(correctedTrumpfStatistik).forEach(key => {
      if (correctedTrumpfStatistik[key] <= 0) {
        delete correctedTrumpfStatistik[key];
      }
    });
    
    // Update player document
    batch.update(playerRef, {
      'globalStats.current.trumpfStatistik': correctedTrumpfStatistik,
      'globalStats.current.totalTrumpfCount': correctedTotalTrumpfCount
    });
    
    console.log(`✅ ${update.playerName}: ${update.oldTotal} → ${update.newTotal} Trumpfansagen`);
  }

  // 9. Commit
  console.log('\n💾 Committe Änderungen...');
  await batch.commit();
  console.log('✅ Backfill abgeschlossen!');
}

backfillTournamentTrumpf()
  .then(() => {
    console.log('\n✅ Script beendet');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });

