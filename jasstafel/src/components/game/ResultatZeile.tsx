import React from 'react';
import StrichDisplay from './StrichDisplay';
import { StricheDisplay } from '../../types/jass';

interface ResultatZeileProps {
  spielNummer: number;
  topTeam: {
    striche: StricheDisplay;
  };
  bottomTeam: {
    striche: StricheDisplay;
  };
  rosenSpieler?: 'top' | 'bottom';
}

const ResultatZeile: React.FC<ResultatZeileProps> = ({
  spielNummer,
  topTeam,
  bottomTeam,
  rosenSpieler
}) => {
  return (
    <div className="grid grid-cols-5 gap-4 items-center py-2 border-b border-gray-700">
      <div className="text-center relative">
        {spielNummer}
        {rosenSpieler && (
          <div 
            className="absolute top-0 left-0 transform -translate-x-1/2 -translate-y-1/2"
            title="Rosen 10 Spieler"
          >
            ⚘
          </div>
        )}
      </div>
      
      <div className="flex flex-col items-center col-span-2">
        <StrichDisplay
          type="horizontal"
          count={topTeam.striche.horizontal}
          size={{ width: 16, height: 2 }}
        />
        <StrichDisplay
          type="vertikal"
          count={topTeam.striche.vertikal}
          size={{ width: 2, height: 16 }}
        />
      </div>
      
      <div className="flex flex-col items-center col-span-2">
        <StrichDisplay
          type="horizontal"
          count={bottomTeam.striche.horizontal}
          size={{ width: 16, height: 2 }}
        />
        <StrichDisplay
          type="vertikal"
          count={bottomTeam.striche.vertikal}
          size={{ width: 2, height: 16 }}
        />
      </div>
    </div>
  );
};

export default ResultatZeile;
