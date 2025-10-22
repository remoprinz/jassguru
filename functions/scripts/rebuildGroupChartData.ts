/**
 * REBUILD GROUP CHART DATA
 * 
 * Dieses Script:
 * 1. Iteriert nur durch jassGameSummaries (nicht durch Turnier-Passen)
 * 2. Für das spezielle Turnier 6eNr8fnsTO06jgCqjelt nimmt es den Endwert von Passe 15
 * 3. Für alle anderen Sessions verwendet es completedAt
 * 4. Erstellt Chart-Daten für GroupView.tsx
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
 * Gemachte Striche - Erhaltene Striche
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
 * Hauptfunktion für eine spezifische Gruppe
 */
async function rebuildGroupChartData(groupId: string) {
  console.log(`🎯 REBUILD GROUP CHART DATA für Gruppe ${groupId}\n`);
  console.log('='.repeat(80));

  try {
    // ========== SCHRITT 1: LÖSCHE ALLE RATING HISTORY EINTRÄGE FÜR DIESE GRUPPE ==========
    console.log('\n🗑️  Schritt 1/4: Lösche ratingHistory Einträge für Gruppenmitglieder...');
    
    // Hole alle Mitglieder der Gruppe
    const membersSnap = await db.collection(`groups/${groupId}/members`).get();
    const memberIds = membersSnap.docs.map(doc => doc.id);
    
    if (memberIds.length === 0) {
      console.log('❌ Keine Mitglieder in der Gruppe gefunden');
      return;
    }
    
    console.log(`👥 Gefunden: ${memberIds.length} Mitglieder`);
    
    let totalDeleted = 0;
    for (const memberId of memberIds) {
      const ratingHistoryRef = db.collection(`players/${memberId}/ratingHistory`);
      const ratingHistorySnapshot = await ratingHistoryRef.get();
      
      if (ratingHistorySnapshot.size > 0) {
        console.log(`   👤 ${memberId}: ${ratingHistorySnapshot.size} Einträge`);
        
        for (const ratingDoc of ratingHistorySnapshot.docs) {
          await ratingDoc.ref.delete();
          totalDeleted++;
        }
      }
    }
    
    console.log(`✅ ${totalDeleted} ratingHistory Einträge gelöscht`);

    // ========== SCHRITT 2: RESET ALLE PLAYER RATINGS ==========
    console.log('\n🔄 Schritt 2/4: Reset alle Player Ratings auf 100...');
    
    const batch = db.batch();
    for (const memberId of memberIds) {
      const playerRef = db.collection('players').doc(memberId);
      batch.update(playerRef, {
        globalRating: 100,
        gamesPlayed: 0,
        lastSessionDelta: 0,
      });
    }
    
    await batch.commit();
    console.log(`✅ ${memberIds.length} Spieler auf 100 Elo zurückgesetzt`);

    // ========== SCHRITT 3: SAMMLE ALLE JASSGAMESUMMARIES ==========
    console.log('\n📊 Schritt 3/4: Sammle alle jassGameSummaries...');
    
    const summariesSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'asc')
      .get();
    
    if (summariesSnap.empty) {
      console.log('❌ Keine abgeschlossenen Sessions gefunden');
      return;
    }
    
    console.log(`✅ ${summariesSnap.size} Sessions gefunden`);
    
    // ========== SCHRITT 4: VERARBEITE ALLE SESSIONS ==========
    console.log('\n⚙️  Schritt 4/4: Verarbeite alle Sessions chronologisch...');
    
    let processedCount = 0;
    
    for (const summaryDoc of summariesSnap.docs) {
      processedCount++;
      const summaryData = summaryDoc.data();
      const summaryId = summaryDoc.id;
      
      console.log(`\n📅 Session ${processedCount}/${summariesSnap.size}: ${summaryId}`);
      
      // Spezielle Behandlung für das Turnier 6eNr8fnsTO06jgCqjelt
      if (summaryId === '6eNr8fnsTO06jgCqjelt') {
        console.log('   🏆 Spezielle Behandlung für Turnier - verwende Passe 15 Endwert');
        await processSpecialTournament(summaryId, summaryData, groupId);
      } else {
        console.log('   🎮 Normale Session - verwende completedAt');
        await processNormalSession(summaryId, summaryData, groupId);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ GROUP CHART DATA REBUILD ABGESCHLOSSEN!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ FEHLER:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

/**
 * Verarbeitet das spezielle Turnier 6eNr8fnsTO06jgCqjelt
 * Nimmt den Endwert von Passe 15
 */
async function processSpecialTournament(summaryId: string, summaryData: any, groupId: string) {
  try {
    // Lade das Turnier-Dokument
    const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
    const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
    const tournamentData = tournamentDoc.data();
    
    if (!tournamentData || !tournamentData.rankedPlayerUids) {
      console.log('      ⚠️  Keine Spieler-IDs im Turnier');
      return;
    }
    
    const allPlayerIds = tournamentData.rankedPlayerUids || [];
    if (allPlayerIds.length !== 4) {
      console.log('      ⚠️  Nicht genau 4 Spieler im Turnier');
      return;
    }
    
    // Lade Passe 15 (die letzte Passe)
    const passe15Doc = await db.collection(`tournaments/${tournamentId}/games`)
      .where('passeNumber', '==', 15)
      .limit(1)
      .get();
    
    if (passe15Doc.empty) {
      console.log('      ⚠️  Passe 15 nicht gefunden');
      return;
    }
    
    const passe15Data = passe15Doc.docs[0].data();
    console.log(`      📊 Passe 15 gefunden: ${passe15Data.completedAt?.toDate?.()?.toISOString()}`);
    
    // Berechne Elo-Updates für Passe 15
    const topPlayerIds = [allPlayerIds[0], allPlayerIds[2]];
    const bottomPlayerIds = [allPlayerIds[1], allPlayerIds[3]];
    
    // Lade aktuelle Ratings
    const ratingMap = new Map<string, number>();
    for (const pid of allPlayerIds) {
      const playerDoc = await db.collection('players').doc(pid).get();
      const playerData = playerDoc.data();
      ratingMap.set(pid, playerData?.globalRating || 100);
    }
    
    // Berechne Strichdifferenz für Passe 15
    const topStrichDifferenz = calculateStrichDifferenz(
      passe15Data.teamStrichePasse?.top || {}, 
      passe15Data.teamStrichePasse?.bottom || {}
    );
    const bottomStrichDifferenz = calculateStrichDifferenz(
      passe15Data.teamStrichePasse?.bottom || {}, 
      passe15Data.teamStrichePasse?.top || {}
    );
    
    const totalStriche = Math.abs(topStrichDifferenz) + Math.abs(bottomStrichDifferenz);
    
    if (totalStriche === 0) {
      console.log('      ⚠️  Keine Striche in Passe 15');
      return;
    }
    
    // Durchschnitts-Ratings
    const topAvgRating = topPlayerIds.reduce((sum: any, pid: string) => sum + (ratingMap.get(pid) || 100), 0) / topPlayerIds.length;
    const bottomAvgRating = bottomPlayerIds.reduce((sum: any, pid: string) => sum + (ratingMap.get(pid) || 100), 0) / bottomPlayerIds.length;
    
    // Expected Scores
    const expectedTop = expectedScore(topAvgRating, bottomAvgRating);
    const expectedBottom = 1 - expectedTop;
    
    // Actual Scores basierend auf Strichdifferenz
    const actualTop = stricheScore(topStrichDifferenz, totalStriche);
    const actualBottom = stricheScore(bottomStrichDifferenz, totalStriche);
    
    // Elo-Änderungen
    const deltaTop = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
    const deltaBottom = JASS_ELO_CONFIG.K_TARGET * (actualBottom - expectedBottom);
    
    // Speichere Ratings und Historie für Passe 15
    const updateBatch = db.batch();
    
    for (const pid of topPlayerIds) {
      const oldRating = ratingMap.get(pid) || 100;
      const newRating = oldRating + deltaTop;
      
      const playerRef = db.collection('players').doc(pid);
      updateBatch.update(playerRef, {
        globalRating: newRating,
        lastSessionDelta: deltaTop,
        gamesPlayed: admin.firestore.FieldValue.increment(1),
      });
      
      // Erstelle ratingHistory Eintrag für diese Passe
      const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
      updateBatch.set(historyRef, {
        rating: newRating,
        delta: deltaTop,
        createdAt: passe15Data.completedAt,
        completedAt: passe15Data.completedAt,
        tournamentId: tournamentId,
        gameId: passe15Doc.docs[0].id,
        eventType: 'tournament_passe_15', // Spezielle Markierung
        sessionId: summaryId, // Verweis auf das jassGameSummary
        groupId: groupId,
      });
    }
    
    for (const pid of bottomPlayerIds) {
      const oldRating = ratingMap.get(pid) || 100;
      const newRating = oldRating + deltaBottom;
      
      const playerRef = db.collection('players').doc(pid);
      updateBatch.update(playerRef, {
        globalRating: newRating,
        lastSessionDelta: deltaBottom,
        gamesPlayed: admin.firestore.FieldValue.increment(1),
      });
      
      // Erstelle ratingHistory Eintrag für diese Passe
      const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
      updateBatch.set(historyRef, {
        rating: newRating,
        delta: deltaBottom,
        createdAt: passe15Data.completedAt,
        completedAt: passe15Data.completedAt,
        tournamentId: tournamentId,
        gameId: passe15Doc.docs[0].id,
        eventType: 'tournament_passe_15', // Spezielle Markierung
        sessionId: summaryId, // Verweis auf das jassGameSummary
        groupId: groupId,
      });
    }
    
    await updateBatch.commit();
    console.log(`      ✅ Turnier verarbeitet (${allPlayerIds.length} Spieler)`);
    
  } catch (error) {
    console.error(`❌ Fehler bei Turnier ${summaryId}:`, error);
    throw error;
  }
}

/**
 * Verarbeitet eine normale Session
 */
async function processNormalSession(summaryId: string, summaryData: any, groupId: string) {
  try {
    // Extrahiere Spiel-Daten
    const games = summaryData.gameResults || [];
    if (games.length === 0) {
      console.log('      ⚠️  Keine Spiele gefunden');
      return;
    }
    
    // Sammle alle Spieler
    const allPlayerIds = new Set<string>();
    for (const game of games) {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];
      topPlayers.forEach((p: any) => allPlayerIds.add(p.playerId));
      bottomPlayers.forEach((p: any) => allPlayerIds.add(p.playerId));
    }
    
    // Lade aktuelle Ratings
    const ratingMap = new Map<string, number>();
    for (const pid of allPlayerIds) {
      const playerDoc = await db.collection('players').doc(pid).get();
      const playerData = playerDoc.data();
      ratingMap.set(pid, playerData?.globalRating || 100);
    }
    
    // Verarbeite jedes Spiel EINZELN (jedes Spiel = separater Datenpunkt)
    for (const game of games) {
      const topPlayers = game.teams?.top?.players || [];
      const bottomPlayers = game.teams?.bottom?.players || [];
      const topPlayerIds = topPlayers.map((p: any) => p.playerId);
      const bottomPlayerIds = bottomPlayers.map((p: any) => p.playerId);
      
      // Berechne Strichdifferenz für jedes Team
      const topStrichDifferenz = calculateStrichDifferenz(
        game.finalStriche?.top || {}, 
        game.finalStriche?.bottom || {}
      );
      const bottomStrichDifferenz = calculateStrichDifferenz(
        game.finalStriche?.bottom || {}, 
        game.finalStriche?.top || {}
      );
      
      // Durchschnitts-Ratings berechnen
      const topAvgRating = topPlayerIds.reduce((sum: number, pid: string) => sum + (ratingMap.get(pid) || 100), 0) / topPlayerIds.length;
      const bottomAvgRating = bottomPlayerIds.reduce((sum: number, pid: string) => sum + (ratingMap.get(pid) || 100), 0) / bottomPlayerIds.length;
      
      // Expected Scores
      const expectedTop = expectedScore(topAvgRating, bottomAvgRating);
      const expectedBottom = 1 - expectedTop;
      
      // Actual Scores basierend auf Strichdifferenz
      const totalStriche = Math.abs(topStrichDifferenz) + Math.abs(bottomStrichDifferenz);
      if (totalStriche === 0) continue;
      
      const actualTop = stricheScore(topStrichDifferenz, totalStriche);
      const actualBottom = stricheScore(bottomStrichDifferenz, totalStriche);
      
      // Elo-Änderungen
      const deltaTop = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
      const deltaBottom = JASS_ELO_CONFIG.K_TARGET * (actualBottom - expectedBottom);
      
      // Update Ratings
      for (const pid of topPlayerIds) {
        const oldRating = ratingMap.get(pid) || 100;
        ratingMap.set(pid, oldRating + deltaTop);
      }
      for (const pid of bottomPlayerIds) {
        const oldRating = ratingMap.get(pid) || 100;
        ratingMap.set(pid, oldRating + deltaBottom);
      }
      
      // ✅ JEDES SPIEL = SEPARATER RATING HISTORY EINTRAG
      const gameBatch = db.batch();
      for (const pid of [...topPlayerIds, ...bottomPlayerIds]) {
        const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
        const currentRating = ratingMap.get(pid) || 100;
        
        gameBatch.set(historyRef, {
          rating: currentRating,
          delta: topPlayerIds.includes(pid) ? deltaTop : deltaBottom,
          createdAt: summaryData.completedAt,
          completedAt: summaryData.completedAt,
          sessionId: summaryId,
          groupId: groupId,
          eventType: 'game_end',
          gameId: `${summaryId}_${games.indexOf(game)}`,
        });
      }
      await gameBatch.commit();
    }
    
    // Speichere finale Ratings in Firestore
    const updateBatch = db.batch();
    for (const [pid, finalRating] of ratingMap.entries()) {
      const playerRef = db.collection('players').doc(pid);
      const playerDoc = await playerRef.get();
      const oldRating = playerDoc.data()?.globalRating || 100;
      const delta = finalRating - oldRating;
      
      updateBatch.update(playerRef, {
        globalRating: finalRating,
        lastSessionDelta: delta,
        gamesPlayed: admin.firestore.FieldValue.increment(games.length),
      });
      
      // Erstelle ratingHistory Eintrag für Session-Ende
      const historyRef = db.collection(`players/${pid}/ratingHistory`).doc();
      updateBatch.set(historyRef, {
        rating: finalRating,
        delta: delta,
        createdAt: summaryData.completedAt,
        completedAt: summaryData.completedAt,
        sessionId: summaryId,
        groupId: groupId,
        eventType: 'session_end',
      });
    }
    
    await updateBatch.commit();
    console.log(`      ✅ Session verarbeitet (${allPlayerIds.size} Spieler)`);
    
  } catch (error) {
    console.error(`❌ Fehler bei Session ${summaryId}:`, error);
    throw error;
  }
}

// Ausführung
const groupId = process.argv[2] || 'Tz0wgIHMTlhvTtFastiJ'; // Standard: fürDich OGs

console.log(`🚨 WARNUNG: Dieses Script berechnet Chart-Daten für Gruppe ${groupId} neu!`);
console.log(`📅 Zielgruppe: ${groupId}`);
console.log(`⏳ Starte in 3 Sekunden...`);

setTimeout(() => {
  rebuildGroupChartData(groupId);
}, 3000);
