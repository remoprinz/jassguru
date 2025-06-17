import React, {useState, useCallback} from "react";
import {useGameStore} from "../../store/gameStore";
import {useJassStore} from "../../store/jassStore";
import {useUIStore} from "../../store/uiStore";
import {useTimerStore} from "../../store/timerStore";
import {FaTrashAlt, FaInfoCircle, FaCog, FaHome} from "react-icons/fa";
import {TbClipboardText} from "react-icons/tb";
import {motion} from "framer-motion";
import ResetWarning from "../notifications/ResetWarning";
import FarbeSettingsModal from "../settings/SettingsModal";
import type {TeamPosition} from "../../types/jass";
import {useTutorialStore} from "../../store/tutorialStore";
import {TUTORIAL_STEPS, TutorialCategory} from "../../types/tutorial";
import dynamic from "next/dynamic";
import {IconType} from "react-icons";
import GlobalLoader from "./GlobalLoader";
import {useAuthStore} from "../../store/authStore";
import {useRouter} from "next/router";
import { abortActiveGame } from "@/services/gameService";
import { debouncedRouterPush } from '../../utils/routerUtils';
import { useTournamentStore } from "@/store/tournamentStore";

interface MenuOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  swipePosition: TeamPosition;
}

const TutorialOverlay = dynamic(() => import("../tutorial/TutorialOverlay"), {
  loading: () => null,
  ssr: false, // Da Tutorial client-side only ist
});

// Definiere einen Interface-Typ für die Button-Properties
interface MenuButton {
  icon: IconType;
  onClick: () => void;
  color: string;
  id: string;
  className?: string;
  "data-tutorial"?: string; // Optional data-tutorial Attribut
}

