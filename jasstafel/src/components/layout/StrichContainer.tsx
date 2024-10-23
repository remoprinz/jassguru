import React, { useState, useEffect, useRef, useCallback } from 'react';
import { styled } from '@mui/material/styles';
import { animated } from 'react-spring';
import RoemischeZahlen from '../game/RoemischeZahlen';
import { useGameStore } from '../../store/gameStore';

interface StrichContainerProps {
  position: 'top' | 'bottom';
  score: number;
  onStrichClick: (value: number, position: 'top' | 'bottom') => void;
  middleLinePosition: number;
  onBlendEffect: (position: 'top' | 'bottom') => void;
  restZahl: number;
  topEdgeOffset?: number;
  bottomEdgeOffset?: number;
  top100erOffset?: string;
  bottom100erOffset?: string;
  top20erOffset?: string;
  bottom20erOffset?: string;
}

interface BoxConfig {
  height: string;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  width?: string;
  transform?: string;
  transformOrigin?: string;
}

const Container = styled('div')({
  position: 'absolute',
  width: '75%',
  maxWidth: '320px',
  height: '80%',
  top: '10%',
  left: '50%',
  transform: 'translateX(-50%)',
  pointerEvents: 'none',
  outline: '1px solid rgba(255, 255, 255, 0.3)',
});

const StrichBox = styled('div')<{ customStyle: React.CSSProperties }>(({ customStyle }) => ({
  position: 'absolute',
  width: '100%',
  border: '2px solid rgba(255, 255, 255, 0.8)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '0 10px',
  boxSizing: 'border-box',
  pointerEvents: 'auto',
  cursor: 'pointer',
  ...(customStyle as React.CSSProperties),
}));

const BoxLabel = styled('span')<{ position: 'top' | 'bottom' }>(({ position }) => ({
  position: 'absolute',
  [position === 'top' ? 'left' : 'right']: '10px',
  top: '50%',
  transform: position === 'top' ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
  color: 'rgba(255, 255, 255, 0.8)',
  fontSize: '16px',
  fontWeight: 'bold',
}));

const calculateBoxConfigs = (
  position: 'top' | 'bottom', 
  diagonalAngle: number = -43,
  top100erOffset: string = '0%',
  bottom100erOffset: string = '0%',
  top20erOffset: string = '0%',
  bottom20erOffset: string = '0%'
): Record<string, BoxConfig> => {
  if (position === 'bottom') {
    return {
      '100er': {
        height: '20%',
        top: `calc(-3.5% + ${bottom100erOffset})`,
        left: '-2%',
        width: '105%',
      },
      '50er': {
        height: '20%',
        top: '70%',
        left: '9%',
        width: '95%',
        transform: `rotate(${diagonalAngle}deg)`,
        transformOrigin: 'top left',
      },
      '20er': {
        height: '20%',
        bottom: `calc(-4.5% + ${bottom20erOffset})`,
        left: '2%',
        width: '100%',
      },
    };
  } else {
    return {
      '20er': {
        height: '20%',
        top: `calc(-4.5% + ${top100erOffset})`,
        right: '2%',
        width: '100%',
      },
      '50er': {
        height: '20%',
        bottom: '14%',
        left: '22%',
        width: '95%',
        transform: `rotate(${diagonalAngle}deg)`,
        transformOrigin: 'bottom left',
      },
      '100er': {
        height: '20%',
        bottom: `calc(-3.5% + ${top20erOffset})`,
        right: '-2%',
        width: '105%',
      },
    };
  }
};

const RestZahl = styled('span')<{ position: 'top' | 'bottom' }>(({ position }) => ({
  position: 'absolute',
  [position === 'top' ? 'left' : 'right']: '0',
  [position === 'top' ? 'bottom' : 'top']: '76%',
  color: 'rgba(255, 255, 255, 0.8)',
  fontSize: '18px',
  fontWeight: 'bold',
  transform: position === 'top'
    ? 'rotate(180deg) translate(-100%, 50%)'
    : 'translate(0, -50%)',
  transformOrigin: position === 'top' ? 'bottom left' : 'top right',
  padding: '2px',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  zIndex: 20,
}));

