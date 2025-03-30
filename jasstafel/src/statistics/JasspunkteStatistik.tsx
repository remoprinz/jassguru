import React from 'react';
import { StatisticProps } from '../types/statistikTypes';
import ResultatZeile from '../components/game/ResultatZeile';
import { useGameStore } from '../store/gameStore';
import { animated, useSpring } from 'react-spring';

export const JasspunkteStatistik: React.FC<StatisticProps> = ({ 
  teams, 
  games, 
  currentGameId 
}) => {
  const scores = useGameStore(state => state.scores);
  const weisPoints = useGameStore(state => state.weisPoints);
  const jassPoints = useGameStore(state => state.jassPoints);

  // Animation für neue Punkte
  const fadeProps = useSpring({
    from: { opacity: 0.3, transform: 'scale(0.97)' },
    to: { opacity: 1, transform: 'scale(1)' },
    reset: true,
    key: `${jassPoints.top + jassPoints.bottom + weisPoints.top + weisPoints.bottom}`,
    config: { tension: 280, friction: 20 }
  });

  return (
    <animated.div 
      style={fadeProps} 
      className="flex flex-col w-full"
    >
      {games.map((game, index) => (
        <ResultatZeile
          key={game.id}
          gameId={game.id}
          spielNummer={index + 1}
          topTeam={{
            striche: game.id === currentGameId 
              ? teams.top.striche
              : game.teams.top.striche,
            jassPoints: game.id === currentGameId 
              ? (jassPoints.top + weisPoints.top)
              : (game.teams.top.jassPoints + (game.teams.top.weisPoints || 0))
          }}
          bottomTeam={{
            striche: game.id === currentGameId 
              ? teams.bottom.striche
              : game.teams.bottom.striche,
            jassPoints: game.id === currentGameId 
              ? (jassPoints.bottom + weisPoints.bottom)
              : (game.teams.bottom.jassPoints + (game.teams.bottom.weisPoints || 0))
          }}
          showJassPoints={true}
        />
      ))}
    </animated.div>
  );
};
