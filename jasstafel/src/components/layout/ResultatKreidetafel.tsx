import React, { useState, useEffect } from 'react';
import { animated, useSpring } from 'react-spring';
import { FiRotateCcw, FiX } from 'react-icons/fi';
import { useGameStore } from '../../store/gameStore';
import { useJassStore } from '../../store/jassStore';
import ResultatZeile from '../game/ResultatZeile';
import format from 'date-fns/format';
import { de } from 'date-fns/locale';
import { 
  StricheDisplay,
  convertToDisplayStriche
} from '../../types/jass';
import NewGameWarning from '../notifications/NewGameWarning';
import { defaultGameSettings } from '../../config/GameSettings';

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
  const { bergScore } = defaultGameSettings;  // Dynamischer Berg-Score aus den Einstellungen
  
  // Basis-Punkte berechnen
  const bottomTotal = (
    (teams.bottom.striche.matsch || 0) +         // 1 Punkt pro Matsch
    (teams.bottom.striche.kontermatsch || 0) +   // 1 Punkt pro Kontermatsch
    (teams.bottom.striche.berg || 0) +           // 1 Punkt für Berg
    ((teams.bottom.striche.sieg || 0) * 2) +     // 2 Punkte für Sieg/Bedanken
    ((teams.bottom.striche.schneider || 0) * 2)  // 2 Punkte für Schneider
  );
  
  const topTotal = (
    (teams.top.striche.matsch || 0) +            // 1 Punkt pro Matsch
    (teams.top.striche.kontermatsch || 0) +      // 1 Punkt pro Kontermatsch
    (teams.top.striche.berg || 0) +              // 1 Punkt für Berg
    ((teams.top.striche.sieg || 0) * 2) +        // 2 Punkte für Sieg/Bedanken
    ((teams.top.striche.schneider || 0) * 2)     // 2 Punkte für Schneider
  );

  // Schneider-Logik mit dynamischem Berg-Score
  const bottomScore = teams.bottom.total || 0;
  const topScore = teams.top.total || 0;
  
  let finalBottom = bottomTotal;
  let finalTop = topTotal;

  // Wenn ein Team gewonnen hat und das andere Team den Berg nicht erreicht hat
  if (bottomTotal > 0 && topScore < bergScore) {
    finalBottom += 2; // 2 zusätzliche Punkte für Schneider
  }
  
  if (topTotal > 0 && bottomScore < bergScore) {
    finalTop += 2; // 2 zusätzliche Punkte für Schneider
  }

  return {
    top: finalTop,
    bottom: finalBottom
  };
};

const ResultatKreidetafel: React.FC<ResultatKreidetafelProps> = ({ isOpen, onClose }) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showNewGameWarning, setShowNewGameWarning] = useState(false);
  const [displayTotals, setDisplayTotals] = useState({ top: 0, bottom: 0 });
  
  // Zustandsvariablen aus dem Store (nur einmal deklarieren)
  const games = useJassStore((state) => state.games);
  const teams = useJassStore((state) => state.teams);
  const currentGameId = useJassStore((state) => state.currentGameId);

  // Initialisiere erstes Spiel beim Mounten
  useEffect(() => {
    if (games.length === 0) {
      useJassStore.getState().startNewGame();
    }
  }, []);

  // Aktualisiere Totals wenn sich Teams oder Spiele ändern
  useEffect(() => {
    const totals = calculateTotalStriche();
    setDisplayTotals(totals);
  }, [teams, games]);

  const handleNewGame = () => {
    setShowNewGameWarning(true);
  };

  const handleNewGameConfirm = () => {
    const gameStore = useGameStore.getState();
    
    // 1. Aktuelles Spiel finalisieren
    useJassStore.getState().finalizeGame();
    
    // 2. Neues Spiel in beiden Stores starten
    useJassStore.getState().startNewGame();
    gameStore.startNewGame();
    
    // 3. Nur Warning schließen
    setShowNewGameWarning(false);
  };

  const handleNewGameDismiss = () => {
    setShowNewGameWarning(false);
  };

  const springProps = useSpring({
    opacity: isOpen ? 1 : 0,
    transform: `scale(${isOpen ? 1 : 0.95}) rotate(${isFlipped ? '180deg' : '0deg'})`,
    config: { mass: 1, tension: 300, friction: 20 }
  });

  if (!isOpen) return null;

  const currentDate = format(new Date(), 'd.M.yyyy');

  // Berechnung der Zeilen-Daten mit aktuellem Spiel
  const zeilenData = React.useMemo(() => {
    // Abgeschlossene Spiele
    const completedGames = games
      .filter(game => game.id !== currentGameId)
      .map(game => ({
        spielNummer: game.id,
        topTeam: {
          striche: convertToDisplayStriche(game.teams.bottom.striche)  // Getauscht
        },
        bottomTeam: {
          striche: convertToDisplayStriche(game.teams.top.striche)     // Getauscht
        }
      }));

    // Aktuelles Spiel
    const currentGameData = {
      spielNummer: currentGameId,
      topTeam: {
        striche: convertToDisplayStriche(teams.bottom.striche)         // Getauscht
      },
      bottomTeam: {
        striche: convertToDisplayStriche(teams.top.striche)           // Getauscht
      }
    };

    return [...completedGames, currentGameData];
  }, [games, teams, currentGameId]);

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
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
          className={`absolute bottom-full mb-[-10px] left-1/2 transform -translate-x-1/2 
            text-white hover:text-gray-300 transition-all duration-1000
            w-24 h-24 flex items-center justify-center
            rounded-full
            ${isFlipped ? 'rotate-180' : 'rotate-0'}`}
          aria-label="Umdrehen"
        >
          <FiRotateCcw className="w-8 h-8" />
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
          <div className="text-center text-white col-span-2">Team 1 </div>
          <div className="text-center text-white col-span-2">Team 2 </div>
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
            {zeilenData.length > 0 ? (
              zeilenData.map((zeile) => (
                <ResultatZeile
                  key={zeile.spielNummer}
                  spielNummer={zeile.spielNummer}
                  topTeam={zeile.topTeam}
                  bottomTeam={zeile.bottomTeam}
                />
              ))
            ) : (
              <ResultatZeile
                spielNummer={1}
                topTeam={{
                  striche: convertToDisplayStriche(teams.top.striche)
                }}
                bottomTeam={{
                  striche: convertToDisplayStriche(teams.bottom.striche)
                }}
              />
            )}
          </div>
        </div>

        {/* Totals - Reihenfolge korrigiert */}
        <div className="grid grid-cols-5 gap-4 mb-16">
          <div className="text-gray-400 text-center">Total:</div>
          <div className="text-2xl font-bold text-white text-center col-span-2">
            {displayTotals.bottom}  {/* Team 1 (unten) */}
          </div>
          <div className="text-2xl font-bold text-white text-center col-span-2">
            {displayTotals.top}     {/* Team 2 (oben) */}
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
          <button 
            onClick={handleNewGame}
            className="bg-green-600 text-white py-2 px-4 rounded"
          >
            Neues Spiel
          </button>
        </div>

        {/* New Game Warning */}
        <NewGameWarning
          show={showNewGameWarning}
          onConfirm={handleNewGameConfirm}
          onDismiss={handleNewGameDismiss}
        />
      </animated.div>
    </div>
  );
};

export default ResultatKreidetafel;
