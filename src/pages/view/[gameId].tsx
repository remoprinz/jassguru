import { useRouter } from 'next/router';
import React, { useEffect, useState, useCallback } from 'react';
import { db } from '@/services/firebaseInit'; // Pfad anpassen, falls nötig
import { useGroupStore } from '@/store/groupStore'; // Import für GroupStore
import { doc, onSnapshot, collection, query, orderBy, Timestamp, getDocs } from 'firebase/firestore';
import type { 
  ActiveGame, 
  RoundDataFirebase, // Typ aus jass.ts wird hier nicht mehr direkt für State benötigt
  GameEntry, 
  PlayerNames, 
  TeamScores, 
  StricheRecord,
  PlayerNumber, // PlayerNumber importieren
  RoundEntry, // Für die Typumwandlung der Rundendaten
  CompletedGameSummary // CompletedGameSummary importieren
} from '@/types/jass'; // Pfad anpassen, falls nötig
// Komponenten importieren
// import ResultatKreidetafel from '@/components/layout/ResultatKreidetafel'; // Alter Import
import GameViewerKreidetafel from '@/components/layout/GameViewerKreidetafel'; // NEUER Import
// --- AUSKOMMENTIERT: Platzhalter-Imports --- 
// import LoadingSpinner from '@/components/ui/LoadingSpinner'; 
// import ErrorMessage from '@/components/ui/ErrorMessage';   
// ------------------------------------------
import { useUIStore } from '@/store/uiStore'; // Import für UIStore

