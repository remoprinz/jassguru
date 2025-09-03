#!/usr/bin/env node
/**
 * ADMIN MIGRATION: Mit Firebase Admin SDK (hat alle Permissions)
 */

const admin = require('firebase-admin');

// Service Account initialisieren (aus functions/serviceAccountKey.json)
try {
  const serviceAccount = require('../functions/serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error('❌ Kann Service Account nicht laden. Bitte functions/serviceAccountKey.json überprüfen!');
  process.exit(1);
}

const db = admin.firestore();

async function migrateGroupData(groupId) {
  console.log(`\n🚀 Starte ADMIN Migration für Gruppe: ${groupId}\n`);
  console.log('=' .repeat(50));
  
  let totalMigrated = 0;
  const startTime = Date.now();
  
  try {
    // 1. SESSIONS MIGRIEREN
    console.log('\n📂 Migriere Sessions...');
    const sessions = await db.collection('sessions').where('groupId', '==', groupId).get();
    
    console.log(`   Gefunden: ${sessions.size} Sessions`);
    
    if (sessions.size > 0) {
      const batch = db.batch();
      
      for (const sessionDoc of sessions.docs) {
        const data = { ...sessionDoc.data() };
        delete data.groupId; // Nicht benötigt in neuer Struktur
        
        const newDocRef = db.collection(`groups/${groupId}/sessions`).doc(sessionDoc.id);
        batch.set(newDocRef, {
          ...data,
          _migrationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          _migratedFrom: 'sessions'
        });
        
        totalMigrated++;
      }
      
      await batch.commit();
      console.log(`   ✅ ${sessions.size} Sessions migriert`);
    }
    
    // 2. JASSGAMESUMMARIES MIGRIEREN (mit completedGames Substruktur!)
    console.log('\n📂 Migriere JassGameSummaries...');
    const jassGameSummaries = await db.collection('jassGameSummaries').where('groupId', '==', groupId).get();
    
    console.log(`   Gefunden: ${jassGameSummaries.size} JassGameSummaries (Sessions)`);
    
    let totalCompletedGames = 0;
    
    if (jassGameSummaries.size > 0) {
      for (const sessionDoc of jassGameSummaries.docs) {
        const sessionData = { ...sessionDoc.data() };
        delete sessionData.groupId;
        
        // 1. Migriere das Session-Dokument selbst
        const newSessionRef = db.collection(`groups/${groupId}/jassGameSummaries`).doc(sessionDoc.id);
        await newSessionRef.set({
          ...sessionData,
          _migrationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          _migratedFrom: 'jassGameSummaries'
        });
        totalMigrated++;
        
        // 2. Migriere alle completedGames dieser Session
        const completedGames = await db.collection(`jassGameSummaries/${sessionDoc.id}/completedGames`).get();
        
        if (completedGames.size > 0) {
          const batch = db.batch();
          
          for (const gameDoc of completedGames.docs) {
            const gameData = { ...gameDoc.data() };
            
            const newGameRef = db.collection(`groups/${groupId}/jassGameSummaries/${sessionDoc.id}/completedGames`).doc(gameDoc.id);
            batch.set(newGameRef, {
              ...gameData,
              _migrationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
              _migratedFrom: 'completedGames'
            });
            
            totalCompletedGames++;
            totalMigrated++;
          }
          
          await batch.commit();
        }
      }
      
      console.log(`   ✅ ${jassGameSummaries.size} Sessions migriert`);
      console.log(`   ✅ ${totalCompletedGames} CompletedGames migriert`);
    }
    
    // 3. TOURNAMENTS MIGRIEREN
    console.log('\n📂 Migriere Tournaments...');
    const tournaments = await db.collection('tournaments').where('groupId', '==', groupId).get();
    
    console.log(`   Gefunden: ${tournaments.size} Tournaments`);
    
    if (tournaments.size > 0) {
      const batch = db.batch();
      
      for (const tournamentDoc of tournaments.docs) {
        const data = { ...tournamentDoc.data() };
        delete data.groupId;
        
        const newDocRef = db.collection(`groups/${groupId}/tournaments`).doc(tournamentDoc.id);
        batch.set(newDocRef, {
          ...data,
          _migrationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          _migratedFrom: 'tournaments'
        });
        
        totalMigrated++;
      }
      
      await batch.commit();
      console.log(`   ✅ ${tournaments.size} Tournaments migriert`);
    }
    
    // 4. MEMBERS AUS PLAYERS ERSTELLEN
    console.log('\n📂 Erstelle Members aus Players...');
    const groupDoc = await db.collection('groups').doc(groupId).get();
    
    if (groupDoc.exists) {
      const groupData = groupDoc.data();
      const playerIds = groupData.playerIds || [];
      const adminIds = groupData.adminIds || [];
      
      console.log(`   Gefunden: ${playerIds.length} Spieler in der Gruppe`);
      
      if (playerIds.length > 0) {
        const batch = db.batch();
        
        for (const playerId of playerIds) {
          // Hole Player-Daten
          const playerDoc = await db.collection('players').doc(playerId).get();
          
          if (playerDoc.exists) {
            const playerData = playerDoc.data();
            
            const newDocRef = db.collection(`groups/${groupId}/members`).doc(playerId);
            batch.set(newDocRef, {
              playerId,
              displayName: playerData.displayName || 'Unbekannt',
              photoURL: playerData.photoURL || null,
              email: playerData.email || null,
              role: adminIds.includes(playerId) ? 'admin' : 'member',
              joinedAt: playerData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
              lastActivity: playerData.lastActivity || admin.firestore.FieldValue.serverTimestamp(),
              _migrationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
              _migratedFrom: 'players'
            });
            totalMigrated++;
          }
        }
        
        await batch.commit();
        console.log(`   ✅ ${playerIds.length} Members erstellt`);
      }
    }
    
    // 5. GROUP COMPUTED STATS MIGRIEREN
    console.log('\n📊 Migriere Group Computed Stats...');
    const groupStatsDoc = await db.collection('groupComputedStats').doc(groupId).get();
    
    if (groupStatsDoc.exists) {
      const statsData = groupStatsDoc.data();
      
      const newStatsRef = db.collection(`groups/${groupId}/stats`).doc('computed');
      await newStatsRef.set({
        ...statsData,
        _migrationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        _migratedFrom: 'groupComputedStats'
      });
      
      totalMigrated++;
      console.log(`   ✅ 1 GroupStats migriert`);
    } else {
      console.log(`   ℹ️  Keine GroupStats gefunden für Gruppe ${groupId}`);
    }
    
    // 6. GROUP INVITES MIGRIEREN
    console.log('\n📨 Migriere Group Invites...');
    const groupInvites = await db.collection('groupInvites').where('groupId', '==', groupId).get();
    
    console.log(`   Gefunden: ${groupInvites.size} Group Invites`);
    
    if (groupInvites.size > 0) {
      const batch = db.batch();
      
      for (const inviteDoc of groupInvites.docs) {
        const data = { ...inviteDoc.data() };
        // Entferne groupId aus den Daten (ist im Pfad)
        delete data.groupId;
        
        const newDocRef = db.collection(`groups/${groupId}/invites`).doc(inviteDoc.id);
        batch.set(newDocRef, {
          ...data,
          _migrationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          _migratedFrom: 'groupInvites'
        });
        
        totalMigrated++;
      }
      
      await batch.commit();
      console.log(`   ✅ ${groupInvites.size} GroupInvites migriert`);
    }
    
    // 7. ZUSAMMENFASSUNG
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
    console.log(`   2. Prüfen Sie die Counts (sollten jetzt stimmen!)`);
    console.log(`   3. Aktivieren Sie "Lese aus neuer Struktur"`);
    console.log(`   4. Testen Sie die App gründlich`);
    console.log('\n🎉 MIGRATION ABGESCHLOSSEN!\n');
    
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
    console.error('❌ FEHLER: Bitte GroupId als Argument angeben!');
    console.error('Usage: node scripts/migrateDataAdmin.cjs <groupId>');
    process.exit(1);
  }
  
  await migrateGroupData(groupId);
  process.exit(0);
}

// Script starten
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
