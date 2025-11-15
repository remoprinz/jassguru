"use client";

import React, { useMemo, useEffect, useState } from 'react';
import type { TournamentInstance, TournamentSettings, TournamentGame, PassePlayerDetail } from '@/types/tournament';
import type { StricheRecord } from '@/types/jass';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Image from 'next/image';
import { ParticipantWithProgress } from '@/store/tournamentStore';
import { cn } from '@/lib/utils';
import ProfileImage from '@/components/ui/ProfileImage';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit';
import { sortPlayersByRankingMode, type RankingMode } from '@/utils/tournamentSorting';

interface TournamentRankingListProps {
  instanceId: string;
  settings: TournamentSettings;
  participants: ParticipantWithProgress[];
  games: TournamentGame[];
  onParticipantClick?: (participant: ParticipantWithProgress) => void;
}

// ✅ NEU: Typ für PlayerRanking-Daten aus der Datenbank
interface PlayerRankingData {
  playerId: string;
  rank: number;
  pointsScored?: number;
  pointsReceived?: number;
  pointsDifference?: number;
  stricheScored?: number;
  stricheReceived?: number;
  stricheDifference?: number;
  gamesPlayed?: number;
  gamesWon?: number;
  gamesLost?: number;
  gamesDraw?: number;
  eventCounts?: {
    matschMade: number;
    matschReceived: number;
    schneiderMade: number;
    schneiderReceived: number;
    kontermatschMade: number;
    kontermatschReceived: number;
  };
  totalWeisPoints?: number;
  averageWeisPerGame?: number;
}

// NEU: Typ für die aggregierten Spielergebnisse
interface PlayerTotals {
  score: number;
  striche: number; // Gesamtzahl der Striche
  stricheDifference?: number; // ✅ NEU: Strichdifferenz (kumulativ)
  pointsDifference?: number; // ✅ NEU: Punktedifferenz (kumulativ)
  weis: number;
  // Optional: Detaillierte Striche, falls benötigt
  // detailedStriche: StricheRecord;
}

// NEU: Typ für den Eintrag in der Rangliste
interface RankingEntry extends ParticipantWithProgress {
  rank: number;
  totals: PlayerTotals;
}

