const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyzeCorrectRemoRating() {
  console.log('🔍 ANALYSE: Rating-Historie mit KORREKTER playerId\n');
  
  const playerId = 'b16c1120111b7d9e7d733837'; // KORREKT!
  
  // Lade ratingHistory
  const ratingHistoryRef = db.collection(`players/${playerId}/ratingHistory`);
  const allEntriesSnap = await ratingHistoryRef.orderBy('createdAt', 'asc').get();
  
  console.log(`📊 TOTAL: ${allEntriesSnap.size} Einträge in ratingHistory\n`);
  
  if (allEntriesSnap.empty) {
    console.log('❌ Keine ratingHistory vorhanden!\n');
    return process.exit(0);
  }
  
  // Filter für 27.11.2025
  const nov27Entries = [];
  
  allEntriesSnap.forEach(doc => {
    const data = doc.data();
    const timestamp = data.completedAt || data.createdAt;
    
    let date;
    if (timestamp?.toDate) {
      date = timestamp.toDate();
    } else if (timestamp?._seconds) {
      date = new Date(timestamp._seconds * 1000);
    } else {
      return;
    }
    
    // Prüfe ob 27.11.2025
    if (date.getDate() === 27 && date.getMonth() === 10 && date.getFullYear() === 2025) {
      nov27Entries.push({
        id: doc.id,
        rating: data.rating,
        delta: data.delta,
        gameNumber: data.gameNumber,
        sessionId: data.sessionId,
        timestamp: date
      });
    }
  });
  
  console.log(`📅 Einträge am 27.11.2025: ${nov27Entries.length}\n`);
  
  if (nov27Entries.length === 0) {
    console.log('❌ KEINE EINTRÄGE am 27.11.2025!\n');
    console.log('Letzte 10 Einträge:');
    const last10 = allEntriesSnap.docs.slice(-10);
    last10.forEach(doc => {
      const data = doc.data();
      const timestamp = data.completedAt || data.createdAt;
      let date = 'UNKNOWN';
      if (timestamp?.toDate) {
        date = timestamp.toDate().toLocaleString('de-DE');
      } else if (timestamp?._seconds) {
        date = new Date(timestamp._seconds * 1000).toLocaleString('de-DE');
      }
      console.log(`  - ${date}: Rating ${Math.round(data.rating * 10) / 10}, Delta ${data.delta}, Game ${data.gameNumber}`);
    });
  } else {
    console.log('✅ Einträge am 27.11.2025:\n');
    nov27Entries.sort((a, b) => a.timestamp - b.timestamp);
    nov27Entries.forEach((entry, index) => {
      console.log(`Spiel ${index + 1}:`);
      console.log(`  Rating: ${Math.round(entry.rating * 10) / 10}`);
      console.log(`  Delta: ${entry.delta}`);
      console.log(`  GameNumber: ${entry.gameNumber}`);
      console.log(`  SessionId: ${entry.sessionId}`);
      console.log(`  Timestamp: ${entry.timestamp.toLocaleString('de-DE')}`);
      console.log('');
    });
  }
  
  process.exit(0);
}

analyzeCorrectRemoRating().catch(error => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

