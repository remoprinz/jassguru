import { GiCardPick } from 'react-icons/gi';
import { MdSwipeVertical } from 'react-icons/md';
import { TUTORIAL_STEPS, TutorialCategory, type TutorialStep, type TutorialStepId, type TutorialSplitContainerEventDetail } from '../types/tutorial';
import { useUIStore } from '../store/uiStore';
import { useTutorialStore } from '../store/tutorialStore';
import { FaGripLinesVertical } from 'react-icons/fa';
import { FaTrashCan } from 'react-icons/fa6';
import { TbClipboardText } from 'react-icons/tb';
import { FaHandshakeSimple } from 'react-icons/fa6';
import { FaPencilAlt } from 'react-icons/fa';
import { MdSwipe } from 'react-icons/md';
import { BsXCircle, BsApple } from 'react-icons/bs';
import { FaCog } from 'react-icons/fa';

export const TUTORIAL_CONTENT: TutorialStep[] = [
  // Basic Tutorial Flow
  {
    id: TUTORIAL_STEPS.WELCOME,
    title: "Hoi zäme!",
    content: "Bereit für eine kleine Führung durch die App? Führe die folgendenden Aktionen durch!",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -40}
    },
    image: '/welcome-guru.png',
    category: TutorialCategory.BASIC,
    order: 1,
    autoProgress: false,
    onEnter: () => {
      console.log('🎬 WELCOME onEnter');
      
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'close', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.WELCOME 
        }}
      ));
    }
  },
  {
    id: TUTORIAL_STEPS.MENU_GESTURE,
    title: "Menü öffnen",
    content: "Wische auf deiner Hälfte der Jasstafel nach oben oder unten.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    category: TutorialCategory.BASIC,
    order: 2,
    action: {
      type: 'split',
      position: 'bottom'
    },
    icon: MdSwipeVertical,
    autoProgress: false,
    onEnter: () => {
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'open', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.MENU_GESTURE 
        }}
      ));
    },
    onExit: () => {
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'close', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.MENU_GESTURE 
        }}
      ));
    }
  },
  {
    id: TUTORIAL_STEPS.WEIS,
    title: "Weise schreiben",
    content: "Tippe auf die Z-Linie um Weise einzutragen.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    category: TutorialCategory.BASIC,
    order: 3,
    action: {
      type: 'click',
      position: 'bottom'
    },
    icon: FaGripLinesVertical,
    autoProgress: false,
    onExit: () => {
      const uiStore = useUIStore.getState();
      uiStore.setMenuOpen(false);
    }
  },
  {
    id: TUTORIAL_STEPS.CALCULATOR_OPEN,
    title: "Punkte schreiben",
    content: "Drücke lange auf die Seite des zählenden Teams, bis der Rechner erscheint. Tippe die Punkte ein, wähle die Farbe und bestätige mit OK. Matsch hat seinen eigenen Knopf.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    category: TutorialCategory.BASIC,
    order: 4,
    action: {
      type: 'longpress',
      position: 'bottom'
    },
    icon: FaPencilAlt,
    autoProgress: false,
    onEnter: () => {
      useTutorialStore.getState().setTutorialUIBlocking({
        calculatorClose: false
      });
    },
    onExit: () => {
      useTutorialStore.getState().setTutorialUIBlocking({
        calculatorClose: true
      });
    }
  },
  {
    id: TUTORIAL_STEPS.GAME_INFO,
    title: "Berg / Bedanken / Rechnen",
    content: "Doppelklicke auf die Seite des erfolgreichen Teams, um den Berg zu schreiben oder euch zu bedanken. Der orange Knopf hilft bei Berechnungen. Ausserdem ist hier auch die Pause-Funktion.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    category: TutorialCategory.BASIC,
    order: 5,
    action: {
      type: 'doubleclick',
      position: 'bottom'
    },
    icon: FaHandshakeSimple,
    autoProgress: false,
    onEnter: () => {
      useTutorialStore.getState().setTutorialUIBlocking({
        gameInfoClose: false
      });
    },
    onExit: () => {
      const uiStore = useUIStore.getState();
      uiStore.closeAllOverlays();
      useTutorialStore.getState().setTutorialUIBlocking({
        gameInfoClose: false
      });
    }
  },
  {
    id: TUTORIAL_STEPS.RESULTAT_INFO,
    title: "Weiterjassen / Beenden",
    content: "Setze den Jass fort, beende ihn oder prüfe den Zwischenstand.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    category: TutorialCategory.BASIC,
    order: 6,
    icon: TbClipboardText,
    autoProgress: false,
    onEnter: () => {
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'open', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.RESULTAT_INFO 
        }}
      ));
    },
    onExit: () => {
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'close', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.RESULTAT_INFO 
        }}
      ));
    }
  },
  {
    id: TUTORIAL_STEPS.NAVIGATE_SCORES,
    title: "Punktestand korrigieren",
    content: "Swipe nach links oder rechts, um durch den Spielverlauf zu navigieren. Du kannst so den Punktestand jederzeit korrigieren.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    category: TutorialCategory.BASIC,
    order: 7,
    icon: MdSwipe,
    autoProgress: false,
    onEnter: () => {
      const uiStore = useUIStore.getState();
      uiStore.setMenuOpen(false);
    }
  },
  {
    id: TUTORIAL_STEPS.NEW_GAME,
    title: "Neustart",
    content: "Hier startest du einen neuen Jass. Die alten Spiele werden dann gelöscht.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    category: TutorialCategory.BASIC,
    order: 8,
    action: {
      type: 'split',
      position: 'bottom'
    },
    icon: FaTrashCan,
    autoProgress: false,
    onEnter: () => {
      const uiStore = useUIStore.getState();
      uiStore.setMenuOpen(true);
      uiStore.setOverlayPosition('bottom');
      
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'open', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.NEW_GAME 
        }}
      ));
      
      useTutorialStore.getState().setTutorialUIBlocking({
        settingsClose: true,
        calculatorClose: true,
        gameInfoClose: true,
        resultatKreidetafelClose: true
      });
    },
    onExit: () => {
      const uiStore = useUIStore.getState();
      uiStore.closeAllOverlays();
      
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'close', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.NEW_GAME 
        }}
      ));
      
      uiStore.tutorialBlockedUI = {
        settingsClose: false,
        calculatorClose: false,
        gameInfoClose: false,
        resultatKreidetafelClose: false
      };
    }
  },
  {
    id: TUTORIAL_STEPS.JASS_SETTINGS,
    title: "Jass-Einstellungen",
    content: "Hier kannst du Zielpunkte, Farben und Multiplikatoren ändern. Blättere links oder rechts für weitere Optionen.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    category: TutorialCategory.BASIC,
    order: 9,
    action: {
      type: 'split',
      position: 'bottom'
    },
    icon: FaCog,
    autoProgress: false,
    onEnter: () => {
      const uiStore = useUIStore.getState();
      uiStore.setMenuOpen(true);
      uiStore.setOverlayPosition('bottom');
      
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'open', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.JASS_SETTINGS 
        }}
      ));
      
      uiStore.tutorialBlockedUI = {
        settingsClose: true,
        calculatorClose: true,
        gameInfoClose: true,
        resultatKreidetafelClose: true
      };
    },
    onExit: () => {
      const uiStore = useUIStore.getState();
      uiStore.closeAllOverlays();
      
      window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
        'tutorial:splitContainer', 
        { detail: { 
          action: 'close', 
          teamPosition: 'bottom',
          stepId: TUTORIAL_STEPS.JASS_SETTINGS 
        }}
      ));
      
      uiStore.tutorialBlockedUI = {
        settingsClose: false,
        calculatorClose: false,
        gameInfoClose: false,
        resultatKreidetafelClose: false
      };
    }
  },
  {
    id: TUTORIAL_STEPS.BASIC_COMPLETE,
    title: "Bingo!",
    content: "Du kennst nun alle wichtigen Funktionen. Du kannst jetzt losjassen!",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -40}
    },
    image: '/welcome-guru.png',
    category: TutorialCategory.BASIC,
    order: 10,
    autoProgress: false,
    onEnter: () => {
      const tutorialStore = useTutorialStore.getState();
      tutorialStore.markCategoryAsCompleted(TutorialCategory.BASIC);
    },
    onExit: () => {
      const tutorialStore = useTutorialStore.getState();
      tutorialStore.endTutorial(true);
    }
  },

  // Settings Flow
  {
    id: TUTORIAL_STEPS.SETTINGS,
    title: "Jass-Einstellungen",
    content: "Bevor wir loslegen, nehmen wir deine individuellen Einstellungen vor.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -90 }
    },
    target: '.settings-button',
    category: TutorialCategory.SETTINGS,
    order: 1,
    action: {
      type: 'click'
    },
    icon: GiCardPick,
    autoProgress: false,
    hideNavigation: true,
    navigation: {
      next: {
        targetStep: TUTORIAL_STEPS.SETTINGS_INTRO,
        skipSteps: false
      }
    }
  },
  {
    id: TUTORIAL_STEPS.SETTINGS_INTRO,
    content: "Klicke auf die Knöpfe und wähle deine Präferenzen aus.",
    overlayPosition: {
      vertical: 'bottom',
      horizontal: 'center',
      offset: { y: -50 }
    },
    category: TutorialCategory.SETTINGS,
    order: 2,
    autoProgress: false,
    navigation: {
      next: {
        targetStep: TUTORIAL_STEPS.SETTINGS_NAVIGATE,
        skipSteps: false
      },
      back: {
        targetStep: TUTORIAL_STEPS.SETTINGS,
        skipSteps: false
      }
    },
    onEnter: () => {
      useTutorialStore.getState().setTutorialUIBlocking({ settingsClose: true });
    },
    onExit: () => {
      useTutorialStore.getState().setTutorialUIBlocking({ settingsClose: false });
    }
  },
  {
    id: TUTORIAL_STEPS.SETTINGS_NAVIGATE,
    content: "Wechsle zur nächsten Seite und nehme die Punkte-Einstellungen vor.",
    overlayPosition: {
      vertical: 'bottom',
      horizontal: 'center',
      offset: { y: 120 }
    },
    target: '#settings-navigation-next-button',
    category: TutorialCategory.SETTINGS,
    order: 3,
    action: {
      type: 'click'
    },
    autoProgress: true,
    hideNavigation: true,
    navigation: {
      next: {
        targetStep: TUTORIAL_STEPS.SETTINGS_SCORES,
        skipSteps: false
      },
      back: {
        targetStep: TUTORIAL_STEPS.SETTINGS_INTRO,
        skipSteps: false
      }
    }
  },
  {
    id: TUTORIAL_STEPS.SETTINGS_SCORES,
    content: "Bestimme nun deine Zielpunktzahlen.",
    overlayPosition: {
      vertical: 'bottom',
      horizontal: 'center',
      offset: { y: -32 }
    },
    category: TutorialCategory.SETTINGS,
    order: 4,
    autoProgress: false,
    navigation: {
      next: {
        targetStep: TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES,
        skipSteps: false
      },
      back: {
        targetStep: TUTORIAL_STEPS.SETTINGS_NAVIGATE,
        skipSteps: false
      }
    }
  },
  {
    id: TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES,
    content: "Klicke wieder auf den Pfeil nach rechts, um die Striche-Einstellungen vorzunehmen.",
    overlayPosition: {
      vertical: 'bottom',
      horizontal: 'center',
      offset: { y: 110 }
    },
    category: TutorialCategory.SETTINGS,
    order: 5,
    action: {
      type: 'click'
    },
    autoProgress: true,
    hideNavigation: true,
    navigation: {
      next: {
        targetStep: TUTORIAL_STEPS.SETTINGS_STROKES,
        skipSteps: false
      },
      back: {
        targetStep: TUTORIAL_STEPS.SETTINGS_SCORES,
        skipSteps: false
      }
    }
  },
  {
    id: TUTORIAL_STEPS.SETTINGS_STROKES,
    title: "Striche Einstellungen",
    content: "Wähle wieviele Striche Schneider/Kontermatsch bei deiner Jassrunde zählen.",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -50 }
    },
    category: TutorialCategory.SETTINGS,
    order: 6,
    autoProgress: false,
    hideNavigation: true,
    navigation: {
      next: {
        targetStep: TUTORIAL_STEPS.BINGO_SETTINGS,
        skipSteps: false
      },
      back: {
        targetStep: TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES,
        skipSteps: false
      }
    },
    onExit: () => {
      const uiStore = useUIStore.getState();
      
      uiStore.splitContainer.isOpen = false;
      uiStore.menu.isOpen = false;
      
      uiStore.closeAllOverlays();
      uiStore.setMenuOpen(false);
      
      uiStore.tutorialBlockedUI = {
        settingsClose: false,
        calculatorClose: false,
        gameInfoClose: false,
        resultatKreidetafelClose: false
      };

      console.log('🧹 Cleaning up after settings:', { 
        splitContainerOpen: uiStore.splitContainer.isOpen,
        menuOpen: uiStore.menu.isOpen
      });
    }
  },

  {
    id: TUTORIAL_STEPS.BINGO_SETTINGS,
    title: "Bingo!",
    content: "Du hast die Jass-Einstellungen abgeschlossen. Du kannst diese jederzeit wieder ändern. Du kannst jetzt losjassen!",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -40}
    },
    image: '/welcome-guru.png',
    category: TutorialCategory.SETTINGS,
    order: 8,
    autoProgress: false
  },

  // Game Flow
  {
    id: TUTORIAL_STEPS.CALCULATOR,
    title: "Punkte eintragen",
    content: "Halte die Seite des zählenden Spielers lange gedrückt, um Punkte einzutragen.",
    overlayPosition: {
      vertical: 'bottom',
      horizontal: 'center'
    },
    target: '.split-container',
    category: TutorialCategory.GAME,
    order: 1,
    action: {
      type: 'longpress'
    }
  },

  // Tipps Tutorial Flow
  {
    id: TUTORIAL_STEPS.TIPS_WELCOME,
    title: "Tipps & Tricks",
    content: "Hier noch ein paar Tipps, die dir das Jassen erleichtern:",
    overlayPosition: {
      vertical: 'top',
      horizontal: 'center',
      offset: { y: -40}
    },
    image: '/welcome-guru.png',
    category: TutorialCategory.TIPS,
    order: 1,
    autoProgress: false
  },
  {
    id: TUTORIAL_STEPS.TIPS_PLAYER_ORDER,
    title: "Spielerreihenfolge ändern",
    content: "Falls die Spielerreihenfolge geändert werden muss, einfach auf den Namen klicken und den gewünschten Spieler auswählen.",
    overlayPosition: {
      vertical: 'center',
      horizontal: 'center'
    },
    category: TutorialCategory.TIPS,
    order: 2,
    image: '/tutorial_pics/dropdown-namen.png',
    autoProgress: false
  },
  {
    id: TUTORIAL_STEPS.TIPS_QUICK_CLOSE,
    title: "Schnelles Schliessen",
    content: "Du kannst alle Komponenten auch durch Klicken ausserhalb des Fensters schliessen - das ist oft schneller als den Schliessen-Button zu treffen.",
    overlayPosition: {
      vertical: 'center',
      horizontal: 'center'
    },
    category: TutorialCategory.TIPS,
    order: 3,
    icon: BsXCircle,
    autoProgress: false
  },
  {
    id: TUTORIAL_STEPS.TIPS_IPHONE_WAKE,
    title: "Tipp für iPhone Nutzer",
    content: "Da die Wachhalte-Funktion auf iPhones nicht verfügbar ist, empfehlen wir dir die Auto-Sperre auf 5 Minuten einzustellen:\n\nEinstellungen → Bildschirm & Helligkeit → Automatische Sperre → 5 Minuten",
    overlayPosition: {
      vertical: 'center',
      horizontal: 'center'
    },
    category: TutorialCategory.TIPS,
    order: 4,
    icon: BsApple,
    autoProgress: false,
    onExit: () => {
      const tutorialStore = useTutorialStore.getState();
      tutorialStore.markCategoryAsCompleted(TutorialCategory.TIPS);
      tutorialStore.endTutorial(true);
    }
  }
];

// Hilfsfunktion zum Sortieren der Tutorials
export const getSortedTutorials = (category?: TutorialCategory) => {
  const tutorials = TUTORIAL_CONTENT;
  if (category) {
    return tutorials
      .filter(t => t.category === category)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  return tutorials.sort((a, b) => (a.order || 0) - (b.order || 0));
}; 