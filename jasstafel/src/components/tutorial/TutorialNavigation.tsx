import React from 'react';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import { useTutorialStore } from '../../store/tutorialStore';
import { usePressableButton } from '../../hooks/usePressableButton';

interface NavigationButtonProps {
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}

const NavigationButton: React.FC<NavigationButtonProps> = ({ 
  onClick, 
  className = '', 
  children 
}) => {
  const buttonProps = usePressableButton(onClick);
  
  return (
    <button
      {...buttonProps.handlers}
      className={`
        min-w-[140px] h-12 px-6 rounded-full text-white font-semibold
        transition-colors duration-100 flex items-center justify-center
        ${buttonProps.buttonClasses}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

interface NavigationProps {
  onNext?: () => void;
  showBackButton?: boolean;
  isFirstStep?: boolean;
  isLastStep?: boolean;
}

const TutorialNavigation: React.FC<NavigationProps> = ({ 
  onNext,
  showBackButton = true,
  isFirstStep = false,
  isLastStep = false
}) => {
  const { previousStep, nextStep } = useTutorialStore();

  const handleNext = () => {
    if (isLastStep && onNext) {
      onNext();
    } else {
      nextStep();
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      {showBackButton && !isFirstStep && (
        <NavigationButton
          onClick={previousStep}
          className="bg-gray-600 hover:bg-gray-700 active:bg-gray-600"
        >
          <FaArrowLeft className="mr-2" />
          Zurück
        </NavigationButton>
      )}

      <NavigationButton
        onClick={handleNext}
        className={`bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-600 
          ${!showBackButton || isFirstStep ? 'ml-auto' : ''}`}
      >
        {isLastStep ? 'Fertig' : 'Weiter'}
        {!isLastStep && <FaArrowRight className="ml-2" />}
      </NavigationButton>
    </div>
  );
};

export default TutorialNavigation; 