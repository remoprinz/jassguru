/**
 * Debug-Script: Prüfe Session-Struktur
 */

const admin = require('firebase-admin');
const path = require('path');

admin.initializeApp({
  credential: admin.credential.cert(require(path.join(__dirname, '../../serviceAccountKey.json'))),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

async function debugSessions() {
  const players = await db.collection('players').get();
  const testPlayerId = 'b16c1120111b7d9e7d733837';
  
  const groups = await db.collection('groups').get();
  const allSessions = [];
  
  for (const group of groups.docs) {
    const sessionsSnap = await db
      .collection(`groups/${group.id}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .limit(5)
      .get();
    
    for (const doc of sessionsSnap.docs) {
      allSessions.push({
        id: doc.id,
        groupId: group.id,
        ...doc.data()
      });
    }
  }
  
  console.log(`\n✅ ${allSessions.length} Sessions gefunden\n`);
  
  for (const session of allSessions) {
    const participantIds = session.participantPlayerIds || [];
    if (!participantIds.includes(testPlayerId)) continue;
    
    console.log(`\n📋 Session: ${session.id}`);
    console.log(`  Group: ${session.groupId}`);
    console.log(`  Tournament: ${session.isTournamentSession ? 'YES' : 'NO'}`);
    console.log(`  Teams:`, JSON.stringify(session.teams, null, 2));
    console.log(`  teamStats:`, JSON.stringify(session.teamStats, null, 2));
    console.log(`  participantPlayerIds:`, participantIds);
    break; // Nur erste Session
  }
  
  await admin.app().delete();
}

debugSessions()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });

