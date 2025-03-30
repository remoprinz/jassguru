import { useTutorialStore } from '../store/tutorialStore';
import { TUTORIAL_COMPONENT_MAPPING, type TutorialComponent } from '../constants/tutorialComponentMapping';
import { TUTORIAL_STEPS } from '../types/tutorial';
import { useEffect } from 'react';

export const useTutorialComponent = (
  component: TutorialComponent,
  setIsContentVisible?: (visible: boolean) => void
) => {
  const { isActive, getCurrentStep, registerEvent } = useTutorialStore();
  const currentStep = getCurrentStep();
  
  useEffect(() => {
    if (!currentStep || !setIsContentVisible) return;

    // Event-Handler basierend auf Component-Type
    if (component === 'calculator' && currentStep.id === TUTORIAL_STEPS.CALCULATOR_OPEN) {
      const handleCalculatorOpen = () => setIsContentVisible(false);
      document.addEventListener('calculatorOpen', handleCalculatorOpen);
      registerEvent('calculatorOpen');
      
      return () => {
        document.removeEventListener('calculatorOpen', handleCalculatorOpen);
        setIsContentVisible(true);
      };
    }
    // ... ähnliche Logik für andere Components
  }, [component, currentStep?.id, setIsContentVisible]);
  
  // Spezialfall: Calculator und GameInfo während ihrer Steps offen lassen
  if (currentStep?.id) {
    if (component === 'calculator' && ['CALCULATOR_OPEN', 'CALCULATOR_INPUT'].includes(currentStep.id)) {
      return { preventClose: true };
    }
    if (component === 'gameInfo' && currentStep.id === TUTORIAL_STEPS.GAME_INFO) {
      return { preventClose: true };
    }
  }
  
  // Normale Logik für alle anderen Fälle
  const preventClose: boolean = !!(isActive && 
    currentStep && 
    TUTORIAL_COMPONENT_MAPPING[currentStep.id] === component);
  
  return { preventClose };
}; 