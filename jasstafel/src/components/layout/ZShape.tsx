import React, { useRef, useEffect } from 'react';

interface ZShapeProps {
  className?: string;
  diagonalStrokeWidth?: number;
  position: 'top' | 'bottom';
  isReversed: boolean;
  onShapeRendered?: (dimensions: { width: number; height: number; left: number; top: number }) => void;
}

const ZShape: React.FC<ZShapeProps> = ({ 
  className, 
  diagonalStrokeWidth = 0.5,
  position,
  isReversed,
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

  return (
    <svg 
      ref={svgRef}
      className={className}
      viewBox="0 0 120 100" 
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={position === 'top' ? 'scale(1, -1) translate(0, -100)' : 'none'}>
        <path d="M0 0 L110 0" stroke="currentColor" strokeWidth="1" fill="none" />
        <path d="M0 100 L110 0" stroke="currentColor" strokeWidth={diagonalStrokeWidth} fill="none" />
        <path d="M0 100 L110 100" stroke="currentColor" strokeWidth="1" fill="none" />
      </g>
    </svg>
  );
};

export default ZShape;