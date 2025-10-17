#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';

/**
 * Script um verfügbare Gruppen zu finden
 */
async function findGroups() {
  try {
    console.log('🔍 Suche verfügbare Gruppen...');
    
    // Firebase Admin SDK initialisieren
    const serviceAccountPath = path.resolve(__dirname, '../../../serviceAccountKey.json');
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: 'jassguru'
      });
      console.log('✅ Firebase Admin SDK initialisiert');
    }

    const db = admin.firestore();
    
    // Hole alle Gruppen
    const groupsSnap = await db.collection('groups').limit(10).get();
    
    if (groupsSnap.empty) {
      console.log('❌ Keine Gruppen gefunden!');
      return;
    }
    
    console.log(`📊 Gefunden: ${groupsSnap.docs.length} Gruppen`);
    console.log('');
    
    for (const doc of groupsSnap.docs) {
      const data = doc.data();
      console.log(`🏷️  Gruppe: ${doc.id}`);
      console.log(`   Name: ${data.name || 'Unbekannt'}`);
      console.log(`   Mitglieder: ${data.playerIds?.length || 0}`);
      console.log(`   Erstellt: ${data.createdAt?.toDate?.()?.toLocaleDateString() || 'Unbekannt'}`);
      console.log('');
    }
    
    // Hole auch Sessions für die erste Gruppe
    if (groupsSnap.docs.length > 0) {
      const firstGroupId = groupsSnap.docs[0].id;
      console.log(`🎮 Sessions für Gruppe ${firstGroupId}:`);
      
      const sessionsSnap = await db.collection(`groups/${firstGroupId}/jassGameSummaries`).limit(5).get();
      console.log(`   Gefunden: ${sessionsSnap.docs.length} Sessions`);
      
      for (const sessionDoc of sessionsSnap.docs) {
        const sessionData = sessionDoc.data();
        console.log(`   📅 Session ${sessionDoc.id}: ${sessionData.status || 'Unbekannt'} (${sessionData.participantPlayerIds?.length || 0} Spieler)`);
      }
    }
    
  } catch (error) {
    console.error('💥 Fehler:', error);
  }
}

findGroups();
