import React from 'react';
import StrichDisplay from './StrichDisplay';
import { StricheDisplay } from '../../types/jass';

interface ResultatZeileProps {
  spielNummer: number;
  topTeam: {
    striche: StricheDisplay;
    jassPoints?: number;
  };
  bottomTeam: {
    striche: StricheDisplay;
    jassPoints?: number;
  };
  showJassPoints: boolean;
}

const ResultatZeile: React.FC<ResultatZeileProps> = ({
  spielNummer,
  topTeam,
  bottomTeam,
  showJassPoints
}) => {
  return (
    <div className="grid grid-cols-5 gap-4 items-center py-2 border-b border-gray-700">
      <div className="text-center relative">
        {spielNummer}
      </div>
      
      <div className="flex flex-col items-center col-span-2">
        {showJassPoints ? (
          <div className="text-xl">
            {topTeam.jassPoints || 0}
          </div>
        ) : (
          <>
            <StrichDisplay
              type="horizontal"
              count={topTeam.striche.horizontal}
              position="top"
            />
            <StrichDisplay
              type="vertikal"
              count={topTeam.striche.vertikal}
              position="top"
            />
          </>
        )}
      </div>
      
      <div className="flex flex-col items-center col-span-2">
        {showJassPoints ? (
          <div className="text-xl">
            {bottomTeam.jassPoints || 0}
          </div>
        ) : (
          <>
            <StrichDisplay
              type="horizontal"
              count={bottomTeam.striche.horizontal}
              position="bottom"
            />
            <StrichDisplay
              type="vertikal"
              count={bottomTeam.striche.vertikal}
              position="bottom"
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ResultatZeile;
