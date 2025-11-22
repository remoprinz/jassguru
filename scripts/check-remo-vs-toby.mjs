import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const remoId = 'b16c1120111b7d9e7d733837';
const tobyId = 'EvX9acReG6t45Ws7ZJ1F';

async function check() {
  console.log('🔍 PRÜFE: Remo vs Toby');
  
  // 1. Check opponentStats
  const doc = await db.collection('players').doc(remoId).collection('opponentStats').doc(tobyId).get();
  if (doc.exists) {
    console.log('✅ Eintrag in opponentStats GEFUNDEN:', doc.data());
  } else {
    console.log('❌ KEIN Eintrag in opponentStats!');
  }
  
  // 2. Suche Sessions wo sie gegeneinander gespielt haben
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  const sessions = await db.collection('groups').doc(groupId).collection('jassGameSummaries').get();
  
  let playedAgainst = 0;
  
  for (const s of sessions.docs) {
    const data = s.data();
    const pIds = data.participantPlayerIds || [];
    
    if (pIds.includes(remoId) && pIds.includes(tobyId)) {
      // Beide waren dabei. Haben sie GEGENEINANDER gespielt?
      let playedAgainstInSession = false;
      
      if (data.gameResults) {
        data.gameResults.forEach(g => {
          const top = g.teams?.top?.players || [];
          const bottom = g.teams?.bottom?.players || [];
          
          const remoTop = top.some(p => p.playerId === remoId);
          const remoBottom = bottom.some(p => p.playerId === remoId);
          
          const tobyTop = top.some(p => p.playerId === tobyId);
          const tobyBottom = bottom.some(p => p.playerId === tobyId);
          
          if ((remoTop && tobyBottom) || (remoBottom && tobyTop)) {
            playedAgainstInSession = true;
          }
        });
      } else {
        // Regular Session
        const top = data.teams?.top?.players || [];
        const bottom = data.teams?.bottom?.players || [];
        
        const remoTop = top.some(p => p.playerId === remoId);
        const remoBottom = bottom.some(p => p.playerId === remoId);
        
        const tobyTop = top.some(p => p.playerId === tobyId);
        const tobyBottom = bottom.some(p => p.playerId === tobyId);
        
        if ((remoTop && tobyBottom) || (remoBottom && tobyTop)) {
          playedAgainstInSession = true;
        }
      }
      
      if (playedAgainstInSession) {
        console.log(`📅 Gegeneinander am ${data.completedAt.toDate().toLocaleDateString()}`);
        playedAgainst++;
      }
    }
  }
  
  console.log(`\nTotal Sessions gegeneinander: ${playedAgainst}`);
  process.exit(0);
}

check().catch(console.error);
