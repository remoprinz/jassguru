"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import type { 
  PlayerNames, 
  StricheRecord,
  CardStyle,
  PlayerNumber,
  StrokeSettings,
  ScoreSettings
} from '@/types/jass';
import { Timestamp, FieldValue } from 'firebase/firestore'; 
import { animated, useSpring } from 'react-spring';
import { useSwipeable } from 'react-swipeable';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings'; 
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings'; 
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';

import type { TournamentGame } from '@/types/tournament';

import PlayerPasseStricheDetails from './PlayerPasseStricheDetails';
import { TournamentRoundHistoryDisplay } from '@/statistics/TournamentRoundHistoryDisplay';
import { BarChart2, ListChecks, User } from 'lucide-react'; 

const TOURNAMENT_PLAYER_STATISTIC_MODULES = [
  {
    id: 'player_passe_details',
    displayName: 'Passen-Details',
    component: TournamentRoundHistoryDisplay,
    icon: ListChecks,
  },
  {
    id: 'player_striche_history',
    displayName: 'Striche-Verlauf',
    component: PlayerPasseStricheDetails,
    icon: BarChart2,
  },
];

interface TournamentPlayerProgressViewProps {
  tournamentGames: TournamentGame[]; 
  playerUid: string;
  playerName: string;
  playerPhotoUrl?: string;
  strokeSettings?: StrokeSettings; 
  scoreSettings?: ScoreSettings; 
  cardStyle?: CardStyle; 
}

const TournamentPlayerProgressView: React.FC<TournamentPlayerProgressViewProps> = ({ 
  tournamentGames, 
  playerUid,
  playerName,
  playerPhotoUrl,
  strokeSettings, 
  scoreSettings, 
  cardStyle = DEFAULT_FARBE_SETTINGS.cardStyle 
}) => {
  const [currentStatisticId, setCurrentStatisticId] = useState<string>(TOURNAMENT_PLAYER_STATISTIC_MODULES[0]?.id);

  // Filtere Spiele, an denen der Spieler teilgenommen hat
  const playerGames = useMemo(() => {
    return tournamentGames.filter(game => 
      game.participantUidsForPasse?.includes(playerUid)
    );
  }, [tournamentGames, playerUid]);

  const currentPasse = useMemo(() => playerGames.length > 0 ? playerGames[playerGames.length - 1] : null, [playerGames]);
  
  const currentPasseIdNumber = useMemo(() => {
     if (currentPasse && typeof currentPasse.passeNumber === 'number') {
       return currentPasse.passeNumber;
     }
     return playerGames.length; 
   }, [currentPasse, playerGames.length]);

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
    const currentIndex = TOURNAMENT_PLAYER_STATISTIC_MODULES.findIndex(mod => mod.id === currentStatisticId);
    let nextIndex;
    if (direction === 'right') {
        nextIndex = (currentIndex + 1) % TOURNAMENT_PLAYER_STATISTIC_MODULES.length;
    } else { 
        nextIndex = (currentIndex - 1 + TOURNAMENT_PLAYER_STATISTIC_MODULES.length) % TOURNAMENT_PLAYER_STATISTIC_MODULES.length;
    }
    setCurrentStatisticId(TOURNAMENT_PLAYER_STATISTIC_MODULES[nextIndex].id);
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

  const CurrentStatisticModule = TOURNAMENT_PLAYER_STATISTIC_MODULES.find(mod => mod.id === currentStatisticId);
  const CurrentStatisticComponent = CurrentStatisticModule?.component;
  const currentModuleDisplayName = CurrentStatisticModule?.displayName;

  // Erzeugt PlayerNames für die Rundenhistorie der aktuellen Passe des Spielers
  const playerNamesForCurrentPasseRoundHistory: PlayerNames | null = useMemo(() => {
    if (!currentPasse || !currentPasse.playerDetails) return null;
    const names: Partial<PlayerNames> = {};
    currentPasse.playerDetails.forEach(detail => {
      if (detail.seat && detail.playerName) {
        names[detail.seat] = detail.playerName;
      }
    });
    // Sicherstellen, dass alle 4 Positionen besetzt sind, ggf. mit Fallback
    for (let i = 1; i <= 4; i++) {
      if (!names[i as PlayerNumber]) {
        names[i as PlayerNumber] = `Spieler ${i}`;
      }
    }
    return names as PlayerNames;
  }, [currentPasse]);

  return (
    <div className="bg-gray-800 text-white shadow-xl rounded-lg overflow-hidden w-full mx-auto my-4">
      <div className="p-3 bg-gray-750">
        <div className="flex justify-between items-center text-xs text-gray-400">
          <span>{playerGames.length > 0 ? `${playerGames.length} ${playerGames.length === 1 ? 'Passe' : 'Passen'} gespielt` : 'Keine Passen gespielt'}</span>
          {currentPasse && <span>Letzte am: {currentDate}</span>}
        </div>
        <div className="mt-1 text-center">
          <h2 className="text-lg font-semibold text-white flex items-center justify-center">
            <User size={20} className="mr-2 text-purple-400"/> Passenübersicht für {playerName}
          </h2>
        </div>
      </div>

      <div className="flex justify-between items-center px-2 py-1 bg-gray-750">
        <button 
          onClick={() => handleStatisticChange('left')} 
          className="p-1 text-gray-400 hover:text-white transition-colors rounded-md"
          aria-label="Vorherige Statistik"
          disabled={TOURNAMENT_PLAYER_STATISTIC_MODULES.length <= 1}
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
          disabled={TOURNAMENT_PLAYER_STATISTIC_MODULES.length <= 1}
        >
          {'>'}
        </button>
      </div>

      <div {...swipeHandlers} className="overflow-hidden relative min-h-[200px]">
        {CurrentStatisticComponent && CurrentStatisticModule && playerGames.length > 0 ? (
          <animated.div style={swipeAnimation} className="p-3">
            {CurrentStatisticModule.id === 'player_striche_history' ? (
              <PlayerPasseStricheDetails 
                playerGames={playerGames} 
                playerUid={playerUid}
                playerName={playerName}
                strokeSettings={activeStrokeSettings}
              />
            ) : CurrentStatisticModule.id === 'player_passe_details' && playerNamesForCurrentPasseRoundHistory ? (
              <TournamentRoundHistoryDisplay 
                tournamentGames={playerGames} 
                playerNames={playerNamesForCurrentPasseRoundHistory} 
                playerPhotoUrlMapping={playerPhotoUrl ? {[playerUid]: playerPhotoUrl} : {}}
                cardStyle={cardStyle}
                focusedPlayerId={playerUid} 
              />
            ) : (
              <div className="p-3 text-center text-gray-500">Statistik-Modul nicht anwendbar oder Daten fehlen.</div>
            )}
          </animated.div>
        ) : playerGames.length === 0 ? (
            <div className="p-3 text-center text-gray-500">Dieser Spieler hat noch an keiner Passe teilgenommen.</div>
        ) : (
          <div className="p-3 text-center text-gray-500">Statistik-Modul nicht gefunden oder nicht konfiguriert.</div>
        )}
      </div>
    </div>
  );
};

export default TournamentPlayerProgressView; 