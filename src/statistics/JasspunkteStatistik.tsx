import React, { useEffect } from "react";
// Entferne den direkten Timestamp-Import, wird hier nicht benötigt
// import { Timestamp } from "firebase/firestore";
// Importiere nur die benötigten Typen aus jass.ts
import { GameEntry, CompletedGameSummary, StricheRecord, StrokeSettings } from "@/types/jass";
import { StatisticProps } from "../types/statistikTypes";
import ResultatZeile from "@/components/game/ResultatZeile";
import { useGameStore } from "../store/gameStore";
import { animated, useSpring } from "react-spring";

// Leerer StricheRecord als Default für ResultatZeile
const dummyStriche: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };

export const JasspunkteStatistik: React.FC<StatisticProps> = ({
  games,
  currentGameId,
  strokeSettings,
  onSwipe,
}) => {
  const activeGameScores = useGameStore((state) => state.scores) || { top: 0, bottom: 0 };
  const activeGameWeisPoints = useGameStore((state) => state.weisPoints) || { top: 0, bottom: 0 };
  const isGameStoreActive = useGameStore((state) => state.isGameStarted && !state.isGameCompleted);

  // Animation für neue Punkte
  const fadeProps = useSpring({
    from: {opacity: 0.3, transform: "scale(0.97)"},
    to: {opacity: 1, transform: "scale(1)"},
    reset: true,
    key: `${activeGameScores.top + activeGameScores.bottom}`,
    config: {tension: 280, friction: 20},
  });

  // Debug-Logging
  useEffect(() => {
    if (games && games.length > 0) {
      console.log(`JasspunkteStatistik: Geladen mit ${games.length} Spielen`);
      console.log("Aktives Spiel:", currentGameId);
      const gameIds = games.map(g => 'gameNumber' in g ? g.gameNumber : g.id);
      console.log("Spiel-IDs in der Liste:", gameIds);
    }
  }, [games, currentGameId]);

  // Wenn keine Daten vorhanden
  if (!games || games.length === 0) {
    return <div className="text-center text-gray-400 py-8">Keine Punktedaten verfügbar.</div>;
  }

  // Sortiere Spiele nach der displayNummer (falls vorhanden), sonst Fallback
  const sortedGames = [...games].sort((a, b) => {
    const getSortKey = (item: GameEntry | CompletedGameSummary): number => {
      // Primär nach displayNumber sortieren
      const displayNum = (item as any).displayNumber;
      if (typeof displayNum === 'number' && !isNaN(displayNum)) {
        return displayNum;
      }
      // Fallback: gameNumber oder id
      const value = 'gameNumber' in item ? item.gameNumber : item.id;
      const numberValue = typeof value === 'string' ? parseInt(value, 10) : value;
      return typeof numberValue === 'number' && !isNaN(numberValue) ? numberValue : 0;
    };

    const keyA = getSortKey(a);
    const keyB = getSortKey(b);
    return keyA - keyB; // Sortiert aufsteigend (1, 2, 3...)
  });

  return (
    <animated.div
      style={fadeProps}
      className="flex flex-col w-full"
    >
      {sortedGames.map((game, index) => {
        // Eindeutigen Identifier für das Spiel extrahieren
        const gameIdentifier = 'gameNumber' in game ? game.gameNumber : game.id;
        
        // Prüfen, ob dies das aktive Spiel ist
        const isCurrent = isGameStoreActive && gameIdentifier === currentGameId;
        
        // Punkte je nach Spieltyp und Status ermitteln
        let topPoints = 0;
        let bottomPoints = 0;
        
        if (isCurrent) {
          // Für das aktive Spiel die aktuellen Werte aus dem GameStore verwenden
          topPoints = activeGameScores.top + activeGameWeisPoints.top;
          bottomPoints = activeGameScores.bottom + activeGameWeisPoints.bottom;
        } else if ('finalScores' in game) {
          // Für abgeschlossene Spiele die finalen Punkte verwenden
          topPoints = game.finalScores.top;
          bottomPoints = game.finalScores.bottom;
        } else if ('teams' in game) {
          // Für Spiele im GameEntry-Format
          const jassPointsTop = game.teams.top.jassPoints || 0;
          const weisPointsTop = game.teams.top.weisPoints || 0;
          const jassPointsBottom = game.teams.bottom.jassPoints || 0;
          const weisPointsBottom = game.teams.bottom.weisPoints || 0;
          
          topPoints = jassPointsTop + weisPointsTop;
          bottomPoints = jassPointsBottom + weisPointsBottom;
        }
        
        // Eindeutigen Key generieren
        const keyPrefix = isCurrent ? 'active-game-' : 'completed-game-';
                
        // --- KORREKTUR: Verwende die übergebene `displayNumber` --- 
        const displayGameNumber = (game as any).displayNumber ?? index + 1;
        // --- ENDE KORREKTUR --- 

        // HIER: Direkte Implementierung der Zeile mit Grid-Layout
        return (
          <div 
            key={`${keyPrefix}${gameIdentifier}`} 
            className="grid grid-cols-[1fr_4fr_4fr] gap-4 items-center py-3 border-b border-gray-700/50 last:border-b-0"
          >
            {/* Spalte 1: Spielnummer */}
            <div className="text-gray-400 text-left pl-3">
              {displayGameNumber}
            </div>
            {/* Spalte 2: Team 1 (Bottom) Punkte */}
            <div className="text-center">
              <span className="text-xl text-white inline-block">
                {bottomPoints}
              </span>
            </div>
            {/* Spalte 3: Team 2 (Top) Punkte */}
            <div className="text-center">
              <span className="text-xl text-white inline-block">
                {topPoints}
              </span>
            </div>
          </div>
        );
      })}
    </animated.div>
  );
};
