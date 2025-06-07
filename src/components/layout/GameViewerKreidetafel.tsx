"use client"; // Add use client directive for useState, useEffect, etc.

import React, { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import type { 
  GameEntry, 
  PlayerNames, 
  TeamScores, 
  StricheRecord, 
  JassColor,
  CardStyle,
  TeamPosition,
  PlayerNumber,
  StrokeSettings,
  TeamStand,
  CompletedGameSummary,
  ScoreSettings
} from '@/types/jass';
import { Timestamp, FieldValue } from 'firebase/firestore'; // Import Timestamp and FieldValue
import { STATISTIC_MODULES } from '@/statistics/registry';
import { animated, useSpring } from 'react-spring';
import { useSwipeable } from 'react-swipeable';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings'; // Default fallback
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings'; // Default fallback
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { getNormalStricheCount } from '@/utils/stricheCalculations';

// Props Interface mirroring viewerData structure from [gameId].tsx
export interface GameViewerKreidetafelProps {
  gameData: { // Renamed from viewerData for clarity within this component
    games: Array<GameEntry | CompletedGameSummary>;
    playerNames: PlayerNames;
    currentScores: TeamScores;
    currentStriche: {
      top: StricheRecord;
      bottom: StricheRecord;
    };
    weisPoints: TeamScores;
    // Add other necessary fields if statistics components need them
    cardStyle?: CardStyle; // Make optional or provide default
    strokeSettings?: StrokeSettings; // Make optional or provide default
    scoreSettings?: ScoreSettings; // NEU: Benötigt für korrekte Strich-Total-Berechnung
    startedAt?: number | Timestamp | FieldValue;
  };
  gameTypeLabel?: string; // NEU: Prop für das Label
}

// Reusable PlayerName Component (copied from ResultatKreidetafel for now)
const PlayerNameDisplay: React.FC<{ name: string, isStarter: boolean }> = ({ name, isStarter }) => (
  <div className="text-center text-gray-400 px-1 overflow-hidden text-ellipsis whitespace-nowrap">
    <span className="inline-block">
      {name}
      {isStarter && <span>❀</span>}
    </span>
  </div>
);

const GameViewerKreidetafel: React.FC<GameViewerKreidetafelProps> = ({ gameData, gameTypeLabel = 'Spiel' }) => {
  const [currentStatistic, setCurrentStatistic] = useState<string>(STATISTIC_MODULES[0]?.id ?? 'striche'); // Default to first module

  // Determine current game being viewed (assuming the last game in the array is the most current)
  // In a multi-game session context, this might need adjustment based on viewerData structure.
  const currentGame = useMemo(() => gameData.games[gameData.games.length - 1], [gameData.games]);
  // Use gameNumber as the consistent identifier if available, fallback to id, ensure number type
  const currentGameIdNumber = useMemo(() => {
     if (currentGame && 'gameNumber' in currentGame && typeof currentGame.gameNumber === 'number') {
       return currentGame.gameNumber;
     } 
     // Fallback if gameNumber is missing or not a number
     return 1; 
   }, [currentGame]);

  // Handle different timestamp fields
  const currentDate = useMemo(() => {
    // Hilfsfunktion zum Parsen verschiedener Timestamp-Formate
    const parseTimestamp = (timestamp: any): number => {
        if (!timestamp) return Date.now();
        if (timestamp instanceof Timestamp) {
            return timestamp.toMillis();
        }
        if (typeof timestamp.toDate === 'function') { // Kompatibilität mit älteren Firebase-Versionen
            return timestamp.toDate().getTime();
        }
        if (typeof timestamp === 'object' && 'seconds' in timestamp && 'nanoseconds' in timestamp) {
            return new Timestamp(timestamp.seconds, timestamp.nanoseconds).toMillis();
        }
        if (typeof timestamp === 'number') {
            return timestamp;
        }
        return Date.now(); // Fallback
    };

    let ts: number | Timestamp | FieldValue | undefined;

    // Priorisiere das Startdatum der Session, wenn vorhanden
    if (gameData.startedAt) {
      ts = gameData.startedAt;
    } else if (currentGame && 'timestamp' in currentGame) {
      // Fallback: Startzeit des aktuellen Spiels
      ts = currentGame.timestamp; 
    } else if (currentGame && 'timestampCompleted' in currentGame) {
      // Fallback: Endzeit des aktuellen Spiels
      ts = currentGame.timestampCompleted; 
    }
    
    const dateSource = parseTimestamp(ts);
    return format(new Date(dateSource), 'd.M.yyyy');
  }, [currentGame, gameData.startedAt]);

  // Use settings from props or fallback to defaults
  const activeStrokeSettings = gameData.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
  const activeCardStyle = gameData.cardStyle ?? DEFAULT_FARBE_SETTINGS.cardStyle; // Default card style
  const activeScoreSettings = gameData.scoreSettings ?? DEFAULT_SCORE_SETTINGS;

  // Calculate totals based on ALL games provided in viewerData.games
  // This logic assumes viewerData.games contains the full history needed for totals.
  const currentTotals = useMemo(() => {
    
    // Funktion zur Berechnung des Strich-Werts eines Spiels (adaptiert von ResultatKreidetafel)
    const calculateStricheValue = (striche: StricheRecord, strokeSettings: StrokeSettings, scoreSettingsEnabled: { berg: boolean, schneider: boolean }): number => {
      let totalValue = 0;
      // Addiere nur die Striche, die auch aktiviert sind und zählen
      if (scoreSettingsEnabled.berg && typeof striche.berg === 'number') {
        totalValue += striche.berg; // Wert für Berg
      }
      // Sieg direkt addieren
      if (typeof striche.sieg === 'number') {
          totalValue += striche.sieg;
      }
      // Schneider-Wert direkt übernehmen
      if (scoreSettingsEnabled.schneider && typeof striche.schneider === 'number') {
        totalValue += striche.schneider; 
      }
      // Matsch zählt einfach
      if (typeof striche.matsch === 'number') {
          totalValue += striche.matsch;
      }
      // Kontermatsch-Wert DIREKT übernehmen, da er bereits multipliziert ist
      if (typeof striche.kontermatsch === 'number') {
          totalValue += striche.kontermatsch; // KORREKTUR: Keine erneute Multiplikation
      }
      return totalValue;
    };

    return gameData.games
      .reduce((totals, game) => {
        let gameStricheTop: StricheRecord | null = null;
        let gameStricheBottom: StricheRecord | null = null;
        let gamePunkteTop = 0;
        let gamePunkteBottom = 0;

        // Type Guard to check which type 'game' is - verbessert für TypeScript
        if ('teams' in game && game.teams) { 
          // Es ist ein GameEntry mit teams-Property
          const gameEntry = game as GameEntry;
          if (gameEntry.teams.top && gameEntry.teams.bottom) {
            gameStricheTop = gameEntry.teams.top.striche;
            gameStricheBottom = gameEntry.teams.bottom.striche;
            // KORREKTUR: Punkte aus Jass- und Weispunkten berechnen
            gamePunkteTop = (gameEntry.teams.top.jassPoints ?? 0) + (gameEntry.teams.top.weisPoints ?? 0);
            gamePunkteBottom = (gameEntry.teams.bottom.jassPoints ?? 0) + (gameEntry.teams.bottom.weisPoints ?? 0);
          }
        } else if ('finalStriche' in game && game.finalStriche) {
          // Es ist ein CompletedGameSummary
          const completedGame = game as CompletedGameSummary;
          gameStricheTop = completedGame.finalStriche?.top ?? null;
          gameStricheBottom = completedGame.finalStriche?.bottom ?? null;
          gamePunkteTop = completedGame.finalScores?.top ?? 0;
          gamePunkteBottom = completedGame.finalScores?.bottom ?? 0;
        }

        // Berechne Strich-Werte für dieses Spiel
        const gameStricheTopValue = gameStricheTop ? calculateStricheValue(gameStricheTop, activeStrokeSettings, activeScoreSettings.enabled) : 0;
        const gameStricheBottomValue = gameStricheBottom ? calculateStricheValue(gameStricheBottom, activeStrokeSettings, activeScoreSettings.enabled) : 0;

        return {
          striche: {
            top: totals.striche.top + gameStricheTopValue,
            bottom: totals.striche.bottom + gameStricheBottomValue
          },
          punkte: {
            top: totals.punkte.top + gamePunkteTop,
            bottom: totals.punkte.bottom + gamePunkteBottom
          }
        };
      }, { striche: { top: 0, bottom: 0 }, punkte: { top: 0, bottom: 0 } });
  }, [gameData.games, activeStrokeSettings, activeScoreSettings]); // Abhängigkeiten hinzugefügt

  // --- NEU: Konstruiere das 'teams' Objekt für StatisticProps --- 
  const constructedTeamsProp = useMemo(() => {
    // Funktion zum Erstellen eines initialen PlayerStats Objekts
    const createInitialPlayerStats = (): Record<PlayerNumber, { striche: number; points: number; weisPoints: number; }> => ({
      1: { striche: 0, points: 0, weisPoints: 0 },
      2: { striche: 0, points: 0, weisPoints: 0 },
      3: { striche: 0, points: 0, weisPoints: 0 },
      4: { striche: 0, points: 0, weisPoints: 0 },
    });
  
    // Funktion zum Erstellen eines TeamStand Objekts
    const createTeamStand = (position: 'top' | 'bottom'): TeamStand => {
      // Finde das letzte Spiel in der History
      const lastGame = gameData.games.length > 0 ? gameData.games[gameData.games.length - 1] : null;
      let stricheRecord: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
      let totalScore = 0;
      let weisPoints = 0;

      if (lastGame) {
        if ('teams' in lastGame && lastGame.teams) {
          // Es ist ein GameEntry
          const gameEntry = lastGame as GameEntry;
          if (gameEntry.teams[position]) {
            stricheRecord = gameEntry.teams[position].striche;
            totalScore = (gameEntry.teams[position].jassPoints ?? 0) + (gameEntry.teams[position].weisPoints ?? 0);
            weisPoints = gameEntry.teams[position].weisPoints ?? 0;
          }
        } else if ('finalStriche' in lastGame && lastGame.finalStriche && lastGame.finalScores) {
          // Es ist ein CompletedGameSummary
          const completedGame = lastGame as CompletedGameSummary;
          stricheRecord = completedGame.finalStriche?.[position] ?? { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };
          totalScore = completedGame.finalScores?.[position] ?? 0;
          weisPoints = completedGame.weisPoints?.[position] ?? 0;
        }
      }

      return {
        striche: stricheRecord,
        jassPoints: totalScore - weisPoints,
        weisPoints: weisPoints,
        total: totalScore,
        bergActive: false, // Default für Viewer
        bedankenActive: false, // Default für Viewer
        isSigned: false, // Default für Viewer
        playerStats: createInitialPlayerStats(), // Default für Viewer
      };
    };
  
    return {
      top: createTeamStand('top'),
      bottom: createTeamStand('bottom'),
    };
  }, [gameData.games]); // Hängt nur von den Spielen ab
  // --- ENDE Konstruktion ---

  const handleStatisticChange = useCallback((direction: 'left' | 'right') => {
    const currentIndex = STATISTIC_MODULES.findIndex(mod => mod.id === currentStatistic);
    let nextIndex;
    if (direction === 'right') {
        nextIndex = (currentIndex + 1) % STATISTIC_MODULES.length;
    } else { // direction === 'left'
        nextIndex = (currentIndex - 1 + STATISTIC_MODULES.length) % STATISTIC_MODULES.length;
    }
    setCurrentStatistic(STATISTIC_MODULES[nextIndex].id);
  }, [currentStatistic]);

  // Swipe handlers (keep passive: false)
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => handleStatisticChange('right'),
    onSwipedRight: () => handleStatisticChange('left'),
    preventScrollOnSwipe: true,
    trackMouse: true,
    touchEventOptions: { passive: false } 
  });

  // Animation for statistic change
  const swipeAnimation = useSpring({
    from: { opacity: 0, transform: 'translateX(20px)' },
    to: { opacity: 1, transform: 'translateX(0px)' },
    key: currentStatistic, // Re-run animation when statistic changes
    config: { tension: 280, friction: 25 }
  });

  const currentModule = STATISTIC_MODULES.find(mod => mod.id === currentStatistic);

  // Get initial starting player from the first game in the history
  const initialStartingPlayer = useMemo(() => {
    const firstGame = gameData.games[0];
    if (firstGame) {
      // Priorisiere initialStartingPlayer, falls vorhanden (auf beiden Typen möglich)
      if ('initialStartingPlayer' in firstGame && typeof (firstGame as any).initialStartingPlayer === 'number') {
        return (firstGame as any).initialStartingPlayer;
      }
      // Fallback auf startingPlayer, explizit für CompletedGameSummary prüfen
      if ('startingPlayer' in firstGame && typeof (firstGame as any).startingPlayer === 'number') {
        // Hier wissen wir, es könnte ein CompletedGameSummary sein, oder ein GameEntry, das unerwartet startingPlayer hat.
        // Da CompletedGameSummary startingPlayer hat, ist der Zugriff hier sicherer, wenn der Guard greift.
        return (firstGame as CompletedGameSummary).startingPlayer;
      }
    }
    return 1; // Default fallback
  }, [gameData.games]);

  return (
    // 1. Swipe-Handler am äußersten Div, h-full und touch-action-pan-x hinzufügen
    <div {...swipeHandlers} className="flex flex-col bg-gradient-radial from-gray-800 to-gray-900 text-white p-4 md:p-6 max-w-md mx-auto h-full touch-action-pan-x">
      
      {/* Header Section (flex-shrink-0) */}
      <div className="text-center mb-4 flex-shrink-0">
        <h2 className="text-2xl font-bold text-white">
          {currentModule?.title || 'Jassergebnis'}
        </h2>
        <p className="text-gray-400">{currentDate}</p>
      </div>

      {/* Teams Header & Player Names Section (flex-shrink-0) */}
      <div className="mb-4 flex-shrink-0">
        <div className="grid grid-cols-[1fr_4fr_4fr] gap-4 mb-2">
          <div></div> {/* Spacer */}
          <div className="text-center text-white font-semibold">Team 1</div>
          <div className="text-center text-white font-semibold">Team 2</div>
        </div>
        <div className="grid grid-cols-[1fr_4fr_4fr] gap-4">
          <div></div> {/* Spacer */}
          <div className="grid grid-cols-2 gap-1">
            <PlayerNameDisplay 
              name={gameData.playerNames[1] ?? 'Spieler 1'} 
              isStarter={initialStartingPlayer === 1} 
            />
            <PlayerNameDisplay 
              name={gameData.playerNames[3] ?? 'Spieler 3'} 
              isStarter={initialStartingPlayer === 3} 
            />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <PlayerNameDisplay 
              name={gameData.playerNames[2] ?? 'Spieler 2'} 
              isStarter={initialStartingPlayer === 2} 
            />
            <PlayerNameDisplay 
              name={gameData.playerNames[4] ?? 'Spieler 4'} 
              isStarter={initialStartingPlayer === 4} 
            />
          </div>
        </div>
      </div>

      {/* --- Mittlerer Bereich: Scrollbar, flex-grow und touch-action-pan-y --- */}
      <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 touch-action-pan-y">
        {/* Container mit Border */}
        <div className="border-t border-b border-gray-700">
          {/* 3. Swipe-Handler hier ENTFERNEN */}
          <div className="py-2 px-1">
            {/* Animierter Div */} 
            <animated.div
              style={swipeAnimation}
            >
              {currentModule && React.createElement(currentModule.component, {
                // Pass necessary props derived from gameData
                games: gameData.games,
                teams: constructedTeamsProp,
                playerNames: gameData.playerNames,
                cardStyle: activeCardStyle,
                strokeSettings: activeStrokeSettings,
                scoreSettings: activeScoreSettings, // Pass score settings
                currentGameId: currentGame?.gameNumber ?? 0, // KORREKTUR: Fallback für undefined
                onSwipe: handleStatisticChange, // Pass the swipe handler
                gameTypeLabel: gameTypeLabel, // Pass das Label weiter
              })}
            </animated.div>
          </div>
        </div>
      </div>
      {/* --- ENDE: Mittlerer scrollbarer Bereich --- */}

      {/* --- Totals Section --- (flex-shrink-0) */}
        <div className="flex-shrink-0 pt-4">
          <div className="grid grid-cols-[1fr_4fr_4fr] gap-4">
            <div className="text-gray-400 text-center pr-4">Total:</div>
            <div className="flex justify-center -ml-[30px]">
              <div className="text-2xl font-bold text-white w-[100px] text-center">
                {/* Entscheide basierend auf dem aktuellen Modul, was angezeigt wird (optional, da RoundHistory hier kein Total mehr hat) */}
                {currentStatistic === 'striche'
                  ? currentTotals.striche.bottom
                  : currentTotals.punkte.bottom}
              </div>
            </div>
            <div className="flex justify-center -ml-[12px]">
              <div className="text-2xl font-bold text-white w-[100px] text-center">
                {currentStatistic === 'striche'
                  ? currentTotals.striche.top
                  : currentTotals.punkte.top}
              </div>
            </div>
          </div>
        </div>

      {/* --- Pagination Dots --- (flex-shrink-0) */}
        <div className="flex justify-center mt-4 mb-2 flex-shrink-0">
          <div className="flex justify-center items-center space-x-2 bg-gray-700/50 px-1.5 py-1 rounded-full">
            {STATISTIC_MODULES.map(mod => (
              <div
                key={mod.id}
                onClick={() => setCurrentStatistic(mod.id)} // Allow clicking dots
                className={`w-2.5 h-2.5 rounded-full transition-all duration-200 cursor-pointer ${
                  currentStatistic === mod.id
                    ? 'bg-white shadow-sm'
                    : 'bg-gray-500 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
        </div>
    </div>
  );
};

export default GameViewerKreidetafel; 