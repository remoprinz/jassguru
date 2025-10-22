import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function cleanupDuplicateRatingHistory(playerId: string, sessionId: string) {
  try {
    console.log(`🧹 Bereinige Duplikate für Spieler ${playerId}, Session ${sessionId}...`);
    
    // 1. Alle Einträge für diese Session laden
    const historyRef = db.collection(`players/${playerId}/ratingHistory`);
    const duplicatesSnap = await historyRef
      .where('sessionId', '==', sessionId)
      .get();
    
    console.log(`📊 Gefunden: ${duplicatesSnap.size} Duplikate`);
    
    if (duplicatesSnap.size <= 1) {
      console.log('✅ Keine Duplikate gefunden');
      return;
    }
    
    // 2. Den neuesten Eintrag behalten, alle anderen löschen
    const entries = duplicatesSnap.docs.map(doc => ({
      id: doc.id,
      data: doc.data(),
      createdAt: doc.data().createdAt?.toMillis?.() || 0
    }));
    
    // Sortiere nach createdAt (neueste zuerst)
    entries.sort((a, b) => b.createdAt - a.createdAt);
    
    const keepEntry = entries[0]; // Neuester Eintrag
    const deleteEntries = entries.slice(1); // Alle anderen
    
    console.log(`✅ Behalte Eintrag: ${keepEntry.id} (${new Date(keepEntry.createdAt).toISOString()})`);
    console.log(`🗑️ Lösche ${deleteEntries.length} Duplikate`);
    
    // 3. Duplikate löschen
    const batch = db.batch();
    for (const entry of deleteEntries) {
      batch.delete(historyRef.doc(entry.id));
    }
    
    await batch.commit();
    console.log(`✅ ${deleteEntries.length} Duplikate gelöscht`);
    
  } catch (error) {
    console.error('❌ Fehler beim Bereinigen:', error);
  }
}

async function cleanupAllPlayersForSession(sessionId: string) {
  try {
    console.log(`🔍 Bereinige alle Spieler für Session ${sessionId}...`);
    
    // Finde alle Spieler mit Duplikaten für diese Session
    const playersRef = db.collection('players');
    const playersSnap = await playersRef.get();
    
    for (const playerDoc of playersSnap.docs) {
      const playerId = playerDoc.id;
      const playerData = playerDoc.data();
      
      // Prüfe ob Spieler in dieser Session war
      if (playerData?.displayName) {
        console.log(`\n👤 Prüfe Spieler: ${playerData.displayName} (${playerId})`);
        await cleanupDuplicateRatingHistory(playerId, sessionId);
      }
    }
    
    console.log('\n✅ Bereinigung abgeschlossen!');
    
  } catch (error) {
    console.error('❌ Fehler:', error);
  }
}

// Ausführung
const sessionId = '5cR_9eah2LctCf2sUIwmQ';
cleanupAllPlayersForSession(sessionId);
