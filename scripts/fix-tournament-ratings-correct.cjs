/**
 * Repariert die falschen rating-Werte in ratingHistory für alle 8 Spieler
 * 
 * Das Problem: rating = finales_rating + delta_dieser_passe (FALSCH)
 * Korrekt: rating = kumulatives_rating_nach_dieser_passe
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

// Alle 8 aktiven Turnier-Teilnehmer
const PARTICIPANTS = [
  { id: 'b16c1120111b7d9e7d733837', name: 'Remo' },
  { id: 'F1uwdthL6zu7F0cYf1jbe', name: 'Frank' },
  { id: 'lW2UwWY80w3q8pyj4xufu', name: 'Roger' },
  { id: '8f45eac1b70c8ad7a9a9d9cb', name: 'Karim' },
  { id: '4nhOwuVONajPArNERzyEj', name: 'Davester' },
  { id: 'EvX9acReG6t45Ws7ZJ1F', name: 'Toby' },
  { id: 'ZLvyUYt_E5jhaUc0oF7O0', name: 'Mazi' },
  { id: 'NEROr2WAYG41YEiV9v4ba', name: 'Fabinski' },
];

const DRY_RUN = false; // Auf true setzen um nur zu prüfen ohne zu schreiben

async function fixPlayer(playerId, playerName) {
  console.log(`\n👤 ${playerName}`);
  
  const historyRef = db.collection(`players/${playerId}/ratingHistory`);
  const historySnap = await historyRef.orderBy('completedAt', 'asc').get();
  
  // Finde Rating VOR dem Turnier
  let ratingBeforeTournament = null;
  
  const tournamentEntries = [];
  
  historySnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.tournamentId === TOURNAMENT_ID) {
      tournamentEntries.push({
        ref: doc.ref,
        id: doc.id,
        passeNumber: data.passeNumber,
        rating: data.rating,
        delta: typeof data.delta === 'number' ? data.delta : 0,
        completedAt: data.completedAt
      });
    } else {
      // Letzter Eintrag vor dem Turnier
      if (typeof data.rating === 'number') {
        ratingBeforeTournament = data.rating;
      }
    }
  });
  
  // Sortiere nach Passe-Nummer
  tournamentEntries.sort((a, b) => (a.passeNumber || 0) - (b.passeNumber || 0));
  
  if (tournamentEntries.length === 0) {
    console.log(`   Keine Turnier-Einträge gefunden`);
    return 0;
  }
  
  // Falls kein Rating vor dem Turnier, berechne es aus dem ersten Eintrag
  if (ratingBeforeTournament === null) {
    // Start-Rating = erstes gespeichertes Rating - erstes Delta - Summe aller anderen Deltas
    // Aber wir wissen: gespeichertes_rating = finales_rating + delta
    // Also: finales_rating = gespeichertes_rating - delta (für alle gleich)
    // Und: start_rating = finales_rating - sum(alle_deltas)
    const totalDelta = tournamentEntries.reduce((sum, e) => sum + e.delta, 0);
    const impliedFinalRating = tournamentEntries[0].rating - tournamentEntries[0].delta;
    ratingBeforeTournament = impliedFinalRating - totalDelta;
    console.log(`   ⚠️ Kein Rating vor Turnier gefunden, berechnet: ${ratingBeforeTournament.toFixed(2)}`);
  } else {
    console.log(`   Rating vor Turnier: ${ratingBeforeTournament.toFixed(2)}`);
  }
  
  // Berechne und korrigiere die Ratings
  let cumulativeRating = ratingBeforeTournament;
  let fixedCount = 0;
  
  console.log(`\n   Passe | Alt         | Neu (korrekt) | Delta`);
  console.log(`   ${'-'.repeat(50)}`);
  
  for (const entry of tournamentEntries) {
    const correctRating = cumulativeRating + entry.delta;
    const oldRating = entry.rating;
    const diff = Math.abs(correctRating - oldRating);
    
    const oldStr = oldRating.toFixed(2).padStart(8);
    const newStr = correctRating.toFixed(2).padStart(8);
    const deltaStr = (entry.delta >= 0 ? '+' : '') + entry.delta.toFixed(2).padStart(5);
    const changeMarker = diff > 0.01 ? ' ← FIX' : '';
    
    console.log(`   ${entry.passeNumber}     | ${oldStr}    | ${newStr}      | ${deltaStr}${changeMarker}`);
    
    if (diff > 0.01) {
      if (!DRY_RUN) {
        await entry.ref.update({ rating: correctRating });
      }
      fixedCount++;
    }
    
    cumulativeRating = correctRating;
  }
  
  // Aktualisiere auch das globalRating
  const finalRating = cumulativeRating;
  const playerDoc = await db.collection('players').doc(playerId).get();
  const currentGlobalRating = playerDoc.data()?.globalRating;
  
  if (Math.abs(finalRating - currentGlobalRating) > 0.01) {
    console.log(`\n   GlobalRating: ${currentGlobalRating?.toFixed(2)} → ${finalRating.toFixed(2)}`);
    if (!DRY_RUN) {
      await db.collection('players').doc(playerId).update({ globalRating: finalRating });
    }
  }
  
  return fixedCount;
}

async function fix() {
  console.log('🔧 DATEN-REPARATUR FÜR ALLE 8 SPIELER\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (keine Änderungen)' : 'LIVE (Änderungen werden geschrieben)'}`);
  console.log('='.repeat(70));
  
  let totalFixed = 0;
  
  for (const { id, name } of PARTICIPANTS) {
    const fixed = await fixPlayer(id, name);
    totalFixed += fixed;
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`✅ ${totalFixed} Rating-Werte korrigiert`);
  
  if (DRY_RUN) {
    console.log('\n⚠️ DRY RUN - Keine Änderungen geschrieben!');
    console.log('   Setze DRY_RUN = false um die Änderungen zu speichern.');
  }
}

fix()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
