#!/usr/bin/env ts-node

import * as admin from 'firebase-admin';
import * as path from 'path';

/**
 * Debug-Script um zu prüfen, was beim Krakau-Turnier passiert
 */
async function debugTournament(groupId: string) {
  try {
    console.log(`🔍 Debug Turnier-Verarbeitung für Gruppe ${groupId}...`);
    
    // Firebase Admin SDK initialisieren
    const serviceAccountPath = path.resolve(__dirname, '../../../serviceAccountKey.json');
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
        projectId: 'jassguru'
      });
      console.log('✅ Firebase Admin SDK initialisiert');
    }

    const db = admin.firestore();
    
    // 1. Hole alle jassGameSummaries mit tournamentId
    const summariesRef = db.collection(`groups/${groupId}/jassGameSummaries`);
    const summariesSnap = await summariesRef.get();
    
    const tournamentSummaries = summariesSnap.docs.filter(doc => doc.data().tournamentId);
    
    console.log(`📊 Gefunden: ${tournamentSummaries.length} Turnier-Summaries`);
    
    for (const doc of tournamentSummaries) {
      const data = doc.data();
      console.log(`\n🏆 TURNIER: ${data.tournamentName || 'Unbekannt'}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Tournament ID: ${data.tournamentId}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Games Played: ${data.gamesPlayed || 0}`);
      console.log(`   Participant Player IDs: ${data.participantPlayerIds?.length || 0}`);
      
      if (data.gameResults && Array.isArray(data.gameResults)) {
        console.log(`   Game Results: ${data.gameResults.length} Spiele`);
        
        data.gameResults.forEach((game: any, index: number) => {
          console.log(`     Spiel ${index + 1}:`);
          console.log(`       Winner Team: ${game.winnerTeam}`);
          console.log(`       Top Players: ${game.teams?.top?.players?.map((p: any) => p.displayName).join(', ') || 'Keine'}`);
          console.log(`       Bottom Players: ${game.teams?.bottom?.players?.map((p: any) => p.displayName).join(', ') || 'Keine'}`);
          console.log(`       Top Striche: ${JSON.stringify(game.finalStriche?.top || {})}`);
          console.log(`       Bottom Striche: ${JSON.stringify(game.finalStriche?.bottom || {})}`);
        });
      } else {
        console.log(`   ⚠️  Keine gameResults gefunden!`);
      }
      
      // 2. Prüfe auch die tournaments Collection
      try {
        const tournamentRef = db.collection('tournaments').doc(data.tournamentId);
        const tournamentSnap = await tournamentRef.get();
        
        if (tournamentSnap.exists) {
          const tournamentData = tournamentSnap.data();
          console.log(`   📁 Tournament Collection:`);
          console.log(`     Name: ${tournamentData?.name || 'Unbekannt'}`);
          console.log(`     Status: ${tournamentData?.status || 'Unbekannt'}`);
          console.log(`     Group ID: ${tournamentData?.groupId || 'Unbekannt'}`);
        } else {
          console.log(`   ❌ Tournament nicht in tournaments Collection gefunden!`);
        }
        
        // 3. Prüfe games Subcollection
        const gamesRef = db.collection(`groups/${groupId}/tournaments/${data.tournamentId}/games`);
        const gamesSnap = await gamesRef.get();
        
        console.log(`   🎮 Games Subcollection: ${gamesSnap.docs.length} Spiele`);
        
        if (gamesSnap.docs.length > 0) {
          gamesSnap.docs.forEach((gameDoc, index) => {
            const gameData = gameDoc.data();
            console.log(`     Spiel ${index + 1}:`);
            console.log(`       Winner Team: ${gameData.winnerTeam}`);
            console.log(`       Top Player UIDs: ${gameData.teams?.top?.playerUids?.join(', ') || 'Keine'}`);
            console.log(`       Bottom Player UIDs: ${gameData.teams?.bottom?.playerUids?.join(', ') || 'Keine'}`);
          });
        }
        
      } catch (error) {
        console.log(`   ❌ Fehler beim Zugriff auf Tournament Collection: ${error}`);
      }
    }
    
  } catch (error) {
    console.error('💥 Fehler:', error);
  }
}

// Argument Parsing
const args = process.argv.slice(2);
let groupId: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--groupId=')) {
    groupId = args[i].split('=')[1];
  }
}

if (!groupId) {
  console.error('Usage: ts-node src/scripts/debugTournament.ts --groupId=<groupId>');
  process.exit(1);
}

debugTournament(groupId).then(() => {
  process.exit(0);
});
