/**
 * Prüfe die ROHDATEN der Passen im Turnier
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

async function check() {
  console.log('📊 ROHDATEN DER PASSEN IM TURNIER\n');
  
  // Lade alle Passen des Turniers
  const passenSnap = await db.collection(`tournaments/${TOURNAMENT_ID}/passen`)
    .orderBy('startedAt', 'asc')
    .get();
  
  console.log(`Anzahl Passen: ${passenSnap.size}\n`);
  
  passenSnap.docs.forEach((doc, index) => {
    const passe = doc.data();
    console.log('='.repeat(80));
    console.log(`📌 PASSE ${index + 1}: ${doc.id} (${passe.passeLabel || '?'})`);
    console.log('='.repeat(80));
    
    // Teams
    const topPlayers = passe.teams?.top?.players?.map(p => p.displayName).join(' & ') || '?';
    const bottomPlayers = passe.teams?.bottom?.players?.map(p => p.displayName).join(' & ') || '?';
    console.log(`   Top:    ${topPlayers}`);
    console.log(`   Bottom: ${bottomPlayers}`);
    
    // Scores
    console.log(`   Score:  ${passe.finalScores?.top || 0} : ${passe.finalScores?.bottom || 0}`);
    
    // Event Counts (falls vorhanden)
    const topEvents = passe.eventCounts?.top || {};
    const bottomEvents = passe.eventCounts?.bottom || {};
    console.log(`   Events Top:    Matsch=${topEvents.matsch || 0}, Schneider=${topEvents.schneider || 0}`);
    console.log(`   Events Bottom: Matsch=${bottomEvents.matsch || 0}, Schneider=${bottomEvents.schneider || 0}`);
    
    // Final Striche
    const topStriche = passe.finalStriche?.top || {};
    const bottomStriche = passe.finalStriche?.bottom || {};
    console.log(`   Striche Top:    matsch=${topStriche.matsch || 0}, sieg=${topStriche.sieg || 0}, berg=${topStriche.berg || 0}`);
    console.log(`   Striche Bottom: matsch=${bottomStriche.matsch || 0}, sieg=${bottomStriche.sieg || 0}, berg=${bottomStriche.berg || 0}`);
    
    console.log('');
  });
}

check()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
