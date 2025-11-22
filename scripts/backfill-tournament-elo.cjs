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

const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

// Jass Elo Config (aus jassEloUpdater.ts)
const JASS_ELO_CONFIG = {
  DEFAULT_RATING: 100,
  K_TARGET: 40,
  D_STRICHE: 8.0
};

/**
 * Berechne erwarteten Score basierend auf Rating-Differenz
 */
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Konvertiere Striche-Differenz zu Score (0-1)
 */
function stricheScore(stricheA, stricheB, expectedA) {
  const diff = stricheA - stricheB;
  const maxDiff = JASS_ELO_CONFIG.D_STRICHE;
  
  if (diff >= maxDiff) return 1.0;
  if (diff <= -maxDiff) return 0.0;
  
  const normalized = diff / (2 * maxDiff);
  return 0.5 + normalized;
}

/**
 * Summiere Striche
 */
function sumStriche(finalStriche) {
  if (!finalStriche) return 0;
  return (finalStriche.berg || 0) + 
         (finalStriche.sieg || 0) + 
         (finalStriche.schneider || 0) + 
         (finalStriche.matsch || 0) + 
         (finalStriche.kontermatsch || 0);
}

/**
 * Lade Elo aus ratingHistory VOR bestimmtem Zeitpunkt
 */
async function getPlayerRatingFromHistory(playerId, beforeTimestamp) {
  try {
    const ratingHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
    const allEntriesSnap = await ratingHistoryRef.get();
    
    if (allEntriesSnap.empty) {
      console.log(`⚠️ Player ${playerId}: Keine ratingHistory, verwende Default ${JASS_ELO_CONFIG.DEFAULT_RATING}`);
      return JASS_ELO_CONFIG.DEFAULT_RATING;
    }
    
    const entries = allEntriesSnap.docs
      .map(doc => {
        const data = doc.data();
        const timestamp = data.completedAt || data.createdAt;
        
        let milliseconds = 0;
        if (timestamp) {
          if (typeof timestamp.toMillis === 'function') {
            milliseconds = timestamp.toMillis();
          } else if (timestamp instanceof Date) {
            milliseconds = timestamp.getTime();
          } else if (typeof timestamp.getTime === 'function') {
            milliseconds = timestamp.getTime();
          }
        }
        
        return {
          rating: data.rating,
          milliseconds
        };
      })
      .filter(e => typeof e.rating === 'number' && !isNaN(e.rating) && e.milliseconds > 0);
    
    if (entries.length === 0) {
      console.log(`⚠️ Player ${playerId}: Keine validen Einträge, verwende Default ${JASS_ELO_CONFIG.DEFAULT_RATING}`);
      return JASS_ELO_CONFIG.DEFAULT_RATING;
    }
    
    entries.sort((a, b) => b.milliseconds - a.milliseconds);
    
    if (beforeTimestamp) {
      const beforeMillis = beforeTimestamp.toMillis();
      const filteredEntries = entries.filter(e => e.milliseconds < beforeMillis);
      
      if (filteredEntries.length > 0) {
        return filteredEntries[0].rating;
      } else {
        console.log(`⚠️ Player ${playerId}: Keine Einträge vor Timestamp, verwende Default ${JASS_ELO_CONFIG.DEFAULT_RATING}`);
        return JASS_ELO_CONFIG.DEFAULT_RATING;
      }
    }
    
    return entries[0].rating;
  } catch (error) {
    console.error(`❌ Fehler beim Laden von ratingHistory für ${playerId}:`, error.message);
    return JASS_ELO_CONFIG.DEFAULT_RATING;
  }
}

