import React, { useCallback } from 'react';
import { FaExclamationTriangle } from 'react-icons/fa';
import { useGameStore } from '../../store/gameStore';

interface HistoryWarningProps {
  message: string;
  onConfirm: () => void;
  onDismiss: () => void;
  show: boolean;
}

const HistoryWarning: React.FC<HistoryWarningProps> = ({ 
  message, 
  onConfirm, 
  onDismiss,
  show 
}) => {
  const { jumpToLatest } = useGameStore();
  
  const handleDismiss = useCallback(() => {
    jumpToLatest();
    onDismiss();
  }, [jumpToLatest, onDismiss]);

  const handleConfirm = useCallback(() => {
    onConfirm();
    onDismiss();
  }, [onConfirm, onDismiss]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 animate-fade-in pointer-events-auto">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={handleDismiss} />
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-xs w-full relative text-white z-10">
        <div className="flex flex-col items-center justify-center mb-4">
          <FaExclamationTriangle className="w-12 h-12 text-yellow-600 mb-2" />
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
    </div>
  );
};

export default HistoryWarning;
