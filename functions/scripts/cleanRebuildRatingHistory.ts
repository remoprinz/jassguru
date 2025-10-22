/**
 * CLEAN REBUILD RATING HISTORY + PLAYER FINAL RATINGS
 * 
 * PHASE 1: Berechne ratingHistory für ALLE Spiele/Passen
 * PHASE 2: Schreibe playerFinalRatings in jassGameSummaries
 */

import * as admin from 'firebase-admin';

// Firebase Admin initialisieren
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://jassguru.firebaseio.com'
});

const db = admin.firestore();

// Elo-Konfiguration
const JASS_ELO_CONFIG = {
  DEFAULT_RATING: 100,
  K_TARGET: 15,
  ELO_SCALE: 1000,
};

/**
 * Berechnet Expected Score
 */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / JASS_ELO_CONFIG.ELO_SCALE));
}

/**
 * Berechnet Striche Score
 */
function stricheScore(striche: number, totalStriche: number): number {
  const normalized = (striche + totalStriche) / (2 * totalStriche);
  return Math.max(0, Math.min(1, normalized));
}

/**
 * Berechnet Strichdifferenz für einen Spieler
 */
function calculateStrichDifferenz(playerStriche: any, opponentStriche: any): number {
  const playerTotal = (playerStriche.sieg || 0) + 
                     (playerStriche.matsch || 0) + 
                     (playerStriche.schneider || 0) + 
                     (playerStriche.berg || 0) + 
                     (playerStriche.kontermatsch || 0);
  
  const opponentTotal = (opponentStriche.sieg || 0) + 
                       (opponentStriche.matsch || 0) + 
                       (opponentStriche.schneider || 0) + 
                       (opponentStriche.berg || 0) + 
                       (opponentStriche.kontermatsch || 0);
  
  return playerTotal - opponentTotal;
}

/**
 * Hauptfunktion
 */
