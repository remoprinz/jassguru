import React, {useState, useEffect, useCallback, memo} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {useTutorialStore} from "../../store/tutorialStore";
import {TUTORIAL_STEPS, type TutorialStep, TutorialCategory} from "../../types/tutorial";
import TutorialNavigation from "./TutorialNavigation";
import {useUIStore} from "../../store/uiStore";
import {useTutorialComponent} from "../../hooks/useTutorialComponent";
import {useAuthStore} from "../../store/authStore";

// Props-Typ hier definiert
interface TutorialOverlayProps {
  onCloseMenu?: () => void; // Optional gemacht, falls nicht immer benötigt
}

interface SpotlightProps {
  target?: string;
}

const Spotlight: React.FC<SpotlightProps> = ({target}) => {
  const [targetElement, setTargetElement] = React.useState<DOMRect | null>(null);
  const retryCount = React.useRef(0);
  const maxRetries = 10;
  const retryInterval = 100;

  React.useEffect(() => {
    const findTarget = () => {
      if (target) {
        const element = document.querySelector(target);
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setTargetElement(rect);
            retryCount.current = 0;
          } else {
            retry();
          }
        } else {
          retry();
        }
      }
    };

    const retry = () => {
      if (retryCount.current < maxRetries) {
        retryCount.current += 1;
        setTimeout(findTarget, retryInterval);
      } else {
        // console.error(`Failed to find target element: ${target}`);
      }
    };

    findTarget();

    const handleButtonReady = () => findTarget();
    window.addEventListener("nextButtonReady", handleButtonReady);

    return () => {
      window.removeEventListener("nextButtonReady", handleButtonReady);
    };
  }, [target]);

  if (!targetElement || targetElement.width === 0 || targetElement.height === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{opacity: 0}}
      animate={{opacity: 1}}
      exit={{opacity: 0}}
      className="absolute"
      style={{
        top: targetElement.top,
        left: targetElement.left,
        width: targetElement.width,
        height: targetElement.height,
        border: "2px solid rgba(255, 255, 255, 0.8)",
        borderRadius: "8px",
        boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
        zIndex: 1000,
        pointerEvents: "none",
      }}
    />
  );
};

