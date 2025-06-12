import React, {useCallback, useRef, useEffect} from "react";
import {FaExclamationTriangle} from "react-icons/fa";
import {useUIStore} from "../../store/uiStore";
import {motion, AnimatePresence} from "framer-motion";

export const HISTORY_WARNING_MESSAGE = "Resultat wirklich korrigieren? Folgerunden werden gelöscht.";

interface HistoryWarningProps {
  message: string;
  onConfirm: () => void;
  onDismiss: () => void;
  show: boolean;
  swipePosition?: "top" | "bottom";
}

const HistoryWarning: React.FC<HistoryWarningProps> = ({
  message,
  onConfirm,
  onDismiss,
  show,
  swipePosition = "bottom",
}) => {
  const {closeHistoryWarning} = useUIStore();
  const mountTimeRef = useRef<number>(0);

  // Speichere den Mount-Zeitpunkt, wenn die Komponente angezeigt wird
  useEffect(() => {
    if (show) {
      mountTimeRef.current = Date.now();
      console.log("[HistoryWarning] Mounted at:", mountTimeRef.current);
    }
  }, [show]);

  const handleConfirm = useCallback(() => {
    closeHistoryWarning();
    onConfirm();
  }, [onConfirm, closeHistoryWarning]);

  const handleDismiss = useCallback(() => {
    closeHistoryWarning();
    onDismiss();
  }, [onDismiss, closeHistoryWarning]);

  // BUGFIX: Verhindere Event-Propagation-Konflikt mit Calculator-OK-Button
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    const timeSinceMount = Date.now() - mountTimeRef.current;
    
    // Ignoriere Clicks in den ersten 200ms nach dem Erscheinen
    if (timeSinceMount < 200) {
      console.log(`[HistoryWarning] Ignoring overlay click: only ${timeSinceMount}ms since mount`);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // Normale Behandlung: Modal schließen
    console.log(`[HistoryWarning] Valid overlay click after ${timeSinceMount}ms`);
    handleDismiss();
  }, [handleDismiss]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          className="fixed inset-0 flex items-center justify-center z-[9999] p-4 pointer-events-auto"
        >
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={handleOverlayClick}
          />
          <motion.div
            initial={{scale: 0.95}}
            animate={{scale: 1}}
            exit={{scale: 0.95}}
            className={`bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10
              ${swipePosition === "top" ? "rotate-180" : ""}`}
          >
            <div className={`${swipePosition === "top" ? "rotate-180" : ""}`}>
              <div className="flex flex-col items-center justify-center mb-4">
                <FaExclamationTriangle className="w-12 h-12 text-red-600 mb-6" />
                <p className="text-center mb-6">{message}</p>
              </div>
              <div className="flex justify-between gap-4">
                <button
                  onClick={handleConfirm}
                  className="flex-1 bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 transition-colors text-lg font-semibold"
                >
                  Ja
                </button>
                <button
                  onClick={handleDismiss}
                  className="flex-1 bg-gray-600 text-white px-6 py-2 rounded-full hover:bg-gray-700 transition-colors text-lg font-semibold"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default HistoryWarning;