async function cleanRebuildRatingHistory() {
  console.log('🎯 CLEAN RATING HISTORY REBUILD\n');
  console.log('='.repeat(80));

  try {
    // ========== SCHRITT 1: LÖSCHE ALLE RATING HISTORY EINTRÄGE ==========
    console.log('\n🗑️  Schritt 1/5: Lösche ALLE ratingHistory Einträge...');
    
    const playersSnapshot = await db.collection('players').get();
    let totalDeleted = 0;
    
    for (const playerDoc of playersSnapshot.docs) {
      const ratingHistoryRef = db.collection(`players/${playerDoc.id}/ratingHistory`);
      const ratingHistorySnapshot = await ratingHistoryRef.get();
      
      if (ratingHistorySnapshot.size > 0) {
        console.log(`   👤 ${playerDoc.data()?.displayName || playerDoc.id}: ${ratingHistorySnapshot.size} Einträge`);
        
        for (const ratingDoc of ratingHistorySnapshot.docs) {
          await ratingDoc.ref.delete();
          totalDeleted++;
        }
      }
    }
    
    console.log(`✅ ${totalDeleted} ratingHistory Einträge gelöscht`);

    // ========== SCHRITT 2: RESET ALLE PLAYER RATINGS ==========
    console.log('\n🔄 Schritt 2/5: Reset alle Player Ratings auf 100...');
    
    let playersReset = 0;
    const batch = db.batch();
    
    for (const playerDoc of playersSnapshot.docs) {
      batch.update(playerDoc.ref, {
        globalRating: 100,
        gamesPlayed: 0,
        lastSessionDelta: 0,
      });
      playersReset++;
    }
    
    await batch.commit();
    console.log(`✅ ${playersReset} Spieler auf 100 Elo zurückgesetzt`);

    // ========== SCHRITT 3: SAMMLE ALLE EVENTS (SPIELE + PASSEN) ==========
    console.log('\n📊 Schritt 3/5: Sammle alle Spiele und Turnier-Passen...');
    
    const allEvents: any[] = [];
    
    // Sammle alle Session-Spiele (einzelne Spiele, nicht die Summary!)
    const groupsSnap = await db.collection('groups').get();
    
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();
      
      for (const summaryDoc of summariesSnap.docs) {
        const summaryData = summaryDoc.data();
        
        // Überspringe das spezielle Turnier-Summary (wird separat behandelt)
        if (summaryDoc.id === '6eNr8fnsTO06jgCqjelt') continue;
        
        // Extrahiere einzelne Spiele aus der Session
        const games = summaryData.gameResults || [];
        for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
          const game = games[gameIndex];
          if (summaryData.completedAt) {
            allEvents.push({
              type: 'session_game',
              groupId: groupDoc.id,
              summaryId: summaryDoc.id,
              gameIndex: gameIndex,
              game: game,
              completedAt: summaryData.completedAt,
            });
          }
        }
      }
    }
    
    // Sammle alle Turnier-Passen
    const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
    const tournamentGamesSnap = await db.collection(`tournaments/${tournamentId}/games`)
      .orderBy('completedAt', 'asc')
      .get();
    
    for (const gameDoc of tournamentGamesSnap.docs) {
      const gameData = gameDoc.data();
      if (gameData.completedAt) {
        allEvents.push({
          type: 'tournament_passe',
          tournamentId: tournamentId,
          gameId: gameDoc.id,
          data: gameData,
          completedAt: gameData.completedAt,
        });
      }
    }
    
    // Sortiere chronologisch
    allEvents.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    
    console.log(`✅ ${allEvents.length} Events (Spiele + Passen) gefunden und sortiert`);

    // ========== SCHRITT 4: PHASE 1 - BERECHNE RATING HISTORY ==========
    console.log('\n⚙️  Schritt 4/5: PHASE 1 - Berechne ratingHistory für alle Spiele/Passen...');
    
    // SCHRITT 4.1: Sammle ALLE Spieler die jemals gespielt haben
    console.log('\n📋 Schritt 4.1/5: Sammle alle Spieler die jemals gespielt haben...');
    
    const allPlayerIds = new Set<string>();
    
    // Sammle Spieler aus Session-Spielen
    for (const event of allEvents) {
      if (event.type === 'session_game') {
        const topPlayerIds = event.game.teams?.top?.players?.map((p: any) => p.playerId) || [];
        const bottomPlayerIds = event.game.teams?.bottom?.players?.map((p: any) => p.playerId) || [];
        [...topPlayerIds, ...bottomPlayerIds].forEach(pid => allPlayerIds.add(pid));
      } else if (event.type === 'tournament_passe') {
        const playerIds = event.data.playerDetails?.map((p: any) => p.playerId) || [];
        playerIds.forEach(pid => allPlayerIds.add(pid));
      }
    }
    
    // Globale Rating-Map für ALLE Spieler initialisieren
    const globalRatingMap = new Map<string, number>();
    for (const playerId of allPlayerIds) {
      globalRatingMap.set(playerId, 100); // Alle starten bei 100
    }
    
    console.log(`✅ ${allPlayerIds.size} Spieler identifiziert und auf Rating 100 initialisiert`);
    
    let processedCount = 0;
    
    for (const event of allEvents) {
      processedCount++;
      
      if (event.type === 'session_game') {
        await processSessionGame(event, globalRatingMap);
      } else if (event.type === 'tournament_passe') {
        await processTournamentPasse(event, globalRatingMap);
      }
      
      // Fortschritt nur alle 10 Events anzeigen
      if (processedCount % 10 === 0 || processedCount === allEvents.length) {
        console.log(`   [${processedCount}/${allEvents.length}] Events verarbeitet...`);
      }
    }
    
    console.log(`✅ PHASE 1 abgeschlossen: ${processedCount} Events verarbeitet`);

    // ========== SCHRITT 5: PHASE 2 - SCHREIBE PLAYER FINAL RATINGS ==========
    console.log('\n🏆 Schritt 5/5: PHASE 2 - Schreibe playerFinalRatings in jassGameSummaries...');
    
    // Iteriere durch ALLE jassGameSummaries (inkl. 6eNr8fnsTO06jgCqjelt)
    let summariesProcessed = 0;
    
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .get();
      
      for (const summaryDoc of summariesSnap.docs) {
        const summaryData = summaryDoc.data();
        if (!summaryData.completedAt) continue;
        
        // Finde die Ratings der Spieler ZUM ZEITPUNKT dieser Summary
        const playerFinalRatings = await getPlayerRatingsAtTime(
          summaryData.completedAt,
          summaryData.participantPlayerIds || []
        );
        
        if (Object.keys(playerFinalRatings).length > 0) {
          await summaryDoc.ref.update({ playerFinalRatings });
          summariesProcessed++;
          
          console.log(`   ✅ ${summaryDoc.id}: ${Object.keys(playerFinalRatings).length} Spieler`);
        }
      }
    }
    
    console.log(`✅ PHASE 2 abgeschlossen: ${summariesProcessed} Summaries aktualisiert`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ RATING HISTORY REBUILD ABGESCHLOSSEN!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ FEHLER:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

/**
 * Verarbeitet ein einzelnes Session-Spiel
 */
async function processSessionGame(event: any, globalRatingMap: Map<string, number>) {
  const { groupId, summaryId, gameIndex, game, completedAt } = event;
  
  const topPlayers = game.teams?.top?.players || [];
  const bottomPlayers = game.teams?.bottom?.players || [];
  const topPlayerIds = topPlayers.map((p: any) => p.playerId);
  const bottomPlayerIds = bottomPlayers.map((p: any) => p.playerId);
  
  if (topPlayerIds.length === 0 || bottomPlayerIds.length === 0) return;
  
  // Berechne Strichdifferenz
  const topStrichDifferenz = calculateStrichDifferenz(
    game.finalStriche?.top || {}, 
    game.finalStriche?.bottom || {}
  );
  const bottomStrichDifferenz = calculateStrichDifferenz(
    game.finalStriche?.bottom || {}, 
    game.finalStriche?.top || {}
  );
  
  const totalStriche = Math.abs(topStrichDifferenz) + Math.abs(bottomStrichDifferenz);
  if (totalStriche === 0) return;
  
  // Durchschnitts-Ratings
  const topAvgRating = topPlayerIds.reduce((sum: number, pid: string) => 
    sum + globalRatingMap.get(pid)!, 0) / topPlayerIds.length;
  const bottomAvgRating = bottomPlayerIds.reduce((sum: number, pid: string) => 
    sum + globalRatingMap.get(pid)!, 0) / bottomPlayerIds.length;
  
  // Expected Scores
  const expectedTop = expectedScore(topAvgRating, bottomAvgRating);
  const expectedBottom = 1 - expectedTop;
  
  // Actual Scores
  const actualTop = stricheScore(topStrichDifferenz, totalStriche);
  const actualBottom = stricheScore(bottomStrichDifferenz, totalStriche);
  
  // Elo-Änderungen
  const deltaTop = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
  const deltaBottom = JASS_ELO_CONFIG.K_TARGET * (actualBottom - expectedBottom);
  
  // Update Ratings und schreibe ratingHistory
  const gameBatch = db.batch();
  
  for (const pid of topPlayerIds) {
    const newRating = globalRatingMap.get(pid)! + deltaTop;
    globalRatingMap.set(pid, newRating);
    
    // Update Player-Dokument
    const playerRef = db.collection('players').doc(pid);
    gameBatch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: deltaTop,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });
    
    // Erstelle ratingHistory Eintrag
    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    gameBatch.set(historyRef, {
      rating: newRating,
      delta: deltaTop,
      createdAt: completedAt,
      completedAt: completedAt,
      sessionId: summaryId,
      groupId: groupId,
      eventType: 'game_end',
      gameId: `${summaryId}_${gameIndex}`,
    });
  }
  
  for (const pid of bottomPlayerIds) {
    const newRating = globalRatingMap.get(pid)! + deltaBottom;
    globalRatingMap.set(pid, newRating);
    
    // Update Player-Dokument
    const playerRef = db.collection('players').doc(pid);
    gameBatch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: deltaBottom,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });
    
    // Erstelle ratingHistory Eintrag
    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    gameBatch.set(historyRef, {
      rating: newRating,
      delta: deltaBottom,
      createdAt: completedAt,
      completedAt: completedAt,
      sessionId: summaryId,
      groupId: groupId,
      eventType: 'game_end',
      gameId: `${summaryId}_${gameIndex}`,
    });
  }
  
  await gameBatch.commit();
}

