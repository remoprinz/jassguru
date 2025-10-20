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
  { border: '#6b7280', background: 'rgba(107, 114, 128, 0.1)' },  // Gray
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

