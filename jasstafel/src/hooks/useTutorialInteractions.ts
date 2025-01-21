import { useEffect, useCallback } from 'react';
import { useTutorialStore } from '../store/tutorialStore';
import type { TeamPosition } from '../types/jass';
import { TUTORIAL_STEPS } from '../types/tutorial';

interface TutorialInteractionProps {
  onSwipe: (direction: 'up' | 'down' | 'left' | 'right', position: TeamPosition) => void;
  onLongPress: (position: TeamPosition) => void;
  handleTafelClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const useTutorialInteractions = ({
  onSwipe,
  onLongPress,
  handleTafelClick,
}: TutorialInteractionProps) => {
  const { 
    isActive,
    getCurrentStep,
    nextStep
  } = useTutorialStore();
  
  const currentStep = getCurrentStep();

  const handleSwipe = useCallback((
    direction: 'up' | 'down' | 'left' | 'right',
    position: TeamPosition
  ) => {
    if (!isActive) return onSwipe(direction, position);

    const currentStep = getCurrentStep();
    
    // Erlaube Swipes für MENU_GESTURE und NAVIGATE_SCORES
    if (currentStep?.id === TUTORIAL_STEPS.MENU_GESTURE && 
        ['up', 'down'].includes(direction)) {
      onSwipe(direction, position);
      return;
    }

    // Erlaube horizontale Swipes für NAVIGATE_SCORES
    if (currentStep?.id === TUTORIAL_STEPS.NAVIGATE_SCORES && 
        ['left', 'right'].includes(direction)) {
      onSwipe(direction, position);
      return;
    }
  }, [isActive, currentStep?.id]);

  const handleLongPress = useCallback((position: TeamPosition) => {
    const currentStep = getCurrentStep();
    onLongPress(position);

    if (isActive && currentStep?.action?.type === 'longpress') {
      if (currentStep.id === TUTORIAL_STEPS.CALCULATOR_OPEN) {
        document.dispatchEvent(new Event('calculatorOpen'));
        return;
      } 
      nextStep();
    }
  }, [isActive, currentStep?.id]);

  const handleGlobalDoubleClick = useCallback((e: MouseEvent, position: TeamPosition) => {
    const currentStep = getCurrentStep();
    
    if (isActive) {
      if (currentStep?.id === TUTORIAL_STEPS.GAME_INFO) {
        handleTafelClick(e as any);
        document.dispatchEvent(new Event('gameInfoOpen'));
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    handleTafelClick(e as any);
  }, [isActive, currentStep?.id]);

  useEffect(() => {
    if (!isActive || !currentStep) return;
    
    if (currentStep.id === TUTORIAL_STEPS.BASIC_COMPLETE) {
      console.log('🎓 Completing tutorial...');
      const tutorialStore = useTutorialStore.getState();
      tutorialStore.endTutorial(true);
    }
  }, [isActive, currentStep?.id]);

  return {
    handleSwipe,
    handleLongPress,
    handleGlobalDoubleClick
  };
}; 