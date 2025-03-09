import React from 'react';
import { 
  TUTORIAL_STEPS,
  TutorialCategory,
  type TutorialStepId,
  type TutorialSplitContainerEventDetail
} from '../../types/tutorial';
import { useTutorialStore } from '../../store/tutorialStore';
import { useUIStore } from '../../store/uiStore';
import { FiRotateCcw, FiX } from 'react-icons/fi';
import { FaInfoCircle, FaPencilAlt, FaGripLinesVertical, FaTrashAlt, FaCog } from 'react-icons/fa';
import { FaHandshakeSimple } from 'react-icons/fa6';
import { MdSwipe, MdHelp } from 'react-icons/md';
import { animated, useSpring } from 'react-spring';
import { GiCardPick } from 'react-icons/gi';
import { BsLightbulb } from 'react-icons/bs';
import { TbClipboardText } from 'react-icons/tb';
import { useDeviceScale } from '../../hooks/useDeviceScale';

// Lokales Mapping für die Info-Dialog Kategorien (nicht exportiert)
const INFO_CATEGORIES = {
  settings: 'Jass-Einstellungen',
  scoring: 'Punkte schreiben',
  berg: 'Berg schreiben / Bedanken',
  game: 'Neues Spiel / Jass beenden',
  monitor: 'Jass überwachen',
  tips: 'Tipps & Tricks'
} as const;

// Lokale Typ-Ableitung
type InfoCategory = keyof typeof INFO_CATEGORIES;

// Lokale Interface-Definitionen
interface TutorialSectionItem {
  title: string;
  id: TutorialStepId;
  implemented: boolean;
  icon?: React.ElementType;
}

interface TutorialSection {
  category: InfoCategory;
  items?: TutorialSectionItem[];
  title?: string;
  id?: TutorialStepId;
  implemented: boolean;
  icon?: React.ElementType;
  onEnter?: () => void;
  onExit?: () => void;
}

// Definiere die Tutorial-Sektionen
const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    category: 'scoring',
    implemented: true,
    items: [
      { 
        title: 'Punkte schreiben', 
        id: TUTORIAL_STEPS.CALCULATOR_OPEN, 
        implemented: true,
        icon: FaPencilAlt
      }
    ]
  },
  {
    category: 'berg',
    title: 'Berg / Bedanken / Berechnen',
    id: TUTORIAL_STEPS.GAME_INFO,
    implemented: true,
    icon: FaHandshakeSimple
  },
  {
    category: 'game',
    implemented: true,
    items: [
      { 
        title: 'Punkte eintragen', 
        id: TUTORIAL_STEPS.CALCULATOR, 
        implemented: true,
        icon: FaPencilAlt
      },
      { 
        title: 'Spielverlauf korrigieren', 
        id: TUTORIAL_STEPS.NAVIGATE_SCORES, 
        implemented: true,
        icon: MdSwipe
      },
      {
        title: 'Resultate anzeigen',
        id: TUTORIAL_STEPS.RESULTAT_INFO,
        implemented: true,
        icon: FaInfoCircle
      },
      {
        title: 'Neues Spiel starten',
        id: TUTORIAL_STEPS.NEW_GAME,
        implemented: true,
        icon: FiRotateCcw
      }
    ]
  },
  {
    category: 'monitor',
    title: 'Jass monitoren, Differenzen berechnen, etc.',
    id: 'GAME_MONITOR',
    implemented: false
  },
  {
    category: 'tips',
    title: 'Screen wach halten, schneller navigieren, etc.',
    id: 'TIPS_TRICKS',
    implemented: false
  }
];

