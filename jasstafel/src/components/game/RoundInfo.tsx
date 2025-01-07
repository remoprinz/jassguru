import React from 'react';
import { animated, useSpring } from 'react-spring';
import { useJassStore } from '../../store/jassStore';
import { useGameStore } from '../../store/gameStore';
import { PlayerNumber } from '../../types/jass';

interface RoundInfoProps {
  currentPlayer: PlayerNumber;
  currentRound: number;
  opacity: number;
  isOpen: boolean;
  isGameStarted: boolean;
  gameStartTime: number | null;
  roundStartTime: number | null;
}

const RoundInfo: React.FC<RoundInfoProps> = ({ 
  currentPlayer, 
  opacity, 
  isOpen, 
  isGameStarted 
}) => {
  const { playerNames } = useGameStore();
  
  const fadeProps = useSpring({
    from: { opacity: 0 },
    to: { opacity: isOpen ? 0 : opacity },
    config: { duration: 150 },
    delay: isOpen ? 0 : 750,
    immediate: isOpen
  });

  if (isOpen) return null;

  const formatTeamNames = (isTopTeam: boolean) => {
    const players: [PlayerNumber, PlayerNumber] = isTopTeam ? [1, 3] : [2, 4];
    const [player1, player2] = players;
    const name1 = playerNames[player1] || `Spieler ${player1}`;
    const name2 = playerNames[player2] || `Spieler ${player2}`;

    return (
      <div className="flex items-center gap-1.5">
        <span className={currentPlayer === player1 
          ? "text-white font-semibold text-xl"
          : "text-gray-500"}>
          {name1}
        </span>
        <span className="text-gray-500">+</span>
        <span className={currentPlayer === player2 
          ? "text-white font-semibold text-xl"
          : "text-gray-500"}>
          {name2}
        </span>
      </div>
    );
  };

  return (
    <animated.div 
      className="absolute inset-x-0 flex flex-col items-center justify-center pointer-events-none"
      style={{ 
        ...fadeProps,
        top: 'calc(50% - 4rem)',
        height: '3.5rem'
      }}
    >
      {/* Oberes Team (Spieler 1 & 3) - normal */}
      <div className="absolute w-full flex justify-center top-[4.5rem]">
        {isGameStarted ? formatTeamNames(true) : 'START'}
      </div>

      {/* Unteres Team (Spieler 2 & 4) - gedreht */}
      <div className="absolute w-full flex justify-center bottom-0">
        <div className="rotate-180">
          {isGameStarted ? formatTeamNames(false) : 'START'}
        </div>
      </div>
    </animated.div>
  );
};

export default RoundInfo;
