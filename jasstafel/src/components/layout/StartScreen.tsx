import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { motion } from 'framer-motion';

const StartScreen: React.FC = () => {
  const { startGame } = useGameStore();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90 z-50">
      <motion.button
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.95 }}
        onClick={startGame}
        className="bg-green-600 text-white text-2xl font-bold py-6 px-12 rounded-xl shadow-lg hover:bg-green-500 transition-colors"
      >
        START
      </motion.button>
    </div>
  );
};

export default StartScreen;