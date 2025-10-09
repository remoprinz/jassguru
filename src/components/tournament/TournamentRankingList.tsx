"use client";

import React, { useMemo } from 'react';
import type { TournamentInstance, TournamentSettings, TournamentGame, PassePlayerDetail } from '@/types/tournament';
import type { StricheRecord } from '@/types/jass';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Image from 'next/image';
import { ParticipantWithProgress } from '@/store/tournamentStore';
import { cn } from '@/lib/utils';
import ProfileImage from '@/components/ui/ProfileImage';

interface TournamentRankingListProps {
  instanceId: string;
  settings: TournamentSettings;
  participants: ParticipantWithProgress[];
  games: TournamentGame[];
  onParticipantClick?: (participant: ParticipantWithProgress) => void;
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

  // Schritt 2.1 & 2.2: Berechne die Gesamtstände pro Spieler
  const playerTotals = useMemo(() => {
    const totals: Record<string, PlayerTotals> = {};

    // 🔧 KORREKTUR: Verwende Firebase Auth UIDs wie in GroupView.tsx!
    // Initialisiere für jeden Teilnehmer (nach uid indiziert)
    participants.forEach(p => {
      if (p?.uid) {
        totals[p.uid] = { score: 0, striche: 0, weis: 0 };
      }
    });

    console.log('[TournamentRankingList] 🎯 Initialized totals for', Object.keys(totals).length, 'players');

    // Iteriere über alle abgeschlossenen Spiele (Passen)
    if (Array.isArray(games)) {
      games.forEach(game => {
        console.log('[TournamentRankingList] 📊 Processing game:', game.passeLabel, 'with', game.playerDetails?.length, 'players');
        
        // Iteriere über die Details jedes Spielers in dieser Passe
        if (Array.isArray(game.playerDetails)) {
          game.playerDetails.forEach((detail: PassePlayerDetail) => {
            const playerDocId = detail.playerId; // Player Document ID
            
            // 🔧 KRITISCHER FIX: Mappe playerId → uid
            // Finde den Teilnehmer mit dieser playerId
            const participant = participants.find(p => p.playerId === playerDocId);
            const playerUid = participant?.uid;
            
            console.log('[TournamentRankingList] 🎮 Processing player:', {
              playerName: detail.playerName,
              playerDocId,
              mappedUid: playerUid,
              hasTotals: !!totals[playerUid || '']
            });
            
            // Prüfe, ob der Spieler bekannt ist und Details vorhanden sind
            if (playerUid && totals[playerUid] && detail) {
              // 🔧 FIX: Verwende teamScoresPasse (bereits korrekte finale Punkte)
              // teamScoresPasse enthält bereits Jass-Punkte + Striche-Boni
              const teamScore = detail.team && game.teamScoresPasse 
                ? (game.teamScoresPasse[detail.team] || 0) 
                : (detail.scoreInPasse || 0);
              
              // 🔧 FIX: Beide Spieler bekommen die VOLLE Punktzahl!
              totals[playerUid].score += teamScore;
              totals[playerUid].weis += detail.weisInPasse || 0;

              // KORRIGIERT: Verwende Team-Striche statt individuelle Spieler-Striche
              let stricheSumInPasse = 0;
              if (detail.team && game.teamStrichePasse && game.teamStrichePasse[detail.team]) {
                const teamStriche = game.teamStrichePasse[detail.team];
                // Summiere alle Team-Striche auf (jeder Spieler im Team bekommt die gleichen Striche)
                stricheSumInPasse = Object.values(teamStriche).reduce((sum, val) => sum + (val || 0), 0);
              }
              // Addiere zur Gesamtzahl der Striche
              totals[playerUid].striche += stricheSumInPasse;
              
              console.log('[TournamentRankingList] ✅ Updated totals for', detail.playerName, ':', totals[playerUid]);
            } else {
              console.warn('[TournamentRankingList] ⚠️ Could not find totals for player:', {
                playerName: detail.playerName,
                playerDocId,
                mappedUid: playerUid
              });
            }
          });
        }
      });
    }
    
    console.log('[TournamentRankingList] 🏁 Final totals:', totals);
    return totals;
  }, [participants, games]); // Abhängigkeiten: Teilnehmerliste und Spieleliste

  // Schritt 2.3: Rangliste erstellen und sortieren
  const rankedPlayers = useMemo(() => {
    // Debug-Logging entfernt - zu viele repetitive Logs
    // Kombiniere Teilnehmerdaten mit ihren Gesamtständen
    const playersWithTotals = participants
      .map(p => ({
        ...p,
        totals: p?.uid ? playerTotals[p.uid] : { score: 0, striche: 0, weis: 0 }, // Fallback für fehlende uid
      }))
      .filter(p => p.uid); // Nur Teilnehmer mit gültiger uid berücksichtigen

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
  }, [participants, playerTotals, settings]);

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
                key={player.uid} 
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