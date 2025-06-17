import {useCallback, useRef, useEffect} from "react";
import {useUIStore} from "../store/uiStore";
import {TeamPosition} from "../types/jass";
import {useTutorialStore} from "../store/tutorialStore";

interface UseGlobalClickOptions {
  onSingleClick?: (position: TeamPosition, boxType: string) => void;
  onDoubleClick?: (position: TeamPosition, boxType: string | null | undefined) => void;
  delay?: number;
  middleLinePosition?: number;
}

// Entferne das globale State-Objekt
// const globalClickState = {
//   lastClickTime: 0,
//   isProcessingDoubleClick: false,
//   lockUntil: 0,
// };

export function useGlobalClick({
  onSingleClick,
  onDoubleClick,
  delay = 230,
  middleLinePosition = 0,
}: UseGlobalClickOptions) {
  // Refs für den Zustand innerhalb des Hooks
  const lastClickTimeRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingDoubleClickRef = useRef(false);
  const lockUntilRef = useRef(0);
  // isDoubleClickRef wird nicht mehr benötigt, isProcessingDoubleClickRef reicht

  const {canOpenGameInfo, setGameInfoOpen, setLastDoubleClickPosition, isReadOnlyMode, isGlobalClickDisabled} = useUIStore();

  // Cleanup-Funktion für den Timer
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        // timeoutRef.current = null; // Nicht notwendig im Cleanup
      }
    };
  }, []);

  const handleGlobalClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // NEU: Globale Sperre prüfen
    if (isGlobalClickDisabled) {
      console.log("🚫 Klick ignoriert: Globale Sperre ist aktiv.");
      return;
    }

    // NEU: Validiere, dass es sich um einen echten User-Click handelt
    if (!e.isTrusted) {
      console.warn("🚫 Synthetischer Click ignoriert - kein echter User-Click", {
        type: e.type,
        timeStamp: e.timeStamp,
        target: (e.target as HTMLElement)?.tagName,
      });
      return;
    }

    const now = Date.now();

    // Lock prüfen
    if (now < lockUntilRef.current) {
      // Innerhalb der Sperrzeit -> Klick ignorieren
      // console.log("🔒 Klick ignoriert - Klicksperre aktiv");
      return;
    }

    const diff = now - lastClickTimeRef.current;

    // Position bestimmen
    const target = e.target as HTMLElement;
    const strichBox = target.closest("[data-strich-box=\"true\"]"); // Escape quotes for string literal
    const positionAttr = strichBox?.getAttribute("data-position") as TeamPosition | null;
    const boxType = strichBox?.getAttribute("data-box-type");
    const position = positionAttr || (e.clientY < middleLinePosition ? "top" : "bottom");

    // Vorhandenen Timeout löschen
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // --- NEU: Doppelklick-Logik mit Klicksperre --- 
    if (now - lastClickTimeRef.current < delay) {
      // Doppelklick erkannt
      // console.log("🔍 Doppelklick erkannt");
      if (onDoubleClick) {
         onDoubleClick(position, boxType);
      }
      timeoutRef.current = null;
      lastClickTimeRef.current = 0; // Doppelklick zurücksetzen
      isProcessingDoubleClickRef.current = true; // Doppelklick wird verarbeitet
      lockUntilRef.current = now + 250; // Kurze Sperre
      // Doppelklick-Verarbeitung nach kurzer Zeit zurücksetzen
      setTimeout(() => {
 isProcessingDoubleClickRef.current = false;
}, 50);
    } else {
    // --- Einzelklick-Logik ---
    // Zeit des aktuellen Klicks speichern für die nächste Prüfung
    lastClickTimeRef.current = now;

    // Nur Timeout für Einzelklick setzen, wenn nicht gerade ein Doppelklick verarbeitet wird
    if (!isProcessingDoubleClickRef.current) {
      timeoutRef.current = setTimeout(() => {
        // Prüfungen, bevor der Einzelklick ausgeführt wird:
        if (Date.now() >= lockUntilRef.current && // Ist die Sperre abgelaufen?
            !isProcessingDoubleClickRef.current && // Wird gerade ein Doppelklick verarbeitet? (Sicherheitscheck)
            strichBox && positionAttr && boxType && onSingleClick) // Sind alle Daten für Einzelklick vorhanden?
        {
          console.log("🖱️ Einzelklick ausgeführt für:", boxType, positionAttr);
          onSingleClick(positionAttr, boxType);
        } else {
          // console.log("🖱️ Einzelklick verhindert", { lock: Date.now() < lockUntilRef.current, processing: isProcessingDoubleClickRef.current });
        }

        // Zustand nach Timeout zurücksetzen
        lastClickTimeRef.current = 0;
        timeoutRef.current = null;
      }, delay);
    } else {
      // Wenn isProcessingDoubleClickRef.current true ist, wird kein Timeout gesetzt.
      // Der nächste Klick wird entweder durch den Lock blockiert oder startet eine neue Erkennung.
      // console.log("🖱️ Einzelklick-Timeout übersprungen, da Doppelklick verarbeitet wird.");
    }
  }

  }, [delay, middleLinePosition, setGameInfoOpen, setLastDoubleClickPosition, onSingleClick, canOpenGameInfo, isReadOnlyMode]);

  return {handleGlobalClick};
}
