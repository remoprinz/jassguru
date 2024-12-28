import React, { useMemo, useCallback, useEffect } from 'react';
import { styled } from '@mui/material/styles';
import { useSpring, animated, config } from 'react-spring';
import type { TeamPosition } from '../../types/jass';

interface RoemischeZahlenProps {
  stricheCount: number;
  stricheCounts: Record<number, number>;
  einheitWert: number;
  strichColor: string;
  animationDuration?: number;
  isActive: boolean;
  direction: 'ltr' | 'rtl';
  edgeOffset: number;
  strichSpacing?: number;
  einheitSpacing?: number;
  position: TeamPosition;
  isRotated?: boolean;
  xSize?: number;
  isXMode?: boolean;
  xAngle?: number;
  xAlignment?: 'left' | 'right';
  isDiagonal?: boolean;
  diagonalAngle?: number;
  diagonalStrichHeight?: string;
  diagonalStrichWidth?: string;
  diagonalStrichOffset?: {
    vertical: string;
    horizontal: string;
  };
  diagonalStrichAngle?: number;
  topDiagonalStrichOffset: {
    vertical: string;
    horizontal: string;
  };
  bottomDiagonalStrichOffset: {
    vertical: string;
    horizontal: string;
  };
  topDiagonalStrichAngle?: number;
  bottomDiagonalStrichAngle?: number;
  diagonalStrichOffset100er: {
    vertical: string;
    horizontal: string;
  };
  diagonalStrichOffset20er: {
    vertical: string;
    horizontal: string;
  };
  diagonalStrichAngle100er?: number;
  diagonalStrichAngle20er?: number;
  xSpacing?: number;
  xOffset100erTop?: number;
  xOffset100erBottom?: number;
  offset?: {
    vertical: string;
    horizontal: string;
  };
}

const StrichContainer = styled('div')({
  position: 'absolute',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-end',
  justifyContent: 'flex-start',
});

const Strich = styled(animated.div, {
  shouldForwardProp: (prop) => prop !== 'isVertical' && prop !== 'color'
})<{ isVertical: boolean; color: string }>(({ isVertical, color }) => ({
  position: 'absolute',
  backgroundColor: color,
  width: '2px',
  height: isVertical ? '100%' : '2px',
  transformOrigin: 'top left',
}));

const StrichContainerStyled = styled('div')<{ isRotated?: boolean }>(({ isRotated }) => ({
  position: 'absolute',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-end',
  justifyContent: 'flex-start',
  transform: isRotated ? 'rotate(180deg)' : 'rotate(0)',
  transformOrigin: 'center center',
}));

