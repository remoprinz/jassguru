import React from 'react';
import { animated, useSpring } from 'react-spring';
import styled from 'styled-components';

export interface StrichStyle {
  baseStrich: {
    length: number;
    width: number;
    color: string;
    opacity: number;
  };
  diagonalStrich: {
    length: number;
    width: number;
    angle: number;
    offset: { x: number; y: number };
  };
  container: {
    spacing: number;
    groupSpacing: number;
    scale: number;
  };
}

interface StrichDisplayProps {
  count: number;
  style?: StrichStyle;
  position?: 'top' | 'bottom';
  type: 'horizontal' | 'vertikal';
}

const defaultStyle: StrichStyle = {
  baseStrich: {
    length: 35,
    width: 3,
    color: '#FFFFFF',
    opacity: 1
  },
  diagonalStrich: {
    length: 52,
    width: 45,
    angle: 50,
    offset: { x: -2, y: 0 }
  },
  container: {
    spacing: 9,
    groupSpacing: 2,
    scale: 2
  }
};

const StrichContainerStyled = styled('div')<{ type: 'horizontal' | 'vertikal' }>(({ type }) => ({
  position: 'relative',
  width: '30%',
  minHeight: type === 'horizontal' ? '20px' : '35px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: type === 'horizontal' ? 'center' : 'flex-start',
  transform: type === 'horizontal' ? 'rotate(90deg) rotate(180deg)' : 'none',
  transformOrigin: 'center left',
  marginBottom: '8px',
  ...(type === 'horizontal' && {
    marginTop: '15px',
    marginLeft: '20px',
  })
}));

const StrichDisplay: React.FC<StrichDisplayProps> = ({
  count,
  style = defaultStyle,
  position = 'bottom',
  type
}) => {
  const finalStyle = { ...defaultStyle, ...style };

  const renderStriche = () => {
    return Array.from({ length: count }).map((_, index) => {
      const isDiagonal = (index + 1) % 5 === 0;
      const groupIndex = Math.floor(index / 5);
      const basePosition = index * finalStyle.container.spacing + 
        (groupIndex * (finalStyle.container.groupSpacing || 0));

      const springProps = useSpring({
        from: { scale: 0, opacity: 0 },
        to: { scale: 1, opacity: finalStyle.baseStrich.opacity },
        delay: index * 50
      });

      return (
        <animated.div
          key={`strich-${index}`}
          style={{
            position: 'absolute',
            left: `${basePosition + (isDiagonal ? finalStyle.diagonalStrich.offset.x : 0)}px`,
            top: isDiagonal ? `${finalStyle.diagonalStrich.offset.y}px` : 0,
            width: finalStyle.baseStrich.width,
            height: isDiagonal ? finalStyle.diagonalStrich.length : finalStyle.baseStrich.length,
            backgroundColor: finalStyle.baseStrich.color,
            opacity: springProps.opacity,
            transform: isDiagonal 
              ? `rotate(${finalStyle.diagonalStrich.angle}deg)`
              : 'none',
            transformOrigin: isDiagonal ? 'top left' : 'center',
            transition: 'height 0.2s ease-in-out, transform 0.2s ease-in-out'
          }}
        />
      );
    });
  };

  return (
    <StrichContainerStyled type={type}>
      {renderStriche()}
    </StrichContainerStyled>
  );
};

export default StrichDisplay;