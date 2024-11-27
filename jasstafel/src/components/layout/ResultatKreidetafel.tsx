import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { animated, useSpring } from 'react-spring';
import { FiRotateCcw, FiX } from 'react-icons/fi';
import { useGameStore } from '../../store/gameStore';
import { useJassStore } from '../../store/jassStore';
import ResultatZeile from '../game/ResultatZeile';
import format from 'date-fns/format';
import { 
  convertToDisplayStriche
} from '../../types/jass';
import { StatisticId } from '../../types/statistikTypes';
import useSwipeAnimation from '../../components/animations/useSwipeAnimation';
import { usePressableButton } from '../../hooks/usePressableButton';
import { STATISTIC_MODULES } from '../../statistics/registry';
import { StricheStatistik } from '../../statistics/StricheStatistik';
import { JasspunkteStatistik } from '../../statistics/JasspunkteStatistik';
import { GameEntry, JassStore, GameStore, Teams, TeamStand } from '../../types/jass';

interface ResultatKreidetafelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Game Interface
interface Game {
  id: number;
  isFinalized: boolean;
  scores: {
    top: number;
    bottom: number;
  };
  teams: {
    top: TeamStand;
    bottom: TeamStand;
  };
  timestamp: number;
}

// Bestehende Interfaces
interface JassState extends JassStore {
  games: GameEntry[];
  currentGameId: number;
  teams: Teams;
  calculateTotalPoints: () => { top: number; bottom: number };
  calculateTotalJassPoints: () => { top: number; bottom: number };
}

interface GameState extends GameStore {
  topScore: number;
  bottomScore: number;
}

// Store-Selektoren mit korrekten Typen
const jassSelector = (state: JassStore) => ({
  games: state.games,
  currentGameId: state.currentGameId,
  teams: state.teams,
  calculateTotalPoints: state.calculateTotalPoints,
  calculateTotalJassPoints: state.calculateTotalJassPoints
});

const gameSelector = (state: GameStore) => ({
  topScore: state.topScore,
  bottomScore: state.bottomScore
});

// Hook mit korrekter Typisierung
const useGameData = () => {
  const jassState = useJassStore(jassSelector);
  const gameState = useGameStore(gameSelector);

  return useMemo(() => ({
    currentGame: jassState.games.find((game: GameEntry) => game.id === jassState.currentGameId),
    scores: {
      top: gameState.topScore,
      bottom: gameState.bottomScore
    }
  }), [jassState.currentGameId, gameState.topScore, gameState.bottomScore]);
};

