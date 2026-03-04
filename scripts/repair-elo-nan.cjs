/**
 * Repariert korrupte playerFinalRatings.ratingDelta Werte in jassGameSummaries
 * 
 * Problem: Einige ratingDelta Werte sind Strings statt Zahlen (z.B. "-4.07[object Object]")
 * Lösung: Extrahiere die Zahl aus dem String-Prefix oder berechne neu aus ratingHistory
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const DRY_RUN = false; // Auf false setzen um tatsächlich zu schreiben

async function repair() {
  console.log(`🔧 Repariere korrupte Elo-Deltas (DRY_RUN: ${DRY_RUN})\n`);
  console.log('='.repeat(60));
  
  // Hole alle jassGameSummaries
  const summariesRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`);
  const summariesSnap = await summariesRef
    .where('status', '==', 'completed')
    .get();
  
  if (summariesSnap.empty) {
    console.log('Keine abgeschlossenen Sessions gefunden.');
    return;
  }
  
  console.log(`📊 Prüfe ${summariesSnap.size} Sessions...\n`);
  
  let totalFixed = 0;
  
  for (const doc of summariesSnap.docs) {
    const data = doc.data();
    const sessionId = doc.id;
    const playerFinalRatings = data.playerFinalRatings;
    
    if (!playerFinalRatings || Object.keys(playerFinalRatings).length === 0) {
      continue;
    }
    
    let hasCorruptData = false;
    const fixedRatings = { ...playerFinalRatings };
    
    for (const [playerId, ratingData] of Object.entries(playerFinalRatings)) {
      const rd = ratingData;
      const ratingDelta = rd.ratingDelta;
      
      // Prüfe auf korrupte Daten
      const isCorrupt = 
        typeof ratingDelta === 'string' || 
        (typeof ratingDelta === 'number' && isNaN(ratingDelta)) ||
        (typeof ratingDelta === 'object');
      
      if (isCorrupt) {
        hasCorruptData = true;
        console.log(`\n📝 Session ${sessionId}: ${rd.displayName || playerId}`);
        console.log(`   Korrupt: ${typeof ratingDelta} = "${ratingDelta}"`);
        
        // Versuche Zahl zu extrahieren
        let fixedDelta = 0;
        
        if (typeof ratingDelta === 'string') {
          // Versuche Zahl am Anfang zu parsen
          const match = ratingDelta.match(/^(-?\d+\.?\d*)/);
          if (match) {
            fixedDelta = parseFloat(match[1]);
            console.log(`   ✅ Extrahiert: ${fixedDelta.toFixed(2)}`);
          }
        } else if (typeof ratingDelta === 'object' && ratingDelta !== null) {
          // Versuche .delta zu extrahieren
          if (typeof ratingDelta.delta === 'number') {
            fixedDelta = ratingDelta.delta;
            console.log(`   ✅ Aus Objekt extrahiert: ${fixedDelta.toFixed(2)}`);
          }
        }
        
        // Falls immer noch 0, versuche aus ratingHistory zu berechnen
        if (fixedDelta === 0 && data.isTournamentSession) {
          try {
            const historySnap = await db.collection(`players/${playerId}/ratingHistory`)
              .where('tournamentId', '==', sessionId)
              .get();
            
            if (!historySnap.empty) {
              let sum = 0;
              historySnap.docs.forEach(hDoc => {
                const h = hDoc.data();
                if (typeof h.delta === 'number' && !isNaN(h.delta)) {
                  sum += h.delta;
                }
              });
              if (sum !== 0) {
                fixedDelta = sum;
                console.log(`   ✅ Aus ratingHistory berechnet: ${fixedDelta.toFixed(2)} (${historySnap.size} Einträge)`);
              }
            }
          } catch (e) {
            // Index fehlt - überspringen
            console.log(`   ⚠️  Kann ratingHistory nicht laden (Index fehlt)`);
          }
        }
        
        fixedRatings[playerId] = {
          ...rd,
          ratingDelta: fixedDelta
        };
        
        totalFixed++;
      }
    }
    
    // Update wenn korrupte Daten gefunden
    if (hasCorruptData) {
      if (!DRY_RUN) {
        await doc.ref.update({ playerFinalRatings: fixedRatings });
        console.log(`   💾 Session ${sessionId} aktualisiert`);
      } else {
        console.log(`   🔍 [DRY RUN] Würde Session ${sessionId} aktualisieren`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`✅ ${totalFixed} korrupte Einträge ${DRY_RUN ? 'gefunden' : 'repariert'}`);
  
  if (DRY_RUN && totalFixed > 0) {
    console.log('\n⚠️  Setze DRY_RUN = false um tatsächlich zu reparieren');
  }
}

repair()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
