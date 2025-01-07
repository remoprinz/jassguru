import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useGameStore } from '../../store/gameStore';
import { FiX, FiRotateCcw } from 'react-icons/fi';
import format from 'date-fns/format';
import type { UIStore } from '../../store/uiStore';
import type { GameStore } from '../../types/jass';
import { STATISTIC_MODULES } from '../../statistics/registry';
import { StricheStatistik } from '../../statistics/StricheStatistik';
import { JasspunkteStatistik } from '../../statistics/JasspunkteStatistik';
import { useJassStore } from '../../store/jassStore';
import { useSpring } from 'react-spring';
import { animated } from 'react-spring';
import html2canvas from 'html2canvas';
import { FaShare } from 'react-icons/fa';
import { useTimerStore } from '../../store/timerStore';
import { usePressableButton } from '../../hooks/usePressableButton';
import type { Html2CanvasOptions } from '../../types/jass';
import JassFinishNotification from '../notifications/JassFinishNotification';

type BlobCallback = (blob: Blob | null) => void;

const PlayerName: React.FC<{ 
  name: string, 
  isStarter: boolean 
}> = ({ name, isStarter }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayName, setDisplayName] = useState(name);

  useEffect(() => {
    const measureAndTruncate = () => {
      const container = containerRef.current;
      if (!container) return;

      // Temporäres Element für Messung
      const testDiv = document.createElement('div');
      testDiv.style.visibility = 'hidden';
      testDiv.style.position = 'absolute';
      testDiv.style.whiteSpace = 'nowrap';
      testDiv.className = container.className;
      testDiv.textContent = name + (isStarter ? " ❀" : "");
      document.body.appendChild(testDiv);

      const nameWidth = testDiv.offsetWidth;
      // Erweitern des verfügbaren Platzes um 25%
      const containerWidth = container.offsetWidth * 1.25;
      document.body.removeChild(testDiv);

      if (nameWidth > containerWidth) {
        let start = 0;
        let end = name.length;
        
        while (start < end) {
          const mid = Math.floor((start + end + 1) / 2);
          testDiv.textContent = name.slice(0, mid) + (isStarter ? "❀" : "");
          document.body.appendChild(testDiv);
          const width = testDiv.offsetWidth;
          document.body.removeChild(testDiv);
          
          // Auch hier den erweiterten Platz berücksichtigen
          if (width <= containerWidth) {
            start = mid;
          } else {
            end = mid - 1;
          }
        }
        
        setDisplayName(name.slice(0, start));
      } else {
        setDisplayName(name);
      }
    };

    measureAndTruncate();
    window.addEventListener('resize', measureAndTruncate);
    return () => window.removeEventListener('resize', measureAndTruncate);
  }, [name, isStarter]);

  return (
    <div ref={containerRef} className="text-center text-gray-400 px-1">
      <span className="inline-block">
        {displayName}
        {isStarter && <span>❀</span>}
      </span>
    </div>
  );
};

