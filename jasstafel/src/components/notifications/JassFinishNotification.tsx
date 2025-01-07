import React, { useCallback } from 'react';
import { FaHandshake } from 'react-icons/fa';
import { useUIStore } from '../../store/uiStore';
import { motion, AnimatePresence } from 'framer-motion';

interface JassFinishNotificationProps {
  onShare: () => Promise<void>;
  onBack: () => void;
  show: boolean;
}

const JassFinishNotification: React.FC<JassFinishNotificationProps> = ({ 
  onShare,
  onBack,
  show 
}) => {
  const { closeJassFinishNotification } = useUIStore();
  
  const handleShare = useCallback(async () => {
    await onShare();
    closeJassFinishNotification();
  }, [onShare, closeJassFinishNotification]);

  const handleBack = useCallback(() => {
    closeJassFinishNotification();
    onBack();
  }, [onBack, closeJassFinishNotification]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 flex items-center justify-center z-[9999] p-4 pointer-events-auto"
        >
          <div 
            className="fixed inset-0 bg-black bg-opacity-50" 
            onClick={handleBack}
          />
          <motion.div 
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10"
          >
            <div className="flex flex-col items-center justify-center mb-4">
              <FaHandshake className="w-12 h-12 text-yellow-600 mb-2" />
              <p className="text-center mb-6">Der Jass wurde beendet.</p>
            </div>
            <div className="flex justify-between gap-4">
              <button
                onClick={handleBack}
                className="flex-1 bg-gray-600 text-white px-6 py-2 rounded-full hover:bg-gray-700 transition-colors text-lg font-semibold"
              >
                Zurück
              </button>
              <button
                onClick={handleShare}
                className="flex-1 bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 transition-colors text-lg font-semibold"
              >
                Teilen
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default JassFinishNotification;