const MenuOverlay: React.FC<MenuOverlayProps> = ({
  isOpen,
  onClose,
  swipePosition,
}) => {
  const {openResultatKreidetafel, openSettings, isReadOnlyMode} = useUIStore();
  const [pressedButton, setPressedButton] = useState<string | null>(null);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const currentStep = useTutorialStore((state) => state.getCurrentStep());
  const {isCategoryCompleted} = useTutorialStore();
  const authStore = useAuthStore();
  const router = useRouter();
  const isAuthenticated = authStore.isAuthenticated;
  const jassSessionId = useJassStore((state) => state.jassSessionId);
  const gameStoreState = useGameStore.getState();
  const activeGameData = gameStoreState.activeGameId ? gameStoreState : null;
  const userActiveTournamentId = useTournamentStore((state) => state.userActiveTournamentId);

  const iconStyle = "w-12 h-12 p-2 rounded-xl shadow-md transition-transform hover:scale-110";

  const containerVariants = {
    hidden: {opacity: 0},
    visible: {
      opacity: 1,
      transition: {
        when: "beforeChildren",
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: {opacity: 0, y: 0},
    visible: {opacity: 1, y: 0},
  };

  const handleButtonPress = (buttonId: string) => {
    setPressedButton(buttonId);
    setTimeout(() => setPressedButton(null), 150);
  };

  const handleHomeClick = useCallback(() => {
    handleButtonPress("home");

    let targetRoute = "/auth/login"; // Default für nicht eingeloggte User

    if (authStore.status === "authenticated") {
      if (userActiveTournamentId) {
        targetRoute = `/view/tournament/${userActiveTournamentId}`;
        console.log(`[MenuOverlay] Active tournament detected via tournamentStore. Navigating to: ${targetRoute}`);
      } else {
        targetRoute = "/start";
        console.log(`[MenuOverlay] No active tournament in tournamentStore. Navigating to: ${targetRoute}`);
      }
    } else {
        console.log(`[MenuOverlay] User not authenticated. Navigating to: ${targetRoute}`);
    }
    
    debouncedRouterPush(router, targetRoute);

    setTimeout(() => {
      onClose();
    }, 150); // Etwas mehr Zeit für die Navigation geben
  }, [router, onClose, authStore, userActiveTournamentId]);

  const handleReset = () => {
    handleButtonPress("trash");
    
    if (isReadOnlyMode) {
      useUIStore.getState().showNotification({
        type: 'info',
        message: 'Als Zuschauer können keine Partien abgebrochen werden.'
      });
      return;
    }

    const currentActiveGameId = useGameStore.getState().activeGameId; // Kann string | null | undefined sein
    let currentTournamentInstanceId: string | null = null;
    const currentJassStoreSession = useJassStore.getState().currentSession;
    if (currentJassStoreSession?.isTournamentSession && currentJassStoreSession?.tournamentInstanceId) {
      currentTournamentInstanceId = currentJassStoreSession.tournamentInstanceId;
    }
    
    useUIStore.getState().showNotification({
      message: "Möchtest du diesen Jass wirklich abbrechen? Die Partie geht verloren und wird nicht gespeichert.",
      type: "error",
      isFlipped: swipePosition === "top",
      actions: [
        {
          label: "Nein",
          onClick: () => {},
        },
        {
          label: "Ja, abbrechen!",
          // gameIdToAbort kann jetzt string | null | undefined sein
          onClick: () => handleAbortConfirm(currentActiveGameId, currentTournamentInstanceId),
          className: "bg-red-600 hover:bg-red-700",
        },
      ],
    });
  };

  const handleAbortConfirm = useCallback(async (gameIdToAbort?: string | null, tournamentIdForService?: string | null) => {
    const gameStore = useGameStore.getState();
    const jassStore = useJassStore.getState();
    const authStore = useAuthStore.getState();
    const uiStore = useUIStore.getState();
    
    const activeGameId = gameIdToAbort;
    const currentJassSessionId = jassStore.jassSessionId;

    // Ermittle, ob es eine Turnierpasse war
    const isTournamentPasse = !!tournamentIdForService;
    const tournamentInstanceIdForAbort = tournamentIdForService;

    if (isTournamentPasse && tournamentInstanceIdForAbort) {
        console.log(`[MenuOverlay] Turnierpasse erkannt. Instance ID: ${tournamentInstanceIdForAbort}, Game ID to abort: ${activeGameId}`);
    } else {
        console.log(`[MenuOverlay] Gruppenpasse (oder kein Spiel aktiv) erkannt. Game ID to abort: ${activeGameId}`);
    }

    // Verwende die neue, zentrale abortActiveGame-Funktion
    if (activeGameId && gameStore.isGameStarted && !gameStore.isGameCompleted) {
        try {
            setIsAborting(true);
            console.log(`[MenuOverlay] Calling abortActiveGame for ${activeGameId}`);
            await abortActiveGame(activeGameId, {
                tournamentInstanceId: tournamentInstanceIdForAbort || undefined,
                skipSessionCleanup: false
            });
            console.log(`[MenuOverlay] Successfully aborted game ${activeGameId}`);
            
            // SUCCESS NOTIFICATION ENTFERNT - cleanupAbortedSession zeigt bereits eine Meldung
        } catch (error) {
            console.error(`[MenuOverlay] Error aborting game ${activeGameId}:`, error);
            uiStore.showNotification({
                type: 'error',
                message: 'Fehler beim Abbrechen des Spiels.',
            });
            return; // Beende die Funktion bei Fehler
        } finally {
            setIsAborting(false);
        }
    } else {
        console.log(`[MenuOverlay] Kein aktives Spiel zum Abbrechen gefunden (ID: ${activeGameId}) oder Spiel bereits beendet/nicht gestartet.`);
    }

    // Lokale Stores zurücksetzen
    console.log("[MenuOverlay] Resetting local stores (Game, Jass, Timer)");
    useGameStore.getState().resetGameState({ newActiveGameId: null }); 
    useJassStore.getState().resetJass(); 
    useTimerStore.getState().resetAllTimers();
    
    onClose();

    // Navigation
    const isGuestMode = authStore.isGuest;
    const isTrulyAuthenticated = authStore.status === 'authenticated' && !isGuestMode;
    
    if (isGuestMode) {
      console.log("[MenuOverlay] Gastmodus erkannt: Aufsetzen eines neuen Spiels in der Jasstafel");
      useUIStore.getState().resetStartScreen();
      await debouncedRouterPush(router, "/jass");
    } else {
      const targetRoute = isTrulyAuthenticated ? "/start" : "/auth/register";
      console.log(`[MenuOverlay] Navigating to ${targetRoute} (isTrulyAuthenticated: ${isTrulyAuthenticated})`);
      await debouncedRouterPush(router, targetRoute);
    }

  }, [onClose, router]);

  const handleResultatClick = useCallback(() => {
    openResultatKreidetafel(swipePosition);

    setTimeout(() => {
      onClose();
    }, 100);
  }, [openResultatKreidetafel, swipePosition, onClose]);

  const handleFarbeSettingsClick = useCallback(() => {
    openSettings();

    if (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS) {
      document.dispatchEvent(new Event("settingsOpen"));
    }
  }, [openSettings, currentStep]);

  const handleInfoClick = useCallback(() => {
    // Nur Tutorials anzeigen, die noch nicht abgeschlossen sind
    const hasUncompletedTutorials = Object.values(TutorialCategory).some(
      (category) => !isCategoryCompleted(category)
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

  // === Button-Definitionen anpassen ===
  const allButtonsBase: Omit<MenuButton, 'onClick'>[] = [
    { "icon": FaTrashAlt, "color": "bg-red-500", "id": "trash", "data-tutorial": "new-game-button" },
    { icon: FaInfoCircle, color: "bg-yellow-500", id: "info" },
    { icon: FaHome, color: "bg-blue-500", id: "home" },
    { icon: FaCog, color: "bg-blue-500", id: "farbe", className: "settings-button" }, 
    { icon: TbClipboardText, color: "bg-green-500", id: "resultat" },
  ];

  // Bestimme Gästemodus
  const isGuestMode = authStore.isGuest || authStore.status !== 'authenticated';
  
  // Filter Buttons basierend auf Benutzertyp
  const filteredButtonDefs = allButtonsBase.filter(button => {
    // Entferne Settings-Button für authentifizierte Benutzer oder im ReadOnly-Modus
    if ((authStore.status === 'authenticated' || isReadOnlyMode) && button.id === 'farbe') {
      return false;
    }
    
    // Entferne Home-Button für Gäste
    if (isGuestMode && button.id === 'home') {
      return false;
    }
    
    return true;
  });

  // Füge die onClick Handler hinzu
  const getClickHandler = (id: string): (() => void) => {
    switch (id) {
      case 'trash': return handleReset;
      case 'info': return handleInfoClick;
      case 'home': return handleHomeClick;
      case 'farbe': return handleFarbeSettingsClick; // Wird nur im Gastmodus relevant
      case 'resultat': return handleResultatClick;
      default: return () => {};
    }
  };

  const finalButtonDefs: MenuButton[] = filteredButtonDefs.map(def => ({
    ...def,
    onClick: getClickHandler(def.id),
  }));

  // Buttons für Top/Bottom erstellen
  const topButtons = swipePosition === 'top' ? [...finalButtonDefs].reverse() : finalButtonDefs;
  const bottomButtons = swipePosition === 'bottom' ? finalButtonDefs : [...finalButtonDefs].reverse();

  const buttonsToRender = swipePosition === "top" ? topButtons : bottomButtons;
  // === Ende Button-Definitionen ===

  const isButtonHighlighted = (id: string) => {
    return (currentStep?.id === TUTORIAL_STEPS.RESULTAT_INFO && id === "resultat") ||
           (currentStep?.id === TUTORIAL_STEPS.NEW_GAME && id === "trash") ||
           (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS && id === "farbe");
  };

  return (
    <>
      {isAborting && (
        <GlobalLoader 
          message="Spiel wird abgebrochen..." 
          color="white"
        />
      )}
      
      <motion.div
        className={`absolute inset-x-0 top-1/2 transform -translate-y-1/2 flex justify-center items-center h-16 z-10 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        } transition-opacity duration-300`}
        variants={containerVariants}
        initial="hidden"
        animate={isOpen ? "visible" : "hidden"}
      >
        <div className="flex justify-center items-center w-full px-8 sm:px-12 min-w-[320px]">
          <div className={`flex w-full max-w-2xl ${ 
            buttonsToRender.length === 4 ? 'justify-around' : 'justify-between space-x-4 sm:space-x-6' 
          }`}>
            {buttonsToRender.map(({icon: Icon, onClick, color, id, className, "data-tutorial": dataTutorial}) => (
              <motion.button
                key={id}
                onClick={onClick}
                data-tutorial={dataTutorial}
                disabled={
                  (currentStep?.id === TUTORIAL_STEPS.SETTINGS && className !== "settings-button") ||
                  (currentStep?.id === TUTORIAL_STEPS.MENU_GESTURE && id !== "resultat") ||
                  (currentStep?.id === TUTORIAL_STEPS.RESULTAT_INFO && id !== "resultat") ||
                  (currentStep?.id === TUTORIAL_STEPS.NEW_GAME && id !== "trash") ||
                  (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS && id !== "farbe" && authStore.status === 'authenticated' && !authStore.isGuest)
                }
                className={`${iconStyle} ${color} ${className || ""} text-white flex-shrink-0
                  ${isButtonHighlighted(id) ? "ring-4 ring-white ring-opacity-50 animate-pulse" : ""}
                  ${(
                    (currentStep?.id === TUTORIAL_STEPS.SETTINGS && className !== "settings-button") ||
                    currentStep?.id === TUTORIAL_STEPS.MENU_GESTURE ||
                    (currentStep?.id === TUTORIAL_STEPS.RESULTAT_INFO && id !== "resultat") ||
                    (currentStep?.id === TUTORIAL_STEPS.NEW_GAME && id !== "trash") ||
                    (currentStep?.id === TUTORIAL_STEPS.JASS_SETTINGS && id !== "farbe" && authStore.status === 'authenticated' && !authStore.isGuest)
                  ) ?
                "opacity-50 cursor-not-allowed" :
                ""}`}
                variants={itemVariants}
                onMouseDown={() => handleButtonPress(id)}
                onTouchStart={() => handleButtonPress(id)}
              >
                <Icon
                  className={`w-full h-full ${pressedButton === id ? "opacity-70" : ""}`}
                  style={{
                    transform: swipePosition === "top" ? "rotate(180deg)" : "none",
                  }}
                />
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
      <FarbeSettingsModal />
      <ResetWarning
        show={showResetWarning}
        onConfirm={handleAbortConfirm}
        onDismiss={() => setShowResetWarning(false)}
      />
    </>
  );
};

export default MenuOverlay;
