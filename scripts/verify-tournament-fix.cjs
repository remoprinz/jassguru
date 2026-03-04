/**
 * Verifiziert, dass alle korrupten ratingHistory-Einträge repariert wurden
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

// Alle aktiven Turnier-Teilnehmer (ohne Marc und Studi)
const PARTICIPANT_PLAYER_IDS = [
  'b16c1120111b7d9e7d733837', // Remo
  'F1uwdthL6zu7F0cYf1jbe',    // Frank
  'lW2UwWY80w3q8pyj4xufu',    // Roger
  '8f45eac1b70c8ad7a9a9d9cb', // Karim
  '4nhOwuVONajPArNERzyEj',    // Davester
  'EvX9acReG6t45Ws7ZJ1F',     // Toby
  'ZLvyUYt_E5jhaUc0oF7O0',    // Mazi
  'NEROr2WAYG41YEiV9v4ba',    // Fabinski
];

async function verify() {
  console.log('🔍 VERIFIZIERUNG DER REPARATUR\n');
  console.log('='.repeat(70));
  
  let allGood = true;
  const summary = [];
  
  for (const playerId of PARTICIPANT_PLAYER_IDS) {
    // Lade Player-Name
    const playerDoc = await db.collection('players').doc(playerId).get();
    const playerName = playerDoc.data()?.displayName || playerId.substring(0, 8);
    const globalRating = playerDoc.data()?.globalRating;
    
    // Hole alle ratingHistory Einträge für dieses Turnier
    const historyRef = db.collection(`players/${playerId}/ratingHistory`);
    const historySnap = await historyRef.get();
    
    // Filtere nach Turnier-ID
    const tournamentEntries = [];
    let hasCorruptEntry = false;
    
    historySnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.tournamentId === TOURNAMENT_ID) {
        const delta = data.delta;
        const isCorrupt = typeof delta !== 'number' || isNaN(delta);
        
        if (isCorrupt) {
          hasCorruptEntry = true;
        }
        
        tournamentEntries.push({
          id: doc.id,
          passeNumber: data.passeNumber,
          delta: delta,
          rating: data.rating,
          won: data.won,
          isCorrupt
        });
      }
    });
    
    // Sortiere nach completedAt
    tournamentEntries.sort((a, b) => {
      return (a.passeNumber || 0) - (b.passeNumber || 0);
    });
    
    // Berechne Gesamt-Delta
    const totalDelta = tournamentEntries.reduce((sum, e) => {
      return sum + (typeof e.delta === 'number' ? e.delta : 0);
    }, 0);
    
    const status = hasCorruptEntry ? '❌ KORRUPT' : '✅ OK';
    
    console.log(`\n${status} ${playerName}`);
    console.log(`   Einträge: ${tournamentEntries.length}`);
    console.log(`   Gesamt-Delta: ${totalDelta >= 0 ? '+' : ''}${totalDelta.toFixed(2)}`);
    console.log(`   GlobalRating: ${globalRating?.toFixed(2) || 'N/A'}`);
    
    if (tournamentEntries.length > 0) {
      console.log(`   Passen:`);
      tournamentEntries.forEach(e => {
        const wonStr = e.won === true ? '✅' : (e.won === false ? '❌' : '?');
        const deltaStr = typeof e.delta === 'number' 
          ? (e.delta >= 0 ? `+${e.delta.toFixed(2)}` : e.delta.toFixed(2))
          : `KORRUPT: ${typeof e.delta}`;
        console.log(`      ${e.passeNumber || '?'}. ${wonStr} Delta: ${deltaStr}`);
      });
    }
    
    if (hasCorruptEntry) {
      allGood = false;
    }
    
    summary.push({
      name: playerName,
      entries: tournamentEntries.length,
      delta: totalDelta,
      globalRating,
      status: hasCorruptEntry ? 'KORRUPT' : 'OK'
    });
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(70));
  
  console.log('\nSpieler          | Einträge | Turnier-Delta | GlobalRating | Status');
  console.log('-'.repeat(70));
  
  summary.forEach(s => {
    const name = s.name.padEnd(16);
    const entries = String(s.entries).padEnd(8);
    const delta = (s.delta >= 0 ? '+' : '') + s.delta.toFixed(2).padStart(6);
    const rating = s.globalRating?.toFixed(2).padStart(6) || '  N/A ';
    console.log(`${name} | ${entries} | ${delta}        | ${rating}       | ${s.status}`);
  });
  
  console.log('\n' + '='.repeat(70));
  if (allGood) {
    console.log('✅ ALLE DATEN SIND KORREKT - KEINE KORRUPTEN EINTRÄGE GEFUNDEN');
  } else {
    console.log('❌ ES GIBT NOCH KORRUPTE EINTRÄGE - WEITERE REPARATUR NÖTIG');
  }
  
  return allGood;
}

verify()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