/**
 * Verarbeitet eine Turnier-Passe
 */
async function processTournamentPasse(event: any, globalRatingMap: Map<string, number>) {
  const { tournamentId, gameId, data, completedAt } = event;
  
  // Berechne Strichdifferenz
  const topStrichDifferenz = calculateStrichDifferenz(
    data.teamStrichePasse?.top || {}, 
    data.teamStrichePasse?.bottom || {}
  );
  const bottomStrichDifferenz = calculateStrichDifferenz(
    data.teamStrichePasse?.bottom || {}, 
    data.teamStrichePasse?.top || {}
  );
  
  const totalStriche = Math.abs(topStrichDifferenz) + Math.abs(bottomStrichDifferenz);
  if (totalStriche === 0) return;
  
  // Lese echte Team-Zuordnungen aus playerDetails
  let topPlayerIds: string[] = [];
  let bottomPlayerIds: string[] = [];
  
  if (data.playerDetails && Array.isArray(data.playerDetails)) {
    for (const player of data.playerDetails) {
      if (player.team === 'top') {
        topPlayerIds.push(player.playerId);
      } else if (player.team === 'bottom') {
        bottomPlayerIds.push(player.playerId);
      }
    }
  }
  
  if (topPlayerIds.length === 0 || bottomPlayerIds.length === 0) return;
  
  // Durchschnitts-Ratings
  const topAvgRating = topPlayerIds.reduce((sum: number, pid: string) => 
    sum + globalRatingMap.get(pid)!, 0) / topPlayerIds.length;
  const bottomAvgRating = bottomPlayerIds.reduce((sum: number, pid: string) => 
    sum + globalRatingMap.get(pid)!, 0) / bottomPlayerIds.length;
  
  // Expected Scores
  const expectedTop = expectedScore(topAvgRating, bottomAvgRating);
  const expectedBottom = 1 - expectedTop;
  
  // Actual Scores
  const actualTop = stricheScore(topStrichDifferenz, totalStriche);
  const actualBottom = stricheScore(bottomStrichDifferenz, totalStriche);
  
  // Elo-Änderungen
  const deltaTop = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
  const deltaBottom = JASS_ELO_CONFIG.K_TARGET * (actualBottom - expectedBottom);
  
  // Update Ratings und schreibe ratingHistory
  const passeBatch = db.batch();
  
  for (const pid of topPlayerIds) {
    const newRating = globalRatingMap.get(pid)! + deltaTop;
    globalRatingMap.set(pid, newRating);
    
    // Update Player-Dokument
    const playerRef = db.collection('players').doc(pid);
    passeBatch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: deltaTop,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });
    
    // Erstelle ratingHistory Eintrag
    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    passeBatch.set(historyRef, {
      rating: newRating,
      delta: deltaTop,
      createdAt: completedAt,
      completedAt: completedAt,
      tournamentId: tournamentId,
      gameId: gameId,
      eventType: 'tournament_passe',
    });
  }
  
  for (const pid of bottomPlayerIds) {
    const newRating = globalRatingMap.get(pid)! + deltaBottom;
    globalRatingMap.set(pid, newRating);
    
    // Update Player-Dokument
    const playerRef = db.collection('players').doc(pid);
    passeBatch.update(playerRef, {
      globalRating: newRating,
      lastSessionDelta: deltaBottom,
      gamesPlayed: admin.firestore.FieldValue.increment(1),
    });
    
    // Erstelle ratingHistory Eintrag
    const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
    passeBatch.set(historyRef, {
      rating: newRating,
      delta: deltaBottom,
      createdAt: completedAt,
      completedAt: completedAt,
      tournamentId: tournamentId,
      gameId: gameId,
      eventType: 'tournament_passe',
    });
  }
  
  await passeBatch.commit();
}

