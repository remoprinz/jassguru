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
  console.log('calculateTotalStriche wurde aufgerufen:', teams);
  return {
    top: teams.top.total,
    bottom: teams.bottom.total
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

        {/* Teams Grid */}
        <div className="grid grid-cols-3 gap-4 mb-2">
          <div></div>
          <div className="text-center text-white">Team 1</div>
          <div className="text-center text-white">Team 2</div>
        </div>

        {/* Spieler Grid */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          <div></div>
          <div></div>
          <div className="text-center text-gray-400">Spieler 1</div>
          <div className="text-center text-gray-400">Spieler 2</div>
          <div className="text-center text-gray-400">Spieler 3</div>
          <div className="text-center text-gray-400">Spieler 4</div>
        </div>

        {/* Scrollbarer Resultatebereich */}
        <div className="max-h-96 overflow-y-auto mb-4 border-t border-b border-gray-700">
          <ResultatZeile
            spielNummer={zeileData.spielNummer}
            topTeam={zeileData.topTeam}
            bottomTeam={zeileData.bottomTeam}
          />
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-gray-400 text-center">Total:</div>
          <div className="text-2xl font-bold text-white text-center">{calculateTotalStriche().top}</div>
          <div className="text-2xl font-bold text-white text-center">{calculateTotalStriche().bottom}</div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <button className="bg-red-600 text-white py-2 px-4 rounded">
            Zurück
          </button>
          <button className="bg-orange-600 text-white py-2 px-4 rounded">
            Statistik
          </button>
          <button className="bg-green-600 text-white py-2 px-4 rounded">
            Weiterjassen
          </button>
        </div>

        {/* Team Labels & Signieren */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center text-gray-400">Team 1</div>
          <div></div>
          <div className="text-center text-gray-400">Team 2</div>
          <button className="bg-yellow-600 text-white py-2 px-4 rounded">
            Signieren
          </button>
          <button className="bg-blue-600 text-white py-2 px-4 rounded">
            Korrigieren
          </button>
          <button className="bg-yellow-600 text-white py-2 px-4 rounded">
            Signieren
          </button>
        </div>
      </animated.div>
    </div>
  );
};

export default ResultatKreidetafel;
