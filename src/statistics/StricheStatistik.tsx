import React, { useEffect } from "react";
import { GameEntry, CompletedGameSummary, StricheRecord, StrokeSettings } from '@/types/jass';
import ResultatZeile from "@/components/game/ResultatZeile";
import {useGameStore} from "../store/gameStore";
import type { CardStyle } from '@/types/jass';

// Standard-Striche für den Fall, dass keine Daten vorhanden sind (sollte nicht passieren, aber sicher ist sicher)
const defaultStriche: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };

interface StricheStatistikProps {
  teams: any; // Typ präzisieren, falls möglich
  games: (GameEntry | CompletedGameSummary)[]; // Union Type für das Array
  currentGameId: number;
  cardStyle: CardStyle;
  strokeSettings: StrokeSettings;
  onSwipe?: (direction: 'left' | 'right') => void; // Optional gemacht mit ?
}

// StricheStatistik verwendet jetzt wieder die 'games' Prop
export const StricheStatistik: React.FC<StricheStatistikProps> = ({
  games,
  currentGameId,
  strokeSettings,
}) => {
  const gameStore = useGameStore();

  // DEBUG: Verbessertes Logging für games
  useEffect(() => {
    if (games && games.length > 0) {
      // Alle Debug-Logs sind bereits auskommentiert
    }
  }, [games]);

  // Wenn keine Spiele vorhanden sind, zeige eine Meldung
  if (!games || games.length === 0) {
    return <div className="text-center text-gray-400 py-8">Keine Spieldaten vorhanden.</div>;
  }

  return (
    <div className="flex flex-col w-full space-y-4">
      {/* Iteriere über die 'games'-Liste und rendere für jedes Spiel eine ResultatZeile */}
      <div>
        {games.map((game, index) => {
          let spielNummer: number;
          let gameIdentifier: string | number; // Eindeutiger Identifier für den Key
          let topStriche: StricheRecord;
          let bottomStriche: StricheRecord;

          // Typ-Prüfung und Datenextraktion
          if ('teams' in game && game.teams) { 
            // Es ist ein GameEntry (lokales Spiel oder aktives Spiel)
            const gameEntry = game as GameEntry;
            // Sicherer Zugriff auf id, die in GameEntry existiert, aber nicht in CompletedGameSummary
            const rawId = gameEntry.id;
            const numericId = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;
            spielNummer = typeof numericId === 'number' && !isNaN(numericId) ? numericId : index + 1; // Fallback auf Index
            gameIdentifier = rawId; // Identifier für Key kann String oder Zahl sein
            
            // Zusätzlich auf Existenz von top/bottom prüfen
            if (gameEntry.teams.top && gameEntry.teams.bottom) {
              topStriche = gameEntry.teams.top.striche ?? defaultStriche;
              bottomStriche = gameEntry.teams.bottom.striche ?? defaultStriche;
            } else {
              topStriche = defaultStriche;
              bottomStriche = defaultStriche;
            }
          } else if ('finalStriche' in game && game.finalStriche) {
            // Es ist ein CompletedGameSummary (abgeschlossenes Online-Spiel)
            const completedGame = game as CompletedGameSummary;
            spielNummer = completedGame.gameNumber;
            gameIdentifier = `summary-${completedGame.gameNumber}`; // Eindeutiger Identifier für Summaries
            topStriche = completedGame.finalStriche?.top ?? defaultStriche;
            bottomStriche = completedGame.finalStriche?.bottom ?? defaultStriche;
          } else {
            // Fallback oder Fehlerbehandlung, falls der Typ unerwartet ist
            console.warn("Unerwarteter Spieltyp in StricheStatistik:", game);
            return null; // Oder eine Platzhalter-Komponente rendern
          }

          // Daten für ResultatZeile vorbereiten
          const topTeamData = { striche: topStriche };
          const bottomTeamData = { striche: bottomStriche };

          // Eindeutiger Key mit Typ-Prefix
          const keyPrefix = 'teams' in game ? 
            ('__isPlaceholder' in game ? 'active-' : 'local-') : 
            'online-';

          // --- KORREKTUR: Verwende die übergebene `displayNumber` --- 
          const displayGameNumber = (game as any).displayNumber ?? index + 1;
          // --- ENDE KORREKTUR ---

          // Ist dies das aktuelle Spiel?
          const isCurrent = gameStore.isGameStarted && 
                          !gameStore.isGameCompleted && 
                          spielNummer === currentGameId;

          return (
            <ResultatZeile
              key={`${keyPrefix}${gameIdentifier}-${index}`} // Eindeutiger Key mit Identifier und Index
              gameId={spielNummer} // gameId bleibt ggf. für interne Logik relevant?
              spielNummer={displayGameNumber} // Verwende die korrigierte Nummer für die Anzeige
              topTeam={topTeamData} 
              bottomTeam={bottomTeamData}
              showJassPoints={false} // Nur Striche anzeigen
              strokeSettings={strokeSettings}
              isCurrentGameRow={false} // Immer false, um konsistenten Hintergrund zu gewährleisten
            />
          );
        })}
      </div>
    </div>
  );
};
