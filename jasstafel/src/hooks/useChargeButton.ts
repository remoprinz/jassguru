// src/hooks/useChargeButton.ts
import { useState, useEffect } from 'react';
import type { TouchEvent, MouseEvent } from 'react';
import { useJassStore } from '../store/jassStore';

interface ChargeButtonConfig {
  type: 'berg' | 'bedanken';
  onStart: () => void;
  onStop: () => void;
  chargeAmount: number;
  condition?: boolean;
  team?: 'top' | 'bottom' | null;
}

type ChargeButtonEvent = TouchEvent | MouseEvent;

export interface ChargeButtonReturn {
  isPressed: boolean;
  isButtonActive: boolean;
  handlers: {
    onMouseDown: (e?: ChargeButtonEvent) => void;
    onMouseUp: (e?: ChargeButtonEvent) => void;
    onMouseLeave: (e?: ChargeButtonEvent) => void;
    onTouchStart: (e?: ChargeButtonEvent) => void;
    onTouchEnd: (e?: ChargeButtonEvent) => void;
    onTouchCancel: (e?: ChargeButtonEvent) => void;
  };
}

export const useChargeButton = ({
  type,
  onStart,
  onStop,
  chargeAmount,
  condition,
  team
}: ChargeButtonConfig): ChargeButtonReturn => {
  const [isPressed, setIsPressed] = useState(false);
  
  const isButtonActive = useJassStore(state => {
    if (!team) return false;
    
    if (type === 'berg') {
      return state.teams[team].bergActive;
    } else {
      const hasBerg = state.teams.top.bergActive || state.teams.bottom.bergActive;
      return hasBerg && state.teams[team].bedankenActive;
    }
  });

  const handleStart = (e?: ChargeButtonEvent) => {
    e?.preventDefault();
    setIsPressed(true);
    onStart();
  };
      
  const handleStop = (e?: ChargeButtonEvent) => {
    e?.preventDefault();
    setIsPressed(false);
    onStop();
  };

  return {
    isPressed,
    isButtonActive,
    handlers: {
      onMouseDown: handleStart,
      onMouseUp: handleStop,
      onMouseLeave: handleStop,
      onTouchStart: handleStart,
      onTouchEnd: handleStop,
      onTouchCancel: handleStop
    }
  };
};