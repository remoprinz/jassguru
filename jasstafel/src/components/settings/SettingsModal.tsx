import React, { type ReactElement, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSpring, animated } from 'react-spring';
import { FARBE_MODES } from '../../config/FarbeSettings';
import { useUIStore } from '../../store/uiStore';
import { FiRotateCcw, FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import type { ScoreSettings } from '../../types/jass';
import { BERG_SCORE, SIEG_SCORE, SCHNEIDER_SCORE } from '../../config/GameSettings';
import type { JassColor } from '../../types/jass';
import { getPictogram } from '../../utils/pictogramUtils';

// Neue Konstante für Multiplier-Optionen
const MULTIPLIER_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// Neue Konstante für die Pictogram-Modi
const PICTOGRAM_MODES = ['Nein', 'Standard', 'Emojis'] as const;

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

// Neue Komponente für das Piktogramm
const FarbePictogram: React.FC<{ farbe: JassColor, mode: 'svg' | 'emoji' }> = ({ farbe, mode }) => {
  const pictogramUrl = getPictogram(farbe, mode);
  
  return (
    <div className="flex items-center justify-center w-8 h-8">
      {mode === 'emoji' ? (
        <span className="text-2xl">{pictogramUrl}</span>
      ) : (
        <img 
          src={pictogramUrl} 
          alt={farbe} 
          className="w-6 h-6 object-contain"
        />
      )}
    </div>
  );
};

const SettingsModal = (): ReactElement => {
  const { 
    settings, 
    farbeSettings, 
    scoreSettings,
    updateFarbeSettings, 
    updateScoreSettings,
    closeSettings,
    setSettingsTab,
    cyclePictogramMode
  } = useUIStore();
  
  // Farben-Settings State
  const [tempMultipliers, setTempMultipliers] = useState<number[]>(
    farbeSettings.multipliers
  );

  // Score-Settings State mit Werten aus dem Store
  const [tempScoreSettings, setTempScoreSettings] = useState<ScoreSettings>({
    siegScore: scoreSettings?.siegScore ?? SIEG_SCORE,
    bergScore: scoreSettings?.bergScore ?? BERG_SCORE,
    schneiderScore: scoreSettings?.schneiderScore ?? SCHNEIDER_SCORE,
    isBergEnabled: scoreSettings?.isBergEnabled ?? true,
    isSchneiderEnabled: scoreSettings?.isSchneiderEnabled ?? true
  });

  // Synchronisiere tempScoreSettings mit settings
  useEffect(() => {
    if (scoreSettings) {
      setTempScoreSettings(scoreSettings);
    }
  }, [scoreSettings]);

  const handleClose = () => {
    // Beide Settings speichern
    updateFarbeSettings({
      multipliers: tempMultipliers
    });
    updateScoreSettings(tempScoreSettings);
    closeSettings();
  };

  const handleMultiplierClick = (index: number) => {
    setTempMultipliers(prev => {
      const current = prev[index];
      const nextIndex = (MULTIPLIER_OPTIONS.indexOf(current) + 1) % MULTIPLIER_OPTIONS.length;
      return prev.map((m, i) => i === index ? MULTIPLIER_OPTIONS[nextIndex] : m);
    });
  };

  const handleScoreChange = (key: keyof ScoreSettings, value: number | boolean) => {
    setTempScoreSettings(prev => {
      // Wenn es ein boolean-Wert ist (für die Toggles), direkt übernehmen
      if (typeof value === 'boolean') {
        const newSettings = { ...prev, [key]: value };
        updateScoreSettings(newSettings);
        return newSettings;
      }

      // Für numerische Werte
      let validatedValue = value;

      // Validierung für Berg- und Schneider-Punkte
      if (key === 'bergScore' || key === 'schneiderScore') {
        // Maximaler Wert ist die Hälfte der Siegpunkte
        const maxValue = Math.floor(prev.siegScore / 2);
        validatedValue = Math.min(value, maxValue);
      }

      // Wenn Siegpunkte geändert werden, Berg- und Schneider-Punkte automatisch auf die Hälfte setzen
      if (key === 'siegScore') {
        const halfValue = Math.floor(value / 2);
        return {
          ...prev,
          siegScore: value,
          bergScore: halfValue,      // Automatisch auf die Hälfte setzen
          schneiderScore: halfValue  // Automatisch auf die Hälfte setzen
        };
      }

      const newSettings = { ...prev, [key]: validatedValue };
      updateScoreSettings(newSettings);
      return newSettings;
    });
  };

  // Separater State für die Ausrichtung
  const [isFlipped, setIsFlipped] = useState(false);

  // Animation mit Rotation
  const springProps = useSpring({
    opacity: settings.isOpen ? 1 : 0,
    transform: `scale(${settings.isOpen ? 1 : 0.95}) rotate(${isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  // Handler für Tab-Wechsel
  const handleTabChange = () => {
    setSettingsTab(settings.activeTab === 'farben' ? 'scores' : 'farben');
  };

  const renderFarbenSettings = () => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
        <span className="text-white text-lg">Piktogramme</span>
        <button
          onClick={cyclePictogramMode}
          className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
            ${!settings.pictogramConfig.isEnabled 
              ? 'bg-gray-600/50 text-gray-400 hover:bg-gray-700/50'
              : 'bg-green-500 text-white hover:bg-green-600'}`}
        >
          {!settings.pictogramConfig.isEnabled 
            ? 'Nein' 
            : settings.pictogramConfig.mode === 'svg' 
              ? 'Standard' 
              : 'Emojis'}
        </button>
      </div>

      {FARBE_MODES.map((mode, index) => (
        <div key={mode.id} className="flex items-center bg-gray-700/50 p-3 rounded-lg">
          <span className="text-white text-lg w-12">{mode.name}</span>
          
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
  );

  const renderScoreSettings = () => {
    // Hilfsfunktion zum Formatieren der Zahlen
    const formatNumber = (value: number) => value === 0 ? '' : value.toString();

    return (
      <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
            <span className="text-white text-lg">Sieg-Punkte</span>
            <input
              type="number"
              value={formatNumber(tempScoreSettings.siegScore)}
              placeholder={SIEG_SCORE.toString()}
              onChange={(e) => handleScoreChange('siegScore', Math.max(0, parseInt(e.target.value) || 0))}
              onFocus={(e) => e.target.select()}
              className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              min="0"
              style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
            />
          </div>

          <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
            <span className="text-white text-lg">Berg aktiviert</span>
            <button
              onClick={() => handleScoreChange('isBergEnabled', !tempScoreSettings.isBergEnabled)}
              className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
                ${tempScoreSettings.isBergEnabled 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-gray-600/50 text-gray-400 hover:bg-gray-700/50'}`}
            >
              {tempScoreSettings.isBergEnabled ? 'Ja' : 'Nein'}
            </button>
          </div>

          {tempScoreSettings.isBergEnabled && (
            <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
              <span className="text-white text-lg">Berg-Punkte</span>
              <input
                type="number"
                value={formatNumber(tempScoreSettings.bergScore)}
                placeholder={BERG_SCORE.toString()}
                onChange={(e) => handleScoreChange('bergScore', Math.max(0, parseInt(e.target.value) || 0))}
                onFocus={(e) => e.target.select()}
                className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
                  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="0"
                max={Math.floor(tempScoreSettings.siegScore / 2)}
                style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
              />
            </div>
          )}

          <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
            <span className="text-white text-lg">Schneider aktiviert</span>
            <button
              onClick={() => handleScoreChange('isSchneiderEnabled', !tempScoreSettings.isSchneiderEnabled)}
              className={`px-4 py-2 rounded-lg text-lg font-bold transition-all duration-150
                ${tempScoreSettings.isSchneiderEnabled 
                  ? 'bg-green-500 text-white hover:bg-green-600' 
                  : 'bg-gray-600/50 text-gray-400 hover:bg-gray-700/50'}`}
            >
              {tempScoreSettings.isSchneiderEnabled ? 'Ja' : 'Nein'}
            </button>
          </div>

          {tempScoreSettings.isSchneiderEnabled && (
            <div className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg">
              <span className="text-white text-lg">Schneider-Punkte</span>
              <input
                type="number"
                value={formatNumber(tempScoreSettings.schneiderScore)}
                placeholder={SCHNEIDER_SCORE.toString()}
                onChange={(e) => handleScoreChange('schneiderScore', Math.max(0, parseInt(e.target.value) || 0))}
                onFocus={(e) => e.target.select()}
                className="w-24 px-3 py-2 bg-gray-600 text-white rounded-lg text-right
                  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                min="0"
                style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const getTabTitle = () => {
    return settings.activeTab === 'farben' 
      ? 'Farben Einstellungen'
      : 'Punkte Einstellungen';
  };

  return (
    <AnimatePresence>
      {settings.isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSettings();
          }}
        >
          <animated.div 
            style={springProps} 
            className="w-full max-w-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gray-800 rounded-lg p-6 relative">
              {/* Dreh-Button nur für Rotation */}
              <button
                onClick={() => setIsFlipped(!isFlipped)}
                className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
                  text-white hover:text-gray-300 transition-all duration-1000
                  w-24 h-24 flex items-center justify-center
                  rounded-full
                  ${isFlipped ? 'rotate-180' : 'rotate-0'}`}
                aria-label="Umdrehen"
              >
                <FiRotateCcw className="w-8 h-8" />
              </button>

              <button
                onClick={closeSettings}
                className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white transition-colors"
              >
                <FiX size={24} />
              </button>

              <h2 className="text-2xl font-bold text-white text-center mb-6">
                {getTabTitle()}
              </h2>

              {settings.activeTab === 'farben' ? renderFarbenSettings() : renderScoreSettings()}

              <div className="mt-8 flex justify-center items-center space-x-6">
                <button
                  onClick={handleTabChange}
                  className={`p-3 text-gray-400 hover:text-white transition-colors
                    bg-gray-700/30 rounded-lg hover:bg-gray-700/50`}
                >
                  <FiChevronLeft size={32} />
                </button>

                <button
                  onClick={handleClose}
                  className="py-3 px-8 bg-yellow-600 text-white rounded-lg font-medium text-lg
                    hover:bg-yellow-700 transition-all duration-150 active:scale-95"
                >
                  Speichern
                </button>

                <button
                  onClick={handleTabChange}
                  className={`p-3 text-gray-400 hover:text-white transition-colors
                    bg-gray-700/30 rounded-lg hover:bg-gray-700/50`}
                >
                  <FiChevronRight size={32} />
                </button>
              </div>
            </div>
          </animated.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;