import React from 'react';
import { Timestamp } from 'firebase/firestore';
import type { GameEntry, PlayerNames, CardStyle, RoundEntry, TeamPosition, JassColor, PlayerNumber, JassRoundEntry, TeamStand, StrokeSettings, CompletedGameSummary } from '@/types/jass';
import { FarbePictogram } from '@/components/settings/FarbePictogram'; // Pfad ggf. anpassen
import { CARD_SYMBOL_MAPPINGS } from '@/config/CardStyles';
import { StatisticProps } from '../types/statistikTypes'; // Importiere den Basis-Prop-Typ
import { useGameStore } from "../store/gameStore"; // Korrekter Pfad

// NEUE ZENTRALE MAPPING-FUNKTION
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

  console.warn(`[mapDbValueToJassColorType] Unbekannter DB-Wert: '${dbValue}', konnte nicht zu JassColor gemappt werden.`);
  return undefined;
};

// Helper to get points for a specific round by diffing cumulative scores
const getRoundPoints = (round: RoundEntry, prevRound: RoundEntry | undefined): { top: number; bottom: number } => {
  // Stellt sicher, dass scores existieren (sollte immer der Fall sein)
  const currentTopScore = round.scores?.top ?? 0;
  const currentBottomScore = round.scores?.bottom ?? 0;
  const prevTopScore = prevRound?.scores?.top ?? 0;
  const prevBottomScore = prevRound?.scores?.bottom ?? 0;

  const topPoints = currentTopScore - prevTopScore;
  const bottomPoints = currentBottomScore - prevBottomScore;
  return { top: topPoints, bottom: bottomPoints };
};

// Helper to determine starting team position - VEREINFACHTE VERSION, die auch im Gast-Modus funktioniert
const getStartingTeamPosition = (startingPlayer: PlayerNumber | undefined): TeamPosition | null => {
    if (startingPlayer === undefined) return null;
    
    // FESTE TEAM-ZUORDNUNG in Jassguru:
    // Spieler 1 und 3 gehören zu Team Bottom (Team 1)
    // Spieler 2 und 4 gehören zu Team Top (Team 2)
    // ⬇⬇⬇ VEREINFACHTE DIREKTE ZUORDNUNG ⬇⬇⬇
    if (startingPlayer === 1 || startingPlayer === 3) return 'bottom';
    if (startingPlayer === 2 || startingPlayer === 4) return 'top';
    
    console.warn(`Ungültige Spielernummer für startingPlayer: ${startingPlayer}`);
    return null;
};

// Type guard to check if entry is a JassRoundEntry and finalized
const isFinalizedJassRound = (entry: RoundEntry): entry is JassRoundEntry & { isRoundFinalized: true, startingPlayer: PlayerNumber } => {
  // Sicherstellen, dass startingPlayer existiert und der Typ korrekt ist
  // UND dass 'farbe' ein gültiger String ist.
  // NEU: Auch sicherstellen, dass die Runde aktiv ist (oder kein isActive-Flag hat, was bedeutet, dass sie aktiv ist)
  return entry.actionType === 'jass' && 
         entry.isRoundFinalized === true && 
         typeof entry.startingPlayer === 'number' &&
         (typeof entry.farbe === 'string' && entry.farbe.length > 0 || entry.farbe === undefined) && // Erlaube auch undefined farbe
         (entry.isActive === undefined || entry.isActive === true); // NEU: Nur aktive Runden oder solche ohne isActive-Flag
};