const GameViewPage: React.FC = () => {
  const router = useRouter();
  const { gameId } = router.query;
  const setReadOnlyMode = useUIStore((state) => state.setReadOnlyMode); // UIStore-Zugriff für Read-Only-Modus
  const setCurrentGroup = useGroupStore((state) => state.setCurrentGroup); // GroupStore-Zugriff für Gruppeneinstellungen

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // State für die Rohdaten aus Firestore
  const [gameData, setGameData] = useState<ActiveGame | null>(null);
  const [roundsData, setRoundsData] = useState<any[]>([]); // any verwenden, da Struktur direkt aus Firestore kommt
  const [completedGamesData, setCompletedGamesData] = useState<CompletedGameSummary[]>([]); // State for completed games
  
  // State für die aufbereiteten Daten für die Anzeige-Komponente
  const [viewerGamesData, setViewerGamesData] = useState<Array<GameEntry | CompletedGameSummary> | null>(null); // Adjusted type
  const [isReadOnlySet, setIsReadOnlySet] = useState(false); // Tracking für Read-Only Modus

  // Listener für das Haupt-Spieldokument (setzt NUR gameData)
  useEffect(() => {
    if (!gameId || typeof gameId !== 'string') {
      // Reset state if gameId is invalid or changes
      setGameData(null);
      setRoundsData([]);
      setViewerGamesData(null);
      setError(gameId !== undefined ? "Ungültige Spiel-ID." : null);
      setIsLoading(gameId !== undefined); // Show loading only if gameId was defined but invalid
      return;
    }

    // ReadOnly Modus setzen (nur einmal)
    if (!isReadOnlySet) {
      console.log("[GameView] Setting ReadOnly mode.");
      setReadOnlyMode(true);
      setIsReadOnlySet(true);
    }

    setError(null); // Clear previous errors
    setIsLoading(true); // Set loading when starting fetch for a valid gameId
    console.log(`[GameView] Setting up game listener for gameId: ${gameId}`);

    const gameDocRef = doc(db, 'activeGames', gameId);
    const unsubscribeGame = onSnapshot(gameDocRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          console.log("[GameView] Received game data snapshot.");
          setGameData(docSnap.data() as ActiveGame);
        } else {
          console.warn(`[GameView] Game document ${gameId} does not exist.`);
          setError("Spiel nicht gefunden oder bereits archiviert.");
          setGameData(null);
          // Do not set isLoading to false here, wait for combined data processing
        }
      },
      (err) => {
        console.error("[GameView] Error listening to game document:", err);
        setError("Fehler beim Laden des Spiels.");
        setGameData(null);
        setIsLoading(false); // Set loading false on error
      }
    );
    return () => {
      console.log(`[GameView] Cleaning up game listener for gameId: ${gameId}`);
      unsubscribeGame(); 
    };
  }, [gameId, setReadOnlyMode, isReadOnlySet]);

  // Listener für die Runden-Subkollektion (setzt NUR roundsData)
  useEffect(() => {
    if (!gameId || typeof gameId !== 'string') {
      setRoundsData([]); // Clear rounds data if gameId is invalid
      return; 
    }

    console.log(`[GameView] Setting up rounds listener for gameId: ${gameId}`);
    const roundsColRef = collection(db, 'activeGames', gameId, 'rounds');
    const roundsQuery = query(roundsColRef, orderBy("roundNumber", "asc")); 
    
    const unsubscribeRounds = onSnapshot(
      roundsQuery, 
      (querySnapshot) => {
        console.log("[GameView] Received rounds data snapshot.");
        const rounds: any[] = []; 
        querySnapshot.forEach((doc) => {
          rounds.push({
            id: doc.id, 
            ...doc.data() 
          });
        });
        setRoundsData(rounds);
        // Do not call createViewerGameData or setIsLoading here
      },
      (err) => {
        console.error("[GameView] Error listening to rounds collection:", err);
        // Handle error, maybe set roundsData to empty or show a warning
        setRoundsData([]); 
        // Do not set global error or loading state here, main game data might still be valid
      }
    );

    return () => {
      console.log(`[GameView] Cleaning up rounds listener for gameId: ${gameId}`);
      unsubscribeRounds();
    };
  }, [gameId]);

  // NEUER Listener für abgeschlossene Spiele (jassGameSummaries)
  useEffect(() => {
    // Reset completed games when gameData or sessionId changes
    setCompletedGamesData([]); 
    
    const sessionId = gameData?.sessionId; // Use sessionId from gameData
    console.log('[GameView] Attempting to load summaries for sessionId:', sessionId); // Log sessionId

    if (!sessionId || typeof sessionId !== 'string') {
      console.log("[GameView] No sessionId found in gameData, skipping completed games listener.");
      return; // No session ID, cannot fetch summaries
    }

    console.log(`[GameView] Setting up completed games listener for sessionId: ${sessionId}`);
    const summariesColRef = collection(db, 'jassSessions', sessionId, 'jassGameSummaries');
    const summariesQuery = query(summariesColRef, orderBy("gameNumber", "asc"));
    
    // Use onSnapshot for real-time updates, or getDocs for one-time fetch
    const unsubscribeSummaries = onSnapshot(
      summariesQuery,
      (querySnapshot) => {
        console.log("[GameView] Received completed games snapshot.");
        const summaries: CompletedGameSummary[] = [];
        querySnapshot.forEach((doc) => {
          // Ensure data conforms to CompletedGameSummary type
          // Use explicit 'unknown' cast to satisfy linter, validation recommended
          summaries.push({ id: doc.id, ...doc.data() } as unknown as CompletedGameSummary);
        });
        console.log('[GameView] Fetched summaries:', summaries); // Log fetched summaries
        setCompletedGamesData(summaries);
        console.log(`[GameView] Loaded ${summaries.length} completed games.`);
      },
      (err) => {
        console.error("[GameView] Error listening to completed games collection:", err);
        setError("Fehler beim Laden der Spielhistorie."); // Optionally set an error
        setCompletedGamesData([]);
      }
    );

    return () => {
      console.log(`[GameView] Cleaning up completed games listener for sessionId: ${sessionId}`);
      unsubscribeSummaries();
    };
  }, [gameData?.sessionId]); // Depend on sessionId from gameData

  // Effekt zur Erstellung von viewerGamesData, wenn ALLE Rohdaten vorhanden sind
  useEffect(() => {
    // Nur ausführen, wenn gameData, roundsData vorhanden sind UND der completedGames Listener initial gelaufen ist
    // (completedGamesData kann leer sein, wenn keine Spiele abgeschlossen wurden)
    if (gameData && roundsData && gameId && typeof gameId === 'string') {
       console.log("[GameView] All data sources available. Creating/Updating combined viewer data...");
       try {
          // --- Start: Logik aus alter createViewerGameData Funktion (leicht angepasst) --- 
          let timestampMillis = Date.now(); // Fallback
          if (gameData.createdAt instanceof Timestamp) {
            timestampMillis = gameData.createdAt.toMillis();
          } else {
             console.warn("[GameView] gameData.createdAt is not a Timestamp, using Date.now().");
          }
  
          // Konvertiere Firestore-Daten zu RoundEntry für GameEntry
          const convertedRounds: RoundEntry[] = roundsData.map(round => {
            // Grundlegende RoundEntry-Felder
            const baseEntry: Partial<RoundEntry> = {
              id: round.id || `round-${round.roundNumber}`,
              roundId: round.roundNumber,
              actionType: 'jass', // Wir gehen davon aus, dass alle Runden Jass-Runden sind
              timestamp: round.timestamp instanceof Timestamp ? 
                        round.timestamp.toMillis() : Date.now(),
              startingPlayer: round.startingPlayer,
              scores: { 
                top: round.scores?.top || 0, 
                bottom: round.scores?.bottom || 0 
              },
              isRoundFinalized: true,
              isCompleted: true,
              currentPlayer: round.startingPlayer,
              weisPoints: { 
                top: round.weisTop || 0, 
                bottom: round.weisBottom || 0 
              },
              jassPoints: { 
                top: round.topPoints || 0, 
                bottom: round.bottomPoints || 0 
              },
              weisActions: [],
              roundState: {
                roundNumber: round.roundNumber,
                nextPlayer: round.startingPlayer
              }
            };
            
            // Spezifische Felder für Jass-Runden
            const jassEntry: Partial<any> = {
              ...baseEntry,
              cardStyle: 'french', // Standard-Kartentyp, falls nicht in den Daten
              farbe: round.gespielteFarbe || round.farbe, // Einen der beiden verwenden, je nachdem was verfügbar ist
            };
            
            return jassEntry as RoundEntry;
          });
  
          // Default playerStats erstellen
          const defaultPlayerStats = {
            striche: 0,
            points: 0,
            weisPoints: 0
          };
          const initialPlayerStats: Record<PlayerNumber, typeof defaultPlayerStats> = {
            1: { ...defaultPlayerStats },
            2: { ...defaultPlayerStats },
            3: { ...defaultPlayerStats },
            4: { ...defaultPlayerStats },
          };
  
          // Erstelle Repräsentation des *aktuellen* Spiels
          const currentViewerGame: GameEntry = {
            id: gameData.currentGameNumber ?? 1, // Use currentGameNumber as ID
            gameNumber: gameData.currentGameNumber ?? 1, // Add gameNumber for consistency
            activeGameId: gameId, 
            timestamp: timestampMillis,
            sessionId: gameData.sessionId, // Use sessionId from gameData
            currentRound: gameData.currentRound,
            startingPlayer: gameData.startingPlayer,
            initialStartingPlayer: gameData.initialStartingPlayer,
            currentPlayer: gameData.currentPlayer,
            isGameStarted: true,
            isRoundCompleted: false, // Assume current game is not completed round-wise
            isGameCompleted: gameData.status === 'completed', // Check status
            teams: {
              top: {
                striche: gameData.striche?.top ?? { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                jassPoints: 0, 
                weisPoints: gameData.weisPoints?.top ?? 0,
                total: gameData.scores?.top ?? 0,
                bergActive: false, 
                bedankenActive: false,
                isSigned: false, 
                playerStats: initialPlayerStats,
              },
              bottom: {
                striche: gameData.striche?.bottom ?? { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                jassPoints: 0,
                weisPoints: gameData.weisPoints?.bottom ?? 0,
                total: gameData.scores?.bottom ?? 0,
                bergActive: false, 
                bedankenActive: false,
                isSigned: false,
                playerStats: initialPlayerStats,
              }
            },
            roundHistory: convertedRounds, 
            currentHistoryIndex: 0, 
            historyState: { lastNavigationTimestamp: Date.now() },
          };
          // --- Ende: Logik --- 
          
          // Kombiniere abgeschlossene Spiele und das aktuelle Spiel
          const combinedGames: Array<GameEntry | CompletedGameSummary> = [...completedGamesData];
          
          // Füge das aktuelle Spiel hinzu, wenn es nicht bereits als abgeschlossen markiert ist
          // UND wenn es nicht schon in den completedGames enthalten ist (via gameNumber)
          const isCurrentAlreadyCompleted = completedGamesData.some(
            summary => summary.gameNumber === currentViewerGame.gameNumber
          );
          
          if (!currentViewerGame.isGameCompleted && !isCurrentAlreadyCompleted) {
            combinedGames.push(currentViewerGame);
          } else if (currentViewerGame.isGameCompleted && !isCurrentAlreadyCompleted) {
            // Fall: Das aktive Spiel wurde gerade abgeschlossen, aber das Summary ist noch nicht da.
            // Füge es trotzdem hinzu, um den letzten Stand anzuzeigen.
            console.log("[GameView] Current game marked as completed, adding its representation until summary arrives.");
            combinedGames.push(currentViewerGame);
          } else if (isCurrentAlreadyCompleted) {
             console.log(`[GameView] Current game number ${currentViewerGame.gameNumber} already found in completed summaries. Not adding duplicate.`);
          }

          // Sortiere nach Spielnummer
          combinedGames.sort((a, b) => {
             const getSortKey = (item: GameEntry | CompletedGameSummary): number => {
               // Prefer gameNumber if it exists and is a number
               if ('gameNumber' in item && typeof item.gameNumber === 'number') {
                 return item.gameNumber;
               }
               // Fallback to id
               if ('id' in item) {
                 if (typeof item.id === 'number') return item.id;
                 // Attempt to parse if it's a string, otherwise default to 0
                 if (typeof item.id === 'string') {
                    const parsedId = parseInt(item.id, 10);
                    return isNaN(parsedId) ? 0 : parsedId; // Use 0 if parsing fails
                 }
               }
               return 0; // Default sort key if neither gameNumber nor id is usable
             };
             
             const keyA = getSortKey(a);
             const keyB = getSortKey(b);
             return keyA - keyB;
          });

          // Log the data just before setting the state
          console.log('[GameView] Data just before setting viewerGamesData:', { 
               completed: completedGamesData, 
               current: currentViewerGame, // Log current representation for comparison
               combined: combinedGames 
          });

          setViewerGamesData(combinedGames);
          setError(null); 
          setIsLoading(false); 

       } catch (error) {
          console.error("[GameView] Error creating combined viewer game data:", error);
          setError("Fehler bei der Datenaufbereitung.");
          setViewerGamesData(null);
          setIsLoading(false); 
       }
    } else if (gameId && !error && !isLoading) { 
       // If gameId is valid, no error, but still waiting for some data
       setIsLoading(true); // Ensure loading is true while waiting
       setViewerGamesData(null); // Clear possibly stale data
    } else if (!gameId && !error) {
        // If gameId becomes invalid (e.g., navigating away), reset loading and error
        setIsLoading(false);
        setError(null);
        setViewerGamesData(null);
    }

  }, [gameData, roundsData, completedGamesData, gameId, error]); // Depend on all data sources and gameId/error

  // Neuer Effekt zum Laden der Gruppeneinstellungen, wenn die Session-ID verfügbar ist
  useEffect(() => {
    // Wir brauchen die sessionId aus dem aktiven Spiel
    if (gameData && isReadOnlySet && gameData.sessionId) {
      const sessionId = gameData.sessionId;
      console.log(`[GameView] Session gefunden mit ID: ${sessionId}, suche nach zugehöriger Gruppe...`);
      
      // Zuerst die Session abrufen, um die gruppeId zu bekommen
      const sessionRef = doc(db, 'jassSessions', sessionId);
      
      // Unsubscribe-Funktionen für Cleanup sammeln
      let unsubscribeGroup: (() => void) | null = null;
      
      // Einmaliger Abruf der spezifischen Session
      const unsubscribeSession = onSnapshot(
        sessionRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const sessionData = docSnap.data();
            const groupId = sessionData.gruppeId;
            
            if (groupId) {
              console.log(`[GameView] Gruppe für Session ${sessionId} gefunden: ${groupId}`);
              
              // Einzelne Gruppe aus Firestore laden
              const groupRef = doc(db, 'groups', groupId);
              unsubscribeGroup = onSnapshot(
                groupRef,
                (docSnap) => {
                  if (docSnap.exists()) {
                    const groupData = docSnap.data();
                    console.log(`[GameView] Gruppeneinstellungen geladen:`, groupData);
                    // Gruppe in den GroupStore setzen
                    setCurrentGroup({
                      id: groupId,
                      ...groupData as any, // Type-Cast, da wir wissen, dass es eine Gruppe ist
                    });
                  } else {
                    console.log(`[GameView] Gruppe mit ID ${groupId} existiert nicht mehr.`);
                  }
                },
                (err) => {
                  console.error(`[GameView] Fehler beim Laden der Gruppe ${groupId}:`, err);
                }
              );
            } else {
              console.log(`[GameView] Session ${sessionId} hat keine zugehörige Gruppe.`);
            }
          } else {
            console.log(`[GameView] Session mit ID ${sessionId} nicht gefunden.`);
          }
        },
        (err) => {
          console.error(`[GameView] Fehler beim Listener für Session ${sessionId}:`, err);
        }
      );
      
      // Cleanup-Funktion zurückgeben
      return () => {
        console.log(`[GameView] Cleanup Session- und Gruppen-Listener`);
        unsubscribeSession();
        if (unsubscribeGroup) {
          unsubscribeGroup();
        }
      };
    }
  }, [gameData, isReadOnlySet, setCurrentGroup]);

  // Cleanup function wurde entfernt, da sie jetzt in den einzelnen Listener-useEffect Hooks ist

  // Letzte Redundante useEffect wurde entfernt

  console.log('[GameView] Checking render conditions:', { isLoading, error, gameDataExists: !!gameData, viewerGamesDataExists: !!viewerGamesData });

  // --- Render Logic --- 
  if (isLoading) {
    console.log('[GameView] Rendering: Loading');
    return <div className="flex justify-center items-center min-h-screen text-white">Lade Spiel...</div>; // Loading text white
  }

  if (error) {
    console.log('[GameView] Rendering: Error -', error);
    return <div className="flex justify-center items-center min-h-screen text-red-500">Fehler: {error}</div>; 
  }

  // Diese Bedingung sollte jetzt korrekt funktionieren, da isLoading erst false wird, wenn viewerGamesData gesetzt ist
  if (!viewerGamesData || viewerGamesData.length === 0) { // Prüfe explizit auf leeres Array
     console.log('[GameView] Rendering: Not Available (viewerGamesData is null or empty)');
     return <div className="flex justify-center items-center min-h-screen text-yellow-500">Spieldaten nicht verfügbar oder noch nicht geladen.</div>;
  }

  // --- Tatsächliche Anzeige --- 
  // Bereite Daten für die Anzeige-Komponente vor
  // Wir greifen hier auf gameData für die meisten Metadaten zu, da viewerGamesData nur GameEntry enthält
  const latestGame = viewerGamesData[viewerGamesData.length - 1];
  let currentScores: TeamScores = { top: 0, bottom: 0 };
  let currentStriche: { top: StricheRecord; bottom: StricheRecord } = { 
      top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
      bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
  };
  let weisPoints: TeamScores = { top: 0, bottom: 0 };

  if (latestGame) {
      if ('teams' in latestGame && latestGame.teams) { // GameEntry (active game)
          // Sichere Typenzuweisung mit Type Assertion
          const gameEntry = latestGame as GameEntry;
          // Prüfen auf Existenz der Properties bevor Zugriff
          if (gameEntry.teams.top && gameEntry.teams.bottom) {
              currentScores = { 
                  top: gameEntry.teams.top.total, 
                  bottom: gameEntry.teams.bottom.total 
              };
              currentStriche = { 
                  top: gameEntry.teams.top.striche, 
                  bottom: gameEntry.teams.bottom.striche 
              };
              weisPoints = { 
                  top: gameEntry.teams.top.weisPoints, 
                  bottom: gameEntry.teams.bottom.weisPoints 
              };
          }
      } else if ('finalStriche' in latestGame && latestGame.finalStriche) { // CompletedGameSummary
          // Sichere Typenzuweisung auch hier
          const completedGame = latestGame as CompletedGameSummary;
          currentScores = completedGame.finalScores;
          currentStriche = completedGame.finalStriche;
          weisPoints = completedGame.weisPoints;
      }
  }
  
  const gameViewerData = {
    games: viewerGamesData, // Übergebe das kombinierte Array
    playerNames: gameData?.playerNames ?? { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4' }, // Fallback
    currentScores: currentScores,
    currentStriche: currentStriche,
    weisPoints: weisPoints,
    // Optional: Pass settings if available in ActiveGame or Session data
    // cardStyle: gameData?.settings?.cardStyle,
    // strokeSettings: gameData?.settings?.strokeSettings,
  };
  console.log('[GameView] Final props for GameViewerKreidetafel:', gameViewerData); // Log final props

  return (
    <GameViewerKreidetafel gameData={gameViewerData} />
  );
};

export default GameViewPage; 