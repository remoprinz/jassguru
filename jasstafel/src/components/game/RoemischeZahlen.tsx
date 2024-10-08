import React from 'react';
import { styled } from '@mui/material/styles';

interface StrichProps {
  isVertical: boolean;
  isDiagonal: boolean;
  length: number;
  thickness: number;
  color: string;
  margin: number;
}

const Strich = styled('div')<StrichProps>(({ isVertical, isDiagonal, length, thickness, color, margin }) => ({
  width: isVertical ? thickness : length,
  height: isVertical ? length : thickness,
  backgroundColor: color,
  margin: `0 ${margin}px`,
  transform: isDiagonal ? 'rotate(45deg)' : (isVertical ? 'none' : 'rotate(90deg)'),
}));

interface RoemischeZahlenProps {
  wert: number;
  einheitWert: number;
  isVertical: boolean;
  strichLength: number;
  strichThickness: number;
  strichColor: string;
  strichMargin: number;
  isReversed?: boolean;
}

const RoemischeZahlen: React.FC<RoemischeZahlenProps> = ({
  wert,
  einheitWert,
  isVertical,
  strichLength,
  strichThickness,
  strichColor,
  strichMargin,
  isReversed = false,
}) => {
  const anzahlStriche = Math.floor(wert / einheitWert);
  
  const renderStriche = () => {
    const striche = [];
    let remainingStriche = anzahlStriche;

    if (einheitWert === 100 || einheitWert === 20) {
      while (remainingStriche > 0) {
        if (remainingStriche >= 5) {
          striche.push(
            <React.Fragment key={`group-${remainingStriche}`}>
              {[...Array(4)].map((_, index) => (
                <Strich
                  key={`vertical-${index}`}
                  isVertical={true}
                  isDiagonal={false}
                  length={strichLength}
                  thickness={strichThickness}
                  color={strichColor}
                  margin={strichMargin}
                />
              ))}
              <Strich
                isVertical={false}
                isDiagonal={true}
                length={strichLength * 1.4}
                thickness={strichThickness}
                color={strichColor}
                margin={strichMargin}
              />
            </React.Fragment>
          );
          remainingStriche -= 5;
        } else {
          striche.push(
            <Strich
              key={`single-${remainingStriche}`}
              isVertical={true}
              isDiagonal={false}
              length={strichLength}
              thickness={strichThickness}
              color={strichColor}
              margin={strichMargin}
            />
          );
          remainingStriche--;
        }
      }
    } else if (einheitWert === 50) {
      while (remainingStriche > 0) {
        if (remainingStriche >= 2) {
          striche.push(
            <React.Fragment key={`x-${remainingStriche}`}>
              <Strich
                isVertical={false}
                isDiagonal={true}
                length={strichLength * 1.4}
                thickness={strichThickness}
                color={strichColor}
                margin={strichMargin}
              />
              <Strich
                isVertical={false}
                isDiagonal={true}
                length={strichLength * 1.4}
                thickness={strichThickness}
                color={strichColor}
                margin={strichMargin}
                style={{ transform: 'rotate(-45deg)' }}
              />
            </React.Fragment>
          );
          remainingStriche -= 2;
        } else {
          striche.push(
            <Strich
              key={`single-${remainingStriche}`}
              isVertical={false}
              isDiagonal={true}
              length={strichLength * 1.4}
              thickness={strichThickness}
              color={strichColor}
              margin={strichMargin}
            />
          );
          remainingStriche--;
        }
      }
    }

    return isReversed ? striche.reverse() : striche;
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: isVertical ? 'column' : 'row', 
      alignItems: 'center',
      transform: isReversed ? 'scaleX(-1)' : 'none'
    }}>
      {renderStriche()}
    </div>
  );
};

export default RoemischeZahlen;