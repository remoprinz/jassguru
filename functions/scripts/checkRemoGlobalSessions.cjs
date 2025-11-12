const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jassguru.firebaseio.com"
});

const db = admin.firestore();

async function check() {
  const remoId = 'b16c1120111b7d9e7d733837';
  
  // Get all sessions where Remo participated
  const groups = await db.collection('groups').get();
  let totalSessions = 0;
  let sessionsWon = 0;
  let sessionsLost = 0;
  let sessionsDraw = 0;
  
  for (const groupDoc of groups.docs) {
    const groupId = groupDoc.id;
    const sessionsSnap = await db
      .collection(`groups/${groupId}/jassGameSummaries`)
      .where('participantPlayerIds', 'array-contains', remoId)
      .where('status', '==', 'completed')
      .get();
    
    for (const sessionDoc of sessionsSnap.docs) {
      const session = sessionDoc.data();
      
      // Determine team correctly from session.teams
      let team = null;
      if (session.teams?.top?.players) {
        const isInTopTeam = session.teams.top.players.some(p => p.playerId === remoId);
        if (isInTopTeam) team = 'top';
      }
      if (!team && session.teams?.bottom?.players) {
        const isInBottomTeam = session.teams.bottom.players.some(p => p.playerId === remoId);
        if (isInBottomTeam) team = 'bottom';
      }
      if (!team) continue;
      
      const winnerTeamKey = session.winnerTeamKey;
      
      totalSessions++;
      if (winnerTeamKey === 'draw') {
        sessionsDraw++;
      } else if (winnerTeamKey === team) {
        sessionsWon++;
      } else {
        sessionsLost++;
      }
    }
  }
  
  const winRate = totalSessions > 0 ? (sessionsWon / totalSessions * 100) : 0;
  
  console.log('\n=== REMO GLOBAL SESSION STATS ===\n');
  console.log(`Total Sessions: ${totalSessions}`);
  console.log(`Won: ${sessionsWon}`);
  console.log(`Lost: ${sessionsLost}`);
  console.log(`Draw: ${sessionsDraw}`);
  console.log(`Win Rate: ${winRate.toFixed(1)}%`);
  
  await admin.app().delete();
  process.exit(0);
}

check().catch(console.error);
