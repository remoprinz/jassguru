import React from 'react';

interface StrichDisplayProps {
  type: 'vertikal' | 'horizontal';
  count: number;
  size?: {
    width: number;
    height: number;
  };
  color?: string;
  className?: string;
  spacing?: number;
  diagonalWidth?: number;
}

const StrichDisplay: React.FC<StrichDisplayProps> = ({
  type,
  count,
  size = { width: 0, height: 0 },
  color = 'white',
  className = '',
  spacing = 3,
  diagonalWidth = 5
}) => {
  const renderStriche = () => {
    const fullGroups = Math.floor(count / 5);
    const remainder = count % 5;

    const striche = [];

    for (let i = 0; i < fullGroups; i++) {
      striche.push(
        <div key={`group-${i}`} className="relative" style={{ height: `${size.height * 5}px` }}>
          {[0, 1, 2, 3].map((_, index) => (
            <div
              key={`strich-${i}-${index}`}
              style={{
                width: `${size.width}px`,
                height: `${size.height}px`,
                backgroundColor: color,
                margin: `${spacing}px`,
                position: 'absolute',
                top: `${index * (size.height + spacing)}px`
              }}
            />
          ))}
          <div
            style={{
              width: `${diagonalWidth}px`,
              height: `${size.height * 4}px`,
              backgroundColor: color,
              margin: `${spacing}px`,
              position: 'absolute',
              transform: 'rotate(45deg)',
              transformOrigin: 'left bottom',
              top: '0px'
            }}
          />
        </div>
      );
    }

    for (let i = 0; i < remainder; i++) {
      striche.push(
        <div
          key={`remainder-${i}`}
          style={{
            width: `${size.width}px`,
            height: `${size.height}px`,
            backgroundColor: color,
            margin: `${spacing}px`,
            display: 'block'
          }}
        />
      );
    }

    return striche;
  };

  return (
    <div className={`flex ${type === 'horizontal' ? 'flex-col' : 'flex-row'} ${className}`}>
      {renderStriche()}
    </div>
  );
};

export default StrichDisplay;