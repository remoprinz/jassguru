/**
 * 🔍 DEBUG-SCRIPT: Finalize Tournament mit detaillierten Logs
 * 
 * Ziel: Herausfinden, warum playerRankings nicht geschrieben werden
 * 
 * Usage:
 *   npm run tsx scripts/debugFinalizeTournament.ts mkSLlt6XVZWySCN8CgLX
 */

import * as admin from 'firebase-admin';

// Firebase Admin initialisieren
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'jassguru.appspot.com'
});

const db = admin.firestore();

/**
 * 🔍 PHASE 1: Turnier-Daten inspizieren
 */
async function inspectTournamentData(tournamentId: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 PHASE 1: Turnier-Daten Inspektion');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const tournamentRef = db.collection('tournaments').doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  
  if (!tournamentSnap.exists) {
    console.error('❌ Turnier nicht gefunden:', tournamentId);
    return null;
  }
  
  const tournamentData = tournamentSnap.data() as any;
  console.log('✅ Turnier gefunden:', tournamentData.name);
  console.log('   Status:', tournamentData.status);
  console.log('   Mode:', tournamentData.tournamentMode);
  console.log('   Group:', tournamentData.groupId);
  console.log('   Participants:', tournamentData.participantUids?.length || 0);
  console.log('   Last Error:', tournamentData.lastError || 'none');
  
  return tournamentData;
}

/**
 * 🔍 PHASE 2: Games inspizieren
 */
