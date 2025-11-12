import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Command } from 'commander';

const serviceAccountPath = join(__dirname, '../../../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

const program = new Command();
program
  .option('--group-id <id>', 'Specific group ID (optional)')
  .option('--dry-run', 'Dry run mode')
  .option('--confirm', 'Confirm execution')
  .parse(process.argv);

const options = program.opts();
const targetGroupId = options.groupId || 'Tz0wgIHMTlhvTtFastiJ';
const isDryRun = options.dryRun;
const isConfirmed = options.confirm;

async function addMissingCompletedAt(groupId: string) {
  console.log(`🔍 Starte Add Missing completedAt für Gruppe: ${groupId}\n`);
  
  if (isDryRun) {
    console.log('🧪 DRY-RUN Modus\n');
  } else if (!isConfirmed) {
    console.log('❌ --confirm erforderlich!\n');
    return;
  }

  const stats = {
    sessionsProcessed: 0,
    gamesUpdated: 0,
    gamesSkipped: 0
  };

  const sessionsSnapshot = await db.collection(`groups/${groupId}/jassGameSummaries`)
    .orderBy('completedAt', 'asc')
    .get();

  console.log(`📁 ${sessionsSnapshot.size} Sessions\n`);

  for (const sessionDoc of sessionsSnapshot.docs) {
    const sessionId = sessionDoc.id;
    console.log(`📅 Session: ${sessionId}`);
    stats.sessionsProcessed++;

    const gamesSnapshot = await sessionDoc.ref.collection('completedGames')
      .orderBy('gameNumber', 'asc')
      .get();

    for (const gameDoc of gamesSnapshot.docs) {
      const gameData = gameDoc.data();
      const gameNumber = gameData.gameNumber;
      
      // Skip if already has completedAt
      if (gameData.completedAt) {
        stats.gamesSkipped++;
        continue;
      }

      let candidateTs: admin.firestore.Timestamp | null = null;

      // 1) Try timestampCompleted
      if (gameData.timestampCompleted && gameData.timestampCompleted._seconds) {
        candidateTs = admin.firestore.Timestamp.fromMillis(
          gameData.timestampCompleted._seconds * 1000 + (gameData.timestampCompleted._nanoseconds || 0) / 1000000
        );
      }
      // 2) Try max(roundHistory[].timestamp)
      else if (gameData.roundHistory && Array.isArray(gameData.roundHistory) && gameData.roundHistory.length > 0) {
        const millis: number[] = [];
        gameData.roundHistory.forEach((r: any) => {
          if (typeof r?.timestamp === 'number') millis.push(r.timestamp);
        });
        if (millis.length > 0) {
          const maxMs = Math.max(...millis);
          candidateTs = admin.firestore.Timestamp.fromMillis(maxMs);
        }
      }

      if (!candidateTs) {
        console.log(`   ⚠️  Spiel ${gameNumber}: Kein Timestamp ableitbar`);
        continue;
      }

      console.log(`   ✅ Spiel ${gameNumber}: completedAt = ${candidateTs.toDate().toISOString()}`);

      if (!isDryRun) {
        await gameDoc.ref.update({ completedAt: candidateTs });
      }

      stats.gamesUpdated++;
    }

    console.log('');
  }

  console.log('='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(80));
  console.log(`Sessions verarbeitet: ${stats.sessionsProcessed}`);
  console.log(`Spiele aktualisiert: ${stats.gamesUpdated}`);
  console.log(`Spiele übersprungen (hatte bereits completedAt): ${stats.gamesSkipped}`);
  console.log('='.repeat(80));
}

addMissingCompletedAt(targetGroupId)
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

