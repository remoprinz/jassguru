"use client";

import React, { useMemo } from 'react';
import type { TournamentGame, PassePlayerDetail } from '@/types/tournament';
import { Timestamp, FieldValue } from 'firebase/firestore';
import { format } from 'date-fns';
import { useRouter } from 'next/router';
import Image from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import ProfileImage from '@/components/ui/ProfileImage';
import { CheckCircle } from 'lucide-react';

interface TournamentPasseArchiveProps {
  instanceId: string;
  games: TournamentGame[];
  playerPhotoUrlMapping: Record<string, string>;
  playerNamesMapping: Record<string, string>;
}

// Hilfsfunktion zur Zeitformatierung mit Von-Bis Zeit
const formatPasseTime = (startTimestamp: Timestamp | FieldValue | undefined, endTimestamp: Timestamp | FieldValue | undefined): string => {
  if (startTimestamp instanceof Timestamp && endTimestamp instanceof Timestamp) {
    const startDate = startTimestamp.toDate();
    const endDate = endTimestamp.toDate();
    const startTime = format(startDate, 'HH:mm');
    const endTime = format(endDate, 'HH:mm');
    const dateStr = format(endDate, 'dd.MM.yy');
    return `${dateStr}, ${startTime}-${endTime}`;
  }
  
  // Fallback: Nur Endzeit anzeigen
  if (endTimestamp instanceof Timestamp) {
    return format(endTimestamp.toDate(), 'dd.MM.yy, HH:mm');
  }
  
  return '-'; // Fallback
};

const TournamentPasseArchive: React.FC<TournamentPasseArchiveProps> = ({ 
  instanceId,
  games,
  playerPhotoUrlMapping,
  playerNamesMapping,
}) => {
  const router = useRouter();

  // Schritt 3.2: Passen sortieren (nach tournamentRound und passeInRound aufsteigend)
  const sortedGames = useMemo(() => {
    if (!Array.isArray(games)) return [];
    return [...games].sort((a, b) => {
      // 🆕 Primär nach Runde sortieren
      const roundDiff = (a.tournamentRound || 0) - (b.tournamentRound || 0);
      if (roundDiff !== 0) return roundDiff;
      
      // 🆕 Sekundär nach Buchstabe sortieren (A, B, C...)
      const letterA = a.passeInRound || 'A';
      const letterB = b.passeInRound || 'A';
      return letterA.localeCompare(letterB);
    });
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
          
          const completedTime = formatPasseTime(game.startedAt, game.completedAt);

          return (
            <button 
              key={game.passeId}
              onClick={() => handlePasseClick(game.passeId)}
              className="block w-full text-left px-3 py-2 lg:px-6 lg:py-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors duration-150 cursor-pointer mb-2"
            >
              {/* 🎨 HEADER: Größer wie im GroupView */}
              <div className="flex justify-between items-center mb-1.5">
                <div className="flex items-center flex-grow"> 
                  <span className="text-base lg:text-xl font-medium text-purple-300 mr-2"> 
                    {/* 🆕 DUALE NUMMERIERUNG: Zeige passeLabel (z.B. "1A", "1B") */}
                    Passe {game.passeLabel || `${game.passeNumber}`}
                  </span>
                                <span className="text-sm text-white mr-2">|</span>
                  <span className="text-sm text-white">{completedTime}</span>
                  <div className="flex-shrink-0 ml-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  </div>
                </div>
              </div>
              
              {/* 🎨 TEAMS: Mit Avataren links wie im GroupView Teams-Tab */}
              <div className="space-y-1">
                {/* Team Bottom */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    {/* 🎨 AVATAR-PAIR: Wie im GroupView Teams-Tab */}
                    <div className="flex mr-2">
                      {game.playerDetails
                        ?.filter(d => d.team === 'bottom')
                        .slice(0, 2) // Nur die ersten 2 Spieler
                        .map((detail, idx) => {
                          let photoUrl: string | undefined = undefined;
                          const displayName = detail.playerName || 'Spieler';

                          // 1. Versuche die robuste Methode über detail.playerId
                          if (detail.playerId && playerPhotoUrlMapping && playerPhotoUrlMapping[detail.playerId]) {
                            photoUrl = playerPhotoUrlMapping[detail.playerId];
                          } 
                          // 2. Fallback: Versuche über playerName
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
                            <ProfileImage
                              key={idx}
                              src={photoUrl}
                              alt={displayName}
                              size="sm"
                              className={`border-2 border-gray-800 ${idx === 1 ? '-ml-2' : ''}`}
                              style={{ zIndex: idx === 0 ? 1 : 0 }}
                              fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                              fallbackText={displayName?.charAt(0).toUpperCase() || '?'}
                              context="list"
                            />
                          );
                        })}
                    </div>
                    <span className="text-sm text-gray-300 truncate pr-2" title={teamBottomPlayers}>{teamBottomPlayers}</span>
                  </div>
                  <span className="text-lg font-medium text-white">{stricheBottom}</span>
                </div>
                
                {/* Team Top */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    {/* 🎨 AVATAR-PAIR: Wie im GroupView Teams-Tab */}
                    <div className="flex mr-2">
                      {game.playerDetails
                        ?.filter(d => d.team === 'top')
                        .slice(0, 2) // Nur die ersten 2 Spieler
                        .map((detail, idx) => {
                          let photoUrl: string | undefined = undefined;
                          const displayName = detail.playerName || 'Spieler';

                          // 1. Versuche die robuste Methode über detail.playerId
                          if (detail.playerId && playerPhotoUrlMapping && playerPhotoUrlMapping[detail.playerId]) {
                            photoUrl = playerPhotoUrlMapping[detail.playerId];
                          } 
                          // 2. Fallback: Versuche über playerName
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
                            <ProfileImage
                              key={idx}
                              src={photoUrl}
                              alt={displayName}
                              size="sm"
                              className={`border-2 border-gray-800 ${idx === 1 ? '-ml-2' : ''}`}
                              style={{ zIndex: idx === 0 ? 1 : 0 }}
                              fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                              fallbackText={displayName?.charAt(0).toUpperCase() || '?'}
                              context="list"
                            />
                          );
                        })}
                    </div>
                    <span className="text-sm text-gray-300 truncate pr-2" title={teamTopPlayers}>{teamTopPlayers}</span>
                  </div>
                  <span className="text-lg font-medium text-white">{stricheTop}</span>
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
};

export default TournamentPasseArchive; 