async function inspectTournamentGames(tournamentId: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 PHASE 2: Games Inspektion');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const gamesRef = db.collection('tournaments').doc(tournamentId).collection('games');
  const gamesSnap = await gamesRef.get();
  
  console.log(`✅ ${gamesSnap.size} Games gefunden\n`);
  
  let validGames = 0;
  let invalidGames = 0;
  const issues: string[] = [];
  
  for (const gameDoc of gamesSnap.docs) {
    const game = gameDoc.data();
    const gameId = gameDoc.id;
    
    console.log(`📋 Game ${gameId}:`);
    console.log(`   Status: ${game.status}`);
    
    // Prüfe kritische Felder
    const hasTeams = !!game.teams;
    const hasTop = !!game.teams?.top;
    const hasBottom = !!game.teams?.bottom;
    const hasTopPlayers = !!game.teams?.top?.players;
    const hasBottomPlayers = !!game.teams?.bottom?.players;
    const hasFinalScores = !!game.finalScores;
    const hasFinalStriche = !!game.finalStriche;
    
    console.log(`   ✓ game.teams: ${hasTeams ? '✅' : '❌'}`);
    console.log(`   ✓ game.teams.top: ${hasTop ? '✅' : '❌'}`);
    console.log(`   ✓ game.teams.bottom: ${hasBottom ? '✅' : '❌'}`);
    console.log(`   ✓ game.teams.top.players: ${hasTopPlayers ? '✅' : '❌'}`);
    console.log(`   ✓ game.teams.bottom.players: ${hasBottomPlayers ? '✅' : '❌'}`);
    console.log(`   ✓ game.finalScores: ${hasFinalScores ? '✅' : '❌'}`);
    console.log(`   ✓ game.finalStriche: ${hasFinalStriche ? '✅' : '❌'}`);
    
    if (hasTopPlayers && game.teams.top.players) {
      console.log(`   👥 Top Players: ${game.teams.top.players.map((p: any) => p.displayName || p.playerId).join(', ')}`);
    }
    if (hasBottomPlayers && game.teams.bottom.players) {
      console.log(`   👥 Bottom Players: ${game.teams.bottom.players.map((p: any) => p.displayName || p.playerId).join(', ')}`);
    }
    
    // Validierung
    if (!hasTeams) {
      issues.push(`Game ${gameId}: game.teams fehlt!`);
      invalidGames++;
    } else if (!hasTop || !hasBottom) {
      issues.push(`Game ${gameId}: game.teams.top oder game.teams.bottom fehlt!`);
      invalidGames++;
    } else if (!hasTopPlayers || !hasBottomPlayers) {
      issues.push(`Game ${gameId}: game.teams.top.players oder game.teams.bottom.players fehlt!`);
      invalidGames++;
    } else {
      validGames++;
    }
    
    console.log('');
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Validierung: ${validGames} gültig, ${invalidGames} ungültig`);
  
  if (issues.length > 0) {
    console.log('\n⚠️ GEFUNDENE PROBLEME:');
    issues.forEach(issue => console.log(`   - ${issue}`));
  } else {
    console.log('\n✅ Alle Games haben gültige Datenstrukturen!');
  }
  
  return { validGames, invalidGames, issues };
}

/**
 * 🔍 PHASE 3: Prüfe playerRankings Collection
 */
async function inspectPlayerRankings(tournamentId: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 PHASE 3: PlayerRankings Inspektion');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const rankingsRef = db.collection('tournaments').doc(tournamentId).collection('playerRankings');
  const rankingsSnap = await rankingsRef.get();
  
  console.log(`📊 PlayerRankings Anzahl: ${rankingsSnap.size}`);
  
  if (rankingsSnap.size === 0) {
    console.log('❌ KEINE playerRankings gefunden - das ist das Problem!');
  } else {
    console.log('✅ PlayerRankings gefunden:');
    rankingsSnap.docs.forEach(doc => {
      const ranking = doc.data();
      console.log(`   - ${ranking.playerId}: Rang ${ranking.rank}, Score ${ranking.score}`);
    });
  }
  
  return rankingsSnap.size;
}

/**
 * 🔍 PHASE 4: Prüfe jassGameSummary
 */
async function inspectJassGameSummary(tournamentId: string, groupId: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 PHASE 4: jassGameSummary Inspektion');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const summariesRef = db.collection(`groups/${groupId}/jassGameSummaries`);
  const summaryQuery = summariesRef.where('tournamentId', '==', tournamentId);
  const summarySnap = await summaryQuery.get();
  
  console.log(`📊 jassGameSummary Anzahl: ${summarySnap.size}`);
  
  if (summarySnap.size === 0) {
    console.log('❌ KEIN jassGameSummary gefunden!');
    console.log('   → Das bedeutet: finalizeTournament crasht BEVOR es das Summary schreibt');
  } else {
    console.log('✅ jassGameSummary gefunden:');
    const summary = summarySnap.docs[0].data();
    console.log(`   - Status: ${summary.status}`);
    console.log(`   - playerFinalRatings: ${summary.playerFinalRatings ? '✅ vorhanden' : '❌ fehlt'}`);
    console.log(`   - teams: ${summary.teams ? '✅ vorhanden' : '❌ fehlt'}`);
    console.log(`   - finalStriche: ${summary.finalStriche ? '✅ vorhanden' : '❌ fehlt'}`);
    console.log(`   - eventCounts: ${summary.eventCounts ? '✅ vorhanden' : '❌ fehlt'}`);
  }
  
  return summarySnap.size;
}

/**
 * 🚀 PHASE 5: Turnier nochmal finalisieren (mit Try-Catch)
 */
async function refinalizeTournament(tournamentId: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 PHASE 5: Turnier Re-Finalisierung');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('⏳ Rufe finalizeTournamentInternal auf...');
    
    // Dynamischer Import NACH Admin-Initialisierung
    const { finalizeTournamentInternal } = await import('../src/finalizeTournament');
    const result = await finalizeTournamentInternal(tournamentId);
    
    if (result.success) {
      console.log('✅ ERFOLG:', result.message);
    } else {
      console.log('⚠️ WARNUNG:', result.message);
    }
    
    return result;
  } catch (error: any) {
    console.error('❌ FEHLER beim Finalisieren:', error.message);
    console.error('   Stack:', error.stack);
    
    return { success: false, message: error.message };
  }
}

/**
 * 🔍 PHASE 6: Post-Finalisierung Inspektion
 */
async function inspectAfterFinalization(tournamentId: string, groupId: string) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 PHASE 6: Post-Finalisierung Inspektion');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const tournamentRef = db.collection('tournaments').doc(tournamentId);
  const tournamentSnap = await tournamentRef.get();
  const tournamentData = tournamentSnap.data() as any;
  
  console.log('📊 Turnier Status:');
  console.log(`   - status: ${tournamentData.status}`);
  console.log(`   - lastError: ${tournamentData.lastError || 'none'}`);
  console.log(`   - totalRankedEntities: ${tournamentData.totalRankedEntities || 0}`);
  console.log(`   - rankedPlayerUids: ${tournamentData.rankedPlayerUids?.length || 0}`);
  
  await inspectPlayerRankings(tournamentId);
  await inspectJassGameSummary(tournamentId, groupId);
}

/**
 * 🎯 MAIN
 */
async function main() {
  const tournamentId = process.argv[2];
  
  if (!tournamentId) {
    console.error('❌ Usage: npm run tsx scripts/debugFinalizeTournament.ts <tournamentId>');
    process.exit(1);
  }
  
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 DEBUG: Finalize Tournament Analyzer                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\nAnalysiere Turnier: ${tournamentId}`);
  
  try {
    // Phase 1: Turnier-Daten
    const tournamentData = await inspectTournamentData(tournamentId);
    if (!tournamentData) {
      console.error('\n❌ Turnier nicht gefunden - Abbruch');
      process.exit(1);
    }
    
    // Phase 2: Games
    const gamesResult = await inspectTournamentGames(tournamentId);
    
    // Phase 3: PlayerRankings (BEFORE)
    await inspectPlayerRankings(tournamentId);
    
    // Phase 4: jassGameSummary (BEFORE)
    await inspectJassGameSummary(tournamentId, tournamentData.groupId);
    
    // Phase 5: Re-Finalisierung
    const finalizeResult = await refinalizeTournament(tournamentId);
    
    // Phase 6: Post-Finalisierung Inspektion
    await inspectAfterFinalization(tournamentId, tournamentData.groupId);
    
    // Zusammenfassung
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  📊 ZUSAMMENFASSUNG                                       ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
    
    if (finalizeResult.success) {
      console.log('✅ Turnier erfolgreich finalisiert!');
      console.log('✅ playerRankings sollten jetzt vorhanden sein');
      console.log('✅ jassGameSummary sollte alle Felder haben');
    } else {
      console.log('❌ Finalisierung fehlgeschlagen!');
      console.log(`   Grund: ${finalizeResult.message}`);
      
      if (gamesResult.issues.length > 0) {
        console.log('\n💡 MÖGLICHE URSACHEN:');
        gamesResult.issues.forEach(issue => console.log(`   - ${issue}`));
      }
    }
    
    console.log('\n✅ Debug-Analyse abgeschlossen\n');
    
  } catch (error: any) {
    console.error('\n❌ KRITISCHER FEHLER:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

main();

