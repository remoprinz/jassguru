#!/usr/bin/env ts-node

/**
 * 🔧 PERMISSION FIX SCRIPT
 * Behebt die participantUids/participantPlayerIds Inkonsistenzen
 * 
 * Verwendung:
 * npm run fix-permissions -- --dry-run  // Test-Lauf ohne Änderungen
 * npm run fix-permissions               // Führt Fixes aus
 */

import * as admin from 'firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';

// Service Account Key laden
const serviceAccount = require('../functions/serviceAccountKey.json');

// Firebase Admin initialisieren
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = getFirestore();

interface FixOptions {
  dryRun: boolean;
  groupId?: string;
  verbose: boolean;
}

/**
 * Hauptfunktion zum Fixen der Permissions
 */
async function fixPermissions(options: FixOptions) {
  console.log('🔧 Starting Permission Fix...');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  
  let fixedCount = 0;
  let errorCount = 0;
  
  try {
    // 1. Sessions fixen
    console.log('\n📂 Fixing Sessions...');
    const sessionsResult = await fixCollection('sessions', options);
    fixedCount += sessionsResult.fixed;
    errorCount += sessionsResult.errors;
    
    // 2. ActiveGames fixen
    console.log('\n📂 Fixing ActiveGames...');
    const activeGamesResult = await fixCollection('activeGames', options);
    fixedCount += activeGamesResult.fixed;
    errorCount += activeGamesResult.errors;
    
    // 3. JassGameSummaries fixen
    console.log('\n📂 Fixing JassGameSummaries...');
    const summariesResult = await fixCollection('jassGameSummaries', options);
    fixedCount += summariesResult.fixed;
    errorCount += summariesResult.errors;
    
    // 4. Tournaments fixen
    console.log('\n📂 Fixing Tournaments...');
    const tournamentsResult = await fixCollection('tournaments', options);
    fixedCount += tournamentsResult.fixed;
    errorCount += tournamentsResult.errors;
    
    // Zusammenfassung
    console.log('\n✅ Permission Fix Complete!');
    console.log(`Fixed: ${fixedCount} documents`);
    console.log(`Errors: ${errorCount} documents`);
    
    if (options.dryRun) {
      console.log('\n⚠️  This was a DRY RUN - no changes were made.');
      console.log('Run without --dry-run to apply changes.');
    }
    
  } catch (error) {
    console.error('❌ Fatal error during permission fix:', error);
    process.exit(1);
  }
}

/**
 * Fixt eine einzelne Collection
 */
async function fixCollection(
  collectionName: string, 
  options: FixOptions
): Promise<{ fixed: number; errors: number }> {
  let fixed = 0;
  let errors = 0;
  
  try {
    // Query erstellen
    let query = db.collection(collectionName);
    
    // Optional: Auf eine Gruppe filtern
    if (options.groupId) {
      query = query.where('groupId', '==', options.groupId) as any;
    }
    
    const snapshot = await query.get();
    console.log(`Found ${snapshot.size} documents in ${collectionName}`);
    
    // Batch für Updates
    const batches: admin.firestore.WriteBatch[] = [];
    let currentBatch = db.batch();
    let operationCount = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates: any = {};
      let needsUpdate = false;
      
      // Check 1: participantPlayerIds fehlt aber participantUids existiert
      if (data.participantUids && !data.participantPlayerIds) {
        // Versuche PlayerIds aus UIDs zu ermitteln
        const playerIds = await getPlayerIdsFromUids(data.participantUids);
        if (playerIds.length > 0) {
          updates.participantPlayerIds = playerIds;
          needsUpdate = true;
          if (options.verbose) {
            console.log(`  📝 ${doc.id}: Adding participantPlayerIds`);
          }
        }
      }
      
      // Check 2: participantUids fehlt aber participantPlayerIds existiert
      if (!data.participantUids && data.participantPlayerIds) {
        // Versuche UIDs aus PlayerIds zu ermitteln
        const uids = await getUidsFromPlayerIds(data.participantPlayerIds);
        if (uids.length > 0) {
          updates.participantUids = uids;
          needsUpdate = true;
          if (options.verbose) {
            console.log(`  📝 ${doc.id}: Adding participantUids`);
          }
        }
      }
      
      // Check 3: Beide fehlen aber playerNames existiert
      if (!data.participantUids && !data.participantPlayerIds && data.playerNames) {
        const { uids, playerIds } = await getIdsFromPlayerNames(data.playerNames);
        if (uids.length > 0 || playerIds.length > 0) {
          if (uids.length > 0) updates.participantUids = uids;
          if (playerIds.length > 0) updates.participantPlayerIds = playerIds;
          needsUpdate = true;
          if (options.verbose) {
            console.log(`  📝 ${doc.id}: Adding both ID arrays from playerNames`);
          }
        }
      }
      
      // Update durchführen
      if (needsUpdate && !options.dryRun) {
        updates.lastPermissionFix = Timestamp.now();
        currentBatch.update(doc.ref, updates);
        operationCount++;
        fixed++;
        
        // Neuer Batch nach 500 Operationen
        if (operationCount >= 500) {
          batches.push(currentBatch);
          currentBatch = db.batch();
          operationCount = 0;
        }
      } else if (needsUpdate && options.dryRun) {
        fixed++;
      }
    }
    
    // Letzten Batch hinzufügen
    if (operationCount > 0) {
      batches.push(currentBatch);
    }
    
    // Alle Batches committen
    if (!options.dryRun) {
      for (const batch of batches) {
        await batch.commit();
      }
    }
    
  } catch (error) {
    console.error(`❌ Error fixing ${collectionName}:`, error);
    errors++;
  }
  
  return { fixed, errors };
}

