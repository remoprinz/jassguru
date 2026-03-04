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

async function checkAndUpdateTournamentSummary() {
  console.log('\n🔍 PRÜFE TURNIER-SUMMARY ELO-WERTE\n');
  console.log('='.repeat(120));
  console.log(`\nTurnier ID: ${TOURNAMENT_ID}`);
  console.log(`Group ID:   ${GROUP_ID}\n`);
  
  try {
    // === SCHRITT 1: LADE TURNIER-DATEN ===
    console.log('='.repeat(120));
    console.log('📊 SCHRITT 1: LADE TURNIER-DATEN');
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
    
    const lastGame = games[games.length - 1];
    const tournamentCompletedAt = lastGame.completedAt;
    
    console.log(`Turnier abgeschlossen: ${tournamentCompletedAt.toDate().toLocaleString('de-CH')}\n`);
    
    // === SCHRITT 2: LADE JASSGAMESUMMARY ===
    console.log('='.repeat(120));
    console.log('📊 SCHRITT 2: LADE JASSGAMESUMMARY');
    console.log('='.repeat(120));
    
    // Suche jassGameSummary für dieses Turnier
    const summariesRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`);
    const summariesSnap = await summariesRef
      .where('tournamentId', '==', TOURNAMENT_ID)
      .where('status', '==', 'completed')
      .get();
    
    if (summariesSnap.empty) {
      console.log('\n❌ Kein jassGameSummary für dieses Turnier gefunden!');
      return;
    }
    
    const summaryDoc = summariesSnap.docs[0];
    const summaryData = summaryDoc.data();
    const summaryId = summaryDoc.id;
    
    console.log(`\n✅ jassGameSummary gefunden: ${summaryId}`);
    console.log(`   completedAt: ${summaryData.completedAt?.toDate().toLocaleString('de-CH')}`);
    console.log(`   isTournamentSession: ${summaryData.isTournamentSession || false}\n`);
    
    // === SCHRITT 3: LADE KORREKTE ELO-WERTE AUS RATINGHISTORY ===
    console.log('='.repeat(120));
    console.log('📊 SCHRITT 3: LADE KORREKTE ELO-WERTE AUS RATINGHISTORY');
    console.log('='.repeat(120));
    
    const correctElos = new Map();
    const playerDisplayNames = new Map();
    
    for (const pid of participantPlayerIds) {
      // Lade Display-Name
      const playerDoc = await db.collection('players').doc(pid).get();
      const displayName = playerDoc.data()?.displayName || pid.substring(0, 10);
      playerDisplayNames.set(pid, displayName);
      
      // Lade letztes Rating aus ratingHistory (nach Turnier)
      // ✅ OHNE INDEX: Lade alle Einträge und filtere im Code
      const ratingHistoryRef = db.collection(`players/${pid}/ratingHistory`);
      const ratingHistorySnap = await ratingHistoryRef.get();
      
      // Filtere nach tournamentId und sortiere nach completedAt
      const tournamentEntries = ratingHistorySnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(entry => entry.tournamentId === TOURNAMENT_ID)
        .map(entry => {
          const timestamp = entry.completedAt || entry.createdAt;
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
          return { ...entry, milliseconds };
        })
        .filter(entry => entry.milliseconds > 0)
        .sort((a, b) => b.milliseconds - a.milliseconds); // Neueste zuerst
      
      if (tournamentEntries.length > 0) {
        const lastEntry = tournamentEntries[0];
        const finalRating = lastEntry.rating;
        
        // ✅ NEU: Berechne TOTAL-DELTA (Summe aller Passen-Deltas)
        const totalDelta = tournamentEntries.reduce((sum, entry) => {
          return sum + (entry.delta || 0);
        }, 0);
        
        correctElos.set(pid, {
          rating: finalRating,
          delta: totalDelta, // ✅ TOTAL-DELTA statt nur letzte Passe!
          displayName: displayName
        });
        
        console.log(`  ${displayName.padEnd(24)}: ${finalRating.toFixed(2)} (Total-Delta: ${totalDelta >= 0 ? '+' : ''}${totalDelta.toFixed(2)}, ${tournamentEntries.length} Passen)`);
      } else {
        console.log(`  ⚠️ ${displayName.padEnd(24)}: Kein Rating gefunden!`);
      }
    }
    
    // === SCHRITT 4: VERGLEICHE MIT ALTEN WERTEN ===
    console.log('\n' + '='.repeat(120));
    console.log('📊 SCHRITT 4: VERGLEICHE MIT ALTEN WERTEN');
    console.log('='.repeat(120));
    
    const oldPlayerFinalRatings = summaryData.playerFinalRatings || {};
    const needsUpdate = new Map();
    
    console.log('\nVergleich:\n');
    console.log('Spieler                  | Rating Alt/Neu      | Delta Alt/Neu     | Status');
    console.log('-'.repeat(120));
    
    for (const pid of participantPlayerIds) {
      const displayName = playerDisplayNames.get(pid);
      const correct = correctElos.get(pid);
      const old = oldPlayerFinalRatings[pid];
      
      if (!correct) {
        console.log(`  ⚠️ ${displayName.padEnd(24)}: KEIN NEUES RATING GEFUNDEN!`);
        continue;
      }
      
      if (!old) {
        console.log(`  ⚠️ ${displayName.padEnd(24)}: KEIN ALTES RATING IM SUMMARY!`);
        needsUpdate.set(pid, correct);
        continue;
      }
      
      const oldRating = old.rating || 0;
      const newRating = correct.rating;
      const oldDelta = old.ratingDelta || 0;
      const newDelta = correct.delta;
      
      const ratingDiff = Math.abs(oldRating - newRating);
      const deltaDiff = Math.abs(oldDelta - newDelta);
      
      // ✅ Prüfe sowohl Rating als auch Delta!
      if (ratingDiff > 0.01 || deltaDiff > 0.01) {
        needsUpdate.set(pid, correct);
        const status = ratingDiff > 0.01 ? '❌ Rating' : (deltaDiff > 0.01 ? '❌ Delta' : '✓');
        console.log(`  🔴 ${displayName.padEnd(24)} | ${oldRating.toFixed(2)}/${newRating.toFixed(2).padStart(6)} | ${(oldDelta >= 0 ? '+' : '') + oldDelta.toFixed(2)}/${(newDelta >= 0 ? '+' : '') + newDelta.toFixed(2).padStart(6)} | ${status}`);
      } else {
        console.log(`  ✅ ${displayName.padEnd(24)} | ${oldRating.toFixed(2)}/${newRating.toFixed(2).padStart(6)} | ${(oldDelta >= 0 ? '+' : '') + oldDelta.toFixed(2)}/${(newDelta >= 0 ? '+' : '') + newDelta.toFixed(2).padStart(6)} | ✓`);
      }
    }
    
    // === SCHRITT 5: UPDATE JASSGAMESUMMARY ===
    console.log('\n' + '='.repeat(120));
    console.log('📊 SCHRITT 5: UPDATE JASSGAMESUMMARY');
    console.log('='.repeat(120));
    
    if (needsUpdate.size === 0) {
      console.log('\n✅ Alle Elo-Werte sind bereits korrekt! Kein Update nötig.');
      return;
    }
    
    console.log(`\n⚠️ ${needsUpdate.size} Spieler müssen aktualisiert werden:\n`);
    
    const newPlayerFinalRatings = { ...oldPlayerFinalRatings };
    
    for (const [pid, correct] of needsUpdate.entries()) {
      const displayName = playerDisplayNames.get(pid);
      console.log(`  ${displayName.padEnd(24)}: ${correct.rating.toFixed(2)} (Delta: ${correct.delta >= 0 ? '+' : ''}${correct.delta.toFixed(2)})`);
      
      newPlayerFinalRatings[pid] = {
        rating: correct.rating,
        ratingDelta: correct.delta,
        displayName: correct.displayName
      };
    }
    
    const DRY_RUN = false; // ⚠️ Auf false setzen zum Ausführen!
    
    if (DRY_RUN) {
      console.log(`\n🔍 DRY RUN MODUS - Keine Änderungen werden vorgenommen!`);
      console.log(`   Setze DRY_RUN = false im Script, um die Änderungen auszuführen.`);
    } else {
      console.log(`\n🚀 FÜHRE UPDATE AUS...\n`);
      
      await summaryDoc.ref.update({
        playerFinalRatings: newPlayerFinalRatings
      });
      
      console.log(`✅ jassGameSummary aktualisiert!`);
      console.log(`   Pfad: groups/${GROUP_ID}/jassGameSummaries/${summaryId}`);
    }

  } catch (error) {
    console.error('\n❌ FEHLER:', error);
    console.error(error.stack);
  } finally {
    console.log('\n' + '='.repeat(120));
    process.exit(0);
  }
}

checkAndUpdateTournamentSummary().catch(console.error);

