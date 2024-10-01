import React, { useEffect, useRef, useState } from 'react';
import ZShape from './ZShape';

interface JassKreidetafelProps {
  middleLineThickness?: number; // Dicke der Mittellinie in Pixeln
  verticalSpacing?: number; // Abstand zur Mittellinie (0-100%)
  horizontalSpacing?: number; // Seitlicher Abstand (0-100%)
  topBottomSpacing?: number; // Abstand zum oberen/unteren Rand (0-100%)
}

const JassKreidetafel: React.FC<JassKreidetafelProps> = ({
  middleLineThickness = 3,
  verticalSpacing = 5,
  horizontalSpacing = 2,
  topBottomSpacing = 10
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const halfHeight = dimensions.height / 2;
  const zShapeHeight = halfHeight - middleLineThickness / 2 - (dimensions.height * verticalSpacing / 100);

  const zShapeStyle: React.CSSProperties = {
    height: `${zShapeHeight}px`,
    width: `calc(100% - ${horizontalSpacing * 2}%)`,
    marginLeft: `${horizontalSpacing}%`,
    marginRight: `${horizontalSpacing}%`,
  };

  const topZShapeStyle: React.CSSProperties = {
    ...zShapeStyle,
    marginTop: `${topBottomSpacing}%`,
    marginBottom: `${verticalSpacing}%`,
  };

  const bottomZShapeStyle: React.CSSProperties = {
    ...zShapeStyle,
    marginTop: `${verticalSpacing}%`,
    marginBottom: `${topBottomSpacing}%`,
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-black flex flex-col justify-center items-center">
      <div style={topZShapeStyle}>
        <ZShape className="w-full h-full text-chalk-red" diagonalStrokeWidth={0.6} />
      </div>
      <div style={{ height: `${middleLineThickness}px`, width: '96%' }} className="bg-chalk-red" />
      <div style={bottomZShapeStyle}>
        <ZShape className="w-full h-full text-chalk-red" diagonalStrokeWidth={0.6} />
      </div>
    </div>
  );
};

export default JassKreidetafel;