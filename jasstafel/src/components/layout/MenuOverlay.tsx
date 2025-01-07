import React, { useState, useCallback } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useJassStore } from '../../store/jassStore';
import { useUIStore } from '../../store/uiStore';
import { useTimerStore } from '../../store/timerStore';
import { FaTrashAlt, FaInfoCircle, FaCog } from 'react-icons/fa';
import { TbClipboardText } from 'react-icons/tb';
import { motion } from 'framer-motion';
import ResetWarning from '../notifications/ResetWarning';
import FarbeSettingsModal from '../settings/SettingsModal';
import type { TeamPosition } from '../../types/jass';
import { isPWA } from '../../utils/browserDetection';

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
  const { openResultatKreidetafel, openFarbeSettings } = useUIStore();
  const [pressedButton, setPressedButton] = useState<string | null>(null);
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

  const handleResetConfirm = useCallback(() => {
    // Alle Stores in der richtigen Reihenfolge zurücksetzen
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    const uiStore = useUIStore.getState();
    const timerStore = useTimerStore.getState();

    // 1. Zuerst Jass zurücksetzen (triggert isJassStarted = false)
    jassStore.resetJass();

    // 2. Dann Game zurücksetzen
    gameStore.resetGame();

    // 3. UI zurücksetzen
    uiStore.resetAll();

    // 4. Timer stoppen und zurücksetzen
    timerStore.resetAllTimers();

    // 5. Dialog schließen
    setShowResetWarning(false);
    onClose();
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

  const handleInfoClick = useCallback(() => {
    useUIStore.getState().showOnboarding(true, isPWA());
    onClose();
  }, [onClose]);

  const bottomButtons = [
    {
      icon: FaTrashAlt,
      onClick: handleReset,
      color: 'bg-red-500',
      id: 'trash'
    },
    {
      icon: FaInfoCircle,
      onClick: handleInfoClick,
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
      icon: TbClipboardText,
      onClick: handleResultatClick,
      color: 'bg-green-500',
      id: 'resultat'
    }
  ];

  const topButtons = [
    {
      icon: TbClipboardText,
      onClick: handleResultatClick,
      color: 'bg-green-500',
      id: 'resultat'
    },
    {
      icon: FaCog,
      onClick: handleFarbeSettingsClick,
      color: 'bg-yellow-500',
      id: 'farbe'
    },
    {
      icon: FaInfoCircle,
      onClick: handleInfoClick,
      color: 'bg-blue-500',
      id: 'info'
    },
    {
      icon: FaTrashAlt,
      onClick: handleReset,
      color: 'bg-red-500',
      id: 'trash'
    }
  ];

  const buttons = swipePosition === 'top' ? topButtons : bottomButtons;

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
          {buttons.map(({ icon: Icon, onClick, color, id }) => (
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
                style={{
                  transform: swipePosition === 'top' ? 'rotate(180deg)' : 'none'
                }}
              />
            </motion.button>
          ))}
        </div>
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
