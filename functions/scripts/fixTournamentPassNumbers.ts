#!/usr/bin/env ts-node
/**
 * Fix Tournament passeNumber in ratingHistory
 * 
 * Die alten Tournament-Einträge haben kein passeNumber.
 * Wir müssen es aus der createdAt-Timestamp und tournaments/{tournamentId}/games holen.
 */

import * as admin from 'firebase-admin';
import * as path from 'path';

// Firebase Admin SDK initialisieren
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixTournamentPassNumbers() {
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
  
  // 1. Lade Tournament-Games mit passeNumber
  const gamesSnapshot = await db.collection(`tournaments/${tournamentId}/games`)
    .orderBy('passeNumber', 'asc')
    .get();
  
  console.log(`📁 ${gamesSnapshot.size} Tournament-Games gefunden\n`);
  
  const gameTimestampMap = new Map<string, number>();
  for (const gameDoc of gamesSnapshot.docs) {
    const gameData = gameDoc.data();
    const passeNumber = gameData.passeNumber;
    const completedAt = gameData.completedAt;
    
    if (completedAt && passeNumber !== undefined) {
      const timestamp = completedAt.toMillis ? completedAt.toMillis() : 
                       (completedAt._seconds * 1000 + Math.floor(completedAt._nanoseconds / 1000000));
      
      gameTimestampMap.set(`tournament_${tournamentId}_${timestamp}`, passeNumber);
      console.log(`✅ Passe ${passeNumber}: ${timestamp}`);
    }
  }
  
  // 2. Finde alle Spieler mit Tournament-Einträgen (alle Teilnehmer)
  const playerIds = [
    'b16c1120111b7d9e7d733837', // Remo
    'PLaDRlPBo91yu5Ij8MOT2', // Studi
    'TPBwj8bP9W59n5LoGWP5', // Schmuddi
    'F1uwdthL6zu7F0cYf1jbe', // Frank
  ];
  
  console.log(`\n🔍 Suche nach Tournament-Einträgen in ratingHistory...\n`);
  
  for (const playerId of playerIds) {
    const historySnapshot = await db.collection(`players/${playerId}/ratingHistory`).get();
    const tournamentEntries = historySnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.tournamentId === tournamentId && data.passeNumber === undefined;
    });
    
    console.log(`Player ${playerId.slice(0, 8)}: ${tournamentEntries.length} Tournament-Einträge ohne passeNumber`);
    
    for (const doc of tournamentEntries) {
      const data = doc.data();
      const completedAt = data.completedAt || data.createdAt;
      
      if (completedAt) {
        let timestamp: number;
        if (completedAt.toMillis) {
          timestamp = completedAt.toMillis();
        } else if (completedAt._seconds) {
          timestamp = completedAt._seconds * 1000 + Math.floor((completedAt._nanoseconds || 0) / 1000000);
        } else {
          timestamp = Date.parse(completedAt as any);
        }
        
        // Finde passeNumber basierend auf Timestamp
        let passeNumber: number | undefined;
        
        // Check direct match (timestamp +/- 5 seconds tolerance)
        for (const [key, pNum] of gameTimestampMap.entries()) {
          const matchTimestamp = parseInt(key.split('_')[2]);
          if (Math.abs(timestamp - matchTimestamp) < 5000) {
            passeNumber = pNum;
            break;
          }
        }
        
        if (passeNumber !== undefined) {
          console.log(`  ✅ Doc ${doc.id}: Setting passeNumber = ${passeNumber}`);
          
          // Update document
          await db.doc(`players/${playerId}/ratingHistory/${doc.id}`).update({
            passeNumber: passeNumber
          });
        } else {
          console.log(`  ⚠️  Doc ${doc.id}: No matching timestamp found (${timestamp})`);
        }
      }
    }
  }
  
  console.log(`\n✅ Tournament passeNumber Fix abgeschlossen!`);
}

fixTournamentPassNumbers()
  .then(() => {
    console.log('\n✅ Erfolgreich abgeschlossen!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Fehler:', error);
    process.exit(1);
  });

