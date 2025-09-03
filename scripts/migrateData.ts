#!/usr/bin/env npx ts-node
/**
 * MINIMAL & ELEGANT: Data Migration Script
 * Kopiert bestehende Daten von alter zu neuer Struktur
 * 
 * Usage: npx ts-node scripts/migrateData.ts [groupId]
 */

import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  query, 
  where,
  writeBatch,
  Timestamp 
} from 'firebase/firestore';

// Firebase Config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyD6a6GcBkxHlk2f-Xg9xKpuHjc_CzAGkzQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "jassguru.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "jassguru",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "jassguru.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "365820375161",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:365820375161:web:01c1e0d96f748f652e4971"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateGroupData(groupId: string) {
  console.log(`\n🚀 Starte Migration für Gruppe: ${groupId}\n`);
  console.log('=' .repeat(50));
  
  let totalMigrated = 0;
  const startTime = Date.now();
  
  try {
    // 1. SESSIONS MIGRIEREN
    console.log('\n📂 Migriere Sessions...');
    const sessions = await getDocs(
      query(collection(db, 'sessions'), where('groupId', '==', groupId))
    );
    
    console.log(`   Gefunden: ${sessions.size} Sessions`);
    
    if (sessions.size > 0) {
      const batch = writeBatch(db);
      let batchCount = 0;
      
      for (const sessionDoc of sessions.docs) {
        const data = { ...sessionDoc.data() };
        delete data.groupId; // Nicht benötigt in neuer Struktur
        
        batch.set(
          doc(db, `groups/${groupId}/sessions`, sessionDoc.id),
          {
            ...data,
            _migrationTimestamp: Timestamp.now(),
            _migratedFrom: 'sessions'
          }
        );
        
        batchCount++;
        totalMigrated++;
        
        // Firestore Batch Limit: 500 operations
        if (batchCount >= 500) {
          await batch.commit();
          console.log(`   ✅ Batch mit ${batchCount} Sessions geschrieben`);
          batchCount = 0;
        }
      }
      
      if (batchCount > 0) {
        await batch.commit();
        console.log(`   ✅ ${sessions.size} Sessions migriert`);
      }
    }
    
    // 2. GAMES MIGRIEREN
    console.log('\n📂 Migriere Games...');
    const games = await getDocs(
      query(collection(db, 'jassGameSummaries'), where('groupId', '==', groupId))
    );
    
    console.log(`   Gefunden: ${games.size} Games`);
    
    if (games.size > 0) {
      const batch = writeBatch(db);
      let batchCount = 0;
      
      for (const gameDoc of games.docs) {
        const data = { ...gameDoc.data() };
        delete data.groupId;
        
        batch.set(
          doc(db, `groups/${groupId}/games`, gameDoc.id),
          {
            ...data,
            _migrationTimestamp: Timestamp.now(),
            _migratedFrom: 'jassGameSummaries'
          }
        );
        
        batchCount++;
        totalMigrated++;
        
        if (batchCount >= 500) {
          await batch.commit();
          console.log(`   ✅ Batch mit ${batchCount} Games geschrieben`);
          batchCount = 0;
        }
      }
      
      if (batchCount > 0) {
        await batch.commit();
        console.log(`   ✅ ${games.size} Games migriert`);
      }
    }
    
    // 3. TOURNAMENTS MIGRIEREN
    console.log('\n📂 Migriere Tournaments...');
    const tournaments = await getDocs(
      query(collection(db, 'tournaments'), where('groupId', '==', groupId))
    );
    
    console.log(`   Gefunden: ${tournaments.size} Tournaments`);
    
    if (tournaments.size > 0) {
      const batch = writeBatch(db);
      
      for (const tournamentDoc of tournaments.docs) {
        const data = { ...tournamentDoc.data() };
        delete data.groupId;
        
        batch.set(
          doc(db, `groups/${groupId}/tournaments`, tournamentDoc.id),
          {
            ...data,
            _migrationTimestamp: Timestamp.now(),
            _migratedFrom: 'tournaments'
          }
        );
        totalMigrated++;
      }
      
      await batch.commit();
      console.log(`   ✅ ${tournaments.size} Tournaments migriert`);
    }
    
    // 4. MEMBERS AUS PLAYERS ERSTELLEN
    console.log('\n📂 Erstelle Members aus Players...');
    const groupDoc = await getDocs(
      query(collection(db, 'groups'), where('__name__', '==', groupId))
    );
    
    if (!groupDoc.empty) {
      const groupData = groupDoc.docs[0].data();
      const playerIds = groupData.playerIds || [];
      const adminIds = groupData.adminIds || [];
      
      console.log(`   Gefunden: ${playerIds.length} Spieler in der Gruppe`);
      
      if (playerIds.length > 0) {
        const batch = writeBatch(db);
        
        for (const playerId of playerIds) {
          // Hole Player-Daten
          const playerSnapshot = await getDocs(
            query(collection(db, 'players'), where('__name__', '==', playerId))
          );
          
          if (!playerSnapshot.empty) {
            const playerData = playerSnapshot.docs[0].data();
            
            batch.set(
              doc(db, `groups/${groupId}/members`, playerId),
              {
                playerId,
                displayName: playerData.displayName || 'Unbekannt',
                photoURL: playerData.photoURL || null,
                email: playerData.email || null,
                role: adminIds.includes(playerId) ? 'admin' : 'member',
                joinedAt: playerData.createdAt || Timestamp.now(),
                lastActivity: playerData.lastActivity || Timestamp.now(),
                _migrationTimestamp: Timestamp.now(),
                _migratedFrom: 'players'
              }
            );
            totalMigrated++;
          }
        }
        
        await batch.commit();
        console.log(`   ✅ ${playerIds.length} Members erstellt`);
      }
    }
    
    // 5. ZUSAMMENFASSUNG
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '=' .repeat(50));
    console.log('✅ MIGRATION ERFOLGREICH ABGESCHLOSSEN');
    console.log('=' .repeat(50));
    console.log(`\n📊 Zusammenfassung:`);
    console.log(`   • Gruppe: ${groupId}`);
    console.log(`   • Migrierte Dokumente: ${totalMigrated}`);
    console.log(`   • Dauer: ${duration} Sekunden`);
    console.log(`\n🎯 Nächste Schritte:`);
    console.log(`   1. Öffnen Sie das Migration Dashboard`);
    console.log(`   2. Prüfen Sie die Counts`);
    console.log(`   3. Aktivieren Sie "Lese aus neuer Struktur"`);
    console.log(`   4. Testen Sie die App gründlich`);
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ FEHLER bei der Migration:', error);
    console.error('\nBitte prüfen Sie die Logs und versuchen Sie es erneut.');
    process.exit(1);
  }
}

// MAIN
async function main() {
  const groupId = process.argv[2];
  
  if (!groupId) {
    // Wenn keine groupId angegeben, hole die erste Gruppe
    console.log('Keine groupId angegeben, suche erste Gruppe...');
    const groups = await getDocs(collection(db, 'groups'));
    
    if (groups.empty) {
      console.error('❌ Keine Gruppen gefunden!');
      process.exit(1);
    }
    
    const firstGroup = groups.docs[0];
    console.log(`Verwende Gruppe: ${firstGroup.data().name} (${firstGroup.id})`);
    await migrateGroupData(firstGroup.id);
  } else {
    await migrateGroupData(groupId);
  }
  
  process.exit(0);
}

// Script starten
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
