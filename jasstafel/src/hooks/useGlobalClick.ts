import { useCallback, useRef } from 'react';
import { useUIStore } from '../store/uiStore';
import { TeamPosition } from '../types/jass';

interface UseGlobalClickOptions {
  onSingleClick?: (position: TeamPosition, boxType: string) => void;
  delay?: number;
  middleLinePosition?: number;
}

export function useGlobalClick({
  onSingleClick,
  delay = 230,
  middleLinePosition = 0
}: UseGlobalClickOptions) {
  const lastClickRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const { setGameInfoOpen, setLastDoubleClickPosition } = useUIStore();

  const handleGlobalClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    const diff = now - lastClickRef.current;

    // Position bestimmen (aus StrichBox oder Y-Position)
    const target = e.target as HTMLElement;
    const strichBox = target.closest('[data-strich-box="true"]');
    const positionAttr = strichBox?.getAttribute('data-position') as TeamPosition | null;
    const boxType = strichBox?.getAttribute('data-box-type');
    
    // Falls nicht auf StrichBox geklickt -> Position aus Y-Koordinate
    const position = positionAttr || (e.clientY < middleLinePosition ? 'top' : 'bottom');

    if (diff < delay) {
      // Doppelklick -> GameInfo öffnen
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      lastClickRef.current = 0;
      setLastDoubleClickPosition(position);
      setGameInfoOpen(true);
    } else {
      // Einzelklick -> Timeout für möglichen zweiten Klick
      lastClickRef.current = now;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      timeoutRef.current = setTimeout(() => {
        lastClickRef.current = 0;
        // Nur bei Klick auf StrichBox -> Strich
        if (strichBox && positionAttr && boxType && onSingleClick) {
          onSingleClick(positionAttr, boxType);
        }
      }, delay);
    }
  }, [delay, middleLinePosition, setGameInfoOpen, setLastDoubleClickPosition, onSingleClick]);

  return { handleGlobalClick };
} 