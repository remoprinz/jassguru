import React from "react";
import StrichDisplay from "./StrichDisplay";
import {StricheRecord, convertToDisplayStriche, StrokeSettings} from "../../types/jass";

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
  isCurrentGameRow?: boolean;
  strokeSettings: StrokeSettings;
}

const ResultatZeile: React.FC<ResultatZeileProps> = ({
  spielNummer,
  topTeam,
  bottomTeam,
  showJassPoints,
  gameId,
  isCurrentGameRow,
  strokeSettings,
}) => {
  const finalTopTeam = topTeam;
  const finalBottomTeam = bottomTeam;

  const topStriche = convertToDisplayStriche(finalTopTeam.striche, strokeSettings);
  const bottomStriche = convertToDisplayStriche(finalBottomTeam.striche, strokeSettings);

  const rowClassName = `grid grid-cols-[0.5fr_5fr_5fr] gap-4 items-center py-2 last:border-b-0 border-b border-gray-700 ${
    isCurrentGameRow ? 'bg-gray-700' : ''
  }`;

  return (
    <div className={rowClassName}>
      <div className="text-gray-400 text-center pl-2">
        {spielNummer}
      </div>

      <div className="flex justify-center -ml-[-32px]">
        {showJassPoints ? (
          <div className="text-xl text-white text-center w-[90px]">
            {finalBottomTeam.jassPoints || 0}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
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

      <div className="flex justify-center -ml-[-20px]">
        {showJassPoints ? (
          <div className="text-xl text-white text-center w-[100px]">
            {finalTopTeam.jassPoints || 0}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
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