const StrichContainerStyled = styled('div')<{ position: 'top' | 'bottom' }>(({ position }) => ({
  position: 'absolute',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-end',
  justifyContent: 'flex-start',
}));

const StrichContainer: React.FC<StrichContainerProps> = ({
  position,
  score,
  onStrichClick,
  middleLinePosition,
  onBlendEffect,
  restZahl,
  top100erOffset = '2%',
  bottom100erOffset = '2%',
  top20erOffset = '2%',
  bottom20erOffset = '2%'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const { stricheCounts, updateStricheCounts } = useGameStore();
  const boxConfigs = calculateBoxConfigs(
    position, 
    -43, 
    top100erOffset, 
    bottom100erOffset, 
    top20erOffset, 
    bottom20erOffset
  );

  useEffect(() => {
    if (containerRef.current) {
      const height = containerRef.current.clientHeight;
      console.log('Container height:', height);
      setContainerHeight(height);
    }
  }, []);

  // Entfernt: useEffect, der stricheCounts basierend auf score neu berechnet

  const handleBoxClick = useCallback((value: number) => {
    console.log(`Box clicked: ${value}, Position: ${position}`);

    // Erhöhe die Anzahl der Striche für den geklickten Wert um 1
    const currentStricheCount = stricheCounts[position][value] || 0;
    const newStricheCount = currentStricheCount + 1;
    updateStricheCounts(position, value, newStricheCount);

    // Trigger die visuellen Effekte
    onStrichClick(value, position);
    onBlendEffect(position);
  }, [onStrichClick, onBlendEffect, position, updateStricheCounts, stricheCounts]);

  console.log('Position:', position, 'RestZahl:', restZahl);

  return (
    <Container ref={containerRef}>
      <StrichContainerStyled position={position}>
        {Object.entries(boxConfigs).map(([boxType, config]) => {
          const boxValue = parseInt(boxType);
          const stricheCount = stricheCounts[position][boxValue] || 0;

          return (
            <StrichBox
              key={boxType}
              customStyle={config}
              onClick={() => handleBoxClick(boxValue)}
            >
              <RoemischeZahlen
                stricheCount={stricheCount}
                stricheCounts={stricheCounts[position]}
                einheitWert={boxValue}
                strichColor="rgb(255, 255, 255)"
                animationDuration={100}
                isActive={true}
                direction={position === 'top' ? 'rtl' : 'ltr'}
                edgeOffset={0}
                isXMode={boxValue === 50}
                xAngle={18}
                xAlignment={position === 'top' ? 'right' : 'left'}
                isDiagonal={true}
                diagonalAngle={position === 'top' ? -43 : 43}
                diagonalStrichHeight={position === 'top' ? "116%" : "116%"}
                diagonalStrichWidth={position === 'top' ? "2px" : "2px"}
                diagonalStrichOffset={{
                  vertical: position === 'top' ? "0%" : "0%",
                  horizontal: position === 'top' ? "0%" : "0%"
                }}
                diagonalStrichAngle={position === 'top' ? -25 : 25}
                topDiagonalStrichOffset={{
                  vertical: "0%",
                  horizontal: "0%"
                }}
                bottomDiagonalStrichOffset={{
                  vertical: "0%",
                  horizontal: "0%"
                }}
                topDiagonalStrichAngle={position === 'top' ? 30 : 30}
                bottomDiagonalStrichAngle={position === 'top' ? 30 : 30}
                position={position}
                diagonalStrichOffset100er={{
                  vertical: position === 'top' ? "-18%" : "3%",
                  horizontal: position === 'top' ? "10%" : "-5%"
                }}
                diagonalStrichOffset20er={{
                  vertical: position === 'top' ? "-20%" : "3.5%",
                  horizontal: position === 'top' ? "2.5%" : "-1%"
                }}
                diagonalStrichAngle100er={position === 'top' ? 35 : 35}
                diagonalStrichAngle20er={position === 'top' ? 35  : 35}
              />
              <BoxLabel position={position}>{boxType}</BoxLabel>
            </StrichBox>
          );
        })}
        {restZahl !== undefined && (
          <RestZahl position={position}>
            {restZahl}
          </RestZahl>
        )}
      </StrichContainerStyled>
    </Container>
  );
};

export default StrichContainer;
