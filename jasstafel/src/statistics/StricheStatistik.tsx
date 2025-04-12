import React from "react";
import {StatisticProps} from "../types/statistikTypes";
import ResultatZeile from "../components/game/ResultatZeile";
import {useGameStore} from "../store/gameStore";
import { getPictogram } from '@/utils/pictogramUtils';
import type { CardStyle, JassColor, StrokeSettings } from '@/types/jass';

interface StricheStatistikProps {
  teams: any;
  games: any[];
  currentGameId: number;
  cardStyle: CardStyle;
  strokeSettings: StrokeSettings;
  onSwipe: (direction: 'left' | 'right') => void;
}

export const StricheStatistik: React.FC<StricheStatistikProps> = ({
  teams,
  games,
  currentGameId,
  cardStyle,
  strokeSettings,
  onSwipe,
}) => {
  const gameStore = useGameStore();

  return (
    <div className="flex flex-col w-full space-y-4">
      <div>
        {games.map((game, index) => (
          <ResultatZeile
            key={game.id}
            gameId={game.id}
            spielNummer={index + 1}
            topTeam={{ striche: game.teams.top.striche }}
            bottomTeam={{ striche: game.teams.bottom.striche }}
            showJassPoints={false}
            strokeSettings={strokeSettings}
          />
        ))}
      </div>
    </div>
  );
};
