import React, {useState, useEffect, useMemo} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {FaArrowLeft, FaArrowRight} from "react-icons/fa";
import type {
  OnboardingContent,
  BrowserOnboardingStep,
} from "../../constants/onboardingContent";
import {usePressableButton} from "../../hooks/usePressableButton";
import {useDeviceScale} from "../../hooks/useDeviceScale";
// isDev-Import entfernt - wird nicht mehr benötigt

// Neue Funktion zur Erkennung von Desktop-Geräten
function isDesktopDevice() {
  // Wenn im Browser ausgeführt
  if (typeof window !== "undefined") {
    // Keine Touch-Unterstützung deutet auf Desktop hin
    if (!("ontouchstart" in window || navigator.maxTouchPoints > 0)) {
      return true;
    }
    // Große Bildschirme sind wahrscheinlich Desktops (>= 1024px)
    if (window.innerWidth >= 1024) {
      return true;
    }
  }
  return false;
}

// QR-Code URL
const QR_CODE_URL = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent("https://jassguru.web.app")}`;

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
  isBrowserOnboarding,
}) => {
  // 🔧 GEÄNDERT: Keine pauschale isDev-Blockierung mehr
  // Das Onboarding wird jetzt durch die show-Prop gesteuert

  // Hooks MÜSSEN hier oben und unbedingt aufgerufen werden
  const {overlayScale, urlBarPosition} = useDeviceScale();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [availableContentHeight, setAvailableContentHeight] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const previousButtonHandlers = usePressableButton(onPrevious);
  const nextButtonHandlers = usePressableButton(onNext);

  // Erfasst die Viewport-Dimensionen und überprüft, ob es sich um einen Desktop handelt
  useEffect(() => {
    const updateDimensions = () => {
      setViewportHeight(window.innerHeight);

      // Berechne die verfügbare Höhe für den Inhalt (abzüglich Navigation und Padding)
      const estimatedHeaderHeight = 60; // Überschrift
      const estimatedButtonHeight = 60; // Navigationsbuttons
      const estimatedVerticalPadding = 48; // Padding oben und unten
      const estimatedContentHeight = window.innerHeight - estimatedHeaderHeight - estimatedButtonHeight - estimatedVerticalPadding;
      setAvailableContentHeight(estimatedContentHeight);

      // Überprüfe, ob es sich um ein Desktop-Gerät handelt
      setIsDesktop(isDesktopDevice());
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  // Berechnet die optimale Skalierung für verschiedene Bildschirmgrößen
  const deviceSize = useMemo(() => {
    // Weniger strenge Bedingungen für große Geräte
    if (viewportHeight < 600) return "xs"; // Sehr kleine Geräte
    if (viewportHeight < 700) return "sm"; // Kleine Geräte
    if (viewportHeight >= 750) return "lg"; // Große Geräte - weniger strenge Bedingung
    return "md"; // Standard Geräte
  }, [viewportHeight]);

  // Berechne die optimale Bildgröße basierend auf dem verfügbaren Platz
  const optimalImageHeight = useMemo(() => {
    // Verwende 40% der verfügbaren Content-Höhe für das Bild, aber mindestens 100px
    const calculatedHeight = Math.max(Math.floor(availableContentHeight * 0.4), 100);
    // Begrenze auf maximal 220px
    return Math.min(calculatedHeight, 220);
  }, [availableContentHeight]);

  // Berechne die optimale Bildgröße für Standard-Schritt-Bilder
  const optimalStepImageHeight = useMemo(() => {
    // Für die Schritt-Bilder großzügigere Basiswerte verwenden
    const baseHeight = deviceSize === "lg" ? 380 : deviceSize === "md" ? 320 :
      deviceSize === "sm" ? 260 : 220;

    // Begrenze die Höhe auf 65% der verfügbaren Content-Höhe - mehr Platz nutzen
    return Math.min(baseHeight, Math.floor(availableContentHeight * 0.65));
  }, [availableContentHeight, deviceSize]);

  const isFirstStep = step === "WELCOME_SCREEN";
  const isWelcomeStep = step === "WELCOME_SCREEN" || step === "INSTALL_WELCOME";

  // Neuer Spezialfall: Prüfen, ob QR-Code angezeigt werden soll
  const shouldShowQRCode = isDesktop && step === "INSTALL_WELCOME";

  // Dynamische Padding-Anpassung basierend auf der Gerätegroße
  const getPadding = () => {
    switch (deviceSize) {
    case "xs": return "p-3";
    case "sm": return "p-4";
    case "lg": return "p-6";
    default: return "p-5";
    }
  };

  // Zusätzliche Prüfung: Nur rendern, wenn 'show' true ist (redundant mit AnimatePresence, aber schadet nicht)
  if (!show) {
     return null;
  }
  
  // NEU: Zusätzlicher Schutz für öffentliche View-Pfade
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/view/')) {
    return null; // Niemals OnboardingFlow auf öffentlichen View-Pfaden zeigen
  }

  // JSX wird nur zurückgegeben, wenn NICHT im Development Mode und show=true
  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Dunkler Hintergrund-Overlay */}
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className="fixed inset-0 bg-black/90 z-[99998]"
          />

          {/* Onboarding Content */}
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            className={`fixed inset-0 flex items-center justify-center z-[99999] 
              ${urlBarPosition === "top" ? "pt-8 sm:pt-16 pb-4 sm:pb-8" : "pt-4 sm:pt-8 pb-8 sm:pb-16"}`}
          >
            <motion.div
              key={step}
              initial={{scale: 0.95}}
              animate={{
                scale: overlayScale,
                y: urlBarPosition === "top" ? (deviceSize === "xs" ? 20 : 40) : (deviceSize === "xs" ? -20 : -40),
              }}
              exit={{scale: 0.95}}
              className={`bg-gray-800 ${getPadding()} rounded-lg shadow-lg w-full relative text-white 
                max-w-xs sm:max-w-sm md:max-w-md 
                ${deviceSize === "xs" ? "max-h-[90vh] overflow-y-auto" : ""}`}
            >
              <div className="flex flex-col items-center justify-center">
                {isWelcomeStep ? (
                  shouldShowQRCode ? (
                    <QRCodeStep
                      content={content}
                      deviceSize={deviceSize}
                      optimalImageHeight={optimalImageHeight}
                    />
                  ) : (
                    <WelcomeStep
                      content={content}
                      deviceSize={deviceSize}
                      optimalImageHeight={optimalImageHeight}
                    />
                  )
                ) : step === "FINAL_HINTS" ? (
                  <FinalStep
                    deviceSize={deviceSize}
                    optimalImageHeight={optimalImageHeight}
                    optimalStepImageHeight={optimalStepImageHeight}
                  />
                ) : (
                  <StandardStep
                    content={content}
                    deviceSize={deviceSize}
                    optimalImageHeight={optimalImageHeight}
                    optimalStepImageHeight={optimalStepImageHeight}
                  />
                )}

                {/* Navigation Buttons */}
                <NavigationButtons
                  previousButton={previousButtonHandlers}
                  nextButton={nextButtonHandlers}
                  step={step}
                  deviceSize={deviceSize}
                  optimalImageHeight={optimalImageHeight}
                  optimalStepImageHeight={optimalStepImageHeight}
                />
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// Neue QR-Code-Komponente für Desktop-Geräte
const QRCodeStep: React.FC<{ content: OnboardingContent } & StepComponentProps> = ({
  content,
  deviceSize,
  optimalImageHeight,
}) => {
  // Dynamische Klassen basierend auf Gerätegroße
  const getTitleClass = () => {
    switch (deviceSize) {
    case "xs": return "text-2xl mb-2";
    case "sm": return "text-2xl mb-3";
    case "lg": return "text-3xl mb-5";
    default: return "text-3xl mb-4";
    }
  };

  const getTextClass = () => {
    switch (deviceSize) {
    case "xs": return "text-sm mb-3";
    case "sm": return "text-base mb-4";
    case "lg": return "text-base mb-6";
    default: return "text-base mb-5";
    }
  };

  // Bestimme die QR-Code-Größe basierend auf dem verfügbaren Platz
  const qrCodeSize = Math.min(optimalImageHeight * 1.2, 220);

  // Verwende die Desktop-spezifischen Eigenschaften, wenn vorhanden
  const title = content.desktopTitle || content.title;
  const message = content.desktopMessage || content.message;
  const secondaryMessage = content.desktopSecondaryMessage || content.secondaryMessage;

  return (
    <>
      <h1 className={`font-bold text-center text-white ${getTitleClass()}`}>
        {title}
      </h1>
      <div className={`flex justify-center items-center ${deviceSize === "xs" ? "mb-2" : deviceSize === "sm" ? "mb-3" : "mb-5"}`}>
        <img
          src={QR_CODE_URL}
          alt="QR-Code für Jassguru App"
          style={{height: `${qrCodeSize}px`, width: `${qrCodeSize}px`}}
          className="object-contain bg-white p-2 rounded-md"
        />
      </div>
      <p className={`
        text-center whitespace-pre-line ${getTextClass()}
      `}>
        {message}
      </p>
      {secondaryMessage && (
        <p className={`text-center ${deviceSize === "xs" ? "text-sm mb-3" : "text-base mb-6"}`}>
          {secondaryMessage}
        </p>
      )}
    </>
  );
};

// Separate Komponenten mit angepasstem Responsive Design
interface StepComponentProps {
  deviceSize: string;
  optimalImageHeight: number;
  optimalStepImageHeight?: number;
}

const WelcomeStep: React.FC<{ content: OnboardingContent } & StepComponentProps> = ({
  content,
  deviceSize,
  optimalImageHeight,
}) => {
  // Dynamische Klassen basierend auf Gerätegroße
  const getTitleClass = () => {
    switch (deviceSize) {
    case "xs": return "text-2xl mb-2";
    case "sm": return "text-2xl mb-3";
    case "lg": return "text-3xl mb-5";
    default: return "text-3xl mb-4";
    }
  };

  const getTextClass = () => {
    switch (deviceSize) {
    case "xs": return "text-sm mb-3";
    case "sm": return "text-base mb-4";
    case "lg": return "text-base mb-6";
    default: return "text-base mb-5";
    }
  };

  return (
    <>
      <h1 className={`font-bold text-center text-white ${getTitleClass()}`}>
        {content.title}
      </h1>
      {content.image && (
        <img
          src={content.image}
          alt="Jass Guru"
          style={{height: `${optimalImageHeight}px`}}
          className={`w-auto object-contain ${deviceSize === "xs" ? "mb-2" : deviceSize === "sm" ? "mb-3" : "mb-5"}`}
        />
      )}
      <p className={`
        text-center whitespace-pre-line ${getTextClass()}
        ${content.title === "Jassguru in 3 Schritten" && (deviceSize === "md" || deviceSize === "lg") ? "mb-12" : ""}
      `}>
        {content.message}
      </p>
      {content.secondaryMessage && (
        <p className={`text-center ${deviceSize === "xs" ? "text-sm mb-3" : "text-base mb-6"}`}>
          {content.secondaryMessage}
        </p>
      )}
    </>
  );
};

const FinalStep: React.FC<StepComponentProps> = ({
  deviceSize,
  optimalImageHeight,
  optimalStepImageHeight = optimalImageHeight,
}) => {
  const getHeadingClass = () => {
    switch (deviceSize) {
    case "xs": return "text-xl mb-2";
    case "sm": return "text-2xl mb-3";
    case "lg": return "text-3xl mb-4";
    default: return "text-3xl mb-4";
    }
  };

  const getSubheadingClass = () => {
    switch (deviceSize) {
    case "xs": return "text-base mb-2";
    case "sm": return "text-lg mb-2";
    case "lg": return "text-xl mb-3";
    default: return "text-lg mb-3";
    }
  };

  const getTextClass = () => {
    switch (deviceSize) {
    case "xs": return "text-sm mb-3";
    case "sm": return "text-base mb-4";
    case "lg": return "text-base mb-6";
    default: return "text-base mb-5";
    }
  };

  // Berechne die Bildgröße - für dieses Bild etwas kleiner
  const finalImageHeight = Math.min(optimalImageHeight * 0.8, 180);

  return (
    <>
      <h1 className={`font-bold text-center text-white ${getHeadingClass()}`}>
        Letzte Hinweise
      </h1>
      <img
        src="/welcome-guru.png"
        alt="Jass Guru"
        style={{height: `${finalImageHeight}px`, width: "auto"}}
        className={`object-contain ${deviceSize === "xs" ? "mb-2" : deviceSize === "sm" ? "mb-3" : "mb-4"}`}
      />
      <h3 className={`font-semibold text-gray-300 ${getSubheadingClass()}`}>
        Achtung:
      </h3>
      <p className={`text-center ${getTextClass()}`}>
        Vermeide es, die App mehrfach zu installieren.
      </p>
      <h4 className={`font-semibold text-gray-300 ${getSubheadingClass()}`}>
        Nächster Schritt:
      </h4>
      <p className={`text-center ${getTextClass()}`}>
        Du kannst das Browser-Fenster nach der Installation schliessen. Beim ersten Öffnen der App wirst du durch alle wichtigen Funktionen geführt.
      </p>
      <h2 className={`font-bold text-center ${deviceSize === "xs" ? "text-xl mb-4" : deviceSize === "lg" ? "text-2xl mb-8" : "text-2xl mb-6"}`}>
        Gutes Jassen!
      </h2>
    </>
  );
};

const StandardStep: React.FC<{ content: OnboardingContent } & StepComponentProps> = ({
  content,
  deviceSize,
  optimalImageHeight,
  optimalStepImageHeight = optimalImageHeight,
}) => {
  const getHeadingClass = () => {
    switch (deviceSize) {
    case "xs": return "text-xl mb-2";
    case "sm": return "text-2xl mb-3";
    case "lg": return "text-3xl mb-5";
    default: return "text-3xl mb-4";
    }
  };

  const getIconSize = () => {
    switch (deviceSize) {
    case "xs": return 36;
    case "sm": return 42;
    case "lg": return 56; // Größeres Icon für große Geräte
    default: return 48;
    }
  };

  const getTextClass = () => {
    switch (deviceSize) {
    case "xs": return "text-sm mb-4";
    case "sm": return "text-base mb-5";
    case "lg": return "text-base mb-7";
    default: return "text-base mb-6";
    }
  };

  // Berechne einen angemessenen Maximalwert für die Bildbreite - großzügiger für große Geräte
  const maxWidth = deviceSize === "xs" ? 220 : deviceSize === "sm" ? 260 :
    deviceSize === "lg" ? 420 : 340;

  return (
    <>
      <h1 className={`font-bold text-center text-white ${getHeadingClass()}`}>
        {content.title}
      </h1>
      {content.image && (
        <div className={`w-full mx-auto ${deviceSize === "xs" ? "mb-3" : deviceSize === "lg" ? "mb-6" : "mb-5"}`}>
          <img
            src={content.image}
            alt={content.title}
            style={{
              maxHeight: `${optimalStepImageHeight}px`,
              maxWidth: `${maxWidth}px`,
              width: "auto",
            }}
            className="object-contain mx-auto"
          />
        </div>
      )}
      {content.icon && (
        <div className={`text-yellow-600 ${deviceSize === "xs" ? "mb-2" : deviceSize === "lg" ? "mb-5" : "mb-4"}`}>
          <content.icon size={getIconSize()} />
        </div>
      )}
      <p className={`text-center ${getTextClass()}`}>
        {content.message}
      </p>
      {content.secondaryMessage && (
        <p className={`text-center ${getTextClass()}`}>
          {content.secondaryMessage}
        </p>
      )}
    </>
  );
};

interface NavigationButtonsProps extends StepComponentProps {
  previousButton: ReturnType<typeof usePressableButton>;
  nextButton: ReturnType<typeof usePressableButton>;
  step: BrowserOnboardingStep;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  previousButton,
  nextButton,
  step,
  deviceSize,
  optimalImageHeight,
  optimalStepImageHeight,
}) => {
  const getButtonClass = () => {
    switch (deviceSize) {
    case "xs": return "px-3 py-1.5 text-sm";
    case "sm": return "px-4 py-2 text-base";
    case "lg": return "px-6 py-2.5 text-lg";
    default: return "px-5 py-2 text-base";
    }
  };

  return (
    <div className="flex justify-between w-full gap-2 sm:gap-3">
      <button
        {...previousButton.handlers}
        className={`
          flex-1 bg-gray-600 text-white rounded-full 
          hover:bg-gray-700 transition-all duration-100 font-semibold 
          flex items-center justify-center ${getButtonClass()}
          ${previousButton.buttonClasses}
        `}
      >
        <FaArrowLeft className={`${deviceSize === "xs" ? "mr-0.5" : "mr-1"}`} size={deviceSize === "xs" ? 12 : 14} />
        Zurück
      </button>
      <button
        {...nextButton.handlers}
        className={`
          flex-1 bg-yellow-600 text-white rounded-full 
          hover:bg-yellow-700 transition-all duration-100 font-semibold 
          flex items-center justify-center ${getButtonClass()}
          ${nextButton.buttonClasses}
        `}
      >
        <>Weiter<FaArrowRight className={`${deviceSize === "xs" ? "ml-0.5" : "ml-1"}`} size={deviceSize === "xs" ? 12 : 14} /></>
      </button>
    </div>
  );
};

export default OnboardingFlow;
