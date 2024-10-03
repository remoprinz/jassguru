import React from 'react';

interface ZShapeProps {
  className?: string;
  diagonalStrokeWidth?: number;
  width?: string;
  margin?: string;
}

const ZShape: React.FC<ZShapeProps> = ({ 
  className, 
  diagonalStrokeWidth = 0.7,
  width = '100%',
  margin = '0'
}) => {
  return (
    <svg 
      className={className}
      viewBox="0 0 120 100" 
      preserveAspectRatio="xMidYMid meet"
    >
      <path d="M0 0 L110 0" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M0 100 L110 0" stroke="currentColor" strokeWidth={diagonalStrokeWidth} fill="none" />
      <path d="M0 100 L110 100" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
};

export default ZShape;