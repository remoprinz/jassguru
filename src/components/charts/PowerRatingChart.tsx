import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartConfiguration
} from 'chart.js';

// Registriere Chart.js Komponenten
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PowerRatingChartProps {
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      borderColor: string;
      backgroundColor: string;
      playerId?: string;
      displayName?: string;
      tension?: number;
      pointRadius?: number;
      pointHoverRadius?: number;
    }[];
  };
  title?: string;
  height?: number;
  theme?: string;
  isDarkMode?: boolean;
  hideLegend?: boolean; // ✅ NEU: Für ProfileView ohne Legende
  showBaseline?: boolean; // 🎯 NEU: Steuert ob 100er-Linie angezeigt wird
  activeTab?: string; // ✅ NEU: Für Tab-Wechsel-Reset der Animationen
  activeSubTab?: string; // ✅ NEU: Für Sub-Tab-Wechsel-Reset der Animationen
}

export const PowerRatingChart: React.FC<PowerRatingChartProps> = ({
  data,
  title = "Elo-Rating",
  height = 400,
  theme = 'blue',
  isDarkMode = true,
  hideLegend = false, // ✅ NEU: Standardmäßig Legende anzeigen
  showBaseline = true, // 🎯 NEU: Standardmäßig true für ProfileView
  activeTab, // ✅ NEU: Tab-Wechsel-Reset
  activeSubTab, // ✅ NEU: Sub-Tab-Wechsel-Reset
}) => {
    // 🎯 INTELLIGENTE ANIMATION-KONTROLLE: Intersection Observer + Tab-Wechsel-Reset
    const [hasAnimated, setHasAnimated] = React.useState(false);
    const [isVisible, setIsVisible] = React.useState(false);
    const [shouldRender, setShouldRender] = React.useState(false); // ✅ NEU: Kontrolliert ob Chart gerendert werden soll
    const chartRef = React.useRef<HTMLDivElement>(null);

    // ✅ Tab-Wechsel-Reset: Animation und Rendering zurücksetzen bei Tab-Wechsel
    React.useEffect(() => {
      setHasAnimated(false);
      setIsVisible(false);
      setShouldRender(false); // ✅ Chart wird nicht mehr gerendert
    }, [activeTab, activeSubTab]);

    // ✅ Intersection Observer: Rendering und Animation nur bei vollständig sichtbaren Charts
    React.useEffect(() => {
      if (!chartRef.current) return;
      
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting) {
            setIsVisible(true);
            setShouldRender(true); // ✅ Chart wird gerendert
            // Animation nur starten wenn Chart vollständig sichtbar UND noch nicht animiert
            if (!hasAnimated) {
              setTimeout(() => setHasAnimated(true), 50); // 50ms Verzögerung für smooth Animation
            }
          } else {
            setIsVisible(false);
            // ✅ Optional: Chart nicht mehr rendern wenn nicht sichtbar (für Performance)
            // setShouldRender(false);
          }
        },
        { 
          threshold: 1.0, // ✅ Vollständig sichtbar (100%)
          rootMargin: '0px' // ✅ Kein Vorlauf - erst wenn komplett sichtbar
        }
      );
      
      observer.observe(chartRef.current);
      return () => observer.disconnect();
    }, [hasAnimated, activeTab, activeSubTab]);

    // Theme-basierte Farben
  const getThemeColors = (themeKey: string) => {
    const themeColorMap: Record<string, { 
      text: string;
      grid: string;
      background: string;
    }> = {
      green: { 
        text: '#10b981',
        grid: 'rgba(16, 185, 129, 0.1)',
        background: 'rgba(16, 185, 129, 0.05)'
      },
      blue: { 
        text: '#3b82f6',
        grid: 'rgba(59, 130, 246, 0.1)',
        background: 'rgba(59, 130, 246, 0.05)'
      },
      purple: { 
        text: '#a855f7',
        grid: 'rgba(168, 85, 247, 0.1)',
        background: 'rgba(168, 85, 247, 0.05)'
      },
      yellow: { 
        text: '#eab308',
        grid: 'rgba(234, 179, 8, 0.1)',
        background: 'rgba(234, 179, 8, 0.05)'
      },
      orange: { 
        text: '#f97316',
        grid: 'rgba(249, 115, 22, 0.1)',
        background: 'rgba(249, 115, 22, 0.05)'
      },
      cyan: { 
        text: '#06b6d4',
        grid: 'rgba(6, 182, 212, 0.1)',
        background: 'rgba(6, 182, 212, 0.05)'
      },
      pink: { 
        text: '#ec4899',
        grid: 'rgba(236, 72, 153, 0.1)',
        background: 'rgba(236, 72, 153, 0.05)'
      },
      teal: { 
        text: '#14b8a6',
        grid: 'rgba(20, 184, 166, 0.1)',
        background: 'rgba(20, 184, 166, 0.05)'
      }
    };
    
    return themeColorMap[themeKey] || themeColorMap.blue;
  };

  const themeColors = getThemeColors(theme);

  // ✅ MEMOIZED OPTIONS: Verhindert Chart-Flackern durch stabile Referenzen
  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: hasAnimated ? 0 : 250, // 🎯 Nur beim ersten Laden animieren
      easing: 'easeOutQuart' as const, // 🎯 Schneller Start, sanfter End
      // ✅ Resize-Animation deaktivieren für smooth Chart-Updates
      resize: {
        duration: 0 // 🎯 Best Practice: Resize-Animation komplett deaktivieren
      },
      // ✅ Punkte starten von der Hauptlinie (100er bei Elo, 0er bei Strichdifferenz)
      x: {
        duration: hasAnimated ? 0 : 250,
        easing: 'easeOutQuart' as const,
        from: 0, // Start von links
        delay: 0,
      },
      y: {
        duration: hasAnimated ? 0 : 250,
        easing: 'easeOutQuart' as const,
        // 🎯 Start von der Hauptlinie: 100 für Elo-Charts, 0 für Strichdifferenz-Charts
        from: (context: { chart: { scales: { y: { min: number, max: number } } } }) => {
          const chart = context.chart;
          const yScale = chart.scales.y;
          
          // Bestimme die Hauptlinie basierend auf dem Chart-Typ
          if (showBaseline) {
            // Elo-Chart: Start von 100er-Linie
            return 100;
          } else {
            // Strichdifferenz-Chart: Start von 0er-Linie
            return 0;
          }
        },
        delay: 0,
      },
    },
    layout: {
      padding: {
        left: 4,   // ✅ Minimal für maximalen Platz links
        right: 2,  // ✅ NOCH WENIGER für maximalen Platz rechts
        top: 4,    // ✅ Reduziert von 8px für mehr Platz oben
        bottom: 2  // ✅ Reduziert für weniger Platz unten
      }
    },
    plugins: {
      legend: {
        display: !hideLegend, // ✅ Legende nur verstecken wenn hideLegend=true
        position: 'right' as const,
        labels: {
          color: isDarkMode ? '#e5e7eb' : '#374151',
          font: {
            size: 12,
            family: 'Inter, system-ui, sans-serif'
          },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 15,
        },
      },
      title: {
        display: false, // ✅ Titel entfernt - bereits oben vorhanden
      },
      tooltip: {
        backgroundColor: isDarkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDarkMode ? '#ffffff' : '#111827',
        bodyColor: isDarkMode ? '#e5e7eb' : '#374151',
        borderColor: themeColors.text,
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        titleFont: {
          size: 13,
          weight: 'bold' as const
        },
        bodyFont: {
          size: 12
        },
        callbacks: {
          title: function(context: any) {
            return `Datum: ${context[0].label}`;
          },
          label: function(context: any) {
            const dataset = context.dataset;
            const value = context.parsed.y;
            const playerName = dataset.displayName || dataset.label;
            
            // 🎯 KOMPAKTE TOOLTIP-WERTE: 1k, 2k, 10k statt 1000, 2000, 10000
            let formattedValue: string;
            if (Math.abs(value) >= 1000) {
              const kValue = value / 1000;
              formattedValue = `${kValue}k`; // ✅ IMMER "k" anhängen!
            } else {
              formattedValue = Math.round(value).toString();
            }
            
            return `${playerName}: ${formattedValue}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: false
        },
        grid: {
          color: isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(156, 163, 175, 0.3)',
          drawBorder: false,
        },
        ticks: {
          color: isDarkMode ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
            family: 'Inter, system-ui, sans-serif'
          },
          maxTicksLimit: 12, // Mehr Labels für bessere Übersicht
          callback: function(value: any, index: any, values: any) {
            // Zeige mehr Labels, aber nicht alle bei sehr vielen Datenpunkten
            const step = Math.max(1, Math.floor(values.length / 12));
            return index % step === 0 ? this.getLabelForValue(value) : '';
          }
        },
        // ✅ Letzten Datenpunkt auf vertikaler Linie positionieren
        offset: false
      },
        y: {
          display: true,
          title: {
            display: false, // ✅ Entfernt - selbsterklärend durch Chart-Titel
          },
        grid: {
          color: function(context: { tick?: { value: number } }) {
            // 🎯 ELO-CHART: Nur 100er-Linie weiß
            if (showBaseline && context.tick?.value === 100) {
              return isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
            }
            // 🎯 ALLE ANDEREN CHARTS: Nur 0er-Linie weiß
            if (!showBaseline && context.tick?.value === 0) {
              return isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
            }
            return isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(156, 163, 175, 0.3)';
          },
          drawBorder: false,
          drawOnChartArea: true, // ✅ Horizontale Linien durchziehen
          drawTicks: true,
        },
        ticks: {
          color: function(context: { tick?: { value: number } }) {
            // 🎯 ELO-CHART: Nur 100er-Label weiß
            if (showBaseline && context.tick?.value === 100) {
              return isDarkMode ? '#ffffff' : '#000000';
            }
            // 🎯 ALLE ANDEREN CHARTS: Nur 0er-Label weiß
            if (!showBaseline && context.tick?.value === 0) {
              return isDarkMode ? '#ffffff' : '#000000';
            }
            return isDarkMode ? '#9ca3af' : '#6b7280';
          },
          font: {
            size: 11,
            family: 'Inter, system-ui, sans-serif',
            weight: function(context: { tick?: { value: number } }) {
              // 🎯 ELO-CHART: Nur 100er-Label fett
              if (showBaseline && context.tick?.value === 100) return 'bold';
              // 🎯 ALLE ANDEREN CHARTS: Nur 0er-Label fett
              if (!showBaseline && context.tick?.value === 0) return 'bold';
              return 'normal';
            }
          },
          callback: function(this: any, tickValue: string | number) {
            const value = Number(tickValue);
            
            // 🎯 KOMPAKTE Y-ACHSE: 1k, 2k, 10k statt 1000, 2000, 10000
            if (Math.abs(value) >= 1000) {
              const kValue = value / 1000;
              return `${kValue}k`; // ✅ IMMER "k" anhängen!
            }
            
            return Math.round(value).toString();
          },
          stepSize: (() => {
            // 🎯 DYNAMISCHE SCHRITTGRÖSSE basierend auf Datenbereich
            const allValues = data.datasets.flatMap((d: { data: (number | null)[] }) => d.data).filter((v: number | null): v is number => v !== null);
            if (allValues.length === 0) return 10;
            
            const maxAbsValue = Math.max(...allValues.map(Math.abs));
            
            if (maxAbsValue >= 10000) return 2000; // 2k Schritte für sehr große Werte
            if (maxAbsValue >= 1000) return 500;  // 500er Schritte für große Werte
            if (maxAbsValue >= 500) return 100;    // 100er Schritte für mittlere Werte
            if (maxAbsValue >= 200) return 25;     // 25er Schritte für kleine Werte
            return 10; // 10er Schritte für sehr kleine Werte
          })()
        },
        min: (() => {
          // Dynamisches Minimum basierend auf tatsächlichen Daten
          const allValues = data.datasets.flatMap((d: { data: (number | null)[] }) => d.data).filter((v: number | null): v is number => v !== null);
          if (allValues.length === 0) return 70;
          const minValue = Math.min(...allValues);
          
          // 🎯 DYNAMISCHE MIN/MAX basierend auf Datenbereich
          const maxAbsValue = Math.max(...allValues.map(Math.abs));
          let stepSize: number;
          
          if (maxAbsValue >= 10000) stepSize = 2000;
          else if (maxAbsValue >= 1000) stepSize = 500;
          else if (maxAbsValue >= 500) stepSize = 100;
          else if (maxAbsValue >= 200) stepSize = 25;
          else stepSize = 10;
          
          // Runde auf nächste Schrittgröße abwärts und füge Puffer hinzu
          return Math.floor(minValue / stepSize) * stepSize - stepSize;
        })(),
        max: (() => {
          // Dynamisches Maximum basierend auf tatsächlichen Daten
          const allValues = data.datasets.flatMap((d: { data: (number | null)[] }) => d.data).filter((v: number | null): v is number => v !== null);
          if (allValues.length === 0) return 150;
          const maxValue = Math.max(...allValues);
          
          // 🎯 DYNAMISCHE MIN/MAX basierend auf Datenbereich
          const maxAbsValue = Math.max(...allValues.map(Math.abs));
          let stepSize: number;
          
          if (maxAbsValue >= 10000) stepSize = 2000;
          else if (maxAbsValue >= 1000) stepSize = 500;
          else if (maxAbsValue >= 500) stepSize = 100;
          else if (maxAbsValue >= 200) stepSize = 25;
          else stepSize = 10;
          
          // Runde auf nächste Schrittgröße aufwärts und füge Puffer hinzu
          return Math.ceil(maxValue / stepSize) * stepSize + stepSize;
        })()
      }
    },
    interaction: {
      intersect: false,
      mode: 'index' as const
    },
    // 🎯 MOBILE: Touch-to-Hide für Tooltips
    onHover: (event: any, activeElements: any[]) => {
      // Desktop: Normal hover behavior
      if (event.native && event.native.type === 'mousemove') {
        return;
      }
    },
    onClick: (event: any, activeElements: any[]) => {
      // Mobile: Toggle tooltip visibility
      const chart = event.chart;
      if (chart.tooltip && chart.tooltip.opacity > 0) {
        // Tooltip ist sichtbar → verstecken
        chart.tooltip.opacity = 0;
        chart.update('none');
      } else if (activeElements.length > 0) {
        // Tooltip ist versteckt → zeigen
        chart.tooltip.opacity = 1;
        chart.update('none');
      }
    },
    elements: {
      point: {
        hoverBorderWidth: 3,
        hoverBorderColor: '#ffffff'
      }
    }
  }), [hasAnimated, theme, isDarkMode, hideLegend, showBaseline]); // ✅ Dependencies für Memoization

  // ✅ MEMOIZED ENHANCED DATA: Verhindert Chart-Flackern durch stabile Daten-Referenzen
  const enhancedData = useMemo(() => ({
    ...data,
    labels: [...data.labels, ''], // Leeres Label für zusätzlichen Punkt
    datasets: data.datasets.map(dataset => ({
      ...dataset,
      data: [...dataset.data, null], // Null-Wert für zusätzlichen Punkt (unsichtbar)
      fill: false,
      tension: dataset.tension || 0.1,
      pointRadius: dataset.pointRadius || 2,
      pointHoverRadius: dataset.pointHoverRadius || 4,
      borderWidth: 2,
      pointBackgroundColor: dataset.borderColor,
      pointBorderColor: dataset.borderColor,
      pointHoverBackgroundColor: '#ffffff',
      pointHoverBorderColor: dataset.borderColor,
    }))
  }), [data]); // ✅ Nur neu erstellen wenn data-Referenz sich ändert

  return (
    <div ref={chartRef} className="w-full" style={{ height: `${height}px` }}>
      {/* ✅ Container mit Intersection Observer Ref für intelligente Animationen */}
      {shouldRender ? (
        <Line 
          data={enhancedData} 
          options={options}
          style={{ 
            height: `${height}px`,
            backgroundColor: 'transparent'
          }}
        />
      ) : (
        <div 
          className="flex items-center justify-center bg-gray-800/30 rounded-lg"
          style={{ height: `${height}px` }}
        >
          <div className="text-gray-400 text-center">
            <div className="animate-pulse">📊</div>
            <div className="text-sm mt-2">Chart wird geladen...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PowerRatingChart;
