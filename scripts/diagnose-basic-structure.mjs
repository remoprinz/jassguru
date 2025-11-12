#!/usr/bin/env node
/**
 * 🔍 BASIC STRUCTURE DIAGNOSE
 * 
 * Überprüft die grundlegenden Datenstrukturen in Firestore
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Service Account initialisieren
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../serviceAccountKey.json'), 'utf8')
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

const GROUP_ID = 'Tz0wgIHMTlhvTtFastiJ';

console.log('🔍 BASIC STRUCTURE DIAGNOSE');
console.log('=' .repeat(80));

/**
 * 1. Prüfe ob die Gruppe existiert
 */
async function checkGroup() {
  console.log('\n1️⃣ PRÜFE GRUPPE');
  console.log('-'.repeat(80));
  
  try {
    const groupRef = db.collection('groups').doc(GROUP_ID);
    const groupDoc = await groupRef.get();
    
    if (groupDoc.exists) {
      const groupData = groupDoc.data();
      console.log(`✅ Gruppe gefunden: ${groupData.name || 'Unbenannt'}`);
      console.log(`   Created: ${groupData.createdAt ? new Date(groupData.createdAt.toMillis()).toISOString() : 'UNKNOWN'}`);
      console.log(`   Total Games: ${groupData.totalGames || 0}`);
      console.log(`   Total Sessions: ${groupData.totalSessions || 0}`);
      
      // Prüfe players Map
      if (groupData.players) {
        const playerUids = Object.keys(groupData.players);
        console.log(`   Players (UIDs): ${playerUids.length}`);
        
        playerUids.slice(0, 5).forEach((uid, i) => {
          const playerData = groupData.players[uid];
          console.log(`      ${i + 1}. UID: ${uid.slice(0, 20)}... | Name: ${playerData.displayName || 'Unknown'}`);
        });
        
        // Suche nach "Remo"
        const remoEntries = Object.entries(groupData.players).filter(([uid, data]) => 
          data.displayName?.toLowerCase().includes('remo')
        );
        
        if (remoEntries.length > 0) {
          console.log(`\n   🎯 REMO GEFUNDEN:`);
          remoEntries.forEach(([uid, data]) => {
            console.log(`      UID: ${uid}`);
            console.log(`      Name: ${data.displayName}`);
          });
          
          // Versuche Player Document ID zu finden
          for (const [uid, data] of remoEntries) {
            console.log(`\n   🔍 Suche Player Document für UID: ${uid}`);
            const playersQuery = db.collection('players').where('userId', '==', uid);
            const playersSnap = await playersQuery.get();
            
            if (!playersSnap.empty) {
              playersSnap.forEach(doc => {
                console.log(`      ✅ Player Document ID: ${doc.id}`);
                console.log(`      ✅ Display Name: ${doc.data().displayName}`);
              });
            } else {
              console.log(`      ❌ KEIN Player Document gefunden für UID ${uid}`);
            }
          }
        }
      }
      
      return groupData;
    } else {
      console.log('❌ Gruppe NICHT GEFUNDEN');
      return null;
    }
  } catch (error) {
    console.error('❌ FEHLER:', error.message);
    return null;
  }
}

/**
 * 2. Prüfe playerRatings Collection
 */
async function checkPlayerRatings() {
  console.log('\n2️⃣ PRÜFE PLAYERRATINGS COLLECTION');
  console.log('-'.repeat(80));
  
  try {
    const ratingsRef = db.collection(`groups/${GROUP_ID}/playerRatings`);
    const ratingsSnap = await ratingsRef.limit(10).get();
    
    console.log(`✅ Anzahl playerRatings: ${ratingsSnap.size}`);
    
    if (ratingsSnap.size > 0) {
      ratingsSnap.forEach((doc, i) => {
        const data = doc.data();
        console.log(`   ${i + 1}. Player ID: ${doc.id} | Rating: ${data.rating || 0} | Games: ${data.gamesPlayed || 0} | Name: ${data.displayName || 'Unknown'}`);
      });
    } else {
      console.log('   ⚠️ KEINE playerRatings gefunden');
    }
    
    return ratingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('❌ FEHLER:', error.message);
    return [];
  }
}

