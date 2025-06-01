import React, {type ReactElement, useState, useEffect, memo, useRef} from "react";
import {AnimatePresence} from "framer-motion";
import {useSpring, animated} from "react-spring";
import {FARBE_MODES} from "../../config/FarbeSettings";
import {useUIStore} from "../../store/uiStore";
import {FiRotateCcw, FiX, FiChevronLeft, FiChevronRight} from "react-icons/fi";
import {
  type ScoreMode,
  type JassColor,
  type FarbeModeKey,
  CardStyle} from "../../types/jass";
import {getPictogram} from "../../utils/pictogramUtils";
import dynamic from "next/dynamic";
import {CARD_SYMBOL_MAPPINGS} from "../../config/CardStyles";
import {usePressableButton} from "../../hooks/usePressableButton";
import {useTutorialComponent} from "../../hooks/useTutorialComponent";
import {SCORE_MODES} from "../../config/ScoreSettings";
import {useTutorialStore} from "../../store/tutorialStore";
import {TUTORIAL_STEPS} from "../../types/tutorial";
import {toTitleCase} from "@/utils/formatUtils";
import { DEFAULT_FARBE_SETTINGS } from "@/config/FarbeSettings";
import { DEFAULT_SCORE_SETTINGS } from "@/config/ScoreSettings";
import { DEFAULT_STROKE_SETTINGS } from "@/config/GameSettings";
import { Button } from "../ui/button";
import { v4 as uuidv4 } from 'uuid';
import { FarbePictogram } from './FarbePictogram';

// Neue Konstante für Multiplier-Optionen
const MULTIPLIER_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// Neue Konstanten für Score-Einstellungen
const SCORE_RANGES = {
  sieg: {
    min: 0,
    max: SCORE_MODES.find((m) => m.id === "sieg")?.maxValue || 10000,
    default: SCORE_MODES.find((m) => m.id === "sieg")?.defaultValue || 2000,
  },
  berg: {
    min: 0,
    max: SCORE_MODES.find((m) => m.id === "berg")?.maxValue || 5000,
    default: SCORE_MODES.find((m) => m.id === "berg")?.defaultValue || 2000,
  },
  schneider: {
    min: 0,
    max: SCORE_MODES.find((m) => m.id === "schneider")?.maxValue || 5000,
    default: SCORE_MODES.find((m) => m.id === "schneider")?.defaultValue || 1000,
  },
} as const;

interface MultiplierButtonProps {
  multiplier: number;
  onMultiplierClick: () => void;
}

const MultiplierButton = ({multiplier, onMultiplierClick}: MultiplierButtonProps): ReactElement => (
  <button
    type="button"
    onClick={onMultiplierClick}
    className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
      ${multiplier === 0 ?
    "bg-gray-600/50 text-gray-400 hover:bg-gray-700/50" :
    "bg-orange-500 text-white hover:bg-orange-600 active:scale-95 active:opacity-80"}`}
  >
    {multiplier === 0 ? "-" : `${multiplier}x`}
  </button>
);

// Neue PictogramModeButton Komponente
const PictogramModeButton: React.FC<{
  isEnabled: boolean;
  mode: "svg" | "emoji" | null;
  onClick: () => void;
}> = ({isEnabled, mode, onClick}) => {
  const {handlers, buttonClasses} = usePressableButton(onClick);

  const getButtonText = () => {
    if (!isEnabled) return "Nein";
    return mode === "svg" ? "Standard" : "Emojis";
  };

  return (
    <button
      {...handlers}
      className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
        ${!isEnabled ?
      "bg-gray-600/50 text-gray-400 hover:bg-gray-700/50" :
      "bg-green-500 text-white hover:bg-green-600"
    } ${buttonClasses}`}
    >
      {getButtonText()}
    </button>
  );
};

const CardStyleButton: React.FC<{
  style: CardStyle;
  isActive: boolean;
  onClick: () => void;
}> = ({style, isActive, onClick}) => {
  const {handlers, buttonClasses} = usePressableButton(onClick);

  return (
    <button
      {...handlers}
      className={`px-3 py-1 rounded ${
        isActive ?
          "bg-green-500 text-white" :
          "bg-gray-700 text-gray-300"
      } ${buttonClasses}`}
    >
      {style}
    </button>
  );
};

