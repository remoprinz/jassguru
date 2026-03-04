#!/usr/bin/env node

/**
 * 🎯 Chart Data Backfill Script
 * 
 * Dieses Script berechnet die Pre-computed Chart Data für alle bestehenden Gruppen.
 * Es sollte nach der Implementierung des Chart Data Service ausgeführt werden.
 */

const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin SDK initialisieren
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Import der Chart Data Service Funktion
const { saveChartDataSnapshot } = require('./lib/chartDataService');

async function backfillChartDataForAllGroups() {
  console.log('🚀 Starting Chart Data Backfill for all groups...');
  
  try {
    // 1. Hole alle Gruppen
    const groupsSnap = await db.collection('groups').get();
    
    if (groupsSnap.empty) {
      console.log('❌ No groups found');
      return;
    }
    
    console.log(`📊 Found ${groupsSnap.size} groups to process`);
    
    // 2. Verarbeite jede Gruppe
    let successCount = 0;
    let errorCount = 0;
    
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      const groupData = groupDoc.data();
      const groupName = groupData.name || `Group_${groupId.slice(0,6)}`;
      
      try {
        console.log(`\n🔄 Processing group: ${groupName} (${groupId})`);
        
        await saveChartDataSnapshot(groupId);
        
        console.log(`✅ Chart data calculated for group: ${groupName}`);
        successCount++;
        
        // Kleine Pause zwischen Gruppen
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error processing group ${groupName} (${groupId}):`, error.message);
        errorCount++;
      }
    }
    
    // 3. Zusammenfassung
    console.log('\n📈 Chart Data Backfill Summary:');
    console.log(`✅ Successfully processed: ${successCount} groups`);
    console.log(`❌ Errors: ${errorCount} groups`);
    console.log(`📊 Total groups: ${groupsSnap.size}`);
    
    if (successCount > 0) {
      console.log('\n🎉 Chart Data Backfill completed!');
      console.log('💡 Charts should now load instantly in the PWA!');
    }
    
  } catch (error) {
    console.error('💥 Fatal error during Chart Data Backfill:', error);
  } finally {
    process.exit(0);
  }
}

// Script ausführen
backfillChartDataForAllGroups();
