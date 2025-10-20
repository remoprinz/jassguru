#!/usr/bin/env ts-node

/**
 * Script zur akribischen Berechnung der Turnier-Rankings
 * 
 * Dieses Script:
 * 1. Lädt alle Games des Turniers "Krakau 2025" 
 * 2. Analysiert akribisch jeden Game und berechnet korrekte Statistiken
 * 3. Erstellt korrekte PlayerRankings mit allen relevanten Daten
 * 4. Speichert diese in die playerRankings Collection
 * 
 * Verwendung:
 * npx ts-node scripts/calculateTournamentRankings.ts
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

// Service Account Key laden
const serviceAccountPath = join(process.cwd(), 'serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

// Firebase Admin initialisieren
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Types (vereinfacht für das Script)
interface TournamentGame {
  passeId: string;
  tournamentInstanceId: string;
  passeNumber: number;
  tournamentRound: number;
  passeInRound: string;
  passeLabel: string;
  tournamentMode: 'spontaneous' | 'planned';
  startedAt?: any;
  completedAt: any;
  durationMillis: number;
  startingPlayer: number;
  participantUidsForPasse: string[];
  participantPlayerIds: string[];
  playerDetails: Array<{
    uid: string;
    playerId: string;
    playerName: string;
    score: number;
    striche: number;
    weisPoints?: number;
  }>;
  teamScoresPasse: {
    top: number;
    bottom: number;
  };
  teamStrichePasse: {
    top: {
      sieg: number;
      berg: number;
      matsch: number;
      kontermatsch: number;
      schneider: number;
    };
    bottom: {
      sieg: number;
      berg: number;
      matsch: number;
      kontermatsch: number;
      schneider: number;
    };
  };
  eventCounts?: {
    bottom: {
      sieg: number;
      berg: number;
      matsch: number;
      kontermatsch: number;
      schneider: number;
    };
    top: {
      sieg: number;
      berg: number;
      matsch: number;
      kontermatsch: number;
      schneider: number;
    };
  };
  activeScoreSettings: any;
  activeStrokeSettings: any;
}

interface PlayerStats {
  // Scores
  pointsScored: number;
  pointsReceived: number;
  stricheScored: number;
  stricheReceived: number;
  score: number; // Legacy für Ranking
  
  // Game Stats
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  
  // Event Counts (nur sinnvolle!)
  eventCounts: {
    matschMade: number;
    matschReceived: number;
    schneiderMade: number;
    schneiderReceived: number;
    kontermatschMade: number;
    kontermatschReceived: number;
  };
  
  // Weis
  totalWeisPoints: number;
}

interface TournamentPlayerRankingData {
  // Identifikation
  playerId: string;
  tournamentId: string;
  tournamentName: string;
  tournamentFinalizedAt: any;
  createdAt: any;
  
  // Ranking
  rank: number;
  totalRankedEntities: number;
  rankingSystemUsed: string;
  
  // Scores mit Differenzen
  pointsScored?: number;
  pointsReceived?: number;
  pointsDifference?: number;
  totalPoints?: number; // Legacy
  
  stricheScored?: number;
  stricheReceived?: number;
  stricheDifference?: number;
  totalStriche?: number; // Legacy
  
  score?: number; // Legacy
  
  // Spiel-Statistiken
  gamesPlayed?: number;
  gamesWon?: number;
  gamesLost?: number;
  gamesDraw?: number;
  rawWins?: number; // Legacy
  
  // Event-Zählungen (nur sinnvolle!)
  eventCounts?: {
    matschMade: number;
    matschReceived: number;
    schneiderMade: number;
    schneiderReceived: number;
    kontermatschMade: number;
    kontermatschReceived: number;
  };

  // Weis-Statistiken
  totalWeisPoints?: number;
  averageWeisPerGame?: number;
}

/**
 * Konvertiert Firebase UID zu Player Document ID
 */
async function getPlayerIdForUser(uid: string): Promise<string | null> {
  try {
    const playersRef = db.collection('players');
    const q = playersRef.where('userId', '==', uid).limit(1);
    const snapshot = await q.get();
    
    if (!snapshot.empty) {
      return snapshot.docs[0].id;
    }
    
    console.warn(`[calculateTournamentRankings] No player document found for UID: ${uid}`);
    return null;
  } catch (error) {
    console.error(`[calculateTournamentRankings] Error fetching playerId for UID ${uid}:`, error);
    return null;
  }
}

/**
 * Berechnet Striche für einen Spieler in einem Game
 */
