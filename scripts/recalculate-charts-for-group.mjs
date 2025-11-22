#!/usr/bin/env node

/**
 * Berechnet die Chart-Daten für eine Gruppe neu
 * Nützlich wenn Tournament-Sessions nicht korrekt verarbeitet wurden
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '..', 'serviceAccountKey.json'), 'utf8')
);

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = getFirestore(app);

const GROUP_ID = process.argv[2] || 'Tz0wgIHMTlhvTtFastiJ';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Recalculate Charts for Group                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📊 Gruppe: ${GROUP_ID}\n`);
  
  // Lade alle completed Sessions
  const sessionsSnap = await db.collection(`groups/${GROUP_ID}/jassGameSummaries`)
    .where('status', '==', 'completed')
    .orderBy('completedAt', 'asc')
    .get();
  
  console.log(`✅ Gefunden: ${sessionsSnap.size} completed Sessions\n`);
  
  // Finde Tournament-Sessions
  const tournamentSessions = [];
  sessionsSnap.forEach(doc => {
    const data = doc.data();
    const isTournament = data.isTournamentSession || 
                         !!data.tournamentId || 
                         (Array.isArray(data.gameResults) && data.gameResults.length > 0);
    
    if (isTournament) {
      tournamentSessions.push({
        id: doc.id,
        tournamentId: data.tournamentId,
        completedAt: data.completedAt?.toDate()?.toISOString() || 'unknown',
        isTournamentSession: data.isTournamentSession,
        hasGameResults: Array.isArray(data.gameResults) && data.gameResults.length > 0
      });
    }
  });
  
  console.log(`🎯 Tournament-Sessions: ${tournamentSessions.length}\n`);
  tournamentSessions.forEach(session => {
    console.log(`  - ${session.id}`);
    console.log(`    tournamentId: ${session.tournamentId || 'N/A'}`);
    console.log(`    completedAt: ${session.completedAt}`);
    console.log(`    isTournamentSession: ${session.isTournamentSession}`);
    console.log(`    hasGameResults: ${session.hasGameResults}\n`);
  });
  
  // Trigger chart update für die neueste Tournament-Session
  if (tournamentSessions.length > 0) {
    const latestTournament = tournamentSessions[tournamentSessions.length - 1];
    console.log(`\n🔄 Trigger chart update für neueste Tournament-Session: ${latestTournament.id}\n`);
    
    // Importiere die Cloud Function (lokal)
    try {
      // Für lokale Ausführung müssen wir die Funktion direkt aufrufen
      // Da wir in einem Script sind, müssen wir die Charts manuell neu berechnen
      console.log('⚠️  Hinweis: Charts müssen über die Cloud Function aktualisiert werden.');
      console.log('   Rufe die Cloud Function "updateChartsAfterSession" auf oder');
      console.log('   verwende das Backfill-Script.\n');
      
      console.log('💡 Lösung: Führe das Backfill-Script aus:');
      console.log(`   node scripts/backfill-chartdata-single-group.cjs ${GROUP_ID}\n`);
      
    } catch (error) {
      console.error('❌ Fehler:', error);
    }
  }
  
  console.log('✅ Audit abgeschlossen!\n');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

