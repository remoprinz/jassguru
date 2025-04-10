import React from "react";
import {StatisticProps} from "../types/statistikTypes";
import ResultatZeile from "../components/game/ResultatZeile";
import {useGameStore} from "../store/gameStore";
import {animated, useSpring} from "react-spring";
import { getPictogram } from '@/utils/pictogramUtils';
import type { CardStyle, JassColor } from '@/types/jass';

interface JasspunkteStatistikProps {
  teams: any;
  games: any[];
  currentGameId: number;
  cardStyle: CardStyle;
  onSwipe: (direction: 'left' | 'right') => void;
}

export const JasspunkteStatistik: React.FC<JasspunkteStatistikProps> = ({
  teams,
  games,
  currentGameId,
  cardStyle,
  onSwipe
}) => {
  const scores = useGameStore((state) => state.scores);
  const weisPoints = useGameStore((state) => state.weisPoints);
  const jassPoints = useGameStore((state) => state.jassPoints);

  // Animation für neue Punkte
  const fadeProps = useSpring({
    from: {opacity: 0.3, transform: "scale(0.97)"},
    to: {opacity: 1, transform: "scale(1)"},
    reset: true,
    key: `${jassPoints.top + jassPoints.bottom + weisPoints.top + weisPoints.bottom}`,
    config: {tension: 280, friction: 20},
  });

  return (
    <animated.div
      style={fadeProps}
      className="flex flex-col w-full"
    >
      {games.map((game, index) => (
        <div key={game.id} className="flex items-center py-1">
          <img 
            src={getPictogram(game.teams.top.farbe as JassColor, 'svg', cardStyle)} 
            alt={game.teams.top.farbe}
            className="w-5 h-5 inline-block mr-2 flex-shrink-0"
          />
          <ResultatZeile
            gameId={game.id}
            spielNummer={index + 1}
            topTeam={{
              striche: game.teams.top.striche,
              jassPoints: game.teams.top.jassPoints,
            }}
            bottomTeam={{
              striche: game.teams.bottom.striche,
              jassPoints: game.teams.bottom.jassPoints,
            }}
            showJassPoints={true}
          />
        </div>
      ))}
    </animated.div>
  );
};
