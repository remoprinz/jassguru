import React, { useState, MouseEvent, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useUIStore } from '../../store/uiStore';
import { useJassStore } from '../../store/jassStore';
import { useTimerStore } from '../../store/timerStore';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerNames, TeamConfig, DEFAULT_TEAM_CONFIG, setTeamConfig, PlayerNumber } from '../../types/jass';

const screenVariants = {
  initial: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 }
};

const StartScreen: React.FC = () => {
  const { startGame } = useGameStore();
  const { setStartScreenState } = useUIStore();
  const jassStore = useJassStore();
  const timerStore = useTimerStore();
  
  // State für Namen und Team-Konfiguration
  const [names, setNames] = useState<PlayerNames>({
    1: '', 2: '', 3: '', 4: ''
  });
  const [teamConfig, setTeamConfigState] = useState<TeamConfig>(DEFAULT_TEAM_CONFIG);

  // Neuer State für den Startspieler
  const [startingPlayer, setStartingPlayer] = useState<PlayerNumber>(1);
  
  // Separate Funktion für die Rotation
  const getNextPlayer = (current: PlayerNumber): PlayerNumber => {
    return ((current % 4) + 1) as PlayerNumber;
  };

  // Separate Funktion für die Rotation ohne Event-Parameter
  const rotateStartingPlayer = () => {
    setStartingPlayer(current => getNextPlayer(current));
  };

  // Event Handler für den Button-Click
  const handleRotateClick = (e: MouseEvent<HTMLButtonElement>) => {
    setStartingPlayer(current => getNextPlayer(current));
  };

  const handleStart = async () => {
    // Erst den StartScreen-State zurücksetzen
    useUIStore.getState().resetStartScreen();

    // Sicherstellen, dass keine leeren Namen existieren
    const validatedNames: PlayerNames = {
      1: names[1]?.trim() || `Spieler 1`,
      2: names[2]?.trim() || `Spieler 2`,
      3: names[3]?.trim() || `Spieler 3`,
      4: names[4]?.trim() || `Spieler 4`
    };

    console.log('🎮 StartScreen.handleStart:', {
      startingPlayer,
      teamConfig,
      validatedNames,
    });

    // Team-Konfiguration speichern
    setTeamConfig(teamConfig);
    
    // Namen entsprechend der Team-Konfiguration zuordnen
    const orderedNames: PlayerNames = {
      1: validatedNames[teamConfig.bottom.includes(1) ? 1 : 2],
      2: validatedNames[teamConfig.top.includes(2) ? 2 : 1],
      3: validatedNames[teamConfig.bottom.includes(3) ? 3 : 4],
      4: validatedNames[teamConfig.top.includes(4) ? 4 : 3]
    };

    console.log('📝 Ordered Names:', orderedNames);
    
    // Wichtig: initialStartingPlayer bleibt unverändert!
    // Dies ist der Spieler, der das allererste Spiel eröffnet
    jassStore.startJass({
      playerNames: orderedNames,
      initialStartingPlayer: startingPlayer  // Kommt aus lokalem State
    });

    // GameStore mit gleichem Startspieler initialisieren
    useGameStore.setState({ 
      playerNames: orderedNames,
      currentPlayer: startingPlayer,
      startingPlayer: startingPlayer
    });

    console.log('🎲 GameStore Updated:', useGameStore.getState());
    
    // 4. Spielstatus richtig setzen
    useGameStore.setState(state => ({
      ...state,
      isGameStarted: true,
      currentRound: 1,
      isGameCompleted: false,
      isRoundCompleted: false
    }));

    // 5. ✨ Timer explizit starten
    const timerStore = useTimerStore.getState();
    timerStore.resetGameTimers();
    timerStore.startGameTimer();
    timerStore.startRoundTimer();
    
    // 6. UI Update
    setStartScreenState('starting');
    await new Promise(resolve => setTimeout(resolve, 300));
    setStartScreenState('complete');
  };

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 flex flex-col items-center justify-center bg-gray-900 bg-opacity-90 z-50 p-4">
        <div className="bg-gray-800 bg-opacity-95 rounded-xl p-6 w-full max-w-xs space-y-6 shadow-lg text-center">
          {/* Haupttitel */}
          <h2 className="text-2xl font-bold text-white text-center mb-4">
            Spielernamen eingeben
          </h2>
          
          {/* Untertitel */}
          <h3 className="text-lg font-semibold text-white mb-4">
            Sitzreihenfolge:
          </h3>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Spieler 1 (Team 1) - Dein Gerät"
              value={names[1]}
              onChange={(e) => setNames(prev => ({ ...prev, 1: e.target.value }))}
              className={`w-full p-2 ${teamConfig.bottom.includes(1) ? 'bg-gray-500' : 'bg-gray-800'} 
                border ${startingPlayer === 1 ? 'border-yellow-500 ring-2 ring-yellow-500' : 'border-gray-600'} 
                rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 
                focus:ring-green-500 focus:border-transparent`}
            />
            <input
              type="text"
              placeholder="Spieler 2 (Team 2)"
              value={names[2]}
              onChange={(e) => setNames(prev => ({ ...prev, 2: e.target.value }))}
              className={`w-full p-2 ${teamConfig.top.includes(2) ? 'bg-gray-700' : 'bg-gray-800'} 
                border ${startingPlayer === 2 ? 'border-yellow-500 ring-2 ring-yellow-500' : 'border-gray-600'} 
                rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 
                focus:ring-green-500 focus:border-transparent`}
            />
            <input
              type="text"
              placeholder="Spieler 3 (Team 1)"
              value={names[3]}
              onChange={(e) => setNames(prev => ({ ...prev, 3: e.target.value }))}
              className={`w-full p-2 ${teamConfig.bottom.includes(3) ? 'bg-gray-500' : 'bg-gray-800'} 
                border ${startingPlayer === 3 ? 'border-yellow-500 ring-2 ring-yellow-500' : 'border-gray-600'} 
                rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 
                focus:ring-green-500 focus:border-transparent`}
            />
            <input
              type="text"
              placeholder="Spieler 4 (Team 2)"
              value={names[4]}
              onChange={(e) => setNames(prev => ({ ...prev, 4: e.target.value }))}
              className={`w-full p-2 ${teamConfig.top.includes(4) ? 'bg-gray-700' : 'bg-gray-800'} 
                border ${startingPlayer === 4 ? 'border-yellow-500 ring-2 ring-yellow-500' : 'border-gray-600'} 
                rounded-xl text-white placeholder-gray-300 focus:outline-none focus:ring-2 
                focus:ring-green-500 focus:border-transparent`}
            />
          </div>

          {/* Rosen 10 Button */}
          <motion.button
            onClick={handleRotateClick}
            className="w-full p-2 bg-yellow-600 text-white rounded-xl 
              transition-colors border-b-4 border-yellow-900"
            whileTap={{ scale: 0.95 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0 }}
          >
            Rosen 10 (Startspieler)
          </motion.button>
        </div>

        <motion.button
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleStart}
          className="bg-green-600 text-white text-2xl font-bold py-6 px-12 rounded-xl shadow-lg hover:bg-green-700 transition-colors mt-6 border-b-4 border-green-900"
        >
          START
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
};

export default StartScreen;