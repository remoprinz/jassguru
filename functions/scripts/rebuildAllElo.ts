import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function rebuildAllElo(groupId: string) {
  try {
    console.log(`🔄 Starte komplette Elo-Neuberechnung für Gruppe ${groupId}...`);
    
    // 1. Hole alle Sessions UND Turniere der Gruppe (chronologisch sortiert)
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`)
      .orderBy('completedAt', 'asc');
    
    const sessionsSnap = await sessionsRef.get();
    
    if (sessionsSnap.empty) {
      console.log('❌ Keine Sessions/Turniere gefunden');
      return;
    }
    
    console.log(`📊 Gefunden: ${sessionsSnap.size} Sessions/Turniere`);
    
    // 2. Hole alle Mitglieder der Gruppe
    const membersRef = db.collection(`groups/${groupId}/members`);
    const membersSnap = await membersRef.get();
    
    if (membersSnap.empty) {
      console.log('❌ Keine Mitglieder gefunden');
      return;
    }
    
    const playerIds = membersSnap.docs.map(doc => doc.id);
    console.log(`👥 Gefunden: ${playerIds.length} Spieler`);
    
    // 3. Lösche ALLE Rating History Einträge für alle Spieler
    console.log('\n🗑️ Lösche alle bestehenden Rating History Einträge...');
    
    for (const playerId of playerIds) {
      const historyRef = db.collection(`players/${playerId}/ratingHistory`);
      const historySnap = await historyRef.get();
      
      if (!historySnap.empty) {
        const batch = db.batch();
        historySnap.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`  ✅ ${historySnap.size} Einträge gelöscht für Spieler ${playerId}`);
      }
    }
    
    // 4. Setze alle Spieler auf Start-Rating (100)
    console.log('\n🔄 Setze alle Spieler auf Start-Rating (100)...');
    
    for (const playerId of playerIds) {
      const playerRef = db.collection('players').doc(playerId);
      await playerRef.update({
        globalRating: 100,
        gamesPlayed: 0,
        lastDelta: 0,
        lastSessionDelta: 0,
        peakRating: 100,
        lowestRating: 100,
        peakRatingDate: Date.now(),
        lowestRatingDate: Date.now(),
        lastUpdated: Date.now()
      });
      console.log(`  ✅ Spieler ${playerId} auf Rating 100 gesetzt`);
    }
    
    // 5. Verarbeite alle Sessions/Turniere chronologisch
    console.log('\n🔄 Verarbeite alle Sessions/Turniere chronologisch...');
    
    let currentSessionIndex = 0;
    
    for (const sessionDoc of sessionsSnap.docs) {
      currentSessionIndex++;
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      // Prüfe ob mindestens 4 Spieler teilgenommen haben
      const participantCount = sessionData.participantPlayerIds?.length || 0;
      
      console.log(`\n📅 Session/Turnier ${currentSessionIndex}/${sessionsSnap.size}: ${sessionId}`);
      console.log(`   Zeit: ${sessionData.completedAt?.toDate?.()?.toISOString() || 'Unbekannt'}`);
      console.log(`   Teilnehmer: ${participantCount} Spieler`);
      
      // Nur verarbeiten wenn mindestens 4 Spieler teilgenommen haben
      if (participantCount >= 4) {
        await processSessionForElo(sessionId, sessionData, groupId);
        console.log(`   ✅ Session ${currentSessionIndex} verarbeitet (${participantCount} Spieler)`);
      } else {
        console.log(`   ⏭️ Session ${currentSessionIndex} übersprungen (< 4 Spieler)`);
      }
    }
    
    // 6. Chart-Daten werden jetzt direkt aus jassGameSummaries gelesen
    console.log('\n📊 Chart-Daten werden jetzt direkt aus jassGameSummaries gelesen - kein separater chartDataService mehr nötig!');
    
    console.log('\n🎉 Komplette Elo-Neuberechnung abgeschlossen!');
    console.log(`📊 Verarbeitet: ${sessionsSnap.size} Sessions/Turniere`);
    console.log(`👥 Spieler: ${playerIds.length}`);
    
  } catch (error) {
    console.error('❌ Fehler bei der Elo-Neuberechnung:', error);
  }
}

async function processSessionForElo(sessionId: string, sessionData: any, groupId: string) {
  try {
    // Importiere die benötigten Services
    const { updateEloForSession } = await import('../src/jassEloUpdater');
    const { saveRatingHistorySnapshot } = await import('../src/ratingHistoryService');
    
    // 1. Elo-Updates berechnen
    await updateEloForSession(groupId, sessionId);
    
    // 2. Rating History Snapshots erstellen
    const participantPlayerIds = sessionData.participantPlayerIds || [];
    
    await saveRatingHistorySnapshot(
      groupId,
      sessionId,
      participantPlayerIds,
      'session_end'
    );
    
  } catch (error) {
    console.error(`❌ Fehler bei Session ${sessionId}:`, error);
    throw error;
  }
}

// Ausführung
const groupId = 'Tz0wgIHMTlhvTtFastiJ'; // fürDich OGs

console.log(`🚨 WARNUNG: Dieses Script berechnet ALLE Elo-Ratings neu!`);
console.log(`📅 Zielgruppe: ${groupId}`);
console.log(`⏳ Starte in 3 Sekunden...`);

setTimeout(() => {
  rebuildAllElo(groupId);
}, 3000);
