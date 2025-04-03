import React from "react";
import {StatisticProps} from "../types/statistikTypes";
import ResultatZeile from "../components/game/ResultatZeile";
import {useGameStore} from "../store/gameStore";

export const StricheStatistik: React.FC<StatisticProps> = ({
  teams,
  games,
  currentGameId,
  onSwipe,
}) => {
  const gameStore = useGameStore();

  return (
    <div className="flex flex-col w-full space-y-4">
      {games.map((game, index) => (
        <ResultatZeile
          key={`game-${game.id}`}
          gameId={game.id}
          spielNummer={index + 1}
          topTeam={{
            striche: game.id === currentGameId ? gameStore.striche.top : game.teams.top.striche,
          }}
          bottomTeam={{
            striche: game.id === currentGameId ? gameStore.striche.bottom : game.teams.bottom.striche,
          }}
          showJassPoints={false}
        />
      ))}
    </div>
  );
};
