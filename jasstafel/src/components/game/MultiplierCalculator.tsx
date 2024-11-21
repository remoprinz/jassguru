import { useGameStore } from '../../store/gameStore';
import { useState } from 'react';

const multipliers = [2, 3, 4, 5, 6, 7] as const;

interface MultiplierCalculatorProps {
  mainTitle: string;
  subTitle: string;
  points: number;
  className?: string;
  numberSize?: string;
}

const MultiplierCalculator: React.FC<MultiplierCalculatorProps> = ({ 
  mainTitle,
  subTitle,
  points, 
  className = "",
  numberSize = "text-xl"
}) => {
  const { currentMultiplier, setMultiplier, getDividedPoints } = useGameStore();
  const [pressedButton, setPressedButton] = useState(false);

  return (
    <div>
      <span className="text-gray-400">{mainTitle}</span>
      <div className={`grid grid-cols-3 gap-2 mt-0 ${className}`}>
        <div className="text-center">
          <span className="text-gray-400 text-xs">{subTitle}</span>
          <div className={`${numberSize} font-bold mt-0`}>
            {points}
          </div>
        </div>

        <button 
          onClick={() => {
            const currentIndex = multipliers.indexOf(currentMultiplier);
            const prevIndex = currentIndex === 0 ? multipliers.length - 1 : currentIndex - 1;
            setMultiplier(multipliers[prevIndex]);
          }}
          onMouseDown={() => setPressedButton(true)}
          onMouseUp={() => setPressedButton(false)}
          onMouseLeave={() => setPressedButton(false)}
          onTouchStart={() => setPressedButton(true)}
          onTouchEnd={() => setPressedButton(false)}
          className={`bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-2 py-3 self-center mx-auto h-12 w-14 mt-4 transition-all duration-100 ${
            pressedButton ? 'bg-orange-700 scale-95 opacity-80' : 'scale-100 opacity-100'
          }`}
        >
          {currentMultiplier}x
        </button>

        <div className="text-center">
          <span className="text-gray-400 text-xs">{currentMultiplier}-fach</span>
          <div className={`${numberSize} font-bold mt-0`}>
            {getDividedPoints(points)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplierCalculator;