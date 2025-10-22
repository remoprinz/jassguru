#!/usr/bin/env ts-node

/**
 * 🔍 GROUP FINDER SCRIPT
 * 
 * Findet alle Gruppen
 */

import * as admin from 'firebase-admin';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function findGroups() {
  console.log('🔍 Finding all groups...');
  
  try {
    // Hole alle Gruppen
    const groupsRef = db.collection('groups');
    const groupsSnap = await groupsRef.get();
    
    if (groupsSnap.empty) {
      console.log('❌ No groups found');
      return;
    }
    
    console.log(`✅ Found ${groupsSnap.size} groups:`);
    console.log('');
    
    groupsSnap.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. Group ID: ${doc.id}`);
      console.log(`   Name: ${data.name || 'Unknown'}`);
      console.log(`   Created: ${data.createdAt?.toDate?.()?.toISOString()}`);
      console.log(`   Members: ${data.playerIds?.length || 0}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error finding groups:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  findGroups()
    .then(() => {
      console.log('🔍 Group search completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Group search failed:', error);
      process.exit(1);
    });
}

export { findGroups };
