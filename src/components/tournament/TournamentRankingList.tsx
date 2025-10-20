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

    // ✅ INTELLIGENTE DATENQUELLE: Verwende PlayerRankings für abgeschlossene Turniere
    if (playerRankings.length > 0) {
      // Initialisiere für jeden Teilnehmer (nach Player Document ID indiziert)
      participants.forEach(p => {
        if (p?.playerId) {
          totals[p.playerId] = { score: 0, striche: 0, weis: 0 };
        }
      });

      // Lade Daten aus PlayerRankings (direkt, ohne Mapping!)
      playerRankings.forEach(ranking => {
        if (totals[ranking.playerId]) {
          totals[ranking.playerId].score = ranking.pointsScored || 0;
          totals[ranking.playerId].striche = ranking.stricheScored || 0;
          totals[ranking.playerId].weis = ranking.totalWeisPoints || 0;
        }
      });
      
      return totals;
    }

    // ✅ FALLBACK: Live-Berechnung für aktive Turniere
    // Initialisiere für jeden Teilnehmer (nach Player Document ID indiziert)
    participants.forEach(p => {
      if (p?.playerId) {
        totals[p.playerId] = { score: 0, striche: 0, weis: 0 };
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

              // KORRIGIERT: Verwende Team-Striche statt individuelle Spieler-Striche
              let stricheSumInPasse = 0;
              if (detail.team && game.teamStrichePasse && game.teamStrichePasse[detail.team]) {
                const teamStriche = game.teamStrichePasse[detail.team];
                // Summiere alle Team-Striche auf (jeder Spieler im Team bekommt die gleichen Striche)
                stricheSumInPasse = Object.values(teamStriche).reduce((sum, val) => sum + (val || 0), 0);
              }
              // Addiere zur Gesamtzahl der Striche
              totals[playerDocId].striche += stricheSumInPasse;
            }
          });
        }
      });
    }
    
    return totals;
  }, [participants, games, playerRankings]); // ✅ NEU: playerRankings als Abhängigkeit

  // Schritt 2.3: Rangliste erstellen und sortieren
  const rankedPlayers = useMemo(() => {
    // ✅ INTELLIGENTE SORTIERUNG: Verwende PlayerRankings für abgeschlossene Turniere
    if (playerRankings.length > 0) {
      // ✅ NUR NOCH PLAYER DOCUMENT IDs verwenden!
      const playersWithRankings = participants
        .map(p => {
          // Finde das Ranking basierend auf der Player Document ID des Teilnehmers
          const ranking = playerRankings.find(r => r.playerId === p.playerId);
          
          if (!ranking) return null;
          
          return {
            ...p,
            rank: ranking.rank,
            totals: {
              score: ranking.pointsScored || 0,
              striche: ranking.stricheScored || 0,
              weis: ranking.totalWeisPoints || 0
            }
          };
        })
        .filter(p => p !== null)
        .sort((a, b) => a.rank - b.rank) as RankingEntry[]; // ✅ KRITISCH: Sortiere nach Rang!
      
      return playersWithRankings;
    }

    // ✅ FALLBACK: Live-Sortierung für aktive Turniere
    // ✅ NUR NOCH PLAYER DOCUMENT IDs verwenden!
    // Kombiniere Teilnehmerdaten mit ihren Gesamtständen
    const playersWithTotals = participants
      .map(p => ({
        ...p,
        totals: p?.playerId ? playerTotals[p.playerId] : { score: 0, striche: 0, weis: 0 }, // Fallback für fehlende playerId
      }))
      .filter(p => p.playerId); // Nur Teilnehmer mit gültiger playerId berücksichtigen

    // Sortierlogik basierend auf rankingMode
    playersWithTotals.sort((a, b) => {
      const rankingMode = settings?.rankingMode || 'total_points'; // Default auf Punkte, falls nicht gesetzt

      if (rankingMode === 'total_points') {
        // Nach Punkten absteigend, dann nach Strichen absteigend
        if (b.totals.score !== a.totals.score) {
          return b.totals.score - a.totals.score;
        }
        return b.totals.striche - a.totals.striche;
      } else if (rankingMode === 'striche') {
        // Nach Strichen absteigend, dann nach Punkten absteigend
        if (b.totals.striche !== a.totals.striche) {
          return b.totals.striche - a.totals.striche;
        }
        return b.totals.score - a.totals.score;
      } else {
        // Für andere Modi (wins/average) 
        // Nach Strichen absteigend, dann nach Punkten absteigend
        if (b.totals.striche !== a.totals.striche) {
          return b.totals.striche - a.totals.striche;
        }
        return b.totals.score - a.totals.score;
      }
    });

    // Füge den Rang hinzu (Berücksichtige Punkt-/Strichgleichheit)
    let rank = 1;
    return playersWithTotals.map((player, index, arr) => {
      if (index > 0) {
        const prevPlayer = arr[index - 1];
        const rankingMode = settings?.rankingMode || 'total_points';
        let scoreSame = false;
        
        if (rankingMode === 'total_points') {
          scoreSame = player.totals.score === prevPlayer.totals.score && player.totals.striche === prevPlayer.totals.striche;
        } else if (rankingMode === 'striche') {
          scoreSame = player.totals.striche === prevPlayer.totals.striche && player.totals.score === prevPlayer.totals.score;
        } else {
          scoreSame = player.totals.striche === prevPlayer.totals.striche && player.totals.score === prevPlayer.totals.score;
        }
        
        if (!scoreSame) {
          rank = index + 1; // Erhöhe Rang nur, wenn Score/Striche unterschiedlich sind
        }
      }
      return { ...player, rank };
    });
  }, [participants, playerTotals, settings, playerRankings]); // ✅ NEU: playerRankings als Abhängigkeit

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
      <div className="bg-gray-800/50 p-4 rounded-lg shadow-inner border border-gray-700/50">
        <h3 className="text-lg font-semibold text-center mb-4 text-purple-300">Rangliste</h3>
        <div className="flex justify-center items-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
          <span className="ml-3 text-gray-400">Lade Turnier-Rankings...</span>
        </div>
      </div>
    );
  }

  // Schritt 2.4: Rendern der Tabelle
  return (
    <div className="bg-gray-800/50 p-4 rounded-lg shadow-inner border border-gray-700/50">
      <h3 className="text-lg font-semibold text-center mb-4 text-purple-300">Rangliste</h3>
      
      {rankedPlayers.length === 0 ? (
        <p className="text-center text-gray-400">Noch keine Teilnehmerdaten oder Ergebnisse vorhanden.</p>
      ) : (
        <table className="w-full text-sm text-left table-fixed">
          <thead className="border-b border-gray-600">
            <tr>
              <th className="w-8 py-2 px-1 text-center font-medium text-gray-400">#</th>
              <th className="py-2 px-2 font-medium text-gray-400">Spieler</th>
              {areStrokesVisible && (
                <th className="w-16 py-2 px-1 text-center font-medium text-gray-400">Striche</th>
              )}
              <th className="w-16 py-2 px-1 text-center font-medium text-gray-400">Punkte</th>
            </tr>
          </thead>
          <tbody>
            {rankedPlayers.map((player) => (
              <tr 
                key={player.playerId || player.uid} 
                onClick={() => handleItemClick(player)}
                className={cn("border-b border-gray-700/50 hover:bg-gray-700/60 transition-colors", onParticipantClick ? "cursor-pointer" : "")}
              >
                <td className="py-2 px-1 text-center font-medium text-gray-300">{player.rank}</td>
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
                {areStrokesVisible && (
                  <td className={`py-2 px-1 text-center font-semibold ${settings?.rankingMode === 'striche' ? 'text-xl text-purple-300' : 'text-white'}`}>
                    {player.totals.striche}
                  </td>
                )}
                <td className={`py-2 px-1 text-center ${settings?.rankingMode === 'total_points' ? 'text-xl font-semibold text-purple-300' : 'text-xs text-gray-400'}`}>
                  {player.totals.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default TournamentRankingList; 