/**
 * Repariert die ratingHistory für ein Turnier
 * 
 * Problem: Es gibt einen falschen 4. Eintrag mit delta: [object Object]
 * Lösung: Lösche den korrupten Eintrag
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

// Alle Turnier-Teilnehmer
const PARTICIPANT_PLAYER_IDS = [
  'b16c1120111b7d9e7d733837', // Remo
  'F1uwdthL6zu7F0cYf1jbe',    // Frank
  'PLaDRlPBo91yu5Ij8MOT2',    // Studi
  'lW2UwWY80w3q8pyj4xufu',    // Roger
  '8f45eac1b70c8ad7a9a9d9cb', // Karim
  '4nhOwuVONajPArNERzyEj',    // Davester
  'EvX9acReG6t45Ws7ZJ1F',     // Toby
  'ZLvyUYt_E5jhaUc0oF7O0',    // Mazi
  'NEROr2WAYG41YEiV9v4ba',    // Fabinski
  '1sDvqN_kvqZLB-4eSZFqZ'     // Marc
];

async function fixRatingHistory() {
  console.log('🔧 Repariere ratingHistory für Turnier\n');
  console.log('='.repeat(70));
  
  let totalDeleted = 0;
  let totalFixed = 0;
  
  for (const playerId of PARTICIPANT_PLAYER_IDS) {
    // Lade Player-Name
    const playerDoc = await db.collection('players').doc(playerId).get();
    const playerName = playerDoc.data()?.displayName || playerId.substring(0, 8);
    
    console.log(`\n👤 ${playerName} (${playerId})`);
    
    // Hole alle ratingHistory Einträge für dieses Turnier
    const historyRef = db.collection(`players/${playerId}/ratingHistory`);
    const historySnap = await historyRef.get();
    
    // Filtere nach Turnier-ID
    const tournamentEntries = [];
    historySnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.tournamentId === TOURNAMENT_ID) {
        tournamentEntries.push({
          id: doc.id,
          ref: doc.ref,
          ...data
        });
      }
    });
    
    console.log(`   Gefunden: ${tournamentEntries.length} Einträge für dieses Turnier`);
    
    // Prüfe jeden Eintrag
    for (const entry of tournamentEntries) {
      const delta = entry.delta;
      const passeNumber = entry.passeNumber;
      const completedAt = entry.completedAt?.toDate?.();
      
      // Prüfe auf korrupte Daten
      const isCorruptDelta = typeof delta !== 'number' || isNaN(delta);
      const hasNoPasseNumber = !passeNumber;
      
      if (isCorruptDelta || hasNoPasseNumber) {
        console.log(`   ❌ Korrupter Eintrag gefunden:`);
        console.log(`      ID: ${entry.id}`);
        console.log(`      Delta: ${typeof delta} = ${delta}`);
        console.log(`      PasseNumber: ${passeNumber || 'N/A'}`);
        console.log(`      CompletedAt: ${completedAt?.toLocaleString('de-CH') || 'N/A'}`);
        
        // Lösche den korrupten Eintrag
        console.log(`      🗑️  Lösche korrupten Eintrag...`);
        await entry.ref.delete();
        totalDeleted++;
      } else {
        // Prüfe ob won korrekt ist
        const won = entry.won;
        const isWonCorrect = (delta > 0 && won === true) || (delta <= 0 && won === false);
        
        if (!isWonCorrect && delta > 0 && won !== true) {
          console.log(`   ⚠️  Eintrag ${entry.id}: Delta positiv (${delta.toFixed(2)}), aber won=${won}`);
          console.log(`      🔧 Korrigiere won=true...`);
          await entry.ref.update({ won: true });
          totalFixed++;
        } else if (!isWonCorrect && delta < 0 && won !== false) {
          console.log(`   ⚠️  Eintrag ${entry.id}: Delta negativ (${delta.toFixed(2)}), aber won=${won}`);
          console.log(`      🔧 Korrigiere won=false...`);
          await entry.ref.update({ won: false });
          totalFixed++;
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`✅ ${totalDeleted} korrupte Einträge gelöscht`);
  console.log(`✅ ${totalFixed} won-Flags korrigiert`);
  
  // Aktualisiere auch das globalRating für jeden Spieler
  console.log('\n📊 Aktualisiere globalRating für alle Spieler...');
  
  for (const playerId of PARTICIPANT_PLAYER_IDS) {
    // Hole den letzten gültigen ratingHistory Eintrag
    const historyRef = db.collection(`players/${playerId}/ratingHistory`);
    const historySnap = await historyRef.orderBy('completedAt', 'desc').limit(1).get();
    
    if (!historySnap.empty) {
      const latestRating = historySnap.docs[0].data().rating;
      
      if (typeof latestRating === 'number' && !isNaN(latestRating)) {
        const playerDoc = await db.collection('players').doc(playerId).get();
        const currentGlobalRating = playerDoc.data()?.globalRating;
        
        if (currentGlobalRating !== latestRating) {
          console.log(`   ${playerDoc.data()?.displayName}: ${currentGlobalRating?.toFixed(2)} → ${latestRating.toFixed(2)}`);
          await db.collection('players').doc(playerId).update({
            globalRating: latestRating
          });
        }
      }
    }
  }
  
  console.log('\n✅ Reparatur abgeschlossen!');
}

fixRatingHistory()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
