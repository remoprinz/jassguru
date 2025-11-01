#!/usr/bin/env node

/**
 * 🔄 BACKFILL ELO RATINGS V2 - VOLLSTÄNDIG
 * 
 * Berechnet alle historischen Elo-Ratings neu mit K=32 und schreibt:
 * 1. players/{id}: globalRating, totalGamesPlayed, lastSessionDelta, lastGlobalRatingUpdate
 * 2. jassGameSummaries/{id}: playerFinalRatings (mit displayName)
 * 3. players/{id}/ratingHistory: NUR game Events (keine session_end Events!)
 * 4. groups/{id}/aggregated/chartData_elo: Chart-Daten (für ALLE betroffenen Gruppen)
 * 
 * ✅ Alle Sessions werden chronologisch neu berechnet (Elo baut sequenziell auf)
 * ✅ Alte ratingHistory Einträge werden gelöscht und neu geschrieben
 * ✅ session_end Events werden NICHT mehr erstellt (Frontend nutzt nur game Events)
 * 
 * Usage: node backfill-elo-v2.cjs [--dry-run] [--group GROUP_ID] [--limit N]
 * 
 * Options:
 *   --dry-run: Nur berechnen, nicht speichern (Standard)
 *   --execute: Änderungen in Datenbank schreiben
 *   --group: Nur diese Gruppe verarbeiten
 *   --limit: Maximal N Sessions verarbeiten (für Testing)
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Firebase Admin initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// ============================================
// ELO-KONFIGURATION (synchron mit jassEloUpdater.ts)
// ============================================
const JASS_ELO_CONFIG = {
  K_TARGET: 32,
  DEFAULT_RATING: 100,
  ELO_SCALE: 1000,
};

// ============================================
// ELO-FUNKTIONEN (synchron mit jassEloUpdater.ts)
// ============================================
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

function stricheScore(stricheA, stricheB, expectedScoreValue) {
  const totalStriche = stricheA + stricheB;
  
  if (totalStriche === 0) return 0.5;
  
  const expectedDiff = (2 * expectedScoreValue - 1) * totalStriche;
  const actualDiff = stricheA - stricheB;
  const deviation = actualDiff - expectedDiff;
  const maxDiff = 7;
  const normalizedDeviation = deviation / (2 * maxDiff);
  const score = 0.5 + normalizedDeviation;
  
  return Math.max(0, Math.min(1, score));
}

function sumStriche(rec) {
  if (!rec) return 0;
  return (rec.berg || 0) + (rec.sieg || 0) + (rec.matsch || 0) + (rec.schneider || 0) + (rec.kontermatsch || 0);
}

// ============================================
// COMMAND-LINE ARGS
// ============================================
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const GROUP_ID_FILTER = args.find(arg => arg.startsWith('--group='))?.split('=')[1];
const LIMIT = parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '0') || Infinity;

if (DRY_RUN) {
  console.log('🔍 DRY-RUN MODUS: Berechnungen werden nicht gespeichert\n');
} else {
  console.log('⚠️  EXECUTE MODUS: Änderungen werden in die Datenbank geschrieben!\n');
}

// ============================================
// MAIN BACKFILL LOGIC
// ============================================
async function backfillElo() {
  console.log('🔄 BACKFILL ELO RATINGS V2 (VOLLSTÄNDIG)');
  console.log('═══════════════════════════════════════');
  console.log(`Modus: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`K-Factor: ${JASS_ELO_CONFIG.K_TARGET}`);
  if (GROUP_ID_FILTER) {
    console.log(`Gruppe: ${GROUP_ID_FILTER}`);
  }
  if (LIMIT !== Infinity) {
    console.log(`Limit: ${LIMIT} Sessions`);
  }
  console.log('═══════════════════════════════════════\n');

  // 1. Alle Gruppen auflisten
  console.log('📋 1. Lade Gruppen...');
  const groupsSnapshot = await db.collection('groups').get();
  const groups = GROUP_ID_FILTER 
    ? groupsSnapshot.docs.filter(doc => doc.id === GROUP_ID_FILTER)
    : groupsSnapshot.docs;
  
  console.log(`   ✅ ${groups.length} Gruppe(n) gefunden`);

  // 2. Sammle ALLE Sessions aus allen Gruppen (chronologisch sortiert)
  console.log('\n📋 2. Sammle alle Sessions (chronologisch)...');
  const allSessions = [];
  
  // ✅ HARDCODED: Korrekte Reihenfolge für Gruppe Tz0wgIHMTlhvTtFastiJ
  const HARDCODED_ORDER_Tz0wgIHMTlhvTtFastiJ = [
    'fNGTXwzTxxinFXW1EF91B',    // 8. Mai 2025
    '6eNr8fnsTO06jgCqjelt',     // 11. Mai 2025
    'UIamH_JPMb9Yd5-sWHr-U',    // 15. Mai 2025
    'zW1cqUo43ed-imk_RintC',    // 22. Mai 2025
    'ra677t9Bg3fswFEewcS3U',    // 29. Mai 2025
    '_JnhFz9Qvn5PIhmYqtrT6',    // 6. Juni 2025
    'uqTh87TcPRpEkmiQAUp0_',    // 12. Juni 2025
    '83fBU_l0Rcok3a_DRt0-Z',    // 19. Juni 2025
    'NPA6LXHaLLeeNaF49vf5l',    // 27. Juni 2025
    'GvshcbgPDCtbhCeqHApvk',    // 3. Juli 2025
    'A0Eb6frZBX6Zqgx2SoHF7',    // 10. Juli 2025
    '8UemSfTkdG_QW33_T7o8M',    // 17. Juli 2025
    '2eHZPRRVT02AkTXW1PbzQ',    // 18. Juli 2025
    'GU3gfLv0KT38Jc0xbQAjX',    // 14. August 2025
    'w3bTRB6XopsFDCXXR0jnH',    // 21. August 2025
    'kDpGEvNRGTK7BQNCh3CHj',    // 28. August 2025
    'm0_mdQQCmiM5ZZzYEBk5p',    // 4. September 2025
    'QPTOWZISwLrzLIo1iTvdV',    // 11. September 2025
    'II6ib5-vufcWiClYLFWX8',    // 18. September 2025
    'xe38yaG8mn6BpwVUP2-Ln',    // 18. September 2025
    'sMQLEC0U7rFPH5g5ODDDi',    // 25. September 2025
    'utrnuu7q5mQXHzWkPgO8Q',    // 2. Oktober 2025
    'KEYWv19l9DQH2J9Ptk2r8',    // 9. Oktober 2025
    'QQbTWfpXDqVVY-Lyr9ndb',    // 16. Oktober 2025
    'XRZov4VU7tuM_0GBmYoWw',    // 24. Oktober 2025
    '8wzWW6t6qO9nUoS6IqsYk',    // 30. Oktober 2025
  ];
  
  for (const groupDoc of groups) {
    const groupId = groupDoc.id;
    const sessionsSnapshot = await db
      .collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .get();
    
    // Konvertiere zu Map für schnellen Zugriff
    const sessionsMap = new Map();
    sessionsSnapshot.docs.forEach(doc => {
      sessionsMap.set(doc.id, {
        groupId,
        groupName: groupDoc.data()?.name || 'Unbekannt',
        sessionId: doc.id,
        sessionData: doc.data(),
      });
    });
    
    // ✅ Verwende Hardcoded Order wenn vorhanden, sonst chronologisch sortieren
    if (groupId === 'Tz0wgIHMTlhvTtFastiJ' && HARDCODED_ORDER_Tz0wgIHMTlhvTtFastiJ.length > 0) {
      console.log(`   ✅ Verwende hardcodierte Reihenfolge für Gruppe ${groupId}`);
      
      HARDCODED_ORDER_Tz0wgIHMTlhvTtFastiJ.forEach(sessionId => {
        const session = sessionsMap.get(sessionId);
        if (session) {
          allSessions.push(session);
        } else {
          console.log(`   ⚠️  Session ${sessionId} nicht gefunden in DB!`);
        }
      });
      
      // Füge weitere Sessions hinzu, die nicht in der Liste sind (chronologisch)
      const addedIds = new Set(HARDCODED_ORDER_Tz0wgIHMTlhvTtFastiJ);
      const remainingSessions = Array.from(sessionsMap.values()).filter(s => !addedIds.has(s.sessionId));
      remainingSessions.sort((a, b) => {
        const timeA = a.sessionData.completedAt?.toMillis() || 0;
        const timeB = b.sessionData.completedAt?.toMillis() || 0;
        return timeA - timeB;
      });
      allSessions.push(...remainingSessions);
    } else {
      // Standard: Chronologisch sortieren nach completedAt
      sessionsSnapshot.docs.forEach(doc => {
        allSessions.push({
          groupId,
          groupName: groupDoc.data()?.name || 'Unbekannt',
          sessionId: doc.id,
          sessionData: doc.data(),
        });
      });
      
      allSessions.sort((a, b) => {
        const timeA = a.sessionData.completedAt?.toMillis() || 0;
        const timeB = b.sessionData.completedAt?.toMillis() || 0;
        return timeA - timeB;
      });
    }
  }
  
  console.log(`   ✅ ${allSessions.length} Sessions gefunden (${GROUP_ID_FILTER === 'Tz0wgIHMTlhvTtFastiJ' ? 'hardcodierte' : 'chronologisch'} sortiert)`);
  
  // 3. Initialisiere globale Rating-Map (alle Spieler starten mit DEFAULT_RATING)
  console.log('\n📋 3. Initialisiere Ratings...');
  const globalRatingMap = new Map(); // playerId -> { rating, gamesPlayed }
  
  // Sammle alle Spieler-IDs aus allen Sessions
  const allPlayerIds = new Set();
  allSessions.forEach(session => {
    const playerIds = session.sessionData.participantPlayerIds || [];
    playerIds.forEach(pid => allPlayerIds.add(pid));
  });
  
  // Initialisiere alle Spieler mit DEFAULT_RATING
  allPlayerIds.forEach(pid => {
    globalRatingMap.set(pid, {
      rating: JASS_ELO_CONFIG.DEFAULT_RATING,
      gamesPlayed: 0
    });
  });
  
  console.log(`   ✅ ${allPlayerIds.size} Spieler initialisiert (Rating: ${JASS_ELO_CONFIG.DEFAULT_RATING})`);

  // 4. Verarbeite alle Sessions chronologisch
  console.log('\n📋 4. Verarbeite Sessions chronologisch...\n');
  let processedSessions = 0;
  let errorSessions = 0;
  
  // Sammel-Strukturen für Batch-Writes
  const ratingHistoryWrites = []; // { playerId, data }
  const sessionSummaryWrites = []; // { groupId, sessionId, playerFinalRatings }
  const affectedGroups = new Set(); // groupId -> für Chart-Updates am Ende
  const lastSessionDeltas = new Map(); // playerId -> lastSessionDelta (für letzte Session)
  
  for (let i = 0; i < Math.min(allSessions.length, LIMIT); i++) {
    const session = allSessions[i];
    
    try {
      await processSession(
        session.groupId,
        session.sessionId,
        session.sessionData,
        globalRatingMap,
        ratingHistoryWrites,
        sessionSummaryWrites,
        lastSessionDeltas // ✅ NEU: Für lastSessionDelta Updates
      );
      affectedGroups.add(session.groupId);
      processedSessions++;
    } catch (error) {
      console.error(`   ❌ Fehler bei Session ${session.sessionId}:`, error.message);
      errorSessions++;
    }
  }

  // 5. Finale Zusammenfassung
  console.log('\n═══════════════════════════════════════');
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('═══════════════════════════════════════');
  console.log(`Gesamt Sessions: ${allSessions.length}`);
  console.log(`Verarbeitet: ${processedSessions}`);
  console.log(`Fehler: ${errorSessions}`);
  console.log(`Rating History Einträge: ${ratingHistoryWrites.length}`);
  console.log(`Session Summary Updates: ${sessionSummaryWrites.length}`);
  console.log(`Betroffene Gruppen: ${affectedGroups.size}`);
  console.log(`Modus: ${DRY_RUN ? 'DRY-RUN (keine Änderungen)' : 'EXECUTE (Änderungen gespeichert)'}`);
  
  // Zeige finale Ratings (Top 10)
  if (processedSessions > 0) {
    console.log('\n📊 FINALE RATINGS (Top 10):');
    const sortedRatings = Array.from(globalRatingMap.entries())
      .filter(([_, data]) => data.gamesPlayed > 0)
      .sort((a, b) => b[1].rating - a[1].rating)
      .slice(0, 10);
    
    for (const [pid, data] of sortedRatings) {
      const playerDoc = await db.collection('players').doc(pid).get();
      const playerName = playerDoc.exists ? playerDoc.data()?.displayName || 'Unbekannt' : 'Unbekannt';
      console.log(`   ${playerName.padEnd(20)}: ${data.rating.toFixed(2)} (${data.gamesPlayed} Spiele)`);
    }
    
    // Speichern (wenn nicht Dry-Run)
    if (!DRY_RUN) {
      console.log('\n💾 Speichere Änderungen in Datenbank...');
      
      // 1. Spieler-Ratings (players collection)
      console.log('   1/4 Speichere Spieler-Ratings...');
      let playerBatch = db.batch();
      let playerBatchCount = 0;
      let totalPlayerWrites = 0;
      
      for (const [pid, data] of globalRatingMap.entries()) {
        if (data.gamesPlayed > 0) { // Nur Spieler mit gespielten Spielen
          const lastDelta = lastSessionDeltas.get(pid) || 0;
          playerBatch.set(db.collection('players').doc(pid), {
            globalRating: data.rating,
            totalGamesPlayed: data.gamesPlayed,
            lastSessionDelta: lastDelta, // ✅ NEU: Aktualisiere lastSessionDelta
            lastGlobalRatingUpdate: admin.firestore.Timestamp.now(), // ✅ NEU: Update-Timestamp
          }, { merge: true });
          playerBatchCount++;
          totalPlayerWrites++;
          
          // Firestore Batch Limit: 500
          if (playerBatchCount >= 500) {
            await playerBatch.commit();
            playerBatch = db.batch();
            playerBatchCount = 0;
          }
        }
      }
      
      if (playerBatchCount > 0) {
        await playerBatch.commit();
      }
      console.log(`      ✅ ${totalPlayerWrites} Spieler-Ratings gespeichert`);
      
      // 2. Rating History (ratingHistory subcollection)
      console.log('   2/4 Lösche alte Rating History Einträge...');
      const playersWithHistory = new Set(ratingHistoryWrites.map(w => w.playerId));
      let deletedCount = 0;
      
      for (const playerId of playersWithHistory) {
        try {
          // Hole alle alten Einträge für diesen Spieler
          const oldHistorySnap = await db.collection(`players/${playerId}/ratingHistory`).get();
          if (!oldHistorySnap.empty) {
            // Lösche alle alten Einträge (batch-weise, max 500 pro Batch)
            let deleteBatch = db.batch();
            let deleteBatchCount = 0;
            
            for (const doc of oldHistorySnap.docs) {
              deleteBatch.delete(doc.ref);
              deleteBatchCount++;
              
              if (deleteBatchCount >= 500) {
                await deleteBatch.commit();
                deleteBatch = db.batch();
                deleteBatchCount = 0;
              }
            }
            
            if (deleteBatchCount > 0) {
              await deleteBatch.commit();
            }
            deletedCount += oldHistorySnap.size;
          }
        } catch (error) {
          console.error(`      ⚠️  Fehler beim Löschen der Rating History für Spieler ${playerId}:`, error.message);
        }
      }
      console.log(`      ✅ ${deletedCount} alte Rating History Einträge gelöscht`);
      
      console.log('   2/4 Speichere neue Rating History Einträge...');
      let historyBatch = db.batch();
      let historyBatchCount = 0;
      
      for (const write of ratingHistoryWrites) {
        const ref = db.collection(`players/${write.playerId}/ratingHistory`).doc();
        historyBatch.set(ref, write.data);
        historyBatchCount++;
        
        if (historyBatchCount >= 500) {
          await historyBatch.commit();
          historyBatch = db.batch();
          historyBatchCount = 0;
        }
      }
      
      if (historyBatchCount > 0) {
        await historyBatch.commit();
      }
      console.log(`      ✅ ${ratingHistoryWrites.length} Rating History Einträge gespeichert`);
      
      // 3. Session Summaries (playerFinalRatings)
      console.log('   3/4 Speichere Session Summaries...');
      let summaryBatch = db.batch();
      let summaryBatchCount = 0;
      
      for (const write of sessionSummaryWrites) {
        const ref = db.doc(`groups/${write.groupId}/jassGameSummaries/${write.sessionId}`);
        summaryBatch.update(ref, { 
          playerFinalRatings: write.playerFinalRatings 
        });
        summaryBatchCount++;
        
        if (summaryBatchCount >= 500) {
          await summaryBatch.commit();
          summaryBatch = db.batch();
          summaryBatchCount = 0;
        }
      }
      
      if (summaryBatchCount > 0) {
        await summaryBatch.commit();
      }
      console.log(`      ✅ ${sessionSummaryWrites.length} Session Summaries aktualisiert`);
      
      // 4. Chart-Daten (chartData_elo) für ALLE betroffenen Gruppen
      console.log('   4/4 Aktualisiere Chart-Daten (chartData_elo)...');
      let chartCount = 0;
      
      for (const groupId of affectedGroups) {
        try {
          await updateGroupChartDataElo(groupId);
          chartCount++;
        } catch (error) {
          console.error(`      ⚠️  Fehler bei Gruppe ${groupId}:`, error.message);
        }
      }
      console.log(`      ✅ ${chartCount}/${affectedGroups.size} Chart-Daten aktualisiert`);
      
      console.log('\n✅ Alle Änderungen erfolgreich gespeichert!');
    } else {
      console.log('\n🔍 DRY-RUN: Keine Änderungen gespeichert');
      console.log('   Führe mit --execute aus, um Änderungen zu speichern');
    }
  }
}

// ============================================
// CHART-DATEN UPDATE (synchron mit jassEloUpdater.ts)
// ============================================
async function updateGroupChartDataElo(groupId) {
  // Alle Mitglieder der Gruppe laden
  const membersSnap = await db.collection(`groups/${groupId}/members`).get();
  const memberIds = membersSnap.docs.map(doc => doc.id);
  
  if (memberIds.length === 0) {
    return; // Keine Mitglieder
  }
  
  // Alle Sessions für diese Gruppe laden
  const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();
  
  if (sessionsSnap.empty) {
    return; // Keine Sessions
  }
  
  // Spieler-Daten sammeln
  const playerDataMap = new Map();
  const allLabels = new Set();
  
  // Initialisiere alle Spieler
  for (const memberId of memberIds) {
    const memberDoc = membersSnap.docs.find(doc => doc.id === memberId);
    const memberData = memberDoc?.data();
    
    // ✅ WICHTIG: Aktuelles Rating UND displayName aus players-Collection holen
    const playerDoc = await db.collection('players').doc(memberId).get();
    const playerDocData = playerDoc.data();
    const currentRating = playerDocData?.globalRating || playerDocData?.rating || 100;
    const displayName = playerDocData?.displayName || memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`;
    
    playerDataMap.set(memberId, {
      memberId,
      memberData: { ...memberData, displayName }, // ✅ displayName aus players-Collection verwenden
      currentRating,
      ratings: []
    });
  }
  
  // Durch alle Sessions gehen und finale Ratings sammeln
  sessionsSnap.docs.forEach(doc => {
    const sessionData = doc.data();
    const playerFinalRatings = sessionData.playerFinalRatings || {};
    const sessionDate = sessionData.completedAt?.toDate?.() || new Date();
    const label = sessionDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
    
    allLabels.add(label);
    
    // Für jeden Spieler den finalen Rating-Wert nehmen
    Object.entries(playerFinalRatings).forEach(([playerId, ratingData]) => {
      const playerData = playerDataMap.get(playerId);
      if (playerData && ratingData && typeof ratingData === 'object' && 'rating' in ratingData && typeof ratingData.rating === 'number') {
        playerData.ratings.push(ratingData.rating);
      }
    });
  });
  
  // Chart-Datasets generieren
  const playerData = [];
  
  playerDataMap.forEach((playerDataItem, memberId) => {
    if (playerDataItem.ratings.length > 0) {
      const dataset = {
        label: playerDataItem.memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
        data: playerDataItem.ratings,
        playerId: memberId,
        displayName: playerDataItem.memberData?.displayName || `Spieler_${memberId.slice(0, 6)}`,
        // ❌ ENTFERNT: Frontend-Chart-Einstellungen (pointRadius, tension, etc.)
        // → Werden vom Frontend selbst gesetzt (chartDataService.ts)
      };
      
      playerData.push({
        memberId,
        memberData: playerDataItem.memberData,
        currentRating: playerDataItem.currentRating,
        dataset
      });
    }
  });
  
  // Sortiere Spieler nach aktuellem Rating (höchstes zuerst)
  playerData.sort((a, b) => b.currentRating - a.currentRating);
  
  // Extrahiere sortierte Datasets
  const chartDatasets = playerData.map(p => p.dataset);
  
  // Alle Labels sortieren
  const sortedLabels = Array.from(allLabels).sort((a, b) => {
    const [dayA, monthA, yearA] = a.split('.');
    const [dayB, monthB, yearB] = b.split('.');
    const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
    const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
    return dateA.getTime() - dateB.getTime();
  });
  
  // Chart-Daten schreiben
  const chartData = {
    datasets: chartDatasets,
    labels: sortedLabels,
    lastUpdated: admin.firestore.Timestamp.now(),
    totalPlayers: chartDatasets.length,
    totalSessions: sortedLabels.length,
  };
  
  await db.doc(`groups/${groupId}/aggregated/chartData_elo`).set(chartData);
}

// ============================================
// SESSION VERARBEITUNG
// ============================================
async function processSession(
  groupId, 
  sessionId, 
  summary, 
  globalRatingMap,
  ratingHistoryWrites,
  sessionSummaryWrites,
  lastSessionDeltas // ✅ NEU: Für lastSessionDelta Updates
) {
  // Team-Zuordnung
  const topPlayers = summary?.teams?.top?.players?.map(p => p.playerId).filter(Boolean) || [];
  const bottomPlayers = summary?.teams?.bottom?.players?.map(p => p.playerId).filter(Boolean) || [];
  
  if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
    console.log(`   ⏭️  Session ${sessionId.substring(0, 8)}...: Ungültige Team-Struktur`);
    return;
  }

  // Spiele laden
  const games = [];
  const summaryRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
  
  const cgSnap = await summaryRef.collection('completedGames').orderBy('gameNumber', 'asc').get();
  if (!cgSnap.empty) {
    cgSnap.forEach(doc => {
      const g = doc.data();
      const stricheTop = sumStriche(g.finalStriche?.top);
      const stricheBottom = sumStriche(g.finalStriche?.bottom);
      games.push({ 
        gameNumber: g.gameNumber,
        stricheTop, 
        stricheBottom, 
        completedAt: g.completedAt || g.timestampCompleted || summary.completedAt
      });
    });
  } else if (Array.isArray(summary?.gameResults) && summary.gameResults.length > 0) {
    // Tournament-Sessions
    summary.gameResults.forEach((gameResult, idx) => {
      if (!gameResult.finalStriche) return;
      const stricheTop = sumStriche(gameResult.finalStriche?.top);
      const stricheBottom = sumStriche(gameResult.finalStriche?.bottom);
      games.push({ 
        gameNumber: gameResult.gameNumber || (idx + 1),
        stricheTop, 
        stricheBottom, 
        completedAt: gameResult.completedAt || summary.completedAt,
        teams: gameResult.teams
      });
    });
  } else if (summary?.finalStriche) {
    // Fallback: 1 Spiel
    const stricheTop = sumStriche(summary.finalStriche?.top);
    const stricheBottom = sumStriche(summary.finalStriche?.bottom);
    games.push({ 
      gameNumber: 1,
      stricheTop, 
      stricheBottom, 
      completedAt: summary.completedAt 
    });
  }

  if (games.length === 0) {
    console.log(`   ⏭️  Session ${sessionId.substring(0, 8)}...: Keine Spiele gefunden`);
    return;
  }
  
  // ✅ WICHTIG: Sortiere Games nach gameNumber (chronologisch innerhalb der Session)
  games.sort((a, b) => {
    const gameNumA = a.gameNumber || 0;
    const gameNumB = b.gameNumber || 0;
    return gameNumA - gameNumB;
  });

  // Spieler initialisieren (falls nicht vorhanden)
  const playerIds = [...topPlayers, ...bottomPlayers];
  playerIds.forEach(pid => {
    if (!globalRatingMap.has(pid)) {
      globalRatingMap.set(pid, {
        rating: JASS_ELO_CONFIG.DEFAULT_RATING,
        gamesPlayed: 0
      });
    }
  });
  
  // Speichere alte Ratings für Anzeige
  const oldRatings = new Map();
  playerIds.forEach(pid => {
    oldRatings.set(pid, globalRatingMap.get(pid).rating);
  });
  
  const sessionDeltaMap = new Map();
  
  // Elo neu berechnen (spiel-für-spiel)
  for (const game of games) {
    // Teams pro Spiel (für Tournament-Sessions)
    const gameTopPlayers = game.teams?.top?.players?.map(p => p.playerId).filter(Boolean) || topPlayers;
    const gameBottomPlayers = game.teams?.bottom?.players?.map(p => p.playerId).filter(Boolean) || bottomPlayers;
    
    if (gameTopPlayers.length !== 2 || gameBottomPlayers.length !== 2) continue;

    // Ratings VOR diesem Spiel
    const ratingsBefore = new Map();
    [...gameTopPlayers, ...gameBottomPlayers].forEach(pid => {
      ratingsBefore.set(pid, globalRatingMap.get(pid).rating);
    });

    // Team-Ratings
    const teamTopRating = gameTopPlayers.reduce((sum, pid) => {
      return sum + globalRatingMap.get(pid).rating;
    }, 0) / gameTopPlayers.length;
    
    const teamBottomRating = gameBottomPlayers.reduce((sum, pid) => {
      return sum + globalRatingMap.get(pid).rating;
    }, 0) / gameBottomPlayers.length;

    const expectedTop = expectedScore(teamTopRating, teamBottomRating);
    const actualTop = stricheScore(game.stricheTop, game.stricheBottom, expectedTop);

    const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaPerTopPlayer = delta / gameTopPlayers.length;
    const deltaPerBottomPlayer = -delta / gameBottomPlayers.length;

    // Update Ratings in globaler Map
    for (const pid of gameTopPlayers) {
      const r = globalRatingMap.get(pid);
      r.rating += deltaPerTopPlayer;
      r.gamesPlayed += 1;
      sessionDeltaMap.set(pid, (sessionDeltaMap.get(pid) || 0) + deltaPerTopPlayer);
      
      // 📝 Rating History speichern
      // ✅ KORREKTUR: completedAt zu Firestore Timestamp konvertieren
      // Falls game.completedAt fehlt, verwende summary.completedAt (Session-Datum)
      let gameCompletedAt = summary.completedAt || admin.firestore.Timestamp.now();
      
      if (game.completedAt) {
        if (game.completedAt instanceof admin.firestore.Timestamp) {
          gameCompletedAt = game.completedAt;
        } else if (game.completedAt.toDate) {
          gameCompletedAt = admin.firestore.Timestamp.fromDate(game.completedAt.toDate());
        } else if (game.completedAt._seconds) {
          gameCompletedAt = admin.firestore.Timestamp.fromMillis(game.completedAt._seconds * 1000);
        } else if (game.completedAt instanceof Date) {
          gameCompletedAt = admin.firestore.Timestamp.fromDate(game.completedAt);
        }
      } else {
        // Fallback: Verwende Session-Datum, nicht aktuelles Datum!
        if (summary.completedAt) {
          if (summary.completedAt instanceof admin.firestore.Timestamp) {
            gameCompletedAt = summary.completedAt;
          } else if (summary.completedAt.toDate) {
            gameCompletedAt = admin.firestore.Timestamp.fromDate(summary.completedAt.toDate());
          } else if (summary.completedAt._seconds) {
            gameCompletedAt = admin.firestore.Timestamp.fromMillis(summary.completedAt._seconds * 1000);
          } else if (summary.completedAt instanceof Date) {
            gameCompletedAt = admin.firestore.Timestamp.fromDate(summary.completedAt);
          }
        }
      }
      ratingHistoryWrites.push({
        playerId: pid,
        data: {
          sessionId,
          groupId,
          gameNumber: game.gameNumber,
          eventType: 'game',
          rating: r.rating,
          ratingBefore: ratingsBefore.get(pid),
          ratingAfter: r.rating,
          delta: deltaPerTopPlayer,
          completedAt: gameCompletedAt,
          createdAt: gameCompletedAt, // ✅ WICHTIG: Beide Felder für Query + Charts
          expectedScore: expectedTop,
          actualScore: actualTop,
          teamRating: teamTopRating,
          opponentRating: teamBottomRating,
        }
      });
    }
    
    for (const pid of gameBottomPlayers) {
      const r = globalRatingMap.get(pid);
      r.rating += deltaPerBottomPlayer;
      r.gamesPlayed += 1;
      sessionDeltaMap.set(pid, (sessionDeltaMap.get(pid) || 0) + deltaPerBottomPlayer);
      
      // 📝 Rating History speichern
      // ✅ KORREKTUR: completedAt zu Firestore Timestamp konvertieren
      // Falls game.completedAt fehlt, verwende summary.completedAt (Session-Datum)
      let gameCompletedAt = summary.completedAt || admin.firestore.Timestamp.now();
      
      if (game.completedAt) {
        if (game.completedAt instanceof admin.firestore.Timestamp) {
          gameCompletedAt = game.completedAt;
        } else if (game.completedAt.toDate) {
          gameCompletedAt = admin.firestore.Timestamp.fromDate(game.completedAt.toDate());
        } else if (game.completedAt._seconds) {
          gameCompletedAt = admin.firestore.Timestamp.fromMillis(game.completedAt._seconds * 1000);
        } else if (game.completedAt instanceof Date) {
          gameCompletedAt = admin.firestore.Timestamp.fromDate(game.completedAt);
        }
      } else {
        // Fallback: Verwende Session-Datum, nicht aktuelles Datum!
        if (summary.completedAt) {
          if (summary.completedAt instanceof admin.firestore.Timestamp) {
            gameCompletedAt = summary.completedAt;
          } else if (summary.completedAt.toDate) {
            gameCompletedAt = admin.firestore.Timestamp.fromDate(summary.completedAt.toDate());
          } else if (summary.completedAt._seconds) {
            gameCompletedAt = admin.firestore.Timestamp.fromMillis(summary.completedAt._seconds * 1000);
          } else if (summary.completedAt instanceof Date) {
            gameCompletedAt = admin.firestore.Timestamp.fromDate(summary.completedAt);
          }
        }
      }
      ratingHistoryWrites.push({
        playerId: pid,
        data: {
          sessionId,
          groupId,
          gameNumber: game.gameNumber,
          eventType: 'game',
          rating: r.rating,
          ratingBefore: ratingsBefore.get(pid),
          ratingAfter: r.rating,
          delta: deltaPerBottomPlayer,
          completedAt: gameCompletedAt,
          createdAt: gameCompletedAt, // ✅ WICHTIG: Beide Felder für Query + Charts
          expectedScore: 1 - expectedTop,
          actualScore: 1 - actualTop,
          teamRating: teamBottomRating,
          opponentRating: teamTopRating,
        }
      });
    }
  }

  // 📝 Session Summary Update (playerFinalRatings)
  const playerFinalRatings = {};
  for (const pid of playerIds) {
    const r = globalRatingMap.get(pid);
    // ✅ WICHTIG: Hole displayName aus players-Collection für playerFinalRatings
    const playerDoc = await db.collection('players').doc(pid).get();
    const displayName = playerDoc.exists ? playerDoc.data()?.displayName || pid : pid;
    
    const sessionDelta = sessionDeltaMap.get(pid) || 0;
    
    playerFinalRatings[pid] = {
      rating: r.rating,
      ratingDelta: sessionDelta,
      gamesPlayed: r.gamesPlayed,
      displayName: displayName // ✅ WICHTIG: Für Frontend-Charts benötigt!
    };
    
    // ✅ Speichere lastSessionDelta (wird am Ende überschrieben, nur neueste bleibt)
    lastSessionDeltas.set(pid, sessionDelta);
    
    // ❌ ENTFERNT: session_end Events sind überflüssig!
    // Das Frontend nutzt nur game Events aus ratingHistory.
  }
  
  sessionSummaryWrites.push({
    groupId,
    sessionId,
    playerFinalRatings
  });

  // Ergebnis anzeigen
  const completedAt = summary.completedAt?.toDate?.() || new Date();
  const dateStr = completedAt.toISOString().split('T')[0];
  
  console.log(`   ✅ [${dateStr}] Session ${sessionId.substring(0, 8)}...: ${games.length} Spiele`);
  
  // Zeige Delta für jeden Spieler
  for (const [pid, oldRating] of oldRatings.entries()) {
    const newRating = globalRatingMap.get(pid).rating;
    const delta = sessionDeltaMap.get(pid) || 0;
    
    if (Math.abs(delta) > 0.01) {
      const playerDoc = await db.collection('players').doc(pid).get();
      const playerName = playerDoc.exists ? playerDoc.data()?.displayName || 'Unbekannt' : 'Unbekannt';
      
      console.log(`      ${playerName.padEnd(15)}: ${oldRating.toFixed(2)} → ${newRating.toFixed(2)} (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`);
    }
  }
}

// ============================================
// RUN
// ============================================
backfillElo()
  .then(() => {
    console.log('\n✅ Backfill V2 abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Fehler:', error);
    process.exit(1);
  });

