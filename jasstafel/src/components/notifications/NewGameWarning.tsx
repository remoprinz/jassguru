import React from "react";
import {motion, AnimatePresence} from "framer-motion";
import {FaInfoCircle} from "react-icons/fa";
import {usePressableButton} from "../../hooks/usePressableButton";

interface NewGameWarningProps {
  show: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

const NewGameWarning: React.FC<NewGameWarningProps> = ({show, onConfirm, onDismiss}) => {
  const handleConfirm = () => {
    onConfirm();
  };

  const backButton = usePressableButton(onDismiss);
  const confirmButton = usePressableButton(handleConfirm);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in pointer-events-auto"
        >
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onDismiss} />
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10">
            <div className="flex flex-col items-center justify-center mb-10">
              <FaInfoCircle className="w-12 h-14 text-yellow-600 mb-6" />
              <p className="text-center">
                Möchten Sie wirklich ein neues Spiel starten?
                Die Daten des aktuellen Spiels werden gelöscht.
              </p>
            </div>
            <div className="flex justify-between gap-4">
              <button
                {...backButton.handlers}
                className={`
                  flex-1 bg-gray-600 text-white px-6 py-2 rounded-xl font-semibold
                  hover:bg-gray-700 border-gray-900
                  ${backButton.buttonClasses}
                `}
              >
                Zurück
              </button>
              <button
                {...confirmButton.handlers}
                className={`
                  flex-1 bg-yellow-600 text-white px-6 py-2 rounded-xl font-semibold
                  hover:bg-yellow-700 border-yellow-900
                  ${confirmButton.buttonClasses}
                `}
              >
                Ja, Spiel starten
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NewGameWarning;
