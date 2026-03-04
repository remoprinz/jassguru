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

const REMO_ID = 'b16c1120111b7d9e7d733837';
const TOURNAMENT_ID = '6RdW4o4PRv0UzsZWysex';
const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

async function checkRemoSubcollections() {
  console.log('\n🔍 PRÜFE: Remo\'s Subcollections nach dem Turnier\n');
  console.log('='.repeat(120));

  // 1. Prüfe partnerStats
  console.log('\n📂 partnerStats:');
  const partnerStatsRef = db.collection(`players/${REMO_ID}/partnerStats`);
  const partnerStatsSnap = await partnerStatsRef.get();
  
  if (partnerStatsSnap.empty) {
    console.log('  ❌ LEER - Keine partnerStats gefunden!');
  } else {
    console.log(`  ✅ ${partnerStatsSnap.size} Einträge gefunden:`);
    partnerStatsSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`    - ${doc.id} (${data.partnerDisplayName}): ${data.gamesPlayedWith || 0} Spiele`);
    });
  }

  // 2. Prüfe opponentStats
  console.log('\n📂 opponentStats:');
  const opponentStatsRef = db.collection(`players/${REMO_ID}/opponentStats`);
  const opponentStatsSnap = await opponentStatsRef.get();
  
  if (opponentStatsSnap.empty) {
    console.log('  ❌ LEER - Keine opponentStats gefunden!');
  } else {
    console.log(`  ✅ ${opponentStatsSnap.size} Einträge gefunden:`);
    opponentStatsSnap.docs.forEach(doc => {
      const data = doc.data();
      console.log(`    - ${doc.id} (${data.opponentDisplayName}): ${data.gamesPlayedAgainst || 0} Spiele`);
    });
  }

  // 3. Prüfe jassGameSummary für das Turnier
  console.log('\n📊 jassGameSummary für Turnier:');
  const jassGameSummaryRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID);
  const jassGameSummarySnap = await jassGameSummaryRef.get();
  
  if (!jassGameSummarySnap.exists) {
    console.log('  ❌ Turnier-Summary nicht gefunden!');
  } else {
    const data = jassGameSummarySnap.data();
    console.log(`  ✅ Turnier-Summary gefunden`);
    console.log(`    participantPlayerIds: ${data.participantPlayerIds?.length || 0} Spieler`);
    console.log(`    Ist Remo dabei? ${data.participantPlayerIds?.includes(REMO_ID) ? 'JA ✅' : 'NEIN ❌'}`);
    
    if (data.gameResults) {
      let remoPasses = 0;
      data.gameResults.forEach(game => {
        const remoInTop = game.teams?.top?.players?.some(p => p.playerId === REMO_ID);
        const remoInBottom = game.teams?.bottom?.players?.some(p => p.playerId === REMO_ID);
        if (remoInTop || remoInBottom) {
          remoPasses++;
          
          // Zeige Remo's Partner und Gegner in dieser Passe
          if (remoPasses === 1) {
            console.log(`\n    Remo's erste Passe (${game.passeLabel}):`);
            const remoTeam = remoInTop ? 'top' : 'bottom';
            const opponentTeam = remoTeam === 'top' ? 'bottom' : 'top';
            
            const partners = game.teams[remoTeam].players.filter(p => p.playerId !== REMO_ID);
            const opponents = game.teams[opponentTeam].players;
            
            console.log(`      Partner: ${partners.map(p => p.displayName).join(', ')}`);
            console.log(`      Gegner: ${opponents.map(p => p.displayName).join(', ')}`);
          }
        }
      });
      console.log(`    Remo hat ${remoPasses} von ${data.gameResults.length} Passen gespielt`);
    }
  }

  console.log('\n' + '='.repeat(120) + '\n');
}

checkRemoSubcollections().catch(console.error);
