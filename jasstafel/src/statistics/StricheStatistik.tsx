import React from "react";
import {StatisticProps} from "../types/statistikTypes";
import ResultatZeile from "../components/game/ResultatZeile";
import {useGameStore} from "../store/gameStore";
import { getPictogram } from '@/utils/pictogramUtils';
import type { CardStyle, JassColor } from '@/types/jass';

interface StricheStatistikProps {
  teams: any;
  games: any[];
  currentGameId: number;
  cardStyle: CardStyle;
  onSwipe: (direction: 'left' | 'right') => void;
}

export const StricheStatistik: React.FC<StricheStatistikProps> = ({
  teams,
  games,
  currentGameId,
  cardStyle,
  onSwipe,
}) => {
  const gameStore = useGameStore();

  return (
    <div className="flex flex-col w-full space-y-4">
      <div>
        {games.map((game, index) => (
          <div key={game.id} className="flex items-start">
            <img 
              src={getPictogram(game.farbe as JassColor, 'svg', cardStyle)}
              alt={game.farbe}
              className="w-5 h-5 inline-block mr-2 flex-shrink-0"
            />
            <ResultatZeile
              gameId={game.id}
              spielNummer={index + 1}
              topTeam={{ striche: game.teams.top.striche }}
              bottomTeam={{ striche: game.teams.bottom.striche }}
              showJassPoints={false}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
