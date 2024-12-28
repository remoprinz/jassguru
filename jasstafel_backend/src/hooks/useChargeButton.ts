// src/hooks/useChargeButton.ts
import { useState, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import type { TeamPosition, StrichTyp } from '../types/jass';
import { 
  triggerBergConfetti,  // ✅ Relativer Pfad von hooks/ zu components/
  triggerBedankenFireworks 
} from '../components/effects/effects';

export interface ChargeButtonReturn {
  isButtonActive: boolean;
  isPressed: boolean;
  handlers: {
    onMouseDown: () => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onTouchStart: () => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

export const useChargeButton = ({
  type,
  team,
  condition = true
}: {
  type: StrichTyp,
  team: TeamPosition | null,
  condition?: boolean
}): ChargeButtonReturn => {
  const [isPressed, setIsPressed] = useState(false);
  const { isBergActive, isSiegActive } = useGameStore();
  
  const isButtonActive = team ? (
    type === 'berg' ? isBergActive(team) : isSiegActive(team)
  ) : false;

  const handleStart = useCallback(() => {
    if (!team || !condition) return;
    setIsPressed(true);
  }, [team, condition]);

  const handleEnd = useCallback(() => {
    if (!team || !condition) return;
    setIsPressed(false);

    const { addBerg, addSieg } = useGameStore.getState();

    if (type === 'berg') {
      addBerg(team);
      triggerBergConfetti({ 
        position: team,
        chargeAmount: isPressed ? 1.5 : 1  // Stärkerer Effekt bei längerem Drücken
      });
    } else if (type === 'sieg') {
      addSieg(team);
      triggerBedankenFireworks({ 
        position: team,
        chargeAmount: isPressed ? 2 : 1
      });
    }
  }, [team, condition, type, isPressed]);

  return {
    isButtonActive,
    isPressed,
    handlers: {
      onMouseDown: handleStart,
      onMouseUp: handleEnd,
      onMouseLeave: () => setIsPressed(false),
      onTouchStart: handleStart,
      onTouchEnd: (e) => {
        e.preventDefault();
        handleEnd();
      }
    }
  };
};