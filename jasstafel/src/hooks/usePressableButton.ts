import {useState} from "react";
import type {TouchEvent, MouseEvent} from "react";

type PressableButtonEvent = TouchEvent | MouseEvent;

export const usePressableButton = (onClick: () => void) => {
  const [isPressedDown, setIsPressedDown] = useState(false);

  const handleStart = (e?: PressableButtonEvent) => {
    e?.preventDefault();
    setIsPressedDown(true);
  };

  const handleStop = (e?: PressableButtonEvent) => {
    e?.preventDefault();
    setIsPressedDown(false);
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
