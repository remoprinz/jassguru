import React from 'react';
import Link from 'next/link';
// import type { FrontendStatHighlight } from '@/types/computedStats'; // Nicht mehr direkt diesen Typ verwenden

// Angepasste Props basierend auf der Struktur von `dynamicHighlights` aus dem Transformer
interface NotableEventItem {
  label: string;
  value: string | number;
  date: string | null; // Ist bereits ein String vom Transformer
  relatedId?: string;
  relatedType?: 'game' | 'session' | 'tournament';
  // type?: string; // Original-Typ, falls für den Key benötigt, aktuell nicht im dynamicHighlights-Objekt
}

interface NotableEventsListProps {
  highlights: Array<NotableEventItem> | undefined;
}

const NotableEventsList: React.FC<NotableEventsListProps> = ({ highlights }) => {
  if (!highlights || highlights.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50 mt-3">
        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
          <h3 className="text-base font-semibold text-white">Weitere Bemerkenswerte Ereignisse</h3>
        </div>
        <div className="p-4 text-center text-gray-500">
          Keine weiteren bemerkenswerten Ereignisse vorhanden.
        </div>
      </div>
    );
  }

  const getLinkHref = (item: NotableEventItem): string => {
    if (item.relatedId && item.relatedType) {
      switch (item.relatedType) {
        case 'session':
          return `/view/session/${item.relatedId}`;
        case 'game':
          return `/view/game/${item.relatedId}`; // TODO: Korrekte Route für Einzelspielansicht
        case 'tournament':
          return `/view/tournament/${item.relatedId}`;
        default:
          return '#';
      }
    }
    return '#';
  };

  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50 mt-3">
      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
        <h3 className="text-base font-semibold text-white">Weitere Bemerkenswerte Ereignisse</h3>
      </div>
      <div className="p-4 space-y-2">
        {highlights.map((item, index) => (
          <Link 
            href={getLinkHref(item)} 
            key={`${item.label}-${index}`} // Geänderter Key, da item.type nicht im dynamicHighlights vorhanden ist
            className={`flex justify-between items-center p-1 rounded-md ${item.relatedId ? 'hover:bg-gray-700/50 cursor-pointer' : 'cursor-default'}`}
          >
            <div className="flex-1">
              <span className="font-medium text-gray-300">{item.label}</span>
              {item.date && <span className="text-xs text-gray-500 ml-2">({item.date})</span>} {/* item.date ist jetzt string | null */}
            </div>
            <span className="text-gray-100 font-semibold ml-2 text-right">{typeof item.value === 'number' ? item.value.toLocaleString('de-CH') : item.value}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default NotableEventsList; 