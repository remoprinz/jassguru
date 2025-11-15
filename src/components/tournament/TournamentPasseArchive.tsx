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

  // Schritt 3.2: Passen sortieren und deduplizieren (nach tournamentRound und passeInRound aufsteigend)
  const sortedGames = useMemo(() => {
    if (!Array.isArray(games)) return [];
    
    // ✅ NEU: Dedupliziere zuerst nach passeId (eindeutige Passe-ID)
    // Falls passeId fehlt, verwende Kombination aus tournamentRound + passeInRound
    const uniqueGamesMap = new Map<string, TournamentGame>();
    
    games.forEach(game => {
      // Verwende passeId als primären Schlüssel (eindeutig pro Passe)
      const uniqueKey = game.passeId || `${game.tournamentRound || 0}_${game.passeInRound || 'A'}`;
      
      // ✅ Wenn bereits vorhanden, behalte den ersten Eintrag (oder den mit completedAt)
      if (!uniqueGamesMap.has(uniqueKey)) {
        uniqueGamesMap.set(uniqueKey, game);
      } else {
        // Falls Duplikat: Behalte den mit completedAt (falls vorhanden)
        const existing = uniqueGamesMap.get(uniqueKey);
        if (game.completedAt && (!existing?.completedAt || 
            (game.completedAt instanceof Timestamp && existing.completedAt instanceof Timestamp &&
             game.completedAt.toMillis() > existing.completedAt.toMillis()))) {
          uniqueGamesMap.set(uniqueKey, game);
        }
      }
    });
    
    // Konvertiere Map zurück zu Array und sortiere
    return Array.from(uniqueGamesMap.values()).sort((a, b) => {
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
  // ✅ Die Route /tournaments/[instanceId]/passe/[passeId] funktioniert auch für Public View
  const handlePasseClick = (passeId: string) => {
    if (instanceId && passeId) {
      router.push(`/tournaments/${instanceId}/passe/${passeId}`);
    }
  };

  // 🆕 Gruppiere Games nach tournamentRound für bessere UX
  const groupedByRound = useMemo(() => {
    const groups = new Map<number, TournamentGame[]>();
    sortedGames.forEach(game => {
      const round = game.tournamentRound || 1;
      if (!groups.has(round)) {
        groups.set(round, []);
      }
      groups.get(round)!.push(game);
    });
    // Sortiere nach Runde aufsteigend (1, 2, 3...)
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [sortedGames]);

  // Schritt 3.3: Liste rendern
  return (
    <div className="space-y-6">
      {sortedGames.length === 0 ? (
        <p className="text-center text-gray-500 py-6">Noch keine Passen gespielt.</p>
      ) : (
        groupedByRound.map(([roundNumber, roundGames]) => (
          <div key={roundNumber} className="space-y-2">
            {/* 🎯 RUNDEN-HEADER */}
            <h3 className="text-xl font-bold text-white text-center px-1 mb-3">
              Passe {roundNumber}
            </h3>
            
            {/* 🃏 KARTEN DER RUNDE */}
            {roundGames.map((game) => {
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
              className="block w-full text-left px-3 py-2 lg:px-6 lg:py-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors duration-150 cursor-pointer mb-2"
            >
              {/* 🎨 HEADER: Größer wie im GroupView */}
              <div className="flex justify-between items-center mb-3">
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
        })}
          </div>
        ))
      )}
    </div>
  );
};

export default TournamentPasseArchive; 