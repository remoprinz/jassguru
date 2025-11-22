import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const groupId = 'Tz0wgIHMTlhvTtFastiJ';

async function scanAllMatsches() {
  console.log('🔍 SCANNE: Alle Sessions auf Matsches...');
  
  const sessions = await db.collection('groups').doc(groupId).collection('jassGameSummaries')
    .orderBy('completedAt', 'asc')
    .get();
    
  let matschCount = 0;
  
  for (const doc of sessions.docs) {
    const data = doc.data();
    const date = data.completedAt.toDate().toLocaleDateString('de-DE');
    let matschesInSession = 0;
    
    if (data.gameResults && data.gameResults.length > 0) {
      // Turnier
      data.gameResults.forEach(game => {
        const top = game.eventCounts?.top?.matsch || 0;
        const bottom = game.eventCounts?.bottom?.matsch || 0;
        matschesInSession += (top + bottom);
      });
    } else {
      // Regular
      const top = data.eventCounts?.top?.matsch || 0;
      const bottom = data.eventCounts?.bottom?.matsch || 0;
      matschesInSession += (top + bottom);
    }
    
    if (matschesInSession > 0) {
      console.log(`📅 ${date}: ${matschesInSession} Matsches gefunden!`);
      matschCount++;
    }
  }
  
  console.log(`\nTotal Sessions mit Matsch: ${matschCount}`);
  process.exit(0);
}

scanAllMatsches().catch(console.error);
