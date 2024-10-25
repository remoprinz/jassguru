import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../../store/gameStore';
import { FiRotateCcw } from 'react-icons/fi';
import confetti from 'canvas-confetti';
import { useSpring, animated } from 'react-spring';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: number, opponentValue: number) => void;
  initialValue?: number;
  onCancel: () => void;
}

const Calculator: React.FC<CalculatorProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialValue = 0,
  onCancel,
}) => {
  const { isCalculatorFlipped, setCalculatorFlipped } = useGameStore();
  const [value, setValue] = useState('0');
  const [opponentValue, setOpponentValue] = useState('0');
  const [multiplier, setMultiplier] = useState(1);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const settings = useGameStore(state => state.settings);
  const [pressedButtons, setPressedButtons] = useState<Set<number | string>>(new Set());
  const [isClosing, setIsClosing] = useState(false);
  const [pressedMultiplier, setPressedMultiplier] = useState<string | null>(null);
  const [totalValue, setTotalValue] = useState('0');
  const [isMatschActive, setIsMatschActive] = useState(false);
  const [pressedMatsch, setPressedMatsch] = useState(false);
  const [confettiCharge, setConfettiCharge] = useState(0);
  const [chargeInterval, setChargeInterval] = useState<NodeJS.Timeout | null>(null);
  const valueRef = useRef('0');
  const [lastClickTime, setLastClickTime] = useState(0);
  const { updateScore } = useGameStore();
  const activePosition = 'top'; // oder 'bottom', je nachdem, welche Position aktiv ist

  const [springProps, setSpringProps] = useSpring(() => ({
    opacity: 0.5,
    scale: 0.95,
    config: { mass: 1, tension: 300, friction: 20 }
  }));

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue.toString());
      setOpponentValue('0');
      setTotalValue(initialValue.toString());
      setSelectedColor(null);
      setMultiplier(1);
      setIsMatschActive(false);
      setSpringProps({
        opacity: 1,
        scale: 1,
        config: { mass: 1, tension: 300, friction: 20 }
      });
    } else {
      setIsClosing(false);
      setSpringProps({
        opacity: 0.5,
        scale: 0.9,
        config: { mass: 1, tension: 300, friction: 20 }
      });
    }
  }, [isOpen, initialValue, setSpringProps]);

  useEffect(() => {
    if (value === '0') {
      setOpponentValue('0');
      setTotalValue('0');
    } else if (value === '257') {
      setOpponentValue('0');
      const total = 257 * multiplier;
      setTotalValue(total.toString());
    } else {
      const diff = 157 - parseInt(value, 10);
      setOpponentValue(diff > 0 ? diff.toString() : '0');
      const total = parseInt(value, 10) * multiplier;
      setTotalValue(total.toString());
    }
  }, [value, multiplier]);

  const handleNumberClick = (num: number) => {
    if (isMatschActive) return;

    const now = Date.now();
    if (now - lastClickTime < 100) {
      return;
    }
    setLastClickTime(now);

    setValue((prevValue) => {
      const newValue = prevValue === '0' ? num.toString() : prevValue + num.toString();
      const validatedValue = validateInput(newValue);
      if (validatedValue === '0') {
        setOpponentValue('157');
      }
      return validatedValue;
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
    
    if (value !== '0') {
      const currentValue = parseInt(value, 10);
      setTotalValue((currentValue * mult).toString());
      const opponentValueToSet = Math.max(157 - currentValue, 0);
      setOpponentValue((opponentValueToSet * mult).toString());
    } else {
      setOpponentValue('0');
      setTotalValue('0');
    }
  };

  const handleSubmit = () => {
    const calculatedValue = parseInt(totalValue);
    const calculatedOpponentValue = parseInt(opponentValue);
    onSubmit(calculatedValue, calculatedOpponentValue);
    updateScore(activePosition, calculatedValue, calculatedOpponentValue);
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

  const triggerConfetti = (charge: number) => {
    const minChargeForConfetti = 3;
    if (charge < minChargeForConfetti) return;

    const button = document.querySelector('.matsch-button');
    if (button) {
      const rect = button.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;

      const baseParticleCount = 10;
      const particleCount = baseParticleCount + ((charge - minChargeForConfetti) * 30);

      const shootConfetti = (angle: number, spread: number, particleCount: number, scalar: number) => {
        const adjustedAngle = isCalculatorFlipped ? (angle + 180) % 360 : angle;
        confetti({
          particleCount: particleCount,
          angle: adjustedAngle,
          spread: spread,
          origin: { x, y },
          colors: ['#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#0000FF', '#800080'],
          scalar: scalar,
          gravity: isCalculatorFlipped ? -1 : 1,
          ticks: 300,
        });
      };

      for (let angle = 0; angle < 360; angle += 45) {
        shootConfetti(angle, 55, Math.floor(particleCount * 0.3), 1.2);
        shootConfetti(angle, 25, Math.floor(particleCount * 0.4), 0.8);
        shootConfetti(angle, 10, Math.floor(particleCount * 0.3), 0.4);
      }
    }
  };

  const handleMatsch = () => {
    setValue('257');
    setOpponentValue('0');
    setTotalValue((257 * multiplier).toString());
    setIsMatschActive(true);
    triggerConfetti(confettiCharge);
  };

  const numberOrder = isCalculatorFlipped ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      <animated.div
        style={{
          opacity: springProps.opacity,
          transform: springProps.scale.to(s => `scale(${s})`)
        }}
        className="relative w-11/12 max-w-md"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleFlip();
          }}
          className={`absolute ${
            isCalculatorFlipped ? 'top-full mt-6' : 'bottom-full mb-6'
          } left-1/2 transform -translate-x-1/2 text-white hover:text-gray-300 transition-all duration-1000`}
          aria-label="Umdrehen"
        >
          <FiRotateCcw className={`w-8 h-8 ${isCalculatorFlipped ? 'rotate-180 opacity-0' : 'opacity-100'} transition-all duration-1000`} />
          <FiRotateCcw className={`w-8 h-8 absolute top-0 left-0 ${isCalculatorFlipped ? 'rotate-0 opacity-100' : 'rotate-180 opacity-0'} transition-all duration-1000`} />
        </button>
        <div 
          className={`bg-gray-800 p-6 rounded-lg transition-all duration-700 flex flex-col items-center ${
            isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
          style={{ 
            transform: `${isCalculatorFlipped ? 'rotate(180deg)' : 'rotate(0deg)'}`,
          }}
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
              onMouseDown={() => setPressedButtons(prev => new Set(prev).add('OK'))}
              onMouseUp={() => {
                setPressedButtons(prev => {
                  const newSet = new Set(prev);
                  newSet.delete('OK');
                  return newSet;
                });
                onSubmit(parseInt(totalValue), parseInt(opponentValue));
              }}
              onMouseLeave={() => setPressedButtons(prev => {
                const newSet = new Set(prev);
                newSet.delete('OK');
                return newSet;
              })}
              className={`bg-green-600 text-white p-4 rounded select-none text-2xl transition-all duration-100 ${
                pressedButtons.has('OK') ? 'bg-green-500 scale-95 opacity-80' : 'scale-100 opacity-100'
              }`}
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
