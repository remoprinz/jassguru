// useNavigationHistory.ts
import {useCallback, useRef, useEffect} from "react";
import {useGameStore} from "../store/gameStore";
import {useUIStore} from "../store/uiStore";
import type {TeamPosition} from "../types/jass";

// Typendefinition direkt hier
type NavigationDirection = "forward" | "backward";

const SWIPE_DEBOUNCE = 300; // ms
const NAVIGATION_COOLDOWN = 500; // ms zwischen Navigationsaktionen

export const useNavigationHistory = (position: TeamPosition) => {
  const {
    navigateHistory,
    canNavigateForward,
    canNavigateBackward,
    currentHistoryIndex,
    validateHistoryAction,
  } = useGameStore();

  const {showHistoryWarning} = useUIStore();

  const lastSwipeTime = useRef<number>(Date.now());
  const lastActionTimestamp = useRef(0);

  const performNavigation = useCallback((direction: "forward" | "backward") => {
    if (!validateHistoryAction()) return;
    navigateHistory(direction);
  }, [navigateHistory, validateHistoryAction]);

  const handleSwipe = useCallback((direction: "left" | "right") => {
    const now = Date.now();
    if (now - lastSwipeTime.current < SWIPE_DEBOUNCE) return;
    lastSwipeTime.current = now;

    const isTop = position === "top";

    const shouldNavigateForward =
      (isTop && direction === "left") ||
      (!isTop && direction === "right");

    const canNavigate = shouldNavigateForward ?
      canNavigateForward() :
      canNavigateBackward();

    if (!canNavigate) return;

    navigateHistory(shouldNavigateForward ? "forward" : "backward");
  }, [position, navigateHistory, canNavigateForward, canNavigateBackward]);

  // Navigation mit Debouncing
  const handleNavigationWithDebounce = useCallback((direction: NavigationDirection) => {
    const now = Date.now();
    
    // Prüfen, ob genug Zeit seit der letzten Aktion vergangen ist
    if (now - lastActionTimestamp.current < NAVIGATION_COOLDOWN) {
      console.log(`[useNavigationHistory] Debouncing navigation: ${NAVIGATION_COOLDOWN - (now - lastActionTimestamp.current)}ms cooldown remaining`);
      return;
    }
    
    lastActionTimestamp.current = now;
    
    navigateHistory(direction);
  }, [navigateHistory]);

  // Helfer für die Benutzeroberfläche
  const navigateBack = useCallback(() => {
    handleNavigationWithDebounce('backward');
  }, [handleNavigationWithDebounce]);

  const navigateForward = useCallback(() => {
    handleNavigationWithDebounce('forward');
  }, [handleNavigationWithDebounce]);

  return {
    handleSwipe,
    isInPast: currentHistoryIndex > -1,
    canNavigateForward,
    canNavigateBackward,
    navigateBack,
    navigateForward,
  };
};
