#!/usr/bin/env ts-node

/**
 * 🔍 SESSION FINDER SCRIPT
 * 
 * Findet alle Sessions in einer Gruppe
 */

import * as admin from 'firebase-admin';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function findSessions(groupId: string) {
  console.log(`🔍 Finding sessions in group: ${groupId}`);
  
  try {
    // Hole alle Sessions der Gruppe (ohne komplexe Abfrage)
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`)
      .limit(20);
    
    const sessionsSnap = await sessionsRef.get();
    
    if (sessionsSnap.empty) {
      console.log('❌ No sessions found');
      return;
    }
    
    console.log(`✅ Found ${sessionsSnap.size} sessions:`);
    console.log('');
    
    sessionsSnap.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. Session ID: ${doc.id}`);
      console.log(`   Ended: ${data.endedAt?.toDate?.()?.toISOString()}`);
      console.log(`   Participants: ${data.participantPlayerIds?.length || 0}`);
      console.log(`   Games: ${data.gamesPlayed || 0}`);
      console.log(`   Elo Updated: ${data.eloUpdatedAt ? 'Yes' : 'No'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error finding sessions:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  const groupId = process.argv[2] || 'Rosen10player';
  
  findSessions(groupId)
    .then(() => {
      console.log('🔍 Session search completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Session search failed:', error);
      process.exit(1);
    });
}

export { findSessions };
