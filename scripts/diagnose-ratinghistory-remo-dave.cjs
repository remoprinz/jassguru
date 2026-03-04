/**
 * Detaillierte ratingHistory Analyse für Remo und Davester
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

// Spieler-IDs
const REMO_PLAYER_ID = 'b16c1120111b7d9e7d733837';
const DAVE_PLAYER_ID = '4nhOwuVONajPArNERzyEj';

async function analyzePlayer(playerId, name) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`👤 ${name} (${playerId})`);
  console.log('='.repeat(70));
  
  // Hole ALLE ratingHistory Einträge, dann filtere nach Turnier
  const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
    .orderBy('completedAt', 'asc')
    .get();
  
  console.log(`\n📊 Gesamt ${historySnap.size} ratingHistory Einträge`);
  
  // Filtere nach Turnier und zeige Details
  const tournamentEntries = [];
  
  historySnap.docs.forEach((doc, i) => {
    const h = doc.data();
    
    // Zeige letzte 10 Einträge generell
    if (i >= historySnap.size - 10) {
      const date = h.completedAt?.toDate?.();
      const dateStr = date ? date.toLocaleString('de-CH') : 'N/A';
      const isTournament = h.tournamentId === TOURNAMENT_ID;
      const marker = isTournament ? '🏆' : '  ';
      
      console.log(`\n${marker} Eintrag ${i + 1}:`);
      console.log(`   Datum: ${dateStr}`);
      console.log(`   Rating: ${h.rating?.toFixed(2) || '?'}`);
      console.log(`   Delta: ${h.delta?.toFixed?.(2) || h.delta || '?'}`);
      console.log(`   Gewonnen: ${h.won ? 'Ja' : 'Nein'}`);
      console.log(`   Turnier-ID: ${h.tournamentId || 'N/A'}`);
      console.log(`   Session-ID: ${h.sessionId || 'N/A'}`);
      console.log(`   Passe-Nr: ${h.passeNumber || 'N/A'}`);
      
      if (isTournament) {
        tournamentEntries.push({
          index: i,
          docId: doc.id,
          ...h
        });
      }
    }
  });
  
  // Zeige nur Turnier-Einträge
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`🏆 TURNIER-EINTRÄGE (${TOURNAMENT_ID}):`);
  console.log('─'.repeat(50));
  
  if (tournamentEntries.length === 0) {
    // Manuell nach Turnier-ID suchen
    console.log('Suche manuell nach Turnier-Einträgen...');
    
    historySnap.docs.forEach((doc, i) => {
      const h = doc.data();
      if (h.tournamentId === TOURNAMENT_ID || h.sessionId === TOURNAMENT_ID) {
        console.log(`\n   Eintrag ${i + 1} (${doc.id}):`);
        console.log(`   Rating: ${h.rating?.toFixed(2)} | Delta: ${typeof h.delta === 'number' ? h.delta.toFixed(2) : h.delta}`);
        console.log(`   Gewonnen: ${h.won ? 'Ja' : 'Nein'} | Passe: ${h.passeNumber || 'N/A'}`);
        console.log(`   CompletedAt: ${h.completedAt?.toDate?.().toLocaleString('de-CH') || 'N/A'}`);
        
        tournamentEntries.push(h);
      }
    });
  }
  
  // Berechne Gesamt-Delta für das Turnier
  let totalDelta = 0;
  let winsCount = 0;
  let lossCount = 0;
  
  tournamentEntries.forEach(e => {
    const delta = typeof e.delta === 'number' ? e.delta : 0;
    totalDelta += delta;
    if (e.won) winsCount++;
    else lossCount++;
  });
  
  console.log(`\n📈 ZUSAMMENFASSUNG FÜR ${name}:`);
  console.log(`   Turnier-Spiele: ${tournamentEntries.length}`);
  console.log(`   Siege: ${winsCount}`);
  console.log(`   Niederlagen: ${lossCount}`);
  console.log(`   Gesamt Elo-Delta: ${totalDelta >= 0 ? '+' : ''}${totalDelta.toFixed(2)}`);
  
  // Prüfe, ob die Einträge in korrekter Reihenfolge sind
  console.log(`\n🔍 CHRONOLOGISCHE REIHENFOLGE:`);
  tournamentEntries.sort((a, b) => {
    const aTime = a.completedAt?.toDate?.().getTime() || 0;
    const bTime = b.completedAt?.toDate?.().getTime() || 0;
    return aTime - bTime;
  });
  
  let runningRating = null;
  tournamentEntries.forEach((e, i) => {
    const date = e.completedAt?.toDate?.();
    const dateStr = date ? date.toLocaleTimeString('de-CH') : 'N/A';
    const delta = typeof e.delta === 'number' ? e.delta : 0;
    const wonStr = e.won ? '✅ Sieg' : '❌ Niederlage';
    
    // Berechne erwartetes Rating
    const expectedRating = runningRating !== null ? runningRating + delta : e.rating;
    const actualRating = e.rating;
    const ratingMatch = Math.abs(expectedRating - actualRating) < 0.01;
    
    console.log(`   ${i + 1}. [${dateStr}] Passe ${e.passeNumber || '?'}: ${wonStr}`);
    console.log(`      Rating: ${actualRating?.toFixed(2)} | Delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`);
    
    if (runningRating !== null && !ratingMatch) {
      console.log(`      ⚠️ Rating-Sprung! Erwartet: ${expectedRating.toFixed(2)}, Tatsächlich: ${actualRating.toFixed(2)}`);
    }
    
    runningRating = actualRating;
  });
  
  return tournamentEntries;
}

async function analyze() {
  console.log('🔍 DETAILLIERTE RATING-HISTORY ANALYSE\n');
  
  await analyzePlayer(REMO_PLAYER_ID, 'Remo');
  await analyzePlayer(DAVE_PLAYER_ID, 'Davester');
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Analyse abgeschlossen');
}

analyze()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