/**
 * Findet die Ratings der Spieler ZUM ZEITPUNKT einer Summary
 */
async function getPlayerRatingsAtTime(
  completedAt: admin.firestore.Timestamp,
  playerIds: string[]
): Promise<{ [playerId: string]: { rating: number; ratingDelta: number; gamesPlayed: number; } }> {
  
  const playerFinalRatings: { [playerId: string]: { rating: number; ratingDelta: number; gamesPlayed: number; } } = {};
  
  for (const playerId of playerIds) {
    // Hole ALLE ratingHistory Einträge bis zu diesem Zeitpunkt
    const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
      .where('completedAt', '<=', completedAt)
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();
    
    if (!historySnap.empty) {
      const latestEntry = historySnap.docs[0].data();
      
      // Berechne Delta: Finde den vorherigen Eintrag
      const previousSnap = await db.collection(`players/${playerId}/ratingHistory`)
        .where('completedAt', '<', latestEntry.completedAt)
        .orderBy('completedAt', 'desc')
        .limit(1)
        .get();
      
      const previousRating = previousSnap.empty ? 100 : previousSnap.docs[0].data().rating;
      const delta = latestEntry.rating - previousRating;
      
      // Zähle alle Spiele bis zu diesem Zeitpunkt
      const gamesCount = await db.collection(`players/${playerId}/ratingHistory`)
        .where('completedAt', '<=', completedAt)
        .get();
      
      playerFinalRatings[playerId] = {
        rating: latestEntry.rating,
        ratingDelta: delta,
        gamesPlayed: gamesCount.size,
      };
    }
  }
  
  return playerFinalRatings;
}

// Ausführen
cleanRebuildRatingHistory();
