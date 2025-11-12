#!/usr/bin/env node

import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Command } from 'commander';

// Firebase Admin SDK initialisieren
const serviceAccountPath = join(__dirname, '../../../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

const program = new Command();
program
  .option('--group-id <id>', 'Specific group ID to fix (optional)')
  .option('--dry-run', 'Dry run mode - no actual writes')
  .option('--confirm', 'Confirm actual execution')
  .parse(process.argv);

const options = program.opts();
const targetGroupId = options.groupId || 'Tz0wgIHMTlhvTtFastiJ'; // Default: fürDich OGs
const isDryRun = options.dryRun;
const isConfirmed = options.confirm;

async function fixRatingHistoryTimestamps(groupId: string) {
  console.log(`🔍 Starte Fix für Gruppe: ${groupId}\n`);
  
  if (isDryRun) {
    console.log('🧪 DRY-RUN Modus - keine Änderungen werden geschrieben\n');
  } else if (!isConfirmed) {
    console.log('❌ Bestätigung erforderlich! Verwenden Sie --confirm um fortzufahren\n');
    return;
  }

  try {
    // 1. Hole alle Sessions aus jassGameSummaries
    console.log(`📊 Lade Sessions aus groups/${groupId}/jassGameSummaries...`);
    const sessionsSnapshot = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .orderBy('completedAt', 'asc')
      .get();

    console.log(`📁 ${sessionsSnapshot.size} Sessions gefunden\n`);

    const stats = {
      sessionsProcessed: 0,
      playersUpdated: 0,
      entriesUpdated: 0,
      errors: [] as string[]
    };

    // 2. Für jede Session
    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      const sessionId = sessionDoc.id;
      
      const playerIds = sessionData.participantPlayerIds || [];
      
      console.log(`📅 Session: ${sessionId}`);
      stats.sessionsProcessed++;

      // 3. Hole alle Spiele (completedGames) in dieser Session
      const gamesSnapshot = await db.collection(`groups/${groupId}/jassGameSummaries/${sessionId}/completedGames`)
        .orderBy('gameNumber', 'asc')
        .get();

      console.log(`   Spiele gefunden: ${gamesSnapshot.size}`);

      // Sammle ALLE Spiele (auch ohne Timestamps!)
      const gamesWithTimestamps: Array<{ gameNumber: number; completedAt: admin.firestore.Timestamp | null }> = [];
      
      for (const gameDoc of gamesSnapshot.docs) {
        const gameData = gameDoc.data();
        const gameNumber = gameData.gameNumber;
        
        let gameCompletedAt: admin.firestore.Timestamp | null = null;
        
        // 1. Versuche completedAt
        if (gameData.completedAt && gameData.completedAt._seconds) {
          gameCompletedAt = admin.firestore.Timestamp.fromMillis(
            gameData.completedAt._seconds * 1000 + (gameData.completedAt._nanoseconds || 0) / 1000000
          );
        }
        // 2. Fallback: timestampCompleted
        else if (gameData.timestampCompleted && gameData.timestampCompleted._seconds) {
          gameCompletedAt = admin.firestore.Timestamp.fromMillis(
            gameData.timestampCompleted._seconds * 1000 + (gameData.timestampCompleted._nanoseconds || 0) / 1000000
          );
        }
        // 3. Fallback: roundHistory timestamps
        else if (gameData.roundHistory && Array.isArray(gameData.roundHistory) && gameData.roundHistory.length > 0) {
          const millis: number[] = [];
          gameData.roundHistory.forEach((r: any) => {
            if (typeof r?.timestamp === 'number') millis.push(r.timestamp);
          });
          if (millis.length > 0) {
            const maxMs = Math.max(...millis);
            gameCompletedAt = admin.firestore.Timestamp.fromMillis(maxMs);
          }
        }
        
        gamesWithTimestamps.push({ gameNumber, completedAt: gameCompletedAt });
        
        if (!gameCompletedAt) {
          console.log(`   ⚠️  Spiel ${gameNumber} hat kein completedAt!`);
        }
      }
      
      // ✅ Sortiere nach gameNumber (da wir über gameNumber zuordnen, nicht Index!)
      gamesWithTimestamps.sort((a, b) => a.gameNumber - b.gameNumber);

      // 4. Hole ALLE ratingHistory Einträge für ALLE Spieler sortiert
      for (const playerId of playerIds) {
        try {
          const historyRef = db.collection(`players/${playerId}/ratingHistory`);
          const allHistorySnapshot = await historyRef.get();
          
          // ✅ WICHTIG: Nur Game-Events (game, game_end), NICHT session_end oder tournament_end!
          const sessionHistoryDocs = allHistorySnapshot.docs
            .filter(doc => {
              const data = doc.data();
              
              // Nur 'game' oder 'game_end' Events!
              const isGameEvent = data.eventType === 'game' || data.eventType === 'game_end';
              if (!isGameEvent) {
                return false;
              }
              
              const hasSessionId = data.sessionId === sessionId;
              const hasGameIdWithSession = data.gameId && data.gameId.startsWith(sessionId);
              
              return hasSessionId || hasGameIdWithSession;
            })
            .sort((a, b) => {
              const aData = a.data();
              const bData = b.data();
              const aMillis = aData.createdAt?.toMillis?.() || aData.createdAt?._seconds * 1000 || 0;
              const bMillis = bData.createdAt?.toMillis?.() || bData.createdAt?._seconds * 1000 || 0;
              return aMillis - bMillis;
            });

          if (sessionHistoryDocs.length === 0) {
            console.log(`   ⚠️  Keine ratingHistory für Player ${playerId.slice(0,8)}...`);
            continue;
          }

          console.log(`   👤 Player ${playerId.slice(0,8)}...: ${sessionHistoryDocs.length} Einträge`);

          // ✅ ANTI-DUPLIKAT: Verarbeite nur EINEN Eintrag pro gameNumber
          const processedGames = new Set<number>();
          
          for (let index = 0; index < sessionHistoryDocs.length; index++) {
            const historyDoc = sessionHistoryDocs[index];
            const historyData = historyDoc.data();
            
            // ✅ QUELLE DER WAHRHEIT: Extrahiere gameNumber aus gameId (0-basiert → 1-basiert)
            let historyGameNumber: number | undefined;
            
            if (historyData.gameId && typeof historyData.gameId === 'string') {
              // gameId Format: "sessionId_0", "sessionId_1", etc. (0-basiert!)
              const parts = historyData.gameId.split('_');
              if (parts.length >= 2) {
                const gameIndex = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(gameIndex)) {
                  historyGameNumber = gameIndex + 1; // 0-basiert → 1-basiert
                  console.log(`      🔄 gameId ${historyData.gameId} → gameNumber ${historyGameNumber}`);
                }
              }
            }
            
            // Fallback 1: Vorhandene gameNumber verwenden
            if (historyGameNumber === undefined && historyData.gameNumber !== undefined) {
              historyGameNumber = historyData.gameNumber;
              console.log(`      🔄 Verwende vorhandene gameNumber ${historyGameNumber}`);
            }
            
            // Fallback 2: Index (History-Einträge sind chronologisch sortiert)
            if (historyGameNumber === undefined) {
              const game = gamesWithTimestamps[index];
              if (game) {
                historyGameNumber = game.gameNumber;
                console.log(`      🔄 Verwende Index ${index} → gameNumber ${historyGameNumber}`);
              }
            }
            
            if (historyGameNumber === undefined) {
              console.log(`      ⚠️  Keine gameNumber für index ${index}`);
              continue;
            }
            
            // ✅ ANTI-DUPLIKAT: Skip wenn dieses Spiel bereits verarbeitet wurde
            if (processedGames.has(historyGameNumber)) {
              console.log(`      ⚠️  Spiel ${historyGameNumber} bereits verarbeitet, überspringe Duplikat ${historyDoc.id}`);
              continue;
            }
            
            // Finde Spiel über gameNumber (einfach und elegant!)
            const game = gamesWithTimestamps.find(g => g.gameNumber === historyGameNumber);
            
            if (!game) {
              console.log(`      ⚠️  Kein Spiel mit gameNumber ${historyGameNumber} gefunden`);
              continue;
            }
            
            const correctTimestamp = game.completedAt;
            
            // ⚠️ WICHTIG: Skip wenn kein Timestamp verfügbar
            if (!correctTimestamp) {
              console.log(`      ⚠️  Spiel ${game.gameNumber} hat kein completedAt! Skipping...`);
              continue;
            }
            
            console.log(`      ✅ Spiel ${game.gameNumber}: Eintrag ${historyDoc.id} → ${correctTimestamp.toDate().toISOString()}`);
            
            // ✅ ANTI-DUPLIKAT: Markiere als verarbeitet
            processedGames.add(historyGameNumber);
            
            if (!isDryRun) {
              // ✅ WICHTIG: Schreibe nicht nur Timestamp, sondern auch korrigierte Felder!
              const updateData: any = {
                createdAt: correctTimestamp,
                completedAt: correctTimestamp,
                gameNumber: historyGameNumber  // ✅ IMMER schreiben (korrigiert falsche Werte!)
              };
              
              // Füge sessionId hinzu falls fehlt (für alte Einträge)
              if (!historyData.sessionId) {
                updateData.sessionId = sessionId;
                console.log(`      📝 Schreibe sessionId ${sessionId} in ratingHistory`);
              }
              
              if (historyData.gameNumber !== historyGameNumber) {
                console.log(`      📝 Korrigiere gameNumber ${historyData.gameNumber} → ${historyGameNumber}`);
              }
              
              historyDoc.ref.update(updateData);
            }
            
            stats.entriesUpdated++;
          }
        } catch (playerError) {
          const errorMsg = `Fehler bei Player ${playerId}: ${playerError}`;
          console.error(`      ❌ ${errorMsg}`);
          stats.errors.push(errorMsg);
        }
      }
      
      console.log('');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('📊 ZUSAMMENFASSUNG');
    console.log('='.repeat(80));
    console.log(`Sessions verarbeitet: ${stats.sessionsProcessed}`);
    console.log(`Spieler aktualisiert: ${stats.playersUpdated}`);
    console.log(`Einträge korrigiert: ${stats.entriesUpdated}`);
    
    if (stats.errors.length > 0) {
      console.log(`\nFehler: ${stats.errors.length}`);
      stats.errors.forEach(err => console.log(`  - ${err}`));
    }
    
    if (isDryRun) {
      console.log('\n🧪 DRY-RUN: Keine Änderungen wurden geschrieben');
      console.log('Führen Sie das Skript ohne --dry-run aus um die Änderungen zu speichern');
    } else {
      console.log('\n✅ Alle Timestamps wurden korrigiert!');
    }
    
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Fehler:', error);
    process.exit(1);
  }
}

fixRatingHistoryTimestamps(targetGroupId)
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });


