import React from 'react';

interface ZShapeProps {
  className?: string;
  diagonalStrokeWidth?: number;
}

const ZShape: React.FC<ZShapeProps> = ({ className, diagonalStrokeWidth = 0.7 }) => {
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d="M0 0 L100 0" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="M0 100 L100 0" stroke="currentColor" strokeWidth={diagonalStrokeWidth} fill="none" />
      <path d="M0 100 L100 100" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
};

export default ZShape;