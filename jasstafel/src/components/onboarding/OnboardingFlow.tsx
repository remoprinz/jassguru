import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa';
import type { 
  OnboardingContent, 
  BrowserOnboardingStep,
} from '../../constants/onboardingContent';
import { usePressableButton } from '../../hooks/usePressableButton';

interface OnboardingFlowProps {
  show: boolean;
  step: BrowserOnboardingStep;
  content: OnboardingContent;
  onNext: () => void;
  onPrevious: () => void;
  onDismiss: () => void;
  canBeDismissed: boolean;
  isPWA: boolean;
  isBrowserOnboarding: boolean;
}

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ 
  show, 
  step,
  content,
  onNext,
  onPrevious,
  onDismiss,
  canBeDismissed,
  isPWA,
  isBrowserOnboarding
}) => {
  // Im Development Mode direkt null zurückgeben
  if (process.env.NODE_ENV === 'development') return null;

  const previousButton = usePressableButton(onPrevious);
  const nextButton = usePressableButton(onNext);
  const isFirstStep = step === 'WELCOME_SCREEN';

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
        >
          <motion.div 
            key={step}
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white"
          >
            <div className="flex flex-col items-center justify-center">
              {isFirstStep ? (
                <WelcomeStep content={content} />
              ) : step === 'FINAL_HINTS' ? (
                <FinalStep />
              ) : (
                <StandardStep content={content} />
              )}

              {/* Navigation Buttons */}
              <NavigationButtons 
                previousButton={previousButton}
                nextButton={nextButton}
                step={step}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Separate Komponenten für bessere Übersichtlichkeit
const WelcomeStep: React.FC<{ content: OnboardingContent }> = ({ content }) => (
  <>
    <h1 className="text-3xl font-bold mb-4 text-center text-white">
      Willkommen bei Jassguru
    </h1>
    {content.image && (
      <img 
        src={content.image}
        alt="Jass Guru"
        className="w-full h-auto mb-6"
      />
    )}
    <p className="text-center text-base mb-6">
      {content.message}
    </p>
    {content.secondaryMessage && (
      <p className="text-center text-base mb-6">
        {content.secondaryMessage}
      </p>
    )}
  </>
);

const FinalStep: React.FC = () => (
  <>
    <h1 className="text-3xl font-bold mb-4 text-center text-white">
      Letzte Hinweise
    </h1>
    <img 
      src="/welcome-guru.png"
      alt="Jass Guru"
      className="w-32 h-32 object-contain mb-4"
    />
    <h3 className="text-lg font-semibold mb-3 text-gray-300">
      Achtung:
    </h3>
    <p className="text-center text-base mb-6">
      Vermeide es, die App mehrfach zu installieren – das kann zu unerwünschtem Verhalten führen!
    </p>
    <h4 className="text-lg font-semibold mb-3 text-gray-300">
      Nächster Schritt:
    </h4>
    <p className="text-center text-base mb-8">
      Du kannst das Browser-Fenster nach der Installation schliessen. Beim ersten Öffnen der App wirst du durch alle wichtigen Funktionen geführt.
    </p>
    <h2 className="text-2xl font-bold text-center mb-8">
      Gutes Jassen!
    </h2>
  </>
);

const StandardStep: React.FC<{ content: OnboardingContent }> = ({ content }) => (
  <>
    <h1 className="text-3xl font-bold mb-4 text-center text-white">
      {content.title}
    </h1>
    {content.image && (
      <div className="w-full mx-auto mb-6">
        <img 
          src={content.image}
          alt={content.title}
          className="w-full h-auto object-contain max-w-[280px] mx-auto"
        />
      </div>
    )}
    {content.icon && (
      <div className="text-yellow-600 mb-4">
        <content.icon size={48} />
      </div>
    )}
    <p className="text-center text-base mb-7">
      {content.message}
    </p>
  </>
);

interface NavigationButtonsProps {
  previousButton: ReturnType<typeof usePressableButton>;
  nextButton: ReturnType<typeof usePressableButton>;
  step: BrowserOnboardingStep;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({ 
  previousButton, 
  nextButton, 
  step
}) => (
  <div className="flex justify-between w-full gap-4">
    <button
      {...previousButton.handlers}
      className={`
        flex-1 bg-gray-600 text-white px-6 py-2 rounded-full 
        hover:bg-gray-700 transition-all duration-100 text-lg font-semibold 
        flex items-center justify-center
        ${previousButton.buttonClasses}
      `}
    >
      <FaArrowLeft className="mr-2" />
      Zurück
    </button>
    <button
      {...nextButton.handlers}
      className={`
        flex-1 bg-yellow-600 text-white px-6 py-2 rounded-full 
        hover:bg-yellow-700 transition-all duration-100 text-lg font-semibold 
        flex items-center justify-center
        ${nextButton.buttonClasses}
      `}
    >
      <>Weiter<FaArrowRight className="ml-2" /></>
    </button>
  </div>
);

export default OnboardingFlow;