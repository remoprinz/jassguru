import React from 'react';
import ZShape from './ZShape';

interface JassKreidetafelProps {
  topBottomPadding?: string;
  middleLineWidth?: string;
}

const JassKreidetafel: React.FC<JassKreidetafelProps> = ({
  topBottomPadding = 'py-20',
  middleLineWidth = 'w-[90%]'
}) => {
  return (
    <div className={`w-full h-screen bg-black flex flex-col justify-between items-center ${topBottomPadding}`}>
      <ZShape className="w-[80%] h-[40%] text-chalk-red" diagonalStrokeWidth={0.6} />
      <div className={`${middleLineWidth} h-[3px] bg-chalk-red`} />
      <ZShape className="w-[80%] h-[40%] text-chalk-red" diagonalStrokeWidth={0.6} />
    </div>
  );
};

export default JassKreidetafel;