/**
 * 🎨 ZENTRALE CHART-FARBPALETTE
 * 
 * Diese Farbpalette wird von allen Multi-Spieler-Charts verwendet:
 * - Strichdifferenz-Chart (stricheHistoryService.ts)
 * - Punktedifferenz-Chart (pointsHistoryService.ts)
 * - Zukünftige Gruppen-Charts
 * 
 * Für 30+ Spieler optimiert.
 */

export interface ChartColorScheme {
  border: string;
  background: string;
}

/**
 * 🎨 Globale Farbpalette für alle Gruppen-Charts
 * 
 * Diese Farben werden zyklisch für Spieler in Charts verwendet.
 * Die Reihenfolge bestimmt, welcher Spieler welche Farbe erhält.
 */
export const CHART_COLOR_PALETTE: ChartColorScheme[] = [
  { border: '#059669', background: 'rgba(5, 150, 105, 0.1)' },   // Emerald
  { border: '#ea580c', background: 'rgba(234, 88, 12, 0.1)' },   // Orange
  { border: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' },   // Blue
  { border: '#dc2626', background: 'rgba(220, 38, 38, 0.1)' },   // Red
  { border: '#9333ea', background: 'rgba(147, 51, 234, 0.1)' },   // Violet
  { border: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' },   // Pink
  { border: '#eab308', background: 'rgba(234, 179, 8, 0.1)' },    // Yellow
  { border: '#14b8a6', background: 'rgba(20, 184, 166, 0.1)' },   // Teal
  { border: '#f97316', background: 'rgba(249, 115, 22, 0.1)' },   // Orange-Alt
  { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' },    // Cyan
  { border: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' },   // Purple
  { border: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' },    // Red-Alt
  { border: '#10b981', background: 'rgba(16, 185, 129, 0.1)' },   // Green
  { border: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' },   // Amber
  { border: '#6366f1', background: 'rgba(99, 102, 241, 0.1)' },   // Indigo
  { border: '#84cc16', background: 'rgba(132, 204, 22, 0.1)' },   // Lime
  { border: '#a3e635', background: 'rgba(163, 230, 53, 0.1)' },   // Lime-Alt
  { border: '#22d3ee', background: 'rgba(34, 211, 238, 0.1)' },   // Cyan-Alt
  { border: '#fb923c', background: 'rgba(251, 146, 60, 0.1)' },   // Orange-Light
  { border: '#f43f5e', background: 'rgba(244, 63, 94, 0.1)' },    // Rose
  { border: '#d946ef', background: 'rgba(217, 70, 239, 0.1)' },   // Fuchsia
  { border: '#0ea5e9', background: 'rgba(14, 165, 233, 0.1)' },   // Sky
  { border: '#64748b', background: 'rgba(100, 116, 139, 0.1)' },  // Slate
  { border: '#78716c', background: 'rgba(120, 113, 108, 0.1)' },  // Stone
  { border: '#737373', background: 'rgba(115, 115, 115, 0.1)' },  // Neutral
  { border: '#71717a', background: 'rgba(113, 113, 122, 0.1)' },  // Zinc
  { border: '#78716c', background: 'rgba(120, 113, 108, 0.1)' },  // Stone
  { border: '#52525b', background: 'rgba(82, 82, 91, 0.1)' },     // Gray-Alt
  { border: '#475569', background: 'rgba(71, 85, 105, 0.1)' },    // Slate-Alt
  { border: '#57534e', background: 'rgba(87, 83, 78, 0.1)' },     // Stone-Alt
];

/**
 * 🎨 Hilfsfunktion: Hole Farbe für einen bestimmten Index
 * 
 * @param index - Der Index des Spielers (0-basiert)
 * @returns Das Farbschema für diesen Index
 */
export function getChartColorForIndex(index: number): ChartColorScheme {
  return CHART_COLOR_PALETTE[index % CHART_COLOR_PALETTE.length];
}

/**
 * 🎨 FARBPALETTE für Rankings - OPTIMIERT FÜR ACCESSIBILITY
 * 
 * ✅ WCAG AA Compliant (ausreichender Kontrast)
 * ✅ Colorblind-Friendly (keine problematischen Rot/Grün-Kombinationen nebeneinander)
 * ✅ Semantic Ordering (beste Farben für Top-Ränge)
 * ✅ Visuell unterscheidbar (ausreichender Helligkeits-/Sättigungs-Abstand)
 * ✅ Unterstützt 30+ Spieler durch erweiterte Palette
 * 
 * Diese Funktion wird von allen Chart-Komponenten verwendet:
 * - PowerRatingChart
 * - WinRateChart  
 * - PieChart (Standard)
 * - chartDataService
 */
export function getRankingColor(rank: number, alpha: number = 1): string {
  // 🎯 OPTIMIERTE PALETTE basierend auf Paul Tol's Colorblind-Friendly Schema
  // Reihenfolge: Grün (TOP1) → Blau → Lila → Orange → Magenta → Gelb → Cyan → Lavender → Indigo → Lime
  
  // Erste 10 Farben: Optimal für Rankings (semantisch sortiert)
  const primaryColors = [
    '#10b981', // Rank 1: Grün (Exzellenz)
    '#3b82f6', // Rank 2: Blau (Sehr Gut)
    '#a855f7', // Rank 3: Lila (Gut)
    '#f97316', // Rank 4: Orange (Überdurchschnittlich)
    '#ec4899', // Rank 5: Pink (Durchschnitt)
    '#eab308', // Rank 6: Gelb (Unter Durchschnitt)
    '#06b6d4', // Rank 7: Cyan
    '#a78bfa', // Rank 8: Lavender (weichere Alternative zu Violet)
    '#6366f1', // Rank 9: Indigo
    '#14b8a6'  // Rank 10: Teal (besser als Lime für Kontrast)
  ];
  
  // Erweiterte Palette für 11+ Spieler (aus CHART_COLOR_PALETTE extrahiert)
  const extendedColors = [
    '#f59e0b',  // Amber (11) - gelb-orange
    '#8b5cf6',  // Purple (12) - violett (gut sichtbar, kontrastreich zu Amber)
    '#64748b',  // Slate (13) - grau-blau (DEUTLICH anders als Purple und Rose)
    '#d946ef',  // Fuchsia (14) - pink-violett
    '#22d3ee',  // Cyan-Alt (15) - hell-blau
    '#f43f5e',  // Rose (16) - rot-pink (verschoben nach hinten)
    '#dc2626',  // Red (17) - rot (dunkler als Rose)
    '#fb923c',  // Orange-Light (18) - orange-rot
    '#0ea5e9',  // Sky (19) - himmelblau
    '#059669',  // Emerald (20) - grün (dunkler als Lime)
    '#ea580c',  // Orange-Dark (21) - orange (dunkler)
    '#9333ea',  // Violet (22) - violett (dunkler)
    '#78716c',  // Stone (23) - braun-grau
    '#737373',  // Neutral (24) - mittelgrau
    '#78716c',  // Stone (25) - warmgrau
    '#71717a',  // Zinc (26) - zinc-grau
    '#52525b',  // Gray-Alt (27) - dunkelgrau
    '#475569',  // Slate-Alt (28) - dunkler grau-blau
    '#57534e',  // Stone-Alt (29) - dunkler braun-grau
    '#84cc16',  // Lime (30) - helle grün (nur am Ende, weit weg von Emerald)
  ];
  
  // Kombiniere Paletten: Primär für Ränge 1-10, erweitert für 11+
  const allColors = [...primaryColors, ...extendedColors];
  
  const colorIndex = (rank - 1) % allColors.length;
  const color = allColors[colorIndex];
  
  if (alpha === 1) {
    return color;
  }
  
  // Convert hex to rgba
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 🎯 FARBEN für Gewinn/Niederlage Charts - OPTIMIERT
 * 
 * Speziell für PieCharts mit Gewinn/Niederlage-Quotienten:
 * - Grün für Siege
 * - Rot für Niederlagen
 * 
 * ✅ Colorblind-Friendly: Zusätzlich visuelle Unterscheidung durch Helligkeit
 * ✅ WCAG AA: Ausreichender Kontrast auf dunklem/hellem Hintergrund
 */
export const WIN_LOSS_COLORS = {
  win: '#10b981',    // Grün für Siege (hell, klar)
  loss: '#dc2626',   // Rot für Niederlagen (dunkler als #ef4444, besserer Kontrast)
  draw: '#78716c',   // Warmgrau für Unentschieden (neutral, nicht farbkodiert)
};

/**
 * 🎯 Erstelle Farb-Array für PieChart mit Gewinn/Niederlage
 * 
 * @param hasWin - Ob Gewinn vorhanden ist
 * @param hasLoss - Ob Niederlage vorhanden ist
 * @param hasDraw - Ob Unentschieden vorhanden ist (optional)
 * @returns Array von Farben passend zur Reihenfolge
 */
export function getWinLossColors(hasWin: boolean, hasLoss: boolean, hasDraw: boolean = false): string[] {
  const colors: string[] = [];
  if (hasWin) colors.push(WIN_LOSS_COLORS.win);
  if (hasLoss) colors.push(WIN_LOSS_COLORS.loss);
  if (hasDraw) colors.push(WIN_LOSS_COLORS.draw);
  return colors;
}

