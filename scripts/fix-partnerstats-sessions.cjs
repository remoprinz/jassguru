/**
 * FIX: Korrigiere partnerStats.sessionsPlayedWith für Spieler, die NUR Turniere gespielt haben
 * 
 * Problem: Alte Turniere wurden als Sessions gezählt in partnerStats
 * Lösung: Setze sessionsPlayedWith auf 0 für Spieler ohne normale Partien
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

// Spieler, die NUR Turniere gespielt haben (keine normalen Partien)
const TOURNAMENT_ONLY_PLAYERS = [
  '4nhOwuVONajPArNERzyEj', // Davester
  'ZLvyUYt_E5jhaUc0oF7O0', // Mazi
  'yyC2BVyp07f9P2Y4VN2vy', // Fabinski
  'aVvhPjXrDpUeM3q58Zqo1', // Schällenursli
  'XLvJAL83h0i9u4H0g4V3Y', // Reto
];

async function fix() {
  console.log('🔧 FIX: Korrigiere partnerStats.sessionsPlayedWith für Turnier-Only-Spieler\n');
  
  for (const playerId of TOURNAMENT_ONLY_PLAYERS) {
    const playerDoc = await db.doc(`players/${playerId}`).get();
    if (!playerDoc.exists) {
      console.log(`⚠️ Spieler ${playerId} nicht gefunden`);
      continue;
    }
    
    const playerName = playerDoc.data().displayName || playerId.substring(0, 10);
    console.log(`📌 ${playerName}:`);
    
    // Lade partnerStats
    const partnerSnap = await db.collection(`players/${playerId}/partnerStats`).get();
    
    for (const doc of partnerSnap.docs) {
      const data = doc.data();
      const partnerName = data.partnerDisplayName || doc.id.substring(0, 10);
      
      // Prüfe ob sessionsPlayedWith > 0 (falsch)
      if ((data.sessionsPlayedWith || 0) > 0 || 
          (data.sessionsWonWith || 0) > 0 || 
          (data.sessionsLostWith || 0) > 0) {
        
        console.log(`   Partner ${partnerName}:`);
        console.log(`      sessionsPlayedWith: ${data.sessionsPlayedWith || 0} → 0`);
        console.log(`      sessionsWonWith: ${data.sessionsWonWith || 0} → 0`);
        console.log(`      sessionsLostWith: ${data.sessionsLostWith || 0} → 0`);
        
        // Korrigiere
        await doc.ref.update({
          sessionsPlayedWith: 0,
          sessionsWonWith: 0,
          sessionsLostWith: 0,
          sessionsDrawWith: 0,
          sessionWinRateWith: 0,
        });
        console.log(`      ✅ Korrigiert`);
      }
    }
    
    // Lade opponentStats
    const opponentSnap = await db.collection(`players/${playerId}/opponentStats`).get();
    
    for (const doc of opponentSnap.docs) {
      const data = doc.data();
      const opponentName = data.opponentDisplayName || doc.id.substring(0, 10);
      
      // Prüfe ob sessionsPlayedAgainst > 0 (falsch)
      if ((data.sessionsPlayedAgainst || 0) > 0 || 
          (data.sessionsWonAgainst || 0) > 0 || 
          (data.sessionsLostAgainst || 0) > 0) {
        
        console.log(`   Gegner ${opponentName}:`);
        console.log(`      sessionsPlayedAgainst: ${data.sessionsPlayedAgainst || 0} → 0`);
        
        // Korrigiere
        await doc.ref.update({
          sessionsPlayedAgainst: 0,
          sessionsWonAgainst: 0,
          sessionsLostAgainst: 0,
          sessionsDrawAgainst: 0,
          sessionWinRateAgainst: 0,
        });
        console.log(`      ✅ Korrigiert`);
      }
    }
    
    console.log('');
  }
  
  console.log('='.repeat(80));
  console.log('✅ FIX ABGESCHLOSSEN');
  console.log('='.repeat(80));
}

fix()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });
