import React from 'react';
import { StatisticProps } from '../types/statistikTypes';
import ResultatZeile from '../components/game/ResultatZeile';
import { convertToDisplayStriche } from '../types/jass';
import { useGameStore } from '../store/gameStore';

export const JasspunkteStatistik: React.FC<StatisticProps> = ({ 
  teams, 
  games, 
  currentGameId 
}) => {
  // Hole die aktuellen Punkte aus dem gameStore
  const { topScore, bottomScore } = useGameStore();

  return (
    <div className="flex flex-col w-full">
      {games.map((game, index) => (
        <ResultatZeile
          key={game.id}
          spielNummer={index + 1}
          topTeam={{
            striche: convertToDisplayStriche(
              game.id === currentGameId 
                ? teams.bottom.striche
                : game.teams.bottom.striche
            ),
            jassPoints: game.id === currentGameId 
              ? bottomScore  // Verwende bottomScore aus gameStore
              : game.teams.bottom.jassPoints
          }}
          bottomTeam={{
            striche: convertToDisplayStriche(
              game.id === currentGameId 
                ? teams.top.striche
                : game.teams.top.striche
            ),
            jassPoints: game.id === currentGameId 
              ? topScore    // Verwende topScore aus gameStore
              : game.teams.top.jassPoints
          }}
          showJassPoints={true}
        />
      ))}
    </div>
  );
};
