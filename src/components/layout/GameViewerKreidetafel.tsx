"use client"; // Add use client directive for useState, useEffect, etc.

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import type { 
  GameEntry, 
  PlayerNames, 
  TeamScores, 
  StricheRecord, 
  CardStyle,
  PlayerNumber,
  StrokeSettings,
  TeamStand,
  CompletedGameSummary,
  ScoreSettings,
  JassSpruch // NEU: Spruch-Interface
} from '@/types/jass';
import { Timestamp, FieldValue, doc, updateDoc, serverTimestamp } from 'firebase/firestore'; // NEU: Firebase imports
import { db } from '@/services/firebaseInit'; // NEU: Firebase database
import { STATISTIC_MODULES } from '@/statistics/registry';
import { animated, useSpring } from 'react-spring';
import { useSwipeable } from 'react-swipeable';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings'; // Default fallback
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings'; // Default fallback
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { useScreenshot } from '@/hooks/useScreenshot'; // NEU: Importiere den Hook
import { useAuth } from '@/hooks/useAuth'; // NEU: Auth Hook
import { useUIStore } from '@/store/uiStore'; // NEU: UI Store
import { generateEnhancedJassSpruch } from '@/utils/sprueche/enhancedJasssprueche'; // NEU: Enhanced Spruch-Generator
import { FiShare2, FiLoader } from 'react-icons/fi'; // NEU: Importiere Icons
import { ArrowLeft } from 'lucide-react'; // 🚨 NEU: Icon für Zurück-Pfeil
import { Button } from '@/components/ui/button'; // 🚨 NEU: Der offizielle Button
import JassFinishNotification from '../notifications/JassFinishNotification'; // NEU: Spruch-Notification

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
    // NEU: Spruch-relevante Felder
    sessionId?: string; // SessionId für Spruch-Speicherung
    // jassSpruch entfernt - wird nicht mehr gespeichert
    // NEU: Gruppen-Statistiken für erweiterte Sprüche
    groupStats?: {
      groupName?: string;
      playerWithHighestMatschBilanz?: Array<{ playerName: string; value: number; eventsMade: number }>;
      playerWithHighestSchneiderBilanz?: Array<{ playerName: string; value: number; eventsMade: number }>;
      playerWithHighestStricheDiff?: Array<{ playerName: string; value: number }>;
      playerWithHighestWinRateSession?: Array<{ playerName: string; value: number }>;
      teamWithHighestMatschBilanz?: Array<{ names: string[]; value: number; eventsMade: number }>;
      avgGamesPerSession?: number;
      avgMatschPerGame?: number;
      sessionCount?: number;
    };
    // ✅ NEU: Session-Level Daten für Spruch-Generierung (separat von Games)
    sessionLevelData?: {
      eventCounts?: any;
      gameResults?: any[];
      gameWinsByTeam?: { top: number; bottom: number };
      gameWinsByPlayer?: any;
      gamesPlayed?: number;
      durationSeconds?: number;
      winnerTeamKey?: string;
      finalStriche?: { top: any; bottom: any }; // 🚨 KRITISCH: finalStriche hinzufügen!
      aggregatedTrumpfCountsByPlayer?: any;
      aggregatedRoundDurationsByPlayer?: any;
      sessionTotalWeisPoints?: any;
      totalRounds?: number;
    };
  };
  gameTypeLabel?: string; // NEU: Prop für das Label
  onBackClick?: () => void; // 🚨 NEU: Prop für den Zurück-Pfeil
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

