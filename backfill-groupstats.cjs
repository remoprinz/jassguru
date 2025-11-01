/**
 * BACKFILL SCRIPT: GroupStats für alle Gruppen neu berechnen
 * 
 * Dieses Script berechnet die groupStats für eine oder alle Gruppen neu.
 * Es verwendet dieselbe Logik wie finalizeSession.ts
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Importiere die groupStatsCalculator Funktionen
// Da wir Node.js verwenden, müssen wir die TypeScript-Dateien kompilieren lassen
// Oder wir können die Logik direkt hier implementieren

async function updateGroupStatsForGroup(groupId, dryRun = false) {
  console.log(`\n🔄 [${groupId}] Starte GroupStats-Berechnung...`);
  
  try {
    // Prüfe, ob Gruppe existiert
    const groupDoc = await db.doc(`groups/${groupId}`).get();
    if (!groupDoc.exists) {
      console.error(`   ❌ [${groupId}] Gruppe existiert nicht!`);
      return null;
    }
    
    // Prüfe, ob Sessions vorhanden sind
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`);
    const sessionsSnap = await sessionsRef.where('status', '==', 'completed').get();
    
    console.log(`   📊 [${groupId}] Gefunden: ${sessionsSnap.size} abgeschlossene Sessions`);
    
    if (sessionsSnap.size === 0) {
      console.log(`   ⚠️  [${groupId}] Keine Sessions gefunden, überspringe...`);
      return null;
    }
    
    if (dryRun) {
      console.log(`   ✅ [${groupId}] DRY-RUN: Würde GroupStats neu berechnen...`);
      return { success: true, dryRun: true };
    }
    
    // ✅ BESTE LÖSUNG: Setze Flag für automatische Berechnung
    // Die Funktion onGroupDocumentUpdated wird dann automatisch ausgelöst
    // und führt updateGroupComputedStatsAfterSession aus
    console.log(`   🚀 [${groupId}] Setze needsStatsRecalculation Flag...`);
    
    try {
      await db.doc(`groups/${groupId}`).update({
        needsStatsRecalculation: true,
        lastStatsRecalcTrigger: admin.firestore.Timestamp.now()
      });
      
      console.log(`   ✅ [${groupId}] Flag gesetzt!`);
      console.log(`   ⏳ [${groupId}] Berechnung wird automatisch durch Trigger ausgelöst...`);
      console.log(`   💡 [${groupId}] Warte 5-10 Sekunden, dann prüfe groups/${groupId}/stats/computed`);
      
      return { success: true, method: 'flag' };
      
    } catch (flagError) {
      console.error(`   ❌ [${groupId}] Fehler beim Setzen des Flags:`, flagError.message);
      return null;
    }
    
  } catch (error) {
    console.error(`   ❌ [${groupId}] FEHLER beim GroupStats-Update:`, error.message);
    console.error(`   📋 [${groupId}] Stack:`, error.stack);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const specificGroupId = args.find(arg => !arg.startsWith('--'));
  
  console.log('═══════════════════════════════════════════════════');
  console.log('🔧 GROUPSTATS BACKFILL SCRIPT');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (nur Anzeige)' : 'EXECUTE (wirklich schreiben)'}`);
  console.log(`Group ID: ${specificGroupId || 'ALLE GRUPPEN'}`);
  console.log('═══════════════════════════════════════════════════\n');
  
  if (dryRun) {
    console.log('⚠️  DRY-RUN MODE: Es wird NICHTS geschrieben!\n');
  }
  
  try {
    let groupIds = [];
    
    if (specificGroupId) {
      // ✅ Spezifische Gruppe
      console.log(`🎯 Fokussiere auf Gruppe: ${specificGroupId}`);
      
      // Prüfe, ob Gruppe existiert
      const groupDoc = await db.doc(`groups/${specificGroupId}`).get();
      if (!groupDoc.exists) {
        console.error(`❌ Gruppe ${specificGroupId} existiert nicht!`);
        process.exit(1);
      }
      
      groupIds = [specificGroupId];
    } else {
      // ✅ Alle Gruppen finden
      console.log('🔍 Suche nach allen Gruppen...');
      const groupsSnap = await db.collection('groups').get();
      
      groupIds = groupsSnap.docs.map(doc => doc.id);
      console.log(`📊 Gefunden: ${groupIds.length} Gruppen\n`);
    }
    
    if (groupIds.length === 0) {
      console.log('⚠️  Keine Gruppen gefunden!');
      process.exit(0);
    }
    
    // ✅ Verarbeite jede Gruppe
    let successCount = 0;
    let failCount = 0;
    
    for (const groupId of groupIds) {
      // Hole Gruppennamen für bessere Ausgabe
      const groupDoc = await db.doc(`groups/${groupId}`).get();
      const groupName = groupDoc.exists ? (groupDoc.data()?.name || 'Unbekannt') : 'Unbekannt';
      
      console.log(`\n📋 [${groupId}] ${groupName}`);
      console.log('─────────────────────────────────────────────────');
      
      const result = await updateGroupStatsForGroup(groupId, dryRun);
      
      if (result) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    // ✅ Zusammenfassung
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('═══════════════════════════════════════════════════');
    
    if (!dryRun) {
      console.log(`✅ Erfolgreich: ${successCount} Gruppen`);
      console.log(`❌ Fehlgeschlagen: ${failCount} Gruppen`);
      console.log(`📊 Total: ${groupIds.length} Gruppen`);
    } else {
      console.log(`📊 Würde ${groupIds.length} Gruppen verarbeiten`);
      console.log(`⚠️  DRY-RUN: Nichts wurde geschrieben!`);
    }
    
    console.log('═══════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.error('\n❌ KRITISCHER FEHLER:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

// ✅ Starte Script
main();

