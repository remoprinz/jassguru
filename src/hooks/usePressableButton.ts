import {useState, useRef} from "react";
import type {TouchEvent, MouseEvent} from "react";

type PressableButtonEvent = TouchEvent | MouseEvent;

export const usePressableButton = (onClick: () => void) => {
  const [isPressedDown, setIsPressedDown] = useState(false);
  
  // 🔧 FIX: Ref für Debouncing von doppelten Touch/Mouse Events
  const lastClickTimeRef = useRef<number>(0);

  const handleStart = (e?: PressableButtonEvent) => {
    setIsPressedDown(true);
  };

  const handleStop = (e?: PressableButtonEvent) => {
    setIsPressedDown(false);
    
    // 🔧 FIX: Verhindere doppelte Events durch Debouncing
    const now = Date.now();
    if (now - lastClickTimeRef.current < 50) { // 50ms Debounce
      return;
    }
    
    lastClickTimeRef.current = now;
    onClick();
  };

  return {
    isPressedDown,
    handlers: {
      onMouseDown: handleStart,
      onMouseUp: handleStop,
      onMouseLeave: () => setIsPressedDown(false),
      onTouchStart: handleStart,
      onTouchEnd: handleStop,
    },
    buttonClasses: `
      transition-all duration-100
      ${isPressedDown ?
    "scale-95 opacity-80" :
    "scale-100 opacity-100"
}
    `,
  };
};