function calculateStricheForGame(game: TournamentGame, playerId: string): number {
  // Finde den Spieler in playerDetails
  const playerDetail = game.playerDetails.find(pd => pd.playerId === playerId);
  if (playerDetail) {
    return playerDetail.striche || 0;
  }
  
  // Fallback: Berechne aus teamStrichePasse
  // Finde heraus, in welchem Team der Spieler war
  const topPlayerIds = game.participantPlayerIds.slice(0, 2);
  const bottomPlayerIds = game.participantPlayerIds.slice(2, 4);
  
  if (topPlayerIds.includes(playerId)) {
    const topStriche = game.teamStrichePasse.top;
    return (topStriche.sieg || 0) + (topStriche.berg || 0) + (topStriche.matsch || 0) + 
           (topStriche.kontermatsch || 0) + (topStriche.schneider || 0);
  } else if (bottomPlayerIds.includes(playerId)) {
    const bottomStriche = game.teamStrichePasse.bottom;
    return (bottomStriche.sieg || 0) + (bottomStriche.berg || 0) + (bottomStriche.matsch || 0) + 
           (bottomStriche.kontermatsch || 0) + (bottomStriche.schneider || 0);
  }
  
  return 0;
}

/**
 * Hauptfunktion zur Berechnung der Turnier-Rankings
 */
