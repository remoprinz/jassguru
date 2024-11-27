import React, { useState, useEffect } from 'react';
import { animated, useSpring } from 'react-spring';
import { FiRotateCcw, FiX } from 'react-icons/fi';
import { useGameStore } from '../../store/gameStore';
import { useJassStore } from '../../store/jassStore';
import { formatDuration } from '../../utils/timeUtils';
import MultiplierCalculator from './MultiplierCalculator';
import { useChargeButton } from '../../hooks/useChargeButton';
import { ChargeButton } from '../ui/ChargeButton';

interface GameInfoOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const GameInfoOverlay: React.FC<GameInfoOverlayProps> = ({ isOpen, onClose }) => {
  const { 
    currentRound,
    currentPlayer,
    gameStartTime,
    roundStartTime,
    isCalculatorFlipped,
    setCalculatorFlipped,
    isPaused,
    pauseGame,
    resumeGame,
    getRemainingPoints,
    currentMultiplier,
    getDividedPoints,
    lastDoubleClickPosition
  } = useGameStore();

  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isPressedDown, setIsPressedDown] = useState(false);
  const [showDepth, setShowDepth] = useState(false);
  const [gameTime, setGameTime] = useState('');
  const [roundTime, setRoundTime] = useState('');

  const { 
    startBergCharge,
    stopBergCharge,
    startBedankenCharge,
    stopBedankenCharge,
    bergChargeAmount,
    bedankenChargeAmount,
    hasBergForTeam,
    hasBedankenForTeam
  } = useJassStore();

  const bergButton = useChargeButton({
    type: 'berg',
    onStart: () => startBergCharge(lastDoubleClickPosition!),
    onStop: () => stopBergCharge(lastDoubleClickPosition!),
    chargeAmount: bergChargeAmount,
    team: lastDoubleClickPosition
  });

  const bedankenButton = useChargeButton({
    type: 'bedanken',
    onStart: () => startBedankenCharge(lastDoubleClickPosition!),
    onStop: () => {
      stopBedankenCharge(lastDoubleClickPosition!);
      pauseGame();
    },
    chargeAmount: bedankenChargeAmount,
    condition: lastDoubleClickPosition ? hasBergForTeam(lastDoubleClickPosition) : false,
    team: lastDoubleClickPosition
  });

  const handleClose = () => {
    if (isPaused) {
      resumeGame();
    }
    onClose();
  };

  const handlePauseClick = () => {
    pauseGame();
  };

  const handleResumeClick = () => {
    resumeGame();
  };

  // Timer nur aktualisieren wenn nicht pausiert
  useEffect(() => {
    const updateTimes = () => {
      setGameTime(formatDuration(Date.now() - (gameStartTime ?? 0), false));
      setRoundTime(formatDuration(Date.now() - (roundStartTime ?? 0), true));
    };
    
    updateTimes();
    
    if (!isOpen || isPaused) return;
    
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isPaused, gameStartTime, roundStartTime]);

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? 1 : 0.95}) rotate(${isCalculatorFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  return (
    <div 
      className={`fixed inset-0 flex items-center justify-center z-50 ${isOpen ? '' : 'pointer-events-none'}`}
      onClick={(e) => {
        // Wenn pausiert, keine Clicks erlauben
        if (isPaused) return;
        
        // Prüfen ob der Click auf einer StrichBox war
        const target = e.target as HTMLElement;
        if (target.closest('[data-strich-box="true"]')) {
          return;
        }
        
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <animated.div 
        style={springProps}
        className="relative w-11/12 max-w-md bg-gray-800 bg-opacity-95 rounded-xl p-6 shadow-lg select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold text-white text-center mb-6">
          Spielstand
        </h2>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setCalculatorFlipped(!isCalculatorFlipped);
          }}
          className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
            text-white hover:text-gray-300 transition-all duration-1000
            w-24 h-24 flex items-center justify-center
            rounded-full
            ${isCalculatorFlipped ? 'rotate-180' : 'rotate-0'}`}
          aria-label="Umdrehen"
        >
          <FiRotateCcw className="w-8 h-8" />
        </button>

        <button 
          onClick={handleClose}
          className={`absolute right-2 top-2 p-2 transition-colors
            ${isPaused 
              ? 'text-gray-600 cursor-not-allowed' 
              : 'text-gray-400 hover:text-white'
            }`}
          disabled={isPaused}
        >
          <FiX size={24} />
        </button>

        <div className="space-y-4 mb-8">
          <div className="grid grid-cols-4 gap-4 text-white">
            <div className="text-center">
              <span className="text-gray-400 text-xs">Spiel</span>
              <div className="text-xl font-bold">{currentRound}</div>
            </div>
            <div className="text-center">
              <span className="text-gray-400 text-xs">Runde</span>
              <div className="text-xl font-bold">{currentRound}</div>
            </div>
            <div className="text-center">
              <span className="text-gray-400 text-xs">Spieldauer</span>
              <div className="text-xl font-bold">{gameTime}</div>
            </div>
            <div className="text-center">
              <span className="text-gray-400 text-xs">Jassdauer</span>
              <div className="text-xl font-bold">{gameTime}</div>
            </div>
          </div>

          <div className="text-center text-white mt-1">
            <span className="text-gray-400">Spieler</span>
            <div className="text-3xl font-bold p-2 bg-gray-700 bg-opacity-50 rounded-xl mt-1">
              {currentPlayer}
            </div>
          </div>

          <div className="text-center text-white mt-1">
            <span className="text-gray-400">Zeit Runde</span>
            <div className="text-3xl font-bold p-2 bg-gray-700 bg-opacity-50 rounded-xl mt-1">
              {roundTime}
            </div>
          </div>

          <div className="text-center text-white mt-3">
            <MultiplierCalculator 
              mainTitle="Punkte bis"
              subTitle={getRemainingPoints(isCalculatorFlipped ? 'top' : 'bottom').title.split(' ').pop() ?? ''}
              points={getRemainingPoints(isCalculatorFlipped ? 'top' : 'bottom').remaining}
              numberSize="text-3xl"
            />
          </div>

          <div className="text-center text-white mt-1">
            <div>
              <span className="text-gray-400">Gegner</span>
              <div className="grid grid-cols-3 gap-2 -mt-10">
                <div className="text-center">
                  <span className="text-gray-400 text-xs">
                    {getRemainingPoints(isCalculatorFlipped ? 'bottom' : 'top').title.split(' ').pop() ?? ''}
                  </span>
                  <div className="text-xl font-bold mt-0">
                    {getRemainingPoints(isCalculatorFlipped ? 'bottom' : 'top').remaining}
                  </div>
                </div>
                <div className="invisible">
                  {/* Leere mittlere Spalte für korrektes Alignment */}
                </div>
                <div className="text-center">
                  <span className="text-gray-400 text-xs">{currentMultiplier}-fach</span>
                  <div className="text-xl font-bold mt-0">
                    {getDividedPoints(getRemainingPoints(isCalculatorFlipped ? 'bottom' : 'top').remaining)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4 max-w-md mx-auto mt-10">
          <div className="grid grid-cols-2 gap-4">
            <ChargeButton
              handlers={bergButton.handlers}
              isButtonActive={bergButton.isButtonActive}
              isPressed={bergButton.isPressed}
              showDepth={showDepth}
              color="yellow"
              disabled={isPaused || hasBedankenForTeam('top') || hasBedankenForTeam('bottom')}
            >
              BERG
            </ChargeButton>

            <ChargeButton
              handlers={bedankenButton.handlers}
              isButtonActive={bedankenButton.isButtonActive}
              isPressed={bedankenButton.isPressed}
              showDepth={showDepth}
              color="green"
              disabled={isPaused || !(hasBergForTeam('top') || hasBergForTeam('bottom'))}
            >
              BEDANKEN
            </ChargeButton>
          </div>

          <button 
            onMouseDown={() => setIsPressedDown(true)}
            onMouseUp={() => {
              setIsPressedDown(false);
              if (!isPaused) {
                handlePauseClick();
                setShowDepth(true);
              } else {
                handleResumeClick();
                setShowDepth(false);
              }
            }}
            onMouseLeave={() => setIsPressedDown(false)}
            onTouchStart={() => setIsPressedDown(true)}
            onTouchEnd={(e) => {
              e.preventDefault();
              setIsPressedDown(false);
              if (!isPaused) {
                handlePauseClick();
                setShowDepth(true);
              } else {
                handleResumeClick();
                setShowDepth(false);
              }
            }}
            className={`
              w-full py-2 text-white rounded-xl font-bold
              transition-all duration-150
              ${showDepth ? 'border-b-4 border-t border-l border-r' : ''}
              ${isPaused 
                ? 'bg-green-600 hover:bg-green-700 border-green-900' 
                : 'bg-red-600 hover:bg-red-700 border-red-900'
              }
              ${isPressedDown 
                ? 'translate-y-1 shadow-inner opacity-80' 
                : showDepth 
                  ? 'translate-y-1 shadow-inner'
                  : 'shadow-lg'
              }
            `}
          >
            {isPaused ? 'WEITER' : 'PAUSE'}
          </button>
        </div>
      </animated.div>
    </div>
  );
};

export default GameInfoOverlay;