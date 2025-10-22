import * as admin from 'firebase-admin';
import * as path from 'path';

// Initialize Firebase Admin mit serviceAccountKey aus Hauptverzeichnis
const serviceAccount = require(path.resolve(__dirname, '../../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

/**
 * 🔍 ÜBERPRÜFE EVENTS VOR DEM ERSTEN SPIEL
 * 
 * Findet alle Events, die vor dem ersten Session-Spiel stattfanden
 * und erklärt, warum die Spieler unterschiedliche Start-Elo-Werte haben.
 */
async function checkEventsBeforeFirstSession() {
  console.log('🔍 ÜBERPRÜFE EVENTS VOR DEM ERSTEN SPIEL\n');
  console.log('='.repeat(80));
  
  try {
    // ========== 1. SAMMLE ALLE EVENTS ==========
    console.log('\n📊 Schritt 1/3: Sammle alle Events...');
    
    const allEvents: Array<{
      id: string;
      type: 'session' | 'tournament_passe' | 'tournament_final';
      groupId: string;
      completedAt: admin.firestore.Timestamp;
      participantPlayerIds: string[];
      tournamentId?: string;
      passeId?: string;
      passeNumber?: number;
    }> = [];
    
    // Sammle alle Sessions
    const groupsSnap = await db.collection('groups').get();
    console.log(`   Gefunden: ${groupsSnap.size} Gruppen`);
    
    for (const groupDoc of groupsSnap.docs) {
      const summariesSnap = await db.collection(`groups/${groupDoc.id}/jassGameSummaries`)
        .where('status', '==', 'completed')
        .orderBy('completedAt')
        .get();
      
      console.log(`   ✅ Gruppe ${groupDoc.id}: ${summariesSnap.size} Sessions`);
      
      for (const summaryDoc of summariesSnap.docs) {
        const summaryData = summaryDoc.data();
        
        if (summaryData.completedAt && summaryData.participantPlayerIds) {
          allEvents.push({
            id: summaryDoc.id,
            type: 'session',
            groupId: groupDoc.id,
            completedAt: summaryData.completedAt,
            participantPlayerIds: summaryData.participantPlayerIds
          });
        }
      }
    }
    
    // Sammle alle Tournament-Passen
    const tournamentsSnap = await db.collection('tournaments')
      .where('status', '==', 'completed')
      .get();
    
    console.log(`   Gefunden: ${tournamentsSnap.size} Turniere`);
    
    for (const tournamentDoc of tournamentsSnap.docs) {
      const tournamentData = tournamentDoc.data();
      
      // Überspringe Turniere ohne completedAt
      if (!tournamentData.completedAt) {
        console.log(`   ⚠️ Turnier ${tournamentDoc.id}: Kein completedAt, überspringe`);
        continue;
      }
      
      // Hole alle Passen des Turniers
      const passesSnap = await db.collection(`tournaments/${tournamentDoc.id}/games`)
        .orderBy('completedAt')
        .get();
      
      if (passesSnap.empty) {
        console.log(`   ⚠️ Turnier ${tournamentDoc.id}: Keine Passen gefunden`);
        continue;
      }
      
      console.log(`   🏆 Turnier ${tournamentDoc.id}: ${passesSnap.size} Passen`);
      
      // Füge jede Passe als separates Event hinzu
      for (const passeDoc of passesSnap.docs) {
        const passeData = passeDoc.data();
        
        if (passeData.completedAt && passeData.participantPlayerIds) {
          allEvents.push({
            id: `${tournamentDoc.id}_passe_${passeDoc.id}`,
            type: 'tournament_passe',
            groupId: tournamentData.groupId,
            completedAt: passeData.completedAt,
            participantPlayerIds: passeData.participantPlayerIds,
            tournamentId: tournamentDoc.id,
            passeId: passeDoc.id,
            passeNumber: passeData.passeNumber
          });
        }
      }
    }
    
    // Sortiere alle Events chronologisch
    allEvents.sort((a, b) => a.completedAt.toMillis() - b.completedAt.toMillis());
    
    console.log(`\n   📈 Total: ${allEvents.length} Events gefunden`);
    
    // ========== 2. FINDE DAS ERSTE SESSION-EVENT ==========
    console.log('\n🎯 Schritt 2/3: Finde das erste Session-Event...');
    
    const firstSessionEvent = allEvents.find(e => e.type === 'session');
    
    if (!firstSessionEvent) {
      console.log('   ❌ Kein Session-Event gefunden!');
      return;
    }
    
    const firstSessionDate = firstSessionEvent.completedAt.toDate();
    console.log(`   ✅ Erstes Session-Event: ${firstSessionEvent.id}`);
    console.log(`   📅 Datum: ${firstSessionDate.toLocaleDateString('de-CH')} ${firstSessionDate.toLocaleTimeString('de-CH')}`);
    console.log(`   👥 Teilnehmer: ${firstSessionEvent.participantPlayerIds.join(', ')}`);
    
    // ========== 3. FINDE EVENTS VOR DEM ERSTEN SESSION ==========
    console.log('\n🔍 Schritt 3/3: Finde Events vor dem ersten Session...');
    
    const eventsBeforeFirstSession = allEvents.filter(e => 
      e.completedAt.toMillis() < firstSessionEvent.completedAt.toMillis()
    );
    
    console.log(`   📊 Events vor dem ersten Session: ${eventsBeforeFirstSession.length}`);
    
    if (eventsBeforeFirstSession.length === 0) {
      console.log('   ✅ Keine Events vor dem ersten Session gefunden!');
      console.log('   🤔 Das bedeutet, alle Spieler sollten mit 100 Elo starten...');
      console.log('   🚨 ABER: Das Rebuild-Log zeigt unterschiedliche Start-Werte!');
      console.log('   💡 Mögliche Ursachen:');
      console.log('      - Falsche completedAt-Timestamps');
      console.log('      - Events wurden in falscher Reihenfolge verarbeitet');
      console.log('      - Legacy-Daten wurden nicht vollständig bereinigt');
    } else {
      console.log('\n   🚨 EVENTS VOR DEM ERSTEN SESSION GEFUNDEN:');
      console.log('   ===========================================');
      
      for (const event of eventsBeforeFirstSession) {
        const eventDate = event.completedAt.toDate();
        const eventType = event.type === 'tournament_passe' ? '🏆 PASSE' : '🎮 SESSION';
        const eventInfo = event.type === 'tournament_passe' 
          ? `${event.tournamentId} (Passe ${event.passeNumber})`
          : event.id;
        
        console.log(`   ${eventType}: ${eventInfo}`);
        console.log(`      📅 ${eventDate.toLocaleDateString('de-CH')} ${eventDate.toLocaleTimeString('de-CH')}`);
        console.log(`      👥 Teilnehmer: ${event.participantPlayerIds.join(', ')}`);
        console.log('');
      }
      
      console.log('   💡 DAS ERKLÄRT DAS PROBLEM:');
      console.log('      Diese Events haben die Elo-Werte der Spieler');
      console.log('      VOR dem ersten Session-Spiel beeinflusst!');
    }
    
    // ========== ZUSAMMENFASSUNG ==========
    console.log('\n' + '='.repeat(80));
    console.log('✅ ANALYSE ABGESCHLOSSEN\n');
    
    if (eventsBeforeFirstSession.length > 0) {
      console.log('🎯 FAZIT:');
      console.log(`   • ${eventsBeforeFirstSession.length} Events fanden vor dem ersten Session statt`);
      console.log('   • Diese Events haben die Elo-Werte der Spieler beeinflusst');
      console.log('   • Daher starten die Spieler mit unterschiedlichen Elo-Werten');
      console.log('   • Das ist das erwartete Verhalten des Systems!');
    } else {
      console.log('🎯 FAZIT:');
      console.log('   • Keine Events vor dem ersten Session gefunden');
      console.log('   • Alle Spieler sollten mit 100 Elo starten');
      console.log('   • Das unterschiedliche Start-Verhalten ist unerwartet');
      console.log('   • Weitere Untersuchung erforderlich');
    }
    
  } catch (error) {
    console.error('\n❌ FEHLER bei der Event-Analyse:', error);
    throw error;
  } finally {
    await admin.app().delete();
  }
}

// Script ausführen
checkEventsBeforeFirstSession()
  .then(() => {
    console.log('\n✅ Script erfolgreich beendet');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script mit Fehler beendet:', error);
    process.exit(1);
  });
