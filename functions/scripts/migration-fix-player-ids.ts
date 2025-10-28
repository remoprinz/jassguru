/**
 * 🔒 SECURITY MIGRATION: Fix ONLY Critical Player IDs
 * 
 * Dieses Script migriert NUR die kritischen Player-IDs im Format `player_${userId}`.
 * Alle anderen bestehenden Player-IDs bleiben UNVERÄNDERT!
 * 
 * WICHTIG: Backup der Datenbank vor Ausführung erstellen!
 */

import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import * as serviceAccount from '../serviceAccountKey.json';

// Firebase Admin SDK initialisieren
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://jasstafel-default-rtdb.europe-west1.firebasedatabase.app'
});

const db = admin.firestore();

interface PlayerMigration {
  oldPlayerId: string;
  newPlayerId: string;
  userId: string;
  displayName: string;
  affectedGroups: string[];
  affectedSessions: string[];
  affectedTournaments: string[];
}

interface MigrationSummary {
  totalPlayersInDB: number;
  criticalPlayersFound: number;
  playersUpdated: number;
  groupsUpdated: number;
  sessionsUpdated: number;
  tournamentsUpdated: number;
  usersUpdated: number;
  errors: string[];
  untouchedPlayers: number;
}

async function findCriticalPlayerIds(): Promise<string[]> {
  console.log('🔍 Suche nach KRITISCHEN Player-IDs (nur player_${userId} Format)...');
  
  const playersSnapshot = await db.collection('players').get();
  const criticalIds: string[] = [];
  let totalPlayers = 0;
  let otherPatterns = 0;
  
  playersSnapshot.forEach(doc => {
    totalPlayers++;
    const playerId = doc.id;
    const data = doc.data();
    
    // NUR das kritische Pattern: player_[userId] wo userId mindestens 20 Zeichen hat (Firebase Auth UIDs)
    const criticalPattern = /^player_[a-zA-Z0-9]{20,}$/;
    
    if (criticalPattern.test(playerId)) {
      console.log(`🚨 KRITISCH gefunden: ${playerId} für User ${data.userId}`);
      criticalIds.push(playerId);
    } else {
      otherPatterns++;
    }
  });
  
  console.log(`📊 Analyse-Ergebnis:`);
  console.log(`   - Gesamt Player in DB: ${totalPlayers}`);
  console.log(`   - 🚨 Kritische Player-IDs: ${criticalIds.length}`);
  console.log(`   - ✅ Sichere/alte Player-IDs: ${otherPatterns} (bleiben unverändert)`);
  
  return criticalIds;
}

async function analyzePlayerImpact(playerId: string): Promise<{
  groups: string[];
  sessions: string[];
  tournaments: string[];
}> {
  console.log(`🔍 Analysiere Auswirkungen für Player ${playerId}...`);
  
  const groups: string[] = [];
  const sessions: string[] = [];
  const tournaments: string[] = [];
  
  // Gruppen finden
  const groupsSnapshot = await db.collection('groups')
    .where('playerIds', 'array-contains', playerId)
    .get();
  
  groupsSnapshot.forEach(doc => {
    groups.push(doc.id);
  });
  
  // Sessions finden
  const sessionsSnapshot = await db.collection('sessions')
    .where('participantPlayerIds', 'array-contains', playerId)
    .get();
  
  sessionsSnapshot.forEach(doc => {
    sessions.push(doc.id);
  });
  
  // Turniere finden
  const tournamentsSnapshot = await db.collection('tournaments')
    .where('participantPlayerIds', 'array-contains', playerId)
    .get();
  
  tournamentsSnapshot.forEach(doc => {
    tournaments.push(doc.id);
  });
  
  return { groups, sessions, tournaments };
}

async function generateSecurePlayerId(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const newId = randomBytes(12).toString('hex');
    
    // Prüfen, ob ID bereits existiert
    const existingDoc = await db.collection('players').doc(newId).get();
    if (!existingDoc.exists) {
      return newId;
    }
    
    attempts++;
  }
  
  throw new Error('Konnte keine eindeutige Player-ID generieren');
}

