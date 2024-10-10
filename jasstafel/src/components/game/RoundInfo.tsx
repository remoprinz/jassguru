import React from 'react';
import { animated, useSpring } from 'react-spring';

interface RoundInfoProps {
  currentPlayer: number;
  currentRound: number;
  opacity: number;
  isOpen: boolean;
}

const RoundInfo: React.FC<RoundInfoProps> = ({ currentPlayer, currentRound, opacity, isOpen }) => {
  const fadeProps = useSpring({
    opacity: isOpen ? 0 : opacity,
    config: {
      duration: isOpen ? 150 : 500,
      delay: isOpen ? 0 : 300
    }
  });

  return (
    <animated.div 
      className="absolute inset-x-0 flex flex-col items-center justify-center pointer-events-none"
      style={{ 
        ...fadeProps,
        top: 'calc(50% - 4rem)',
        height: '3.5rem'
      }}
    >
      <div className="text-gray-500 text-xs transform scale-y-[-1] scale-x-[-1] absolute right-[8%] top-[4.5rem]">
        Runde: {currentRound}
      </div>
      <div className="text-gray-500 text-xs absolute left-[8%] bottom-0">
        Spieler: {currentPlayer}
      </div>
    </animated.div>
  );
};

export default RoundInfo;