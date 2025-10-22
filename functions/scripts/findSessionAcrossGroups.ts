#!/usr/bin/env ts-node

/**
 * 🔍 SESSION FINDER ACROSS GROUPS SCRIPT
 * 
 * Findet eine spezifische Session in allen Gruppen
 */

import * as admin from 'firebase-admin';

// Firebase Admin SDK initialisieren
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

async function findSessionAcrossGroups(sessionId: string) {
  console.log(`🔍 Finding session ${sessionId} across all groups...`);
  
  try {
    // Hole alle Gruppen
    const groupsRef = db.collection('groups');
    const groupsSnap = await groupsRef.get();
    
    if (groupsSnap.empty) {
      console.log('❌ No groups found');
      return;
    }
    
    console.log(`📊 Searching in ${groupsSnap.size} groups...`);
    console.log('');
    
    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id;
      const groupName = groupDoc.data().name || 'Unknown';
      
      console.log(`🔍 Checking group: ${groupName} (${groupId})`);
      
      try {
        // Prüfe, ob die Session in dieser Gruppe existiert
        const sessionRef = db.doc(`groups/${groupId}/jassGameSummaries/${sessionId}`);
        const sessionSnap = await sessionRef.get();
        
        if (sessionSnap.exists) {
          const sessionData = sessionSnap.data();
          console.log(`✅ FOUND! Session exists in group: ${groupName}`);
          console.log(`   Group ID: ${groupId}`);
          console.log(`   Session ID: ${sessionId}`);
          console.log(`   Status: ${sessionData?.status}`);
          console.log(`   Participants: ${sessionData?.participantPlayerIds?.length || 0}`);
          console.log(`   Games: ${sessionData?.gamesPlayed || 0}`);
          console.log(`   Ended: ${sessionData?.endedAt?.toDate?.()?.toISOString()}`);
          console.log(`   Elo Updated: ${sessionData?.eloUpdatedAt ? 'Yes' : 'No'}`);
          console.log('');
          return { groupId, sessionData };
        } else {
          console.log(`   ❌ Not found`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking group: ${(error as Error).message}`);
      }
    }
    
    console.log('❌ Session not found in any group');
    return null;
    
  } catch (error) {
    console.error('❌ Error finding session:', error);
    throw error;
  }
}

// Script ausführen
if (require.main === module) {
  const sessionId = process.argv[2] || 'kFI60_GTBnYADP7BQZSg9';
  
  findSessionAcrossGroups(sessionId)
    .then((result) => {
      if (result) {
        console.log('🎉 Session found!');
      } else {
        console.log('💔 Session not found');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Session search failed:', error);
      process.exit(1);
    });
}

export { findSessionAcrossGroups };
