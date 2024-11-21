import { useCallback, useRef } from 'react';

export const useDoubleClick = (callback: (e: React.MouseEvent<HTMLDivElement>) => void, delay = 250) => {
  const clickCount = useRef(0);
  const timer = useRef<NodeJS.Timeout>();

  return useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    clickCount.current += 1;

    if (timer.current) {
      clearTimeout(timer.current);
    }

    if (clickCount.current === 2) {
      callback(e);
      clickCount.current = 0;
      return;
    }

    timer.current = setTimeout(() => {
      clickCount.current = 0;
    }, delay);
  }, [callback, delay]);
};