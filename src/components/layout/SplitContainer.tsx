import React, {useState, useEffect, forwardRef} from "react";
import {animated, SpringValue} from "react-spring";
import ZShape from "./ZShape";
import useSwipeGesture from "../../hooks/useSwipeGesture";
import StrichContainer from "./StrichContainer";
import type {TeamPosition} from "../../types/jass";
import {useUIStore} from "../../store/uiStore";
import {useTutorialStore} from "../../store/tutorialStore";
import {TUTORIAL_STEPS} from "../../types/tutorial";

interface SplitContainerProps {
  position: TeamPosition;
  height: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
  padding: string;
  onSwipe: (direction: "up" | "down" | "left" | "right", position: TeamPosition) => void;
  y: SpringValue<number>;
  mainOpacity: SpringValue<number>;
  getBrightness: (y: number) => number;
  onLongPress: (position: TeamPosition) => void;
  score: number;
  triggerBlendEffect: (position: TeamPosition) => void;
  isHistoryNavigationActive?: boolean;
  onDoubleClick?: (position: TeamPosition) => void;
}

const SplitContainer = forwardRef<HTMLDivElement, SplitContainerProps>(({
  position,
  height,
  zShapeConfig,
  padding,
  onSwipe,
  y,
  mainOpacity,
  getBrightness,
  onLongPress,
  score,
  triggerBlendEffect,
  isHistoryNavigationActive,
  onDoubleClick,
}, ref) => {
  const {isOpen: isSplitOpen, position: splitPosition} = useUIStore((state) => state.splitContainer);
  const isMenuOpen = useUIStore((state) => state.isMenuOpen);
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const {isActive: isTutorialActive, getCurrentStep} = useTutorialStore();
  const [lastTapTime, setLastTapTime] = useState(0);
  const DOUBLE_TAP_DELAY = 300;
  const lastClickTimeRef = React.useRef<number>(0);
  const isPressedDownRef = React.useRef<boolean>(false);
  const LONG_PRESS_DELAY = 400;

  const handleMouseDown = () => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;

    // Wenn der letzte Klick weniger als DOUBLE_TAP_DELAY her ist,
    // starten wir KEINEN Long-Press-Timer
    if (timeSinceLastClick < DOUBLE_TAP_DELAY) {
      // console.log("🔍 Potential double-click detected, skipping longpress");
      return;
    }

    const tutorialState = useTutorialStore.getState();
    // const shouldAllowPress = !tutorialState.isActive || tutorialState.getCurrentStep()?.allowTouchPassthrough; // Auskommentiert, da fehlerhaft

    // console.log("🔍 MouseDown:", {
    //   isTutorialActive: tutorialState.isActive,
    //   currentStep: tutorialState.getCurrentStep()?.id,
    //   shouldAllowPress, // Auskommentiert
    // });

    // Originale Bedingung wiederherstellen, aber auskommentieren, da `allowTouchPassthrough` fehlt
    // if (!shouldAllowPress) return;

    // Zeitdifferenz zum letzten Klick prüfen
    const timeSinceLastClickRef = now - lastClickTimeRef.current;

    // Long-Press Timer starten
    setPressTimer(setTimeout(() => {
      // Wenn der Timer abläuft UND die Maus immer noch gedrückt ist...
      if (isPressedDownRef.current) {
        // console.log("⏰ Timer fired - calling onLongPress");
        onLongPress(position); // Longpress-Callback auslösen
      }
    }, LONG_PRESS_DELAY));

    lastClickTimeRef.current = now;
    isPressedDownRef.current = true;
  };

  const handleMouseUp = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
    }
    isPressedDownRef.current = false;
  };

  useEffect(() => {
    return () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
      }
    };
  }, [pressTimer]);

  useSwipeGesture({
    onSwipeLeft: () => onSwipe("left", position),
    onSwipeRight: () => onSwipe("right", position),
    onSwipeUp: () => onSwipe("up", position),
    onSwipeDown: () => onSwipe("down", position),
    element: position,
  });

  const containerStyle: React.CSSProperties = {
    width: "100%",
    position: "absolute",
    left: 0,
    right: 0,
    overflow: "visible",
    height: `${height}px`,
    [position]: 0,
    [padding]: "env(safe-area-inset-top)",
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    touchAction: "none",
  };

  const zShapeStyle: React.CSSProperties = {
    position: "absolute",
    width: "110%",
    left: "-1%",
    [position === "top" ? "bottom" : "top"]: `${zShapeConfig.innerSpacing * 1.5}px`,
    height: `calc(100% - ${zShapeConfig.edgeSpacing * 1.5 + zShapeConfig.innerSpacing * 0.8}px)`,
  };

  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "white",
    pointerEvents: "none",
  };

  const handleTap = (e: React.TouchEvent) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTapTime;

    if (tapLength < DOUBLE_TAP_DELAY && tapLength > 0) {
      // Double tap detected
      const currentStep = getCurrentStep();

      if (isTutorialActive) {
        if (currentStep?.id === TUTORIAL_STEPS.GAME_INFO) {
          onDoubleClick?.(position);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      onDoubleClick?.(position);
    }

    setLastTapTime(currentTime);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const currentStep = getCurrentStep();

    if (isTutorialActive) {
      if (currentStep?.id === TUTORIAL_STEPS.GAME_INFO) {
        onDoubleClick?.(position);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    onDoubleClick?.(position);
  };

  return (
    <animated.div
      style={{
        ...containerStyle,
        transform: y.to((value) => {
          if (isSplitOpen && position === splitPosition) {
            return `translateY(${position === "top" ? -100 : 100}%)`;
          }
          return value === 0 ? "none" : `translateY(${position === "top" ? -value : value}px)`;
        }),
      }}
      data-swipe-area={position}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={(e) => {
        handleMouseDown();
        handleTap(e);
      }}
      onTouchEnd={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
      onDoubleClick={handleDoubleClick}
    >
      <div style={zShapeStyle}>
        <ZShape
          className="w-full h-full text-chalk-red"
          position={position}
          isReversed={position === "top"}
        />
      </div>
      <animated.div
        style={{
          ...overlayStyle,
          opacity: y.to(getBrightness),
        }}
      />
      <animated.div
        className="absolute inset-0 flex items-center justify-center"
        style={{opacity: mainOpacity}}
      >
        <span
          className="text-gray-300 text-[9rem] opacity-50 select-none"
          style={{transform: position === "top" ? "rotate(180deg)" : "none"}}
        >
          {score}
        </span>
      </animated.div>
      <StrichContainer
        position={position}
        onBlendEffect={triggerBlendEffect}
        score={score}
        isInteractionDisabled={isMenuOpen}
      />
    </animated.div>
  );
});

// Display-Name für die Komponente hinzufügen
SplitContainer.displayName = "SplitContainer";

export default SplitContainer;
