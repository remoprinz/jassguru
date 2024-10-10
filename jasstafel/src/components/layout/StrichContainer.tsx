import React from 'react';
import { styled } from '@mui/material/styles';

interface StrichContainerProps {
  position: 'top' | 'bottom';
  score: number;
  onStrichClick: (value: number) => void;
  middleLinePosition: number;
}

interface BoxConfig {
  height: string;
  top?: string;
  bottom?: string;
  left?: string;
  width?: string;
  transform?: string;
  transformOrigin?: string;
}

const Container = styled('div')({
  position: 'absolute',
  width: '100%',
  height: '88%',
  top: 16,
  left: 0,
  pointerEvents: 'none',
});

const XContainer = styled('div')({
  position: 'absolute',
  width: '80%',
  height: '100%',
  left: '-5%',
  top: '0',
  pointerEvents: 'auto',
  border: '1px solid rgba(255, 255, 255, 0.3)', // Um den Container sichtbar zu machen
  maxWidth: '350px', // Maximale Breite festlegen
  margin: '0 auto', // Zentrieren des Containers
  right: '-5%', // Rechte Seite anpassen, um die Zentrierung zu gewährleisten
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
  ...(customStyle as React.CSSProperties),
}));

const BoxLabel = styled('span')({
  position: 'absolute',
  right: '10px',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'rgba(255, 255, 255, 0.8)',
  fontSize: '16px',
  fontWeight: 'bold',
});

const calculateBoxConfigs = (diagonalAngle: number = -45): Record<string, BoxConfig> => {
  return {
    '100er': {
      height: '20%',
      top: '0%',
      left: '0%',
      width: '100%',
    },
    '50er': {
      height: '20%',
      top: '70%',
      left: '6%',
      width: '110%',
      transform: `rotate(${diagonalAngle}deg)`,
      transformOrigin: 'top left',
    },
    '20er': {
      height: '20%',
      bottom: '0%',
      left: '5%',
      width: '93%',
    },
  };
};

const StrichContainer: React.FC<StrichContainerProps> = ({ position, score, onStrichClick, middleLinePosition }) => {
  const diagonalAngle = -43; // Hier können Sie den Winkel anpassen
  const boxConfigs = calculateBoxConfigs(diagonalAngle);

  return (
    <Container>
      <XContainer>
        {Object.entries(boxConfigs).map(([boxType, config]) => (
          <StrichBox key={boxType} customStyle={config}>
            <BoxLabel>{`${boxType} Box`}</BoxLabel>
          </StrichBox>
        ))}
      </XContainer>
    </Container>
  );
};

export default StrichContainer;