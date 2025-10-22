import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function deleteRatingHistoryFromDate(targetDate: string, groupId: string) {
  try {
    console.log(`🗑️ Lösche alle Rating History Einträge vom ${targetDate} für Gruppe ${groupId}...`);
    
    // 1. Hole alle Mitglieder der Gruppe
    const membersRef = db.collection(`groups/${groupId}/members`);
    const membersSnap = await membersRef.get();
    
    if (membersSnap.empty) {
      console.log('❌ Keine Mitglieder gefunden');
      return;
    }
    
    console.log(`👥 Gefunden: ${membersSnap.size} Mitglieder`);
    
    let totalDeleted = 0;
    
    // 2. Für jeden Spieler: Lösche alle Einträge vom 20. Oktober
    for (const memberDoc of membersSnap.docs) {
      const playerId = memberDoc.id;
      const memberData = memberDoc.data();
      const playerName = memberData?.displayName || `Spieler_${playerId.slice(0, 6)}`;
      
      console.log(`\n👤 Prüfe Spieler: ${playerName} (${playerId})`);
      
      // Hole alle Rating History Einträge
      const historyRef = db.collection(`players/${playerId}/ratingHistory`);
      const historySnap = await historyRef.get();
      
      if (historySnap.empty) {
        console.log('  📊 Keine Rating History Einträge');
        continue;
      }
      
      // Filtere Einträge vom 20. Oktober
      const entriesToDelete: Array<{
        id: string;
        createdAt: Date;
        sessionId: string;
        rating: number;
      }> = [];
      
      historySnap.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate?.() || new Date();
        const entryDate = createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
        
        if (entryDate === targetDate) {
          entriesToDelete.push({
            id: doc.id,
            createdAt: createdAt,
            sessionId: data.sessionId || 'unknown',
            rating: data.rating || 0
          });
        }
      });
      
      if (entriesToDelete.length === 0) {
        console.log('  ✅ Keine Einträge vom 20. Oktober gefunden');
        continue;
      }
      
      console.log(`  🗑️ Lösche ${entriesToDelete.length} Einträge vom 20. Oktober:`);
      
      // Lösche alle gefundenen Einträge
      const batch = db.batch();
      for (const entry of entriesToDelete) {
        batch.delete(historyRef.doc(entry.id));
        console.log(`    - Session: ${entry.sessionId}, Rating: ${entry.rating}, Zeit: ${entry.createdAt.toISOString()}`);
      }
      
      await batch.commit();
      totalDeleted += entriesToDelete.length;
      console.log(`  ✅ ${entriesToDelete.length} Einträge gelöscht`);
    }
    
    console.log(`\n🎉 Bereinigung abgeschlossen!`);
    console.log(`📊 Gesamt gelöscht: ${totalDeleted} Rating History Einträge vom ${targetDate}`);
    
  } catch (error) {
    console.error('❌ Fehler beim Löschen:', error);
  }
}

// Ausführung
const targetDate = '2025-10-20'; // 20. Oktober 2025
const groupId = 'Tz0wgIHMTlhvTtFastiJ'; // fürDich OGs

console.log(`🚨 WARNUNG: Dieses Script löscht ALLE Rating History Einträge vom ${targetDate}!`);
console.log(`📅 Zielgruppe: ${groupId}`);
console.log(`⏳ Starte in 3 Sekunden...`);

setTimeout(() => {
  deleteRatingHistoryFromDate(targetDate, groupId);
}, 3000);
