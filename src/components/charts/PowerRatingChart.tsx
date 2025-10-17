import React from 'react';
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
import { Line } from 'react-chartjs-2';

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
}

export const PowerRatingChart: React.FC<PowerRatingChartProps> = ({
  data,
  title = "Elo-Rating",
  height = 400,
  theme = 'blue',
  isDarkMode = true
}) => {
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

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1500,
      easing: 'easeInOutQuart' as const,
      // ✅ Lineare Animation: Linien bauen sich von links nach rechts auf
      x: {
        duration: 1500,
        easing: 'easeInOutQuart',
        from: 0, // Start von links
        delay: 0, // Kein Staggered Delay für linearen Aufbau
      },
      y: {
        duration: 1500,
        easing: 'easeInOutQuart',
        from: (context: any) => context.chart.scales.y.max, // Start von oben
        delay: 0, // Kein Staggered Delay für linearen Aufbau
      },
    },
    layout: {
      padding: {
        left: 8,   // ✅ Reduziert für mehr Platz
        right: 8,   // ✅ Reduziert für mehr Platz
        top: 8,     // ✅ Reduziert für mehr Platz
        bottom: 8   // ✅ Reduziert für mehr Platz
      }
    },
    plugins: {
      legend: {
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
            return `${playerName}: ${Math.round(value)}`;
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
          maxTicksLimit: 8,
          callback: function(value: any, index: any, values: any) {
            // Zeige nur jeden n-ten Tick um Überfüllung zu vermeiden
            const step = Math.max(1, Math.floor(values.length / 8));
            return index % step === 0 ? this.getLabelForValue(value) : '';
          }
        }
      },
        y: {
          display: true,
          title: {
            display: false, // ✅ Entfernt - selbsterklärend durch Chart-Titel
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
          callback: function(value: any) {
            return Math.round(value);
          },
          stepSize: 10 // 10er-Intervalle für bessere Lesbarkeit
        },
        suggestedMin: (() => {
          // Dynamisches Minimum basierend auf Daten
          const allValues = data.datasets.flatMap((d: any) => d.data).filter((v: any) => v !== null);
          if (allValues.length === 0) return 500;
          const minValue = Math.min(...allValues);
          return Math.max(500, minValue - 10); // Tiefster Spieler - 10 Punkte Puffer
        })(),
        suggestedMax: (() => {
          // Dynamisches Maximum basierend auf Daten
          const allValues = data.datasets.flatMap((d: any) => d.data).filter((v: any) => v !== null);
          if (allValues.length === 0) return 1200;
          const maxValue = Math.max(...allValues);
          return Math.min(1200, maxValue + 5); // Höchster Spieler + 10 Punkte Puffer
        })()
      }
    },
    interaction: {
      intersect: false,
      mode: 'index' as const
    },
    elements: {
      point: {
        hoverBorderWidth: 3,
        hoverBorderColor: '#ffffff'
      }
    }
  };

  // Erweitere Datasets mit zusätzlichen Styling-Optionen
  const enhancedData = {
    ...data,
    datasets: data.datasets.map(dataset => ({
      ...dataset,
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
  };

  return (
    <div className="w-full">
      {/* ✅ Container entfernt für mehr Platz links/rechts */}
      <Line 
        data={enhancedData} 
        options={options}
        style={{ 
          height: `${height}px`,
          backgroundColor: 'transparent'
        }}
      />
    </div>
  );
};

export default PowerRatingChart;
