import React from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

interface ResetWarningProps {
  show: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  swipePosition?: 'top' | 'bottom';
}

const ResetWarning: React.FC<ResetWarningProps> = ({ 
  onConfirm, 
  onDismiss,
  show,
  swipePosition = 'bottom'
}) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 flex items-center justify-center z-[9999] p-4 pointer-events-auto
            ${swipePosition === 'top' ? 'rotate-180' : ''}`}
        >
          <div 
            className="fixed inset-0 bg-black bg-opacity-50" 
            onClick={onDismiss} 
          />
          <motion.div 
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className={`bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10
              ${swipePosition === 'top' ? 'rotate-180' : ''}`}
          >
            <div className="flex flex-col items-center justify-center mb-4">
              <FaExclamationTriangle className="w-12 h-12 text-yellow-600 mb-2" />
              <p className="text-center mb-6">
                Möchten Sie wirklich das Spiel zurücksetzen? Alle Daten werden gelöscht.
              </p>
            </div>
            <div className="flex justify-between gap-4">
              <button
                onClick={onConfirm}
                className="flex-1 bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 transition-colors text-lg font-semibold"
              >
                Ja
              </button>
              <button
                onClick={onDismiss}
                className="flex-1 bg-gray-600 text-white px-6 py-2 rounded-full hover:bg-gray-700 transition-colors text-lg font-semibold"
              >
                Abbrechen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ResetWarning;