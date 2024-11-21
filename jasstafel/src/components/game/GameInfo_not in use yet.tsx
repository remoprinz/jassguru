import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { formatDuration } from '../../utils/timeUtils';

const GameInfo: React.FC = () => {
  const { 
    topScore, 
    bottomScore,
    gameStartTime,
    currentRound,
    isGameStarted,
    isGameCompleted,
    roundStartTime,
    currentPlayer,
    teamTimings
  } = useGameStore();

  // Aktuelle Team-Zeit berechnen
  const getTeamTime = (team: 'top' | 'bottom') => {
    const baseTime = teamTimings[team].totalTime;
    if (teamTimings[team].lastStartTime) {
      return baseTime + (Date.now() - teamTimings[team].lastStartTime);
    }
    return baseTime;
  };

  return (
    <div className="fixed top-4 right-4 bg-gray-800 bg-opacity-80 p-4 rounded-xl text-white">
      <h3 className="text-lg font-bold mb-2">Jass Status</h3>
      <div className="space-y-2">
        <p>Oben: {topScore}</p>
        <p>Unten: {bottomScore}</p>
        <p>Runde: {currentRound}</p>
        {gameStartTime && (
          <p>Gesamtdauer: {formatDuration(Date.now() - gameStartTime)}</p>
        )}
        {roundStartTime && (
          <p>Aktuelle Runde: {formatDuration(Date.now() - roundStartTime)}</p>
        )}
        <p>Aktueller Spieler: {currentPlayer}</p>
        <p>Status: {
          !isGameStarted ? 'Nicht gestartet' :
          isGameCompleted ? 'Beendet' : 'Läuft'
        }</p>
        <p>Team Oben Zeit: {formatDuration(getTeamTime('top'))}</p>
        <p>Team Unten Zeit: {formatDuration(getTeamTime('bottom'))}</p>
      </div>
    </div>
  );
};