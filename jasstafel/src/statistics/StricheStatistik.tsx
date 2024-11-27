import React from 'react';
import { StatisticProps } from '../types/statistikTypes';
import ResultatZeile from '../components/game/ResultatZeile';
import { convertToDisplayStriche } from '../types/jass';

export const StricheStatistik: React.FC<StatisticProps> = ({ 
  teams, 
  games, 
  currentGameId, 
  onSwipe 
}) => {
  // Filtern der aktiven Spiele
  const activeGames = games.filter(game => game.id <= currentGameId);

  return (
    <div className="flex flex-col w-full">
      {activeGames.map((game, index) => (
        <ResultatZeile
          key={`striche-${currentGameId}-${game.id}-${index}`}
          spielNummer={index + 1}
          topTeam={{
            striche: convertToDisplayStriche(
              game.id === currentGameId 
                ? teams.bottom.striche
                : game.teams.bottom.striche
            ),
            jassPoints: 0
          }}
          bottomTeam={{
            striche: convertToDisplayStriche(
              game.id === currentGameId 
                ? teams.top.striche
                : game.teams.top.striche
            ),
            jassPoints: 0
          }}
          showJassPoints={false}
        />
      ))}
    </div>
  );
};
