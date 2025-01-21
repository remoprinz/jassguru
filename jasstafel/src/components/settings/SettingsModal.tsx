import React, { type ReactElement, useState, useEffect, memo, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSpring, animated } from 'react-spring';
import { FARBE_MODES } from '../../config/FarbeSettings';
import { useUIStore } from '../../store/uiStore';
import { FiRotateCcw, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { 
  type ScoreMode, 
  type JassColor,
} from '../../types/jass';
import { getPictogram } from '../../utils/pictogramUtils';
import dynamic from 'next/dynamic';
import type { CardStyle } from '../../types/jass';
import { CARD_SYMBOL_MAPPINGS } from '../../config/CardStyles';
import { usePressableButton } from '../../hooks/usePressableButton';
import { useTutorialComponent } from '../../hooks/useTutorialComponent';
import { SCORE_MODES } from '../../config/ScoreSettings';
import { useTutorialStore } from '../../store/tutorialStore';
import { TUTORIAL_STEPS } from '../../types/tutorial';

// Neue Konstante für Multiplier-Optionen
const MULTIPLIER_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// Neue Konstanten für Score-Einstellungen
const SCORE_RANGES = {
  sieg: { 
    min: 0, 
    max: SCORE_MODES.find(m => m.id === 'sieg')?.maxValue || 10000, 
    default: SCORE_MODES.find(m => m.id === 'sieg')?.defaultValue || 2000 
  },
  berg: { 
    min: 0, 
    max: SCORE_MODES.find(m => m.id === 'berg')?.maxValue || 5000, 
    default: SCORE_MODES.find(m => m.id === 'berg')?.defaultValue || 2000 
  },
  schneider: { 
    min: 0, 
    max: SCORE_MODES.find(m => m.id === 'schneider')?.maxValue || 5000, 
    default: SCORE_MODES.find(m => m.id === 'schneider')?.defaultValue || 1000 
  }
} as const;

interface MultiplierButtonProps {
  multiplier: number;
  onMultiplierClick: () => void;
}

const MultiplierButton = ({ multiplier, onMultiplierClick }: MultiplierButtonProps): ReactElement => (
  <button
    type="button"
    onClick={onMultiplierClick}
    className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
      ${multiplier === 0 
        ? 'bg-gray-600/50 text-gray-400 hover:bg-gray-700/50' 
        : 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95 active:opacity-80'}`}
  >
    {multiplier === 0 ? '-' : `${multiplier}x`}
  </button>
);

// Neue PictogramModeButton Komponente
const PictogramModeButton: React.FC<{
  isEnabled: boolean;
  mode: 'svg' | 'emoji' | null;
  onClick: () => void;
}> = ({ isEnabled, mode, onClick }) => {
  const { handlers, buttonClasses } = usePressableButton(onClick);

  const getButtonText = () => {
    if (!isEnabled) return 'Nein';
    return mode === 'svg' ? 'Standard' : 'Emojis';
  };

  return (
    <button
      {...handlers}
      className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
        ${!isEnabled 
          ? 'bg-gray-600/50 text-gray-400 hover:bg-gray-700/50'
          : 'bg-green-500 text-white hover:bg-green-600'
        } ${buttonClasses}`}
    >
      {getButtonText()}
    </button>
  );
};

// Neue Komponente für das Piktogramm
const FarbePictogram: React.FC<{ 
  farbe: JassColor, 
  mode: 'svg' | 'emoji' 
}> = ({ farbe, mode }) => {
  const { settings } = useUIStore();
  const pictogramUrl = getPictogram(farbe, mode, settings.cardStyle);
  
  // Den Namen entsprechend des aktuellen Kartenstils verwenden
  const displayName = CARD_SYMBOL_MAPPINGS[farbe][settings.cardStyle];
  
  return (
    <div className="flex items-center justify-center w-8 h-8">
      {mode === 'emoji' ? (
        <span className="text-2xl">{pictogramUrl}</span>
      ) : (
        <img 
          src={pictogramUrl} 
          alt={displayName}
          className="w-6 h-6 object-contain"
        />
      )}
    </div>
  );
};

const CardStyleButton: React.FC<{
  style: CardStyle;
  isActive: boolean;
  onClick: () => void;
}> = ({ style, isActive, onClick }) => {
  const { handlers, buttonClasses } = usePressableButton(onClick);

  return (
    <button
      {...handlers}
      className={`px-3 py-1 rounded ${
        isActive 
          ? 'bg-green-500 text-white' 
          : 'bg-gray-700 text-gray-300'
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
}> = ({ value, isActive, onClick }) => {
  const { handlers, buttonClasses } = usePressableButton(onClick);

  return (
    <button
      {...handlers}
      className={`px-4 py-2 rounded-lg text-xl font-bold transition-all duration-150 ${
        isActive 
          ? 'bg-green-500 text-white hover:bg-green-600' 
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      } ${buttonClasses}`}
    >
      {value}
    </button>
  );
};

const SettingsModal = dynamic(() => Promise.resolve((): ReactElement => {
  const { preventClose } = useTutorialComponent('settings');
  const { 
    settings, 
    farbeSettings,
    scoreSettings,
    updateFarbeSettings,
    updateScoreSettings,
    closeSettings,
    setSettingsTab,
    cyclePictogramMode,
    setCardStyle,
    strokeSettings,
    updateStrokeSettings,
    tutorialBlockedUI,
    openSettings
  } = useUIStore();
  
  // States für beide Settings-Typen - gleiche Struktur
  const [tempMultipliers, setTempMultipliers] = useState<number[]>(
    farbeSettings.values
  );

  const [tempScores, setTempScores] = useState<Record<ScoreMode, number>>(
    scoreSettings.values
  );
  
  const [tempEnabled, setTempEnabled] = useState<Record<ScoreMode, boolean>>(
    scoreSettings.enabled
  );

  const [isFlipped, setIsFlipped] = useState(false);

  const [tempStrokeSettings, setTempStrokeSettings] = useState(strokeSettings);

  // Spring Animation
  const springProps = useSpring({
    opacity: settings.isOpen ? 1 : 0,
    transform: `scale(${settings.isOpen ? 1 : 0.95}) rotate(${isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  // Ref für das Modal
  const modalRef = useRef<HTMLDivElement>(null);

  const currentStep = useTutorialStore(state => state.getCurrentStep());
  
  // Prüfe ob wir in einem der Settings-Tutorial Steps sind
  const isInSettingsTutorial = currentStep?.id.startsWith('SETTINGS_');

  // Kombiniere preventClose mit Tutorial-Status
  const isBlocked = preventClose || isInSettingsTutorial;

  // Click-Outside Handler
  const handleClickOutside = (event: MouseEvent) => {
    if (
      !isBlocked && // Nutze isBlocked statt nur preventClose
      modalRef.current && 
      !modalRef.current.contains(event.target as Node)
    ) {
      handleClose();
    }
  };

  // Event Listener für Click-Outside
  useEffect(() => {
    if (settings.isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [settings.isOpen, preventClose]);

  // Sync mit Store
  useEffect(() => {
    setTempScores(scoreSettings.values);
    setTempEnabled(scoreSettings.enabled);
  }, [scoreSettings]);

  const handleClose = () => {
    // Erlaube Schließen im SETTINGS_STROKES Step
    if (isBlocked && currentStep?.id !== TUTORIAL_STEPS.SETTINGS_STROKES) return;

    updateFarbeSettings({
      values: tempMultipliers,
      isFlipped: isFlipped
    });
    updateScoreSettings({
      values: tempScores,
      enabled: tempEnabled
    });
    updateStrokeSettings(tempStrokeSettings);
    closeSettings();
  };

  const handleMultiplierClick = (index: number) => {
    setTempMultipliers(prev => {
      const current = prev[index];
      const nextIndex = (MULTIPLIER_OPTIONS.indexOf(current) + 1) % MULTIPLIER_OPTIONS.length;
      return prev.map((m, i) => i === index ? MULTIPLIER_OPTIONS[nextIndex] : m);
    });
  };

  const handleScoreChange = (mode: ScoreMode, value: number) => {
    setTempScores(prev => {
      const newScores = { ...prev };
      
      // Entferne führende Nullen und konvertiere zu Nummer
      const cleanValue = parseInt(value.toString().replace(/^0+/, '')) || 0;
      
      if (mode === 'sieg') {
        // Minimum 1000 Punkte für Sieg
        const validatedValue = Math.max(1000, Math.min(cleanValue, SCORE_RANGES[mode].max));
        newScores.sieg = validatedValue;
        
        // Berg und Schneider automatisch auf die Hälfte setzen
        const halfValue = Math.floor(validatedValue / 2);
        newScores.berg = halfValue;
        newScores.schneider = halfValue;
      } else if (mode === 'berg') {
        // Wenn Berg geändert wird, Sieg-Punkte automatisch anpassen
        const newBergValue = Math.min(cleanValue, SCORE_RANGES.berg.max);
        newScores.berg = newBergValue;
        newScores.schneider = newBergValue; // Schneider gleich wie Berg
        
        // Sieg-Punkte auf das Doppelte setzen (mindestens 1000)
        newScores.sieg = Math.max(1000, newBergValue * 2);
      } else {
        // Schneider kann maximal die Hälfte der Sieg-Punkte sein
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

  // Handler für Tab-Wechsel
  const handleTabChange = () => {
    const tabOrder = ['farben', 'scores', 'strokes'] as const;
    const currentIndex = tabOrder.indexOf(settings.activeTab);
    const nextIndex = (currentIndex + 1) % tabOrder.length;
    setSettingsTab(tabOrder[nextIndex]);

    // Wenn wir im Tutorial sind, zum nächsten Step wechseln
    const currentStep = useTutorialStore.getState().getCurrentStep();
    if (
      (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE && tabOrder[nextIndex] === 'scores') ||
      (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES && tabOrder[nextIndex] === 'strokes')
    ) {
      useTutorialStore.getState().nextStep();
    }
  };

  const renderFarbenSettings = () => (
    <>
      {/* Nur Jasskarten fixiert */}
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

      {/* Scrollbarer Bereich mit Piktogrammen als erste Option */}
      <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
        {/* Piktogramme als erste Option im scrollbaren Bereich */}
        <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
          <span className="text-white text-lg">Piktogramme</span>
          <PictogramModeButton 
            isEnabled={settings.pictogramConfig.isEnabled}
            mode={settings.pictogramConfig.mode}
            onClick={cyclePictogramMode}
          />
        </div>

        {/* Farben-Liste */}
        {FARBE_MODES.map((mode, index) => (
          <div key={mode.id} className="flex items-center bg-gray-700/50 p-3 rounded-lg">
            <span className="text-white text-lg w-12">
              {CARD_SYMBOL_MAPPINGS[mode.name as JassColor][settings.cardStyle]}
            </span>
            
            <div className="flex-1 flex justify-center items-center">
              {settings.pictogramConfig.isEnabled && (
                <FarbePictogram 
                  farbe={mode.name as JassColor}
                  mode={settings.pictogramConfig.mode}
                />
              )}
            </div>
            
            <MultiplierButton
              multiplier={tempMultipliers[index]}
              onMultiplierClick={() => handleMultiplierClick(index)}
            />
          </div>
        ))}
      </div>
    </>
  );

  const renderScoreSettings = () => (
    <div className="space-y-6">
      {/* Sieg-Punkte bleiben einzeln */}
      <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
        <span className="text-white text-lg">Sieg-Punkte</span>
        <input
          type="number"
          value={tempScores.sieg}
          onChange={(e) => handleScoreChange('sieg', parseInt(e.target.value) || 0)}
          onFocus={(e) => e.target.select()}
          className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
            focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          min={SCORE_RANGES.sieg.min}
          max={SCORE_RANGES.sieg.max}
          style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
        />
      </div>

      {/* Berg Gruppe */}
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
              type="number"
              value={tempScores.berg}
              onChange={(e) => handleScoreChange('berg', parseInt(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              min={SCORE_RANGES.berg.min}
              max={Math.floor(tempScores.sieg / 2)}
              style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
            />
          </div>
        )}
      </div>

      {/* Schneider Gruppe */}
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
              type="number"
              value={tempScores.schneider}
              onChange={(e) => handleScoreChange('schneider', parseInt(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              min={SCORE_RANGES.schneider.min}
              max={Math.floor(tempScores.sieg / 2)}
              style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
            />
          </div>
        )}
      </div>
    </div>
  );

  const renderStrokeSettings = () => (
    <>
      <div className="space-y-4">
        {/* Schneider-Striche */}
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

        {/* Kontermatsch-Striche */}
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
        return 'Farben Einstellungen';
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
        <div className="fixed inset-0 flex items-center justify-center z-40 bg-black/50 px-4">
          <animated.div 
            ref={modalRef}
            style={springProps}
            className="w-full max-w-lg p-4 max-h-[85vh]"
          >
            <div className="bg-gray-800 rounded-lg p-6 relative">
              {/* Dreh-Button */}
              <button
                onClick={() => setIsFlipped(!isFlipped)}
                disabled={isBlocked}  // Nutze isBlocked
                className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
                  text-white transition-all duration-1000
                  w-24 h-24 flex items-center justify-center
                  rounded-full
                  ${isBlocked ? 'opacity-50 cursor-not-allowed text-gray-500' : 'hover:text-gray-300'}
                  ${isFlipped ? 'rotate-180' : 'rotate-0'}`}
                aria-label="Umdrehen"
              >
                <FiRotateCcw className="w-8 h-8" />
              </button>

              {/* Close-Button */}
              <button
                onClick={handleClose}
                disabled={isBlocked}  // Nutze isBlocked
                className={`absolute right-2 top-2 p-2 text-gray-400 
                  ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'hover:text-white'} 
                  transition-colors`}
              >
                <FiX size={24} />
              </button>

              <h2 className="text-2xl font-bold text-white text-center mb-6">
                {getTabTitle()}
              </h2>

              {settings.activeTab === 'farben' && renderFarbenSettings()}
              {settings.activeTab === 'scores' && renderScoreSettings()}
              {settings.activeTab === 'strokes' && renderStrokeSettings()}

              <div className="mt-8 flex justify-center items-center space-x-6">
                <NavigationButton 
                  direction="left" 
                  onClick={handleTabChange} 
                />

                <SaveButton onClick={handleClose} />

                <NavigationButton 
                  direction="right" 
                  onClick={handleTabChange} 
                />
              </div>
            </div>
          </animated.div>
        </div>
      )}
    </AnimatePresence>
  );
}), { ssr: false });

const NavigationButton: React.FC<{
  direction: 'left' | 'right';
  onClick: () => void;
}> = memo(({ direction, onClick }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { handlers, buttonClasses } = usePressableButton(onClick);
  const Icon = direction === 'left' ? FiChevronLeft : FiChevronRight;
  const currentStep = useTutorialStore(state => state.getCurrentStep());
  
  const buttonId = direction === 'right' 
    ? 'settings-navigation-next-button' 
    : 'settings-navigation-prev-button';
  
  // Wenn wir im Tutorial sind und es der linke Button ist, immer deaktivieren
  const isDisabled = 
    (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES && direction === 'left') ||
    (currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE && direction === 'left');

  return (
    <button
      {...handlers}
      ref={buttonRef}
      id={buttonId}
      data-testid={buttonId}
      disabled={isDisabled}
      className={`p-3 text-white transition-colors
        bg-gray-700 rounded-lg hover:bg-gray-600 ${buttonClasses}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <Icon size={32} />
    </button>
  );
});

const SaveButton: React.FC<{
  onClick: () => void;
}> = ({ onClick }) => {
  const { buttonClasses } = usePressableButton(onClick);
  const currentStep = useTutorialStore(state => state.getCurrentStep());
  const nextStep = useTutorialStore(state => state.nextStep);
  
  const handleSaveClick = () => {
    onClick();
    
    // Wenn wir im SETTINGS_STROKES Step sind, zum nächsten Tutorial-Step
    if (currentStep?.id === TUTORIAL_STEPS.SETTINGS_STROKES) {
      nextStep();
    }
    
    window.dispatchEvent(new CustomEvent('settingsSaved'));
  };
  
  const isDisabled = currentStep?.id === TUTORIAL_STEPS.SETTINGS_NAVIGATE_STROKES;

  return (
    <button
      onClick={handleSaveClick}
      disabled={isDisabled}
      className={`py-3 px-8 bg-yellow-600 text-white rounded-lg font-medium text-lg
        hover:bg-yellow-700 transition-all duration-150 ${buttonClasses}
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      Speichern
    </button>
  );
};

export default SettingsModal;