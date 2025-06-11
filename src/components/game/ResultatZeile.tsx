import React, { useEffect, useMemo } from "react";
import StrichDisplay from "./StrichDisplay";
import {StricheRecord, convertToDisplayStriche, StrokeSettings, ScoreSettings} from "../../types/jass";

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
  scoreSettings: ScoreSettings;
  onNavigate?: (gameId: number) => void;
  gameTypeLabel?: string;
}

const ResultatZeile: React.FC<ResultatZeileProps> = ({
  spielNummer,
  topTeam,
  bottomTeam,
  showJassPoints,
  gameId,
  isCurrentGameRow,
  strokeSettings,
  scoreSettings,
  onNavigate,
  gameTypeLabel,
}) => {
  const finalTopTeam = topTeam;
  const finalBottomTeam = bottomTeam;

  // Berechne die anzuzeigenden Striche basierend auf den Eingabedaten
  const topStriche = useMemo(() => convertToDisplayStriche(finalTopTeam.striche, strokeSettings, scoreSettings), [finalTopTeam.striche, strokeSettings, scoreSettings]);
  const bottomStriche = useMemo(() => convertToDisplayStriche(finalBottomTeam.striche, strokeSettings, scoreSettings), [finalBottomTeam.striche, strokeSettings, scoreSettings]);

  // Zurück zum Layout, das für Striche/History funktioniert
  const rowClassName = `grid grid-cols-[2rem_5fr_5fr] gap-8 items-center py-3 last:border-b-0 border-b border-gray-700`;

  const handleClick = () => {
    if (onNavigate && spielNummer) {
      onNavigate(gameId);
    }
  };

  return (
    <div className={rowClassName}>
      <div className="text-gray-400 text-left pl-3">
        {spielNummer}
      </div>

      {/* --- Spalte für Team Unten (Team 1 / links im UI) --- */}
      <div className="grid-cell">
        <div className="flex justify-center">
          {showJassPoints ? (
            <div className="text-xl text-white text-right pr-8 w-[120px]">
              {finalBottomTeam.jassPoints ?? 0}
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
      </div>

      {/* --- Spalte für Team Oben (Team 2 / rechts im UI) --- */}
      <div className="grid-cell">
        <div className="flex justify-center">
          {showJassPoints ? (
            <div className="text-xl text-white text-right pr-8 w-[120px]">
              {finalTopTeam.jassPoints ?? 0}
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
    </div>
  );
};

export default ResultatZeile;
