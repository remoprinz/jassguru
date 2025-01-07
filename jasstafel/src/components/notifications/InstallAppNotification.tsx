import React from 'react';
import { FaDownload } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface InstallAppNotificationProps {
  show: boolean;
  message: string;
  title: string;
  onDismiss: () => void;
}

const InstallAppNotification: React.FC<InstallAppNotificationProps> = ({ 
  show, 
  message,
  title,
  onDismiss 
}) => {
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
            onClick={onDismiss} 
          />
          <motion.div 
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-[9999]"
          >
            <div className="flex flex-col items-center justify-center">
              <img 
                src="/welcome-guru.png"
                alt="Jass Guru"
                className="w-32 h-32 object-contain mb-4"
              />
              <h2 className="text-xl font-bold mb-4 text-center">{title}</h2>
              <FaDownload className="w-12 h-12 text-yellow-600 mb-2" />
              <h3 className="text-lg font-medium mb-4 text-center">So geht's:</h3>
              <p className="text-center mb-6 text-base whitespace-pre-line">
                {message}
              </p>
              <button
                onClick={onDismiss}
                className="w-full bg-yellow-600 text-white px-6 py-2 rounded-full hover:bg-yellow-700 transition-colors text-lg font-semibold"
              >
                Verstanden
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InstallAppNotification; 