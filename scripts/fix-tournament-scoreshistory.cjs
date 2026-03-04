/**
 * 🔧 FIX: Korrigiere scoresHistory-Einträge für das Turnier
 * 
 * Das Problem: scoresHistory wurde aus korrupten eventCounts berechnet
 * Die Lösung: Berechne korrekte Werte aus finalStriche
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';
const TOURNAMENT_ID = 'RQeWFEI1YWcs2ptgZtbC';

async function fix() {
  console.log('🔧 FIX: Korrigiere scoresHistory-Einträge für Turnier\n');
  
  // 1. Lade Tournament jassGameSummary
  const summaryDoc = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`).doc(TOURNAMENT_ID).get();
  const data = summaryDoc.data();
  const gameResults = data.gameResults || [];
  const participantPlayerIds = data.participantPlayerIds || [];
  
  console.log(`Turnier: ${TOURNAMENT_ID}`);
  console.log(`Teilnehmer: ${participantPlayerIds.length}\n`);
  
  // 2. Berechne korrekte Werte für jeden Spieler aus finalStriche
  const corrections = {};
  
  participantPlayerIds.forEach(playerId => {
    corrections[playerId] = {
      matschMade: 0,
      matschReceived: 0,
      schneiderMade: 0,
      schneiderReceived: 0,
      kontermatschMade: 0,
      kontermatschReceived: 0
    };
  });
  
  gameResults.forEach(game => {
    const gameTeams = game.teams || {};
    const gameFinalStriche = game.finalStriche || {};
    const topStriche = gameFinalStriche.top || {};
    const bottomStriche = gameFinalStriche.bottom || {};
    
    const topPlayerIds = gameTeams.top?.players?.map(p => p.playerId) || [];
    const bottomPlayerIds = gameTeams.bottom?.players?.map(p => p.playerId) || [];
    
    // Top Team
    topPlayerIds.forEach(pid => {
      if (corrections[pid]) {
        corrections[pid].matschMade += topStriche.matsch || 0;
        corrections[pid].matschReceived += bottomStriche.matsch || 0;
        corrections[pid].schneiderMade += topStriche.schneider || 0;
        corrections[pid].schneiderReceived += bottomStriche.schneider || 0;
        corrections[pid].kontermatschMade += topStriche.kontermatsch || 0;
        corrections[pid].kontermatschReceived += bottomStriche.kontermatsch || 0;
      }
    });
    
    // Bottom Team
    bottomPlayerIds.forEach(pid => {
      if (corrections[pid]) {
        corrections[pid].matschMade += bottomStriche.matsch || 0;
        corrections[pid].matschReceived += topStriche.matsch || 0;
        corrections[pid].schneiderMade += bottomStriche.schneider || 0;
        corrections[pid].schneiderReceived += topStriche.schneider || 0;
        corrections[pid].kontermatschMade += bottomStriche.kontermatsch || 0;
        corrections[pid].kontermatschReceived += topStriche.kontermatsch || 0;
      }
    });
  });
  
  // 3. Update scoresHistory für jeden Spieler
  let updated = 0;
  
  for (const [playerId, events] of Object.entries(corrections)) {
    const matschBilanz = events.matschMade - events.matschReceived;
    const schneiderBilanz = events.schneiderMade - events.schneiderReceived;
    const kontermatschBilanz = events.kontermatschMade - events.kontermatschReceived;
    
    // Finde den scoresHistory-Eintrag für dieses Turnier
    const scoresHistorySnap = await db.collection(`players/${playerId}/scoresHistory`)
      .where('sessionId', '==', TOURNAMENT_ID)
      .limit(1)
      .get();
    
    if (!scoresHistorySnap.empty) {
      const docRef = scoresHistorySnap.docs[0].ref;
      const oldData = scoresHistorySnap.docs[0].data();
      
      // Lade Spielername
      const playerDoc = await db.doc(`players/${playerId}`).get();
      const playerName = playerDoc.data()?.displayName || playerId;
      
      if (oldData.matschBilanz !== matschBilanz) {
        console.log(`📝 ${playerName}:`);
        console.log(`   matschBilanz: ${oldData.matschBilanz} → ${matschBilanz}`);
        
        await docRef.update({
          matschBilanz,
          schneiderBilanz,
          kontermatschBilanz
        });
        updated++;
      }
    }
  }
  
  // 4. Update auch totalEventCountsByPlayer im jassGameSummary
  console.log('\n📝 Korrigiere totalEventCountsByPlayer im jassGameSummary...');
  
  const newTotalEventCountsByPlayer = {};
  for (const [playerId, events] of Object.entries(corrections)) {
    newTotalEventCountsByPlayer[playerId] = events;
  }
  
  await db.doc(`groups/${GROUP_ID}/jassGameSummaries/${TOURNAMENT_ID}`).update({
    totalEventCountsByPlayer: newTotalEventCountsByPlayer
  });
  
  console.log(`\n✅ ${updated} scoresHistory-Einträge korrigiert`);
  console.log('✅ totalEventCountsByPlayer im jassGameSummary korrigiert');
}

fix()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
