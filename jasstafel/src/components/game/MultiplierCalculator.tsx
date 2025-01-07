import { useState, useEffect } from 'react';
import { create } from 'zustand';
import { useUIStore } from '../../store/uiStore';
import { FARBE_MODES } from '../../config/FarbeSettings';
import type { TeamPosition, TeamScores } from '../../types/jass';
import type { ScoreSettings } from '../../types/jass';

// Multiplier-Liste für den Zyklus (1x wird nicht benötigt)
const multipliers = Array.from(new Set(FARBE_MODES.map(mode => mode.multiplier)))
  .filter((m): m is number => m > 1)
  .sort((a, b) => b - a);

type Multiplier = (typeof multipliers)[number];

interface MultiplierState {
  currentMultiplier: Multiplier;
  setMultiplier: (value: Multiplier) => void;
  getDividedPoints: (points: number) => number;
  getRemainingPoints: (team: TeamPosition, scores: TeamScores) => {
    title: string;
    remaining: number;
  };
}

export const useMultiplierStore = create<MultiplierState>((set, get) => ({
  currentMultiplier: Math.max(...multipliers.filter(m => m > 1)),
  setMultiplier: (value: Multiplier) => set({ currentMultiplier: value }),
  getDividedPoints: (points) => Math.floor(points / get().currentMultiplier),
  getRemainingPoints: (team: TeamPosition, scores: TeamScores) => {
    const { scoreSettings } = useUIStore.getState();
    
    const teamScore = scores[team];
    const oppositeTeam = team === 'top' ? 'bottom' : 'top';
    const oppositeScore = scores[oppositeTeam];

    const siegScore = scoreSettings.values.sieg;
    const bergScore = scoreSettings.values.berg;
    const schneiderScore = scoreSettings.values.schneider;
    
    // 1. Wenn Berg deaktiviert ist, direkt SIEG als Ziel
    if (!scoreSettings.enabled.berg) {
      return {
        title: 'SIEG',
        remaining: siegScore - teamScore
      };
    }

    // 2. Wenn das Gegnerteam bereits BERG hat
    if (oppositeScore >= bergScore) {
      if (!scoreSettings.enabled.schneider || teamScore >= schneiderScore) {
        return {
          title: 'SIEG',
          remaining: siegScore - teamScore
        };
      }
      if (scoreSettings.enabled.schneider) {
        return {
          title: 'SCHNEIDER',
          remaining: schneiderScore - teamScore
        };
      }
    }
    
    // 3. Wenn Team BERG hat, dann ist das Ziel SIEG
    if (teamScore >= bergScore) {
      return {
        title: 'SIEG',
        remaining: siegScore - teamScore
      };
    }
    
    // 4. Standardfall: Beide Teams haben noch kein BERG
    if (scoreSettings.enabled.berg) {
      return {
        title: 'BERG',
        remaining: bergScore - teamScore
      };
    }
    
    // 5. Fallback: Wenn weder BERG noch SCHNEIDER aktiviert sind -> SIEG
    return {
      title: 'SIEG',
      remaining: siegScore - teamScore
    };
  }
}));

interface MultiplierCalculatorProps {
  mainTitle: string;
  subTitle: string;
  points: number;
  className?: string;
  numberSize?: string;
  scoreSettings?: ScoreSettings;
  scores: TeamScores;
}

const MultiplierCalculator: React.FC<MultiplierCalculatorProps> = ({ 
  mainTitle,
  subTitle,
  points, 
  className = "",
  numberSize = "text-xl",
  scoreSettings,
  scores
}) => {
  const { currentMultiplier, setMultiplier, getDividedPoints, getRemainingPoints } = useMultiplierStore();
  const farbeSettings = useUIStore(state => state.farbeSettings);
  const [pressedButton, setPressedButton] = useState(false);

  // Aktualisiere den Multiplikator wenn sich die Farbe-Settings ändern
  useEffect(() => {
    // Konvertiere das Record-Objekt in ein Array von Werten
    const multiplierValues = Object.values(farbeSettings.multipliers);
    const highestMultiplier = Math.max(...multiplierValues.filter(m => m > 1));
    setMultiplier(Math.min(highestMultiplier, 8));
  }, [farbeSettings.multipliers, setMultiplier]);

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
            const nextIndex = currentIndex === multipliers.length - 1 ? 0 : currentIndex + 1;
            setMultiplier(multipliers[nextIndex]);
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
            {getDividedPoints(getRemainingPoints('bottom', scores).remaining)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplierCalculator;
