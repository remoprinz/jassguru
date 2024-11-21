import React from 'react';
import { animated, useSpring } from 'react-spring';

interface RoundInfoProps {
  currentPlayer: number;
  currentRound: number;
  opacity: number;
  isOpen: boolean;
  isGameStarted: boolean;
  gameStartTime: number | null;
  roundStartTime: number | null;
}

const RoundInfo: React.FC<RoundInfoProps> = ({ 
  currentPlayer, 
  currentRound, 
  opacity, 
  isOpen, 
  isGameStarted 
}) => {
  const fadeProps = useSpring({
    opacity: isOpen ? 0 : opacity,
    config: {
      duration: isOpen ? 150 : 500,
      delay: isOpen ? 0 : 300
    }
  });

  const formatInfoText = (round: number, player: number) => {
    return (
      <>
        <span className="text-gray-500 text-xs">Spiel: </span>
        <span className="text-gray-300 text-sm font-semibold">{round}</span>
        <span className="text-gray-500 text-xs ml-2"> Runde: </span>
        <span className="text-gray-300 text-sm font-semibold">{round}</span>
        <span className="text-gray-500 text-xs ml-2"> Spieler: </span>
        <span className="text-gray-300 text-sm font-semibold">{player}</span>
      </>
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
      {/* Oberer Text - gespiegelt */}
      <div className="transform scale-y-[-1] scale-x-[-1] absolute right-[8%] top-[4.5rem]">
        {isGameStarted ? formatInfoText(currentRound, currentPlayer) : 'START'}
      </div>

      {/* Unterer Text - normal */}
      <div className="absolute left-[8%] bottom-0">
        {isGameStarted ? formatInfoText(currentRound, currentPlayer) : 'START'}
      </div>
    </animated.div>
  );
};

export default RoundInfo;
