import { useRef, useCallback } from 'react';

export const useClickDelay = (delay: number = 300) => {
  const lastClickTime = useRef<number>(0);
  const clickCount = useRef<number>(0);
  const timer = useRef<NodeJS.Timeout>();

  const shouldHandleClick = useCallback(() => {
    const currentTime = Date.now();
    const timeDiff = currentTime - lastClickTime.current;
    
    // Zähle den Klick
    clickCount.current += 1;

    // Setze Timer für Zurücksetzen des Klickzählers
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => {
      clickCount.current = 0;
    }, delay);

    // Wenn es ein Doppelklick ist (2 Klicks innerhalb der Verzögerung)
    if (clickCount.current === 2 && timeDiff < delay) {
      clickCount.current = 0;
      lastClickTime.current = 0;
      return 'doubleClick';
    }

    // Wenn der letzte Klick zu schnell war
    if (timeDiff < delay) {
      lastClickTime.current = currentTime;
      return 'tooFast';
    }

    // Erlaubter Einzelklick
    lastClickTime.current = currentTime;
    return 'valid';
  }, [delay]);

  return shouldHandleClick;
};