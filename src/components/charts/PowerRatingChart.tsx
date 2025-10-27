import React, { useMemo } from 'react';

/**
 * ✂️ TEAM-NAMEN ABKÜRZEN für kompakte Legend
 * - Standard: Erste 2 Buchstaben
 * - "Sch" + 1 Buchstabe (z.B. "Schm" für Schmuuuudiii)
 * - "Ch" + 1 Buchstabe (z.B. "Chr" für Christian)
 */
function abbreviateTeamName(name: string): string {
  if (!name.includes(' & ')) return name;
  
  const parts = name.split(' & ');
  if (parts.length !== 2) return name;
  
  const abbrevPart = (part: string) => {
    const lower = part.toLowerCase();
    
    // "Sch" als Einheit: Nehme "Sch" + 1 Buchstabe
    if (lower.startsWith('sch')) {
      return part.slice(0, 4); // "Schm"
    }
    
    // "Ch" als Einheit: Nehme "Ch" + 1 Buchstabe  
    if (lower.startsWith('ch')) {
      return part.slice(0, 3); // "Chr"
    }
    
    // Standard: Erste 2 Buchstaben
    return part.slice(0, 2);
  };
  
  return `${abbrevPart(parts[0])}\u2009+\u2009${abbrevPart(parts[1])}`; // ✅ Kompakt: "Re\u2009+\u2009Mi" mit Thin Space
}

/**
 * 🎯 KORREKTES EMOJI-SYSTEM (nach Jass-Elo Ranking.pdf)
 */
function calculateEmoji(rating: number): string {
  if (rating >= 150) return '👼'; // Göpf Egg
  if (rating >= 145) return '🔱'; // Jassgott
  if (rating >= 140) return '👑'; // Jasskönig
  if (rating >= 135) return '🏆'; // Grossmeister
  if (rating >= 130) return '🎖'; // Jasser mit Auszeichnung
  if (rating >= 125) return '💎'; // Diamantjasser II
  if (rating >= 120) return '💍'; // Diamantjasser I
  if (rating >= 115) return '🥇'; // Goldjasser
  if (rating >= 110) return '🥈'; // Silberjasser
  if (rating >= 105) return '🥉'; // Bronzejasser
  if (rating >= 100) return '👨‍🎓'; // Jassstudent (START)
  if (rating >= 95) return '🍀'; // Kleeblatt vierblättrig
  if (rating >= 90) return '☘️'; // Kleeblatt dreiblättrig
  if (rating >= 85) return '🌱'; // Jass-Spross
  if (rating >= 80) return '🐓'; // Hahn
  if (rating >= 75) return '🐔'; // Huhn
  if (rating >= 70) return '🐥'; // Kücken
  if (rating >= 65) return '🎅'; // Chlaus
  if (rating >= 60) return '🧀'; // Chäs
  if (rating >= 55) return '🦆'; // Ente
  if (rating >= 50) return '🥒'; // Gurke
  return '🥚'; // Just Egg (< 50)

}
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
      tierEmojis?: (string | null)[]; // 🆕 NEU: Emojis für jeden Datenpunkt
      deltas?: (number | null)[]; // 🆕 NEU: Delta-Werte für jeden Datenpunkt
      spanGaps?: boolean; // ✅ NEU: spanGaps für Chart.js
      tension?: number;
      pointRadius?: number | number[]; // ✅ NEU: Kann Array sein für unterschiedliche Radien
      pointHoverRadius?: number;
    }[];
  };
  title?: string;
  height?: number;
  theme?: string;
  isDarkMode?: boolean;
  hideLegend?: boolean; // ✅ NEU: Für ProfileView ohne Legende
  showBaseline?: boolean; // 🎯 NEU: Steuert ob 100er-Linie angezeigt wird
  isEloChart?: boolean; // 🎯 NEU: Explizit markiert Elo-Charts für korrekte weiße Linien
  collapseIfSinglePoint?: boolean; // 🎯 NEU: Einklappen wenn nur ein Datenpunkt
  activeTab?: string; // ✅ NEU: Für Tab-Wechsel-Reset der Animationen
  activeSubTab?: string; // ✅ NEU: Für Sub-Tab-Wechsel-Reset der Animationen
  animateImmediately?: boolean; // 🚀 NEU: Animation sofort starten (für oberste Charts)
  hideOutliers?: boolean; // 🎯 NEU: Versteckt Punkte von Spielern mit nur einem Datenpunkt
}

