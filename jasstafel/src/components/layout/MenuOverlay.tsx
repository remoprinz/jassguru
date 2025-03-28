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
import { useTutorialStore } from '../../store/tutorialStore';
import { TUTORIAL_STEPS } from '../../types/tutorial';
import { TutorialCategory } from '../../types/tutorial';
import dynamic from 'next/dynamic';
import { IconType } from 'react-icons';
import { useAuthStore } from '../../store/authStore';
import { useRouter } from 'next/router';

interface MenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  swipePosition: TeamPosition;
}

const TutorialOverlay = dynamic(() => import('../tutorial/TutorialOverlay'), {
  loading: () => null,
  ssr: false // Da Tutorial client-side only ist
});

// Definiere einen Interface-Typ für die Button-Properties
interface MenuButton {
  icon: IconType;
  onClick: () => void;
  color: string;
  id: string;
  className?: string;
  'data-tutorial'?: string;  // Optional data-tutorial Attribut
}

const MenuOverlay: React.FC<MenuOverlayProps> = ({ 
  isOpen, 
  onClose,
  swipePosition 
}) => {
  const { openResultatKreidetafel, openFarbeSettings } = useUIStore();
  const [pressedButton, setPressedButton] = useState<string | null>(null);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const currentStep = useTutorialStore(state => state.getCurrentStep());
  const { isCategoryCompleted } = useTutorialStore();
  const authStore = useAuthStore();
  const router = useRouter();

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
    useUIStore.getState().showNotification({
      message: "Möchtest du den Jass wirklich beenden? Falls du nicht eingeloggt bist, werden die Daten gelöscht.",
      type: 'warning',
      isFlipped: swipePosition === 'top',
      actions: [
        {
          label: 'Zurück',
          onClick: () => {}  // Notification schließt automatisch
        },
        {
          label: 'Jass beenden!',
          onClick: handleResetConfirm,
          className: 'bg-yellow-600 hover:bg-yellow-700'
        }
      ]
    });
  };

  const handleResetConfirm = useCallback(() => {
    // Alle Stores in der richtigen Reihenfolge zurücksetzen
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();
    const uiStore = useUIStore.getState();
    const timerStore = useTimerStore.getState();
    const authStore = useAuthStore.getState();

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
    
    // 6. Weiterleitung basierend auf Login-Status
    if (!authStore.isAuthenticated()) {
      // Nicht eingeloggt -> zurück zum WelcomeScreen
      router.push('/');
    } else {
      // Eingeloggt -> zum StartScreen
      router.push('/start');
    }
  }, [onClose]);

  const handleResultatClick = useCallback(() => {
    openResultatKreidetafel(swipePosition);

    setTimeout(() => {
      onClose();
    }, 100);
  }, [openResultatKreidetafel, swipePosition, onClose]);

  const handleFarbeSettingsClick = useCallback(() => {
    openFarbeSettings();
    
    if (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS) {
      document.dispatchEvent(new Event('settingsOpen'));
    }
  }, [openFarbeSettings, currentStep]);

  const handleInfoClick = useCallback(() => {
    // Nur Tutorials anzeigen, die noch nicht abgeschlossen sind
    const hasUncompletedTutorials = Object.values(TutorialCategory).some(
      category => !isCategoryCompleted(category)
    );
    
    if (hasUncompletedTutorials) {
      useUIStore.getState().openTutorialInfo();
      // Verzögere das Schließen des Menüs um sicherzustellen, 
      // dass das Tutorial-Overlay zuerst geöffnet wird
      setTimeout(() => {
        onClose();
      }, 100);
    } else {
      onClose();
    }
  }, [onClose, isCategoryCompleted]);

  const bottomButtons: MenuButton[] = [
    {
      icon: FaTrashAlt,
      onClick: handleReset,
      color: 'bg-red-500',
      id: 'trash',
      'data-tutorial': 'new-game-button'
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
      id: 'farbe',
      className: 'settings-button'
    },
    {
      icon: TbClipboardText,
      onClick: handleResultatClick,
      color: 'bg-green-500',
      id: 'resultat'
    }
  ];

  const topButtons: MenuButton[] = [
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
      id: 'farbe',
      className: 'settings-button'
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

  const isButtonHighlighted = (id: string) => {
    return (currentStep?.id === TUTORIAL_STEPS.RESULTAT_INFO && id === 'resultat') ||
           (currentStep?.id === TUTORIAL_STEPS.NEW_GAME && id === 'trash') ||
           (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS && id === 'farbe');
  };

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
          {buttons.map(({ icon: Icon, onClick, color, id, className, 'data-tutorial': dataTutorial }) => (
            <motion.button 
              key={id}
              onClick={onClick}
              data-tutorial={dataTutorial}
              disabled={
                (currentStep?.id === TUTORIAL_STEPS.SETTINGS && className !== 'settings-button') ||
                (currentStep?.id === TUTORIAL_STEPS.MENU_GESTURE && id !== 'resultat') ||
                (currentStep?.id === TUTORIAL_STEPS.RESULTAT_INFO && id !== 'resultat') ||
                (currentStep?.id === TUTORIAL_STEPS.NEW_GAME && id !== 'trash') ||
                (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS && id !== 'farbe')
              }
              className={`${iconStyle} ${color} ${className || ''} text-white
                ${isButtonHighlighted(id) ? 'ring-4 ring-white ring-opacity-50 animate-pulse' : ''}
                ${((currentStep?.id === TUTORIAL_STEPS.SETTINGS && className !== 'settings-button') ||
                   currentStep?.id === TUTORIAL_STEPS.MENU_GESTURE ||
                   (currentStep?.id === TUTORIAL_STEPS.RESULTAT_INFO && id !== 'resultat') ||
                   (currentStep?.id === TUTORIAL_STEPS.NEW_GAME && id !== 'trash') ||
                   (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS && id !== 'farbe'))
                  ? 'opacity-50 cursor-not-allowed' 
                  : ''}`}
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
