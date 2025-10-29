import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { getRankingColor } from '../../config/chartColors';
import { abbreviatePlayerName } from '../../utils/formatUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export interface WinRateData {
  label: string;
  winRate: number;
  wins: number;
  losses: number;
  draws?: number;
}

interface WinRateChartProps {
  data: WinRateData[];
  title?: string;
  height?: number;
  theme?: string;
  isDarkMode?: boolean;
  activeTab?: string;
  activeSubTab?: string;
  animateImmediately?: boolean;
  animationThreshold?: number;
  hideLegend?: boolean;
  minSessions?: number; // Minimale Anzahl Sessions (default: 2)
  totalSessionsInGroup?: number; // Gesamtanzahl Sessions in der Gruppe für intelligentes Filtern
  isGameWinRate?: boolean; // True für "Siegquote Spiel" (Games statt Sessions)
  disableIntelligentFiltering?: boolean; // NEU: Deaktiviere intelligente Filterung (nur Top 12 Limit anwenden)
}

const WinRateChart: React.FC<WinRateChartProps> = ({
  data,
  title,
  height = 300,
  theme = 'blue',
  isDarkMode = true,
  activeTab,
  activeSubTab,
  animateImmediately = false,
  animationThreshold = 0.7,
  hideLegend = false,
  minSessions = 2, // Standard: Mindestens 2 Sessions
  totalSessionsInGroup, // Gesamtanzahl Sessions in der Gruppe
  isGameWinRate = false, // Standard: Sessions (Siegquote Partie)
  disableIntelligentFiltering = false, // NEU: Standardmäßig aktive Filterung
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = React.useState(false);
  const [isInView, setIsInView] = React.useState(false);
  const [shouldRender, setShouldRender] = React.useState(false);
  
  // 🎯 Scroll-Erkennung um Tooltip bei Scroll zu verhindern
  const isScrollingRef = React.useRef(false);
  const scrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const tooltipTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  // 🎯 NEU: Starte Scroll-Timer
  const handleScrollStart = () => {
    isScrollingRef.current = true;
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Nach Scroll-Ende (300ms keine Bewegung) → Tooltip wieder erlauben
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 300);
  };
  
  // 🚀 NEU: Hilfsfunktion für Auto-Hide Tooltips
  const hideTooltipAfterDelay = (chart: any) => {
    // Clear existing timeout
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    
    // Set new timeout
    tooltipTimeoutRef.current = setTimeout(() => {
      if (chart.tooltip && chart.tooltip.opacity > 0) {
        chart.tooltip.opacity = 0;
        chart.setActiveElements([]);
        chart.update('none');
      }
    }, 500);
  };

  // ✅ Tab-Wechsel-Reset: Animation und Rendering zurücksetzen bei Tab-Wechsel
  React.useEffect(() => {
    setHasAnimated(false);
    setIsInView(false);
    setShouldRender(false);
    
    // 🚀 SOFORTIGE ANIMATION: Wenn animateImmediately=true, sofort animieren
    if (animateImmediately) {
      setShouldRender(true);
      setIsInView(true);
      setTimeout(() => setHasAnimated(true), 50);
    }
  }, [activeTab, activeSubTab, animateImmediately]);

  // ✅ Intersection Observer: Rendering und Animation nur bei vollständig sichtbaren Charts
  React.useEffect(() => {
    if (!containerRef.current || animateImmediately) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // 🎯 WICHTIG: Prüfe ob Element wirklich sichtbar ist
        if (entry.target && entry.target instanceof Element) {
          const element = entry.target as HTMLElement;
          const computedStyle = window.getComputedStyle(element);
          const isVisible = computedStyle.display !== 'none' && 
                           computedStyle.visibility !== 'hidden' &&
                           computedStyle.opacity !== '0';
          
          if (entry.isIntersecting && isVisible) {
            setIsInView(true);
            setShouldRender(true);
            // Animation nur starten wenn Chart vollständig sichtbar UND noch nicht animiert
            if (!hasAnimated) {
              setTimeout(() => setHasAnimated(true), 50);
            }
          } else {
            setIsInView(false);
          }
        }
      },
      { 
        threshold: animationThreshold,
        rootMargin: '0px'
      }
    );
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [hasAnimated, activeTab, activeSubTab, animateImmediately, animationThreshold]);
  
  // 🚀 NEU: Cleanup Timer beim Unmount
  React.useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);
  
  // 🎯 NEU: Scroll-Listener für Chart-Container
  React.useEffect(() => {
    const currentChartRef = chartRef.current;
    if (!currentChartRef) return;
    
    const handleWheel = () => handleScrollStart();
    const handleTouchMove = () => handleScrollStart();
    
    currentChartRef.addEventListener('wheel', handleWheel, { passive: true });
    currentChartRef.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    return () => {
      currentChartRef.removeEventListener('wheel', handleWheel);
      currentChartRef.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);
  

  // Vorbereitete Chart-Daten
  const chartData = useMemo(() => {
    // ✅ Gültige Daten filtern
    const validData = data.filter(item => {
      // Basis-Filter: Gültige WinRate
      if (
        item.winRate === undefined || 
        item.winRate === null ||
        item.winRate < 0 ||
        item.winRate > 1
      ) {
        return false;
      }
      return true;
    });
    
    if (validData.length === 0) {
      return { labels: [], datasets: [] };
    }
    
    // 🎯 INTELLIGENTE AKTIVITÄTS-FILTERUNG (nur wenn NICHT deaktiviert):
    // Berechne Gesamtanzahl Events (Partien oder Spiele) für die Gruppe
    const totalEvents = validData.reduce((sum, item) => {
      return sum + (item.wins + item.losses + (item.draws || 0));
    }, 0);
    
    // Filter-Strategie:
    let activeData = validData;
    
    // 🎯 NEU: Filterung nur anwenden wenn NICHT deaktiviert UND etablierte Gruppe
    if (!disableIntelligentFiltering) {
      // 🎯 KORREKTE SCHWELLENWERTE: 10 Partien = etabliert, ca. 30 Spiele
      // Partien: 1 Partie im Schnitt = 3.5 Spiele
      const eventThreshold = isGameWinRate ? 30 : 10; // Für Spiele: 30, für Partien: 10
      
      // Wenn die Gruppe bereits etabliert ist (10 Partien ODER 30 Spiele insgesamt UND > 6 Spieler):
      if (totalEvents > eventThreshold && validData.length > 6) {
        // Berechne Median-Aktivität
        const eventsArray = validData.map(item => item.wins + item.losses + (item.draws || 0)).sort((a, b) => a - b);
        const medianEvents = eventsArray[Math.floor(eventsArray.length / 2)];
        
        // 🎯 EINHEITLICHE FILTERLOGIK: Konsistent für Partien UND Spiele
        // Filtere nur sehr inaktive Spieler (< 20% des Medians ODER < 3 Events)
        activeData = validData.filter(item => {
          const events = item.wins + item.losses + (item.draws || 0);
          return events >= Math.max(3, medianEvents * 0.2); // Mindestens 3 Events ODER 20% des Medians
        });
      }
    }
    
    // Sortiere nach Win Rate (absteigend für vertikale Bars mit Top-Spieler RECHTS)
    const sortedData = [...activeData].sort((a, b) => b.winRate - a.winRate);
    
    // ✅ LIMITING: Wenn mehr als 12 Spieler/Teams, zeige nur Top 12 mit meisten Spielen
    let limitedData = sortedData;
    if (sortedData.length > 12) {
      // Sortiere nach Anzahl Spielen (absteigend) und nimm Top 12
      const sortedByGames = [...sortedData].sort((a, b) => {
        const aGames = a.wins + a.losses + (a.draws || 0);
        const bGames = b.wins + b.losses + (b.draws || 0);
        return bGames - aGames;
      });
      limitedData = sortedByGames.slice(0, 12);
      // Sortiere wieder nach Win Rate
      limitedData.sort((a, b) => b.winRate - a.winRate);
    }
    
    // Berechne dynamischen Max-Wert: Auf 10% runden, aber NICHT über 100% gehen!
    const maxWinRate = Math.max(...limitedData.map(item => item.winRate * 100));
    
    let dynamicMax: number;
    if (maxWinRate >= 100) {
      dynamicMax = 100; // Nie über 100% anzeigen
    } else {
      // Runde auf nächstes 10er hoch
      dynamicMax = Math.ceil(maxWinRate / 10) * 10;
      // Stelle sicher dass es nicht über 100% geht
      if (dynamicMax > 100) dynamicMax = 100;
    }
    
    // ✅ WICHTIG: Zeige mindestens bis 60% damit 50%-Linie immer sichtbar ist
    if (dynamicMax < 60) {
      dynamicMax = 60;
    }

    // Für vertikale Bars: Top-Spieler ganz RECHTS
    // limitedData ist sortiert (höchste zuerst), aber für Chart wollen wir niedrigste zuerst
    const reversedForChart = limitedData.reverse(); // Umkehren für Anzeige: Top-Spieler rechts
    const totalPlayers = reversedForChart.length;

    return {
      labels: reversedForChart.map(item => abbreviatePlayerName(item.label)), // Niedrigster links, Top-Spieler rechts
      datasets: [
        {
          label: title || 'Siegquote',
          // 🎯 NEU: 0% Werte auf 3% setzen für bessere Sichtbarkeit (nur visuell, nicht in Tooltip)
          data: reversedForChart.map(item => {
            const winRatePercent = item.winRate * 100;
            return winRatePercent === 0 ? 3 : winRatePercent; // Mindestens 3% für 0%-Spieler
          }),
          // ✅ NEU: Speichere vollständige Spielerdaten für Tooltips (inkl. original winRate)
          playerData: reversedForChart.map(item => item), // Array von vollständigen Spieler-Daten (mit original winRate)
          // Farblogik: Index 0 (niedrigster, links) → Rang totalPlayers (niedrig), Index totalPlayers-1 (Top, rechts) → Rang 1 (GRÜN)
          backgroundColor: reversedForChart.map((_, index) => 
            getRankingColor(totalPlayers - index, 0.8)
          ),
          borderColor: reversedForChart.map((_, index) => 
            getRankingColor(totalPlayers - index, 1)
          ),
          borderWidth: 2,
          borderRadius: 8,
          barThickness: 'flex' as const,
          maxBarThickness: 48,
        }
      ],
      maxValue: dynamicMax
    };
  }, [data, title, minSessions, totalSessionsInGroup, isGameWinRate, disableIntelligentFiltering]);

  const maxValue = chartData.maxValue || 100;
  
  const options = useMemo(() => ({
    indexAxis: 'x' as const, // Vertikale Balken (Spieler unten, WinRate oben)
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    layout: {
      padding: {
        right: 20, // ✅ Mehr Padding rechts
        left: 10,
        top: 10,
        bottom: 10
      }
    },
    animation: {
      duration: hasAnimated ? 0 : 350, // ✅ Nur beim ersten Laden animieren (gleich wie PowerRatingChart)
      easing: 'easeOutQuart' as const, // ✅ Gleich wie PowerRatingChart
      delay: (context: { dataIndex: number }) => hasAnimated ? 0 : context.dataIndex * 20, // ✅ Schnellere Delays
    },
    plugins: {
      legend: {
        display: !hideLegend,
        position: 'top' as const,
        labels: {
          color: isDarkMode ? '#e5e7eb' : '#1f2937',
          font: { size: 12 },
          usePointStyle: true,
          padding: 12,
        }
      },
      tooltip: {
        backgroundColor: isDarkMode ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: isDarkMode ? '#ffffff' : '#111827',
        bodyColor: isDarkMode ? '#e5e7eb' : '#374151',
        padding: 12,
        borderColor: (() => {
          // Theme-Farbe für Border (wenn verfügbar)
          const themeColorMap: Record<string, string> = {
            'green': '#10b981',
            'blue': '#3b82f6',
            'purple': '#a855f7',
            'orange': '#f97316',
            'cyan': '#06b6d4',
            'pink': '#ec4899',
            'yellow': '#eab308',
            'teal': '#14b8a6',
          };
          return themeColorMap[theme] || (isDarkMode ? '#374151' : '#e5e7eb');
        })(),
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: false,
        titleFont: {
          size: 13,
          weight: 'bold' as const
        },
        bodyFont: {
          size: 12
        },
        callbacks: {
          label: (context: any) => {
            const dataIndex = context.dataIndex;
            const dataset = context.dataset;
            
            // ✅ KORREKT: Verwende playerData Array aus dem Dataset (bereits korrekt sortiert)
            const playerData = dataset.playerData?.[dataIndex];
            
            if (!playerData) return '';
            
            const rate = playerData.winRate * 100;
            const stats = playerData.draws !== undefined
              ? `${playerData.wins}/${playerData.losses}/${playerData.draws}`
              : `${playerData.wins}/${playerData.losses}`;
            
            return `${rate.toFixed(1)}% (${stats})`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: isDarkMode ? '#9ca3af' : '#6b7280', // ✅ Gleiche Farbe wie PowerRatingChart
          font: { size: 12 },
          autoSkip: false, // ✅ Zeige alle Labels
          maxRotation: 55, // Maximaler Winkel: 55°
          minRotation: 55, // ✅ IMMER 55° Rotation wie in PowerRatingChart
        },
        grid: {
          display: false,
          drawBorder: false,
        }
      },
      y: {
        beginAtZero: true,
        max: maxValue, // Dynamisches Maximum
        grid: {
          color: function(context: { tick?: { value: number } }) {
            // 🎯 50%-Linie = Break-Even für Win Rates (IMMER weiss und dick)
            if (context.tick?.value === 50) {
              return isDarkMode ? 'rgba(255, 255, 255, 1)' : 'rgba(0, 0, 0, 1)';
            }
            return isDarkMode ? 'rgba(75, 85, 99, 0.3)' : 'rgba(156, 163, 175, 0.3)';
          },
          lineWidth: function(context: { tick?: { value: number } }) {
            // 🎯 50%-Linie dicker machen (2px statt 1px)
            return context.tick?.value === 50 ? 2 : 1;
          },
          drawBorder: false,
          drawOnChartArea: true,
          drawTicks: true,
        },
        afterBuildTicks: function(scale: any) {
          // 🎯 WICHTIG: Stelle sicher, dass 50% IMMER als Tick vorhanden ist
          const ticks = scale.ticks || [];
          const has50Tick = ticks.some((tick: any) => tick.value === 50);
          
          if (!has50Tick) {
            // Füge 50% Tick hinzu, wenn er fehlt
            ticks.push({ value: 50 });
            ticks.sort((a: any, b: any) => a.value - b.value);
            scale.ticks = ticks;
          }
        },
        ticks: {
          color: function(context: { tick?: { value: number } }) {
            // 🎯 50%-Label weiss und fett (Break-Even für Win Rates)
            if (context.tick?.value === 50) {
              return isDarkMode ? '#ffffff' : '#000000';
            }
            return isDarkMode ? '#9ca3af' : '#6b7280';
          },
          font: function(context: { tick?: { value: number } }) {
            // 🎯 50%-Label fett
            if (context.tick?.value === 50) {
              return { size: 11, weight: 'bold' as const };
            }
            return { size: 11, weight: 'normal' as const };
          },
          callback: function(value: any) {
            return value + '%';
          },
          stepSize: 10 // ✅ 10er-Schritte, aber maxValue wird angepasst
        }
      }
    },
    // 🎯 Scroll-Erkennung: Verhindere Tooltip beim Scrollen
    onHover: (event: any, activeElements: any[]) => {
      const chart = event.chart;
      
      // 🎯 Verhindere Tooltip wenn User scrollt
      if (isScrollingRef.current) {
        if (chart.tooltip) {
          chart.tooltip.opacity = 0;
          chart.setActiveElements([]);
          chart.update('none');
        }
        return;
      }
      
      // Clear existing timeout wenn User interagiert
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
      
      // Wenn keine aktiven Elemente mehr → Auto-Hide starten
      if (activeElements.length === 0 && chart.tooltip && chart.tooltip.opacity > 0) {
        hideTooltipAfterDelay(chart);
      }
    },
    // ✅ onClick: Schließe Tooltip beim Klick auf Chart
    onClick: (event: any, activeElements: any[], chart: any) => {
      // Wenn Tooltip aktiv ist, schließe es
      if (chart.tooltip && chart.tooltip.opacity > 0) {
        chart.tooltip.opacity = 0;
        chart.setActiveElements([]);
        chart.update('none');
      }
    }
  }), [isDarkMode, hasAnimated, hideLegend, maxValue, chartData, theme]);

  // ✅ Custom Plugin für 50%-Linie
  const customPlugin = useMemo(() => ({
    id: 'line50',
    afterDatasetsDraw: (chart: any) => {
      const ctx = chart.ctx;
      const yScale = chart.scales.y;
      if (!yScale) return;

      // Berechne Y-Position für 50%
      const yPosition = yScale.getPixelForValue(50);
      const chartArea = chart.chartArea;

      if (!chartArea) return;

      // Zeichne weisse Linie bei 50% NACH den Bars (hinter den Bars, aber Tooltips sind darüber)
      ctx.save();
      ctx.strokeStyle = isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPosition);
      ctx.lineTo(chartArea.right, yPosition);
      ctx.stroke();
      ctx.restore();
    }
  }), [isDarkMode]);

  return (
    <div ref={(node) => {
      containerRef.current = node;
      chartRef.current = node; // ✅ Setze chartRef auf dasselbe Element
    }} style={{ height: `${height}px`, position: 'relative' }}>
      {shouldRender ? (
        <Bar data={chartData} options={options} plugins={[customPlugin]} />
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

export default WinRateChart;