/**
 * Hilfsfunktion: PlayerIds aus UIDs ermitteln
 */
async function getPlayerIdsFromUids(uids: string[]): Promise<string[]> {
  const playerIds: string[] = [];
  
  for (const uid of uids) {
    try {
      // User-Dokument abrufen
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists && userDoc.data()?.playerId) {
        playerIds.push(userDoc.data()!.playerId);
      }
    } catch (error) {
      // Ignoriere Fehler für einzelne UIDs
    }
  }
  
  return playerIds;
}

/**
 * Hilfsfunktion: UIDs aus PlayerIds ermitteln
 */
async function getUidsFromPlayerIds(playerIds: string[]): Promise<string[]> {
  const uids: string[] = [];
  
  for (const playerId of playerIds) {
    try {
      // Player-Dokument abrufen
      const playerDoc = await db.collection('players').doc(playerId).get();
      if (playerDoc.exists && playerDoc.data()?.userId) {
        uids.push(playerDoc.data()!.userId);
      }
    } catch (error) {
      // Ignoriere Fehler für einzelne PlayerIds
    }
  }
  
  return uids;
}

/**
 * Hilfsfunktion: IDs aus PlayerNames ermitteln
 */
async function getIdsFromPlayerNames(
  playerNames: any
): Promise<{ uids: string[]; playerIds: string[] }> {
  const uids: string[] = [];
  const playerIds: string[] = [];
  
  // PlayerNames können verschiedene Formate haben
  const names = Array.isArray(playerNames) 
    ? playerNames 
    : Object.values(playerNames || {});
  
  for (const name of names) {
    if (typeof name === 'string') {
      try {
        // Suche nach Player mit diesem Namen
        const playersQuery = await db.collection('players')
          .where('displayName', '==', name)
          .limit(1)
          .get();
        
        if (!playersQuery.empty) {
          const playerDoc = playersQuery.docs[0];
          playerIds.push(playerDoc.id);
          
          if (playerDoc.data().userId) {
            uids.push(playerDoc.data().userId);
          }
        }
      } catch (error) {
        // Ignoriere Fehler für einzelne Namen
      }
    }
  }
  
  return { uids, playerIds };
}

/**
 * CLI Argument Parser
 */
function parseArgs(): FixOptions {
  const args = process.argv.slice(2);
  const options: FixOptions = {
    dryRun: false,
    verbose: false
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      case '--group':
      case '-g':
        options.groupId = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Permission Fix Script

Usage: npm run fix-permissions [options]

Options:
  --dry-run, -d     Run without making changes
  --group, -g       Fix only a specific group
  --verbose, -v     Show detailed output
  --help, -h        Show this help message

Examples:
  npm run fix-permissions --dry-run
  npm run fix-permissions --group abc123
  npm run fix-permissions --verbose
        `);
        process.exit(0);
    }
  }
  
  return options;
}

// Script ausführen
if (require.main === module) {
  const options = parseArgs();
  fixPermissions(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export { fixPermissions };