const ResultatKreidetafel = () => {
  // Touch-State
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [touchEnd, setTouchEnd] = React.useState<number | null>(null);
  const [swipeDirection, setSwipeDirection] = React.useState<'left' | 'right' | null>(null);

  // Atomare Store-Zugriffe
  const isOpen = useUIStore((state: UIStore) => state.resultatKreidetafel.isOpen);
  const swipePosition = useUIStore((state: UIStore) => state.resultatKreidetafel.swipePosition);
  const currentStatistic = useUIStore((state: UIStore) => state.resultatKreidetafel.currentStatistic);
  const closeResultatKreidetafel = useUIStore((state: UIStore) => state.closeResultatKreidetafel);

  // Game Store Zugriffe
  const playerNames = useGameStore((state: GameStore) => state.playerNames);
  const topScore = useGameStore((state: GameStore) => state.scores?.top ?? 0);
  const bottomScore = useGameStore((state: GameStore) => state.scores?.bottom ?? 0);
  const weisPoints = useGameStore((state: GameStore) => state.weisPoints);

  // Abgeleitete Werte
  const isFlipped = swipePosition === 'top';
  const currentDate = format(new Date(), 'd.M.yyyy');
  const currentModule = STATISTIC_MODULES.find(mod => mod.id === currentStatistic);

  // Store-Zugriffe
  const canNavigateBack = useJassStore(state => state.canNavigateBack());
  const canNavigateForward = useJassStore(state => state.canNavigateForward());

  // 1. Store-Zugriffe für aktuelle Striche
  const currentStriche = useGameStore(state => state.striche);

  // 2. Hilfsfunktion für Validierung - NUR aktuelles Spiel
  const canStartNewGame = useMemo(() => {
    // Prüfen ob im AKTUELLEN Spiel mindestens ein Sieg existiert
    return currentStriche.top.sieg > 0 || currentStriche.bottom.sieg > 0;
  }, [currentStriche]);

  // Button-Handler mit Store-Logik
  const handleBack = useCallback(() => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    
    if (jassStore.canNavigateBack()) {
      // 2. Zum vorherigen Spiel navigieren
      jassStore.navigateToPreviousGame();
      
      // 3. GameStore VOLLSTÄNDIG mit historischen Daten aktualisieren
      const previousGame = jassStore.getCurrentGame();
      if (previousGame) {
        // Erst alles zurücksetzen
        gameStore.resetGame();
        
        // Dann VOLLSTÄNDIGEN Spielzustand wiederherstellen
        useGameStore.setState(state => ({
          ...state,
          isGameStarted: true,
          currentRound: previousGame.currentRound || 1,
          currentPlayer: previousGame.currentPlayer,
          
          // Alle Punkte
          scores: {
            top: (previousGame.teams.top.jassPoints || 0) + (previousGame.teams.top.weisPoints || 0),
            bottom: (previousGame.teams.bottom.jassPoints || 0) + (previousGame.teams.bottom.weisPoints || 0)
          },
          weisPoints: {
            top: previousGame.teams.top.weisPoints,
            bottom: previousGame.teams.bottom.weisPoints
          },
          
          // Alle Striche
          striche: {
            top: { ...previousGame.teams.top.striche },
            bottom: { ...previousGame.teams.bottom.striche }
          },
          
          // Wichtig: Spielhistorie
          roundHistory: previousGame.roundHistory || [],
          
          // Spielstatus
          isGameCompleted: false,  // Wichtig: Auf false setzen damit weitergespielt werden kann!
          isRoundCompleted: false
        }));
      }
    }
  }, []);

  const handleNextGame = useCallback(() => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    
    if (jassStore.canNavigateForward()) {
      // A) Navigation zu existierendem Spiel - immer erlaubt
      jassStore.navigateToNextGame();
      
      const nextGame = jassStore.getCurrentGame();
      if (nextGame) {
        // Historische Daten laden
        gameStore.resetGame();
        useGameStore.setState(state => ({
          ...state,
          isGameStarted: true,
          currentRound: nextGame.currentRound || 1,
          currentPlayer: nextGame.currentPlayer,
          scores: {
            top: (nextGame.teams.top.jassPoints || 0) + (nextGame.teams.top.weisPoints || 0),
            bottom: (nextGame.teams.bottom.jassPoints || 0) + (nextGame.teams.bottom.weisPoints || 0)
          },
          weisPoints: {
            top: nextGame.teams.top.weisPoints,
            bottom: nextGame.teams.bottom.weisPoints
          },
          striche: {
            top: { ...nextGame.teams.top.striche },
            bottom: { ...nextGame.teams.bottom.striche }
          },
          roundHistory: nextGame.roundHistory || [],
          isGameCompleted: false,
          isRoundCompleted: false
        }));
      }
    } else {
      // B) Neues Spiel - nur mit Sieg im aktuellen Spiel erlaubt
      if (!canStartNewGame) {
        useUIStore.getState().showHistoryWarning({
          message: "Bitte erst bedanken, bevor ein neues Spiel gestartet wird.",
          onConfirm: () => {}, 
          onCancel: () => {}
        });
        return;
      }
      
      // 1. Erst aktuelles Spiel finalisieren
      jassStore.finalizeGame();
      
      // 2. Dann neues Spiel im jassStore erstellen
      jassStore.startGame();
      
      // 3. GameStore komplett zurücksetzen für neues Spiel
      gameStore.resetGame();
      
      // 4. Spielstatus richtig setzen
      useGameStore.setState(state => ({
        ...state,
        isGameStarted: true,
        currentRound: 1,
        isGameCompleted: false,
        isRoundCompleted: false
      }));
    }
  }, [canStartNewGame]);

  // Button Text
  const nextGameButtonText = canNavigateForward ? "1 Spiel\nvorwärts" : "Neues\nSpiel";

  // Store-Zugriffe hinzufügen
  const teams = useJassStore(state => state.teams);
  const games = useJassStore(state => state.games);
  const currentGameId = useJassStore(state => state.currentGameId);
  const currentTotals = useMemo(() => {
    const relevantGames = games.filter(game => game.id <= currentGameId);
    
    // Basis-Totale aus VORHERIGEN Spielen (nicht current!)
    const baseTotals = relevantGames
      .filter(game => game.id < currentGameId)
      .reduce((totals, game) => ({
        striche: {
          top: totals.striche.top + Object.values(game.teams.top.striche).reduce((sum, count) => sum + count, 0),
          bottom: totals.striche.bottom + Object.values(game.teams.bottom.striche).reduce((sum, count) => sum + count, 0)
        },
        punkte: {
          top: totals.punkte.top + game.teams.top.total,
          bottom: totals.punkte.bottom + game.teams.bottom.total
        }
      }), {
        striche: { top: 0, bottom: 0 },
        punkte: { top: 0, bottom: 0 }
      });

    // Nur aktuelle Striche und aktuelle Punkte hinzufügen
    return {
      striche: {
        top: baseTotals.striche.top + Object.values(currentStriche.top).reduce((sum, count) => sum + count, 0),
        bottom: baseTotals.striche.bottom + Object.values(currentStriche.bottom).reduce((sum, count) => sum + count, 0)
      },
      punkte: {
        top: baseTotals.punkte.top + topScore,
        bottom: baseTotals.punkte.bottom + bottomScore
      }
    };
  }, [currentGameId, games, currentStriche, topScore, bottomScore, weisPoints]);

  // Touch-Handler mit korrekter Typisierung
  const handleStatisticChange = React.useCallback((direction: 'left' | 'right') => {
    const currentIndex = STATISTIC_MODULES.findIndex(mod => mod.id === currentStatistic);
    const nextIndex = direction === 'right' 
      ? (currentIndex + 1) % STATISTIC_MODULES.length
      : (currentIndex - 1 + STATISTIC_MODULES.length) % STATISTIC_MODULES.length;

    useUIStore.setState(state => ({
      resultatKreidetafel: {
        ...state.resultatKreidetafel,
        currentStatistic: STATISTIC_MODULES[nextIndex].id
      }
    }));
  }, [currentStatistic]);

  // Touch-Event-Handler
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
    setSwipeDirection(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
    
    if (touchStart && e.targetTouches[0].clientX) {
      const distance = touchStart - e.targetTouches[0].clientX;
      if (Math.abs(distance) > 20) {
        setSwipeDirection(distance > 0 ? 'left' : 'right');
      }
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe || isRightSwipe) {
      handleStatisticChange(isLeftSwipe ? 'right' : 'left');
    }

    setTouchStart(null);
    setTouchEnd(null);
    setSwipeDirection(null);
  };

  // Vereinfachte Animation Props
  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? 1 : 0.95}) rotate(${isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  // Store-Zugriffe für Striche
  const topTotalStriche = useGameStore(state => state.getTotalStriche('top'));
  const bottomTotalStriche = useGameStore(state => state.getTotalStriche('bottom'));

  // Neue Share-Funktion
  const statistikContainerRef = useRef<HTMLDivElement>(null);

  const handleShareAndComplete = useCallback(async () => {
    try {
      // 1. Referenz auf den gesamten Kreidetafel-Content und den scrollbaren Container
      const kreidetafelContent = document.querySelector('.kreidetafel-content') as HTMLElement;
      const statistikContainer = statistikContainerRef.current;
      const buttonContainer = document.querySelector('.button-container') as HTMLElement;

      if (!kreidetafelContent || !statistikContainer || !buttonContainer) return;

      // 2. Originale Styles speichern
      const originalMaxHeight = statistikContainer.style.maxHeight;
      const originalOverflow = statistikContainer.style.overflowY;
      const originalButtonDisplay = buttonContainer.style.display;

      // 3. Container für Screenshot vorbereiten
      statistikContainer.style.maxHeight = 'none';
      statistikContainer.style.overflowY = 'visible';
      buttonContainer.style.display = 'none'; // Buttons ausblenden

      try {
        // 4. Screenshot mit angepassten Optionen
        const canvas = await html2canvas(kreidetafelContent, {
          background: '#1F2937',
          useCORS: true,
          logging: false,
          windowWidth: kreidetafelContent.scrollWidth,
          windowHeight: kreidetafelContent.scrollHeight,
          scale: 2
        } as any);

        // 5. Blob erstellen und teilen
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
        });

        if (navigator.share) {
          await navigator.share({
            files: [new File([blob], 'jass-resultat.png', { type: 'image/png' })],
            title: 'Jass Resultat',
            text: 'Jassergebnis von https://jassguru.web.app'
          });
        }
      } finally {
        // 6. Ursprüngliche Styles wiederherstellen
        statistikContainer.style.maxHeight = originalMaxHeight;
        statistikContainer.style.overflowY = originalOverflow;
        buttonContainer.style.display = originalButtonDisplay;
      }
    } catch (error) {
      console.error('Screenshot Fehler:', error);
    }
  }, []);

  const completeJass = useTimerStore(state => state.completeJass);

  const backButton = usePressableButton(handleBack);
  const shareButton = usePressableButton(handleShareAndComplete);
  const nextButton = usePressableButton(handleNextGame);

  // Notification State aus dem UIStore
  const isJassFinishOpen = useUIStore((state) => state.jassFinishNotification.isOpen);
  const showJassFinishNotification = useUIStore((state) => state.showJassFinishNotification);

  // Beenden-Handler anpassen
  const handleBeendenClick = () => {
    showJassFinishNotification();
  };

  // Scroll-Effekt für alle relevanten Änderungen
  useEffect(() => {
    if (statistikContainerRef.current && isOpen) {
      // Kleine Verzögerung für Animation
      setTimeout(() => {
        if (statistikContainerRef.current) {
          statistikContainerRef.current.scrollTop = statistikContainerRef.current.scrollHeight;
        }
      }, 50);
    }
  }, [isOpen, games.length, currentGameId]); // Abhängigkeit von currentGameId hinzugefügt

  // Swipe-Animation für den Statistik-Wechsel
  const swipeAnimation = useSpring({
    opacity: swipeDirection ? 0.7 : 1,
    transform: swipeDirection === 'left' 
      ? 'translateX(-10px)' 
      : swipeDirection === 'right' 
        ? 'translateX(10px)' 
        : 'translateX(0px)',
    config: { tension: 280, friction: 20 }
  });

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay mit Touch-Handlers */}
      <div 
        className="fixed inset-0 flex items-center justify-center z-50 bg-black/50"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeResultatKreidetafel();
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Animierter Wrapper für die gesamte Tafel */}
        <animated.div 
          style={springProps}
          className={`w-11/12 max-w-md ${
            swipeDirection === 'left' ? '-translate-x-4' : 
            swipeDirection === 'right' ? 'translate-x-4' : ''
          }`}
        >
          {/* Screenshot-Bereich */}
          <div 
            className="kreidetafel-content relative bg-gray-800 bg-opacity-95 rounded-t-xl p-6 shadow-lg select-none"
          >
            {/* Header */}
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                {currentModule?.title || 'Jassergebnis'}
              </h2>
              <p className="text-gray-400">{currentDate}</p>
            </div>

            {/* Dreh-Button */}
            <button
              onClick={() => useUIStore.setState(state => ({
                resultatKreidetafel: {
                  ...state.resultatKreidetafel,
                  swipePosition: isFlipped ? 'bottom' : 'top'
                }
              }))}
              className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
                text-white hover:text-gray-300 transition-all duration-1000
                w-24 h-24 flex items-center justify-center
                rounded-full
                ${isFlipped ? 'rotate-180' : 'rotate-0'}`}
              aria-label="Umdrehen"
            >
              <FiRotateCcw className="w-8 h-8" />
            </button>

            {/* Close Button */}
            <button 
              onClick={closeResultatKreidetafel}
              className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white"
            >
              <FiX size={24} />
            </button>

            {/* Teams Header - neue Spaltenbreiten */}
            <div className="grid grid-cols-[1fr_4fr_4fr] gap-4 mb-2">
              <div></div>
              <div className="text-center text-white">Team 1</div>
              <div className="text-center text-white">Team 2</div>
            </div>

            {/* Spielernamen mit manueller Kürzung und Blumensymbol */}
            <div className="grid grid-cols-[1fr_4fr_4fr] gap-4 mb-4">
              <div></div>
              <div className="grid grid-cols-2 gap-2">
                <PlayerName 
                  name={playerNames[1]} 
                  isStarter={games[0]?.initialStartingPlayer === 1} 
                />
                <PlayerName 
                  name={playerNames[3]} 
                  isStarter={games[0]?.initialStartingPlayer === 3} 
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PlayerName 
                  name={playerNames[2]} 
                  isStarter={games[0]?.initialStartingPlayer === 2} 
                />
                <PlayerName 
                  name={playerNames[4]} 
                  isStarter={games[0]?.initialStartingPlayer === 4} 
                />
              </div>
            </div>

            {/* Statistik-Container mit Scroll und Swipe-Animation */}
            <div className="border-t border-b border-gray-700">
              <div 
                ref={statistikContainerRef}
                className="max-h-[280px] overflow-y-auto"
              >
                <animated.div style={swipeAnimation} className="py-2">
                  {currentStatistic === 'striche' ? (
                    <StricheStatistik
                      teams={teams}
                      games={games}
                      currentGameId={currentGameId}
                      onSwipe={handleStatisticChange}
                    />
                  ) : (
                    <JasspunkteStatistik
                      teams={teams}
                      games={games}
                      currentGameId={currentGameId}
                      onSwipe={handleStatisticChange}
                    />
                  )}
                </animated.div>
              </div>
            </div>

            {/* Totals - vollständig unabhängige Positionierung */}
            <div className="grid grid-cols-[0.5fr_5fr_5fr] gap-4 mt-4">
              <div className="text-gray-400 text-center pr-4">Total:</div>
              <div className="flex justify-center -ml-[36px]">
                <div className="text-2xl font-bold text-white w-[100px] text-center">
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

            {/* Statistik Navigation Dots */}
            <div className="flex justify-center mt-4 mb-2">
              <div className="flex justify-center items-center space-x-2 bg-gray-700/50 px-1.5 py-1 rounded-full">
                {STATISTIC_MODULES.map(mod => (
                  <div
                    key={mod.id}
                    className={`w-2 h-2 rounded-full transition-all duration-200 ${
                      currentStatistic === mod.id 
                        ? 'bg-white/80 shadow-sm' 
                        : 'bg-gray-500/50'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Buttons im gleichen Rotationskontext */}
          <div className={`grid gap-4 p-4 bg-gray-800 bg-opacity-95 rounded-b-xl shadow-lg button-container ${
            canNavigateBack ? 'grid-cols-3' : 'grid-cols-2'
          }`}>
            {canNavigateBack && (
              <button 
                {...backButton.handlers}
                disabled={!canNavigateBack}
                className={`
                  py-2 px-4 text-white rounded-lg font-medium text-base
                  transition-all duration-150
                  ${canNavigateBack ? 'bg-gray-600' : 'bg-gray-500/50 cursor-not-allowed'}
                  hover:bg-gray-700
                  leading-tight
                  ${backButton.buttonClasses}
                `}
              >
                {["1 Spiel", "zurück"].map((line, i) => (
                  <React.Fragment key={i}>
                    {line}
                    {i === 0 && <br />}
                  </React.Fragment>
                ))}
              </button>
            )}

            <button 
              onClick={handleBeendenClick}
              className={`
                py-2 px-4 text-white rounded-lg font-medium text-base
                transition-all duration-150
                bg-yellow-600 hover:bg-yellow-700
                flex items-center justify-center gap-2
                leading-tight
                ${shareButton.buttonClasses}
              `}
            >
              {["Jass", "beenden"].map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i === 0 && <br />}
                </React.Fragment>
              ))}
            </button>

            <button 
              {...nextButton.handlers}
              className={`
                py-2 px-4 text-white rounded-lg font-medium text-base
                transition-all duration-150
                ${canNavigateForward 
                  ? 'bg-gray-600 hover:bg-gray-700' 
                  : 'bg-green-600 hover:bg-green-700'
                }
                leading-tight
                ${nextButton.buttonClasses}
              `}
            >
              {nextGameButtonText.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  {i === 0 && nextGameButtonText.includes('\n') && <br />}
                </React.Fragment>
              ))}
            </button>
          </div>
        </animated.div>
      </div>

      {/* JassFinishNotification einbinden */}
      <JassFinishNotification
        show={isJassFinishOpen}
        onShare={handleShareAndComplete}
        onBack={closeResultatKreidetafel}
      />
    </>
  );
};

export default ResultatKreidetafel;