const TournamentRankingList: React.FC<TournamentRankingListProps> = ({
  instanceId,
  settings,
  participants,
  games,
  onParticipantClick,
}) => {

  // ✅ NEU: State für PlayerRanking-Daten
  const [playerRankings, setPlayerRankings] = useState<PlayerRankingData[]>([]);
  const [isLoadingRankings, setIsLoadingRankings] = useState(false);

  // ✅ NEU: Lade PlayerRanking-Daten für abgeschlossene Turniere
  useEffect(() => {
    const loadPlayerRankings = async () => {
      // Prüfe, ob das Turnier abgeschlossen ist (über games-Länge und andere Indikatoren)
      // Ein Turnier ist abgeschlossen, wenn es Games gibt und alle Games completedAt haben
      const isCompletedTournament = games.length > 0 && games.every(game => game.completedAt);
      
      if (isCompletedTournament) {
        setIsLoadingRankings(true);
        
        try {
          const db = getFirestore(firebaseApp);
          const rankingsRef = collection(db, 'tournaments', instanceId, 'playerRankings');
          const rankingsSnap = await getDocs(rankingsRef);
          
          const rankings: PlayerRankingData[] = [];
          rankingsSnap.forEach(doc => {
            const data = doc.data();
            rankings.push({
              playerId: doc.id,
              rank: data.rank || 0,
              pointsScored: data.pointsScored,
              pointsReceived: data.pointsReceived,
              pointsDifference: data.pointsDifference,
              stricheScored: data.stricheScored,
              stricheReceived: data.stricheReceived,
              stricheDifference: data.stricheDifference,
              gamesPlayed: data.gamesPlayed,
              gamesWon: data.gamesWon,
              gamesLost: data.gamesLost,
              gamesDraw: data.gamesDraw,
              eventCounts: data.eventCounts,
              totalWeisPoints: data.totalWeisPoints,
              averageWeisPerGame: data.averageWeisPerGame
            });
          });
          
          rankings.sort((a, b) => a.rank - b.rank);
          setPlayerRankings(rankings);
        } catch (error) {
          console.error('[TournamentRankingList] Error loading player rankings:', error);
          setPlayerRankings([]);
        } finally {
          setIsLoadingRankings(false);
        }
      } else {
        setPlayerRankings([]);
      }
    };

    loadPlayerRankings();
  }, [instanceId, games]);

  // Schritt 2.1 & 2.2: Berechne die Gesamtstände pro Spieler
  const playerTotals = useMemo(() => {
    const totals: Record<string, PlayerTotals> = {};

    // ✅ KORRIGIERT: Berechne IMMER aus games (auch für abgeschlossene Turniere!)
    // Das stellt sicher, dass die Werte korrekt sind, auch wenn Backend-Daten falsch sind  
    // Initialisiere für jeden Teilnehmer (nach Player Document ID indiziert)
    const stricheScored: Record<string, number> = {}; // ✅ NEU: Tracke Striche gemacht
    const stricheReceived: Record<string, number> = {}; // ✅ NEU: Tracke Striche erhalten
    const pointsScored: Record<string, number> = {}; // ✅ NEU: Tracke Punkte gemacht
    const pointsReceived: Record<string, number> = {}; // ✅ NEU: Tracke Punkte erhalten
    
    participants.forEach(p => {
      if (p?.playerId) {
        totals[p.playerId] = { score: 0, striche: 0, weis: 0 };
        stricheScored[p.playerId] = 0;
        stricheReceived[p.playerId] = 0;
        pointsScored[p.playerId] = 0;
        pointsReceived[p.playerId] = 0;
      }
    });

    // Iteriere über alle abgeschlossenen Spiele (Passen)
    if (Array.isArray(games)) {
      games.forEach(game => {
        // Iteriere über die Details jedes Spielers in dieser Passe
        if (Array.isArray(game.playerDetails)) {
          game.playerDetails.forEach((detail: PassePlayerDetail) => {
            const playerDocId = detail.playerId; // Player Document ID
            
            // ✅ NUR NOCH PLAYER DOCUMENT IDs verwenden!
            // Prüfe, ob der Spieler bekannt ist und Details vorhanden sind
            if (playerDocId && totals[playerDocId] && detail) {
              // 🔧 FIX: Verwende teamScoresPasse (bereits korrekte finale Punkte)
              // teamScoresPasse enthält bereits Jass-Punkte + Striche-Boni
              const teamScore = detail.team && game.teamScoresPasse 
                ? (game.teamScoresPasse[detail.team] || 0) 
                : (detail.scoreInPasse || 0);
              
              // ✅ NUR NOCH PLAYER DOCUMENT IDs verwenden!
              // 🔧 FIX: Beide Spieler bekommen die VOLLE Punktzahl!
              totals[playerDocId].score += teamScore;
              totals[playerDocId].weis += detail.weisInPasse || 0;
              pointsScored[playerDocId] += teamScore; // ✅ NEU
              
              // ✅ NEU: Berechne Punkte erhalten (Gegner-Team)
              const opponentTeamForPoints = detail.team === 'top' ? 'bottom' : 'top';
              const opponentScore = game.teamScoresPasse && game.teamScoresPasse[opponentTeamForPoints]
                ? (game.teamScoresPasse[opponentTeamForPoints] || 0)
                : 0;
              pointsReceived[playerDocId] += opponentScore; // ✅ NEU

              // KORRIGIERT: Verwende Team-Striche statt individuelle Spieler-Striche
              let stricheSumInPasse = 0;
              if (detail.team && game.teamStrichePasse && game.teamStrichePasse[detail.team]) {
                const teamStriche = game.teamStrichePasse[detail.team];
                // Summiere alle Team-Striche auf (jeder Spieler im Team bekommt die gleichen Striche)
                stricheSumInPasse = Object.values(teamStriche).reduce((sum, val) => sum + (val || 0), 0);
              }
              // Addiere zur Gesamtzahl der Striche
              totals[playerDocId].striche += stricheSumInPasse;
              stricheScored[playerDocId] += stricheSumInPasse; // ✅ NEU
              
              // ✅ NEU: Berechne Striche erhalten (Gegner-Team)
              const opponentTeamForStriche = detail.team === 'top' ? 'bottom' : 'top';
              let stricheReceivedInPasse = 0;
              if (game.teamStrichePasse && game.teamStrichePasse[opponentTeamForStriche]) {
                const opponentStriche = game.teamStrichePasse[opponentTeamForStriche];
                stricheReceivedInPasse = Object.values(opponentStriche).reduce((sum, val) => sum + (val || 0), 0);
              }
              stricheReceived[playerDocId] += stricheReceivedInPasse; // ✅ NEU
            }
          });
        }
      });
    }
    
    // ✅ NEU: Berechne stricheDifference und pointsDifference für alle Spieler
    Object.keys(totals).forEach(playerId => {
      totals[playerId].stricheDifference = (stricheScored[playerId] || 0) - (stricheReceived[playerId] || 0);
      totals[playerId].pointsDifference = (pointsScored[playerId] || 0) - (pointsReceived[playerId] || 0);
    });
    
    return totals;
  }, [participants, games]); // ✅ KORRIGIERT: playerRankings entfernt, da Werte immer aus games berechnet werden

  // Schritt 2.3: Rangliste erstellen und sortieren
  const rankedPlayers = useMemo(() => {
    // ✅ KORRIGIERT: Verwende IMMER playerTotals (berechnet aus games)
    // Das stellt sicher, dass Werte und Ränge korrekt sind, auch wenn Backend-Daten falsch sind
    const playersWithTotals = participants
        .map(p => {
        if (!p?.playerId) return null;
          
          return {
            ...p,
          totals: playerTotals[p.playerId] || { score: 0, striche: 0, stricheDifference: 0, pointsDifference: 0, weis: 0 }
          };
        })
      .filter(p => p !== null && p.playerId) as RankingEntry[];

    // ✅ IMMER: Nutze zentrale Sortier-Utility (auch für abgeschlossene Turniere!)
    // Mapping für Utility-kompatibles Format
    const rankingMode = settings?.rankingMode || 'total_points';
    const playersForSorting = playersWithTotals.map(p => ({
      playerId: p.playerId!,
      playerName: p.displayName || 'Unbekannt',
      totalStriche: p.totals.striche,
      totalPoints: p.totals.score,
      stricheDifference: p.totals.stricheDifference ?? 0, // ✅ NEU
      pointsDifference: p.totals.pointsDifference ?? 0, // ✅ NEU
      originalData: p, // Behalte Original-Daten
    }));
    
    // Sortiere mit zentraler Utility (inkl. Tie-Breaker: Punkte ↔ Striche ↔ Alphabetisch)
    const sortedPlayers = sortPlayersByRankingMode(playersForSorting, rankingMode as RankingMode);

    // Füge Rang hinzu (Spieler mit exakt gleichen Werten bekommen gleichen Rang)
    let rank = 1;
    return sortedPlayers.map((player, index) => {
      if (index > 0) {
        const prevPlayer = sortedPlayers[index - 1];
        
        // Prüfe ob BEIDE Werte (Primär UND Tie-Breaker 1) exakt gleich sind
        let isEqual = false;
        if (rankingMode === 'total_points') {
          isEqual = prevPlayer.totalPoints === player.totalPoints && 
                    prevPlayer.totalStriche === player.totalStriche;
        } else if (rankingMode === 'striche_difference') {
          // ✅ KORRIGIERT: Tie-Breaker 1 = totalStriche, Tie-Breaker 2 = pointsDifference
          isEqual = (prevPlayer.stricheDifference ?? 0) === (player.stricheDifference ?? 0) && 
                    prevPlayer.totalStriche === player.totalStriche &&
                    (prevPlayer.pointsDifference ?? 0) === (player.pointsDifference ?? 0);
        } else if (rankingMode === 'points_difference') {
          isEqual = (prevPlayer.pointsDifference ?? 0) === (player.pointsDifference ?? 0) && 
                    prevPlayer.totalStriche === player.totalStriche;
        } else {
          // 'striche'
          isEqual = prevPlayer.totalStriche === player.totalStriche && 
            prevPlayer.totalPoints === player.totalPoints;
        }
        
        if (!isEqual) {
          rank = index + 1; // Erhöhe Rang nur, wenn Werte unterschiedlich sind
        }
      }
      return { ...player.originalData, rank };
    });
  }, [participants, playerTotals, settings]); // ✅ KORRIGIERT: playerRankings entfernt

  // NEU: Hilfsfunktion um zu prüfen, ob Striche aktiv sind
  const areStrokesVisible = useMemo(() => {
    if (!settings?.strokeSettings) return true; // Fallback, wenn keine Settings da sind, zeige erstmal an
    return Object.values(settings.strokeSettings).some(value => value > 0);
  }, [settings?.strokeSettings]);

  const handleItemClick = (participant: ParticipantWithProgress) => {
    if (onParticipantClick) {
      onParticipantClick(participant);
    }
  };

  // ✅ NEU: Loading-State für PlayerRankings
  if (isLoadingRankings) {
    return (
      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
        {/* Header mit Accent-Bar - konsistent mit Chart-Header */}
        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
          <div className="w-1 h-6 bg-purple-500 rounded-r-md mr-3"></div>
          <h3 className="text-lg font-semibold text-white">🏆 Rangliste</h3>
        </div>
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
          <span className="ml-3 text-gray-400">Lade Turnier-Rankings...</span>
        </div>
      </div>
    );
  }

  // Schritt 2.4: Rendern der Tabelle
  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
      {/* Header mit Accent-Bar - konsistent mit Chart-Header */}
      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
        <div className="w-1 h-6 bg-purple-500 rounded-r-md mr-3"></div>
        <h3 className="text-lg font-semibold text-white">
          🏆 {settings?.rankingMode === 'striche_difference' ? 'Rangliste Strichdifferenz' :
              settings?.rankingMode === 'points_difference' ? 'Rangliste Punktedifferenz' :
              settings?.rankingMode === 'striche' ? 'Rangliste Striche' :
              settings?.rankingMode === 'total_points' ? 'Rangliste Punkte' :
              'Rangliste'}
        </h3>
      </div>
      
      {/* Tabellen-Container mit Padding - konsistent mit Chart-Container */}
      <div className="p-4">
      {rankedPlayers.length === 0 ? (
          <p className="text-center text-gray-400 py-4">Noch keine Teilnehmerdaten oder Ergebnisse vorhanden.</p>
      ) : (
        <table className="w-full text-sm text-left table-fixed">
          <thead className="border-b border-gray-600">
            <tr>
              <th className="w-12 py-2 pl-4 pr-1 text-left font-medium text-gray-400">#</th>
              <th className="py-2 px-2 font-medium text-gray-400">Spieler</th>
              {/* ✅ KORRIGIERT: Zeige nur die relevante Spalte basierend auf rankingMode */}
              {settings?.rankingMode === 'striche' && areStrokesVisible && (
                <th className="w-16 py-2 px-1 text-center font-medium text-gray-400">Striche</th>
              )}
              {settings?.rankingMode === 'striche_difference' && (
                <th className="w-32 py-2 px-1 text-center font-medium text-gray-400">Strichdifferenz</th>
              )}
              {settings?.rankingMode === 'total_points' && (
                <th className="w-24 py-2 px-1 text-center font-medium text-gray-400">Punkte</th>
              )}
              {settings?.rankingMode === 'points_difference' && (
                <th className="w-32 py-2 px-1 text-center font-medium text-gray-400">Punktedifferenz</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rankedPlayers.map((player) => (
              <tr 
                key={player.playerId || player.uid} 
                onClick={() => handleItemClick(player)}
                className={cn("border-b border-gray-700/50 hover:bg-gray-700/60 transition-colors", onParticipantClick ? "cursor-pointer" : "")}
              >
                <td className="py-2 pl-4 pr-1 text-left font-medium text-gray-300">{player.rank}</td>
                <td className="py-2 px-2 flex items-center space-x-2 truncate">
                  <ProfileImage 
                    src={player.photoURL}
                    alt={player.displayName || 'Spieler'}
                    size="sm"
                    className="mr-2"
                    fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                    fallbackText={player.displayName?.charAt(0).toUpperCase() || '?'}
                  />
                  <span className="text-white truncate flex-grow min-w-0" title={player.displayName}>
                    {player.displayName || 'Unbekannt'}
                  </span>
                </td>
                {/* ✅ KORRIGIERT: Zeige nur die relevante Spalte basierend auf rankingMode */}
                {settings?.rankingMode === 'striche' && areStrokesVisible && (
                  <td className="py-2 px-1 text-center text-xl font-semibold text-purple-300">
                    {player.totals.striche}
                  </td>
                )}
                {settings?.rankingMode === 'striche_difference' && (
                  <td className="py-2 pl-1 pr-6 text-right text-xl font-semibold text-purple-300">
                    {player.totals.stricheDifference != null && player.totals.stricheDifference > 0 ? `+${player.totals.stricheDifference}` : (player.totals.stricheDifference ?? 0)}
                  </td>
                )}
                {settings?.rankingMode === 'total_points' && (
                  <td className="py-2 pl-8 pr-8 text-right text-xl font-semibold text-purple-300">
                  {player.totals.score}
                </td>
                )}
                {settings?.rankingMode === 'points_difference' && (
                  <td className="py-2 pl-1 pr-6 text-right text-xl font-semibold text-purple-300">
                    {player.totals.pointsDifference ?? 0}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
      
      {/* ✅ NEU: Tie-Breaker Erklärung */}
      {settings?.rankingMode === 'striche_difference' && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-400 italic">
            Bei gleicher Strichdifferenz gewinnt der Spieler mit mehr Strichen, dann entscheidet die Punktedifferenz.
          </p>
        </div>
      )}
      {settings?.rankingMode === 'striche' && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-400 italic">
            Bei gleichen Strichen gewinnt der Spieler mit mehr Punkten.
          </p>
        </div>
      )}
    </div>
  );
};

export default TournamentRankingList; 