async function calculateTournamentRankings() {
  const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p'; // Krakau 2025
  
  console.log(`🏆 [calculateTournamentRankings] Starting calculation for tournament: ${tournamentId}`);
  
  try {
    // 1. Lade Turnier-Details
    const tournamentDoc = await db.collection('tournaments').doc(tournamentId).get();
    if (!tournamentDoc.exists) {
      throw new Error(`Tournament ${tournamentId} not found`);
    }
    
    const tournamentData = tournamentDoc.data();
    const tournamentName = tournamentData?.name || 'Unknown Tournament';
    const rankingMode = tournamentData?.settings?.rankingMode || 'total_points';
    
    console.log(`📋 Tournament: ${tournamentName}`);
    console.log(`🎯 Ranking Mode: ${rankingMode}`);
    
    // 2. Lade alle Games aus jassGameSummaries
    const groupId = 'Tz0wgIHMTlhvTtFastiJ'; // Gruppe für Krakau 2025
    const sessionId = '6eNr8fnsTO06jgCqjelt'; // Session ID für Krakau 2025
    
    console.log(`🔍 Loading games from: groups/${groupId}/jassGameSummaries/${sessionId}`);
    
    // Lade das jassGameSummaries-Dokument direkt
    const sessionDoc = await db.collection('groups').doc(groupId)
      .collection('jassGameSummaries').doc(sessionId).get();
    
    if (!sessionDoc.exists) {
      throw new Error(`Session document ${sessionId} not found`);
    }
    
    const sessionData = sessionDoc.data();
    const games = sessionData?.gameResults || [];
    
    console.log(`📊 Session data keys:`, Object.keys(sessionData || {}));
    console.log(`🎮 Found ${games.length} games in gameResults`);
    
    console.log(`🎮 Loaded ${games.length} games`);
    
    // 3. ✅ KORREKT: Verwende die korrekten Player Document IDs für die playerRankings
    // Diese müssen mit den Firebase UIDs aus den participants übereinstimmen!
    const correctPlayerMappings = {
      'WQSNHuoqtBen2D3E1bu4OLgx4aI3': 'F1uwdthL6zu7F0cYf1jbe', // Frank
      'AaTUBO0SbWVfStdHmD7zi3qAMww2': 'b16c1120111b7d9e7d733837', // Remo  
      'i4ij3QCqKSbjPbx2hetwWlaQhlw2': 'TPBwj8bP9W59n5LoGWP5', // Schmuuuudii
      'fJ6UUEcdzXXwY4G8Oh49dQw3yXE2': 'PLaDRlPBo91yu5Ij8MOT2' // Studi
    };
    
    console.log(`👥 Correct Player Mappings (Firebase UID → Player Document ID):`);
    Object.entries(correctPlayerMappings).forEach(([uid, playerId]) => {
      console.log(`   ${uid} → ${playerId}`);
    });
    
    // 4. Initialisiere PlayerStats für alle Teilnehmer mit den KORREKTEN Player Document IDs
    const playerScores = new Map<string, PlayerStats>();
    
    // Verwende die korrekten Player Document IDs (die mit den Firebase UIDs übereinstimmen)
    const correctPlayerIds = Object.values(correctPlayerMappings);
    for (const playerId of correctPlayerIds) {
      playerScores.set(playerId, {
        pointsScored: 0,
        pointsReceived: 0,
        stricheScored: 0,
        stricheReceived: 0,
        score: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        eventCounts: {
          matschMade: 0,
          matschReceived: 0,
          schneiderMade: 0,
          schneiderReceived: 0,
          kontermatschMade: 0,
          kontermatschReceived: 0
        },
        totalWeisPoints: 0
      });
    }
    
    console.log(`👥 Initialized stats for ${playerScores.size} players`);
    
    // 5. Iteriere akribisch durch alle Games
    for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
      const game = games[gameIndex];
      console.log(`\n🎯 Processing Game ${gameIndex + 1}/${games.length}: Game ${game.gameNumber}`);
      
      // Bestimme Teams aus jassGameSummaries-Struktur
      const topTeam = game.teams?.top;
      const bottomTeam = game.teams?.bottom;
      
      if (!topTeam || !bottomTeam) {
        console.warn(`   ⚠️ Skipping game ${game.gameNumber} - missing team data`);
        continue;
      }
      
      const topPlayerIds = topTeam.players?.map(p => p.playerId) || [];
      const bottomPlayerIds = bottomTeam.players?.map(p => p.playerId) || [];
      
      console.log(`   Top Team: ${topTeam.players?.map(p => p.displayName).join(', ')} (${topPlayerIds.join(', ')})`);
      console.log(`   Bottom Team: ${bottomTeam.players?.map(p => p.displayName).join(', ')} (${bottomPlayerIds.join(', ')})`);
      
      // Berechne Team-Striche aus finalStriche
      const topStriche = game.finalStriche?.top || {};
      const bottomStriche = game.finalStriche?.bottom || {};
      
      const topTeamStriche = (topStriche.sieg || 0) + (topStriche.berg || 0) + (topStriche.matsch || 0) + 
                           (topStriche.kontermatsch || 0) + (topStriche.schneider || 0);
      const bottomTeamStriche = (bottomStriche.sieg || 0) + (bottomStriche.berg || 0) + (bottomStriche.matsch || 0) + 
                               (bottomStriche.kontermatsch || 0) + (bottomStriche.schneider || 0);
      
      console.log(`   Team Striche: Top=${topTeamStriche}, Bottom=${bottomTeamStriche}`);
      
      // Verarbeite jeden Spieler - verwende die korrekten Player Document IDs
      const allPlayerIds = [...topPlayerIds, ...bottomPlayerIds];
      for (const playerId of allPlayerIds) {
        // ✅ KORREKT: Verwende die korrekte Player Document ID basierend auf dem Mapping
        const correctPlayerId = Object.entries(correctPlayerMappings)
          .find(([uid, pid]) => pid === playerId)?.[1] || playerId;
        
        if (!playerScores.has(correctPlayerId)) {
          console.warn(`   ⚠️ Skipping unknown player: PlayerId=${playerId} (corrected: ${correctPlayerId})`);
          continue;
        }
        
        const playerStats = playerScores.get(correctPlayerId)!;
        playerStats.gamesPlayed++;
        
        // Bestimme Team des Spielers
        const playerTeam = topPlayerIds.includes(playerId) ? 'top' : 'bottom';
        const opponentTeam = playerTeam === 'top' ? 'bottom' : 'top';
        
        console.log(`   👤 Processing player ${playerId} (corrected: ${correctPlayerId}) in team ${playerTeam}`);
        
        // ===== 1. PUNKTE SAMMELN =====
        const playerPoints = playerTeam === 'top' ? game.topScore : game.bottomScore;
        const opponentPoints = playerTeam === 'top' ? game.bottomScore : game.topScore;
        playerStats.pointsScored += playerPoints;
        playerStats.pointsReceived += opponentPoints;
        
        console.log(`     Points: Scored=${playerPoints}, Received=${opponentPoints}`);
        
        // ===== 2. STRICHE SAMMELN =====
        const playerStriche = playerTeam === 'top' ? topTeamStriche : bottomTeamStriche;
        const opponentStriche = playerTeam === 'top' ? bottomTeamStriche : topTeamStriche;
        
        playerStats.stricheScored += playerStriche;
        playerStats.stricheReceived += opponentStriche;
        
        console.log(`     Striche: Scored=${playerStriche}, Received=${opponentStriche}`);
        
        // ===== 3. WINS/LOSSES/DRAWS =====
        if (playerPoints > opponentPoints) {
          playerStats.wins++;
          console.log(`     Result: WIN`);
        } else if (playerPoints < opponentPoints) {
          playerStats.losses++;
          console.log(`     Result: LOSS`);
        } else {
          playerStats.draws++;
          console.log(`     Result: DRAW`);
        }
        
        // ===== 4. EVENT COUNTS =====
        if (game.eventCounts && game.eventCounts[playerTeam]) {
          const teamEvents = game.eventCounts[playerTeam];
          const opponentEvents = game.eventCounts[opponentTeam];
          
          playerStats.eventCounts.matschMade += teamEvents.matsch || 0;
          playerStats.eventCounts.schneiderMade += teamEvents.schneider || 0;
          playerStats.eventCounts.kontermatschMade += teamEvents.kontermatsch || 0;
          
          playerStats.eventCounts.matschReceived += opponentEvents.matsch || 0;
          playerStats.eventCounts.schneiderReceived += opponentEvents.schneider || 0;
          playerStats.eventCounts.kontermatschReceived += opponentEvents.kontermatsch || 0;
          
          console.log(`     Events: Matsch=${teamEvents.matsch || 0}, Schneider=${teamEvents.schneider || 0}, Kontermatsch=${teamEvents.kontermatsch || 0}`);
        }
        
        // ===== 5. WEIS POINTS =====
        // Weis Points sind in jassGameSummaries nicht direkt verfügbar, überspringen
        
        // ===== 6. LEGACY SCORE für Ranking =====
        if (rankingMode === 'striche') {
          playerStats.score += playerStriche;
        } else {
          playerStats.score += playerPoints;
        }
      }
    }
    
    // 6. Erstelle Rankings
    console.log(`\n🏆 Creating rankings...`);
    
    const rankedPlayers = Array.from(playerScores.entries())
      .map(([playerId, stats]) => ({ playerId, ...stats }))
      .sort((a, b) => {
        // ✅ KORREKTE SORTIERUNG basierend auf rankingMode
        if (rankingMode === 'striche') {
          // Bei Striche-Ranking: MEISTE Striche = BESTE (absteigend sortieren!)
          return b.stricheScored - a.stricheScored;
        } else {
          // Bei Punkte-Ranking: MEISTE Punkte = BESTE (absteigend sortieren)
          return b.score - a.score;
        }
      });
    
    console.log(`📊 Final Rankings:`);
    rankedPlayers.forEach((player, index) => {
      console.log(`   ${index + 1}. PlayerId: ${player.playerId}`);
      console.log(`      Score: ${player.score}, Points: ${player.pointsScored}/${player.pointsReceived}, Striche: ${player.stricheScored}/${player.stricheReceived}`);
      console.log(`      Games: ${player.gamesPlayed} (${player.wins}W/${player.losses}L/${player.draws}D)`);
      console.log(`      Weis: ${player.totalWeisPoints}`);
    });
    
    // 7. Speichere PlayerRankings
    console.log(`\n💾 Saving player rankings...`);
    
    const batch = db.batch();
    const playerRankingsRef = db.collection('tournaments').doc(tournamentId).collection('playerRankings');
    
    // Lösche alte Rankings
    const oldRankingsSnapshot = await playerRankingsRef.get();
    oldRankingsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Erstelle neue Rankings
    for (let i = 0; i < rankedPlayers.length; i++) {
      const player = rankedPlayers[i];
      const rank = i + 1;
      
      const rankingData: TournamentPlayerRankingData = {
        // Identifikation
        playerId: player.playerId,
        tournamentId: tournamentId,
        tournamentName: tournamentName,
        tournamentFinalizedAt: new Date(),
        createdAt: new Date(),
        
        // Ranking
        rank: rank,
        totalRankedEntities: rankedPlayers.length,
        rankingSystemUsed: rankingMode,
        
        // Scores mit Differenzen
        pointsScored: player.pointsScored,
        pointsReceived: player.pointsReceived,
        pointsDifference: player.pointsScored - player.pointsReceived,
        totalPoints: player.pointsScored, // Legacy
        
        stricheScored: player.stricheScored,
        stricheReceived: player.stricheReceived,
        stricheDifference: player.stricheScored - player.stricheReceived,
        totalStriche: player.stricheScored, // Legacy
        
        score: player.score, // Legacy: Haupt-Score für Ranking
        
        // Spiel-Statistiken
        gamesPlayed: player.gamesPlayed,
        gamesWon: player.wins,
        gamesLost: player.losses,
        gamesDraw: player.draws,
        rawWins: player.wins, // Legacy
        
        // Event-Zählungen
        eventCounts: player.eventCounts,
        
        // Weis-Statistiken
        totalWeisPoints: player.totalWeisPoints,
        averageWeisPerGame: player.gamesPlayed > 0 ? player.totalWeisPoints / player.gamesPlayed : 0
      };
      
      const docRef = playerRankingsRef.doc(player.playerId);
      batch.set(docRef, rankingData);
      
      console.log(`   ✅ Saved ranking for player ${player.playerId} (Rank ${rank})`);
    }
    
    // Commit Batch
    await batch.commit();
    
    console.log(`\n🎉 Successfully calculated and saved rankings for tournament ${tournamentName}!`);
    console.log(`   Total players: ${rankedPlayers.length}`);
    console.log(`   Total games processed: ${games.length}`);
    
  } catch (error) {
    console.error('❌ Error calculating tournament rankings:', error);
    process.exit(1);
  }
}

// Script ausführen
calculateTournamentRankings()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

export { calculateTournamentRankings };