const RoemischeZahlen: React.FC<RoemischeZahlenProps> = ({
  stricheCount,
  stricheCounts,
  einheitWert,
  strichColor,
  animationDuration = 1000,
  isActive,
  direction,
  edgeOffset,
  strichSpacing = 10,
  einheitSpacing = 50,
  position,
  isRotated = false,
  xSize = 20,
  isXMode = false,
  xAngle = 15,
  xAlignment = 'left',
  isDiagonal = false,
  diagonalAngle = 0,
  diagonalStrichHeight = '100%',
  diagonalStrichWidth = '2px',
  diagonalStrichOffset,
  diagonalStrichAngle = 0,
  topDiagonalStrichOffset,
  bottomDiagonalStrichOffset,
  topDiagonalStrichAngle = 0,
  bottomDiagonalStrichAngle = 0,
  diagonalStrichOffset100er,
  diagonalStrichOffset20er,
  diagonalStrichAngle100er,
  diagonalStrichAngle20er,
  xSpacing = 10,
  xOffset100erTop = 63,
  xOffset100erBottom = 40,
  offset,
}) => {
  const einheitenCount = Math.floor(stricheCount / 5);
  const restStriche = stricheCount % 5;
  const shouldDrawNewStrich = stricheCount > 0;
  const newStrichProps = useSpring({
    from: { scaleY: 0 },
    to: { scaleY: shouldDrawNewStrich ? 1 : 0 },
    config: { ...config.stiff, duration: animationDuration },
  });

  const renderStrich = useCallback((index: number, isNew: boolean, isVertical: boolean) => {
    const groupIndex = Math.floor(index / 5);
    const inGroupIndex = index % 5;
    const baseOffset = groupIndex * (einheitSpacing + strichSpacing * 4);
    const strichOffset = inGroupIndex * strichSpacing;
    const isDiagonal = inGroupIndex === 4;

    if (isDiagonal) {
      const diagonalOffset = strichSpacing * 3;
      let offset;
      let angle;

      if (einheitWert === 100 && diagonalStrichOffset100er) {
        offset = diagonalStrichOffset100er;
        angle = diagonalStrichAngle100er || diagonalStrichAngle;
      } else if (einheitWert === 20 && diagonalStrichOffset20er) {
        offset = diagonalStrichOffset20er;
        angle = diagonalStrichAngle20er || diagonalStrichAngle;
      } else {
        offset = position === 'top' ? topDiagonalStrichOffset : bottomDiagonalStrichOffset;
        angle = position === 'top' ? topDiagonalStrichAngle : bottomDiagonalStrichAngle;
      }

      const positionStyle = position === 'top'
        ? {
            right: `calc(${edgeOffset + baseOffset + diagonalOffset}px + ${offset.horizontal} ${einheitWert === 100 ? '- 0px' : ''})`,
            top: `calc(0px + ${offset.vertical})`,
          }
        : {
            left: `calc(${edgeOffset + baseOffset}px + ${offset.horizontal})`,
            bottom: `calc(0px + ${offset.vertical})`,
          };

      const strichStyle: React.CSSProperties = {
        position: 'absolute',
        height: diagonalStrichHeight,
        width: diagonalStrichWidth,
        ...positionStyle,
        transform: `rotate(${angle}deg)`,
        transformOrigin: position === 'top' && einheitWert === 100 ? 'bottom left' : position === 'bottom' ? 'bottom left' : 'bottom left',
        backgroundColor: strichColor,
      };

      return (
        <div
          key={`strich-${index}`}
          style={strichStyle}
        />
      );
    } else if (isVertical) {
      let positionStyle;
      if (direction === 'ltr') {
        const adjustedOffset = position === 'bottom' && einheitWert === 0 ? 0 : 5; // Anpassung für untere 20er-Box
        positionStyle = { left: `${edgeOffset + baseOffset + strichOffset + adjustedOffset}px` };
      } else {
        positionStyle = { right: `${edgeOffset + baseOffset + strichOffset}px` };
      }

      const strichStyle: React.CSSProperties = {
        position: 'absolute',
        height: '100%',
        width: '2px',
        ...positionStyle,
      };

      return (
        <div
          key={`strich-${index}`}
          style={{
            ...strichStyle,
            backgroundColor: strichColor,
          }}
        />
      );
    }

    return null;
  }, [strichColor, direction, edgeOffset, diagonalStrichHeight, diagonalStrichWidth, diagonalStrichAngle, strichSpacing, einheitSpacing, position, topDiagonalStrichOffset, bottomDiagonalStrichOffset, topDiagonalStrichAngle, bottomDiagonalStrichAngle, einheitWert, diagonalStrichOffset100er, diagonalStrichOffset20er, diagonalStrichAngle100er, diagonalStrichAngle20er]);

  const renderEinheit = useCallback((index: number) => {
    return (
      <React.Fragment key={`einheit-${index}`}>
        {[0, 1, 2, 3].map((i) => renderStrich(index * 5 + i, false, true))}
        {renderStrich(index * 5 + 4, false, false)} {/* Der letzte Strich ist diagonal */}
      </React.Fragment>
    );
  }, [renderStrich]);

  const einheitenElements = useMemo(() => 
    Array.from({ length: einheitenCount }).map((_, index) => renderEinheit(index)),
  [einheitenCount, renderEinheit]);

  const restStricheElements = useMemo(() => 
    Array.from({ length: restStriche }).map((_, index) => 
      renderStrich(einheitenCount * 5 + index, false, index < 4)
    ),
  [restStriche, einheitenCount, renderStrich]);

  const newStrichElement = useMemo(() => {
    if (shouldDrawNewStrich) {
      const newStrichIndex = stricheCount - 1;
      const isVertical = newStrichIndex % 5 < 4;
      return renderStrich(newStrichIndex, true, isVertical);
    }
    return null;
  }, [shouldDrawNewStrich, stricheCount, renderStrich]);

  const calculateXPositions = useCallback(() => {
    const xCount = Math.ceil(stricheCount / 2);
    const xSizePx =35; // Passen Sie die Größe nach Bedarf an
    const xSpacingPx = 0; // Passen Sie den Abstand nach Bedarf an

    return Array.from({ length: xCount }).map((_, index) => {
      const xOffset = index * (xSizePx + xSpacingPx);
      return `${xOffset}px`;
    });
  }, [stricheCount]);

  const renderX = useCallback(() => {
    const xPositions = calculateXPositions();
    return xPositions.map((xPosition, index) => {
      const isComplete = (index * 2 + 2) <= stricheCount;
      const isPartial = (index * 2 + 1) === stricheCount;

      const xStyle: React.CSSProperties = {
        position: 'absolute',
        width: '0%',  // Anstelle von festen Pixelwerten
        height: '104%', // Anstelle von festen Pixelwerten
        top: '50%',
        transform: 'translateY(-50%)',
      };

      if (position === 'top') {
        xStyle.right = `calc(${xPosition} + 40px)`; // Hier ist die Änderung
      } else {
        xStyle.left = `calc(${xPosition} + 20px)`; // Fügen Sie einen Offset hinzu
      }

      return (
        <div key={`x-${index}`} style={xStyle}>
          <div style={{
            position: 'absolute',
            width: '2px',
            height: '100%',
            backgroundColor: strichColor,
            transform: `rotate(${xAngle}deg)`,
            transformOrigin: 'center',
            opacity: isComplete || isPartial ? 1 : 0,
          }} />
          <div style={{
            position: 'absolute',
            width: '2px',
            height: '100%',
            backgroundColor: strichColor,
            transform: `rotate(-${xAngle}deg)`,
            transformOrigin: 'center',
            opacity: isComplete ? 1 : 0,
          }} />
        </div>
      );
    });
  }, [calculateXPositions, stricheCount, xAngle, strichColor, position]);

  const renderHundredXs = useCallback(() => {
    const xCount = Math.floor(stricheCount / 10);
    const spacing = 15; // Abstand zwischen den X-Symbolen in Pixeln
    const totalWidth = xCount * xSize + (xCount - 1) * spacing;
    
    return xCount > 0 ? (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {Array.from({ length: xCount }).map((_, index) => (
          <div
            key={`hundred-x-${index}`}
            style={{
              position: 'absolute',
              ...(position === 'top' 
                ? { right: `${23 + index * (xSize + spacing)}px` }
                : { left: `${23 + index * (xSize + spacing)}px` }),
              top: '50%',
              transform: 'translateY(-50%)',
              width: `${xSize}px`,
              height: '107%',
            }}
          >
            <div style={{
              position: 'absolute',
              width: '2px',
              height: '100%',
              backgroundColor: strichColor,
              transform: `rotate(${xAngle}deg)`,
              transformOrigin: 'center',
            }} />
            <div style={{
              position: 'absolute',
              width: '2px',
              height: '100%',
              backgroundColor: strichColor,
              transform: `rotate(-${xAngle}deg)`,
              transformOrigin: 'center',
            }} />
          </div>
        ))}
      </div>
    ) : null;
  }, [stricheCount, strichColor, xSize, xAngle, position]);

  const renderStriche = useMemo(() => {
    if (isXMode) {
      return renderX();
    } else if (einheitWert === 100) {
      const xCount = Math.floor(stricheCount / 10);
      const remainingStriche = stricheCount % 10;
      const totalStriche = stricheCount - xCount * 10;
      const xWidth = xCount * (xSize + xSpacing);
      const initialOffset = 25; // Initiale Position der Striche
      const xOffsetTop = xOffset100erTop ?? 63; // Abstand zum letzten X für die obere Box
      const xOffsetBottom = xOffset100erBottom ?? 40; // Abstand zum letzten X für die untere Box

      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {renderHundredXs()}
          {totalStriche > 0 && (
            <div style={{
              position: 'absolute',
              ...(position === 'top'
                ? { right: xCount > 0 
                    ? `calc(${xWidth}px + ${xOffsetTop}px)` 
                    : `calc(${initialOffset}px + 16px)` }
                : { left: xCount > 0
                    ? `calc(${xWidth}px + ${xOffsetBottom}px)`
                    : `calc(${initialOffset}px - 8px)` }),
              top: 0,
              bottom: 0,
              width: `${totalStriche * strichSpacing}px`,
            }}>
              {Array.from({ length: totalStriche }).map((_, index) => 
                renderStrich(index, false, true)
              )}
            </div>
          )}
        </div>
      );
    } else if (einheitWert === 20) {
      const einheitenCount = Math.floor(stricheCount / 5);
      const restStriche = stricheCount % 5;
      const totalWidth = einheitenCount * (einheitSpacing + strichSpacing * 4) + restStriche * strichSpacing;

      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          <div style={{
            position: 'absolute',
            ...(position === 'top'
              ? { right: '25px' }
              : { left: '0px' }),
            top: 0,
            bottom: 0,
            width: `${totalWidth}px`,
          }}>
            {Array.from({ length: einheitenCount }).map((_, index) => 
              renderEinheit(index)
            )}
            {Array.from({ length: restStriche }).map((_, index) => 
              renderStrich(einheitenCount * 5 + index, false, index < 4)
            )}
          </div>
        </div>
      );
    } else {
      return (
        <>
          {einheitenElements}
          {restStricheElements}
          {newStrichElement}
        </>
      );
    }
  }, [stricheCount, einheitWert, isXMode, renderX, renderHundredXs, xSize, xSpacing, position, strichSpacing, renderStrich, einheitenElements, restStricheElements, newStrichElement, einheitSpacing, renderEinheit]);

  useEffect(() => {
    if (stricheCount > 0) {
      // Logik hier statt im Render
    }
  }, [stricheCount]);

  return (
    <StrichContainerStyled isRotated={isRotated}>
      {renderStriche}
    </StrichContainerStyled>
  );
};

export default RoemischeZahlen;