const GameViewerKreidetafel: React.FC<GameViewerKreidetafelProps> = ({ gameData, gameTypeLabel = 'Spiel', onBackClick }) => {
  const [currentStatistic, setCurrentStatistic] = useState<string>(STATISTIC_MODULES[0]?.id ?? 'striche'); // Default to first module
  const { isSharing, handleShare } = useScreenshot(); // NEU: Hook verwenden
  const [activeTab, setActiveTab] = useState<'points' | 'chart'>('points');
  
  // NEU: Spruch-bezogene State-Variablen
  const [jassSpruch, setJassSpruch] = useState<JassSpruch | null | undefined>(undefined);
  const [isGeneratingSpruch, setIsGeneratingSpruch] = useState(false);
  const [hasShownAutoNotification, setHasShownAutoNotification] = useState(false);
  
  // NEU: Hooks für Spruch-Funktionalität
  const { user } = useAuth();
  const { showJassFinishNotification } = useUIStore();

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
  // KORREKTUR: Verwende die bewährte direkte Zugriffsmethode aus ResultatKreidetafel.tsx
  const initialStartingPlayer = useMemo(() => {
    if (gameData.games && gameData.games.length > 0) {
      return gameData.games[0]?.initialStartingPlayer ?? 1;
    }
    return 1; // Default fallback
  }, [gameData.games]);

  // NEU: Screenshot-Share aus JassFinishNotification
  const handleShareWithScreenshot = useCallback(async () => {
    const shareText = `${jassSpruch?.text || 'Jass-Ergebnis'}\n\ngeneriert von:\n👉 jassguru.ch`;
    const elementsToHide = ['#screenshot-hide-dots'];
    
    return handleShare(
      '#game-viewer-kreidetafel',
      '.scrollable-content',
      elementsToHide,
      shareText,
      'jass-session.png',
      true
    );
  }, [jassSpruch, handleShare]);

  // useEffect für Props-Änderungen entfernt - jassSpruch wird nicht mehr über Props geladen
  // useEffect(() => {
  //   console.log('[GameViewer] Props jassSpruch changed:', gameData.jassSpruch);
  //   if (gameData.jassSpruch !== undefined) {
  //     setJassSpruch(gameData.jassSpruch);
  //   }
  // }, [gameData.jassSpruch]);

  // Auto-Generierung bei Session-Load entfernt - Sprüche werden nur noch on-demand beim Teilen generiert
  // useEffect(() => {
  //   console.log('[GameViewer] Auto-generation check:', {
  //     jassSpruch,
  //     jassSpruchType: typeof jassSpruch,
  //     isGeneratingSpruch,
  //     userUid: user?.uid,
  //     sessionId: gameData.sessionId
  //   });  // NEU: useEffect für Spruch-Initialisierung aus Props

  //   const generateAndSaveSpruch = async () => {
  //     if (
  //       jassSpruch === null &&          // Explizit null = neue Session braucht Spruch
  //       !isGeneratingSpruch &&          // Keine doppelte Generierung
  //       user?.uid &&                    // User authenticated
  //       gameData.sessionId              // Session ID vorhanden
  //     ) {
  //       setIsGeneratingSpruch(true);
        
  //       try {
  //         console.log('[GameViewer] Generating new jassSpruch for session:', gameData.sessionId);
          
  //         // ✅ KORREKTUR: Spruch mit Session-Level Daten generieren (wenn vorhanden)
  //         const sessionLevelData = gameData.sessionLevelData;
  //         const gamesForSpruch = sessionLevelData ? 
  //           // Erstelle ein temporäres "angereichtertes" letztes Spiel für die Spruch-Generierung
  //           [...gameData.games.slice(0, -1), {
  //             ...gameData.games[gameData.games.length - 1],
  //             eventCounts: sessionLevelData.eventCounts,
  //             gameResults: sessionLevelData.gameResults,
  //             gameWinsByTeam: sessionLevelData.gameWinsByTeam,
  //             gameWinsByPlayer: sessionLevelData.gameWinsByPlayer,
  //             gamesPlayed: sessionLevelData.gamesPlayed,
  //             durationSeconds: sessionLevelData.durationSeconds,
  //             aggregatedTrumpfCountsByPlayer: sessionLevelData.aggregatedTrumpfCountsByPlayer,
  //             aggregatedRoundDurationsByPlayer: sessionLevelData.aggregatedRoundDurationsByPlayer,
  //             sessionTotalWeisPoints: sessionLevelData.sessionTotalWeisPoints,
  //             totalRounds: sessionLevelData.totalRounds
  //           } as any] : // Verwende 'as any' um TypeScript-Kompatibilität zu erzwingen
  //           gameData.games;

  //         // Spruch mit angereicherten Daten generieren
  //         const newSpruch = generateEnhancedJassSpruch({
  //           games: gamesForSpruch,
  //           playerNames: gameData.playerNames,
  //           currentTotals: currentTotals.striche,
  //           legacy: false,
  //           groupStats: gameData.groupStats // NEU: Gruppen-Statistiken übergeben
  //         });

  //         console.log('[GameViewer] Generated spruch:', newSpruch);

  //         // In Firebase speichern
  //         await updateDoc(doc(db, 'jassGameSummaries', gameData.sessionId), {
  //           jassSpruch: {
  //             ...newSpruch,
  //             generatedAt: serverTimestamp(),
  //             version: 'v2',
  //             generatedBy: user.uid,
  //           }
  //         });

  //         const savedSpruch: JassSpruch = {
  //           ...newSpruch,
  //           generatedAt: new Date() as any, // Temporärer Timestamp
  //           version: 'v2',
  //           generatedBy: user.uid,
  //         };

  //         setJassSpruch(savedSpruch);
  //         console.log('[GameViewer] Successfully generated and saved jassSpruch:', savedSpruch);
  //       } catch (error) {
  //         console.error('[GameViewer] Failed to generate jassSpruch:', error);
  //         // Fallback Spruch
  //         const fallbackSpruch: JassSpruch = {
  //           text: 'Was für ein spannender Jass!',
  //           icon: '🎯',
  //           generatedAt: new Date() as any,
  //           version: 'v2',
  //           generatedBy: user.uid,
  //         };
  //         setJassSpruch(fallbackSpruch);
  //       } finally {
  //         setIsGeneratingSpruch(false);
  //       }
  //     }
  //   };

  //   generateAndSaveSpruch();
  // }, [jassSpruch, user?.uid, gameData.sessionId, isGeneratingSpruch]); // KORRIGIERT: Weniger Dependencies

  // NEU: useEffect für Auto-Show Notification beim ersten Mal
  useEffect(() => {
    console.log('[GameViewer] Auto-show check:', {
      jassSpruch: !!jassSpruch,
      jassSpruchType: typeof jassSpruch,
      hasShownAutoNotification,
      generatedBy: jassSpruch?.generatedBy,
      userUid: user?.uid,
      isMatch: jassSpruch?.generatedBy === user?.uid,
      sessionId: gameData.sessionId
    });

    if (
      jassSpruch &&                     // Spruch vorhanden
      typeof jassSpruch === 'object' &&  // Kein undefined
      !hasShownAutoNotification         // Noch nicht gezeigt
    ) {
      // ERWEITERT: Auto-Show für alle Sprüche, nicht nur für den Generierer
      // Das macht Sinn, da der User das Ergebnis sehen möchte
      console.log('[GameViewer] Auto-showing JassFinishNotification for spruch');
      // WICHTIG: Direkte State-Update für korrekte Referenz-Übertragung
      useUIStore.setState(state => ({
        jassFinishNotification: {
          isOpen: true,
          mode: 'share' as const,
          message: jassSpruch,
          onShare: handleShareWithScreenshot,
          onRegenerate: onRegenerateClick, // Frische Referenz
          onBack: () => {},
          onBackLabel: 'Schliessen'
        }
      }));
      setHasShownAutoNotification(true);
    } else if (
      // FALLBACK: Wenn keine sessionId vorhanden (Legacy) und erster Aufruf
      !gameData.sessionId &&
      !hasShownAutoNotification &&
      gameData.games.length > 0
    ) {
      console.log('[GameViewer] Legacy session detected, no auto-notification (use share button)');
      // Für Legacy-Sessions zeigen wir keine Auto-Notification
      // User muss den Share-Button verwenden
      setHasShownAutoNotification(true); // Markiere als "gezeigt" um weitere Checks zu vermeiden
    }
  }, [jassSpruch, hasShownAutoNotification, user?.uid, gameData.sessionId, gameData.games.length]);

  // NEU: Spruch-Regenerierung für JassFinishNotification
  const onRegenerateClick = useCallback(async () => {
    console.log('[GameViewer] ✅ REGENERATE CALLBACK REACHED - generating fresh spruch');
    console.log('[GameViewer] gameData:', gameData);
    console.log('[GameViewer] user:', user?.uid);
    
    try {
      // ✅ KORREKTUR: Neuen Spruch mit Session-Level Daten generieren (gleiche Logik wie onShareClick)
      const sessionLevelData = gameData.sessionLevelData;
      const gamesForSpruch = sessionLevelData ? 
        // Erstelle ein temporäres "angereichtertes" letztes Spiel für die Spruch-Generierung
        [...gameData.games.slice(0, -1), {
          ...gameData.games[gameData.games.length - 1],
          eventCounts: sessionLevelData.eventCounts,
          gameResults: sessionLevelData.gameResults,
          gameWinsByTeam: sessionLevelData.gameWinsByTeam,
          gameWinsByPlayer: sessionLevelData.gameWinsByPlayer,
          gamesPlayed: sessionLevelData.gamesPlayed,
          durationSeconds: sessionLevelData.durationSeconds,
          finalStriche: sessionLevelData.finalStriche,        // 🚨 KRITISCH: finalStriche hinzufügen!
          winnerTeamKey: sessionLevelData.winnerTeamKey,       // 🚨 KRITISCH: winnerTeamKey hinzufügen!
          aggregatedTrumpfCountsByPlayer: sessionLevelData.aggregatedTrumpfCountsByPlayer,
          aggregatedRoundDurationsByPlayer: sessionLevelData.aggregatedRoundDurationsByPlayer,
          sessionTotalWeisPoints: sessionLevelData.sessionTotalWeisPoints,
          totalRounds: sessionLevelData.totalRounds
        } as any] : // Verwende 'as any' um TypeScript-Kompatibilität zu erzwingen
        gameData.games;

      // IMMER neuen Spruch generieren
      const baseSpruch = generateEnhancedJassSpruch({
        games: gamesForSpruch,
        playerNames: gameData.playerNames,
        currentTotals: currentTotals.striche,
        legacy: !gameData.sessionId, // Legacy wenn keine sessionId
        groupStats: gameData.groupStats
      });
      
      const freshSpruch: JassSpruch = {
        ...baseSpruch,
        generatedAt: new Date() as any,
        version: 'v2' as const,
        generatedBy: user?.uid || 'manual',
      };

      console.log('[GameViewer] Generated fresh spruch for regeneration:', freshSpruch);

      // Lokalen State aktualisieren für UI-Display
      setJassSpruch(freshSpruch);

      // JassFinishNotification mit neuem Spruch aktualisieren (OHNE sie zu schließen)
      // WICHTIG: Direkte State-Update für korrekte Referenz-Übertragung
      useUIStore.setState(state => ({
        jassFinishNotification: {
          isOpen: true,
          mode: 'share' as const,
          message: freshSpruch,
          onShare: handleShareWithScreenshot,
          onRegenerate: onRegenerateClick, // Frische Referenz
          onBack: () => {},
          onBackLabel: 'Abbrechen'
        }
      }));

    } catch (error) {
      console.error('[GameViewer] Failed to regenerate spruch:', error);
      
      // Bei Fehler: Fallback-Spruch anzeigen
      const fallbackSpruch: JassSpruch = {
        text: 'Was für ein spannender Jass!',
        icon: '🎯',
        generatedAt: new Date() as any,
        version: 'v2',
        generatedBy: user?.uid || 'fallback',
      };
      
      setJassSpruch(fallbackSpruch);
      
      // Fallback-Spruch anzeigen - Direkte State-Update für korrekte Referenz-Übertragung
      useUIStore.setState(state => ({
        jassFinishNotification: {
          isOpen: true,
          mode: 'share' as const,
          message: fallbackSpruch,
          onShare: handleShareWithScreenshot,
          onRegenerate: onRegenerateClick, // Frische Referenz
          onBack: () => {},
          onBackLabel: 'Abbrechen'
        }
      }));
    }
      }, [gameData.games, gameData.playerNames, currentTotals, gameData.sessionId, gameData.groupStats, user, handleShareWithScreenshot, setJassSpruch]);

  // NEU: Manuelles Teilen über Button - IMMER neuen Spruch generieren
  const onShareClick = useCallback(async () => {
    console.log('[GameViewer] Manual share clicked - generating fresh spruch');
    
    try {
      // ✅ KORREKTUR: IMMER neuen Spruch mit Session-Level Daten generieren
      const sessionLevelData = gameData.sessionLevelData;
      const gamesForSpruch = sessionLevelData ? 
        // Erstelle ein temporäres "angereichtertes" letztes Spiel für die Spruch-Generierung
        [...gameData.games.slice(0, -1), {
          ...gameData.games[gameData.games.length - 1],
          eventCounts: sessionLevelData.eventCounts,
          gameResults: sessionLevelData.gameResults,
          gameWinsByTeam: sessionLevelData.gameWinsByTeam,
          gameWinsByPlayer: sessionLevelData.gameWinsByPlayer,
          gamesPlayed: sessionLevelData.gamesPlayed,
          durationSeconds: sessionLevelData.durationSeconds,
          finalStriche: sessionLevelData.finalStriche,        // 🚨 KRITISCH: finalStriche hinzufügen!
          winnerTeamKey: sessionLevelData.winnerTeamKey,       // 🚨 KRITISCH: winnerTeamKey hinzufügen!
          aggregatedTrumpfCountsByPlayer: sessionLevelData.aggregatedTrumpfCountsByPlayer,
          aggregatedRoundDurationsByPlayer: sessionLevelData.aggregatedRoundDurationsByPlayer,
          sessionTotalWeisPoints: sessionLevelData.sessionTotalWeisPoints,
          totalRounds: sessionLevelData.totalRounds
        } as any] : // Verwende 'as any' um TypeScript-Kompatibilität zu erzwingen
        gameData.games;

      // IMMER neuen Spruch generieren (für Testing und Variation)
      const baseSpruch = generateEnhancedJassSpruch({
        games: gamesForSpruch,
        playerNames: gameData.playerNames,
        currentTotals: currentTotals.striche,
        legacy: !gameData.sessionId, // Legacy wenn keine sessionId
        groupStats: gameData.groupStats
      });
      
      const freshSpruch: JassSpruch = {
        ...baseSpruch,
        generatedAt: new Date() as any,
        version: 'v2' as const,
        generatedBy: user?.uid || 'manual',
      };

      console.log('[GameViewer] Generated fresh spruch:', freshSpruch);

      // Spruch NICHT mehr in Firebase speichern - nur fresh generieren und anzeigen
      // Firebase-Speicherung entfernt da Sprüche jetzt immer fresh generiert werden
      
      // Lokalen State aktualisieren für UI-Display
      setJassSpruch(freshSpruch);

      // Spruch anzeigen - Direkte State-Update für korrekte Referenz-Übertragung
      useUIStore.setState(state => ({
        jassFinishNotification: {
          isOpen: true,
          mode: 'share' as const,
          message: freshSpruch,
          onShare: handleShareWithScreenshot,
          onRegenerate: onRegenerateClick, // Frische Referenz
          onBack: () => {},
          onBackLabel: 'Abbrechen'
        }
      }));

    } catch (error) {
      console.error('[GameViewer] Failed to generate fresh spruch:', error);
      
      // Fallback: Direkte Screenshot-Teilung ohne Spruch
      const shareText = '\n\ngeneriert von:\n👉 jassguru.ch';
      const elementsToHide = ['#screenshot-hide-dots'];
      handleShare(
        '#game-viewer-kreidetafel',
        '.scrollable-content',
        elementsToHide,
        shareText,
        'jass-session.png',
        true
      );
    }
  }, [gameData.games, gameData.playerNames, currentTotals, gameData.sessionId, gameData.groupStats, user, handleShareWithScreenshot, handleShare, setJassSpruch]);

  return (
    <>
      {/* 1. Swipe-Handler am äußersten Div, h-full und touch-action-pan-x hinzufügen */}
      <div id="game-viewer-kreidetafel" {...swipeHandlers} className="relative flex flex-col bg-gradient-radial from-gray-800 to-gray-900 text-white p-4 md:p-6 max-w-md mx-auto h-full touch-action-pan-x pt-8">
      
      {/* 🚨 ZURÜCK-PFEIL: Exakt wie in [playerId].tsx */}
      {onBackClick && (
        <Button 
          variant="ghost" 
          className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
          aria-label="Zurück"
          onClick={onBackClick}
        >
          <ArrowLeft size={28} />
        </Button>
      )}

      {/* TEILEN-BUTTON: Auf derselben Höhe wie der Zurück-Pfeil */}
      <button 
        onClick={onShareClick}
        disabled={isSharing}
        className="absolute top-8 right-4 z-10 p-2 text-gray-300 hover:text-white transition-colors duration-200 rounded-full bg-gray-700/50 hover:bg-gray-600/70 disabled:opacity-50 disabled:cursor-wait"
        aria-label="Ergebnis teilen"
      >
        {isSharing ? (
          <FiLoader className="w-5 h-5 animate-spin" />
        ) : (
          <FiShare2 className="w-5 h-5" />
        )}
      </button>

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
      <div className="scrollable-content flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 touch-action-pan-y">
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
                // NEU: activeGameScores direkt aus dem letzten Spiel der History übergeben
                activeGameScores: ('finalScores' in currentGame && currentGame.finalScores) 
                                ? currentGame.finalScores 
                                : ('teams' in currentGame && currentGame.teams && 'total' in currentGame.teams.top && 'total' in currentGame.teams.bottom) // Typsicherheit hier hinzufügen
                                    ? { top: currentGame.teams.top.total, bottom: currentGame.teams.bottom.total }
                                    : { top: 0, bottom: 0 },
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
        <div id="screenshot-hide-totals" className="flex-shrink-0 pt-4 pb-8">
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
        <div id="screenshot-hide-dots" className="flex justify-center mt-4 mb-2 flex-shrink-0">
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
      
      {/* JassFinishNotification einbinden */}
      <JassFinishNotification />
    </>
  );
};

export default GameViewerKreidetafel; 