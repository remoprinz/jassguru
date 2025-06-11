import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Temporäre Typdefinitionen für das Frontend, bis eine globale Lösung existiert.
// Diese sollten die Struktur widerspiegeln, die vom Backend geliefert wird.
export interface FrontendPartnerAggregate {
  partnerId: string;
  partnerDisplayName: string;
  sessionsPlayedWith: number;
  sessionsWonWith: number;
  gamesPlayedWith: number;
  gamesWonWith: number;
  totalStricheDifferenceWith: number;
  totalPointsWith: number;
  matschGamesWonWith: number;
  schneiderGamesWonWith: number;
  // lastPlayedWithTimestamp: admin.firestore.Timestamp; // Timestamp ist hier ggf. schon string/Date
}

export interface FrontendOpponentAggregate {
  opponentId: string;
  opponentDisplayName: string;
  sessionsPlayedAgainst: number;
  sessionsWonAgainst: number;
  gamesPlayedAgainst: number;
  gamesWonAgainst: number;
  totalStricheDifferenceAgainst: number;
  totalPointsScoredWhenOpponent: number;
  matschGamesWonAgainstOpponentTeam: number;
  schneiderGamesWonAgainstOpponentTeam: number;
  // lastPlayedAgainstTimestamp: admin.firestore.Timestamp;
}

interface AggregateRankingListProps {
  title: string;
  items: (FrontendPartnerAggregate | FrontendOpponentAggregate)[];
  valueSelector: (item: FrontendPartnerAggregate | FrontendOpponentAggregate) => number | string;
  valueFormatter?: (value: number | string) => string;
  identifierKey: 'partnerId' | 'opponentId';
  // Später ggf. Link-Builder für Profilseiten der Partner/Gegner
}

const AggregateRankingList: React.FC<AggregateRankingListProps> = ({
  title,
  items,
  valueSelector,
  valueFormatter,
  identifierKey,
}) => {

  const getDisplayName = (item: FrontendPartnerAggregate | FrontendOpponentAggregate): string => {
    if ('partnerDisplayName' in item) {
      return item.partnerDisplayName;
    }
    return (item as FrontendOpponentAggregate).opponentDisplayName;
  };

  const getPhotoURL = (item: FrontendPartnerAggregate | FrontendOpponentAggregate): string | undefined => {
    // Aktuell haben wir keine photoURL in den Aggregaten. Placeholder für spätere Erweiterung.
    return undefined; 
  };

  // Sortieren und auf Top 10 begrenzen
  const sortedItems = [...items].sort((a, b) => {
    const valA = valueSelector(a);
    const valB = valueSelector(b);

    // Handle Win Rates (higher is better, but ensure numbers for proper sort)
    if (title.toLowerCase().includes('siegquote') || title.toLowerCase().includes('quote')) {
        const numA = typeof valA === 'string' ? parseFloat(valA.replace('%', '')) : valA as number;
        const numB = typeof valB === 'string' ? parseFloat(valB.replace('%', '')) : valB as number;
        return numB - numA; 
    }

    // Standard Sortierung: Höherer numerischer Wert ist besser
    if (typeof valA === 'number' && typeof valB === 'number') {
      return valB - valA; 
    }
    
    // Fallback für String-Werte (alphabetisch absteigend als Annahme)
    if (String(valA) > String(valB)) return -1;
    if (String(valA) < String(valB)) return 1;
    return 0;
  }).slice(0, 10);

  if (!sortedItems || sortedItems.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
        <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
          <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>
        <div className="p-4 text-center text-gray-400 text-sm">
          Keine Daten für diese Rangliste verfügbar.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <div className="p-4 space-y-2 max-h-[calc(10*2.8rem)] overflow-y-auto pr-2"> 
        {sortedItems.map((item, index) => {
          const value = valueSelector(item);
          const displayValue = valueFormatter ? valueFormatter(value) : value;
          const displayName = getDisplayName(item);
          const photoURL = getPhotoURL(item);
          const itemId = identifierKey === 'partnerId' ? (item as FrontendPartnerAggregate).partnerId : (item as FrontendOpponentAggregate).opponentId;

          return (
            <div key={itemId} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors h-10">
              <div className="flex items-center min-w-0"> {/* Für Truncate wichtig */} 
                <span className="text-gray-400 min-w-[2.5ch] mr-2 text-right flex-shrink-0">{index + 1}.</span>
                <Avatar className="h-6 w-6 border-gray-800 mr-2 flex-shrink-0"> 
                  {photoURL ? (
                    <AvatarImage src={photoURL} alt={displayName} />
                  ) : (
                    <AvatarFallback className="bg-gray-600 text-xs text-gray-300">
                      {displayName?.charAt(0).toUpperCase() || '?'}
                    </AvatarFallback>
                  )}
                </Avatar>
                <span className="text-gray-300 truncate" title={displayName}>{displayName}</span>
              </div>
              <span className="text-white font-medium flex-shrink-0 ml-2">{displayValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AggregateRankingList; 