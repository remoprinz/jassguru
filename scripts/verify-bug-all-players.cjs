/**
 * Verifiziert den Bug bei ALLEN 8 Spielern
 * NUR LESEN - keine Änderungen
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

async function analyzePlayer(playerId, playerName) {
  const historyRef = db.collection(`players/${playerId}/ratingHistory`);
  const historySnap = await historyRef.orderBy('completedAt', 'asc').get();
  
  // Finde Rating VOR dem Turnier
  let ratingBeforeTournament = null;
  let lastNonTournamentEntry = null;
  
  const tournamentEntries = [];
  
  historySnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.tournamentId === TOURNAMENT_ID) {
      tournamentEntries.push({
        passeNumber: data.passeNumber,
        rating: data.rating,
        delta: typeof data.delta === 'number' ? data.delta : 0,
        completedAt: data.completedAt?.toDate?.()
      });
    } else {
      lastNonTournamentEntry = data;
    }
  });
  
  if (lastNonTournamentEntry) {
    ratingBeforeTournament = lastNonTournamentEntry.rating;
  }
  
  // Sortiere Turnier-Einträge nach Passe-Nummer
  tournamentEntries.sort((a, b) => (a.passeNumber || 0) - (b.passeNumber || 0));
  
  // Analysiere das Muster
  const analysis = {
    name: playerName,
    ratingBeforeTournament,
    entries: tournamentEntries.length,
    totalDelta: tournamentEntries.reduce((sum, e) => sum + e.delta, 0),
    bugConfirmed: false,
    details: []
  };
  
  if (tournamentEntries.length >= 2) {
    // Berechne das implizierte "finale" Rating, das als Basis verwendet wurde
    // Formel: gespeichertes_rating = finales_rating + delta
    // Also: finales_rating = gespeichertes_rating - delta
    const impliedFinalRatings = tournamentEntries.map(e => e.rating - e.delta);
    
    // Prüfe ob alle implizierten Basis-Ratings gleich sind (das wäre der Bug)
    const firstImplied = impliedFinalRatings[0];
    const allSame = impliedFinalRatings.every(r => Math.abs(r - firstImplied) < 0.1);
    
    if (allSame) {
      analysis.bugConfirmed = true;
      analysis.impliedBaseRating = firstImplied;
    }
    
    // Berechne was korrekt wäre
    let correctRating = ratingBeforeTournament || 100;
    
    tournamentEntries.forEach((entry, i) => {
      const expectedRating = correctRating + entry.delta;
      correctRating = expectedRating;
      
      const impliedBase = entry.rating - entry.delta;
      const diff = entry.rating - expectedRating;
      
      analysis.details.push({
        passe: entry.passeNumber,
        storedRating: entry.rating,
        delta: entry.delta,
        correctRating: expectedRating,
        difference: diff,
        impliedBase
      });
    });
  }
  
  return analysis;
}

async function verify() {
  console.log('🔍 BUG-VERIFIZIERUNG FÜR ALLE 8 SPIELER\n');
  console.log('='.repeat(80));
  
  let allHaveBug = true;
  const results = [];
  
  for (const { id, name } of PARTICIPANTS) {
    const analysis = await analyzePlayer(id, name);
    results.push(analysis);
    
    console.log(`\n👤 ${name}`);
    console.log(`   Rating vor Turnier: ${analysis.ratingBeforeTournament?.toFixed(2) || 'N/A'}`);
    console.log(`   Turnier-Einträge: ${analysis.entries}`);
    console.log(`   Gesamt-Delta: ${analysis.totalDelta >= 0 ? '+' : ''}${analysis.totalDelta.toFixed(2)}`);
    
    if (analysis.bugConfirmed) {
      console.log(`   ✅ BUG BESTÄTIGT: Alle Passen verwenden Basis-Rating ${analysis.impliedBaseRating.toFixed(2)}`);
    } else {
      console.log(`   ❓ Bug nicht eindeutig bestätigt`);
      allHaveBug = false;
    }
    
    if (analysis.details.length > 0) {
      console.log(`\n   Passe | Gespeichert | Delta   | Korrekt wäre | Differenz`);
      console.log(`   ${'-'.repeat(60)}`);
      
      analysis.details.forEach(d => {
        const stored = d.storedRating.toFixed(2).padStart(7);
        const delta = (d.delta >= 0 ? '+' : '') + d.delta.toFixed(2).padStart(5);
        const correct = d.correctRating.toFixed(2).padStart(7);
        const diff = (d.difference >= 0 ? '+' : '') + d.difference.toFixed(2).padStart(6);
        console.log(`   ${d.passe}     | ${stored}     | ${delta}   | ${correct}      | ${diff}`);
      });
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(80));
  
  const confirmedCount = results.filter(r => r.bugConfirmed).length;
  console.log(`\nBug bestätigt bei: ${confirmedCount} / ${results.length} Spielern`);
  
  if (allHaveBug) {
    console.log('\n✅ BUG IST BEI ALLEN 8 SPIELERN IDENTISCH BESTÄTIGT!');
    console.log('\nDas Problem: Für jede Passe wird geschrieben:');
    console.log('   rating = finales_rating + delta_dieser_passe');
    console.log('\nKorrekt wäre:');
    console.log('   rating = vorheriges_rating + delta_dieser_passe');
  } else {
    console.log('\n⚠️ Bug ist nicht bei allen Spielern gleich!');
  }
  
  return allHaveBug;
}

verify()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