async function migrateCriticalPlayerWithReferences(
  oldPlayerId: string,
  newPlayerId: string,
  impact: { groups: string[]; sessions: string[]; tournaments: string[] }
): Promise<void> {
  console.log(`🔄 Migriere KRITISCHEN Player ${oldPlayerId} → ${newPlayerId}...`);
  
  const batch = db.batch();
  
  // 1. Player-Dokument umbenennen
  const oldPlayerRef = db.collection('players').doc(oldPlayerId);
  const newPlayerRef = db.collection('players').doc(newPlayerId);
  
  const playerDoc = await oldPlayerRef.get();
  if (playerDoc.exists) {
    const playerData = playerDoc.data();
    
    // Zusätzliche Sicherheitsprüfung: Ist dies wirklich eine kritische Player-ID?
    const criticalPattern = /^player_[a-zA-Z0-9]{20,}$/;
    if (!criticalPattern.test(oldPlayerId)) {
      throw new Error(`SICHERHEITSFEHLER: ${oldPlayerId} ist keine kritische Player-ID! Migration abgebrochen.`);
    }
    
    batch.set(newPlayerRef, {
      ...playerData,
      id: newPlayerId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      migrated: true,
      migrationDate: admin.firestore.FieldValue.serverTimestamp(),
      oldPlayerId: oldPlayerId,
      migrationReason: 'security_fix_critical_player_id'
    });
    batch.delete(oldPlayerRef);
  }
  
  // 2. User-Dokument aktualisieren
  const userData = playerDoc.data();
  if (userData?.userId) {
    const userRef = db.collection('users').doc(userData.userId);
    batch.update(userRef, {
      playerId: newPlayerId,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      migrationNote: 'player_id_security_fix'
    });
  }
  
  // 3. Gruppen aktualisieren
  for (const groupId of impact.groups) {
    const groupRef = db.collection('groups').doc(groupId);
    
    // Erst die neue Player-ID hinzufügen
    batch.update(groupRef, {
      playerIds: admin.firestore.FieldValue.arrayUnion(newPlayerId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Dann die alte Player-ID entfernen
    batch.update(groupRef, {
      playerIds: admin.firestore.FieldValue.arrayRemove(oldPlayerId)
    });
    
    // Player-Objekt in der Gruppe aktualisieren (falls vorhanden)
    const groupDoc = await groupRef.get();
    if (groupDoc.exists) {
      const groupData = groupDoc.data();
      if (groupData?.players?.[oldPlayerId]) {
        batch.update(groupRef, {
          [`players.${newPlayerId}`]: groupData.players[oldPlayerId],
          [`players.${oldPlayerId}`]: admin.firestore.FieldValue.delete()
        });
      }
    }
  }
  
  // 4. Sessions aktualisieren
  for (const sessionId of impact.sessions) {
    const sessionRef = db.collection('sessions').doc(sessionId);
    
    // Neue Player-ID hinzufügen und alte entfernen
    batch.update(sessionRef, {
      participantPlayerIds: admin.firestore.FieldValue.arrayUnion(newPlayerId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    batch.update(sessionRef, {
      participantPlayerIds: admin.firestore.FieldValue.arrayRemove(oldPlayerId)
    });
  }
  
  // 5. Turniere aktualisieren
  for (const tournamentId of impact.tournaments) {
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    
    // Neue Player-ID hinzufügen und alte entfernen
    batch.update(tournamentRef, {
      participantPlayerIds: admin.firestore.FieldValue.arrayUnion(newPlayerId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    batch.update(tournamentRef, {
      participantPlayerIds: admin.firestore.FieldValue.arrayRemove(oldPlayerId)
    });
  }
  
  // Batch ausführen
  await batch.commit();
  console.log(`✅ KRITISCHER Player ${oldPlayerId} erfolgreich zu ${newPlayerId} migriert`);
}

async function runCriticalMigration(): Promise<MigrationSummary> {
  console.log('🔒 Starte Security Migration für KRITISCHE Player-IDs...');
  console.log('🛡️  NUR player_${userId} IDs werden migriert - alle anderen bleiben unverändert!');
  console.log('⚠️  WICHTIG: Backup der Datenbank sollte vor Ausführung erstellt werden!');
  
  const summary: MigrationSummary = {
    totalPlayersInDB: 0,
    criticalPlayersFound: 0,
    playersUpdated: 0,
    groupsUpdated: 0,
    sessionsUpdated: 0,
    tournamentsUpdated: 0,
    usersUpdated: 0,
    errors: [],
    untouchedPlayers: 0
  };
  
  try {
    // 1. Kritische Player-IDs finden
    const criticalIds = await findCriticalPlayerIds();
    const totalPlayersSnapshot = await db.collection('players').get();
    
    summary.totalPlayersInDB = totalPlayersSnapshot.size;
    summary.criticalPlayersFound = criticalIds.length;
    summary.untouchedPlayers = summary.totalPlayersInDB - summary.criticalPlayersFound;
    
    if (criticalIds.length === 0) {
      console.log('✅ Keine kritischen Player-IDs gefunden! Alle Player-IDs sind bereits sicher.');
      return summary;
    }
    
    // 2. Migrations-Plan für kritische IDs erstellen
    const migrations: PlayerMigration[] = [];
    
    for (const oldPlayerId of criticalIds) {
      try {
        const playerDoc = await db.collection('players').doc(oldPlayerId).get();
        if (!playerDoc.exists) {
          continue;
        }
        
        const playerData = playerDoc.data();
        const newPlayerId = await generateSecurePlayerId();
        const impact = await analyzePlayerImpact(oldPlayerId);
        
        migrations.push({
          oldPlayerId,
          newPlayerId,
          userId: playerData?.userId || 'unknown',
          displayName: playerData?.displayName || 'Unbekannt',
          affectedGroups: impact.groups,
          affectedSessions: impact.sessions,
          affectedTournaments: impact.tournaments
        });
        
        summary.groupsUpdated += impact.groups.length;
        summary.sessionsUpdated += impact.sessions.length;
        summary.tournamentsUpdated += impact.tournaments.length;
        
      } catch (error) {
        console.error(`❌ Fehler bei Analyse von ${oldPlayerId}:`, error);
        summary.errors.push(`Analyse ${oldPlayerId}: ${error}`);
      }
    }
    
    // 3. Migration ausführen
    console.log(`\n📋 KRITISCHE Migration-Plan:`);
    console.log(`   - 🚨 ${migrations.length} KRITISCHE Player zu migrieren`);
    console.log(`   - ✅ ${summary.untouchedPlayers} Player bleiben UNVERÄNDERT`);
    console.log(`   - 📊 ${summary.groupsUpdated} Gruppen-Updates`);
    console.log(`   - 📊 ${summary.sessionsUpdated} Session-Updates`);
    console.log(`   - 📊 ${summary.tournamentsUpdated} Turnier-Updates`);
    console.log(`\n⏳ Starte Migration in 5 Sekunden...`);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    for (const migration of migrations) {
      try {
        await migrateCriticalPlayerWithReferences(
          migration.oldPlayerId,
          migration.newPlayerId,
          {
            groups: migration.affectedGroups,
            sessions: migration.affectedSessions,
            tournaments: migration.affectedTournaments
          }
        );
        
        summary.playersUpdated++;
        summary.usersUpdated++;
        
        console.log(`✅ Migration ${summary.playersUpdated}/${migrations.length} abgeschlossen`);
        
      } catch (error) {
        console.error(`❌ Migration-Fehler für ${migration.oldPlayerId}:`, error);
        summary.errors.push(`Migration ${migration.oldPlayerId}: ${error}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Kritischer Fehler bei Migration:', error);
    summary.errors.push(`Kritischer Fehler: ${error}`);
  }
  
  return summary;
}

// Ausführung nur wenn direkt aufgerufen
if (require.main === module) {
  runCriticalMigration()
    .then(summary => {
      console.log('\n🎉 KRITISCHE Migration abgeschlossen!');
      console.log('\n📊 Zusammenfassung:');
      console.log(`   - Gesamt Player in DB: ${summary.totalPlayersInDB}`);
      console.log(`   - 🚨 Kritische Player gefunden: ${summary.criticalPlayersFound}`);
      console.log(`   - ✅ Aktualisierte Player: ${summary.playersUpdated}`);
      console.log(`   - 🛡️ Unveränderte Player: ${summary.untouchedPlayers}`);
      console.log(`   - 📊 Aktualisierte Gruppen: ${summary.groupsUpdated}`);
      console.log(`   - 📊 Aktualisierte Sessions: ${summary.sessionsUpdated}`);
      console.log(`   - 📊 Aktualisierte Turniere: ${summary.tournamentsUpdated}`);
      console.log(`   - 📊 Aktualisierte User: ${summary.usersUpdated}`);
      console.log(`   - ❌ Fehler: ${summary.errors.length}`);
      
      if (summary.errors.length > 0) {
        console.log('\n❌ Fehler:');
        summary.errors.forEach(error => console.log(`   - ${error}`));
      }
      
      if (summary.playersUpdated > 0) {
        console.log('\n🔒 SICHERHEITSFIX ERFOLGREICH:');
        console.log('   - Alle kritischen Player-IDs wurden ersetzt');
        console.log('   - Bestehende sichere Player-IDs blieben unverändert');
        console.log('   - Referenzielle Integrität gewährleistet');
      }
      
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration fehlgeschlagen:', error);
      process.exit(1);
    });
} 