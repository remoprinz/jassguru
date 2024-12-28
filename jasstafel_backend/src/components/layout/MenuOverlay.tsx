import React, { useState, useCallback } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useJassStore } from '../../store/jassStore';
import { useUIStore } from '../../store/uiStore';
import { useTimerStore } from '../../store/timerStore';
import { FaTrashAlt, FaInfoCircle, FaCog, FaChalkboard } from 'react-icons/fa';
import { motion } from 'framer-motion';
import IntroductionMessage from '../ui/IntroductionMessage';
import ResetWarning from '../notifications/ResetWarning';
import FarbeSettingsModal from '../settings/SettingsModal';
import type { TeamPosition } from '../../types/jass';

interface MenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  swipePosition: TeamPosition;
}

const MenuOverlay: React.FC<MenuOverlayProps> = ({ 
  isOpen, 
  onClose,
  swipePosition 
}) => {
  const { resetGame } = useGameStore();
  const { openResultatKreidetafel, openFarbeSettings } = useUIStore();
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


  const handleReset = () => {
    handleButtonPress('trash');
    setShowResetWarning(true);
  };

  const handleResetConfirm = useCallback(async () => {
    setShowResetWarning(false);
    await onClose();
    
    const gameStore = useGameStore.getState();
    const jassStore = useJassStore.getState();
    const uiStore = useUIStore.getState();
    const timerStore = useTimerStore.getState();

    jassStore.resetJass();
    gameStore.resetGame();
    uiStore.resetAll();
    timerStore.resetAllTimers();

    setTimeout(() => {
      uiStore.setStartScreenState('initial');
    }, 300);
  }, [onClose]);

  const handleResultatClick = useCallback(() => {
    openResultatKreidetafel(swipePosition);

    setTimeout(() => {
      onClose();
    }, 100);
  }, [openResultatKreidetafel, swipePosition, onClose]);

  const handleFarbeSettingsClick = useCallback(() => {
    openFarbeSettings();
    setTimeout(() => {
      onClose();
    }, 100);
  }, [openFarbeSettings, onClose]);

  const buttons = [
    {
      icon: FaTrashAlt,
      onClick: handleReset,
      color: 'bg-red-500',
      id: 'trash'
    },
    {
      icon: FaInfoCircle,
      onClick: () => setShowIntroduction(true),
      color: 'bg-blue-500',
      id: 'info'
    },
    {
      icon: FaCog,
      onClick: handleFarbeSettingsClick,
      color: 'bg-yellow-500',
      id: 'farbe'
    },
    {
      icon: FaChalkboard,
      onClick: handleResultatClick,
      color: 'bg-green-500',
      id: 'resultat'
    }
  ];

  // Drehe die Reihenfolge der Buttons um, wenn von oben gewischt wird
  const orderedButtons = swipePosition === 'top' ? [...buttons].reverse() : buttons;

  return (
    <>
      <motion.div 
        className={`absolute inset-x-0 top-1/2 transform -translate-y-1/2 flex justify-center items-center h-16 z-10 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } transition-opacity duration-300`}
        variants={containerVariants}
        initial="hidden"
        animate={isOpen ? "visible" : "hidden"}
      >
        <div className="flex justify-center space-x-10">
          {orderedButtons.map(({ icon: Icon, onClick, color, id }) => (
            <motion.button 
              key={id}
              onClick={onClick}
              className={`${iconStyle} ${color} text-white`}
              variants={itemVariants}
              onMouseDown={() => handleButtonPress(id)}
              onTouchStart={() => handleButtonPress(id)}
            >
              <Icon 
                className={`w-full h-full ${pressedButton === id ? 'opacity-70' : ''}`}
                style={{ transform: swipePosition === 'top' ? 'rotate(180deg)' : 'none' }}
              />
            </motion.button>
          ))}
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
      <FarbeSettingsModal />
      <ResetWarning 
        show={showResetWarning}
        onConfirm={handleResetConfirm}
        onDismiss={() => setShowResetWarning(false)}
      />
    </>
  );
};

export default MenuOverlay;
