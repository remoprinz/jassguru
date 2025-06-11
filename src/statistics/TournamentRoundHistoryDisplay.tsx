import React, { useEffect, useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import type { GameEntry, PlayerNames, CardStyle, RoundEntry, TeamPosition, JassColor, PlayerNumber, JassRoundEntry, TeamStand, StrokeSettings, CompletedGameSummary } from '@/types/jass';
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
// import { StatisticProps } from '../types/statistikTypes'; // Nicht direkt verwenden, eigene Props definieren
// import { useGameStore } from "../store/gameStore"; // Nicht direkt im Turniermodus relevant

// NEU: Import für Turnier-Typen
import type { TournamentGame, PassePlayerDetail } from '@/types/tournament';

// NEU: Store-Hooks und Selektoren importieren
// Entfernt: import { useTournamentStore, selectPasseRoundsFromCache, selectPasseRoundsStatus } from '@/store/tournamentStore';

// NEUE ZENTRALE MAPPING-FUNKTION (identisch zu RoundHistoryDisplay.tsx)
const mapDbValueToJassColorType = (dbValue: string | undefined): JassColor | undefined => {
  if (!dbValue) return undefined;

  const lowerDbValue = dbValue.toLowerCase();

  if (lowerDbValue === "misère") return "Misère";
  if (lowerDbValue === "eicheln" || lowerDbValue === "eichel") return "Eicheln";
  if (lowerDbValue === "rosen" || lowerDbValue === "rose") return "Rosen";
  if (lowerDbValue === "schellen" || lowerDbValue === "schelle") return "Schellen";
  if (lowerDbValue === "schilten" || lowerDbValue === "schilte") return "Schilten";
  if (lowerDbValue === "obe") return "Obe";
  if (lowerDbValue === "une" || lowerDbValue === "unde") return "Une";
  if (lowerDbValue === "3x3") return "3x3";
  if (lowerDbValue === "quer") return "Quer";
  if (lowerDbValue === "slalom") return "Slalom";
  if (lowerDbValue === "trumpf") return "Obe"; // Fallback für alte Daten

  console.warn(`[mapDbValueToJassColorType] Unbekannter DB-Wert: '${dbValue}' in TournamentRoundHistoryDisplay, konnte nicht zu JassColor gemappt werden.`);
  return undefined;
};

const getRoundPoints = (round: RoundEntry, prevRound: RoundEntry | undefined): { top: number; bottom: number } => {
  const currentTopScore = round.scores?.top ?? 0;
  const currentBottomScore = round.scores?.bottom ?? 0;
  const prevTopScore = prevRound?.scores?.top ?? 0;
  const prevBottomScore = prevRound?.scores?.bottom ?? 0;
  const topPoints = currentTopScore - prevTopScore;
  const bottomPoints = currentBottomScore - prevBottomScore;
  return { top: topPoints, bottom: bottomPoints };
};

const getStartingTeamPosition = (startingPlayer: PlayerNumber | undefined): TeamPosition | null => {
    if (startingPlayer === undefined) return null;
    if (startingPlayer === 1 || startingPlayer === 3) return 'bottom';
    if (startingPlayer === 2 || startingPlayer === 4) return 'top';
    return null;
};

const isFinalizedJassRound = (entry: RoundEntry): entry is JassRoundEntry & { isRoundFinalized: true, startingPlayer: PlayerNumber } => {
  return entry.actionType === 'jass' && 
         entry.isRoundFinalized === true && 
         typeof entry.startingPlayer === 'number' &&
         (typeof entry.farbe === 'string' && entry.farbe.length > 0 || entry.farbe === undefined) && 
         (entry.isActive === undefined || entry.isActive === true); 
};

// NEU: Sub-Komponente für die Details einer einzelnen Passe
interface PasseDetailsProps {
  passe: TournamentGame;
  globalPlayerNames: PlayerNames; // Globale PlayerNames als Fallback
  cardStyle: CardStyle;
  playerPhotoUrlMapping?: Record<string, string>;
  focusedPlayerId?: string;
}

const PasseDetails: React.FC<PasseDetailsProps> = ({ passe, globalPlayerNames, cardStyle, playerPhotoUrlMapping, focusedPlayerId }) => {
  // Entfernt: const loadPasseRounds = useTournamentStore((state) => state.loadPasseRounds);
  // Direkt die Runden aus dem Passe-Objekt verwenden
  const rounds = passe.roundHistory ?? []; 
  // Entfernt: const status = useTournamentStore(selectPasseRoundsStatus(passe.passeId));

  // Entfernt: useEffect-Hook zum Laden der Runden
  // useEffect(() => {
  //   if (passe.tournamentInstanceId && passe.passeId && status !== 'success' && status !== 'loading') {
  //     loadPasseRounds(passe.tournamentInstanceId, passe.passeId);
  //   }
  // }, [passe.tournamentInstanceId, passe.passeId, loadPasseRounds, status]);

  const { teamTopDisplay, teamBottomDisplay, playerTeam } = useMemo(() => {
    let topDisplay = 'Team Oben';
    let bottomDisplay = 'Team Unten';
    let determinedPlayerTeam: TeamPosition | null = null;

    if (passe.playerDetails && passe.playerDetails.length > 0) {
      const topTeamPlayerNames: string[] = [];
      const bottomTeamPlayerNames: string[] = [];

      passe.playerDetails.forEach(detail => {
        if (detail.playerId === focusedPlayerId) {
          determinedPlayerTeam = detail.team;
        }
        if (detail.team === 'top' && detail.playerName) {
          topTeamPlayerNames.push(detail.playerName);
        } else if (detail.team === 'bottom' && detail.playerName) {
          bottomTeamPlayerNames.push(detail.playerName);
        }
      });

      if (topTeamPlayerNames.length > 0) {
        topDisplay = topTeamPlayerNames.join(' & ');
      }
      if (bottomTeamPlayerNames.length > 0) {
        bottomDisplay = bottomTeamPlayerNames.join(' & ');
      }
    }
    return { teamTopDisplay: topDisplay, teamBottomDisplay: bottomDisplay, playerTeam: determinedPlayerTeam };
  }, [passe.playerDetails, focusedPlayerId]);

  // Die Runden kommen jetzt direkt aus passe.roundHistory und sind bereits ein Array
  const finalizedJassRoundsToShow = rounds.filter(isFinalizedJassRound);
  // Sortierung kann hier beibehalten werden, falls die Runden im Array nicht sortiert sind
  finalizedJassRoundsToShow.sort((a, b) => (a.roundState?.roundNumber || 0) - (b.roundState?.roundNumber || 0));

  return (
    <div className="pt-3 pb-2 bg-gray-800/50 rounded-lg mb-3">
      <div className="px-3 mb-2 border-b border-gray-700 pb-2">
        <h3 className="text-md font-semibold text-purple-300">Passe {passe.passeNumber}</h3>
        <div className="text-xs text-gray-400">
          <span className={focusedPlayerId && playerTeam === 'top' ? 'font-bold text-white' : ''}>Team Oben: {teamTopDisplay}</span><br/>
          <span className={focusedPlayerId && playerTeam === 'bottom' ? 'font-bold text-white' : ''}>Team Unten: {teamBottomDisplay}</span>
        </div>
      </div>
      
      {/* Entfernt: Lade- und Fehlerzustände, da Runden direkt verfügbar sind oder leer */}
      {/* {status === 'loading' && ( ... )} */}
      {/* {status === 'error' && <p className="text-xs text-red-400 text-center px-3 py-2">Fehler beim Laden der Runden.</p>} */}
      
      {/* Anpassung der Bedingung: Prüfe nur, ob finalizedJassRoundsToShow Elemente hat */}
      {finalizedJassRoundsToShow.length > 0 ? (
        <div className="space-y-0 px-2">
          {finalizedJassRoundsToShow.map((round, displayIndex) => {
            const prevRound = displayIndex > 0 ? finalizedJassRoundsToShow[displayIndex - 1] : undefined;
            const roundPoints = getRoundPoints(round, prevRound);
            const roundJassPoints = round.jassPoints ?? roundPoints;
            const roundWeisPoints = round.weisPoints ?? { top: 0, bottom: 0 };
            const hasWeisPoints = roundWeisPoints.top > 0 || roundWeisPoints.bottom > 0;
            const startingTeam = getStartingTeamPosition(round.startingPlayer);
            const trumpfFarbeForPictogram = mapDbValueToJassColorType(round.farbe as string | undefined);
            const displayRoundNumber = displayIndex + 1;
            
            // NEU: Matsch/Kontermatsch-Erkennung für Farbkodierung
            const isMatschRound = round.strichInfo?.type === 'matsch';
            const isKontermatschRound = round.strichInfo?.type === 'kontermatsch';

            // Hervorhebung, wenn der focusedPlayer im startenden Team ist
            const isFocusedPlayerStartingTeam = focusedPlayerId && playerTeam === startingTeam;

            return (
              <div key={`runde-${round.roundId || displayIndex}`} className="grid grid-cols-[auto_1fr_1fr] gap-x-2 items-center text-xs py-0.5 hover:bg-gray-700/30 rounded px-1">
                <div className="text-center font-medium text-gray-400 w-6">R{displayRoundNumber}</div>
                <div className={`text-left ${startingTeam === 'bottom' ? 'font-bold text-white' : 'text-gray-400'} ${isFocusedPlayerStartingTeam && startingTeam === 'bottom' ? 'ring-1 ring-purple-400 rounded px-0.5' : ''} truncate`}>
                  <span className="inline-flex items-center">
                    {startingTeam === 'bottom' && trumpfFarbeForPictogram && <FarbePictogram farbe={trumpfFarbeForPictogram} cardStyle={cardStyle} className="w-3 h-3 mr-1" />}
                    <span className={isMatschRound ? 'text-purple-400' : isKontermatschRound ? 'text-red-400' : ''}>{roundJassPoints.bottom}</span>
                  </span>
                </div>
                <div className={`text-right ${startingTeam === 'top' ? 'font-bold text-white' : 'text-gray-400'} ${isFocusedPlayerStartingTeam && startingTeam === 'top' ? 'ring-1 ring-purple-400 rounded px-0.5' : ''} truncate`}>
                  <span className="inline-flex items-center justify-end">
                    <span className={isMatschRound ? 'text-purple-400' : isKontermatschRound ? 'text-red-400' : ''}>{roundJassPoints.top}</span>
                    {startingTeam === 'top' && trumpfFarbeForPictogram && <FarbePictogram farbe={trumpfFarbeForPictogram} cardStyle={cardStyle} className="w-3 h-3 ml-1" />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : ( 
        <p className="text-xs text-gray-500 text-center px-3 py-2">Keine abgeschlossenen Runden für diese Passe.</p>
      )}
    </div>
  );
};

// Hauptkomponente
interface TournamentRoundHistoryDisplayProps {
  tournamentGames: TournamentGame[]; 
  playerNames: PlayerNames; 
  cardStyle: CardStyle; 
  playerPhotoUrlMapping?: Record<string, string>;
  onSwipe?: (direction: 'left' | 'right') => void; 
  focusedPlayerId?: string;
}

export const TournamentRoundHistoryDisplay: React.FC<TournamentRoundHistoryDisplayProps> = ({ 
  tournamentGames, 
  playerNames, 
  cardStyle,
  playerPhotoUrlMapping,
  focusedPlayerId,
}) => {
  if (!tournamentGames || tournamentGames.length === 0) {
    return <div className="text-center text-gray-400 py-8">Keine Passen-Daten für die Rundenhistorie verfügbar.</div>;
  }

  return (
    <div className="flex flex-col w-full space-y-4 min-w-max">
      {tournamentGames.map((passe, passeIndex) => (
        <PasseDetails 
          key={`passe-details-${passe.passeId || passeIndex}`} 
          passe={passe} 
          globalPlayerNames={playerNames} 
          cardStyle={cardStyle}
          playerPhotoUrlMapping={playerPhotoUrlMapping} 
          focusedPlayerId={focusedPlayerId}
        />
      ))}
    </div>
  );
}; 