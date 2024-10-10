import React from 'react';
import { styled } from '@mui/material/styles';

interface StrichProps {
  isVertical: boolean;
  isDiagonal: boolean;
  length: number;
  thickness: number;
  color: string;
  margin: number;
  onClick: () => void;
}

const Strich = styled('div')<StrichProps>(({ isVertical, isDiagonal, length, thickness, color, margin }) => ({
  width: isVertical ? thickness : length,
  height: isVertical ? length : thickness,
  backgroundColor: color,
  margin: `0 ${margin}px`,
  transform: isDiagonal ? 'rotate(45deg)' : (isVertical ? 'none' : 'rotate(90deg)'),
  cursor: 'pointer',
}));

interface RoemischeZahlenProps {
  wert: number;
  einheitWert: number;
  isVertical: boolean;
  strichLength: number;
  strichThickness: number;
  strichColor: string;
  strichMargin: number;
  position: 'top' | 'bottom';
  onClick: (value: number) => void;
}

const RoemischeZahlen: React.FC<RoemischeZahlenProps> = ({
  wert,
  einheitWert,
  isVertical,
  strichLength,
  strichThickness,
  strichColor,
  strichMargin,
  position,
  onClick,
}) => {
  const anzahlStriche = Math.floor(wert / einheitWert);
  
  const renderStriche = () => {
    const striche = [];
    let remainingStriche = anzahlStriche;

    const renderStrich = (key: string, isVertical: boolean, isDiagonal: boolean, length: number) => (
      <Strich
        key={key}
        isVertical={isVertical}
        isDiagonal={isDiagonal}
        length={length}
        thickness={strichThickness}
        color={strichColor}
        margin={strichMargin}
        onClick={() => onClick(einheitWert)}
      />
    );

    const renderGroup = (groupKey: string, count: number, isVertical: boolean) => (
      <React.Fragment key={groupKey}>
        {[...Array(count)].map((_, index) => renderStrich(`${groupKey}-${index}`, isVertical, false, strichLength))}
        {renderStrich(`${groupKey}-diagonal`, false, true, strichLength * 1.4)}
      </React.Fragment>
    );

    if (einheitWert === 100) {
      while (remainingStriche > 0) {
        if (remainingStriche >= 10) {
          striche.push(renderStrich(`x-${remainingStriche}`, false, true, strichLength * 1.4));
          remainingStriche -= 10;
        } else if (remainingStriche >= 5) {
          striche.push(renderGroup(`group-${remainingStriche}`, 4, false));
          remainingStriche -= 5;
        } else {
          striche.push(renderStrich(`single-${remainingStriche}`, false, false, strichLength));
          remainingStriche--;
        }
      }
    } else if (einheitWert === 50) {
      while (remainingStriche > 0) {
        striche.push(renderStrich(`diagonal-${remainingStriche}`, false, true, strichLength * 1.4));
        remainingStriche--;
      }
    } else if (einheitWert === 20) {
      while (remainingStriche > 0) {
        if (remainingStriche >= 5) {
          striche.push(renderGroup(`group-${remainingStriche}`, 4, true));
          remainingStriche -= 5;
        } else {
          striche.push(renderStrich(`single-${remainingStriche}`, true, false, strichLength));
          remainingStriche--;
        }
      }
    }

    return striche;
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: isVertical ? 'column' : 'row', 
      alignItems: 'center',
      justifyContent: position === 'top' ? 'flex-start' : 'flex-end',
      transform: position === 'top' ? 'rotate(180deg)' : 'none'
    }}>
      {renderStriche()}
    </div>
  );
};

export default RoemischeZahlen;