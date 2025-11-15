import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebaseInit';
import { sortAndRankPlayers, type RankingMode } from '@/utils/tournamentSorting';

export interface PasseRankingSnapshot {
  afterPasseLabel: string;       // "1A", "2B"
  afterPasseNumber: number;       // 1, 2, 3
  tournamentRound: number;        // 1, 2
  timestamp: Date;
  
  rankings: PlayerRanking[];
}

export interface PlayerRanking {
  playerId: string;
  playerName: string;
  rank: number;
  
  // Kumulative Werte bis zu dieser Passe
  totalStriche: number;
  totalPoints: number;
  stricheDifference?: number; // ✅ NEU: Kumulative Strichdifferenz
  pointsDifference?: number; // ✅ NEU: Kumulative Punktedifferenz
  passesPlayed: number;
}

/**
 * Lädt alle Games und berechnet Ranking-Verlauf
 * 
 * @param tournamentId ID des Turniers
 * @param rankingMode Zählart: 'total_points' (default) oder 'striche'
 * @returns Array von Ranking-Snapshots (chronologisch)
 */
export async function fetchTournamentRankingHistory(
  tournamentId: string,
  rankingMode: RankingMode = 'total_points'
): Promise<PasseRankingSnapshot[]> {
  
  try {
    // 1. Lade alle Games, sortiert nach passeNumber
    const gamesRef = collection(db, `tournaments/${tournamentId}/games`);
    const gamesQuery = query(gamesRef, orderBy('passeNumber', 'asc'));
    const gamesSnap = await getDocs(gamesQuery);
    
    if (gamesSnap.empty) return [];
    
    // 2. Akkumuliere Spieler-Stats über alle Passen
    const playerStatsMap = new Map<string, {
      name: string;
      totalStriche: number;
      totalPoints: number;
      stricheScored: number;    // ✅ NEU: Gesamt-Striche gemacht
      stricheReceived: number;  // ✅ NEU: Gesamt-Striche erhalten
      stricheDifference: number; // ✅ NEU: Kumulative Strichdifferenz
      pointsScored: number;     // ✅ NEU: Gesamt-Punkte gemacht
      pointsReceived: number;   // ✅ NEU: Gesamt-Punkte erhalten
      pointsDifference: number; // ✅ NEU: Kumulative Punktedifferenz
      passesPlayed: number;
    }>();
    
    const snapshots: PasseRankingSnapshot[] = [];
    
    // ✅ KORRIGIERT: Gruppiere Games nach Passe-Nummer
    const gamesByPasseNumber = new Map<number, Array<typeof gamesSnap.docs[0]>>();
    gamesSnap.docs.forEach(gameDoc => {
      const game = gameDoc.data();
      const passeNumber = game.passeNumber || 0;
      if (!gamesByPasseNumber.has(passeNumber)) {
        gamesByPasseNumber.set(passeNumber, []);
      }
      gamesByPasseNumber.get(passeNumber)!.push(gameDoc);
    });
    
    // 3. Iteriere durch alle Passen (nicht einzelne Games!)
    const sortedPasseNumbers = Array.from(gamesByPasseNumber.keys()).sort((a, b) => a - b);
    
    for (const passeNumber of sortedPasseNumbers) {
      const gamesInPasse = gamesByPasseNumber.get(passeNumber)!;
      
      // Update player stats für ALLE Games dieser Passe
      gamesInPasse.forEach(gameDoc => {
        const game = gameDoc.data();
        
      if (game.playerDetails) {
        for (const player of game.playerDetails) {
          const playerId = player.playerId;
          
          if (!playerStatsMap.has(playerId)) {
            playerStatsMap.set(playerId, {
              name: player.playerName,
              totalStriche: 0,
              totalPoints: 0,
              stricheScored: 0,
              stricheReceived: 0,
              stricheDifference: 0,
              pointsScored: 0,
              pointsReceived: 0,
              pointsDifference: 0,
              passesPlayed: 0,
            });
          }
          
          const stats = playerStatsMap.get(playerId)!;
          
          // ✅ KORRIGIERT: Verwende Team-Striche (wie TournamentRankingList)
          let stricheSumInPasse = 0;
          if (player.team && game.teamStrichePasse && game.teamStrichePasse[player.team]) {
            const teamStriche = game.teamStrichePasse[player.team];
            // Summiere alle Team-Striche auf
            stricheSumInPasse = (Object.values(teamStriche) as number[]).reduce((sum, val) => sum + (val || 0), 0);
          }
          stats.totalStriche += stricheSumInPasse;
            stats.stricheScored += stricheSumInPasse;
            
            // ✅ NEU: Berechne Striche erhalten (Gegner-Team)
            const opponentTeamForStriche = player.team === 'top' ? 'bottom' : 'top';
            let stricheReceivedInPasse = 0;
            if (game.teamStrichePasse && game.teamStrichePasse[opponentTeamForStriche]) {
              const opponentStriche = game.teamStrichePasse[opponentTeamForStriche];
              stricheReceivedInPasse = (Object.values(opponentStriche) as number[]).reduce((sum, val) => sum + (val || 0), 0);
            }
            stats.stricheReceived += stricheReceivedInPasse;
            
          // ✅ NEU: Berechne kumulative Strichdifferenz
          stats.stricheDifference = stats.stricheScored - stats.stricheReceived;
          
          // ✅ KORRIGIERT: Verwende Team-Punkte (wie TournamentRankingList)
          const teamScore = player.team && game.teamScoresPasse 
            ? (game.teamScoresPasse[player.team] || 0) 
            : (player.scoreInPasse || 0);
          stats.totalPoints += teamScore;
          stats.pointsScored += teamScore;
          
          // ✅ NEU: Berechne Punkte erhalten (Gegner-Team)
          const opponentTeamForPoints = player.team === 'top' ? 'bottom' : 'top';
          const opponentScore = game.teamScoresPasse && game.teamScoresPasse[opponentTeamForPoints]
            ? (game.teamScoresPasse[opponentTeamForPoints] || 0)
            : 0;
          stats.pointsReceived += opponentScore;
          
          // ✅ NEU: Berechne kumulative Punktedifferenz
          stats.pointsDifference = stats.pointsScored - stats.pointsReceived;
        }
      }
      });
      
      // ✅ WICHTIG: Erhöhe passesPlayed nur EINMAL pro Passe (nicht pro Game!)
      // Zähle nur Spieler, die in dieser Passe gespielt haben
      const playersInThisPasse = new Set<string>();
      gamesInPasse.forEach(gameDoc => {
        const game = gameDoc.data();
        if (game.playerDetails) {
          game.playerDetails.forEach((player: any) => {
            if (player.playerId) {
              playersInThisPasse.add(player.playerId);
            }
          });
        }
      });
      playersInThisPasse.forEach(playerId => {
        const stats = playerStatsMap.get(playerId);
        if (stats) {
          stats.passesPlayed += 1;
        }
      });
      
      // 4. Berechne Ranking nach dieser Passe (NACH ALLEN Games dieser Passe!)
      const playersForRanking = [];
      
      for (const [playerId, stats] of playerStatsMap.entries()) {
        playersForRanking.push({
          playerId,
          playerName: stats.name,
          totalStriche: stats.totalStriche,
          totalPoints: stats.totalPoints,
          stricheDifference: stats.stricheDifference, // ✅ NEU: Für striche_difference Modus
          pointsDifference: stats.pointsDifference, // ✅ NEU: Für points_difference Modus
          passesPlayed: stats.passesPlayed,
        });
      }
      
      // ✅ NEU: Nutze zentrale Sortier- und Rank-Utility
      // Sortiert nach rankingMode mit korrektem Tie-Breaker (Punkte ↔ Striche ↔ Strichdifferenz)
      const rankedPlayers = sortAndRankPlayers(playersForRanking, rankingMode);
      
      // Map zu PlayerRanking[] (stellt sicher, dass alle Felder vorhanden sind)
      const rankings: PlayerRanking[] = rankedPlayers.map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        rank: p.rank,
        totalStriche: p.totalStriche,
        totalPoints: p.totalPoints,
        stricheDifference: p.stricheDifference, // ✅ NEU: Für Chart
        pointsDifference: p.pointsDifference, // ✅ NEU: Für Chart
        passesPlayed: p.passesPlayed || 0,
      }));
      
      // 5. Erstelle Snapshot für diese Passe (verwende das neueste Game für Timestamp)
      const latestGameInPasse = gamesInPasse.reduce((latest, current) => {
        const currentTime = current.data().completedAt?.toDate()?.getTime() || 0;
        const latestTime = latest.data().completedAt?.toDate()?.getTime() || 0;
        return currentTime > latestTime ? current : latest;
      });
      const latestGameData = latestGameInPasse.data();
      
      snapshots.push({
        afterPasseLabel: `${passeNumber}`, // ✅ Vereinfacht: Nur Passe-Nummer
        afterPasseNumber: passeNumber,
        tournamentRound: latestGameData.tournamentRound || 1,
        timestamp: latestGameData.completedAt?.toDate() || new Date(),
        rankings,
      });
    }
    
    return snapshots;
  } catch (error) {
    console.error('[fetchTournamentRankingHistory] Error:', error);
    return [];
  }
}

