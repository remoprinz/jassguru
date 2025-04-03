import {useCallback, useRef, useEffect} from "react";
import {useUIStore} from "../store/uiStore";
import {TeamPosition} from "../types/jass";

interface UseGlobalClickOptions {
  onSingleClick?: (position: TeamPosition, boxType: string) => void;
  delay?: number;
  middleLinePosition?: number;
}

// Eine globale Variable zur Nachverfolgung der Doppelklick-Zustände
// Diese bleibt auch bei Rerenders erhalten
const globalClickState = {
  lastClickTime: 0,
  isProcessingDoubleClick: false,
  lockUntil: 0,
};

export function useGlobalClick({
  onSingleClick,
  delay = 230,
  middleLinePosition = 0,
}: UseGlobalClickOptions) {
  const lastClickRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isDoubleClickRef = useRef(false);
  const {canOpenGameInfo, setGameInfoOpen, setLastDoubleClickPosition} = useUIStore();

  // Cleanup-Funktion für den Timer
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  const handleGlobalClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();

    // Wenn ein Klick-Lock aktiv ist, ignorieren wir den Klick komplett
    if (now < globalClickState.lockUntil) {
      console.log("🔒 Klick ignoriert - Klicksperre aktiv");
      return;
    }

    const diff = now - lastClickRef.current;
    globalClickState.lastClickTime = now;

    // Position bestimmen (aus StrichBox oder Y-Position)
    const target = e.target as HTMLElement;
    const strichBox = target.closest("[data-strich-box=\"true\"]");
    const positionAttr = strichBox?.getAttribute("data-position") as TeamPosition | null;
    const boxType = strichBox?.getAttribute("data-box-type");

    // Falls nicht auf StrichBox geklickt -> Position aus Y-Koordinate
    const position = positionAttr || (e.clientY < middleLinePosition ? "top" : "bottom");

    // Clear any existing timeout immediately to prevent race conditions
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (diff < delay) {
      // Doppelklick erkannt -> GameInfo öffnen
      console.log("🔍 Doppelklick erkannt, GameInfo wird geöffnet");
      isDoubleClickRef.current = true;
      globalClickState.isProcessingDoubleClick = true;

      // Setze einen Klick-Lock für eine kurze Zeit, um zu verhindern, dass weitere Klicks verarbeitet werden
      globalClickState.lockUntil = now + 500; // 500ms Sperre

      lastClickRef.current = 0;
      setLastDoubleClickPosition(position);

      if (canOpenGameInfo()) {
        setGameInfoOpen(true);
      }

      // Zurücksetzen des Doppelklick-Status nach einer Verzögerung
      setTimeout(() => {
        isDoubleClickRef.current = false;
        globalClickState.isProcessingDoubleClick = false;
      }, 100);

      return;
    }

    // Einzelklick -> Timeout für möglichen zweiten Klick
    lastClickRef.current = now;

    // Neuen Timeout nur setzen, wenn kein Doppelklick erkannt wurde
    if (!isDoubleClickRef.current && !globalClickState.isProcessingDoubleClick) {
      timeoutRef.current = setTimeout(() => {
        // Doppelte Sicherheit: Nur ausführen, wenn kein Doppelklick erkannt wurde und kein Lock aktiv ist
        if (!isDoubleClickRef.current &&
            !globalClickState.isProcessingDoubleClick &&
            Date.now() >= globalClickState.lockUntil &&
            strichBox && positionAttr && boxType && onSingleClick) {
          console.log("⏱️ Timeout ausgelöst, Strich wird geschrieben:", boxType);
          onSingleClick(positionAttr, boxType);
        } else {
          console.log("⏱️ Timeout ausgelöst, aber Strich wurde NICHT geschrieben - Doppelklick oder Lock erkannt");
        }

        lastClickRef.current = 0;
        timeoutRef.current = null;
      }, delay);
    }
  }, [delay, middleLinePosition, setGameInfoOpen, setLastDoubleClickPosition, onSingleClick, canOpenGameInfo]);

  return {handleGlobalClick};
}
