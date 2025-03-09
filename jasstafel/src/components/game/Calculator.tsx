// src/components/game/Calculator.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { TeamPosition, JassColor, StrichTyp } from '../../types/jass';
import { FiRotateCcw, FiX } from 'react-icons/fi';
import { useSpring, animated } from 'react-spring';
import { triggerMatschConfetti } from '../effects/MatschConfetti';
import { HISTORY_WARNING_MESSAGE } from '../notifications/HistoryWarnings';
import { FARBE_MODES } from '../../config/FarbeSettings';
import { MAX_SCORE, MATSCH_SCORE } from '../../config/ScoreSettings';
import { getPictogram } from '../../utils/pictogramUtils';
import { usePressableButton } from '../../hooks/usePressableButton';
import { useTutorialStore } from '../../store/tutorialStore';
import { TUTORIAL_STEPS } from '../../types/tutorial';
import { useDeviceScale } from '../../hooks/useDeviceScale';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCancel: () => void;
  initialValue?: number;
  clickedPosition: TeamPosition;
}

const Calculator: React.FC<CalculatorProps> = ({
  isOpen,
  onClose,
  initialValue = 0,
  clickedPosition,
}) => {
  const { finalizeRound, currentHistoryIndex, roundHistory, showHistoryWarning, jumpToLatest, validateHistoryAction } = useGameStore();
  const { calculator, setCalculatorFlipped, farbeSettings, settings: { pictogramConfig, cardStyle } } = useUIStore();
  const { isActive: isTutorialActive, getCurrentStep } = useTutorialStore();
  const currentStep = getCurrentStep();

  const [value, setValue] = useState(initialValue?.toString() || '0');
  const [opponentValue, setOpponentValue] = useState('0');
  const [totalValue, setTotalValue] = useState('0');
  const [multiplier, setMultiplier] = useState(1);
  const [selectedColor, setSelectedColor] = useState<JassColor | null>(null);
  const [pressedButtons, setPressedButtons] = useState<Set<number | string>>(new Set());
  const [isMatschActive, setIsMatschActive] = useState(false);
  const [pressedMatsch, setPressedMatsch] = useState(false);
  const [confettiCharge, setConfettiCharge] = useState(0);
  const [chargeInterval, setChargeInterval] = useState<NodeJS.Timeout | null>(null);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [isClient, setIsClient] = useState(false);

  const { scale, overlayScale } = useDeviceScale();

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? overlayScale : 0.95}) rotate(${calculator.isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  useEffect(() => {
    if (isOpen) {
      setCalculatorFlipped(false);
    }
  }, [isOpen, setCalculatorFlipped]);

  useEffect(() => {
    if (isOpen && clickedPosition) {
      setCalculatorFlipped(clickedPosition === 'top');
    }
  }, [isOpen, clickedPosition, setCalculatorFlipped]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const calculateValues = (inputValue: string, currentMultiplier: number) => {
    if (inputValue === '0') {
      setOpponentValue('0');
      setTotalValue('0');
    } else if (inputValue === MATSCH_SCORE.toString()) {
      setOpponentValue('0');
      const total = MATSCH_SCORE * currentMultiplier;
      setTotalValue(total.toString());
    } else {
      const numericValue = parseInt(inputValue, 10);
      const baseOpponentValue = Math.max(MAX_SCORE - numericValue, 0);
      const multipliedValue = numericValue * currentMultiplier;
      const multipliedOpponentValue = baseOpponentValue * currentMultiplier;

      setOpponentValue(multipliedOpponentValue.toString());
      setTotalValue(multipliedValue.toString());
    }
  };

  useEffect(() => {
    calculateValues(value, multiplier);
  }, [value, multiplier]);

  const validateInput = (input: string): string => {
    const numericValue = parseInt(input, 10);
    if (isNaN(numericValue)) return '0';
    return Math.min(numericValue, 157).toString();
  };

  const hasValidScore = () => {
    const numericValue = parseInt(value, 10);
    return !isNaN(numericValue) && selectedColor !== null;
  };

  const handleNumberClick = (num: number) => {
    if (isMatschActive) return;
    const now = Date.now();
    if (now - lastClickTime < 100) return;
    setLastClickTime(now);

    setValue((prevValue) => {
      if (prevValue === '0') return num.toString();
      
      const newValue = prevValue + num.toString();
      const numericValue = parseInt(newValue, 10);
      
      if (numericValue <= MAX_SCORE) {
        return newValue;
      }
      
      return prevValue;
    });

    setPressedButtons((prev) => new Set(prev).add(num));
    setTimeout(() => {
      setPressedButtons((prev) => {
        const newSet = new Set(prev);
        newSet.delete(num);
        return newSet;
      });
    }, 100);
  };

  const handleColorClick = (color: string, mult: number) => {
    setSelectedColor(color as JassColor);
    setMultiplier(mult);
    calculateValues(value, mult);
  };

  const handleSubmit = useCallback(() => {
    if (!hasValidScore() || !selectedColor) return;
    
    const finalScore = parseInt(totalValue, 10);
    const finalOpponentScore = parseInt(opponentValue, 10);
    
    const scores = {
      top: clickedPosition === 'top' ? finalScore : finalOpponentScore,
      bottom: clickedPosition === 'bottom' ? finalScore : finalOpponentScore
    };

    if (!validateHistoryAction()) {
      showHistoryWarning(
        HISTORY_WARNING_MESSAGE,
        () => {
          finalizeRound(
            selectedColor,
            scores.top,
            scores.bottom,
            isMatschActive ? {
              team: clickedPosition,
              type: 'matsch' as StrichTyp
            } : undefined
          );
          onClose();
        },
        () => jumpToLatest()
      );
      return;
    }

    finalizeRound(
      selectedColor,
      scores.top,
      scores.bottom,
      isMatschActive ? {
        team: clickedPosition,
        type: 'matsch' as StrichTyp
      } : undefined
    );

    onClose();
  }, [
    hasValidScore,
    selectedColor,
    totalValue,
    opponentValue,
    clickedPosition,
    isMatschActive,
    currentHistoryIndex,
    roundHistory.length,
    showHistoryWarning,
    jumpToLatest,
    finalizeRound,
    onClose,
    validateHistoryAction
  ]);

  const handleClear = () => {
    setValue('0');
    setOpponentValue('0');
    setMultiplier(1);
    setSelectedColor(null);
    setIsMatschActive(false);
  };

  const handleFlip = () => {
    setCalculatorFlipped(!calculator.isFlipped);
  };

  const handleMatsch = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    setValue('257');
    setOpponentValue('0');
    setTotalValue((257 * multiplier).toString());
    setIsMatschActive(true);
    triggerMatschConfetti(confettiCharge, calculator.isFlipped);
  };

  const numberOrder = calculator.isFlipped ? [1,2,3,4,5,6,7,8,9] : [1,2,3,4,5,6,7,8,9];

  // Erweiterte Farben-Map (nur mit den wirklich benötigten Eigenschaften)
  const colorMultipliers = FARBE_MODES
    .map((mode, index) => ({
      color: mode.name,
      multiplier: farbeSettings.values[index]
    }))
    .filter(item => item.multiplier > 0)
    .sort((a, b) => a.multiplier - b.multiplier);

  const getGridClasses = (activeColors: number): string => {
    // Basis-Grid-Klassen mit group und has-active wenn ein Button selektiert ist
    const baseClasses = `grid grid-cols-5 gap-2 mb-4 w-full group ${selectedColor ? 'has-active' : ''}`;
    
    if (activeColors <= 4) {
      return baseClasses.replace('grid-cols-5', 'grid-cols-4');
    } else if (activeColors <= 6) {
      return baseClasses.replace('grid-cols-5', 'grid-cols-3');
    } else if (activeColors <= 8) {
      return baseClasses.replace('grid-cols-5', 'grid-cols-4');
    }
    
    return baseClasses;
  };

  // Neue Funktion für das Button-Styling
  const getButtonStyle = (color: string, isSelected: boolean, mode: 'svg' | 'emoji'): string => {
    const farbeMode = FARBE_MODES.find(m => m.name === color);
    
    if (isSelected) {
      return 'bg-orange-500';
    }

    if (cardStyle === 'FR') {
      return farbeMode?.frStyle?.backgroundColor || 'bg-gray-600';
    }
    
    if (mode === 'emoji') {
      return farbeMode?.emojiStyle?.backgroundColor || 'bg-gray-600';
    }
    
    return farbeMode?.standardStyle?.backgroundColor || 'bg-gray-600';
  };

  // Neue Hilfsfunktion für die Namensanpassung
  const getDisplayName = (color: string): string => {
    // Wenn keine Piktogramme aktiviert sind, spezielle Behandlung für "Une"
    if (!pictogramConfig.isEnabled && color.toLowerCase() === 'une') {
      return 'Unde';
    }

    if (cardStyle === 'FR' && !pictogramConfig.isEnabled) {
      // Mapping für französische Namen wenn keine Piktogramme
      const frenchNames: Record<string, string> = {
        'Eicheln': 'Schaufel',
        'Rosen': 'Kreuz',
        'Schellen': 'Herz',
        'Schilten': 'Ecke'
      };
      return frenchNames[color] || color;
    }
    return color;
  };

  // Render-Logik für Farben-Buttons
  const renderFarbeButton = (color: string, multiplier: number) => {
    const { handlers, buttonClasses } = usePressableButton(
      () => handleColorClick(color, multiplier)
    );

    // Angepasster Vergleich für "Misère"
    const isMisereSelected = color.toLowerCase() === 'misère' && selectedColor === color;

    return (
      <button
        key={color}
        {...handlers}
        className={`p-1 rounded text-white select-none text-xs h-12 flex items-center justify-center ${
          selectedColor === color ? 'active' : ''
        } ${getButtonStyle(color, selectedColor === color, pictogramConfig.mode)} ${buttonClasses}`}
        aria-label={`${color}`}
      >
        {isClient && pictogramConfig.isEnabled ? (
          pictogramConfig.mode === 'emoji' ? (
            <span className="text-2xl">
              {getPictogram(color as JassColor, 'emoji', cardStyle)}
            </span>
          ) : (
            <img 
              src={getPictogram(color as JassColor, 'svg', cardStyle)}
              alt={color}
              className={`w-10 h-10 object-contain ${
                isMisereSelected ? 'invert brightness-0' : ''
              }`}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  parent.textContent = getDisplayName(color);
                }
              }}
            />
          )
        ) : getDisplayName(color)}
      </button>
    );
  };

  // Zahlentasten anpassen
  const renderNumberButton = (num: number) => {
    const { isPressedDown, handlers, buttonClasses } = usePressableButton(
      () => handleNumberClick(num)
    );

    return (
      <button
        key={num}
        {...handlers}
        className={`bg-gray-600 text-white p-4 rounded select-none text-2xl ${buttonClasses}`}
      >
        {num}
      </button>
    );
  };

  // Matsch-Button anpassen
  const { isPressedDown: isMatschPressed, handlers: matschHandlers, buttonClasses: matschClasses } = usePressableButton(handleMatsch);

  // Clear-Button anpassen
  const { handlers: clearHandlers, buttonClasses: clearClasses } = usePressableButton(handleClear);

  // OK-Button anpassen
  const { handlers: okHandlers, buttonClasses: okClasses } = usePressableButton(handleSubmit);

  // Prüfen ob Calculator geöffnet werden darf
  useEffect(() => {
    console.log('🧮 Calculator Effect:', {
      isOpen,
      isTutorialActive,
      currentStepId: currentStep?.id,
      shouldClose: isOpen && isTutorialActive && currentStep?.id !== TUTORIAL_STEPS.CALCULATOR_OPEN
    });

    if (isOpen && isTutorialActive) {
      if (currentStep?.id === TUTORIAL_STEPS.CALCULATOR_OPEN) {
        // Direkt feuern, ohne Timeout
        window.dispatchEvent(new CustomEvent('calculatorOpen'));
      } else {
        console.log('🚫 Closing calculator');
        onClose();
      }
    }
  }, [isOpen, isTutorialActive, currentStep, onClose]);

  // Event-Handling wie in GameInfoOverlay
  useEffect(() => {
    if (isOpen) {
      document.dispatchEvent(new Event('calculatorOpen'));
    }
  }, [isOpen]);

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 prevent-interactions ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <animated.div
        style={springProps}
        className="relative w-11/12 max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFlip();
          }}
          className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
            text-white hover:text-gray-300 transition-all duration-1000
            w-24 h-24 flex items-center justify-center
            rounded-full
            ${calculator.isFlipped ? 'rotate-180' : 'rotate-0'}`}
          aria-label="Umdrehen"
        >
          <FiRotateCcw className="w-8 h-8" />
        </button>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white transition-colors z-10"
        >
          <FiX size={24} />
        </button>
        <div 
          className="bg-gray-800 p-6 rounded-lg transition-all duration-700 flex flex-col items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-white text-xl mb-4 text-center select-none">
            Runde schreiben
          </h2>
          <div className="flex flex-col w-full space-y-4">
            <input
              type="text"
              value={value}
              readOnly
              className="w-full bg-gray-700 text-white text-6xl p-4 rounded select-none text-center"
            />
            <div className="flex justify-between items-stretch w-full space-x-2 h-10">
              <div className="w-1/3 bg-gray-700 text-white p-1 rounded select-none flex items-center justify-end relative">
                <div className="text-xs absolute top-0 left-1">Gegner:</div>
                <div className="text-xl pr-1">{opponentValue}</div>
              </div>
              <button
                onClick={handleMatsch}
                onMouseDown={() => {
                  setPressedMatsch(true);
                  setConfettiCharge(0);
                  const interval = setInterval(() => {
                    setConfettiCharge(prev => Math.min(prev + 1, 20));
                  }, 100);
                  setChargeInterval(interval);
                }}
                onMouseUp={() => {
                  setPressedMatsch(false);
                  if (chargeInterval) clearInterval(chargeInterval);
                  handleMatsch();
                }}
                onMouseLeave={() => {
                  setPressedMatsch(false);
                  if (chargeInterval) clearInterval(chargeInterval);
                }}
                onTouchStart={() => {
                  setPressedMatsch(true);
                  setConfettiCharge(0);
                  const interval = setInterval(() => {
                    setConfettiCharge(prev => Math.min(prev + 1, 20));
                  }, 100);
                  setChargeInterval(interval);
                }}
                onTouchEnd={() => {
                  setPressedMatsch(false);
                  if (chargeInterval) clearInterval(chargeInterval);
                  handleMatsch();
                }}
                className={`w-1/3 p-1 rounded select-none transition-all duration-100 text-lg flex items-center justify-center matsch-button ${
                  isMatschActive
                    ? 'bg-orange-500 text-white' 
                    : pressedMatsch
                      ? 'bg-gray-600 text-white scale-95 opacity-80'
                      : 'bg-gray-700 text-white hover:bg-orange-500 scale-100 opacity-100'
                }`}
                disabled={isMatschActive}
              >
                Matsch
              </button>
              <div className="w-1/3 bg-gray-700 text-white p-1 rounded select-none flex items-center justify-end relative">
                <div className="text-xs absolute top-0 left-1">Total:</div>
                <div className="text-xl pr-1">{totalValue}</div>
              </div>
            </div>
          </div>
          <div className="mt-4"></div>
          <div className={getGridClasses(colorMultipliers.length)}>
            {colorMultipliers.map(({ color, multiplier }) => renderFarbeButton(color, multiplier))}
          </div>
          <div className="grid grid-cols-3 gap-3 w-full">
            {numberOrder.map((num) => renderNumberButton(num))}
            <button 
              {...clearHandlers}
              className={`bg-red-600 text-white p-4 rounded select-none text-2xl ${clearClasses}`}
            >
              C
            </button>
            {renderNumberButton(0)}
            <button 
              {...okHandlers}
              disabled={!hasValidScore() || !selectedColor}
              className={`bg-green-600 text-white p-4 rounded select-none text-2xl ${okClasses}
                ${(!hasValidScore() || !selectedColor) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              OK
            </button>
          </div>
        </div>
      </animated.div>
    </div>
  );
};

export default Calculator;
