import React, { useMemo } from "react";
import { StrokeSettings, PlayerNames /* PlayerNumber ist hier nicht direkt nötig */ } from '@/types/jass'; 
// PlayerIdToNameMapping wird von der Elternkomponente definiert und übergeben
import type { PlayerIdToNameMapping } from '@/components/tournament/TournamentGameViewerKreidetafel'; // Pfad anpassen, falls nötig
import Image from 'next/image'; // Wichtig: Füge diesen Import hinzu

import type { TournamentGame, PassePlayerDetail } from '@/types/tournament';
import { Award } from "lucide-react"; // Icon für Rangliste
import { Avatar, AvatarFallback } from "@/components/ui/avatar"; // Importiere Avatar und AvatarFallback
import ProfileImage from '@/components/ui/ProfileImage';

// Hilfsfunktion, um eine Standard-PlayerPasseResult zu erstellen
// const defaultPlayerPasseResult = (): PlayerPasseResult => ({ score: 0, striche: 0, weis: 0 });

export interface TournamentStricheStatistikProps {
  tournamentGames: TournamentGame[]; 
  playerNamesMapping: PlayerIdToNameMapping; 
  strokeSettings: StrokeSettings;
  // Optionale Props, die von anderen Modulen benötigt werden könnten, hier aber nicht verwendet werden
  playerNames?: PlayerNames; // Für Kompatibilität mit CurrentStatisticComponent
  cardStyle?: any; // Für Kompatibilität mit CurrentStatisticComponent (Typ ggf. präzisieren)
}

interface AggregatedPlayerStats {
  playerId: string; // PlayerId ist string
  displayName: string;
  totalStriche: number;
  totalScore: number; 
  totalWeis: number;  
  passenPlayed: number;
}

export const TournamentStricheStatistik: React.FC<TournamentStricheStatistikProps> = ({
  tournamentGames,
  playerNamesMapping, 
  strokeSettings, 
  // playerNames und cardStyle werden hier nicht verwendet
}) => {

  const aggregatedStats = useMemo(() => {
    const stats: Record<string, AggregatedPlayerStats> = {}; // Key ist PlayerId (string)

    // Korrektur: Angepasste Logik für `passenPlayed`:
    // Initialisiere stats mit allen bekannten Spielern aus dem Mapping
    Object.keys(playerNamesMapping).forEach(playerId => {
        stats[playerId] = {
            playerId,
            displayName: playerNamesMapping[playerId] || `Spieler (${playerId.substring(0, 4)})`,
            totalStriche: 0, totalScore: 0, totalWeis: 0, passenPlayed: 0
        };
    });

    // Iteriere über Passen, um Werte zu akkumulieren und passenPlayed zu zählen
    tournamentGames.forEach(passe => {
      const playersInThisPasse = new Set<string>(); // Verhindert doppeltes Zählen pro Passe
      // --- KORREKTUR BEGINN (Iteration über playerDetails) ---
      if (passe.playerDetails && Array.isArray(passe.playerDetails)) {
        passe.playerDetails.forEach(detail => {
          const playerId = detail.playerId;
          // Nur bekannte Spieler aus dem Mapping berücksichtigen
          if (playerId && stats[playerId]) { 
            playersInThisPasse.add(playerId); // Spieler hat an dieser Passe teilgenommen

            // Aggregiere die Daten
            let stricheSumInPasse = 0;
            if (detail.stricheInPasse && typeof detail.stricheInPasse === 'object') {
              stricheSumInPasse = Object.values(detail.stricheInPasse).reduce((sum, val) => sum + (val || 0), 0);
            }
            stats[playerId].totalStriche += stricheSumInPasse;
            stats[playerId].totalScore += detail.scoreInPasse || 0;
            stats[playerId].totalWeis += detail.weisInPasse || 0;
          }
        });
         // Erhöhe passenPlayed für jeden Spieler, der in dieser Passe war
        playersInThisPasse.forEach(playerId => {
            if (stats[playerId]) stats[playerId].passenPlayed += 1;
        });
      }
      // --- KORREKTUR ENDE ---
    });

    // Sortiere und gib das Ergebnis zurück
    return Object.values(stats).sort((a, b) => {
      // Sortiere primär nach totalStriche (absteigend)
      if (b.totalStriche !== a.totalStriche) {
        return b.totalStriche - a.totalStriche;
      }
      // Sekundär nach totalScore (absteigend) als Tie-Breaker
      if (b.totalScore !== a.totalScore) {
          return b.totalScore - a.totalScore;
      }
      // Tertiär alphabetisch nach Namen
      return a.displayName.localeCompare(b.displayName);
    });
  }, [tournamentGames, playerNamesMapping]);

  if (!tournamentGames || tournamentGames.length === 0) {
    return <div className="text-center text-gray-400 py-8">Keine Passen-Daten für die Rangliste vorhanden.</div>;
  }

  if (aggregatedStats.length === 0) {
    return <div className="text-center text-gray-400 py-8">Keine Spielergebnisse für die Rangliste gefunden.</div>;
  }

  return (
    <div className="flex flex-col w-full space-y-3 p-3 bg-gray-800/70 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-white flex items-center">
        <Award className="w-5 h-5 mr-2 text-yellow-400" />
        Striche Rangliste
      </h3>
      <div className="space-y-2">
        {aggregatedStats.map((playerStat, index) => (
          <div 
            key={playerStat.playerId}
            className={`flex justify-between items-center p-2.5 rounded-md ${index < 3 ? 'bg-gray-700/70' : 'bg-gray-700/40'}`}
          >
            <div className="flex items-center">
              <span className={`text-sm font-medium w-6 text-center ${index === 0 ? 'text-yellow-400' : (index === 1 ? 'text-gray-300' : (index === 2 ? 'text-orange-400' : 'text-gray-400'))}`}>
                {index + 1}.
              </span>
              <ProfileImage 
                src={undefined} 
                alt={playerStat.displayName} 
                size="sm"
                className="mr-2"
                fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                fallbackText={playerStat.displayName ? playerStat.displayName.charAt(0).toUpperCase() : '?'}
              />
              <span className="text-sm text-white truncate ml-2" title={playerStat.displayName}>
                {playerStat.displayName}
              </span>
            </div>
            <div className="text-sm">
              <span className="font-bold text-white">{playerStat.totalStriche}</span>
              <span className="text-gray-400 ml-1"> Striche</span>
              {/* <span className="text-xs text-gray-500 ml-2">({playerStat.passenPlayed} P.)</span> */}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}; 