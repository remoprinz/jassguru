#!/usr/bin/env node

import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { join } from 'path';

// Firebase Admin SDK initialisieren
const serviceAccountPath = join(__dirname, '../../../serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru'
});

const db = admin.firestore();

async function getCollectionCount(collectionPath: string): Promise<number> {
  try {
    const countSnapshot = await db.collection(collectionPath).count().get();
    return countSnapshot.data().count;
  } catch (e) {
    return 0;
  }
}

async function getSampleDoc(collectionPath: string): Promise<any | null> {
  try {
    const snapshot = await db.collection(collectionPath).limit(1).get();
    return snapshot.empty ? null : snapshot.docs[0].data();
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log('🔍 Starte Datenbank-Analyse...\n');
  
  console.log('='.repeat(80));
  console.log('DATENBANK ARCHITEKTUR - VERZEICHNISBAUM');
  console.log('='.repeat(80));
  console.log();

  // 1. PLAYERS Collection
  console.log('\n📦 COLLECTION: PLAYERS');
  console.log('='.repeat(80));
  const playersCount = await getCollectionCount('players');
  console.log(`📄 Hauptebene: ${playersCount} Spieler`);
  
  const samplePlayer = await getSampleDoc('players');
  if (samplePlayer) {
    console.log(`📋 Felder: ${Object.keys(samplePlayer).slice(0, 15).join(', ')}${Object.keys(samplePlayer).length > 15 ? '...' : ''}`);
  }

  // Player Subcollections
  console.log('\n📁 Subcollections von players:');
  if (playersCount > 0) {
    const sampleDoc = await db.collection('players').limit(1).get();
    const samplePlayerId = sampleDoc.docs[0].id;
    
    const subcollections = [
      'ratingHistory',
      'currentScores', 
      'scoresHistory',
      'currentStatistics',
      'statisticsHistory',
      'currentSessionArchive',
      'sessionArchiveHistory',
      'currentChartData',
      'chartDataHistory'
    ];
    
    for (const subcoll of subcollections) {
      const count = await getCollectionCount(`players/${samplePlayerId}/${subcoll}`);
      if (count > 0) {
        console.log(`  📄 ${subcoll}: ${count} Dokumente`);
        const sample = await getSampleDoc(`players/${samplePlayerId}/${subcoll}`);
        if (sample) {
          console.log(`     Felder: ${Object.keys(sample).slice(0, 5).join(', ')}${Object.keys(sample).length > 5 ? '...' : ''}`);
        }
      }
    }
  }

  // 2. USERS Collection
  console.log('\n\n📦 COLLECTION: USERS');
  console.log('='.repeat(80));
  const usersCount = await getCollectionCount('users');
  console.log(`📄 Hauptebene: ${usersCount} Benutzer`);
  
  const sampleUser = await getSampleDoc('users');
  if (sampleUser) {
    console.log(`📋 Felder: ${Object.keys(sampleUser).slice(0, 10).join(', ')}${Object.keys(sampleUser).length > 10 ? '...' : ''}`);
  }

  // 3. GROUPS Collection
  console.log('\n\n📦 COLLECTION: GROUPS');
  console.log('='.repeat(80));
  const groupsCount = await getCollectionCount('groups');
  console.log(`📄 Hauptebene: ${groupsCount} Gruppen`);
  
  const sampleGroup = await getSampleDoc('groups');
  if (sampleGroup) {
    console.log(`📋 Felder: ${Object.keys(sampleGroup).slice(0, 15).join(', ')}${Object.keys(sampleGroup).length > 15 ? '...' : ''}`);
  }

  // Group Subcollections
  console.log('\n📁 Subcollections von groups:');
  if (groupsCount > 0) {
    const sampleDoc = await db.collection('groups').limit(1).get();
    const sampleGroupId = sampleDoc.docs[0].id;
    
    const subcollections = [
      'sessions',
      'activeGames',
      'jassGameSummaries',
      'members',
      'tournaments',
      'stats',
      'invites',
      'playerRatings',
      'aggregated'
    ];
    
    for (const subcoll of subcollections) {
      const count = await getCollectionCount(`groups/${sampleGroupId}/${subcoll}`);
      if (count > 0) {
        console.log(`  📄 ${subcoll}: ${count} Dokumente`);
        const sample = await getSampleDoc(`groups/${sampleGroupId}/${subcoll}`);
        if (sample) {
          const fieldKeys = Object.keys(sample).slice(0, 5);
          console.log(`     Felder: ${fieldKeys.join(', ')}${Object.keys(sample).length > 5 ? '...' : ''}`);
        }
      }
    }

    // Analysiere jassGameSummaries/completedGames
    console.log('\n  📁 jassGameSummaries/completedGames:');
    const summariesCount = await getCollectionCount(`groups/${sampleGroupId}/jassGameSummaries`);
    if (summariesCount > 0) {
      const summariesSnapshot = await db.collection(`groups/${sampleGroupId}/jassGameSummaries`).limit(1).get();
      if (!summariesSnapshot.empty) {
        const summaryId = summariesSnapshot.docs[0].id;
        const completedGamesCount = await getCollectionCount(`groups/${sampleGroupId}/jassGameSummaries/${summaryId}/completedGames`);
        console.log(`     📄 completedGames: ${completedGamesCount} Spiele pro Summary`);
      }
    }

    // Analysiere playerRatings/history
    console.log('\n  📁 playerRatings/history:');
    const ratingsCount = await getCollectionCount(`groups/${sampleGroupId}/playerRatings`);
    if (ratingsCount > 0) {
      const ratingsSnapshot = await db.collection(`groups/${sampleGroupId}/playerRatings`).limit(1).get();
      if (!ratingsSnapshot.empty) {
        const playerId = ratingsSnapshot.docs[0].id;
        const historyCount = await getCollectionCount(`groups/${sampleGroupId}/playerRatings/${playerId}/history`);
        console.log(`     📄 history: ${historyCount} Rating-Einträge pro Spieler`);
      }
    }
  }

  // 4. TOURNAMENTS Collection (Global)
  console.log('\n\n📦 COLLECTION: TOURNAMENTS');
  console.log('='.repeat(80));
  const tournamentsCount = await getCollectionCount('tournaments');
  console.log(`📄 Hauptebene: ${tournamentsCount} Turniere`);
  
  const sampleTournament = await getSampleDoc('tournaments');
  if (sampleTournament) {
    console.log(`📋 Felder: ${Object.keys(sampleTournament).slice(0, 15).join(', ')}${Object.keys(sampleTournament).length > 15 ? '...' : ''}`);
  }

  // Tournament Subcollections (games)
  console.log('\n📁 Subcollections von tournaments:');
  if (tournamentsCount > 0) {
    const sampleDoc = await db.collection('tournaments').limit(1).get();
    const sampleTournamentId = sampleDoc.docs[0].id;
    
    const gamesCount = await getCollectionCount(`tournaments/${sampleTournamentId}/games`);
    console.log(`  📄 games: ${gamesCount} Spiele`);
  }

  // 5. SESSIONS Collection (Global)
  console.log('\n\n📦 COLLECTION: SESSIONS');
  console.log('='.repeat(80));
  const sessionsCount = await getCollectionCount('sessions');
  console.log(`📄 Hauptebene: ${sessionsCount} Sessions`);
  
  const sampleSession = await getSampleDoc('sessions');
  if (sampleSession) {
    console.log(`📋 Felder: ${Object.keys(sampleSession).slice(0, 15).join(', ')}${Object.keys(sampleSession).length > 15 ? '...' : ''}`);
  }

  // Session Subcollections
  console.log('\n📁 Subcollections von sessions:');
  if (sessionsCount > 0) {
    const sampleDoc = await db.collection('sessions').limit(1).get();
    const sampleSessionId = sampleDoc.docs[0].id;
    
    const completedGamesCount = await getCollectionCount(`sessions/${sampleSessionId}/completedGames`);
    console.log(`  📄 completedGames: ${completedGamesCount} Spiele`);
  }

  // 6. ACTIVEGAMES Collection
  console.log('\n\n📦 COLLECTION: ACTIVEGAMES');
  console.log('='.repeat(80));
  const activeGamesCount = await getCollectionCount('activeGames');
  console.log(`📄 Hauptebene: ${activeGamesCount} laufende Spiele`);
  
  const sampleActiveGame = await getSampleDoc('activeGames');
  if (sampleActiveGame) {
    console.log(`📋 Felder: ${Object.keys(sampleActiveGame).slice(0, 15).join(', ')}${Object.keys(sampleActiveGame).length > 15 ? '...' : ''}`);
  }

  // ActiveGame Subcollections
  console.log('\n📁 Subcollections von activeGames:');
  if (activeGamesCount > 0) {
    const sampleDoc = await db.collection('activeGames').limit(1).get();
    const sampleGameId = sampleDoc.docs[0].id;
    
    const roundsCount = await getCollectionCount(`activeGames/${sampleGameId}/rounds`);
    console.log(`  📄 rounds: ${roundsCount} Runden`);
  }

  // 7. PLAYERCOMPUTEDSTATS Collection
  console.log('\n\n📦 COLLECTION: PLAYERCOMPUTEDSTATS');
  console.log('='.repeat(80));
  const playerStatsCount = await getCollectionCount('playerComputedStats');
  console.log(`📄 Hauptebene: ${playerStatsCount} Statistiken`);
  
  const sampleStats = await getSampleDoc('playerComputedStats');
  if (sampleStats) {
    console.log(`📋 Felder: ${Object.keys(sampleStats).slice(0, 15).join(', ')}${Object.keys(sampleStats).length > 15 ? '...' : ''}`);
  }

  // 8. PLAYERRATINGS Collection (Global)
  console.log('\n\n📦 COLLECTION: PLAYERRATINGS');
  console.log('='.repeat(80));
  const playerRatingsCount = await getCollectionCount('playerRatings');
  console.log(`📄 Hauptebene: ${playerRatingsCount} Rating-Dokumente`);
  
  const sampleRating = await getSampleDoc('playerRatings');
  if (sampleRating) {
    console.log(`📋 Felder: ${Object.keys(sampleRating).slice(0, 10).join(', ')}${Object.keys(sampleRating).length > 10 ? '...' : ''}`);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 ZUSAMMENFASSUNG');
  console.log('='.repeat(80));
  console.log(`\n📦 Haupt-Collections:`);
  console.log(`  • players: ${playersCount}`);
  console.log(`  • users: ${usersCount}`);
  console.log(`  • groups: ${groupsCount}`);
  console.log(`  • tournaments: ${tournamentsCount}`);
  console.log(`  • sessions: ${sessionsCount}`);
  console.log(`  • activeGames: ${activeGamesCount}`);
  console.log(`  • playerComputedStats: ${playerStatsCount}`);
  console.log(`  • playerRatings: ${playerRatingsCount}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Analyse abgeschlossen');
  console.log('='.repeat(80));
  
  process.exit(0);
}

main().catch(console.error);