async function backfillTournamentElo() {
  console.log('\n🔧 BACKFILL: TURNIER-ELO NEU BERECHNEN\n');
  console.log('='.repeat(120));
  console.log(`\nTurnier ID: ${TOURNAMENT_ID}`);
  console.log(`Group ID:   ${GROUP_ID}\n`);
  
  try {
    // === SCHRITT 1: DATEN LADEN ===
    console.log('='.repeat(120));
    console.log('📊 SCHRITT 1: DATEN LADEN');
    console.log('='.repeat(120));
    
    const tournamentRef = db.doc(`tournaments/${TOURNAMENT_ID}`);
    const tournamentSnap = await tournamentRef.get();
    const tournamentData = tournamentSnap.data();
    const participantPlayerIds = tournamentData.participantPlayerIds || [];
    
    console.log(`\n✅ Turnier-Teilnehmer: ${participantPlayerIds.length}`);
    
    // Lade alle Passen
    const gamesSnap = await tournamentRef.collection('games').orderBy('completedAt', 'asc').get();
    const games = gamesSnap.docs.map(doc => ({
      id: doc.id,
      data: doc.data(),
      completedAt: doc.data().completedAt
    }));
    
    console.log(`✅ Passen gefunden: ${games.length}\n`);
    
    if (games.length === 0) {
      console.log('❌ Keine Passen gefunden! Abbruch.');
      return;
    }
    
    // === SCHRITT 2: START-ELOS LADEN ===
    console.log('='.repeat(120));
    console.log('📊 SCHRITT 2: START-ELOS LADEN (VOR TURNIER)');
    console.log('='.repeat(120));
    
    const firstGameTimestamp = games[0].completedAt;
    console.log(`\nTurnier-Start: ${firstGameTimestamp.toDate().toLocaleString('de-CH')}\n`);
    
    const playerStartElos = new Map();
    const playerCurrentElos = new Map();
    const playerDisplayNames = new Map();
    
    for (const pid of participantPlayerIds) {
      const playerDoc = await db.collection('players').doc(pid).get();
      const displayName = playerDoc.data()?.displayName || pid.substring(0, 10);
      playerDisplayNames.set(pid, displayName);
      
      const startElo = await getPlayerRatingFromHistory(pid, firstGameTimestamp);
      playerStartElos.set(pid, startElo);
      playerCurrentElos.set(pid, startElo);
      
      console.log(`  ${displayName.padEnd(24)}: ${startElo.toFixed(2)}`);
    }
    
    // === SCHRITT 3: ELO PRO PASSE NEU BERECHNEN ===
    console.log('\n' + '='.repeat(120));
    console.log('📊 SCHRITT 3: ELO PRO PASSE NEU BERECHNEN');
    console.log('='.repeat(120));
    
    const newRatingHistory = []; // Neue Einträge für ratingHistory
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      const passeNumber = i + 1;
      const passeData = game.data;
      
      console.log(`\n📌 PASSE ${passeNumber} (${game.completedAt.toDate().toLocaleString('de-CH')})`);
      
      // Extrahiere Spieler und Teams
      const topPlayers = passeData.teams?.top?.players?.map(p => p.playerId).filter(Boolean) || [];
      const bottomPlayers = passeData.teams?.bottom?.players?.map(p => p.playerId).filter(Boolean) || [];
      
      if (topPlayers.length !== 2 || bottomPlayers.length !== 2) {
        console.log(`  ⚠️ Ungültige Team-Struktur, überspringe Passe ${passeNumber}`);
        continue;
      }
      
      // Berechne Striche
      const stricheTop = sumStriche(passeData.finalStriche?.top);
      const stricheBottom = sumStriche(passeData.finalStriche?.bottom);
      
      console.log(`  Striche: Top ${stricheTop} - Bottom ${stricheBottom}`);
      
      // Berechne Team-Ratings (AKTUELL vor diesem Spiel!)
      const teamTopRating = (playerCurrentElos.get(topPlayers[0]) + playerCurrentElos.get(topPlayers[1])) / 2;
      const teamBottomRating = (playerCurrentElos.get(bottomPlayers[0]) + playerCurrentElos.get(bottomPlayers[1])) / 2;
      
      console.log(`  Team-Elo: Top ${teamTopRating.toFixed(2)} - Bottom ${teamBottomRating.toFixed(2)}`);
      
      // Berechne Elo-Änderung
      const expectedTop = expectedScore(teamTopRating, teamBottomRating);
      const actualTop = stricheScore(stricheTop, stricheBottom, expectedTop);
      const delta = JASS_ELO_CONFIG.K_TARGET * (actualTop - expectedTop);
      const deltaPerTopPlayer = delta / 2;
      const deltaPerBottomPlayer = -delta / 2;
      
      console.log(`  Delta: Top ${deltaPerTopPlayer >= 0 ? '+' : ''}${deltaPerTopPlayer.toFixed(2)}, Bottom ${deltaPerBottomPlayer >= 0 ? '+' : ''}${deltaPerBottomPlayer.toFixed(2)}`);
      
      // Update Elos
      console.log(`  Spieler-Updates:`);
      
      for (const pid of topPlayers) {
        const oldRating = playerCurrentElos.get(pid);
        const newRating = oldRating + deltaPerTopPlayer;
        playerCurrentElos.set(pid, newRating);
        
        console.log(`    ${playerDisplayNames.get(pid).padEnd(24)}: ${oldRating.toFixed(2)} → ${newRating.toFixed(2)} (${deltaPerTopPlayer >= 0 ? '+' : ''}${deltaPerTopPlayer.toFixed(2)})`);
        
        // Sammle für ratingHistory
        newRatingHistory.push({
          playerId: pid,
          rating: newRating,
          delta: deltaPerTopPlayer,
          completedAt: game.completedAt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventType: 'tournament_passe',
          tournamentId: TOURNAMENT_ID,
          passeNumber: passeNumber,
          passeId: game.id
        });
      }
      
      for (const pid of bottomPlayers) {
        const oldRating = playerCurrentElos.get(pid);
        const newRating = oldRating + deltaPerBottomPlayer;
        playerCurrentElos.set(pid, newRating);
        
        console.log(`    ${playerDisplayNames.get(pid).padEnd(24)}: ${oldRating.toFixed(2)} → ${newRating.toFixed(2)} (${deltaPerBottomPlayer >= 0 ? '+' : ''}${deltaPerBottomPlayer.toFixed(2)})`);
        
        newRatingHistory.push({
          playerId: pid,
          rating: newRating,
          delta: deltaPerBottomPlayer,
          completedAt: game.completedAt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          eventType: 'tournament_passe',
          tournamentId: TOURNAMENT_ID,
          passeNumber: passeNumber,
          passeId: game.id
        });
      }
    }
    
    // === SCHRITT 4: ALTE EINTRÄGE FINDEN ===
    console.log('\n' + '='.repeat(120));
    console.log('📊 SCHRITT 4: ALTE TURNIER-EINTRÄGE FINDEN');
    console.log('='.repeat(120));
    
    const oldEntriesToDelete = [];
    
    for (const pid of participantPlayerIds) {
      const ratingHistorySnap = await db.collection(`players/${pid}/ratingHistory`)
        .where('tournamentId', '==', TOURNAMENT_ID)
        .get();
      
      if (!ratingHistorySnap.empty) {
        console.log(`\n  ${playerDisplayNames.get(pid)}: ${ratingHistorySnap.docs.length} alte Einträge`);
        ratingHistorySnap.docs.forEach(doc => {
          oldEntriesToDelete.push({
            playerId: pid,
            docId: doc.id,
            path: `players/${pid}/ratingHistory/${doc.id}`
          });
        });
      }
    }
    
    console.log(`\n✅ Total: ${oldEntriesToDelete.length} alte Einträge gefunden`);
    
    // === ZUSAMMENFASSUNG ===
    console.log('\n' + '='.repeat(120));
    console.log('📊 ZUSAMMENFASSUNG: NEUE ELO-WERTE');
    console.log('='.repeat(120));
    console.log('');
    console.log('Spieler                  | Start-Elo | End-Elo | Differenz');
    console.log('-'.repeat(120));
    
    for (const pid of participantPlayerIds) {
      const startElo = playerStartElos.get(pid);
      const endElo = playerCurrentElos.get(pid);
      const diff = endElo - startElo;
      
      const name = playerDisplayNames.get(pid).padEnd(24);
      const start = startElo.toFixed(2).padStart(9);
      const end = endElo.toFixed(2).padStart(7);
      const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(2);
      
      console.log(`${name} | ${start} | ${end} | ${diffStr.padStart(9)}`);
    }
    
    // === DRY RUN ODER EXECUTE? ===
    console.log('\n' + '='.repeat(120));
    console.log('⚠️ BEREIT ZUM AUSFÜHREN!');
    console.log('='.repeat(120));
    console.log(`\nAktionen:`);
    console.log(`  1. Lösche ${oldEntriesToDelete.length} alte ratingHistory-Einträge`);
    console.log(`  2. Erstelle ${newRatingHistory.length} neue ratingHistory-Einträge`);
    console.log(`  3. Update players/{id}/globalRating für ${participantPlayerIds.length} Spieler`);
    console.log(`  4. Update lastGlobalRatingUpdate Timestamps`);
    
    const DRY_RUN = false; // ✅ BACKFILL WIRD AUSGEFÜHRT!
    
    if (DRY_RUN) {
      console.log(`\n🔍 DRY RUN MODUS - Keine Änderungen werden vorgenommen!`);
      console.log(`   Setze DRY_RUN = false im Script, um die Änderungen auszuführen.`);
    } else {
      console.log(`\n🚀 FÜHRE ÄNDERUNGEN AUS...\n`);
      
      // Lösche alte Einträge
      console.log('  Lösche alte Einträge...');
      const deleteBatch = db.batch();
      oldEntriesToDelete.forEach(entry => {
        deleteBatch.delete(db.doc(entry.path));
      });
      await deleteBatch.commit();
      console.log(`  ✅ ${oldEntriesToDelete.length} Einträge gelöscht`);
      
      // Erstelle neue Einträge
      console.log('  Erstelle neue Einträge...');
      const createBatch = db.batch();
      newRatingHistory.forEach(entry => {
        const docRef = db.collection(`players/${entry.playerId}/ratingHistory`).doc();
        const { playerId, ...data } = entry;
        createBatch.set(docRef, data);
      });
      await createBatch.commit();
      console.log(`  ✅ ${newRatingHistory.length} Einträge erstellt`);
      
      // Update globalRating
      console.log('  Update globalRating...');
      const updateBatch = db.batch();
      for (const pid of participantPlayerIds) {
        const newRating = playerCurrentElos.get(pid);
        const playerRef = db.collection('players').doc(pid);
        updateBatch.update(playerRef, {
          globalRating: newRating,
          lastGlobalRatingUpdate: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      await updateBatch.commit();
      console.log(`  ✅ ${participantPlayerIds.length} Spieler aktualisiert`);
      
      console.log('\n✅ BACKFILL ABGESCHLOSSEN!');
    }

  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    console.log('\n' + '='.repeat(120));
    process.exit(0);
  }
}

backfillTournamentElo().catch(console.error);

