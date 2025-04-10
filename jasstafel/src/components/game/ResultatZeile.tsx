import React from "react";
import StrichDisplay from "./StrichDisplay";
import {StricheRecord, convertToDisplayStriche} from "../../types/jass";
import {useJassStore} from "../../store/jassStore";
import {useGameStore} from "../../store/gameStore";

interface ResultatZeileProps {
  spielNummer: number;
  topTeam: {
    striche: StricheRecord;
    jassPoints?: number;
  };
  bottomTeam: {
    striche: StricheRecord;
    jassPoints?: number;
  };
  showJassPoints: boolean;
  gameId: number;
}

const ResultatZeile: React.FC<ResultatZeileProps> = ({
  spielNummer,
  topTeam,
  bottomTeam,
  showJassPoints,
  gameId,
}) => {
  const currentGameId = useJassStore((state) => state.currentGameId);
  const currentGame = useJassStore((state) => state.getCurrentGame());
  const currentStriche = useGameStore((state) => state.striche);
  const weisPoints = useGameStore((state) => state.weisPoints);
  const jassPoints = useGameStore((state) => state.jassPoints);

  if (gameId > currentGameId) {
    return null;
  }

  const isCurrentGame = gameId === currentGameId;

  const finalTopTeam = isCurrentGame ? {
    striche: currentStriche.top,
    jassPoints: (jassPoints.top + weisPoints.top),
    total: currentGame?.teams.top.total,
  } : topTeam;

  const finalBottomTeam = isCurrentGame ? {
    striche: currentStriche.bottom,
    jassPoints: (jassPoints.bottom + weisPoints.bottom),
    total: currentGame?.teams.bottom.total,
  } : bottomTeam;

  const topStriche = convertToDisplayStriche(finalTopTeam.striche);
  const bottomStriche = convertToDisplayStriche(finalBottomTeam.striche);

  return (
    <div className="grid grid-cols-[0.5fr_5fr_5fr] gap-4 items-start last:border-b-0 border-b border-gray-700">
      <div className="text-gray-400 text-center pl-2">
        {spielNummer}
      </div>

      <div className="flex justify-center -ml-[-22px]">
        {showJassPoints ? (
          <div className="text-xl text-white text-center w-[90px]">
            {finalBottomTeam.jassPoints || 0}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <StrichDisplay
              type="horizontal"
              count={bottomStriche.horizontal}
              position="bottom"
            />
            <StrichDisplay
              type="vertikal"
              count={bottomStriche.vertikal}
              position="bottom"
            />
          </div>
        )}
      </div>

      <div className="flex justify-center -ml-[-10px]">
        {showJassPoints ? (
          <div className="text-xl text-white text-center w-[100px]">
            {finalTopTeam.jassPoints || 0}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <StrichDisplay
              type="horizontal"
              count={topStriche.horizontal}
              position="top"
            />
            <StrichDisplay
              type="vertikal"
              count={topStriche.vertikal}
              position="top"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultatZeile;
