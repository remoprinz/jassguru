import React, { useMemo, useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions,
  Chart as ChartInstanceType
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { getRankingColor, WIN_LOSS_COLORS } from '../../config/chartColors';
import { abbreviatePlayerName } from '../../utils/formatUtils';

// Registriere Chart.js Komponenten (NICHT ChartDataLabels global!)
ChartJS.register(ArcElement, Tooltip, Legend);

export interface PieChartData {
  labels: string[];
  values: number[];
  backgroundColor?: string[];
  borderColor?: string[];
  borderWidth?: number;
  pictogramPaths?: string[]; // ✅ NEU: Pfade zu Bild-Pictogrammen
  percentages?: number[]; // ✅ NEU: Vorgefertigte Prozentsätze
}

export interface PieChartProps {
  data: PieChartData;
  title?: string;
  height?: number;
  isDarkMode?: boolean;
  centerText?: string;
  hideLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  activeTab?: string; // ✅ NEU: Für Animation-Reset wie bei PowerRatingChart
  activeSubTab?: string; // ✅ NEU: Für Sub-Tab-Reset wie bei PowerRatingChart
  animateImmediately?: boolean; // 🚀 NEU: Für sofortige Animation (ohne Intersection Observer)
}

const PieChart: React.FC<PieChartProps> = ({
  data,
  title,
  height = 300,
  isDarkMode = true,
  centerText,
  hideLegend = false,
  legendPosition = 'top',
  activeTab,
  activeSubTab,
  animateImmediately = false, // 🚀 NEU: Standardmäßig false (Intersection Observer)
}) => {
  // <<< WICHTIG: ref auf Container -> Intersection Observer überwacht diesen
  const containerRef = useRef<HTMLDivElement>(null);
  // <<< WICHTIG: ref auf Chart.js Instanz (react-chartjs-2 liefert das über ref)
  const chartInstanceRef = useRef<ChartInstanceType | null>(null);
  // <<< WICHTIG: Animation nur ein einziges Mal abspielen
  const [animationPlayed, setAnimationPlayed] = useState<boolean>(false);


  // ✅ NEU: State für sequenzielle Slice-Animation im Uhrzeigersinn
  const [animatedSlices, setAnimatedSlices] = useState<number[]>([]);
  // ✅ NEU: State für Icon/Label-Einblendung
  const [showLabels, setShowLabels] = useState<boolean>(false);
  
  // Reset wenn Tab wechselt
  useEffect(() => {
    setAnimatedSlices([]);
    setAnimationPlayed(false);
    setShowLabels(false);
  }, [activeTab, activeSubTab]);
  
  // Sequenzieller Aufbau: Füge Slice für Slice hinzu (im Uhrzeigersinn)
  useEffect(() => {
    if (!animationPlayed) return;
    
    const timeouts: NodeJS.Timeout[] = [];
    
    // Starte sequenzielle Animation
    data.values.forEach((value, index) => {
      if (value > 0) {
        const timeout = setTimeout(() => {
          setAnimatedSlices((prev) => [...prev, index]);
        }, index * 35); // 35ms Verzögerung pro Slice
        timeouts.push(timeout);
      }
    });
    
    // ✅ Blende Icons/Labels KURZ VOR letztem Slice ein
    const nonZeroIndices = data.values.map((v, i) => v > 0 ? i : -1).filter(i => i >= 0);
    const maxNonZeroIndex = nonZeroIndices.length > 0 ? Math.max(...nonZeroIndices) : 0;
    const lastTimeout = setTimeout(() => {
      setShowLabels(true);
    }, Math.max(0, maxNonZeroIndex * 35 - 5)); // 150ms VOR letztem Slice
    timeouts.push(lastTimeout);
    
    // Cleanup
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
    };
  }, [animationPlayed, data.values]);

  // Chart-Daten mit nur den animierten Slices
  const chartData = useMemo(() => ({
    labels: data.labels.map(label => abbreviatePlayerName(label)), // ✅ Abkürze Namen
    datasets: [
      {
        data: data.values.map((value, index) => 
          animatedSlices.includes(index) ? value : 0
        ),
        // 🎯 Verwende data.backgroundColor falls vorhanden, sonst Ranking-Farben
        backgroundColor: data.backgroundColor || data.values.map((_, index) => 
          getRankingColor(index + 1, 1)
        ),
        borderColor: data.borderColor || '#292524',
        borderWidth: data.borderWidth || 2
      }
    ]
  }), [data, animatedSlices]);

  // Chart-Optionen
  const options = useMemo<ChartOptions<'doughnut'>>(() => {
    return {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      cutout: '50%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: false
        },
        datalabels: {
          display: false
        }
      },
      // <<< WICHTIG: Schnelle Animation für jeden Slice
      animation: {
        duration: 200, // Sehr schnell (250ms → 200ms)
        animateRotate: true,
        animateScale: false,
      },
      elements: {
        arc: {
          borderWidth: 3,
          borderColor: isDarkMode ? '#292524' : '#ffffff'
        }
      },
      onHover: (event: any, activeElements: any[]) => {
        // Hover-Handler für besseres UX
      }
    };
  }, [isDarkMode]);

  /**
   * <<< WICHTIG: Diese Funktion löst die sequenzielle Animation aus
   * Startet den Slice-für-Slice Aufbau im Uhrzeigersinn
   * Nur einmal ausführen
   * 🔧 FIX: Aktualisiere chartSize UNMITTELBAR VOR Animation (nach Layout-Stabilisierung)
   */
  const triggerVisibleAnimation = useCallback(() => {
    if (animationPlayed) return;
    
    // 🚨 CRITICAL FIX: IMMER chartSize setzen wenn Animation startet
    // (egal ob frozen oder nicht - sichert dass chartSize während Animation gesetzt ist)
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      
      // 🎯 FIX: Prüfe ob Container wirklich sichtbar ist (offsetWidth > 0)
      // Verhindert Animation bei display:none Tabs (Race Condition)
      if (containerWidth === 0) {
        console.warn('[PieChart] Container nicht sichtbar (width=0), Animation abgebrochen');
        return; // Warte bis Container sichtbar ist
      }
      
      const newSize = Math.min(containerWidth * 0.55, 180);
      
      // Nur einfrieren wenn noch nicht frozen (GroupView-Fix)
      if (!isFrozenRef.current) {
        setChartSize(newSize);
        frozenSizeRef.current = newSize;
        isFrozenRef.current = true;
      } else {
        // Wenn schon frozen (GroupView): Verwende frozen Size (verhindert Wachstum)
        setChartSize(frozenSizeRef.current);
      }
    }
    
    setAnimationPlayed(true);
  }, [animationPlayed]);

  /**
   * <<< WICHTIG: Intersection Observer
   * - Wenn animateImmediately=true, direkt nach Mount animieren
   * - Wenn animateImmediately=false, erst wenn mind. 70% sichtbar
   */
  useEffect(() => {
    if (animationPlayed) return; // schon abgespielt? dann nichts mehr
    if (animateImmediately) {
      // Direkt nach Mount animieren
      triggerVisibleAnimation();
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // 🎯 FIX: Prüfe ob Element wirklich sichtbar ist (nicht nur intersecting, sondern auch CSS-visible)
        if (entry.target && entry.target instanceof Element) {
          const element = entry.target as HTMLElement;
          const computedStyle = window.getComputedStyle(element);
          const isVisible = computedStyle.display !== 'none' && 
                           computedStyle.visibility !== 'hidden' &&
                           computedStyle.opacity !== '0';
          
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7 && !animationPlayed && isVisible) {
            triggerVisibleAnimation();
          }
        }
      },
      { threshold: 0.7 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [animateImmediately, animationPlayed, triggerVisibleAnimation]);

  // ✅ Responsive: Passe Größe an tatsächliche Container-Breite an
  const [chartSize, setChartSize] = useState(300);
  // 🚨 FIX: Size-Einfrier-Reference (verhindert Wachstum bei Scroll/Layout-Änderung)
  const frozenSizeRef = useRef<number | null>(null);
  const isFrozenRef = useRef(false);
  
  // 🚨 CRITICAL FIX: Verwende useLayoutEffect für SYNCHRONE Layout-Messung
  // (MISST vor Paint, dadurch stabilere Container-Größe)
  useLayoutEffect(() => {
    const updateChartSize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        
        // 🎯 FIX: Nur messen und einfrieren wenn Container wirklich sichtbar ist
        // Verhindert falsches Einfrieren bei display:none Tabs
        if (containerWidth === 0) {
          return; // Warte bis Container sichtbar ist
        }
        
        // Verwende 60% der Container-Breite mit max 180px für mehr Padding UND Platz für Labels außerhalb
        const newSize = Math.min(containerWidth * 0.55, 180);
        
        // 🚨 CRITICAL FIX: Nur beim ersten stabilen Render einfrieren
        if (!isFrozenRef.current) {
          setChartSize(newSize);
          frozenSizeRef.current = newSize;
          isFrozenRef.current = true;  // 🔒 EINMALIG EINFRIEREN!
        } else {
          // Nach dem Einfrieren: Nur bei echtem window.resize neu setzen (große Änderung)
          // Kleine Änderungen durch Scroll/Layout ignorieren
          const currentFrozen = frozenSizeRef.current || 0;
          if (Math.abs(newSize - currentFrozen) > 10) {
            // Nur bei >10px Unterschied updaten (echter Resize)
            setChartSize(newSize);
            frozenSizeRef.current = newSize;
          }
        }
      }
    };
    
    updateChartSize();
    
    // Nur auf ECHTEN window.resize hören (nicht auf Container-Änderungen durch Scroll)
    const handleResize = () => {
      updateChartSize();
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [height]);

  
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  
  // Prozent-Anzeige / Icons im Donut
  const total = data.values.reduce((sum, val) => sum + val, 0);
  
  return (
    <div 
      ref={containerRef} // <<< WICHTIG: Observer hängt an diesem Container
      className="relative w-full flex items-center justify-center" 
      style={{ minHeight: `${height}px` }}
    >
      {/* ✅ Chart Container mit dynamischer Größe */}
      <div className="relative mx-auto" style={{ width: `${chartSize}px`, height: `${chartSize}px` }}>
        <Doughnut 
          ref={chartInstanceRef as any} // <<< Type-Cast für react-chartjs-2 Ref
          data={chartData} 
          options={options}
          plugins={[ChartDataLabels]} 
        />
        
        {/* ✅ Icons/Labels um den Donut herum */}
        {!hideLegend && (
          <div className="absolute inset-0">
            {data.labels.map((label, idx) => {
              if (data.values[idx] === 0) return null;
              
              const abbreviatedLabel = abbreviatePlayerName(label); // ✅ Abkürze Namen
              
              // Berechne korrekten Winkel für Slice-Mittelpunkt
              let startAngle = 0;
              for (let i = 0; i < idx; i++) {
                startAngle += (data.values[i] / total) * 360;
              }
              const sliceAngle = (data.values[idx] / total) * 360;
              const middleAngle = startAngle + (sliceAngle / 2);
              const angleRad = (middleAngle - 90) * (Math.PI / 180);
              
              const pictogramPath = data.pictogramPaths?.[idx];
              const pct = data.percentages ? data.percentages[idx] : (data.values[idx] / total) * 100;
              const absoluteValue = data.values[idx];
              
              // 🎯 LOGIK: Ohne Pictogrammen → immer sichtbar. Mit Pictogrammen → nur nach Animation.
              const hasPictograms = data.pictogramPaths?.some(path => path);
              const shouldShow = hasPictograms ? showLabels : true;
              
              // ✅ Individueller Radius: Trumpfansagen (mit Pictogramm) = 55%, Siegquoten (ohne Pictogramm) = 70%
              const radius = pictogramPath ? chartSize * 0.65 : chartSize * 0.7;
              const x = Math.cos(angleRad) * radius;
              const y = Math.sin(angleRad) * radius;
              
              return (
                  <div
                    key={idx}
                    className={`absolute flex flex-col items-center justify-center transition-opacity duration-300 ${shouldShow ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                      left: `calc(50% + ${x}px)`,
                      top: `calc(50% + ${y}px)`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  >
                    {/* ✅ Pictogramm - nur wenn vorhanden (Trumpfansagen-Charts) */}
                    {pictogramPath && (
                      <img 
                        src={pictogramPath} 
                        alt={abbreviatedLabel}
                        className={`${isMobile ? 'w-6 h-6' : 'w-8 h-8'} object-contain mb-0.5`}
                      />
                    )}
                    
                    {/* ✅ MIT Pictogramm: Prozent unter Icon (Trumpfansagen-Charts) */}
                    {pictogramPath && pct >= 2 && (
                      <span className={`text-white ${isMobile ? 'text-xs' : 'text-sm'} font-medium whitespace-nowrap`}>
                        {pct.toFixed(1)}%
                      </span>
                    )}
                    
                    {/* ✅ OHNE Pictogramm: Absolute Zahl über Prozent (Siegquoten-Charts) */}
                    {!pictogramPath && (
                      <div className="flex flex-col items-center whitespace-nowrap">
                        {/* Absolute Zahl: größer und weiß */}
                        <span className="text-gray-400" style={{ fontSize: isMobile ? '14px' : '18px' }}>
                          ({absoluteValue})
                        </span>
                        {/* Prozent: dezenter und kleiner */}
                        <span className="text-white font-medium" style={{ fontSize: isMobile ? '14px' : '16px' }}>
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
        
        {centerText && (
          <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none text-center transition-opacity duration-300 ${showLabels ? 'opacity-100' : 'opacity-0'}`}>
            <p className={`text-white ${isMobile ? 'text-lg' : 'text-xl'} font-medium`}>{centerText}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PieChart;