const TutorialInfoDialog: React.FC = () => {
  const { startTutorial, resetTutorial } = useTutorialStore();
  const { closeTutorialInfo, isTutorialInfoOpen: isOpen } = useUIStore();
  const isFlipped = useUIStore(state => state.calculator.isFlipped);
  const { setCalculatorFlipped } = useUIStore();
  const { overlayScale } = useDeviceScale();

  // HELP_STEPS in die Komponente verschieben
  const HELP_STEPS = [
    {
      title: 'Punkte schreiben',
      id: TUTORIAL_STEPS.CALCULATOR_OPEN,
      icon: FaPencilAlt
    },
    {
      title: 'Weisen',
      id: TUTORIAL_STEPS.WEIS,
      icon: FaGripLinesVertical
    },
    {
      title: 'Berg / Bedanken / Rechnen',
      id: TUTORIAL_STEPS.GAME_INFO,
      icon: FaHandshakeSimple
    },
    {
      title: 'Resultate / Neues Spiel',
      id: TUTORIAL_STEPS.RESULTAT_INFO,
      icon: TbClipboardText,
      onEnter: () => {
        window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
          'tutorial:splitContainer', 
          { detail: { 
            action: 'open', 
            teamPosition: 'bottom',
            stepId: TUTORIAL_STEPS.RESULTAT_INFO 
          }}
        ));
      }
    },
    {
      title: 'Löschen / Neuer Jass',
      id: TUTORIAL_STEPS.NEW_GAME,
      icon: FaTrashAlt,
      onEnter: () => {
        window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
          'tutorial:splitContainer', 
          { detail: { 
            action: 'open', 
            teamPosition: 'bottom',
            stepId: TUTORIAL_STEPS.NEW_GAME 
          }}
        ));
      }
    },
    {
      title: 'Navigieren / Korrigieren',
      id: TUTORIAL_STEPS.NAVIGATE_SCORES,
      icon: MdSwipe
    },
    {
      title: 'Individuelle Einstellungen',
      id: TUTORIAL_STEPS.JASS_SETTINGS,
      icon: FaCog,
      onEnter: () => {
        window.dispatchEvent(new CustomEvent<TutorialSplitContainerEventDetail>(
          'tutorial:splitContainer', 
          { detail: { 
            action: 'open', 
            teamPosition: 'bottom',
            stepId: TUTORIAL_STEPS.JASS_SETTINGS 
          }}
        ));
      }
    },
    {
      title: 'Tipps & Tricks',
      id: TUTORIAL_STEPS.TIPS_WELCOME,
      icon: BsLightbulb,
      onEnter: () => {
        startTutorial(TUTORIAL_STEPS.TIPS_WELCOME);
      }
    }
  ];

  const handleStepSelect = (stepId: TutorialStepId) => {
    const step = HELP_STEPS.find(s => s.id === stepId);
    resetTutorial();
    
    // Erst onEnter ausführen (Container öffnen)
    step?.onEnter?.();
    
    // Dann Tutorial starten
    startTutorial(stepId, { isHelpMode: true });
    closeTutorialInfo();
  };

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? overlayScale : 0.95}) rotate(${isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/50"
      onClick={(e) => {
        // Schließen wenn außerhalb geklickt wird
        if (e.target === e.currentTarget) {
          closeTutorialInfo();
        }
      }}
    >
      <animated.div 
        style={springProps}
        className="relative w-11/12 max-w-md bg-gray-800 bg-opacity-95 rounded-xl p-4 shadow-lg select-none"
        onClick={(e) => e.stopPropagation()} // Verhindert Schließen wenn auf Dialog geklickt wird
      >
        <h2 className="text-2xl font-bold text-white text-center mb-4">
          Hilfe & Anleitungen
        </h2>

        <div className="flex justify-center mb-4">
          <MdHelp className="w-12 h-12 text-yellow-600" />
        </div>

        <button
          onClick={() => setCalculatorFlipped(!isFlipped)}
          className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
            text-white hover:text-gray-300 transition-all duration-1000
            w-24 h-24 flex items-center justify-center rounded-full
            ${isFlipped ? 'rotate-180' : 'rotate-0'}`}
          aria-label="Umdrehen"
        >
          <FiRotateCcw className="w-8 h-8" />
        </button>

        <button 
          onClick={closeTutorialInfo}
          className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white transition-colors"
        >
          <FiX size={28} />
        </button>

        <div className="overflow-y-auto max-h-[60vh] pr-2 space-y-2">
          {HELP_STEPS.map(step => (
            <button
              key={step.id}
              onClick={() => handleStepSelect(step.id)}
              className="w-full flex items-center gap-4 p-4 rounded-lg
                text-gray-200 hover:bg-gray-700 transition-colors text-xl"
            >
              {step.icon && <step.icon className="w-7 h-7 text-yellow-600" />}
              <span>{step.title}</span>
            </button>
          ))}
        </div>
      </animated.div>
    </div>
  );
};

export default TutorialInfoDialog; 