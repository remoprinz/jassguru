const admin = require('firebase-admin');

// Firebase Admin SDK initialisieren
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://jasstafel-c2c1c-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.firestore();

async function debugMarc() {
  const marcId = '1sDvqN_kvqZLB-4eSZFqZ';
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log('🔍 MARC Session-Debug:');
  console.log('PlayerId:', marcId);
  console.log('');
  
  try {
    // Lade alle Sessions der Gruppe
    const sessionsSnap = await db.collection('groups').doc(groupId).collection('jassGameSummaries').get();
    
    const marcSessions = [];
    
    sessionsSnap.forEach(doc => {
      const data = doc.data();
      if (data.participantPlayerIds && data.participantPlayerIds.includes(marcId)) {
        marcSessions.push({
          id: doc.id,
          endedAt: data.endedAt,
          finalScores: data.finalScores,
          finalStriche: data.finalStriche,
          teams: data.teams,
          gamesPlayed: data.gamesPlayed
        });
      }
    });
    
    // Sortiere chronologisch
    marcSessions.sort((a, b) => (a.endedAt?.toMillis() || 0) - (b.endedAt?.toMillis() || 0));
    
    console.log(`📊 ${marcSessions.length} Sessions gefunden:`);
    console.log('');
    
    marcSessions.forEach((session, i) => {
      const date = session.endedAt ? new Date(session.endedAt.toMillis()).toLocaleDateString('de-DE') : 'Unknown';
      const scores = session.finalScores;
      const striche = session.finalStriche;
      
      // Finde Marcs Team
      let marcTeam = null;
      if (session.teams?.top?.players?.some(p => p.playerId === marcId)) {
        marcTeam = 'top';
      } else if (session.teams?.bottom?.players?.some(p => p.playerId === marcId)) {
        marcTeam = 'bottom';
      }
      
      const teamScore = marcTeam ? scores?.[marcTeam] || 0 : 0;
      const enemyScore = marcTeam === 'top' ? (scores?.bottom || 0) : (scores?.top || 0);
      const teamStriche = marcTeam ? (striche?.[marcTeam] || {}) : {};
      const totalStriche = Object.values(teamStriche).reduce((sum, val) => sum + (val || 0), 0);
      
      console.log(`${i + 1}. ${date} (${session.id.slice(0, 8)})`);
      console.log(`   Score: ${teamScore} : ${enemyScore}`);
      console.log(`   Striche: ${totalStriche}`);
      console.log(`   Team: ${marcTeam}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Fehler:', error);
  }
  
  process.exit(0);
}

debugMarc();
