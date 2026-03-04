/**
 * Diagnose: Warum zeigt GroupView (NaN) für Elo-Differenzen an?
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

async function diagnose() {
  console.log('🔍 Diagnose: Elo NaN-Problem\n');
  console.log('='.repeat(60));
  
  // 1. Hole die letzte jassGameSummary
  const summariesRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`);
  const summariesSnap = await summariesRef
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'desc')
    .limit(3)
    .get();
  
  if (summariesSnap.empty) {
    console.log('❌ Keine abgeschlossenen Sessions gefunden!');
    return;
  }
  
  console.log(`📊 Gefunden: ${summariesSnap.size} abgeschlossene Sessions\n`);
  
  for (const doc of summariesSnap.docs) {
    const data = doc.data();
    console.log(`\n📝 Session: ${doc.id}`);
    console.log(`   Name: ${data.name || 'N/A'}`);
    console.log(`   CompletedAt: ${data.completedAt?.toDate?.() || 'N/A'}`);
    console.log(`   isTournamentSession: ${data.isTournamentSession || false}`);
    
    const playerFinalRatings = data.playerFinalRatings;
    
    if (!playerFinalRatings || Object.keys(playerFinalRatings).length === 0) {
      console.log(`   ⚠️  Keine playerFinalRatings vorhanden!`);
      continue;
    }
    
    console.log(`\n   👥 playerFinalRatings (${Object.keys(playerFinalRatings).length} Spieler):`);
    
    for (const [playerId, ratingData] of Object.entries(playerFinalRatings)) {
      const rd = ratingData;
      const rating = rd.rating;
      const ratingDelta = rd.ratingDelta;
      const displayName = rd.displayName;
      
      // Prüfe auf NaN oder ungültige Werte
      const isRatingNaN = typeof rating !== 'number' || isNaN(rating);
      const isDeltaNaN = typeof ratingDelta !== 'number' || isNaN(ratingDelta);
      
      const ratingStr = isRatingNaN ? `❌ NaN (${typeof rating}: ${rating})` : rating?.toFixed?.(2) || rating;
      const deltaStr = isDeltaNaN ? `❌ NaN (${typeof ratingDelta}: ${ratingDelta})` : ratingDelta?.toFixed?.(2) || ratingDelta;
      
      console.log(`      - ${displayName || playerId}:`);
      console.log(`        Rating: ${ratingStr}`);
      console.log(`        Delta: ${deltaStr}`);
      
      if (isDeltaNaN) {
        // Untersuche ratingHistory für diesen Spieler
        console.log(`\n        🔍 Untersuche ratingHistory für ${playerId}...`);
        
        const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
          .where('tournamentId', '==', doc.id)
          .orderBy('passeNumber', 'asc')
          .get();
        
        if (historySnap.empty) {
          console.log(`        ⚠️  Keine ratingHistory Einträge für dieses Turnier!`);
        } else {
          console.log(`        📊 ${historySnap.size} ratingHistory Einträge:`);
          historySnap.docs.forEach((histDoc, i) => {
            const h = histDoc.data();
            const deltaVal = h.delta;
            const isDelta2NaN = typeof deltaVal !== 'number' || isNaN(deltaVal);
            console.log(`           ${i+1}. Passe ${h.passeNumber}: delta=${isDelta2NaN ? `❌ NaN (${typeof deltaVal}: ${deltaVal})` : deltaVal?.toFixed?.(2) || deltaVal}, rating=${h.rating?.toFixed?.(2) || h.rating}`);
          });
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Diagnose abgeschlossen');
}

diagnose()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