const ResultatKreidetafel: React.FC<ResultatKreidetafelProps> = ({ isOpen, onClose }) => {
  // State Hooks
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentStatistic, setCurrentStatistic] = useState<StatisticId>('striche');
  const [displayTotals, setDisplayTotals] = useState({ top: 0, bottom: 0 });
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  
  // Refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  // Stable Referenzen für Store-Zugriffe
  const stableJassStore = useRef(useJassStore.getState());
  const stableGameStore = useRef(useGameStore.getState());
  
  // Store-Zugriffe mit useCallback
  const getJassState = useCallback(() => jassSelector(stableJassStore.current), []);
  const getGameState = useCallback(() => gameSelector(stableGameStore.current), []);

  // Memoized Werte für Performance
  const visibleGames = useMemo(() => {
    return getJassState().games.filter(game => game.id <= getJassState().currentGameId);
  }, [getJassState().games, getJassState().currentGameId]);

  const canNavigateBack = useMemo(() => {
    return getJassState().currentGameId > 1;
  }, [getJassState().currentGameId]);

  const canNavigateForward = useMemo(() => {
    return getJassState().currentGameId < getJassState().games.length;
  }, [getJassState().currentGameId, getJassState().games.length]);

  // Computed Values
  const showJassPoints = currentStatistic === 'jasspunkte';
  
  // Animations
  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? 1 : 0.95}) rotate(${isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });
  
  const tableAnimation = useSwipeAnimation({
    initialPosition: 0,
    maxOffset: 100,
    position: 'bottom'
  });

  // Effects
  useEffect(() => {
    if (getJassState().games.length === 0) {
      useJassStore.getState().startNewGame();
    }
  }, []);

  const totals = useMemo(() => {
    const jassState = getJassState();
    return showJassPoints ? 
      jassState.calculateTotalJassPoints() : 
      jassState.calculateTotalPoints();
  }, [showJassPoints, getJassState]);

  useEffect(() => {
    setDisplayTotals(totals);
  }, [totals]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (tableContainerRef.current) {
      const container = tableContainerRef.current;
      const height = container.scrollHeight;
      container.style.height = height + 'px';
      
      setTimeout(() => {
        container.style.height = 'auto';
      }, 300);
    }
  }, [showJassPoints]);

  // Effect für Store-Updates
  useEffect(() => {
    const unsubJass = useJassStore.subscribe(
      (state) => void (stableJassStore.current = state)
    );
    const unsubGame = useGameStore.subscribe(
      (state) => void (stableGameStore.current = state)
    );
    return () => {
      unsubJass();
      unsubGame();
    };
  }, []);

  // Event Handlers
  const handleBack = useCallback(() => {
    if (canNavigateBack) {
      useJassStore.getState().navigateToPreviousGame();
    }
  }, [canNavigateBack]);

  const handleNewGame = useCallback(() => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    
    // Validierung
    const hasPoints = gameStore.topScore > 0 || gameStore.bottomScore > 0;
    if (!hasPoints) {
      console.warn('Keine Punkte vorhanden');
      return;
    }

    if (jassStore.canNavigateForward()) {
      // Navigation zu einem existierenden Spiel
      jassStore.navigateToNextGame();
    } else {
      // Neues Spiel erstellen
      jassStore.finalizeGame();
      gameStore.resetGamePoints();
      gameStore.startNewGame();
      jassStore.startNewGame();
    }

    // Totals in beiden Fällen aktualisieren
    const totals = showJassPoints ? 
      jassStore.calculateTotalJassPoints() : 
      jassStore.calculateTotalPoints();
    setDisplayTotals(totals);
  }, [showJassPoints]);

  const backButton = usePressableButton(handleBack);
  const newGameButton = usePressableButton(handleNewGame);

  const handleSwipe = (direction: 'left' | 'right') => {
    const currentModule = STATISTIC_MODULES.find(mod => mod.id === currentStatistic);
    const currentIndex = STATISTIC_MODULES.findIndex(mod => mod.id === currentStatistic);
    const nextIndex = direction === 'left' ? 
      (currentIndex + 1) % STATISTIC_MODULES.length : 
      (currentIndex - 1 + STATISTIC_MODULES.length) % STATISTIC_MODULES.length;
    
    const nextModule = STATISTIC_MODULES[nextIndex];
    setCurrentStatistic(nextModule.id);
    
    tableAnimation.animateSwipe(direction);
    
    const totals = nextModule.calculateData(useJassStore.getState());
    setDisplayTotals(totals);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe || isRightSwipe) {
      handleSwipe(isLeftSwipe ? 'left' : 'right');
    }

    setTouchStart(null);
    setTouchEnd(null);
  };

  if (!isOpen) return null;

  const currentDate = format(new Date(), 'd.M.yyyy');
  const newGameButtonText = canNavigateForward ? "Nächstes Spiel" : "Neues Spiel";

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <animated.div 
        style={springProps}
        className="relative w-11/12 max-w-md bg-gray-800 bg-opacity-95 rounded-xl p-6 shadow-lg select-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header mit Animation */}
        <div className="text-center mb-4">
          <animated.div
            style={{
              opacity: tableAnimation.mainOpacity,
              transform: tableAnimation.y.to(y => `translateX(${y}px)`)
            }}
          >
            <h2 className="text-2xl font-bold text-white">
              {STATISTIC_MODULES.find(mod => mod.id === currentStatistic)?.title || 'Jassergebnis'}
            </h2>
          </animated.div>
          <p className="text-gray-400">{currentDate}</p>
        </div>

        {/* Dreh-Button */}
        <button
          onClick={() => setIsFlipped(!isFlipped)}
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
          onClick={onClose}
          className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white"
        >
          <FiX size={24} />
        </button>

        {/* Teams Header */}
        <div className="grid grid-cols-5 gap-4 mb-2">
          <div></div>
          <div className="text-center text-white col-span-2">Team 1 </div>
          <div className="text-center text-white col-span-2">Team 2 </div>
        </div>

        {/* Spielernamen */}
        <div className="grid grid-cols-5 gap-4 mb-4">
          <div></div>
          <div className="text-center text-gray-400">Spieler 1</div>
          <div className="text-center text-gray-400">Spieler 2</div>
          <div className="text-center text-gray-400">Spieler 3</div>
          <div className="text-center text-gray-400">Spieler 4</div>
        </div>

        {/* Statistik-Komponenten */}
        <div className="max-h-96 overflow-y-auto mb-4 border-t border-b border-gray-700">
          <div className="transition-[height] duration-300 ease-in-out">
            <animated.div 
              style={{
                opacity: tableAnimation.mainOpacity,
                transform: tableAnimation.y.to(y => `translateX(${y}px)`)
              }}
              className="text-white"
            >
              {getJassState().games.length > 0 ? (
                <div key={`stats-container-${currentStatistic}`}>
                  {currentStatistic === 'striche' ? (
                    <StricheStatistik
                      teams={getJassState().teams as Teams}
                      games={visibleGames}
                      currentGameId={getJassState().currentGameId}
                      onSwipe={handleSwipe}
                    />
                  ) : (
                    <JasspunkteStatistik
                      teams={getJassState().teams}
                      games={visibleGames}
                      currentGameId={getJassState().currentGameId}
                      onSwipe={handleSwipe}
                    />
                  )}
                </div>
              ) : (
                <ResultatZeile
                  key="initial-resultat"
                  spielNummer={1}
                  topTeam={{
                    striche: convertToDisplayStriche(getJassState().teams.top.striche),
                    jassPoints: 0
                  }}
                  bottomTeam={{
                    striche: convertToDisplayStriche(getJassState().teams.bottom.striche),
                    jassPoints: 0
                  }}
                  showJassPoints={currentStatistic === 'jasspunkte'}
                />
              )}
            </animated.div>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-5 gap-4 mb-2">
          <div className="text-gray-400 text-center">Total:</div>
          <animated.div className="col-span-4 grid grid-cols-2 gap-4"
            style={{
              opacity: tableAnimation.mainOpacity,
              transform: tableAnimation.y.to(y => `translateX(${y}px)`)
            }}
          >
            <div className="text-2xl font-bold text-white text-center">
              {displayTotals.bottom}
            </div>
            <div className="text-2xl font-bold text-white text-center">
              {displayTotals.top}
            </div>
          </animated.div>
        </div>

        {/* Statistik Dots */}
        <div className="flex justify-center my-6">
          <div className="flex justify-center items-center space-x-2 bg-gray-700/50 px-1.5 py-1 rounded-full">
            <div 
              className={
                currentStatistic === 'striche' 
                  ? "w-2 h-2 rounded-full bg-white/80 shadow-sm transition-all duration-200" 
                  : "w-2 h-2 rounded-full bg-gray-500/50 transition-all duration-200"
              }
            />
            <div 
              className={
                currentStatistic === 'jasspunkte' 
                  ? "w-2 h-2 rounded-full bg-white/80 shadow-sm transition-all duration-200" 
                  : "w-2 h-2 rounded-full bg-gray-500/50 transition-all duration-200"
              }
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4">
          <button 
            {...backButton.handlers}
            disabled={!canNavigateBack}
            className={`
              py-2 px-4 text-white rounded-xl font-bold
              transition-all duration-150
              ${canNavigateBack ? 'bg-gray-600 hover:bg-gray-700 border-gray-900' : 'bg-gray-500 cursor-not-allowed opacity-50'}
              border-b-4 border-t border-l border-r
              ${backButton.buttonClasses}
            `}
          >
            Zurück
          </button>
          <button 
            {...newGameButton.handlers}
            className={`
              py-2 px-4 text-white rounded-xl font-bold
              transition-all duration-150
              bg-green-600 hover:bg-green-700 border-green-900
              border-b-4 border-t border-l border-r
              ${newGameButton.buttonClasses}
            `}
          >
            {newGameButtonText}
          </button>
        </div>
      </animated.div>
    </div>
  );
};

export default ResultatKreidetafel;