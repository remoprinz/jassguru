#!/usr/bin/env node

import * as admin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';

// Firebase Admin SDK initialisieren
const serviceAccount = require('../../../serviceAccountKey.json');
initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'jassguru-8c8d8'
});

const db = admin.firestore();

async function debugTournamentGames(tournamentId: string) {
  console.log(`🔍 Debug Turnier Games: ${tournamentId}`);
  
  try {
    // 1. Turnier-Dokument laden
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentDoc = await tournamentRef.get();
    
    if (!tournamentDoc.exists) {
      throw new Error(`Turnier ${tournamentId} nicht gefunden`);
    }
    
    const tournamentData = tournamentDoc.data();
    console.log(`📊 Turnier gefunden: ${tournamentData?.name}`);
    console.log(`👥 participantPlayerIds:`, tournamentData?.participantPlayerIds);
    console.log(`👥 participantUids:`, tournamentData?.participantUids);
    
    // 2. Games laden
    const gamesRef = tournamentRef.collection("games");
    const gamesSnap = await gamesRef.get();
    
    console.log(`🎮 Gefundene Games: ${gamesSnap.size}`);
    
    const allPlayerIds = new Set<string>();
    
    gamesSnap.forEach((doc) => {
      const gameData = doc.data();
      const gameIndex = gamesSnap.docs.indexOf(doc) + 1;
      console.log(`\n🎮 Game ${gameIndex} (${doc.id}):`);
      console.log(`   completedAt:`, gameData.completedAt ? '✅' : '❌');
      console.log(`   participantPlayerIds:`, gameData.participantPlayerIds);
      console.log(`   participantUids:`, gameData.participantUids);
      
      if (gameData.teams) {
        console.log(`   teams.top.players:`, gameData.teams.top?.players);
        console.log(`   teams.bottom.players:`, gameData.teams.bottom?.players);
        
        // Sammle Player IDs
        if (gameData.teams.top?.players) {
          gameData.teams.top.players.forEach((player: any) => {
            allPlayerIds.add(player.playerId);
            console.log(`   ✅ Top Player: ${player.playerId} (${player.displayName})`);
          });
        }
        if (gameData.teams.bottom?.players) {
          gameData.teams.bottom.players.forEach((player: any) => {
            allPlayerIds.add(player.playerId);
            console.log(`   ✅ Bottom Player: ${player.playerId} (${player.displayName})`);
          });
        }
      }
    });
    
    console.log(`\n🎯 Alle Player IDs aus Games:`, Array.from(allPlayerIds));
    console.log(`📊 Total Player IDs: ${allPlayerIds.size}`);
  } catch (error) {
    console.error(`❌ Fehler beim Debug:`, error);
    throw error;
  }
}

// Script ausführen
const tournamentId = process.argv[2] || 'GCV6IQaRNTakrzOYWATa';

debugTournamentGames(tournamentId)
  .then(() => {
    console.log('🎉 Debug erfolgreich abgeschlossen!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Debug fehlgeschlagen:', error);
    process.exit(1);
  });
