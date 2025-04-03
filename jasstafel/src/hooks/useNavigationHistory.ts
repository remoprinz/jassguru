// useNavigationHistory.ts
import {useCallback, useRef} from "react";
import {useGameStore} from "../store/gameStore";
import {useUIStore} from "../store/uiStore";
import type {TeamPosition} from "../types/jass";

const SWIPE_DEBOUNCE = 300; // ms

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

  return {
    handleSwipe,
    isInPast: currentHistoryIndex > -1,
    canNavigateForward,
    canNavigateBackward,
  };
};