// Neue Komponente für die Strich-Buttons
const StrokeButton: React.FC<{
  value: 1 | 2;
  isActive: boolean;
  onClick: () => void;
}> = ({value, isActive, onClick}) => {
  const {handlers, buttonClasses} = usePressableButton(onClick);

  return (
    <button
      {...handlers}
      className={`px-4 py-2 rounded-lg text-xl font-bold transition-all duration-150 ${
        isActive ?
          "bg-green-500 text-white hover:bg-green-600" :
          "bg-gray-700 text-gray-300 hover:bg-gray-600"
      } ${buttonClasses}`}
    >
      {value}
    </button>
  );
};

const SettingsModal = dynamic(() => Promise.resolve((): ReactElement => {
  const { preventClose } = useTutorialComponent('settings');
  
  // === Selektoren einzeln und stabiler gestalten ===
  const isSettingsOpen = useUIStore((state) => state.isSettingsOpen);
  const closeSettings = useUIStore((state) => state.closeSettings);
  const settings = useUIStore((state) => state.settings);
  const farbeSettings = useUIStore((state) => state.farbeSettings);
  const scoreSettings = useUIStore((state) => state.scoreSettings);
  const strokeSettings = useUIStore((state) => state.strokeSettings);
  const updateFarbeSettings = useUIStore((state) => state.updateFarbeSettings);
  const updateScoreSettings = useUIStore((state) => state.updateScoreSettings);
  const cyclePictogramMode = useUIStore((state) => state.cyclePictogramMode);
  const setCardStyle = useUIStore((state) => state.setCardStyle);
  const updateStrokeSettings = useUIStore((state) => state.updateStrokeSettings);
  const tutorialBlockedUI = useUIStore((state) => state.tutorialBlockedUI);
  const openSettings = useUIStore((state) => state.openSettings);
  const showNotification = useUIStore((state) => state.showNotification);
  const setSettingsTab = useUIStore((state) => state.setSettingsTab);
  // === Ende angepasste Selektoren ===
  
  // === GroupStore Hooks entfernt (bleibt entfernt) ===

  // === Initialisierung von State wieder aus uiStore ===
  const [tempMultipliers, setTempMultipliers] = useState<Record<FarbeModeKey, number>>(
    farbeSettings.values
  );
  const [tempScores, setTempScores] = useState<Record<ScoreMode, number>>(
    scoreSettings.values
  );
  const [tempEnabled, setTempEnabled] = useState<Record<ScoreMode, boolean>>(
    scoreSettings.enabled
  );
  const [tempStrokeSettings, setTempStrokeSettings] = useState(strokeSettings);
  const [tempInput, setTempInput] = useState<{[key in ScoreMode]?: string}>({});
  const [hasChanges, setHasChanges] = useState(false);
  // === Ende Initialisierung ===

  const modalRef = useRef<HTMLDivElement>(null);
  const currentStep = useTutorialStore(state => state.getCurrentStep());
  const isInSettingsTutorial = currentStep?.id.startsWith('SETTINGS_');
  const isBlocked = preventClose || isInSettingsTutorial; // isBlocked wieder korrekt definiert

  // Spring Animation (verwende settings.isOpen)
  const springProps = useSpring({
    opacity: settings.isOpen ? 1 : 0,
    transform: `scale(${settings.isOpen ? 1 : 0.95})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  // Click-Outside Handler (verwende settings.isOpen)
  const handleClickOutside = (event: MouseEvent) => {
    if (
      !isBlocked && 
      modalRef.current && 
      !modalRef.current.contains(event.target as Node)
    ) {
      handleClose();
    }
  };

  useEffect(() => {
    if (settings.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [settings.isOpen, isBlocked]); // Abhängigkeit von isBlocked hinzugefügt

  // Sync mit Store (scoreSettings)
  useEffect(() => {
    setTempScores(scoreSettings.values);
    setTempEnabled(scoreSettings.enabled);
  }, [scoreSettings]);
  
  // Sync mit Store (farbeSettings)
  useEffect(() => {
    setTempMultipliers(farbeSettings.values);
  }, [farbeSettings]);

  // Effekt zum Initialisieren/Resetten des temp States, wenn sich settings im Store ändern oder Modal öffnet
  useEffect(() => {
    if (isSettingsOpen) {
      setTempMultipliers(farbeSettings.values);
      setTempScores(scoreSettings.values);
      setTempEnabled(scoreSettings.enabled);
      setTempStrokeSettings(strokeSettings);
      setHasChanges(false); // Beim Öffnen/Reset keine Änderungen
    }
  }, [isSettingsOpen, farbeSettings, scoreSettings, strokeSettings]);

  // Effekt zum Überwachen von Änderungen (optional für UI)
  useEffect(() => {
    if (!isSettingsOpen) return;
    const farbeChanged = JSON.stringify(tempMultipliers) !== JSON.stringify(farbeSettings.values);
    const scoreChanged = JSON.stringify(tempScores) !== JSON.stringify(scoreSettings.values) || JSON.stringify(tempEnabled) !== JSON.stringify(scoreSettings.enabled);
    const strokeChanged = JSON.stringify(tempStrokeSettings) !== JSON.stringify(strokeSettings);
    setHasChanges(farbeChanged || scoreChanged || strokeChanged);
  }, [
      tempMultipliers, 
      tempScores, 
      tempEnabled, 
      tempStrokeSettings, 
      farbeSettings, 
      scoreSettings, 
      strokeSettings, 
      isSettingsOpen
  ]);

  const handleClose = () => {
    // Berechne 'changesNow' direkt vor der Entscheidung
    const farbeChangedNow = JSON.stringify(tempMultipliers) !== JSON.stringify(farbeSettings.values);
    const scoreChangedNow = JSON.stringify(tempScores) !== JSON.stringify(scoreSettings.values) || JSON.stringify(tempEnabled) !== JSON.stringify(scoreSettings.enabled);
    const strokeChangedNow = JSON.stringify(tempStrokeSettings) !== JSON.stringify(strokeSettings);
    const changesNow = farbeChangedNow || scoreChangedNow || strokeChangedNow;

    if (changesNow) { // Verwende den frisch berechneten Wert
      // Speichere die Änderungen aus dem temp State in den uiStore
      updateFarbeSettings({ values: tempMultipliers });
      updateScoreSettings({ values: tempScores, enabled: tempEnabled });
      updateStrokeSettings(tempStrokeSettings);
      showNotification({
          type: 'success',
          message: 'Einstellungen gespeichert.'
      });
    } else {
        // Optional: Benachrichtigung, dass nichts geändert wurde?
        // showNotification({ type: 'info', message: 'Keine Änderungen zum Speichern.' });
    }
    // Schließe das Modal *immer*
    closeSettings();
  };
  
  const handleMultiplierClick = (key: FarbeModeKey) => {
    setTempMultipliers((prev) => {
      const current = prev[key];
      const nextIndex = (MULTIPLIER_OPTIONS.indexOf(current) + 1) % MULTIPLIER_OPTIONS.length;
      return {
          ...prev,
          [key]: MULTIPLIER_OPTIONS[nextIndex] 
      };
    });
  };

  const handleScoreInputChange = (mode: ScoreMode, inputValue: string) => {
    setTempInput(prev => ({ ...prev, [mode]: inputValue }));
    if (!inputValue || isNaN(parseInt(inputValue))) return;
    const numValue = parseInt(inputValue);
    if (mode === 'sieg' && numValue >= 100) {
      handleScoreChange(mode, numValue);
    } else if (mode !== 'sieg' && numValue > 0) {
      handleScoreChange(mode, numValue);
    }
  };

  const handleScoreChange = (mode: ScoreMode, value: number) => {
    setTempScores(prev => {
      const newScores = { ...prev };
      const cleanValue = parseInt(value.toString().replace(/^0+/, '')) || 0;
      if (mode === 'sieg') {
        const validatedValue = Math.max(1000, Math.min(cleanValue, SCORE_RANGES[mode].max));
        newScores.sieg = validatedValue;
        const halfValue = Math.floor(validatedValue / 2);
        newScores.berg = halfValue;
        newScores.schneider = halfValue;
      } else if (mode === 'berg') {
        const newBergValue = Math.min(cleanValue, SCORE_RANGES.berg.max);
        newScores.berg = newBergValue;
        newScores.schneider = newBergValue;
        newScores.sieg = Math.max(1000, newBergValue * 2);
      } else {
        const maxValue = Math.floor(prev.sieg / 2);
        newScores[mode] = Math.min(cleanValue, maxValue);
      }
      return newScores;
    });
  };

  const handleScoreToggle = (mode: ScoreMode) => {
    setTempEnabled(prev => ({
      ...prev,
      [mode]: !prev[mode]
    }));
  };

  // Handler für Tab-Wechsel (verwende settings.activeTab)
  const handleTabChange = () => {
    const tabOrder = ['farben', 'scores', 'strokes'] as const;
    const currentIndex = tabOrder.indexOf(settings.activeTab);
    const nextIndex = (currentIndex + 1) % tabOrder.length;
    setSettingsTab(tabOrder[nextIndex]);

    const currentStep = useTutorialStore.getState().getCurrentStep();
    if (
      (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE && tabOrder[nextIndex] === 'scores') ||
      (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES && tabOrder[nextIndex] === 'strokes')
    ) {
      useTutorialStore.getState().nextStep();
    }
  };

  const handleResetDefaults = () => {
    // Setze den *lokalen temporären* State auf die importierten Defaults
    setTempMultipliers(DEFAULT_FARBE_SETTINGS.values);
    setTempScores(DEFAULT_SCORE_SETTINGS.values);
    setTempEnabled(DEFAULT_SCORE_SETTINGS.enabled);
    setTempStrokeSettings(DEFAULT_STROKE_SETTINGS);
    // setTempInput({}); // Falls tempInput auch zurückgesetzt werden soll

    // Setze hasChanges auf true (da jetzt Abweichung zum Store-Wert besteht)
    // hasChanges wird automatisch durch den useEffect oben aktualisiert, kein manuelles Setzen nötig

    // Verwende den korrekten Namen 'showNotification' und entferne die 'id'
    showNotification({
      type: 'info',
      message: 'Einstellungen auf Standard zurückgesetzt.'
    });
  };

  const renderFarbenSettings = () => (
    <>
      <div className="mb-4">
        <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
          <span className="text-white text-lg">Jasskarten</span>
          <div className="flex gap-2">
            <CardStyleButton 
              style="DE"
              isActive={settings.cardStyle === 'DE'}
              onClick={() => setCardStyle('DE')}
            />
            <CardStyleButton 
              style="FR"
              isActive={settings.cardStyle === 'FR'}
              onClick={() => setCardStyle('FR')}
            />
          </div>
        </div>
      </div>
      <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
        <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
          <span className="text-white text-lg">Piktogramme</span>
          <PictogramModeButton 
            isEnabled={settings.pictogramConfig.isEnabled}
            mode={settings.pictogramConfig.mode}
            onClick={cyclePictogramMode}
          />
        </div>
        <div className="space-y-4">
          {FARBE_MODES
            .map((mode) => {
              const mappedColorKey = toTitleCase(mode.id);
              const displayName = CARD_SYMBOL_MAPPINGS[mappedColorKey as JassColor]?.[settings.cardStyle] ?? mappedColorKey;
              
              return (
                <div key={mode.id} className="flex items-center bg-gray-700/50 p-3 rounded-lg">
                    <span className="text-white text-lg w-20 flex-shrink-0">
                        {displayName}
                    </span>
                    <div className="flex-1 flex justify-center items-center">
                        {settings.pictogramConfig.isEnabled && (
                            <FarbePictogram 
                                farbe={mode.name as JassColor}
                                mode={settings.pictogramConfig.mode ?? "svg"}
                                cardStyle={settings.cardStyle}
                            />
                        )}
                    </div>
                    <MultiplierButton
                        multiplier={tempMultipliers[mode.id]}
                        onMultiplierClick={() => handleMultiplierClick(mode.id)}
                    />
                </div>
              );
          })}
        </div>
      </div>
    </>
  );

  const renderScoreSettings = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
        <span className="text-white text-lg">Sieg-Punkte</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={tempInput.sieg ?? tempScores.sieg}
          onChange={(e) => {
            const value = e.target.value.replace(/[^0-9]/g, '');
            handleScoreInputChange('sieg', value);
          }}
          onBlur={() => {
            const value = parseInt(tempInput.sieg || '0');
            handleScoreChange('sieg', value);
            setTempInput(prev => ({ ...prev, sieg: undefined }));
          }}
          onFocus={(e) => {
            e.target.select();
            setTimeout(() => e.target.select(), 0);
          }}
          className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
            focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          style={{
            WebkitAppearance: 'none',
            MozAppearance: 'textfield'
          }}
        />
      </div>
      <div className="bg-gray-700/50 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-600">
          <span className="text-white text-lg">Berg aktiviert</span>
          <button
            onClick={() => handleScoreToggle('berg')}
            className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
              ${tempEnabled.berg
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-600/50 text-gray-400 hover:bg-gray-700/50'}`}
          >
            {tempEnabled.berg ? 'Ja' : 'Nein'}
          </button>
        </div>
        {tempEnabled.berg && (
          <div className="flex items-center justify-between p-3">
            <span className="text-white text-lg">Berg-Punkte</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={tempInput.berg ?? tempScores.berg}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '');
                handleScoreInputChange('berg', value);
              }}
              onBlur={() => {
                const value = parseInt(tempInput.berg || '0');
                handleScoreChange('berg', value);
                setTempInput(prev => ({ ...prev, berg: undefined }));
              }}
              className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              style={{
                WebkitAppearance: 'none',
                MozAppearance: 'textfield'
              }}
            />
          </div>
        )}
      </div>
      <div className="bg-gray-700/50 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-600">
          <span className="text-white text-lg">Schneider aktiviert</span>
          <button
            onClick={() => handleScoreToggle('schneider')}
            className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
              ${tempEnabled.schneider
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-gray-600/50 text-gray-400 hover:bg-gray-700/50'}`}
          >
            {tempEnabled.schneider ? 'Ja' : 'Nein'}
          </button>
        </div>
        {tempEnabled.schneider && (
          <div className="flex items-center justify-between p-3">
            <span className="text-white text-lg">Schneider-Punkte</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={tempInput.schneider ?? tempScores.schneider}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '');
                handleScoreInputChange('schneider', value);
              }}
              onBlur={() => {
                const value = parseInt(tempInput.schneider || '0');
                handleScoreChange('schneider', value);
                setTempInput(prev => ({ ...prev, schneider: undefined }));
              }}
              className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              style={{
                WebkitAppearance: 'none',
                MozAppearance: 'textfield'
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderStrokeSettings = () => (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-gray-700/50 p-4 rounded-lg min-h-[4rem]">
          <span className="text-lg text-white">Schneider-Striche</span>
          <div className="flex gap-3">
            <StrokeButton 
              value={1}
              isActive={tempStrokeSettings.schneider === 1}
              onClick={() => setTempStrokeSettings(prev => ({ ...prev, schneider: 1 }))}
            />
            <StrokeButton 
              value={2}
              isActive={tempStrokeSettings.schneider === 2}
              onClick={() => setTempStrokeSettings(prev => ({ ...prev, schneider: 2 }))}
            />
          </div>
        </div>
        <div className="flex items-center justify-between bg-gray-700/50 p-4 rounded-lg min-h-[4rem]">
          <span className="text-lg text-white">Kontermatsch-Striche</span>
          <div className="flex gap-3">
            <StrokeButton 
              value={1}
              isActive={tempStrokeSettings.kontermatsch === 1}
              onClick={() => setTempStrokeSettings(prev => ({ ...prev, kontermatsch: 1 }))}
            />
            <StrokeButton 
              value={2}
              isActive={tempStrokeSettings.kontermatsch === 2}
              onClick={() => setTempStrokeSettings(prev => ({ ...prev, kontermatsch: 2 }))}
            />
          </div>
        </div>
      </div>
    </>
  );

  const getTabTitle = () => {
    switch (settings.activeTab) {
      case 'farben':
        return 'Jass Einstellungen';
      case 'scores':
        return 'Punkte Einstellungen';
      case 'strokes':
        return 'Striche Einstellungen';
      default:
        return '';
    }
  };

  return (
    <AnimatePresence>
      {settings.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <animated.div
            ref={modalRef}
            style={springProps}
            className={`bg-gradient-to-b from-gray-800 to-gray-900 rounded-2xl shadow-2xl p-5 max-w-lg w-full max-h-[90vh] flex flex-col border border-gray-700/50 ${isBlocked ? 'cursor-not-allowed' : ''}`}
          >
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 className="text-2xl font-bold text-white">{getTabTitle()}</h2>
              <button 
                onClick={handleClose} 
                disabled={isBlocked && currentStep?.id !== TUTORIAL_STEPS.SETTINGS_STROKES}
                className={`text-gray-400 hover:text-white transition-colors p-2 rounded-full ${isBlocked && currentStep?.id !== TUTORIAL_STEPS.SETTINGS_STROKES ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}
                aria-label="Einstellungen schließen"
              >
                <FiX size={24} />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 -mr-2 custom-scrollbar space-y-5">
                <div className="flex justify-center space-x-2 bg-gray-700/50 p-1 rounded-lg mb-4 flex-shrink-0 sticky top-0 z-10 backdrop-blur-sm">
                    <button onClick={() => setSettingsTab('farben')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${settings.activeTab === 'farben' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>Farben</button>
                    <button onClick={() => setSettingsTab('scores')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${settings.activeTab === 'scores' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>Punkte</button>
                    <button onClick={() => setSettingsTab('strokes')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${settings.activeTab === 'strokes' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>Striche</button>
                </div>

                {settings.activeTab === "farben" && renderFarbenSettings()}
                {settings.activeTab === "scores" && renderScoreSettings()}
                {settings.activeTab === "strokes" && renderStrokeSettings()}
            </div>

            <div className="mt-5 pt-4 border-t border-gray-700/50 flex justify-between items-center flex-shrink-0">
                <button 
                  onClick={handleResetDefaults}
                  disabled={isBlocked}
                  className={`text-gray-400 hover:text-white transition-colors p-2 rounded-full ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}
                  aria-label="Einstellungen zurücksetzen"
                  title="Auf Standard zurücksetzen"
                >
                   <FiRotateCcw size={20} />
               </button>
               <SaveButton onClick={handleClose} /> 
            </div>
          </animated.div>
        </div>
      )}
    </AnimatePresence>
  );
}), {ssr: false});

