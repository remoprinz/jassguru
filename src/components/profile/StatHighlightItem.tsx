import React from 'react';
import { useRouter } from 'next/router';
import { FrontendStatHighlight, FrontendStatStreak } from '../../types/computedStats';
import { formatHighlightDate, formatStreakDateRange, getNavigationSessionId } from '../../utils/formatUtils';

interface StatHighlightItemProps {
  label: string;
  value: number | string;
  // Entweder ein einzelnes Highlight ODER ein Streak ODER transformierte Stats
  highlight?: FrontendStatHighlight | null;
  streak?: FrontendStatStreak | null;
  // NEU: Transformierte Stats mit Session-IDs
  transformedHighlight?: { 
    value: number; 
    date: string | null; 
    relatedId?: string; 
    relatedType?: 'session' | 'game' | 'tournament' 
  } | null;
  transformedStreak?: { 
    value: number; 
    date: string | null; 
    dateRange?: string | null; 
    startSessionId?: string; 
    endSessionId?: string 
  } | null;
  // Optional: Gruppe für Navigation
  groupId?: string;
  className?: string;
}

export const StatHighlightItem: React.FC<StatHighlightItemProps> = ({
  label,
  value,
  highlight,
  streak,
  transformedHighlight,
  transformedStreak,
  groupId,
  className = ""
}) => {
  const router = useRouter();

  const handleClick = () => {
    if (!groupId) return;

    let sessionId: string | null = null;

    if (highlight?.relatedId) {
      // Einzelnes Highlight (Frontend-Types)
      sessionId = highlight.relatedId;
    } else if (transformedHighlight?.relatedId) {
      // Transformiertes Highlight
      sessionId = transformedHighlight.relatedId;
    } else if (streak) {
      // Serie (Frontend-Types) - bevorzuge das Ende für "beste" Highlights, Anfang für "schlechteste"
      const preferEnd = label.toLowerCase().includes('längste sieges') || 
                        label.toLowerCase().includes('längste serie ohne niederlage');
      sessionId = getNavigationSessionId(
        undefined,
        streak.startSessionId,
        streak.endSessionId,
        preferEnd
      );
    } else if (transformedStreak) {
      // Transformierte Serie
      const preferEnd = label.toLowerCase().includes('längste sieges') || 
                        label.toLowerCase().includes('längste serie ohne niederlage');
      sessionId = getNavigationSessionId(
        undefined,
        transformedStreak.startSessionId,
        transformedStreak.endSessionId,
        preferEnd
      );
    }

    if (sessionId) {
      // Navigiere zur Session-Ansicht über GameViewerKreidetafel
      router.push(`/view/${sessionId}?groupId=${groupId}`);
    }
  };

  // Bestimme das anzuzeigende Datum
  const dateText = (() => {
    if (highlight?.date) {
      // Einzelnes Highlight (Frontend-Types)
      return formatHighlightDate(highlight.date);
    } else if (transformedHighlight?.date) {
      // Transformiertes Highlight (bereits formatiert)
      return transformedHighlight.date;
    } else if (streak) {
      // Serie (Frontend-Types)
      return formatStreakDateRange(streak.startDate, streak.endDate);
    } else if (transformedStreak?.dateRange) {
      // Transformierte Serie (bereits formatiert)
      return transformedStreak.dateRange;
    }
    return "-";
  })();

  // Bestimme, ob klickbar
  const isClickable = Boolean(
    groupId && (
      highlight?.relatedId || 
      transformedHighlight?.relatedId ||
      streak?.startSessionId || 
      streak?.endSessionId ||
      transformedStreak?.startSessionId ||
      transformedStreak?.endSessionId
    )
  );

  return (
    <div 
      className={`
        flex justify-between items-center py-3 px-4 rounded-lg
        ${isClickable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors' : ''}
        ${className}
      `}
      onClick={isClickable ? handleClick : undefined}
    >
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {label}
        </div>
        <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
          {dateText}
        </div>
      </div>
      <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
        {value}
      </div>
    </div>
  );
}; 