import React, { useMemo, useEffect, useState } from 'react';
import ZShape from './ZShape';
import useViewportHeight from '../../hooks/useViewportHeight';

interface JassKreidetafelProps {
  middleLineThickness?: number;
  zShapeConfig: {
    innerSpacing: number;
    sideSpacing: number;
    edgeSpacing: number;
  };
}

const isPWA = () => {
  return window.matchMedia('(display-mode: standalone)').matches ||
         (window.navigator as any).standalone ||
         document.referrer.includes('android-app://');
};

const JassKreidetafel: React.FC<JassKreidetafelProps> = ({
  middleLineThickness = 3,
  zShapeConfig
}) => {
  const viewportHeight = useViewportHeight();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { topContainerHeight, bottomContainerHeight, middleLinePosition } = useMemo(() => {
    if (typeof window === 'undefined' || !mounted) {
      return { topContainerHeight: 0, bottomContainerHeight: 0, middleLinePosition: 0 };
    }
    
    const safeAreaTop = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top') || '0');
    const safeAreaBottom = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom') || '0');
    
    const adjustedViewportHeight = viewportHeight - safeAreaTop - safeAreaBottom;
    const middleLinePosition = Math.floor(adjustedViewportHeight / 2) + safeAreaTop;
    const availableHeight = adjustedViewportHeight - middleLineThickness;
    const halfHeight = Math.floor(availableHeight / 2);
    
    return {
      topContainerHeight: halfHeight,
      bottomContainerHeight: halfHeight,
      middleLinePosition
    };
  }, [viewportHeight, middleLineThickness, mounted]);

  if (!mounted) {
    return null; // oder ein Lade-Indikator
  }

  const containerStyle: React.CSSProperties = {
    width: '100%',
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'visible'
  };

  const zShapeStyle: React.CSSProperties = {
    position: 'absolute',
    width: '110%', // Erhöhen Sie diesen Wert, um die Z-Formen breiter zu machen
    left: '-1.5%', // Passen Sie diesen Wert an, um die breiteren Z-Formen zu zentrieren
  };

  const topZShapeStyle: React.CSSProperties = {
    ...zShapeStyle,
    bottom: `${zShapeConfig.innerSpacing}px`,
    height: `calc(100% - ${zShapeConfig.edgeSpacing + zShapeConfig.innerSpacing}px)`,
  };

  const bottomZShapeStyle: React.CSSProperties = {
    ...zShapeStyle,
    top: `${zShapeConfig.innerSpacing}px`,
    height: `calc(100% - ${zShapeConfig.edgeSpacing + zShapeConfig.innerSpacing}px)`,
  };

  const middleLineStyle: React.CSSProperties = {
    position: 'absolute',
    top: `${middleLinePosition}px`,
    left: '5%',
    right: '5%',
    height: `${middleLineThickness}px`,
    transform: 'translateY(-50%)',
  };

  return (
    <div className="w-full h-full bg-black relative" style={{ height: `${viewportHeight}px` }}>
      <div style={{ ...containerStyle, top: 0, height: `${topContainerHeight}px`, paddingTop: 'env(safe-area-inset-top)' }}>
        <div style={topZShapeStyle}>
          <ZShape className="w-full h-full text-chalk-red" diagonalStrokeWidth={0.6} />
        </div>
      </div>
      <div style={middleLineStyle} className="bg-chalk-red" />
      <div style={{ ...containerStyle, bottom: 0, height: `${bottomContainerHeight}px`, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div style={bottomZShapeStyle}>
          <ZShape className="w-full h-full text-chalk-red" diagonalStrokeWidth={0.6} />
        </div>
      </div>
    </div>
  );
};

export default JassKreidetafel;