/**
 * 3. Prüfe jassGameSummaries Collection
 */
async function checkJassGameSummaries() {
  console.log('\n3️⃣ PRÜFE JASSGAMESUMMARIES COLLECTION');
  console.log('-'.repeat(80));
  
  try {
    const summariesRef = db.collection(`groups/${GROUP_ID}/jassGameSummaries`);
    const summariesSnap = await summariesRef.limit(10).get();
    
    console.log(`✅ Anzahl jassGameSummaries: ${summariesSnap.size}`);
    
    if (summariesSnap.size > 0) {
      summariesSnap.forEach((doc, i) => {
        const data = doc.data();
        const startedAt = data.startedAt ? new Date(data.startedAt.toMillis()).toISOString().split('T')[0] : 'UNKNOWN';
        console.log(`   ${i + 1}. Session ID: ${doc.id.slice(0, 20)}... | Date: ${startedAt} | Games: ${data.gamesPlayed || 0} | Status: ${data.status}`);
      });
    } else {
      console.log('   ⚠️ KEINE jassGameSummaries gefunden');
    }
    
    return summariesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('❌ FEHLER:', error.message);
    return [];
  }
}

/**
 * 4. Prüfe players Collection (global)
 */
async function checkPlayersCollection() {
  console.log('\n4️⃣ PRÜFE PLAYERS COLLECTION (GLOBAL)');
  console.log('-'.repeat(80));
  
  try {
    const playersRef = db.collection('players');
    const playersQuery = playersRef.where('displayName', '>=', 'Remo').where('displayName', '<=', 'Remo\uf8ff');
    const playersSnap = await playersQuery.get();
    
    console.log(`✅ Anzahl Spieler mit "Remo" im Namen: ${playersSnap.size}`);
    
    if (playersSnap.size > 0) {
      playersSnap.forEach((doc, i) => {
        const data = doc.data();
        console.log(`   ${i + 1}. Player ID: ${doc.id} | User ID: ${data.userId} | Display Name: ${data.displayName}`);
      });
    } else {
      console.log('   ⚠️ KEINE Spieler mit "Remo" gefunden');
      
      // Versuche alle Spieler zu laden (limitiert)
      console.log('\n   🔍 Lade die ersten 10 Spieler:');
      const allPlayersSnap = await playersRef.limit(10).get();
      allPlayersSnap.forEach((doc, i) => {
        const data = doc.data();
        console.log(`   ${i + 1}. Player ID: ${doc.id} | Display Name: ${data.displayName || 'Unknown'}`);
      });
    }
    
    return playersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('❌ FEHLER:', error.message);
    return [];
  }
}

/**
 * HAUPTFUNKTION
 */
async function main() {
  try {
    const groupData = await checkGroup();
    const playerRatings = await checkPlayerRatings();
    const gameSummaries = await checkJassGameSummaries();
    const players = await checkPlayersCollection();
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 ZUSAMMENFASSUNG');
    console.log('='.repeat(80));
    
    console.log(`✅ Gruppe existiert: ${groupData ? 'JA' : 'NEIN'}`);
    console.log(`✅ PlayerRatings: ${playerRatings.length}`);
    console.log(`✅ GameSummaries: ${gameSummaries.length}`);
    console.log(`✅ Players mit "Remo": ${players.length}`);
    
    if (players.length > 0) {
      console.log(`\n🎯 EMPFOHLENE PLAYER ID FÜR REMO: ${players[0].id}`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ BASIC STRUCTURE DIAGNOSE ABGESCHLOSSEN');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ KRITISCHER FEHLER:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();

