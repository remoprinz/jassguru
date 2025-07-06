"use client";

import React, { useMemo } from 'react';
import type { TournamentGame, PassePlayerDetail } from '@/types/tournament';
import { Timestamp, FieldValue } from 'firebase/firestore';
import { format } from 'date-fns';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface TournamentPasseArchiveProps {
  instanceId: string;
  games: TournamentGame[];
  playerPhotoUrlMapping: Record<string, string>;
  playerNamesMapping: Record<string, string>;
}

// Hilfsfunktion zur Zeitformatierung
const formatPasseTime = (timestamp: Timestamp | FieldValue | undefined): string => {
  if (timestamp instanceof Timestamp) {
    return format(timestamp.toDate(), 'dd.MM.yy, HH:mm');
  }
  // Handle FieldValue oder undefined?
  return '-'; // Fallback
};

const TournamentPasseArchive: React.FC<TournamentPasseArchiveProps> = ({ 
  instanceId,
  games,
  playerPhotoUrlMapping,
  playerNamesMapping,
}) => {
  const router = useRouter();

  // Schritt 3.2: Passen sortieren (nach passeNumber aufsteigend)
  const sortedGames = useMemo(() => {
    if (!Array.isArray(games)) return [];
    return [...games].sort((a, b) => (a.passeNumber || 0) - (b.passeNumber || 0));
  }, [games]);

  // NEU: Handler für Klick auf eine Passe
  const handlePasseClick = (passeId: string) => {
    if (instanceId && passeId) {
      router.push(`/tournaments/${instanceId}/passe/${passeId}`);
    }
  };

  // Schritt 3.3: Liste rendern
  return (
    <div className="space-y-2">
      {sortedGames.length === 0 ? (
        <p className="text-center text-gray-500 py-6">Noch keine Passen gespielt.</p>
      ) : (
        sortedGames.map((game) => {
          // Extrahiere Spieler und Striche für die Anzeige
          const teamTopPlayers = game.playerDetails
            ?.filter(d => d.team === 'top')
            .map(d => d.playerName)
            .join(' & ') || 'Team Oben';
          const teamBottomPlayers = game.playerDetails
            ?.filter(d => d.team === 'bottom')
            .map(d => d.playerName)
            .join(' & ') || 'Team Unten';
          
          // GEÄNDERT: Zeige Striche statt Punkte
          const topStriche = game.teamStrichePasse?.top;
          const bottomStriche = game.teamStrichePasse?.bottom;
          
          const stricheTop = topStriche 
            ? (topStriche.sieg || 0) + (topStriche.berg || 0) + (topStriche.matsch || 0) + (topStriche.schneider || 0) + (topStriche.kontermatsch || 0)
            : 0;
          const stricheBottom = bottomStriche 
            ? (bottomStriche.sieg || 0) + (bottomStriche.berg || 0) + (bottomStriche.matsch || 0) + (bottomStriche.schneider || 0) + (bottomStriche.kontermatsch || 0)
            : 0;
          
          const completedTime = formatPasseTime(game.completedAt);

          return (
            <button 
              key={game.passeId}
              onClick={() => handlePasseClick(game.passeId)}
              className="block w-full text-left p-3 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 transition-colors duration-150 cursor-pointer border border-gray-700/50"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-purple-300">
                  Passe {game.passeNumber}
                </span>
                <span className="text-xs text-gray-400">
                  {completedTime}
                </span>
              </div>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-300 truncate pr-2" title={teamBottomPlayers}>{teamBottomPlayers}</span>
                  <span className="font-medium text-white">{stricheBottom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300 truncate pr-2" title={teamTopPlayers}>{teamTopPlayers}</span>
                  <span className="font-medium text-white">{stricheTop}</span>
                </div>
              </div>
              {game.playerDetails && game.playerDetails.length > 0 && (
                <div className="mt-2 flex -space-x-1.5 overflow-hidden">
                  {game.playerDetails.map((detail, idx) => {
                    let photoUrl: string | undefined = undefined;
                    const displayName = detail.playerName || 'Spieler'; // Für Anzeige und Fallback-Initialen

                    // 1. Versuche die robuste Methode über detail.playerId
                    if (detail.playerId && playerPhotoUrlMapping && playerPhotoUrlMapping[detail.playerId]) {
                      photoUrl = playerPhotoUrlMapping[detail.playerId];
                    } 
                    // 2. Fallback: Versuche über playerName (aktuelle funktionierende Methode)
                    else if (displayName && playerNamesMapping && playerPhotoUrlMapping) {
                      let foundPlayerIdViaName: string | undefined = undefined;
                      for (const [pid, name] of Object.entries(playerNamesMapping)) {
                        if (name === displayName) {
                          foundPlayerIdViaName = pid;
                          break;
                        }
                      }
                      if (foundPlayerIdViaName && playerPhotoUrlMapping[foundPlayerIdViaName]) {
                        photoUrl = playerPhotoUrlMapping[foundPlayerIdViaName];
                      }
                    }
                    
                    return (
                      <Avatar key={idx} className="h-6 w-6 border-2 border-gray-800 bg-gray-700">
                        {photoUrl ? (
                          <Image
                            src={photoUrl}
                            alt={displayName}
                            width={20}
                            height={20}
                            className="rounded-full object-cover"
                          />
                        ) : (
                          <AvatarFallback className="bg-gray-600 text-gray-300 text-xs">
                            {displayName?.charAt(0).toUpperCase() || '?'}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })
      )}
    </div>
  );
};

export default TournamentPasseArchive; 