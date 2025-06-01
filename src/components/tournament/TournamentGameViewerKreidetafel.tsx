"use client"; // Add use client directive for useState, useEffect, etc.

import React, { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import type { 
  PlayerNames, 
  StricheRecord, 
  CardStyle,
  PlayerNumber,
  StrokeSettings,
  ScoreSettings
  // GameEntry, TeamScores, JassColor, TeamPosition, CompletedGameSummary, TeamStand // Weniger genutzte Typen hier entfernt, um Redundanz zu prüfen
} from '@/types/jass';
import { Timestamp, FieldValue } from 'firebase/firestore'; 
import { animated, useSpring } from 'react-spring';
import { useSwipeable } from 'react-swipeable';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings'; 
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings'; 
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
// import { getNormalStricheCount } from '@/utils/stricheCalculations'; // Nicht direkt hier verwendet

import type { TournamentGame } from '@/types/tournament';

import { TournamentStricheStatistik } from '@/statistics/TournamentStricheStatistik';
import { TournamentRoundHistoryDisplay } from '@/statistics/TournamentRoundHistoryDisplay';
import { BarChart2, ListChecks } from 'lucide-react'; 

// Typ für das Mapping von PlayerId (string) zu displayName (string)
export type PlayerIdToNameMapping = Record<string, string>;

const TOURNAMENT_STATISTIC_MODULES = [
  {
    id: 'tournament_runden',
    displayName: 'Passen-Details',
    component: TournamentRoundHistoryDisplay,
    icon: ListChecks,
  },
  {
    id: 'tournament_striche_rangliste',
    displayName: 'Striche Rangliste',
    component: TournamentStricheStatistik,
    icon: BarChart2,
  },
];

interface TournamentGameViewerKreidetafelProps {
  tournamentGames: TournamentGame[]; 
  playerNamesMapping: PlayerIdToNameMapping; 
  playerPhotoUrlMapping?: Record<string, string>;
  strokeSettings?: StrokeSettings; 
  scoreSettings?: ScoreSettings; 
  cardStyle?: CardStyle; 
}

// PlayerNameDisplay (kann hier bleiben oder ausgelagert werden, falls woanders benötigt)
const PlayerNameDisplay: React.FC<{ name: string, isStarter: boolean }> = ({ name, isStarter }) => (
  <div className="text-center text-gray-400 px-1 overflow-hidden text-ellipsis whitespace-nowrap">
    <span className="inline-block">
      {name}
      {isStarter && <span>❀</span>}
    </span>
  </div>
);

const TournamentGameViewerKreidetafel: React.FC<TournamentGameViewerKreidetafelProps> = ({ 
  tournamentGames, 
  playerNamesMapping, 
  playerPhotoUrlMapping,
  strokeSettings, 
  scoreSettings, 
  cardStyle = DEFAULT_FARBE_SETTINGS.cardStyle 
}) => {
  const [currentStatisticId, setCurrentStatisticId] = useState<string>(TOURNAMENT_STATISTIC_MODULES[0]?.id);

  const currentPasse = useMemo(() => tournamentGames.length > 0 ? tournamentGames[tournamentGames.length - 1] : null, [tournamentGames]);
  
  const currentPasseIdNumber = useMemo(() => {
     if (currentPasse && typeof currentPasse.passeNumber === 'number') {
       return currentPasse.passeNumber;
     }
     return tournamentGames.length; 
   }, [currentPasse, tournamentGames.length]);

  const currentDate = useMemo(() => {
    let ts: number | Timestamp | FieldValue | undefined | Date;
    if (currentPasse && currentPasse.completedAt) { 
      ts = currentPasse.completedAt;
    }
    const dateSource = ts instanceof Timestamp ? ts.toMillis() : (ts instanceof Date ? ts.getTime() : (typeof ts === 'number' ? ts : Date.now()));
    return format(new Date(dateSource), 'd.M.yyyy');
  }, [currentPasse]);

  const activeStrokeSettings = strokeSettings ?? DEFAULT_STROKE_SETTINGS;
  
  const handleStatisticChange = useCallback((direction: 'left' | 'right') => {
    const currentIndex = TOURNAMENT_STATISTIC_MODULES.findIndex(mod => mod.id === currentStatisticId);
    let nextIndex;
    if (direction === 'right') {
        nextIndex = (currentIndex + 1) % TOURNAMENT_STATISTIC_MODULES.length;
    } else { 
        nextIndex = (currentIndex - 1 + TOURNAMENT_STATISTIC_MODULES.length) % TOURNAMENT_STATISTIC_MODULES.length;
    }
    setCurrentStatisticId(TOURNAMENT_STATISTIC_MODULES[nextIndex].id);
  }, [currentStatisticId]);

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => handleStatisticChange('right'),
    onSwipedRight: () => handleStatisticChange('left'),
    preventScrollOnSwipe: true,
    trackMouse: true,
    touchEventOptions: { passive: false } 
  });

  const swipeAnimation = useSpring({
    from: { opacity: 0, transform: 'translateX(20px)' },
    to: { opacity: 1, transform: 'translateX(0px)' },
    key: currentStatisticId,
    config: { tension: 280, friction: 25 }
  });

  const CurrentStatisticModule = TOURNAMENT_STATISTIC_MODULES.find(mod => mod.id === currentStatisticId);
  const CurrentStatisticComponent = CurrentStatisticModule?.component;
  const currentModuleDisplayName = CurrentStatisticModule?.displayName;

  const fallbackPlayerNamesForRoundHistory: PlayerNames = useMemo(() => {
    const names: PlayerNames = { 1: 'S1', 2: 'S2', 3: 'S3', 4: 'S4' }; 
    const playerIds = Object.keys(playerNamesMapping);
    playerIds.slice(0, 4).forEach((playerId, index) => {
      names[(index + 1) as PlayerNumber] = playerNamesMapping[playerId] || `Spieler ${index + 1}`;
    });
    return names;
  }, [playerNamesMapping]);

  return (
    <div className="bg-gray-800 text-white shadow-xl rounded-lg overflow-hidden w-full mx-auto my-4">
      <div className="p-3 bg-gray-750">
        <div className="flex justify-between items-center text-xs text-gray-400">
          <span>{tournamentGames.length > 0 ? `Letzte Passe: ${currentPasseIdNumber}` : 'Keine Passen gespielt'}</span>
          {currentPasse && <span>{currentDate}</span>}
        </div>
        <div className="mt-1 text-center">
          <h2 className="text-lg font-semibold text-white">Passenübersicht</h2>
        </div>
      </div>

      <div className="flex justify-between items-center px-2 py-1 bg-gray-750">
        <button 
          onClick={() => handleStatisticChange('left')} 
          className="p-1 text-gray-400 hover:text-white transition-colors rounded-md"
          aria-label="Vorherige Statistik"
          disabled={TOURNAMENT_STATISTIC_MODULES.length <= 1}
        >
          {'<'}
        </button>
        <span className="text-sm font-medium text-gray-300">
          {currentModuleDisplayName ?? 'Statistik'}
        </span>
        <button 
          onClick={() => handleStatisticChange('right')} 
          className="p-1 text-gray-400 hover:text-white transition-colors rounded-md"
          aria-label="Nächste Statistik"
          disabled={TOURNAMENT_STATISTIC_MODULES.length <= 1}
        >
          {'>'}
        </button>
      </div>

      <div {...swipeHandlers} className="overflow-hidden relative min-h-[200px]">
        {CurrentStatisticComponent && CurrentStatisticModule ? (
          <animated.div style={swipeAnimation} className="p-3">
            {CurrentStatisticModule.id === 'tournament_striche_rangliste' ? (
              <TournamentStricheStatistik 
                tournamentGames={tournamentGames} 
                playerNamesMapping={playerNamesMapping}
                strokeSettings={activeStrokeSettings}
              />
            ) : CurrentStatisticModule.id === 'tournament_runden' ? (
              <TournamentRoundHistoryDisplay 
                tournamentGames={tournamentGames} 
                playerNames={fallbackPlayerNamesForRoundHistory} 
                playerPhotoUrlMapping={playerPhotoUrlMapping}
                cardStyle={cardStyle}
              />
            ) : (
              <div>Unbekanntes Statistik-Modul.</div>
            )}
          </animated.div>
        ) : (
          <div className="p-3 text-center text-gray-500">Statistik-Modul nicht gefunden oder nicht konfiguriert.</div>
        )}
      </div>
    </div>
  );
};

export default TournamentGameViewerKreidetafel; 