const getPositionStyles = (position: TutorialStep["overlayPosition"]): React.CSSProperties => {
  const styles: React.CSSProperties = {
    position: "fixed",
    transform: "",
  };

  // Offset in Prozent umrechnen (1px = 0.1vh für vertikalen Offset)
  const getVerticalOffsetInVh = (pixels: number) => `${pixels * 0.1}vh`;
  const getHorizontalOffsetInVw = (pixels: number) => `${pixels * 0.1}vw`;

  // Basis-Position setzen
  switch (position.vertical) {
  case "top":
    styles.top = "20vh";
    break;
  case "center":
    styles.top = "50vh";
    styles.transform = "translateY(-50%)";
    break;
  case "bottom":
    styles.bottom = "20vh";
    break;
  }

  switch (position.horizontal) {
  case "left":
    styles.left = "20%";
    break;
  case "center":
    styles.left = "50%";
    if (styles.transform) {
      styles.transform += " translateX(-50%)";
    } else {
      styles.transform = "translateX(-50%)";
    }
    break;
  case "right":
    styles.right = "20%";
    break;
  }

  // Offset anwenden
  if (position.offset) {
    // Vertikaler Offset
    if (typeof position.offset.y === "number") {
      if (position.vertical === "bottom") {
        styles.bottom = `calc(20vh + ${getVerticalOffsetInVh(position.offset.y)})`;
      } else {
        styles.top = `calc(${position.vertical === "center" ? "50vh" : "20vh"} + ${getVerticalOffsetInVh(position.offset.y)})`;
      }
    }

    // Horizontaler Offset
    if (typeof position.offset.x === "number") {
      if (position.horizontal === "right") {
        styles.right = `calc(20% + ${getHorizontalOffsetInVw(position.offset.x)})`;
      } else {
        styles.left = `calc(${position.horizontal === "center" ? "50%" : "20%"} + ${getHorizontalOffsetInVw(position.offset.x)})`;
      }
    }
  }

  // Transform-String bereinigen
  if (!styles.transform) {
    delete styles.transform;
  }

  return styles;
};

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({onCloseMenu}) => {
  const {
    isActive,
    getCurrentStep,
    nextStep,
    previousStep,
    endTutorial,
    isHelpMode,
    exitHelpStep,
    markCategoryAsCompleted,
  } = useTutorialStore();
  const closeSettings = useUIStore((state) => state.closeSettings);
  const { isGuest } = useAuthStore();

  const [isContentVisible, setIsContentVisible] = useState(true);
  const [neverShowAgain, setNeverShowAgain] = useState(false);
  const currentStep = getCurrentStep();


  // Nutze den erweiterten useTutorialComponent Hook
  useTutorialComponent("splitContainer", setIsContentVisible);
  useTutorialComponent("calculator", setIsContentVisible);
  useTutorialComponent("gameInfo", setIsContentVisible);
  useTutorialComponent("settings", setIsContentVisible);

  // Neue Handler für Help-Mode
  const handleExitHelpStep = useCallback(() => {
    if (currentStep?.onExit) {
      currentStep.onExit();
    }
    exitHelpStep();
  }, [currentStep, exitHelpStep]);

  // Angepasste Navigation-Rendering Logik
  const renderNavigation = () => {
    if (!currentStep || currentStep.hideNavigation) return null;

    return (
      <motion.div
        key="tutorial-overlay-navigation"
        className="fixed left-1/2 transform -translate-x-1/2 z-[1001]"
        style={{bottom: "4vh", pointerEvents: "auto"}}
      >
        <div className="flex flex-col items-center w-full max-w-md px-8 mb-8 mx-auto">
          {/* Navigation Buttons */}
          <div className={`w-full flex items-center ${
            // Wenn es der Welcome Screen ist UND die Checkbox angezeigt wird
            currentStep?.id === TUTORIAL_STEPS.WELCOME ? "justify-center" : "justify-between"
          } gap-4 mb-4`}>
            {/* "Verstanden" Button NUR für Help-Mode (wenn man während des Spiels auf Hilfe klickt) */}
            {isHelpMode && currentStep.category !== TutorialCategory.TIPS ? (
              <button
                onClick={handleExitHelpStep}
                className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold
                  py-3 px-8 rounded-full w-[180px] mx-auto block
                  active:bg-yellow-600"
              >
                Verstanden
              </button>
            ) : (
              /* Normale Navigation für alle Tutorial-Flows (Basic, Settings, Tips) */
              <TutorialNavigation
                showBackButton={!currentStep.hideBackButton}
                isFirstStep={
                  currentStep.id === TUTORIAL_STEPS.WELCOME ||
                  currentStep.id === TUTORIAL_STEPS.SETTINGS ||
                  currentStep.id === TUTORIAL_STEPS.TIPS_WELCOME
                }
                isLastStep={
                  currentStep.id === TUTORIAL_STEPS.BASIC_COMPLETE ||
                  currentStep.id === TUTORIAL_STEPS.BINGO_SETTINGS ||
                  currentStep.id === TUTORIAL_STEPS.TIPS_IPHONE_WAKE
                }
                onNext={
                  currentStep.id === TUTORIAL_STEPS.BASIC_COMPLETE ||
                  currentStep.id === TUTORIAL_STEPS.BINGO_SETTINGS ||
                  currentStep.id === TUTORIAL_STEPS.TIPS_IPHONE_WAKE ?
                    handleEndTutorial :
                    undefined
                }
              />
            )}
          </div>

          {/* Prominente Bestätigungs-Checkbox am Tutorial-Ende.
              Kombiniert "alle ausprobiert" mit "nicht mehr anzeigen" — eine Entscheidung, kein Cognitive Load.
              FREIWILLIG: Wer Häckchen + Losjassen → Tutorial nie wieder. Wer ohne → kommt beim nächsten Start nochmal. */}
          {!isHelpMode && (
            currentStep.id === TUTORIAL_STEPS.BASIC_COMPLETE ||
            currentStep.id === TUTORIAL_STEPS.BINGO_SETTINGS ||
            currentStep.id === TUTORIAL_STEPS.TIPS_IPHONE_WAKE
          ) && (
            <label
              htmlFor="neverShowAgain"
              className={`flex items-center justify-center gap-3 mt-4 mx-2 px-4 py-3 rounded-lg cursor-pointer transition-all
                ${neverShowAgain
                  ? "bg-green-600/30 border-2 border-green-500"
                  : "bg-white/10 border-2 border-white/40 hover:bg-white/20"}`}
            >
              <input
                type="checkbox"
                id="neverShowAgain"
                checked={neverShowAgain}
                onChange={(e) => setNeverShowAgain(e.target.checked)}
                className="w-6 h-6 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
              />
              <span className="text-base font-semibold text-white text-center">
                Ja, ich habe mich mit den Funktionen vertraut gemacht (nicht mehr fragen).
              </span>
            </label>
          )}
        </div>
      </motion.div>
    );
  };

  // 3. Alle useCallback Hooks
  const handleEndTutorial = useCallback(() => {
    const currentStepFromStore = useTutorialStore.getState().getCurrentStep();

    // 1. UI-Elemente schließen
    const uiStore = useUIStore.getState();
    uiStore.closeAllOverlays();
    uiStore.setMenuOpen(false);

    // 2. UI-Blockierungen aufheben
    useTutorialStore.getState().setTutorialUIBlocking({
      calculatorClose: false,
      gameInfoClose: false,
      settingsClose: false,
      resultatKreidetafelClose: false,
    });

    // 3. Kategorie als abgeschlossen markieren NUR wenn Checkbox aktiviert
    if (neverShowAgain && currentStepFromStore?.category) {
      markCategoryAsCompleted(currentStepFromStore.category);
    }

    // 4. 🔧 KRITISCHER FIX: NUR eine einzige Tutorial-Beendigung!
    // endTutorial() erledigt ALLES - kein doppeltes setHasCompletedTutorial!
    endTutorial(neverShowAgain);

  }, [neverShowAgain, markCategoryAsCompleted, endTutorial]);

  const handleNext = () => {
    nextStep();
  };

  const handleSaveClick = useCallback(() => {
    handleSaveSettings();
  }, []);

  // 4. Alle useEffect Hooks
  useEffect(() => {
    if (currentStep?.target === "save-settings") {
      document.getElementById("save-settings")?.addEventListener("click", handleSaveClick);
    }
    return () => {
      document.getElementById("save-settings")?.removeEventListener("click", handleSaveClick);
    };
  }, [currentStep, handleSaveClick]);

  useEffect(() => {
    const shouldBlock = !currentStep || (
      currentStep.id !== TUTORIAL_STEPS.CALCULATOR_OPEN &&
      currentStep.id !== TUTORIAL_STEPS.GAME_INFO
    );

    useTutorialStore.getState().setTutorialUIBlocking({
      calculatorClose: shouldBlock,
      gameInfoClose: shouldBlock,
      settingsClose: true,
      resultatKreidetafelClose: true,
    });

    return () => {
      useTutorialStore.getState().setTutorialUIBlocking({
        calculatorClose: false,
        gameInfoClose: false,
        settingsClose: false,
        resultatKreidetafelClose: false,
      });
    };
  }, [currentStep?.id]);

  // Effect um Content bei Calculator und GameInfo Steps zu steuern
  useEffect(() => {
    if (currentStep?.id === TUTORIAL_STEPS.CALCULATOR_OPEN) {
      const handleCalculatorOpen = ((e: CustomEvent) => {
        setIsContentVisible(false);
      }) as EventListener;

      document.addEventListener("calculatorOpen", handleCalculatorOpen);
      return () => {
        document.removeEventListener("calculatorOpen", handleCalculatorOpen);
        setIsContentVisible(true);
      };
    }

    if (currentStep?.id === TUTORIAL_STEPS.GAME_INFO) {
      const handleGameInfoOpen = () => {
        setIsContentVisible(false);
      };

      document.addEventListener("gameInfoOpen", handleGameInfoOpen);
      return () => {
        document.removeEventListener("gameInfoOpen", handleGameInfoOpen);
        setIsContentVisible(true);
      };
    }

    // Neuer Event-Listener für RESULTAT_INFO
    if (currentStep?.id === TUTORIAL_STEPS.RESULTAT_INFO) {
      const handleResultatOpen = () => {
        setIsContentVisible(false);
      };

      document.addEventListener("resultatKreidetafelOpen", handleResultatOpen);
      return () => {
        document.removeEventListener("resultatKreidetafelOpen", handleResultatOpen);
        setIsContentVisible(true);
      };
    }
  }, [currentStep?.id]);

  // Effect für Settings-Button Click
  useEffect(() => {
    if (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS) {
      const handleSettingsOpen = () => {
        setIsContentVisible(false);
      };

      document.addEventListener("settingsOpen", handleSettingsOpen);
      return () => {
        document.removeEventListener("settingsOpen", handleSettingsOpen);
        setIsContentVisible(true);
      };
    }
  }, [currentStep?.id]);

  // Früher Return angepasst
  if (!isActive || !currentStep) {
    return null;
  }

  const handlePreviousStep = () => {
    previousStep();
  };

  const handleSaveSettings = () => {
    const currentStep = getCurrentStep();
    if (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES) {
      nextStep(); // Zum SETTINGS_STROKES Step wechseln
    }
  };

  // Abschluss-Karten ("Bist du parat?"): Inhalt, Buttons UND Checkbox als EIN
  // zentriertes, scrollbares Modal rendern. Verhindert, dass die zwei getrennten
  // fixed-Layer (Inhalt oben verankert, Navigation unten verankert) bei
  // abweichenden Seitenverhältnissen überlappen — z.B. die iPhone-App im
  // iPad-Kompatibilitätsmodus, wie ihn der App-Review-Tester verwendet.
  const isCompletionCard =
    !isHelpMode &&
    (currentStep.id === TUTORIAL_STEPS.BASIC_COMPLETE ||
      currentStep.id === TUTORIAL_STEPS.BINGO_SETTINGS ||
      currentStep.id === TUTORIAL_STEPS.TIPS_IPHONE_WAKE);

  return (
    <AnimatePresence key="tutorial-overlay">
      <motion.div
        key="tutorial-overlay-backdrop"
        className="fixed inset-0 z-50"
        style={{pointerEvents: "none"}}
      >
        {currentStep.target && <Spotlight target={currentStep.target} />}

        {/* Blockierende Overlays für SETTINGS Step */}
        {currentStep.id === TUTORIAL_STEPS.SETTINGS && (
          <>
            {/* Oberer blockierender Bereich */}
            <div
              className="fixed left-0 right-0 top-0 bg-transparent"
              style={{
                height: "calc(50% - 40px)", // Höhe bis zum Button
                pointerEvents: "auto",
                zIndex: 1002,
              }}
            />
            {/* Unterer blockierender Bereich */}
            <div
              className="fixed left-0 right-0 bg-transparent"
              style={{
                top: "calc(50% + 40px)", // Position unter dem Button
                bottom: 0,
                pointerEvents: "auto",
                zIndex: 1002,
              }}
            />
          </>
        )}
      </motion.div>

      {isCompletionCard ? (
        /* Abschluss-Karte: Inhalt + Checkbox + Buttons in EINEM zentrierten,
           scrollbaren Modal. max-h-[90vh] + overflow-y-auto = passt auf jeden
           Viewport (auch iPhone SE), nichts kann mehr überlappen. */
        <motion.div
          key="tutorial-overlay-completion"
          className="fixed inset-0 z-[1001] flex flex-col overflow-y-auto p-4"
          style={{pointerEvents: "none"}}
        >
          {/* m-auto zentriert die Gruppe bei genug Platz und bleibt von oben
              scrollbar, falls der Viewport extrem kurz ist — die CTA kann so
              nie unerreichbar/abgeschnitten sein. */}
          <div className="m-auto flex flex-col items-center gap-5 w-full">
            {/* Inhaltskarte — schwebt wie im Original. Nur die Bildhöhe passt
                sich kurzen Viewports an (max-h-[28vh]), damit darunter für
                Buttons + Checkbox immer Platz bleibt. */}
            <div
              className="bg-gray-800 rounded-lg shadow-lg flex flex-col items-center text-center
                w-10/12 max-w-md p-6"
              style={{pointerEvents: "auto"}}
            >
              {currentStep.title && (
                <h2 className="text-2xl font-bold mb-4 text-white">
                  {currentStep.title}
                </h2>
              )}

              {currentStep.icon && (
                <currentStep.icon className="w-12 h-12 text-yellow-600 mb-4" />
              )}

              {currentStep.image && (
                <img
                  src={currentStep.image}
                  alt=""
                  className="w-48 h-48 max-h-[28vh] mb-4 rounded-lg object-cover"
                />
              )}

              {/* HTML aus tutorialContent.ts — Source-Code, kein User-Input. */}
              <p
                className="text-white text-lg max-w-[90%]"
                dangerouslySetInnerHTML={{__html: currentStep.content || ""}}
              />
            </div>

            {/* Buttons + Checkbox darunter — separat wie im Original (nicht in der
                grauen Karte), aber Teil derselben Flex-Spalte: keine Überlappung.
                Reihenfolge: CTA über der Checkbox, damit der wichtigste Button
                bei knappem Platz zuletzt wegfällt, nie zuerst. */}
            <div
              className="w-10/12 max-w-md flex flex-col items-center gap-4"
              style={{pointerEvents: "auto"}}
            >
              <div className="w-full">
                <TutorialNavigation
                  showBackButton={!currentStep.hideBackButton}
                  isFirstStep={false}
                  isLastStep={true}
                  onNext={handleEndTutorial}
                />
              </div>

              {/* Prominente Bestätigungs-Checkbox (freiwillig: Häkchen + Losjassen → nie wieder). */}
              <label
                htmlFor="neverShowAgain"
                className={`flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg cursor-pointer transition-all
                  ${neverShowAgain
                    ? "bg-green-600/30 border-2 border-green-500"
                    : "bg-white/10 border-2 border-white/40 hover:bg-white/20"}`}
              >
                <input
                  type="checkbox"
                  id="neverShowAgain"
                  checked={neverShowAgain}
                  onChange={(e) => setNeverShowAgain(e.target.checked)}
                  className="w-6 h-6 flex-shrink-0 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                />
                <span className="text-base font-semibold text-white text-center">
                  Ja, ich habe mich mit den Funktionen vertraut gemacht (nicht mehr fragen).
                </span>
              </label>
            </div>
          </div>
        </motion.div>
      ) : (
        <>
          {/* Content nur anzeigen wenn isContentVisible true ist */}
          {isContentVisible && (
            <motion.div
              key="tutorial-overlay-content"
              className={`bg-gray-800 rounded-lg shadow-lg flex flex-col items-center text-center w-10/12 max-w-md fixed
                ${currentStep.title ? "p-6" : "py-4 px-6"}`}
              style={{
                ...getPositionStyles(currentStep.overlayPosition),
                zIndex: 1001,
                pointerEvents: "none",
              }}
            >
              {currentStep.title && (
                <h2 className="text-2xl font-bold mb-4 text-white">
                  {currentStep.title}
                </h2>
              )}

              {currentStep.icon && (
                <currentStep.icon className="w-12 h-12 text-yellow-600 mb-4" />
              )}

              {currentStep.image && (
                <img
                  src={currentStep.image}
                  alt=""
                  className="w-64 h-64 mb-6 rounded-lg object-cover"
                />
              )}

              {/* HTML aus tutorialContent.ts — z.B. <strong>...</strong> für fett markierte Aktionen.
                  Sicher hier weil content aus Source-Code stammt, nicht aus User-Input. */}
              <p
                className={`text-white text-lg max-w-[90%] ${!currentStep.title ? "my-2" : ""}`}
                dangerouslySetInnerHTML={{__html: currentStep.content || ""}}
              />
            </motion.div>
          )}

          {/* Navigation mit renderNavigation() Funktion */}
          {renderNavigation()}
        </>
      )}
    </AnimatePresence>
  );
};

export default memo(TutorialOverlay);
