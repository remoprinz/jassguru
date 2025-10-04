'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { SCREENSHOT_DATA } from '@/constants/screenshotData';
import { Loader2 } from 'lucide-react';

// Type für einen Zug-Wagen
interface TrainWagon {
  screenshot: typeof SCREENSHOT_DATA[0];
  position: number; // -1 = oben, 0 = mitte, 1 = unten
  index: number;
}

const ScreenshotPreview: React.FC = () => {
  const [trainPosition, setTrainPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // ✅ SORTIERE SCREENSHOTS EINMALIG NACH ORDER! 
  // 0a_Jassstarten.PNG (order: 1) MUSS ZUERST KOMMEN!
  const sortedScreenshots = useMemo(() => {
    return [...SCREENSHOT_DATA].sort((a, b) => a.order - b.order);
  }, []); // Nur EINMAL beim Mount!

  // ENDLOSER ZUG: 8 Sek stehen → 600ms ELASTIC SCHWUB! → 8 Sek stehen → ...
  useEffect(() => {
    const interval = setInterval(() => {
      setTrainPosition(prev => prev + 1);
    }, 8600); // 8000ms stehen + 600ms elastic animation = 8600ms gesamt

    return () => clearInterval(interval);
  }, []);

  // Berechne welche "Wagen" (Screenshots) gerade sichtbar sind
  const getVisibleWagons = (): TrainWagon[] => {
    const wagons: TrainWagon[] = [];
    const totalWagons = sortedScreenshots.length;
    
    // ✅ KRITISCH: Zeige immer 3 Wagen!
    // Da der Zug mit translateY(-1 Wagen) startet, ist position: -1 IM SICHTFENSTER!
    // BEI trainPosition = 0:
    //   - position: -1 → wagonIndex = 0 (0a_jassstarten) ← IM VIEWPORT SICHTBAR!
    //   - position:  0 → wagonIndex = 1 (nächster, unten abgeschnitten)
    //   - position:  1 → wagonIndex = 2 (übernächster, noch weiter unten)
    for (let i = -1; i <= 1; i++) {
      // WICHTIG: +1 zum trainPosition damit bei trainPosition=0 der Index auch 0 ist (nicht -1)!
      const wagonIndex = (trainPosition + 1 + i + totalWagons) % totalWagons;
      wagons.push({
        screenshot: sortedScreenshots[wagonIndex], // ✅ Verwende sortierte Liste!
        position: i, // -1 = SICHTBAR, 0 = nächster, 1 = übernächster
        index: wagonIndex
      });
    }
    
    return wagons;
  };

  const visibleWagons = getVisibleWagons();
  const wagonHeight = 76; // vh - GRÖSSER für mehr Impact & Sichtbarkeit!
  const wagonSpacing = 4; // vh

  return (
    <div className="w-full flex items-start justify-center pt-16">
      {/* ZUG-SICHTFENSTER - zeigt nur den mittleren Bereich */}
      <div 
        className="relative overflow-hidden rounded-lg"
        style={{ 
          height: `${wagonHeight}vh`,
          width: 'fit-content', // WICHTIG: Passt sich der Bildgröße an!
          minWidth: '400px' // GRÖSSERE Minimum-Breite für bessere Sichtbarkeit!
        }}
      >
        {/* ENDLOSER ZUG - ELASTIC ANIMATION (STATE-OF-THE-ART!) */}
        <motion.div
          key={Math.floor(trainPosition)} // Reset bei jedem Wagen-Wechsel
          initial={{ y: 0 }}
          animate={{ 
            y: `${(wagonHeight + wagonSpacing)}vh` // Fährt EINEN Wagen nach unten
          }}
          transition={{ 
            duration: 0.5, // 600ms für smooth & sophisticated animation
            ease: [0.25, 1.42, 0.75, 1], // Weniger Overshoot + schnellerer Snapback! 🎯
            delay: 0 // Keine Verzögerung, fährt sofort los
          }}
          className="relative"
          style={{
            transform: `translateY(-${(wagonHeight + wagonSpacing)}vh)` // Startet EINEN Wagen ÜBER dem Sichtfenster
          }}
        >
          {visibleWagons.map((wagon, idx) => (
            <div
              key={`wagon-${wagon.index}-${Math.floor(trainPosition)}`}
              className="absolute left-0"
              style={{
                top: `${wagon.position * (wagonHeight + wagonSpacing)}vh`,
                height: `${wagonHeight}vh`,
                width: '100%'
              }}
            >
              <Image
                src={wagon.screenshot.src}
                alt={wagon.screenshot.title}
                width={800}
                height={1000}
                className="object-contain rounded-lg shadow-2xl w-full h-full"
                unoptimized
                priority={wagon.position === 0} // Nur der mittlere Wagen hat Priorität
                onLoad={() => {
                  if (wagon.position === 0 && isLoading) {
                    setIsLoading(false);
                  }
                }}
              />
            </div>
          ))}
        </motion.div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-700 rounded-lg z-10">
            <Loader2 className="w-12 h-12 animate-spin text-yellow-600" />
          </div>
        )}
      </div>
    </div>
  );
};

export default ScreenshotPreview;