// Verwende wieder StatisticProps
export const RoundHistoryDisplay: React.FC<StatisticProps> = ({ 
  games, // Enthält abgeschlossene Spiele (CompletedGameSummary[]) UND ggf. das aktive Spiel
  playerNames, // Wird nicht direkt verwendet, aber ggf. von untergeordneten Komponenten?
  cardStyle, 
  // teams, // Nicht direkt verwendet
  strokeSettings, // Nicht direkt verwendet
  currentGameId, // ID des aktiven Spiels im JassStore
  onSwipe, // Nicht direkt verwendet
}) => {

  // --- Hole den aktuellen Navigationsindex für das *aktive* Spiel --- 
  const activeGameRoundHistory = useGameStore((state) => state.roundHistory);
  const isGameStoreActive = useGameStore((state) => state.isGameStarted && !state.isGameCompleted);
  const currentHistoryIndex = useGameStore((state) => state.currentHistoryIndex);
  // --- ENDE --- 

  // --- NEU: Verwende die übergebene `games`-Liste direkt --- 
  let allGamesForDisplay = [...games]; // Kopiere die Prop, um sie zu bearbeiten
  // --- ENDE NEU --- 

  // Spiele nach Zeitstempel sortieren (älteste zuerst)
  allGamesForDisplay.sort((a, b) => {
    // Extrahiere Timestamps
    let timestampA: number;
    let timestampB: number;
    
    if ('timestampCompleted' in a && a.timestampCompleted) {
      // CompletedGameSummary hat timestamps im Firestore Timestamp Format
      timestampA = a.timestampCompleted instanceof Timestamp ? 
                  a.timestampCompleted.toMillis() : 
                  a.timestampCompleted as any;
    } else if ('timestamp' in a) {
      // GameEntry (oder das aktive Spiel-Objekt) hat timestamp als number
      timestampA = a.timestamp as number;
    } else {
      // Fallback auf 0 (sollte nicht vorkommen)
      timestampA = 0;
    }
    
    if ('timestampCompleted' in b && b.timestampCompleted) {
      timestampB = b.timestampCompleted instanceof Timestamp ? 
                  b.timestampCompleted.toMillis() : 
                  b.timestampCompleted as any;
    } else if ('timestamp' in b) {
      timestampB = b.timestamp as number;
    } else {
      timestampB = 0;
    }
    
    // Sortiere aufsteigend nach Zeitstempel (älteste zuerst)
    return timestampA - timestampB;
  });
  
  // Nummeriere die Spiele neu, damit sie fortlaufend sind (S1, S2, etc.)
  allGamesForDisplay = allGamesForDisplay.map((game, index) => {
    // Erstelle eine Kopie des Spiels
    const gameCopy = {...game};
    // Setze eine neue displayNumber Eigenschaft
    (gameCopy as any).displayNumber = index + 1;
    return gameCopy;
  });
  
  if (!allGamesForDisplay || allGamesForDisplay.length === 0) {
    return <div className="text-center text-gray-400 py-8">Keine Spieldaten verfügbar.</div>;
  }

  return (
    <div className="flex flex-col w-full space-y-1 min-w-max">
      {/* Iteriere über die kombinierte Liste */} 
      {allGamesForDisplay.map((game, index) => {
        // Logge das Objekt direkt am Anfang
        // console.log(`[RoundHistoryDisplay MAP START] Index: ${index}, Game Object Type: ${'teams' in game ? 'GameEntry' : 'CompletedGameSummary'}`, JSON.parse(JSON.stringify(game)));
        
        // --- BEGIN TRY-CATCH BLOCK ---
        try {
          // KORREKTUR: Eindeutigen Identifier typsicher bestimmen
          const gameIdentifier = 'gameNumber' in game ? game.gameNumber : game.id;
          // Sicherstellen, dass gameIdentifier eine Zahl oder ein String ist
          const gameIdForLog = typeof gameIdentifier === 'number' || typeof gameIdentifier === 'string' ? gameIdentifier : `invalid_id_${index}`;
          
          // NEU: Verwende displayNumber für die Anzeige
          const displayGameNumber = (game as any).displayNumber || (index + 1);
          
          const fullRoundHistory = game.roundHistory ?? [];
          
          // --- DEBUG LOGGING --- 
          // console.log(`[RoundHistoryDisplay MAP TRY] Processing game index ${index}, identifier: ${gameIdForLog}, history length: ${fullRoundHistory.length}`);
          // --- ENDE DEBUG LOGGING ---
          
          // === NEU: Nur Runden bis zum aktuellen Index berücksichtigen ===
          const historyEndIndex = gameIdentifier === currentGameId && isGameStoreActive 
                                ? currentHistoryIndex 
                                : fullRoundHistory.length - 1;
          const relevantHistorySlice = fullRoundHistory.slice(0, historyEndIndex + 1);
          
          // Filtere den relevanten Slice direkt mit dem umfassenden Type Guard
          const finalizedJassRoundsToShow = relevantHistorySlice.filter(isFinalizedJassRound);
          
          // --- DEBUG LOGGING --- 
          // console.log(`[RoundHistoryDisplay MAP TRY] Game ${gameIdForLog} (Display: S${displayGameNumber}): relevantHistorySlice length: ${relevantHistorySlice.length}, finalizedJassRoundsToShow length: ${finalizedJassRoundsToShow.length}`);
          // if (finalizedJassRoundsToShow.length > 0) {
          //   console.log(`[RoundHistoryDisplay MAP TRY] First round of game ${displayGameNumber}: roundState=${JSON.stringify(finalizedJassRoundsToShow[0].roundState)}, isActive=${finalizedJassRoundsToShow[0].isActive}`);
            
          //   // Runden nach roundState.roundNumber sortieren
          //   finalizedJassRoundsToShow.sort((a, b) => 
          //     (a.roundState?.roundNumber || 0) - (b.roundState?.roundNumber || 0)
          //   );
          // }
          // --- ENDE DEBUG LOGGING ---

          // --- KEY LOGIK --- 
          let itemKey: string;
          const rawId = 'gameNumber' in game ? game.gameNumber : game.id;
          const keySuffix = typeof rawId === 'string' ? rawId : typeof rawId === 'number' ? rawId.toString() : `idx-${index}`;
          itemKey = `game-${keySuffix}`;
          // --- ENDE KEY LOGIK ---

          const isCurrent = isGameStoreActive && gameIdentifier === currentGameId;
          
          // Finale Punkte holen
          const finalScoreData = (() => {
            if ('finalScores' in game) {
              return { 
                top: { total: game.finalScores.top }, 
                bottom: { total: game.finalScores.bottom } 
              };
            } else if ('teams' in game) {
              return { 
                top: { total: (game.teams.top.jassPoints ?? 0) + (game.teams.top.weisPoints ?? 0) }, 
                bottom: { total: (game.teams.bottom.jassPoints ?? 0) + (game.teams.bottom.weisPoints ?? 0) } 
              };
            } else {
               console.warn("[RoundHistoryDisplay] Unerwarteter Spiel-Typ:", game);
               return { top: { total: 0 }, bottom: { total: 0 } }; 
            }
          })();
          
          // --- RENDERING --- 
          // console.log(`[RoundHistoryDisplay MAP] Rendering game block for index ${index}, identifier: ${gameIdForLog}`);
          
          return (
            <div key={itemKey} className={`pt-2 pb-1 ${isCurrent ? 'bg-gray-700/50 rounded' : ''}`}>
              
              {/* Spiel-Header */} 
              <div className="grid grid-cols-[2rem_5fr_5fr] gap-8 items-center px-1 mb-1">
                <div className="text-base font-semibold text-white text-left pl-2 whitespace-nowrap">
                  S{displayGameNumber} {/* Verwende displayNumber */} 
                </div>
                <div></div>{/* Leere Spalten */} 
                <div></div>
              </div>
              
              {/* Bedingtes Rendering basierend auf finalisierten Runden */} 
              {finalizedJassRoundsToShow.length > 0 ? (
                <div className="space-y-0 px-1">
                  {/* Runden-Mapping */}
                  {finalizedJassRoundsToShow.map((round, displayIndex) => {
                    // KORREKTUR: prevRound aus der *gleichen* gefilterten Liste holen
                    const prevRound = displayIndex > 0 ? finalizedJassRoundsToShow[displayIndex - 1] : undefined;
                    const roundPoints = getRoundPoints(round, prevRound);
                    
                    // --- WIEDER EINGEFÜGTE DEFINITIONEN ---
                    const roundJassPoints = round.jassPoints ?? roundPoints;
                    const roundWeisPoints = round.weisPoints ?? { top: 0, bottom: 0 };
                    const hasWeisPoints = roundWeisPoints.top > 0 || roundWeisPoints.bottom > 0;
                    const startingTeam = getStartingTeamPosition(round.startingPlayer);
                    const trumpfFarbeForPictogram = mapDbValueToJassColorType(round.farbe as string | undefined); // Cast zu string, da round.farbe JassColor sein kann
                    const cumulativeScoreTop = round.scores?.top ?? 0;
                    const cumulativeScoreBottom = round.scores?.bottom ?? 0;
                    // --- ENDE WIEDER EINGEFÜGTE DEFINITIONEN ---

                    // KORREKTUR: Verwende die logische Rundennummer aus dem Rundenobjekt
                    const displayRoundNumber = round.roundState.roundNumber; 
                    // DEBUG LOG:
                    // if (displayIndex === 0) {
                    //     console.log(`[RoundHistoryDisplay DEBUG] Rendering first round for game ${gameIdentifier}: displayIndex=${displayIndex}, displayRoundNumber=${displayRoundNumber}, roundId (timestamp)=${round.roundId}`);
                    // }

                    // console.log(`[RoundHistoryDisplay] Runde ${displayRoundNumber}: ID=${round.id}, startingPlayer=${round.startingPlayer}, isActive=${round.isActive}`);
                    const startingTeamDetermined = getStartingTeamPosition(round.startingPlayer);
                    // console.log(`[RoundHistoryDisplay] Runde ${displayRoundNumber}: Determined startingTeam=${startingTeamDetermined}`);

                    return (
                      <React.Fragment key={round.id ?? `round-${gameIdentifier}-${displayIndex}`}>
                        {/* Jasspunkte-Anzeige */}
                        <div className={`grid grid-cols-[2rem_5fr_5fr] gap-8 items-center ${hasWeisPoints ? 'pb-0 pt-3 border-b-0' : 'py-3 border-b border-gray-700/50 last:border-b-0'}`}>
                          <div className="text-base text-gray-400 text-left pl-3">
                            {displayRoundNumber} {/* Verwende korrigierte Rundennummer */}
                          </div>
                          {/* Team Bottom Jasspunkte & Piktogramm */}
                          <div className="grid-cell">
                            <div className="flex justify-center">
                              <div className="text-xl text-white text-right pr-8 w-[120px]">
                                <div className="inline-flex items-center justify-end">
                                  <span className="w-7 h-5 mr-2 flex-shrink-0 flex items-center justify-end">
                                    {startingTeam === 'bottom' && trumpfFarbeForPictogram ? (
                                      <FarbePictogram 
                                        farbe={trumpfFarbeForPictogram} 
                                        mode="svg"
                                        cardStyle={cardStyle}
                                        className="w-5 h-5"
                                      />
                                    ) : null}
                                  </span>
                                  <span>{roundJassPoints.bottom}</span> 
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* Team Top Jasspunkte & Piktogramm */}
                           <div className="grid-cell">
                            <div className="flex justify-center">
                              <div className="text-xl text-white text-right pr-10 w-[120px]">
                                <div className="inline-flex items-center justify-end">
                                  <span className="w-7 h-5 mr-2 flex-shrink-0 flex items-center justify-end">
                                    {startingTeam === 'top' && trumpfFarbeForPictogram ? (
                                      <FarbePictogram 
                                        farbe={trumpfFarbeForPictogram} 
                                        mode="svg"
                                        cardStyle={cardStyle}
                                        className="w-5 h-5"
                                      />
                                    ) : null}
                                  </span>
                                  <span>{roundJassPoints.top}</span> 
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Weispunkte-Anzeige (nur wenn vorhanden) */}
                        {hasWeisPoints && (
                          <div className="grid grid-cols-[2rem_5fr_5fr] gap-8 items-center pt-0 pb-3 border-b border-gray-700/50 last:border-b-0">
                            <div className="text-left pl-3"></div> 
                            {/* Team Bottom Weispunkte */}
                            <div className="grid-cell">
                              <div className="flex justify-center">
                                <div className="text-xl text-white text-right pr-8 w-[120px]">
                                  <div className="inline-flex items-center justify-end">
                                    <span className="w-7 h-5 mr-2 flex-shrink-0"></span> 
                                    {roundWeisPoints.bottom > 0 && <span className="text-blue-400">{roundWeisPoints.bottom}</span>} 
                                  </div>
                                </div>
                              </div>
                            </div>
                            {/* Team Top Weispunkte */}
                            <div className="grid-cell">
                              <div className="flex justify-center">
                                <div className="text-xl text-white text-right pr-10 w-[120px]">
                                  <div className="inline-flex items-center justify-end">
                                     <span className="w-7 h-5 mr-2 flex-shrink-0"></span>
                                     {roundWeisPoints.top > 0 && <span className="text-blue-400">{roundWeisPoints.top}</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* --- Kumulativer Spielstand Zeile --- */}
                        {/* Nur anzeigen, wenn es NICHT die letzte Runde ist */}
                        {displayIndex < finalizedJassRoundsToShow.length - 1 && (
                          <div className="grid grid-cols-[2rem_5fr_5fr] gap-8 items-center py-1 text-sm text-gray-500">
                            {/* Entferne Summenzeichen */}
                            <div className="text-left pl-3"></div> 
                            {/* Team Bottom Kumulativ - Ausrichtung wie Rundenpunkte */} 
                            <div className="grid-cell">
                              <div className="flex justify-center">
                                <div className="text-right pr-8 w-[120px]"> {/* text-sm und text-gray-500 geerbt */} 
                                  <div className="inline-flex items-center justify-end">
                                    <span className="w-7 h-5 mr-2 flex-shrink-0"></span> {/* Leerer Span für Ausrichtung */} 
                                    <span>{cumulativeScoreBottom}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            {/* Team Top Kumulativ - Ausrichtung wie Rundenpunkte */} 
                            <div className="grid-cell">
                              <div className="flex justify-center">
                                <div className="text-right pr-10 w-[120px]"> {/* text-sm und text-gray-500 geerbt */} 
                                  <div className="inline-flex items-center justify-end">
                                    <span className="w-7 h-5 mr-2 flex-shrink-0"></span> {/* Leerer Span für Ausrichtung */} 
                                    <span>{cumulativeScoreTop}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* ------------------------------------------ */}
                      </React.Fragment>
                    );
                  })}

                  {/* Endstand-Zeile */}
                  {/* Zeige Endstand für alle Spiele mit finalScoreData */} 
                  {finalScoreData && (
                    <div className="grid grid-cols-[2rem_5fr_5fr] gap-8 items-center py-2 text-yellow-400 border-t-2 border-yellow-400/50 mt-2">
                      <div className="text-sm font-semibold text-left pl-2 whitespace-nowrap">
                        Total (S{displayGameNumber}):
                      </div>
                      {/* Team Bottom Total - Ausrichtung wie Rundenpunkte, Textgrösse angepasst */}
                      <div className="grid-cell">
                         <div className="flex justify-center">
                           <div className="text-base font-semibold text-right pr-8 w-[120px]"> {/* text-base, font-semibold */} 
                              <div className="inline-flex items-center justify-end">
                                <span className="w-7 h-5 mr-2 flex-shrink-0"></span>
                                <span>{finalScoreData.bottom.total ?? 0}</span>
                              </div>
                            </div>
                         </div>
                       </div>
                      {/* Team Top Total - Ausrichtung wie Rundenpunkte, Textgrösse angepasst */}
                      <div className="grid-cell">
                         <div className="flex justify-center">
                            <div className="text-base font-semibold text-right pr-10 w-[120px]"> {/* text-base, font-semibold */} 
                              <div className="inline-flex items-center justify-end">
                                <span className="w-7 h-5 mr-2 flex-shrink-0"></span>
                                <span>{finalScoreData.top.total ?? 0}</span>
                              </div>
                            </div>
                         </div>
                       </div>
                    </div>
                  )}
                </div>
              ) : (
                // Meldung, wenn KEINE finalisierten Runden vorhanden sind
                <div className="px-1">
                  {/* Hinweis, dass keine Runden vorhanden sind */}
                  <p className="text-sm text-center text-gray-500 py-2">
                    Keine Rundendetails für Spiel {displayGameNumber} verfügbar.
                  </p>
                
                  {/* Trotzdem Endstand anzeigen */}
                  {finalScoreData && (
                    <div className="grid grid-cols-[2rem_5fr_5fr] gap-8 items-center py-2 text-yellow-400 border-t-2 border-yellow-400/50 mt-2">
                      <div className="text-sm font-semibold text-left pl-2 whitespace-nowrap">
                        Total (S{displayGameNumber}):
                      </div>
                      <div className="grid-cell">
                        <div className="flex justify-center">
                          <div className="text-base font-semibold text-right pr-8 w-[120px]">
                            <div className="inline-flex items-center justify-end">
                              <span className="w-7 h-5 mr-2 flex-shrink-0"></span>
                              <span>{finalScoreData.bottom.total ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="grid-cell">
                        <div className="flex justify-center">
                          <div className="text-base font-semibold text-right pr-10 w-[120px]">
                            <div className="inline-flex items-center justify-end">
                              <span className="w-7 h-5 mr-2 flex-shrink-0"></span>
                              <span>{finalScoreData.top.total ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        // --- END TRY-CATCH BLOCK ---
        } catch (error) {
            // KORRIGIERTES LOGGING
            // console.error(`[RoundHistoryDisplay MAP ERROR] Detaillierter Fehler für Spiel index ${index} (Identifier: ${'gameNumber' in game ? game.gameNumber : game.id}):`, error, JSON.stringify(game));
            // Rendere nichts oder eine Fehlermeldung für dieses spezifische Element
            return <div key={`error-${index}`} className="text-red-500 text-center py-2">Fehler beim Laden von Spiel {index + 1}.</div>;
        }
      })}
    </div>
  );
}; 