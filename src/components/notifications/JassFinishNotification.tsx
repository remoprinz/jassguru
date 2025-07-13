import React, {useCallback, useMemo, useEffect, useState} from "react";
import {useUIStore} from "../../store/uiStore";
import {motion, AnimatePresence} from "framer-motion";
import {usePressableButton} from "../../hooks/usePressableButton";
import { FiLoader } from "react-icons/fi";

const JassFinishNotification: React.FC = () => {
  const notification = useUIStore((state) => state.jassFinishNotification);
  const [isSharing, setIsSharing] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false); // NEU: Regenerating-State

  const {
    jassFinishNotification: {
      isOpen,
      message = {text: "Jass beendet!", icon: "♥️"},
      mode = "share",
      onShare = async () => {},
      onBack = () => {},
      onBackLabel,
      onContinue = () => {},
      onRegenerate = async () => {}, // NEU: Regenerate-Callback
    },
    closeJassFinishNotification,
  } = useUIStore();

  // DEBUG: Log ob onRegenerate übergeben wird
  console.log('[JassFinishNotification] onRegenerate available:', typeof onRegenerate, onRegenerate !== undefined);

  const isFlipped = false;

  const displayIcons = useMemo(() => {
    if (typeof message !== "string" && message.icon) {
      return [message.icon];
    }

    const icons: string[] = [];
    const msgText = typeof message === "string" ? message : message.text;
    const msg = msgText.toLowerCase();

    if (msg.includes("schneider")) {
      icons.push("✂️");
      return icons;
    }

    if (msg.includes("unentschieden")) {
      icons.push("🤝");
    } else if (msg.includes("vernichtend")) {
      icons.push("💥");
    } else if (msg.includes("knapp")) {
      icons.push("😅");
    }

    if (msg.includes("matsch")) {
      icons.push("💪");
    }
    if (msg.includes("rekord")) {
      icons.push("🏆");
    }
    if (msg.includes("schnell") || msg.includes("blitz")) {
      icons.push("⚡");
    }
    if (msg.includes("langsam") || msg.includes("gemütlich")) {
      icons.push("��");
    }

    if (icons.length === 0) {
      if (mode === "share") {
        icons.push("🎉");
      } else {
        icons.push(typeof message === "string" ? "🎲" : message.icon);
      }
    }

    return icons;
  }, [message, mode]);

  const displayContent = useMemo(() => {
    if (mode === "share") {
      return (
        <img
          src="/welcome-guru.png"
          alt="Jass Guru"
          className="w-64 h-64 object-cover mb-6 rounded-lg"
        />
      );
    }

    return (
      <div className="text-6xl mb-4">
        {displayIcons.map((icon, index) => (
          <span key={index} className="mx-1">{icon}</span>
        ))}
      </div>
    );
  }, [mode, displayIcons]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      if (onShare) {
        // Wenn onShare definiert ist, verwende das (Screenshot-Share mit korrekter Attribution)
        await onShare();
      } else {
        // Fallback: Nur Text teilen wenn kein onShare Callback vorhanden
        const shareText = typeof message === "string" ? message : message.text;
        const fullShareText = `${shareText}\n\ngeneriert von:\n👉 jassguru.ch`;

        // Überprüfen ob Web Share API verfügbar ist
        if (navigator.share) {
          try {
            await navigator.share({
              text: fullShareText,
            });
          } catch (error) {
            console.error("Share failed:", error);
            // Fallback: Text in Zwischenablage kopieren
            await navigator.clipboard.writeText(fullShareText);
            // TODO: Zeige Feedback dass Text kopiert wurde
          }
        } else {
          // Fallback für Browser ohne Web Share API
          await navigator.clipboard.writeText(fullShareText);
          // TODO: Zeige Feedback dass Text kopiert wurde
        }
      }

      closeJassFinishNotification();
    } catch (error) {
      console.error("Share error:", error);
    } finally {
      setIsSharing(false);
    }
  }, [onShare, message, closeJassFinishNotification]);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
    }
    closeJassFinishNotification();
  }, [onBack, closeJassFinishNotification]);

  const handleContinue = useCallback(() => {
    if (onContinue) {
      onContinue();
    }
    closeJassFinishNotification();
  }, [onContinue, closeJassFinishNotification]);

  // NEU: Handler für "Neuer Spruch"
  const handleRegenerate = useCallback(async () => {
    console.log('[JassFinishNotification] Regenerate clicked, onRegenerate:', typeof onRegenerate);
    setIsRegenerating(true);
    try {
      if (onRegenerate) {
        console.log('[JassFinishNotification] Calling onRegenerate...');
        await onRegenerate();
        console.log('[JassFinishNotification] onRegenerate completed');
      } else {
        console.warn('[JassFinishNotification] onRegenerate is not defined!');
      }
    } catch (error) {
      console.error("[JassFinishNotification] Regenerate error:", error);
    } finally {
      setIsRegenerating(false);
    }
  }, [onRegenerate]);

  // Nur die Button-Handler mit usePressableButton ausstatten
  const backButton = usePressableButton(handleBack);
  const actionButton = usePressableButton(mode === "share" ? handleShare : handleContinue);
  const regenerateButton = usePressableButton(handleRegenerate); // NEU: Regenerate-Button

  useEffect(() => {
    if (isOpen) {
      useUIStore.setState((state) => ({
        // ... State-Updates hier
      }));
    }
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          className={`fixed inset-0 flex items-center justify-center z-[9999] ${
            isFlipped ? "rotate-180" : ""
          }`}
        >
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
          />
          <motion.div
            initial={{scale: 0.95}}
            animate={{scale: 1}}
            exit={{scale: 0.95}}
            className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10"
          >
            <div className="flex flex-col items-center justify-center mb-4">
              {displayContent}
              <div className="text-center mb-6 max-h-[40vh] overflow-y-auto">
                <p className="mb-2 text-base sm:text-lg leading-relaxed">
                  {typeof message === "string" ? message : message.text}
                </p>
              </div>
            </div>
            {/* NEU: Obere Button-Reihe - nur für Share-Modus */}
            {mode === "share" && (
              <div className="flex justify-between gap-4 mb-4">
                <motion.button
                  {...regenerateButton.handlers}
                  initial={{scale: 0.9}}
                  animate={{scale: 1}}
                  whileTap={{scale: 0.95}}
                  className={`
                    flex-1 bg-yellow-600 text-white px-6 py-2 rounded-lg 
                    hover:bg-yellow-700 transition-all duration-150 text-lg font-semibold
                    flex items-center justify-center border-b-4 border-yellow-800
                    shadow-lg leading-tight
                    active:scale-[0.98] active:border-b-2
                    ${regenerateButton.buttonClasses}
                    ${isRegenerating ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? (
                    <FiLoader className="animate-spin w-6 h-6" />
                  ) : (
                    'Neuer Spruch'
                  )}
                </motion.button>
                <motion.button
                  {...actionButton.handlers}
                  initial={{scale: 0.9}}
                  animate={{scale: 1}}
                  whileTap={{scale: 0.95}}
                  className={`
                    flex-1 bg-green-600 text-white px-6 py-2 rounded-lg 
                    hover:bg-green-700 transition-all duration-150 text-lg font-semibold
                    flex items-center justify-center border-b-4 border-green-800
                    shadow-lg leading-tight
                    active:scale-[0.98] active:border-b-2
                    ${actionButton.buttonClasses}
                    ${isSharing ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  disabled={isSharing}
                >
                  {isSharing ? (
                    <FiLoader className="animate-spin w-6 h-6" />
                  ) : (
                    'Teilen'
                  )}
                </motion.button>
              </div>
            )}

            {/* Continue-Modus Buttons */}
            {mode === "continue" && (
              <div className="flex justify-between gap-4 mb-4">
                <motion.button
                  {...backButton.handlers}
                  initial={{scale: 0.9}}
                  animate={{scale: 1}}
                  whileTap={{scale: 0.95}}
                  className={`
                    flex-1 bg-gray-600 text-white px-6 py-2 rounded-lg 
                    hover:bg-gray-700 transition-all duration-150 text-lg font-semibold
                    border-b-4 border-gray-800 shadow-lg leading-tight
                    active:scale-[0.98] active:border-b-2
                    ${backButton.buttonClasses}
                  `}
                >
                  {onBackLabel || 'Zurück'}
                </motion.button>
                <motion.button
                  {...actionButton.handlers}
                  initial={{scale: 0.9}}
                  animate={{scale: 1}}
                  whileTap={{scale: 0.95}}
                  className={`
                    flex-1 bg-green-600 text-white px-6 py-2 rounded-lg 
                    hover:bg-green-700 transition-all duration-150 text-lg font-semibold
                    border-b-4 border-green-800 shadow-lg leading-tight
                    active:scale-[0.98] active:border-b-2
                    ${actionButton.buttonClasses}
                  `}
                >
                  Weiterjassen!
                </motion.button>
              </div>
            )}

            {/* NEU: Schliessen-Button unterhalb (für alle Modi) */}
            <div className="flex justify-center">
              <motion.button
                onClick={closeJassFinishNotification}
                initial={{scale: 0.9}}
                animate={{scale: 1}}
                whileTap={{scale: 0.95}}
                className="
                  w-full bg-gray-600 text-white px-6 py-2 rounded-lg 
                  hover:bg-gray-700 transition-all duration-150 text-lg font-semibold
                  border-b-4 border-gray-800 shadow-lg leading-tight
                  active:scale-[0.98] active:border-b-2
                "
              >
                Schliessen
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default JassFinishNotification;
