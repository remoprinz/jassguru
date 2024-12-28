import React, { useRef, useEffect } from 'react';

interface ZShapeProps {
  className?: string;
  outerStrokeWidth?: number;
  diagonalStrokeWidth?: number;
  position: 'top' | 'bottom';
  isReversed: boolean;
  onShapeRendered?: (dimensions: { width: number; height: number; left: number; top: number }) => void;
}

const ZShape: React.FC<ZShapeProps> = ({ 
  className, 
  outerStrokeWidth = 2,
  diagonalStrokeWidth = 0.75,
  position,
  onShapeRendered
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && onShapeRendered) {
      const rect = svgRef.current.getBoundingClientRect();
      onShapeRendered({
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top
      });
    }
  }, [onShapeRendered]);

  // Kompensationsfaktor für die diagonale Linie
  const diagonalCompensation = Math.sqrt(2);

  return (
    <svg 
      ref={svgRef}
      className={className}
      viewBox="0 0 120 100" 
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={position === 'top' ? 'translate(0, 0)' : 'none'}>
        <path d="M0 0 L110 0" stroke="currentColor" strokeWidth={outerStrokeWidth} fill="none" />
        <path d="M0 100 L110 0" stroke="currentColor" strokeWidth={diagonalStrokeWidth * diagonalCompensation} fill="none" />
        <path d="M0 100 L110 100" stroke="currentColor" strokeWidth={outerStrokeWidth} fill="none" />
      </g>
    </svg>
  );
};

export default ZShape;