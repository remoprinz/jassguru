import React from 'react';
import RoemischeZahlen from '../game/RoemischeZahlen';

interface ZShapeProps {
  className?: string;
  diagonalStrokeWidth?: number;
  width?: string;
  margin?: string;
  score: number;
  isReversed?: boolean;
}

const ZShape: React.FC<ZShapeProps> = ({ 
  className, 
  diagonalStrokeWidth = 0.5,
  width = '100%',
  margin = '0',
  score,
  isReversed = false
}) => {
  const hunderterLinie = Math.floor(score / 100) * 100;
  const fuenfzigerLinie = Math.floor((score % 100) / 50) * 50;
  const zwanzigerLinie = Math.floor((score % 50) / 20) * 20;
  const restBetrag = score % 20;

  return (
    <svg 
      className={className}
      viewBox="0 0 120 100" 
      preserveAspectRatio="xMidYMid meet"
    >
      <path d="M0 0 L110 0" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M0 100 L110 0" stroke="currentColor" strokeWidth={diagonalStrokeWidth} fill="none" />
      <path d="M0 100 L110 100" stroke="currentColor" strokeWidth="1" fill="none" />
      
      <foreignObject x="0" y={isReversed ? 80 : 0} width="110" height="20">
        <RoemischeZahlen
          wert={isReversed ? zwanzigerLinie : hunderterLinie}
          einheitWert={isReversed ? 20 : 100}
          isVertical={false}
          strichLength={10}
          strichThickness={1}
          strichColor="white"
          strichMargin={2}
          isReversed={isReversed}
        />
      </foreignObject>
      
      <foreignObject x="55" y="50" width="55" height="50" transform="rotate(-45 55 50)">
        <RoemischeZahlen
          wert={fuenfzigerLinie}
          einheitWert={50}
          isVertical={true}
          strichLength={10}
          strichThickness={1}
          strichColor="white"
          strichMargin={2}
          isReversed={isReversed}
        />
      </foreignObject>
      
      <foreignObject x="0" y={isReversed ? 0 : 80} width="110" height="20">
        <RoemischeZahlen
          wert={isReversed ? hunderterLinie : zwanzigerLinie}
          einheitWert={isReversed ? 100 : 20}
          isVertical={false}
          strichLength={10}
          strichThickness={1}
          strichColor="white"
          strichMargin={2}
          isReversed={isReversed}
        />
      </foreignObject>

      {restBetrag > 0 && (
        <>
          {!isReversed && (
            <text 
              x="105" 
              y="95" 
              fill="white" 
              fontSize="6" 
              textAnchor="end"
            >
              {restBetrag}
            </text>
          )}
          {isReversed && (
            <text 
              x="0" 
              y="5" 
              fill="white" 
              fontSize="6" 
              textAnchor="start"
              transform="scale(-1, -1)"
              style={{ transformOrigin: "5px 5px" }}
            >
              {restBetrag}
            </text>
          )}
        </>
      )}
    </svg>
  );
};

export default ZShape;