import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import { styled } from '@mui/material/styles';
import RoemischeZahlen from '../game/RoemischeZahlen';
import { useGameStore } from '../../store/gameStore';

interface StrichContainerProps {
  position: 'top' | 'bottom';
  onStrichClick: (value: number, position: 'top' | 'bottom') => void;
  onBlendEffect: (position: 'top' | 'bottom') => void;
  top100erOffset?: string;
  bottom100erOffset?: string;
  top20erOffset?: string;
  bottom20erOffset?: string;
  restZahl?: number;
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
});

const StrichBox = styled('div')<{ customStyle: React.CSSProperties }>(({ customStyle }) => ({
  position: 'absolute',
  width: '100%',
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
        left: '-4%',
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
        width: '90%',
      },
      'restzahl': {
        height: '20%',
        top: '88%',
        right: '-2%',
        width: '20%',
      }
    };
  } else {
    return {
      '20er': {
        height: '20%',
        top: `calc(-4.5% + ${top20erOffset})`,
        right: '2%',
        width: '90%',
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
        bottom: `calc(-3.5% + ${top100erOffset})`,
        right: '-4%',
        width: '105%',
      },
      'restzahl': {
        height: '20%',
        bottom: '88%',
        left: '-2%',
        width: '20%',
      }
    };
  }
};

const StrichContainerStyled = styled('div')<{ isRotated?: boolean }>(({ isRotated }) => ({
  position: 'absolute',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'row', 
  alignItems: 'flex-end',
  justifyContent: 'flex-start',
  transform: isRotated ? 'rotateX(180deg) rotateY(180deg) rotateZ(180deg)' : 'none',
  transformOrigin: 'center center',
}));

const StrichContainer: React.FC<StrichContainerProps> = ({
  position,
  onBlendEffect,
  top100erOffset = '2%',
  bottom100erOffset = '2%',
  top20erOffset = '2%',
  bottom20erOffset = '2%'
}) => {
  const lastClickTimeRef = useRef<number>(0);
  const clickTimeoutRef = useRef<NodeJS.Timeout>();
  
  const { 
    updateScoreByStrich, 
    currentHistoryIndex, 
    scoreHistory, 
    showHistoryWarning,
    restZahlen,
    setIsGameInfoOpen
  } = useGameStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const { stricheCounts } = useGameStore();
  const boxConfigs = calculateBoxConfigs(
    position, 
    -43, 
    top100erOffset, 
    bottom100erOffset, 
    top20erOffset, 
    bottom20erOffset
  );

  const handleBoxClick = useCallback((event: React.MouseEvent, boxType: string) => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;
    
    // Wenn ein zweiter Klick innerhalb von 200ms erfolgt
    if (timeSinceLastClick < 200) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      setIsGameInfoOpen(true);
      useGameStore.setState({ lastDoubleClickPosition: position });
      return;
    }
    
    // Beim ersten Klick: Timer setzen und warten
    lastClickTimeRef.current = now;
    
    // Timeout für den eigentlichen Klick
    clickTimeoutRef.current = setTimeout(() => {
      const value = boxType === 'restzahl' ? 1 : parseInt(boxType);
      
      if (currentHistoryIndex < scoreHistory.length - 1) {
        showHistoryWarning(
          "Willst du wirklich die Vergangenheit ändern? Dies wird alle nachfolgenden Einträge löschen!",
          () => {
            updateScoreByStrich(position, value);
            onBlendEffect(position);
          }
        );
      } else {
        updateScoreByStrich(position, value);
        onBlendEffect(position);
      }
    }, 200);
    
  }, [updateScoreByStrich, onBlendEffect, position, currentHistoryIndex, scoreHistory.length, showHistoryWarning, setIsGameInfoOpen]);

  // Cleanup beim Unmount
  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Container ref={containerRef}>
      <StrichContainerStyled isRotated={position === 'top'}>
        {Object.entries(boxConfigs).map(([boxType, config]) => {
          const boxValue = boxType === 'restzahl' ? 1 : parseInt(boxType);
          const stricheCount = boxValue === 1 ? restZahlen[position] : (stricheCounts[position][boxValue] || 0);

          return (
            <StrichBox
              key={boxType}
              customStyle={config}
              data-strich-box="true"
              onClick={(event) => handleBoxClick(event, boxType)}
            >
              {boxType === 'restzahl' ? (
                <BoxLabel position={position}>
                  {restZahlen[position]}
                </BoxLabel>
              ) : (
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
                    horizontal: position === 'top' ? "5.5%" : "-1.5%"
                  }}
                  diagonalStrichAngle100er={position === 'top' ? 35 : 35}
                  diagonalStrichAngle20er={position === 'top' ? 35 : 35}
                />
              )}
            </StrichBox>
          );
        })}
      </StrichContainerStyled>
    </Container>
  );
};

export default StrichContainer;