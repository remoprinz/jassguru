import React from 'react';
import { styled } from '@mui/material/styles';

const StrichContainer = styled('div')({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
});

const Strich = styled('div')({
  width: '2px',
  height: '20px',
  backgroundColor: '#ffffff',
  margin: '0 2px',
});

interface RoemischeZahlenProps {
  wert: number;
  typ: 'hundert' | 'fuenfzig' | 'zwanzig';
}

const RoemischeZahlen: React.FC<RoemischeZahlenProps> = ({ wert, typ }) => {
  const einheitWert = typ === 'hundert' ? 100 : typ === 'fuenfzig' ? 50 : 20;
  const anzahlStriche = Math.floor(wert / einheitWert);

  return (
    <StrichContainer>
      {[...Array(anzahlStriche)].map((_, index) => (
        <Strich key={index} />
      ))}
    </StrichContainer>
  );
};

export default RoemischeZahlen;