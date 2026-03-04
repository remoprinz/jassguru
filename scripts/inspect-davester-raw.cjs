/**
 * NUR LESEN - Keine Änderungen!
 * Untersucht die exakten ratingHistory-Einträge für Davester
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const DAVESTER_PLAYER_ID = '4nhOwuVONajPArNERzyEj';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

async function inspect() {
  console.log('🔍 RAW DATA INSPECTION - DAVESTER\n');
  console.log('='.repeat(80));
  
  // Hole ALLE ratingHistory Einträge
  const historyRef = db.collection(`players/${DAVESTER_PLAYER_ID}/ratingHistory`);
  const historySnap = await historyRef.orderBy('completedAt', 'asc').get();
  
  console.log(`\n📊 Alle ${historySnap.size} ratingHistory Einträge:\n`);
  
  let prevRating = null;
  
  historySnap.docs.forEach((doc, i) => {
    const data = doc.data();
    const completedAt = data.completedAt?.toDate?.();
    const isTournament = data.tournamentId === TOURNAMENT_ID;
    
    // Berechne erwartetes Rating
    let expectedRating = null;
    if (prevRating !== null && typeof data.delta === 'number') {
      expectedRating = prevRating + data.delta;
    }
    
    const ratingMismatch = expectedRating !== null && 
                           typeof data.rating === 'number' &&
                           Math.abs(expectedRating - data.rating) > 0.01;
    
    const marker = isTournament ? '🏆 TURNIER' : '   ';
    const mismatchMarker = ratingMismatch ? ' ⚠️ MISMATCH!' : '';
    
    console.log(`${i+1}. ${marker}${mismatchMarker}`);
    console.log(`   Doc-ID: ${doc.id}`);
    console.log(`   Datum: ${completedAt?.toLocaleString('de-CH') || 'N/A'}`);
    console.log(`   Rating: ${data.rating}`);
    console.log(`   Delta: ${JSON.stringify(data.delta)}`);
    console.log(`   Passe-Nr: ${data.passeNumber || 'N/A'}`);
    console.log(`   Won: ${data.won}`);
    console.log(`   SessionId: ${data.sessionId || 'N/A'}`);
    console.log(`   TournamentId: ${data.tournamentId || 'N/A'}`);
    console.log(`   EventType: ${data.eventType || 'N/A'}`);
    
    if (ratingMismatch) {
      console.log(`   ⚠️ Erwartet: ${expectedRating?.toFixed(2)} (${prevRating?.toFixed(2)} + ${data.delta})`);
      console.log(`   ⚠️ Tatsächlich: ${data.rating}`);
      console.log(`   ⚠️ Differenz: ${(data.rating - expectedRating).toFixed(2)}`);
    }
    
    console.log('');
    
    if (typeof data.rating === 'number') {
      prevRating = data.rating;
    }
  });
  
  // Spezifische Analyse der Turnier-Einträge
  console.log('\n' + '='.repeat(80));
  console.log('🏆 NUR TURNIER-EINTRÄGE (chronologisch):');
  console.log('='.repeat(80));
  
  const tournamentEntries = historySnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(e => e.tournamentId === TOURNAMENT_ID)
    .sort((a, b) => {
      const aTime = a.completedAt?.toMillis?.() || 0;
      const bTime = b.completedAt?.toMillis?.() || 0;
      return aTime - bTime;
    });
  
  console.log(`\n${tournamentEntries.length} Turnier-Einträge gefunden:\n`);
  
  let prevTournamentRating = null;
  
  tournamentEntries.forEach((e, i) => {
    const completedAt = e.completedAt?.toDate?.();
    const delta = typeof e.delta === 'number' ? e.delta : 0;
    
    console.log(`PASSE ${e.passeNumber || i+1}:`);
    console.log(`   Zeit: ${completedAt?.toLocaleTimeString('de-CH') || 'N/A'}`);
    console.log(`   Rating NACH Spiel: ${e.rating}`);
    console.log(`   Delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);
    console.log(`   Won: ${e.won}`);
    
    if (prevTournamentRating !== null) {
      const expectedRating = prevTournamentRating + delta;
      const actualRating = e.rating;
      
      console.log(`   Vorheriges Rating: ${prevTournamentRating.toFixed(2)}`);
      console.log(`   Erwartet: ${prevTournamentRating.toFixed(2)} + ${delta.toFixed(2)} = ${expectedRating.toFixed(2)}`);
      
      if (Math.abs(expectedRating - actualRating) > 0.01) {
        console.log(`   ⚠️⚠️⚠️ FEHLER: Gespeichert ist ${actualRating.toFixed(2)}, nicht ${expectedRating.toFixed(2)}!`);
      }
    }
    
    console.log('');
    prevTournamentRating = e.rating;
  });
  
  // Was war das Rating VOR dem Turnier?
  console.log('\n' + '='.repeat(80));
  console.log('📊 RATING VOR DEM TURNIER:');
  console.log('='.repeat(80));
  
  const preTournamentEntries = historySnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(e => e.tournamentId !== TOURNAMENT_ID)
    .sort((a, b) => {
      const aTime = a.completedAt?.toMillis?.() || 0;
      const bTime = b.completedAt?.toMillis?.() || 0;
      return bTime - aTime; // Neueste zuerst
    });
  
  if (preTournamentEntries.length > 0) {
    const lastPreTournament = preTournamentEntries[0];
    console.log(`\nLetzter Eintrag vor Turnier:`);
    console.log(`   Datum: ${lastPreTournament.completedAt?.toDate?.().toLocaleString('de-CH')}`);
    console.log(`   Rating: ${lastPreTournament.rating}`);
    console.log(`   Session: ${lastPreTournament.sessionId || 'N/A'}`);
  }
  
  if (tournamentEntries.length > 0) {
    const firstTournament = tournamentEntries[0];
    const firstDelta = typeof firstTournament.delta === 'number' ? firstTournament.delta : 0;
    const impliedStartRating = firstTournament.rating - firstDelta;
    
    console.log(`\n   Erstes Turnier-Rating: ${firstTournament.rating}`);
    console.log(`   Erstes Turnier-Delta: ${firstDelta >= 0 ? '+' : ''}${firstDelta.toFixed(2)}`);
    console.log(`   → Impliziertes Start-Rating: ${impliedStartRating.toFixed(2)}`);
  }
}

inspect()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
