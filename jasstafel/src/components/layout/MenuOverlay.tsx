import React, { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useJassStore } from '../../store/jassStore';
import { FaTrashAlt, FaInfoCircle, FaSave, FaChalkboard } from 'react-icons/fa';
import { motion } from 'framer-motion';
import IntroductionMessage from '../ui/IntroductionMessage';
import ResetWarning from '../notifications/ResetWarning';

interface MenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  setIsResultatOpen: (isOpen: boolean) => void;
}

const MenuOverlay: React.FC<MenuOverlayProps> = ({ isOpen, onClose, setIsResultatOpen }) => {
  const { 
    resetGame, 
    topScore,
    bottomScore,
    settings
  } = useGameStore();
  const [pressedButton, setPressedButton] = useState<string | null>(null);
  const [showIntroduction, setShowIntroduction] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);

  const iconStyle = "w-12 h-12 p-2 rounded-xl shadow-md transition-transform hover:scale-110";

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        when: "beforeChildren",
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 0 },
    visible: { opacity: 1, y: 0 }
  };

  const handleButtonPress = (buttonId: string) => {
    setPressedButton(buttonId);
    setTimeout(() => setPressedButton(null), 150);
  };

  // Prüfen ob Sieg-Bedingung erfüllt ist
  const canFinalize = topScore >= settings.siegScore || bottomScore >= settings.siegScore;

  const handleReset = () => {
    handleButtonPress('trash');
    setShowResetWarning(true);
  };

  const handleResetConfirm = () => {
    setShowResetWarning(false);
    onClose();
    
    // Reset beide Stores
    resetGame();  // gameStore reset
    const jassStore = useJassStore.getState();
    jassStore.resetJass();  // jassStore reset
    
    // Starte neues Spiel
    jassStore.startNewGame();
  };

  return (
    <>
      <motion.div 
        className={`absolute inset-x-0 top-1/2 transform -translate-y-1/2 flex justify-center items-center h-16 z-10 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'} transition-opacity duration-300`}
        variants={containerVariants}
        initial="hidden"
        animate={isOpen ? "visible" : "hidden"}
      >
        <div className="flex justify-center space-x-10">
          <motion.button 
            onClick={handleReset}
            className={`${iconStyle} bg-red-500 text-white`}
            variants={itemVariants}
            onMouseDown={() => handleButtonPress('trash')}
            onTouchStart={() => handleButtonPress('trash')}
          >
            <FaTrashAlt className={`w-full h-full ${pressedButton === 'trash' ? 'opacity-70' : ''}`} />
          </motion.button>
          <motion.button 
            onClick={() => setShowIntroduction(true)}
            className={`${iconStyle} bg-blue-500 text-white`}
            variants={itemVariants}
            onMouseDown={() => handleButtonPress('info')}
            onTouchStart={() => handleButtonPress('info')}
          >
            <FaInfoCircle className={`w-full h-full ${pressedButton === 'info' ? 'opacity-70' : ''}`} />
          </motion.button>
          <motion.button 
            className={`${iconStyle} bg-yellow-500 text-white`}
            variants={itemVariants}
            onMouseDown={() => handleButtonPress('save')}
            onTouchStart={() => handleButtonPress('save')}
          >
            <FaSave className={`w-full h-full ${pressedButton === 'save' ? 'opacity-70' : ''}`} />
          </motion.button>
          <motion.button 
            onClick={() => setIsResultatOpen(true)}
            className={`${iconStyle} bg-green-500 text-white`}
            variants={itemVariants}
            onMouseDown={() => handleButtonPress('resultat')}
            onTouchStart={() => handleButtonPress('resultat')}
          >
            <FaChalkboard className={`w-full h-full ${pressedButton === 'resultat' ? 'opacity-70' : ''}`} />
          </motion.button>
        </div>
        {showIntroduction && (
          <IntroductionMessage 
            onDismiss={() => setShowIntroduction(false)} 
            showTitle={false} 
            show={true} 
            message="Willkommen zu Jassguru"
          />
        )}
      </motion.div>
      <ResetWarning 
        show={showResetWarning}
        onConfirm={handleResetConfirm}
        onDismiss={() => setShowResetWarning(false)}
      />
    </>
  );
};

export default MenuOverlay;
