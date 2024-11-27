import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useJassStore } from '../../store/jassStore';
import { TeamPosition } from '../../types/jass';
import { FiRotateCcw, FiX } from 'react-icons/fi';
import confetti from 'canvas-confetti';
import { useSpring, animated } from 'react-spring';
import { triggerMatschConfetti } from '../effects/MatschConfetti';
import { triggerKontermatschChaos } from '../effects/KontermatschChaos';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: number, opponentValue: number) => void;
  initialValue?: number;
  onCancel: () => void;
  clickedPosition: TeamPosition;
}

const Calculator: React.FC<CalculatorProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialValue = 0,
  onCancel,
  clickedPosition,
}) => {
  const { isCalculatorFlipped, setCalculatorFlipped } = useGameStore();
  const [value, setValue] = useState(initialValue?.toString() || '0');
  const [opponentValue, setOpponentValue] = useState('0');
  const [totalValue, setTotalValue] = useState('0');
  const [totalOpponentValue, setTotalOpponentValue] = useState('0');
  const [multiplier, setMultiplier] = useState(1);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const settings = useGameStore(state => state.settings);
  const [pressedButtons, setPressedButtons] = useState<Set<number | string>>(new Set());
  const [isClosing, setIsClosing] = useState(false);
  const [pressedMultiplier, setPressedMultiplier] = useState<string | null>(null);
  const [isMatschActive, setIsMatschActive] = useState(false);
  const [pressedMatsch, setPressedMatsch] = useState(false);
  const [confettiCharge, setConfettiCharge] = useState(0);
  const [chargeInterval, setChargeInterval] = useState<NodeJS.Timeout | null>(null);
  const valueRef = useRef('0');
  const [lastClickTime, setLastClickTime] = useState(0);
  const { updateScore } = useGameStore();

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? 1 : 0.95}) rotate(${isCalculatorFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  useEffect(() => {
    if (isOpen) {
      setCalculatorFlipped(false);
    }
  }, [isOpen]);

  const calculateValues = (inputValue: string, currentMultiplier: number) => {
    if (inputValue === '0') {
      setOpponentValue('0');
      setTotalValue('0');
    } else if (inputValue === '257') {
      setOpponentValue('0');
      const total = 257 * currentMultiplier;
      setTotalValue(total.toString());
    } else {
      const numericValue = parseInt(inputValue, 10);
      const baseOpponentValue = Math.max(157 - numericValue, 0);
      const multipliedValue = numericValue * currentMultiplier;
      const multipliedOpponentValue = baseOpponentValue * currentMultiplier;
      
      setOpponentValue(multipliedOpponentValue.toString());
      setTotalValue(multipliedValue.toString());
    }
  };

  useEffect(() => {
    calculateValues(value, multiplier);
  }, [value, multiplier]);

  const handleNumberClick = (num: number) => {
    if (isMatschActive) return;

    const now = Date.now();
    if (now - lastClickTime < 100) return;
    setLastClickTime(now);

    setValue((prevValue) => {
      const newValue = prevValue === '0' ? num.toString() : prevValue + num.toString();
      return validateInput(newValue);
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
    setSelectedColor(color);
    setMultiplier(mult);
    setPressedMultiplier(null);
    calculateValues(value, mult);
  };

  const handleSubmit = () => {
    const finalScore = parseInt(value) * multiplier;
    const finalOpponentScore = parseInt(opponentValue);
    
    if (selectedColor) {
      if (isMatschActive) {
        useJassStore.getState().addStrich(clickedPosition, 'matsch');
      }
      
      onSubmit?.(finalScore, finalOpponentScore);
      useGameStore.getState().finalizeRound(selectedColor);
    }
    
    onClose();
  };

  const handleClear = () => {
    setValue('0');
    setOpponentValue('0');
    setMultiplier(1);
    setSelectedColor(null);
    setIsMatschActive(false);
  };

  const handleFlip = () => {
    setCalculatorFlipped(!isCalculatorFlipped);
  };

  const validateInput = (input: string): string => {
    const numericValue = parseInt(input, 10);
    if (isNaN(numericValue)) return '0';
    return Math.min(numericValue, 157).toString();
  };

  const handleMatsch = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    
    const isKontermatsch = false;
    
    // 1. Strich im Store setzen
    useJassStore.getState().startMatschCharge(clickedPosition);
    useJassStore.getState().stopMatschCharge(clickedPosition);

    // 2. UI-Werte aktualisieren
    setValue('257');
    setOpponentValue('0');
    setTotalValue((257 * multiplier).toString());
    setIsMatschActive(true);

    // 3. Effekt triggern
    if (isKontermatsch) {
      triggerKontermatschChaos(confettiCharge);
    } else {
      triggerMatschConfetti(confettiCharge, isCalculatorFlipped);
    }
  };

  const numberOrder = isCalculatorFlipped ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  // Neue Hilfsfunktion am Anfang der Komponente
  const hasValidScore = () => {
    const numericValue = parseInt(value, 10);
    // Prüfen ob eine gültige Zahl (inkl. 0) eingegeben wurde UND ein Multiplikator ausgewählt ist
    return !isNaN(numericValue) && selectedColor !== null;
  };

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
      >
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
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white transition-colors z-10"
        >
          <FiX size={24} />
        </button>
        <div 
          className={`bg-gray-800 p-6 rounded-lg transition-all duration-700 flex flex-col items-center ${
            isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-white text-xl mb-4 text-center select-none" aria-label="Runde schreiben">
            Runde schreiben
          </h2>
          <div className="flex flex-col w-full space-y-4">
            <input
              type="text"
              value={value}
              readOnly
              className="w-full bg-gray-700 text-white text-6xl p-4 rounded select-none text-center"
              aria-label="Aktueller Wert"
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
          <div className="grid grid-cols-5 gap-2 mb-4 w-full">
            {settings.colors.map((color, index) => (
              <button
                key={color}
                onMouseDown={() => setPressedMultiplier(color)}
                onMouseUp={() => handleColorClick(color, settings.colorMultipliers[index])}
                onMouseLeave={() => setPressedMultiplier(null)}
                onTouchStart={() => setPressedMultiplier(color)}
                onTouchEnd={() => handleColorClick(color, settings.colorMultipliers[index])}
                className={`p-1 rounded transition-all duration-100 ${
                  selectedColor === color 
                    ? 'bg-orange-500' 
                    : pressedMultiplier === color
                      ? 'bg-gray-500 scale-95'
                      : 'bg-gray-600 scale-100'
                } text-white select-none text-xs h-12 flex items-center justify-center`}
                aria-label={`${color}`}
              >
                {color}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 w-full">
            {numberOrder.map((num) => (
              <button
                key={num}
                onClick={() => handleNumberClick(num)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleNumberClick(num);
                }}
                className={`bg-gray-600 text-white p-4 rounded select-none text-2xl transition-all duration-100 ${
                  pressedButtons.has(num) ? 'bg-gray-500 scale-95 opacity-80' : 'scale-100 opacity-100'
                }`}
              >
                {num}
              </button>
            ))}
            <button 
              onClick={handleClear}
              onMouseDown={() => setPressedButtons(prev => new Set(prev).add('C'))}
              onMouseUp={() => setPressedButtons(prev => {
                const newSet = new Set(prev);
                newSet.delete('C');
                return newSet;
              })}
              onMouseLeave={() => setPressedButtons(prev => {
                const newSet = new Set(prev);
                newSet.delete('C');
                return newSet;
              })}
              onTouchStart={() => setPressedButtons(prev => new Set(prev).add('C'))}
              onTouchEnd={() => {
                setPressedButtons(prev => {
                  const newSet = new Set(prev);
                  newSet.delete('C');
                  return newSet;
                });
                handleClear();
              }}
              className={`bg-red-600 text-white p-4 rounded select-none text-2xl transition-all duration-100 ${
                pressedButtons.has('C') ? 'bg-red-500 scale-95 opacity-80' : 'scale-100 opacity-100'
              }`}
            >
              C
            </button>
            <button 
              onClick={() => handleNumberClick(0)}
              onMouseDown={() => setPressedButtons(prev => new Set(prev).add(0))}
              onMouseUp={() => setPressedButtons(prev => {
                const newSet = new Set(prev);
                newSet.delete(0);
                return newSet;
              })}
              onMouseLeave={() => setPressedButtons(prev => {
                const newSet = new Set(prev);
                newSet.delete(0);
                return newSet;
              })}
              className={`bg-gray-600 text-white p-4 rounded select-none text-2xl transition-all duration-100 ${
                pressedButtons.has(0) ? 'bg-gray-500 scale-95 opacity-80' : 'scale-100 opacity-100'
              }`}
            >
              0
            </button>
            <button 
              onClick={handleSubmit}
              disabled={!hasValidScore() || !selectedColor}
              onMouseDown={() => setPressedButtons(prev => new Set(prev).add('OK'))}
              onMouseUp={() => {
                setPressedButtons(prev => {
                  const newSet = new Set(prev);
                  newSet.delete('OK');
                  return newSet;
                });
                if (hasValidScore() && selectedColor) {
                  onSubmit(parseInt(totalValue), parseInt(opponentValue));
                }
              }}
              onMouseLeave={() => setPressedButtons(prev => {
                const newSet = new Set(prev);
                newSet.delete('OK');
                return newSet;
              })}
              className={`bg-green-600 text-white p-4 rounded select-none text-2xl transition-all duration-100 
                ${pressedButtons.has('OK') ? 'bg-green-500 scale-95 opacity-80' : 'scale-100 opacity-100'}
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