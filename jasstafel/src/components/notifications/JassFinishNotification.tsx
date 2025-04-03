import React, {useCallback, useMemo, useEffect} from "react";
import {useUIStore} from "../../store/uiStore";
import {motion, AnimatePresence} from "framer-motion";
import {usePressableButton} from "../../hooks/usePressableButton";

const JassFinishNotification: React.FC = () => {
  const notification = useUIStore((state) => state.jassFinishNotification);

  const {
    jassFinishNotification: {
      isOpen,
      message = {text: "Jass beendet!", icon: "♥️"},
      mode = "share",
      onShare = async () => {},
      onBack = () => {},
      onContinue = () => {},
    },
    closeJassFinishNotification,
  } = useUIStore();

  const isFlipped = useUIStore((state) => state.resultatKreidetafel.swipePosition === "top");

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
    try {
      if (onShare) {
        await onShare();
      }

      const shareText = typeof message === "string" ? message : message.text;
      const appUrl = "https://jassguru.web.app";
      const fullShareText = `${shareText}\n\nGeneriert mit 👉 ${appUrl}`;

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

      closeJassFinishNotification();
    } catch (error) {
      console.error("Share error:", error);
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

  // Nur die Button-Handler mit usePressableButton ausstatten
  const backButton = usePressableButton(handleBack);
  const actionButton = usePressableButton(mode === "share" ? handleShare : handleContinue);

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
            onClick={handleBack}
          />
          <motion.div
            initial={{scale: 0.95}}
            animate={{scale: 1}}
            exit={{scale: 0.95}}
            className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10"
          >
            <div className="flex flex-col items-center justify-center mb-4">
              {displayContent}
              <div className="text-center mb-6">
                <p className="mb-2">
                  {typeof message === "string" ? message : message.text}
                </p>
              </div>
            </div>
            <div className="flex justify-between gap-4">
              <button
                {...backButton.handlers}
                className={`
                  flex-1 bg-gray-600 text-white px-6 py-2 rounded-full 
                  hover:bg-gray-700 transition-colors text-lg font-semibold
                  ${backButton.buttonClasses}
                `}
              >
                Zurück
              </button>
              {mode === "share" ? (
                <button
                  {...actionButton.handlers}
                  className={`
                    flex-1 bg-yellow-600 text-white px-6 py-2 rounded-full 
                    hover:bg-yellow-700 transition-colors text-lg font-semibold
                    ${actionButton.buttonClasses}
                  `}
                >
                  Teilen
                </button>
              ) : (
                <button
                  {...actionButton.handlers}
                  className={`
                    flex-1 bg-green-600 text-white px-6 py-2 rounded-full 
                    hover:bg-green-700 transition-colors text-lg font-semibold
                    ${actionButton.buttonClasses}
                  `}
                >
                  Weiterjassen!
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default JassFinishNotification;
