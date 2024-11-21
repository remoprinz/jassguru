import React, { useState } from 'react';
import { animated, useSpring } from 'react-spring';
import { FiRotateCcw, FiX } from 'react-icons/fi';
import { useGameStore } from '../../store/gameStore';
import { useJassStore } from '../../store/jassStore';
import StrichDisplay from '../game/StrichDisplay';
import ResultatZeile from '../game/ResultatZeile';
import format from 'date-fns/format';
import { de } from 'date-fns/locale';
import { 
  StricheDisplay,
  convertToDisplayStriche
} from '../../types/jass';

interface ResultatKreidetafelProps {
  isOpen: boolean;
  onClose: () => void;
}

// Nur lokale Typdefinition für ResultatZeileData
interface ResultatZeileData {
  spielNummer: number;
  topTeam: {
    striche: StricheDisplay;
  };
  bottomTeam: {
    striche: StricheDisplay;
  };
}

const calculateTotalStriche = () => {
  const { teams } = useJassStore.getState();
  
  const bottomTotal = (
    (teams.bottom.striche.matsch || 0) +    // 1 Punkt pro Matsch
    (teams.bottom.striche.berg || 0) +      // 1 Punkt für Berg
    ((teams.bottom.striche.sieg || 0) * 2)  // 2 Punkte für Sieg/Bedanken
  );
  
  const topTotal = (
    (teams.top.striche.matsch || 0) +       // 1 Punkt pro Matsch
    (teams.top.striche.berg || 0) +         // 1 Punkt für Berg
    ((teams.top.striche.sieg || 0) * 2)     // 2 Punkte für Sieg/Bedanken
  );

  return {
    top: topTotal,
    bottom: bottomTotal
  };
};

const ResultatKreidetafel: React.FC<ResultatKreidetafelProps> = ({ isOpen, onClose }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
    config: { mass: 1, tension: 300, friction: 20 }
  });

  if (!isOpen) return null;

  const currentDate = format(new Date(), 'd.M.yyyy');

  // Zustand aus dem jassStore mit useStore hook abholen
  const teams = useJassStore((state) => state.teams);
  
  const zeileData = {
    spielNummer: 1,
    topTeam: {
      striche: convertToDisplayStriche(teams.top.striche)
    },
    bottomTeam: {
      striche: convertToDisplayStriche(teams.bottom.striche)
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <animated.div 
        style={springProps}
        className="relative w-11/12 max-w-2xl bg-gray-800 rounded-xl p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="text-2xl font-bold text-white">Jassergebnis</h2>
          <p className="text-gray-400">{currentDate}</p>
        </div>

        {/* Dreh-Button */}
        <button
          onClick={() => setIsFlipped(!isFlipped)}
          className="absolute -top-16 left-1/2 transform -translate-x-1/2"
        >
          <FiRotateCcw className="w-8 h-8 text-white" />
        </button>

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute right-2 top-2 p-2 text-gray-400 hover:text-white"
        >
          <FiX size={24} />
        </button>

        {/* Teams Header - korrigierte Reihenfolge */}
        <div className="grid grid-cols-5 gap-4 mb-2">
          <div></div>
          <div className="text-center text-white col-span-2">Team 1 (unten)</div>
          <div className="text-center text-white col-span-2">Team 2 (oben)</div>
        </div>

        {/* Spielernamen - korrigierte Reihenfolge */}
        <div className="grid grid-cols-5 gap-4 mb-4">
          <div></div>
          <div className="text-center text-gray-400">Frank</div>
          <div className="text-center text-gray-400">Remo</div>
          <div className="text-center text-gray-400">Michi</div>
          <div className="text-center text-gray-400">Tobi</div>
        </div>

        {/* Striche - erste Spalte schmaler, Rest bleibt gleich */}
        <div className="max-h-96 overflow-y-auto mb-4 border-t border-b border-gray-700">
          <div className="text-white">
            <ResultatZeile
              spielNummer={zeileData.spielNummer}
              topTeam={zeileData.bottomTeam}
              bottomTeam={zeileData.topTeam}
            />
          </div>
        </div>

        {/* Totals - Reihenfolge korrigiert */}
        <div className="grid grid-cols-5 gap-4 mb-16">
          <div className="text-gray-400 text-center">Total:</div>
          <div className="text-2xl font-bold text-white text-center col-span-2">
            {calculateTotalStriche().bottom}  {/* Team 1 (unten) */}
          </div>
          <div className="text-2xl font-bold text-white text-center col-span-2">
            {calculateTotalStriche().top}     {/* Team 2 (oben) */}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-4">
          <button className="bg-red-600 text-white py-2 px-4 rounded">
            Zurück
          </button>
          <button className="bg-blue-600 text-white py-2 px-4 rounded">
            Statistik
          </button>
          <button className="bg-green-600 text-white py-2 px-4 rounded">
            Weiter
          </button>
        </div>
      </animated.div>
    </div>
  );
};

export default ResultatKreidetafel;