const NavigationButton: React.FC<{
  direction: "left" | "right";
  onClick: () => void;
}> = memo(({direction, onClick}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const {handlers, buttonClasses} = usePressableButton(onClick);
  const Icon = direction === "left" ? FiChevronLeft : FiChevronRight;
  const currentStep = useTutorialStore((state) => state.getCurrentStep());

  const buttonId = direction === "right" ?
    "settings-navigation-next-button" :
    "settings-navigation-prev-button";

  const isDisabled =
    (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES && direction === "left") ||
    (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE && direction === "left");

  return (
    <button
      {...handlers}
      ref={buttonRef}
      id={buttonId}
      data-testid={buttonId}
      disabled={isDisabled}
      className={`p-3 text-white transition-colors
        bg-gray-700 rounded-lg hover:bg-gray-600 ${buttonClasses}
        ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <Icon size={32} />
    </button>
  );
});

NavigationButton.displayName = "NavigationButton";

const SaveButton: React.FC<{
  onClick: () => void;
}> = memo(({onClick}) => {
  const {handlers, buttonClasses} = usePressableButton(onClick);
  const {preventClose} = useTutorialComponent("settings");
  const currentStep = useTutorialStore((state) => state.getCurrentStep());
  const isInSettingsTutorial = currentStep?.id.startsWith("SETTINGS_");
  const isBlocked = preventClose || isInSettingsTutorial;

  return (
      <button
          {...handlers}
          disabled={isBlocked && currentStep?.id !== TUTORIAL_STEPS.SETTINGS_STROKES}
          className={`px-6 py-2 rounded-lg text-lg font-semibold text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transition-all duration-150 shadow-md ${buttonClasses} ${isBlocked && currentStep?.id !== TUTORIAL_STEPS.SETTINGS_STROKES ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
          Speichern
      </button>
  );
});

export default SettingsModal;