export const PowerRatingChart: React.FC<PowerRatingChartProps> = ({
  data,
  title = "Elo-Rating",
  height = 400,
  theme = 'blue',
  isDarkMode = true,
  hideLegend = false, // ✅ NEU: Standardmäßig Legende anzeigen
  showBaseline = true, // 🎯 NEU: Standardmäßig true für ProfileView
  isEloChart = false, // 🎯 NEU: Standardmäßig false (nur Elo-Charts sind true)
  collapseIfSinglePoint = false, // 🎯 NEU: Standardmäßig false
  activeTab, // ✅ NEU: Tab-Wechsel-Reset
  activeSubTab, // ✅ NEU: Sub-Tab-Wechsel-Reset
  animateImmediately = false, // 🚀 NEU: Standardmäßig false (normale Intersection Observer Logik)
  hideOutliers = true, // 🎯 NEU: Standardmäßig verstecke Outlier-Punkte
}) => {
    // 🎯 INTELLIGENTE ANIMATION-KONTROLLE: Intersection Observer + Tab-Wechsel-Reset
    const [hasAnimated, setHasAnimated] = React.useState(false);
    const [isVisible, setIsVisible] = React.useState(false);
    
    // 🚀 NEU: Auto-Hide Timer für Tooltips
    const tooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    
    // 🚀 NEU: Hilfsfunktion für Auto-Hide Tooltips
    const hideTooltipAfterDelay = (chart: any) => {
      // Clear existing timeout
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
      
      // Set new timeout
      tooltipTimeoutRef.current = setTimeout(() => {
        if (chart.tooltip && chart.tooltip.opacity > 0) {
          // 🚀 NEU: Cancel die Datenpunkt-Auswahl komplett statt nur Tooltip zu verstecken
          chart.tooltip.opacity = 0;
          chart.setActiveElements([]); // ✅ Cancel alle aktiven Elemente
          chart.update('none');
        }
      }, 500); // 500ms Auto-Hide
    };
    
    // 🎯 PRÜFE OB NUR EIN DATENPUNKT VORHANDEN IST
    const hasOnlySinglePoint = React.useMemo(() => {
      if (!collapseIfSinglePoint || !data?.datasets?.length) return false;
      
      const allDataPoints = data.datasets.flatMap(dataset => dataset.data).filter(point => point !== null && point !== undefined);
      return allDataPoints.length === 1;
    }, [data, collapseIfSinglePoint]);
    const [shouldRender, setShouldRender] = React.useState(false); // ✅ NEU: Kontrolliert ob Chart gerendert werden soll
    const chartRef = React.useRef<HTMLDivElement>(null);

    // ✅ Tab-Wechsel-Reset: Animation und Rendering zurücksetzen bei Tab-Wechsel
    React.useEffect(() => {
      setHasAnimated(false);
      setIsVisible(false);
      setShouldRender(false); // ✅ Chart wird nicht mehr gerendert
      
      // 🚀 SOFORTIGE ANIMATION: Wenn animateImmediately=true, sofort animieren
      if (animateImmediately) {
        setShouldRender(true);
        setIsVisible(true);
        setTimeout(() => setHasAnimated(true), 50);
      }
    }, [activeTab, activeSubTab, animateImmediately]);

    // ✅ Intersection Observer: Rendering und Animation nur bei vollständig sichtbaren Charts
    React.useEffect(() => {
      if (!chartRef.current || animateImmediately) return; // 🚀 Skip Intersection Observer wenn sofortige Animation
      
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
          threshold: 0.4, // ✅ Animation startet bei ersten Pixel (0%)
          rootMargin: '0px' // ✅ Kein Vorlauf - erst wenn komplett sichtbar
        }
      );
      
      observer.observe(chartRef.current);
      return () => observer.disconnect();
    }, [hasAnimated, activeTab, activeSubTab, animateImmediately]);

    // 🚀 NEU: Cleanup Timer beim Unmount
    React.useEffect(() => {
      return () => {
        if (tooltipTimeoutRef.current) {
          clearTimeout(tooltipTimeoutRef.current);
        }
      };
    }, []);

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
      duration: hasAnimated ? 0 : 350, // 🎯 Nur beim ersten Laden animieren
      easing: 'easeOutQuart' as const, // 🎯 Schneller Start, sanfter End
      // ✅ Resize-Animation deaktivieren für smooth Chart-Updates
      resize: {
        duration: 0 // 🎯 Best Practice: Resize-Animation komplett deaktivieren
      },
      // ✅ Punkte starten von der Hauptlinie (100er bei Elo, 0er bei Strichdifferenz)
      x: {
        duration: hasAnimated ? 0 : 350,
        easing: 'easeOutQuart' as const,
        from: 0, // Start von links
        delay: 0,
      },
      y: {
        duration: hasAnimated ? 0 : 350,
        easing: 'easeOutQuart' as const,
        // 🎯 Start von der Hauptlinie: 100 für Elo-Charts, 0 für alle anderen Charts
        from: (context: { chart: { scales: { y: { min: number, max: number } } } }) => {
          const chart = context.chart;
          const yScale = chart.scales.y;
          
          // Bestimme die Hauptlinie basierend auf dem Chart-Typ
          if (showBaseline) {
            if (isEloChart) {
              // Elo-Chart: Start von 100er-Linie
              return 100;
            } else {
              // Alle anderen Charts: Start von 0er-Linie
              return 0;
            }
          } else {
            // Fallback: Start von 0er-Linie
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
          color: isDarkMode ? '#e5e7eb' : '#374151', // ✅ HELLGRAU: Passend zum Design
          font: {
            size: 11, // ✅ REDUZIERT: Von 12 auf 11 für kompaktere Darstellung
            family: 'Inter, system-ui, sans-serif'
          },
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 10, // ✅ WEITER REDUZIERT: Von 12 auf 10 für kompaktere Darstellung
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
            const dataIndex = context.dataIndex;
            
            // 🎯 KORREKTUR: Prüfe auf NaN statt null
            if (isNaN(value)) return null;
            
            // 🎯 NEU: Emoji nur für Elo-Charts anzeigen
            const emoji = isEloChart ? calculateEmoji(value) : '';
            
            // ✅ KORREKTUR: Verwende ratingDelta aus dataset.deltas statt selbst zu berechnen
            let delta = null;
            if (dataset.deltas && Array.isArray(dataset.deltas)) {
              delta = dataset.deltas[dataIndex];
            }
            
            // Fallback: Berechne Delta ad hoc wenn deltas nicht verfügbar
            if (delta === null && dataIndex > 0) {
              for (let i = dataIndex - 1; i >= 0; i--) {
                const prevRating = dataset.data[i];
                if (!isNaN(prevRating)) {
                  delta = value - prevRating;
                  break;
                }
              }
            }
            
            // Formatiere Delta-Wert
            let deltaText = '';
            if (delta !== null && !isNaN(delta)) {
              const deltaSign = delta >= 0 ? '+' : '';
              deltaText = ` (${deltaSign}${delta.toFixed(1)})`;
            }
            
            return `${playerName}: ${value.toFixed(1)}${emoji}${deltaText}`;
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
            if (index % step === 0) {
              // 🎯 KORREKTUR: X-Achse Labels sind Strings (Daten), keine Zahlen
              // Verwende originales Label direkt - sollte bereits korrekt formatiert sein
              return this.getLabelForValue(value);
            }
            return '';
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
            // 🎯 ELO-CHART: Nur 100er-Linie weiß (isEloChart = true)
            if (isEloChart && context.tick?.value === 100) {
              return isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
            }
            // 🎯 ALLE ANDEREN CHARTS: Nur 0er-Linie weiß (isEloChart = false)
            if (!isEloChart && context.tick?.value === 0) {
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
            // 🎯 ELO-CHART: Nur 100er-Label weiß (isEloChart = true)
            if (isEloChart && context.tick?.value === 100) {
              return isDarkMode ? '#ffffff' : '#000000';
            }
            // 🎯 ALLE ANDEREN CHARTS: Nur 0er-Label weiß (isEloChart = false)
            if (!isEloChart && context.tick?.value === 0) {
              return isDarkMode ? '#ffffff' : '#000000';
            }
            return isDarkMode ? '#9ca3af' : '#6b7280';
          },
          font: {
            size: 11,
            family: 'Inter, system-ui, sans-serif',
            weight: function(context: { tick?: { value: number } }) {
              // 🎯 ELO-CHART: Nur 100er-Label fett (isEloChart = true)
              if (isEloChart && context.tick?.value === 100) return 'bold';
              // 🎯 ALLE ANDEREN CHARTS: Nur 0er-Label fett (isEloChart = false)
              if (!isEloChart && context.tick?.value === 0) return 'bold';
              return 'normal';
            }
          },
          callback: function(this: any, tickValue: string | number) {
            const value = Number(tickValue);
            
            // 🎯 KOMPAKTE Y-ACHSE: 1k, 2k, 10k statt 1000, 2000, 10000
            if (Math.abs(value) >= 1000) {
              const kValue = Math.round(value / 1000); // ✅ KORREKTUR: Runde auf Ganzzahl!
              return `${kValue}k`;
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
          
          // 🎯 NEU: Step-basierte Berechnung + Baseline-Check
          const maxAbsValue = Math.max(...allValues.map(Math.abs));
          let stepSize: number;
          
          if (maxAbsValue >= 10000) stepSize = 2000;
          else if (maxAbsValue >= 1000) stepSize = 500;
          else if (maxAbsValue >= 500) stepSize = 100;
          else if (maxAbsValue >= 200) stepSize = 25;
          else stepSize = 10;
          
          // Step-basierte Berechnung
          const stepBasedMin = Math.floor(minValue / stepSize) * stepSize;
          
          // Baseline-Check: Stelle sicher, dass Baseline ±10px sichtbar ist
          const baseline = isEloChart ? 100 : 0;
          const finalMin = Math.min(stepBasedMin, baseline - 10);
          
          return finalMin;
        })(),
        max: (() => {
          // Dynamisches Maximum basierend auf tatsächlichen Daten
          const allValues = data.datasets.flatMap((d: { data: (number | null)[] }) => d.data).filter((v: number | null): v is number => v !== null);
          if (allValues.length === 0) return 150;
          const maxValue = Math.max(...allValues);
          
          // 🎯 NEU: Step-basierte Berechnung + Baseline-Check
          const maxAbsValue = Math.max(...allValues.map(Math.abs));
          let stepSize: number;
          
          if (maxAbsValue >= 10000) stepSize = 2000;
          else if (maxAbsValue >= 1000) stepSize = 500;
          else if (maxAbsValue >= 500) stepSize = 100;
          else if (maxAbsValue >= 200) stepSize = 25;
          else stepSize = 10;
          
          // Step-basierte Berechnung
          const stepBasedMax = Math.ceil(maxValue / stepSize) * stepSize;
          
          // Baseline-Check: Stelle sicher, dass Baseline ±10px sichtbar ist
          const baseline = isEloChart ? 100 : 0;
          const finalMax = Math.max(stepBasedMax, baseline + 10);
          
          return finalMax;
        })()
      }
    },
    interaction: {
      intersect: true, // ✅ NEU: Nur Tooltip wenn Finger direkt auf Datenpunkt
      mode: 'index' as const
    },
    // 🎯 MOBILE & DESKTOP: Touch/Click Handling
    onHover: (event: any, activeElements: any[]) => {
      const chart = event.chart;
      // Clear existing timeout wenn User interagiert
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
      
      // Wenn keine aktiven Elemente mehr → Auto-Hide starten
      if (activeElements.length === 0 && chart.tooltip && chart.tooltip.opacity > 0) {
        hideTooltipAfterDelay(chart);
      }
    },
    elements: {
      point: {
        hoverBorderWidth: 3,
        hoverBorderColor: '#ffffff',
        hitRadius: 25, // ✅ NEU: Mobile-freundlicher Touch-Radius
        hoverRadius: 4
      }
    }
  }), [hasAnimated, theme, isDarkMode, hideLegend, showBaseline]); // ✅ Dependencies für Memoization

  // 🎯 ZENTRALE CHART-PARAMETER: Alle Charts verwenden dieselben Einstellungen
  const CHART_CONFIG = {
    tension: 0.1,           // ✅ Einheitlich: Gerade Linien für alle Charts
    pointRadius: 2,         // ✅ Einheitlich: Kleine Punkte für alle Charts
    pointHoverRadius: 4,    // ✅ Einheitlich: Hover-Punkte für alle Charts
    borderWidth: 2,         // ✅ Einheitlich: Linienbreite für alle Charts
  };

  // ✅ MEMOIZED ENHANCED DATA: Verhindert Chart-Flackern durch stabile Daten-Referenzen
  const enhancedData = useMemo(() => {
    // 🎯 NEU: Filtere Datasets bei hideOutliers=true
    const filteredDatasets = hideOutliers 
      ? data.datasets.filter(dataset => {
          const validDataPoints = dataset.data.filter(point => 
            point !== null && point !== undefined && !isNaN(point as any)
          ).length;
          return validDataPoints > 1; // Nur Datasets mit mehr als 1 Datenpunkt
        })
      : data.datasets;
    
    // ✅ LEGEND-SORTIERUNG: Sortiere Datasets nach dem letzten Wert (höchster zuoberst)
    const sortedDatasets = [...filteredDatasets].sort((a, b) => {
      // Finde den letzten gültigen Wert für jedes Dataset
      let lastValueA = null;
      let lastValueB = null;
      
      for (let i = a.data.length - 1; i >= 0; i--) {
        const point = a.data[i];
        if (point !== null && point !== undefined && !isNaN(point as any)) {
          lastValueA = point;
          break;
        }
      }
      
      for (let i = b.data.length - 1; i >= 0; i--) {
        const point = b.data[i];
        if (point !== null && point !== undefined && !isNaN(point as any)) {
          lastValueB = point;
          break;
        }
      }
      
      // Sortiere absteigend (höchster zuoberst)
      if (lastValueA === null && lastValueB === null) return 0;
      if (lastValueA === null) return 1;
      if (lastValueB === null) return -1;
      
      return (lastValueB as number) - (lastValueA as number);
    });
    
    return {
      ...data,
      // 🎯 KORREKTUR: Keine zusätzlichen Labels - verwende originale Labels
      labels: data.labels,
      datasets: sortedDatasets.map(dataset => {
        // 🎯 NEU: Erstelle Array von pointRadius-Werten (jetzt immer normal, da Outlier bereits gefiltert)
        const pointRadii = dataset.data.map(() => CHART_CONFIG.pointRadius);
        
        return {
          ...dataset,
          // ✅ ABKÜRZUNG: Shorten Team-Namen für kompakte Legend
          label: abbreviateTeamName(dataset.label || ''),
          displayName: dataset.displayName || dataset.label,
          // 🎯 KORREKTUR: Chart.js kann nicht mit null umgehen, verwende NaN für fehlende Werte
          data: dataset.data.map(point => point === null ? NaN : point), // Nur NaN-Konvertierung, keine zusätzlichen Punkte
          fill: false,
          tension: CHART_CONFIG.tension,           // ✅ ZENTRAL: Überschreibt dataset.tension
          pointRadius: pointRadii,                 // 🎯 NEU: Array für unterschiedliche Radien
          pointHoverRadius: CHART_CONFIG.pointHoverRadius, // ✅ ZENTRAL: Überschreibt dataset.pointHoverRadius
          borderWidth: CHART_CONFIG.borderWidth,   // ✅ ZENTRAL: Einheitliche Linienbreite
          pointBackgroundColor: dataset.borderColor,
          pointBorderColor: dataset.borderColor,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: dataset.borderColor,
          spanGaps: dataset.spanGaps ?? true, // ✅ WICHTIG: Respektiere Dataset-Einstellung (default: true für Elo)
        };
      })
    };
  }, [data, hideOutliers]); // ✅ Dependencies hinzugefügt

  return (
    <>
      {hasOnlySinglePoint ? (
        // 🎯 EINGEKLAPPT: Komplett nichts rendern, nur Titel-Bar bleibt (gerendert von ProfileView)
        null
      ) : (
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
      )}
    </>
  );
};

export default PowerRatingChart;
