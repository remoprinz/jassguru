import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router'; // Import useRouter
import { getFirestore, doc, getDoc, collection, query, orderBy, Timestamp as ClientTimestamp, where, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore'; // Client-SDK verwenden, getDocs hinzugefügt, onSnapshot hinzugefügt
import { firebaseApp } from '@/services/firebaseInit'; // Client-seitige Firebase App importieren
import type { ActiveGame, RoundEntry, CompletedGameSummary, TeamScores, JassSession } from '@/types/jass';
// import { firebaseAdmin } from '@/lib/firebaseAdmin'; // Serverseitiges Firebase Admin SDK
import { safeJsonStringify } from '@/utils/safeJsonStringify'; // Bleibt nützlich für Debugging, aber nicht für Props

// Stores importieren
import { useGameStore } from '@/store/gameStore';
import { useJassStore } from '@/store/jassStore';
import { useUIStore } from '@/store/uiStore';
import { useTimerStore } from '@/store/timerStore';
import { useGroupStore } from '@/store/groupStore'; // GroupStore für Einstellungen
import { useAuthStore } from '@/store/authStore'; // NEU: AuthStore importieren
import { useTournamentStore } from '@/store/tournamentStore'; // NEU: TournamentStore importieren

// Importiere die Default-Einstellungen
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';

// Die eigentliche Jass-Ansicht importieren
import JassKreidetafel from '@/components/layout/JassKreidetafel';
import FullscreenLoader from '@/components/ui/FullscreenLoader';
import MainLayout from '@/components/layout/MainLayout';

// Hilfsfunktion zum sicheren Parsen von Firebase Timestamps (Client oder Server) zu Millisekunden
function parseFirebaseTimestamp(timestamp: any): number | null {
    if (!timestamp) return null;
    // Prüfen, ob es ein Firebase Client Timestamp ist
    if (timestamp instanceof ClientTimestamp) {
        return timestamp.toMillis();
    }
    // Prüfen, ob es ein Objekt ist, das von getServerSideProps kommen könnte (veraltet, aber sicherheitshalber)
    if (typeof timestamp === 'object' && timestamp !== null && '_seconds' in timestamp && '_nanoseconds' in timestamp) {
         // Konvertiere serverseitiges Timestamp-Format (Sekunden, Nanosekunden)
         return new ClientTimestamp(timestamp._seconds, timestamp._nanoseconds).toMillis();
    }
    // Prüfen, ob es bereits ein ISO-String ist (aus älterer getServerSideProps Konvertierung)
    if (typeof timestamp === 'string') {
        try {
            const date = new Date(timestamp);
            return isNaN(date.getTime()) ? null : date.getTime();
        } catch (e) {
            console.error('Error parsing timestamp string:', e);
            return null;
        }
    }
     // Prüfen, ob es bereits eine Zahl ist (Millisekunden)
    if (typeof timestamp === 'number') {
        return timestamp;
    }
    console.warn('Unrecognized timestamp format:', timestamp);
    return null;
}

// Hilfsfunktion zum Konvertieren von Timestamps in RoundEntry
function parseRoundEntryTimestamps(round: any): RoundEntry {
    return {
        ...round,
        timestamp: parseFirebaseTimestamp(round.timestamp) ?? Date.now(),
        startTime: parseFirebaseTimestamp(round.startTime),
        endTime: parseFirebaseTimestamp(round.endTime),
    } as RoundEntry;
}

// Hilfsfunktion zum Konvertieren von Timestamps in CompletedGameSummary
function parseCompletedGameSummaryTimestamps(summary: any): CompletedGameSummary {
    return {
        ...summary,
        // Client Timestamps direkt verwenden oder aus Objekt/String parsen
        timestampCompleted: summary.timestampCompleted ? new ClientTimestamp(summary.timestampCompleted.seconds ?? summary.timestampCompleted._seconds, summary.timestampCompleted.nanoseconds ?? summary.timestampCompleted._nanoseconds) : ClientTimestamp.now(),
        completedAt: summary.completedAt ? new ClientTimestamp(summary.completedAt.seconds ?? summary.completedAt._seconds, summary.completedAt.nanoseconds ?? summary.completedAt._nanoseconds) : null,
        roundHistory: summary.roundHistory?.map(parseRoundEntryTimestamps) ?? [],
    } as CompletedGameSummary;
}

const LiveGamePage: React.FC = () => {
  const router = useRouter();
  const { activeGameId } = router.query; // Holen der activeGameId aus der URL

  const [isLoading, setIsLoading] = useState(true); // Ladezustand hinzugefügt
  const [isInitialized, setIsInitialized] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const setReadOnlyMode = useUIStore((state) => state.setReadOnlyMode);
  const setCurrentGroup = useGroupStore((state) => state.setCurrentGroup); // GroupStore-Zugriff für Gruppeneinstellungen
  const currentUser = useAuthStore((state) => state.user); // NEU: Aktuellen Benutzer holen
  // NEU: State für die Verarbeitung der Gruppeneinstellungen
  const [groupSettingsProcessingAttempted, setGroupSettingsProcessingAttempted] = useState(false);

  useEffect(() => {
    // Wenn keine ID vorhanden ist oder der Router noch nicht bereit ist, abbrechen
    if (!activeGameId || typeof activeGameId !== 'string' || !router.isReady) {
        if (!activeGameId && router.isReady) {
            console.error("[LiveGamePage] No activeGameId found in URL.");
            setInternalError("Keine Spiel-ID in der URL gefunden.");
            setIsLoading(false);
            setIsInitialized(true); // Trotzdem initialisieren, um Fehler anzuzeigen
        }
        return;
    }

    console.log(`[LiveGamePage] useEffect triggered for game: ${activeGameId}`);
    setIsLoading(true);
    setInternalError(null);
    setIsInitialized(false); // Reset bei ID-Wechsel
    setGroupSettingsProcessingAttempted(false); // Reset bei ID-Wechsel

    const db = getFirestore(firebaseApp);
    const gameDocRef = doc(db, 'activeGames', activeGameId);
    const roundsCollectionRef = collection(db, 'activeGames', activeGameId, 'rounds');

    let jassSessionIdForCompletedGames: string | null = null; // Variable zum Speichern der Session-ID

    // Listener für das Hauptspieldokument
    const unsubscribeGame = onSnapshot(gameDocRef, async (docSnap) => {
        if (!docSnap.exists()) {
            console.error(`[LiveGamePage] Game ${activeGameId} not found in snapshot listener.`);
            setInternalError('Spiel nicht mehr gefunden. Wurde es vielleicht beendet?');
            setIsLoading(false);
            setIsInitialized(true); // Spiel nicht gefunden, Initialisierung abschließen, um Fehler anzuzeigen
            return;
        }

        const gameData = docSnap.data() as ActiveGame;
        if (docSnap.id !== activeGameId) {
            console.warn(`[LiveGamePage] Snapshot data received for ${docSnap.id}, but current URL activeGameId is ${activeGameId}. Skipping update for this snapshot to avoid race condition.`);
            // In diesem Fall nicht initialisieren oder laden stoppen, da es nicht die relevanten Daten sind.
            // setIsLoading(false) und setIsInitialized(true) sollten hier NICHT aufgerufen werden,
            // außer es gibt einen Mechanismus, der sicherstellt, dass der korrekte Snapshot noch kommt.
            // Für den Moment: keine Änderung an isLoading/isInitialized.
            return;
        }

        jassSessionIdForCompletedGames = gameData.sessionId;

        // Timestamps parsen
        const createdAt = parseFirebaseTimestamp(gameData.createdAt);
        const lastUpdated = parseFirebaseTimestamp(gameData.lastUpdated);
        const jassStartTime = parseFirebaseTimestamp(gameData.jassStartTime);
        const gameStartTime = parseFirebaseTimestamp(gameData.gameStartTime);

        // JassStore aktualisieren (nur relevante Teile)
        // HINWEIS: `completedGames` werden separat geladen/aktualisiert
        useJassStore.setState(prevState => {
            const baseSession = prevState.currentSession ?? {} as Partial<JassSession>;
            const isTournamentPasse = !!gameData.tournamentInstanceId;

            // Konvertiere lastUpdated (number | null) zu einem ClientTimestamp oder undefined
            const lastActivityTimestamp = lastUpdated ? ClientTimestamp.fromMillis(lastUpdated) : undefined;

            return {
                isJassStarted: true,
                currentGameId: gameData.currentGameNumber,
                currentSession: {
                    ...baseSession,
                    id: gameData.sessionId, 
                    gruppeId: gameData.groupId ?? undefined,
                    startedAt: createdAt ?? baseSession?.startedAt ?? Date.now(),
                    playerNames: gameData.playerNames,
                    games: baseSession?.games ?? [],
                    currentScoreLimit: baseSession?.currentScoreLimit ?? 0,
                    metadata: baseSession?.metadata ?? {},
                    participantUids: gameData.participantUids,
                    statistics: baseSession?.statistics ?? undefined,
                    completedGamesCount: baseSession?.completedGamesCount ?? 0,
                    currentCardStyle: baseSession?.currentCardStyle,
                    currentActiveGameId: gameData.activeGameId, 
                    lastActivity: lastActivityTimestamp, // Verwende den konvertierten Timestamp
                    status: baseSession?.status, 
                    isTournamentSession: isTournamentPasse,
                    tournamentInstanceId: isTournamentPasse ? gameData.tournamentInstanceId : undefined
                },
                isJassCompleted: gameData.status !== 'live',
                currentRound: gameData.currentRound,
                teams: {
                    top: { ...(prevState.teams.top), ...gameData.teams?.top, striche: gameData.striche.top, total: gameData.scores.top, weisPoints: gameData.weisPoints?.top ?? 0 },
                    bottom: { ...(prevState.teams.bottom), ...gameData.teams?.bottom, striche: gameData.striche.bottom, total: gameData.scores.bottom, weisPoints: gameData.weisPoints?.bottom ?? 0 }
                },
                currentGameCache: null,
                jassSessionId: gameData.sessionId, 
            };
        });

        let localSettingsProcessed = false;

        // Logik zur Behandlung von Gruppen- und Turnier-Einstellungen
        if (gameData.groupId && !gameData.tournamentInstanceId) {
            // Nur GRUPPENSPIEL (kein Turnierspiel innerhalb einer Gruppe)
            console.log(`[LiveGamePage] Gruppenspiel erkannt (${gameData.groupId}). Lade Gruppeneinstellungen.`);
            try {
                const groupRef = doc(db, 'groups', gameData.groupId);
                const groupSnap = await getDoc(groupRef);
                if (groupSnap.exists()) {
                    const groupDataFromSnap = groupSnap.data() as any;
                    setCurrentGroup({ id: gameData.groupId!, ...groupDataFromSnap });
                    const settingsToApply = {
                        farbeSettings: groupDataFromSnap.farbeSettings ?? DEFAULT_FARBE_SETTINGS,
                        scoreSettings: groupDataFromSnap.scoreSettings ?? DEFAULT_SCORE_SETTINGS,
                        strokeSettings: groupDataFromSnap.strokeSettings ?? DEFAULT_STROKE_SETTINGS,
                    };
                    useGameStore.getState().setGameSettings(settingsToApply);
                    console.log("[LiveGamePage] Gruppenspezifische Einstellungen an gameStore übergeben.");
                } else {
                    console.warn(`[LiveGamePage] Gruppe ${gameData.groupId} nicht gefunden. Fallback auf Defaults.`);
                    useGameStore.getState().setGameSettings({
                        farbeSettings: DEFAULT_FARBE_SETTINGS,
                        scoreSettings: DEFAULT_SCORE_SETTINGS,
                        strokeSettings: DEFAULT_STROKE_SETTINGS,
                    });
                }
            } catch (err) {
                console.error(`[LiveGamePage] Fehler beim Laden der Gruppe ${gameData.groupId}:`, err);
                useGameStore.getState().setGameSettings({
                    farbeSettings: DEFAULT_FARBE_SETTINGS,
                    scoreSettings: DEFAULT_SCORE_SETTINGS,
                    strokeSettings: DEFAULT_STROKE_SETTINGS,
                });
            } finally {
                localSettingsProcessed = true;
            }
        } else if (gameData.tournamentInstanceId) {
            // TURNIERSPIEL (kann auch eine groupId haben, aber Turnier-Settings haben Vorrang und wurden durch tournamentStore.startNewPasse gesetzt)
            console.log(`[LiveGamePage] Turnierspiel erkannt (${gameData.tournamentInstanceId}). Settings wurden bereits bei Passenstart via tournamentStore gesetzt. Keine erneute Aktion hier.`);
            // Hier versuchen wir NICHT mehr, die Settings aus dem tournamentStore zu lesen und an gameStore zu übergeben,
            // da dies bereits beim Aufruf von gameStore.resetGame durch tournamentStore.startNewPasse geschehen sein sollte.
            // Die Settings im gameStore sind somit die festen Turnierregeln.
            localSettingsProcessed = true; 
        } else {
            // KEINE Gruppe und KEIN Turnier (freies Spiel / lokales Spiel, falls das noch relevant ist)
            // Hier könnten die globalen UI-Einstellungen aus dem UIStore via gameStore.setGameSettings gesetzt werden,
            // aber das sollte bereits durch jassStore.startJass -> gameStore.resetGame (mit initialSettings) abgedeckt sein.
            // Daher hier nur Logging und Sicherstellung, dass der Flag gesetzt wird.
            console.log("[LiveGamePage] Weder explizites Gruppen- noch Turnierspiel. Settings sollten durch Spielstart-Logik (jassStore) gesetzt sein.");
            localSettingsProcessed = true;
        }
        
        if (localSettingsProcessed && !groupSettingsProcessingAttempted) {
            setGroupSettingsProcessingAttempted(true); // Markiere, dass die Settings-Logik durchlaufen wurde
        }

        // GameStore mit dynamischen Daten aktualisieren (wie vorher, Settings bleiben aus prevState)
        useGameStore.setState(prevState => {
            let idToUse = activeGameId; 
            if (prevState.activeGameId === activeGameId) {
                idToUse = prevState.activeGameId; 
            }
            return {
                ...prevState, 
                activeGameId: idToUse, 
                currentPlayer: gameData.currentPlayer,
                startingPlayer: gameData.startingPlayer,
                initialStartingPlayer: gameData.initialStartingPlayer,
                isGameStarted: true, 
                currentRound: gameData.currentRound,
                jassPoints: gameData.currentJassPoints ?? { top: 0, bottom: 0 },
                scores: gameData.scores,
                striche: gameData.striche,
                currentRoundWeis: gameData.currentRoundWeis ?? [],
                isGameCompleted: gameData.status !== 'live',
                isRoundCompleted: gameData.isRoundCompleted ?? false,
                playerNames: gameData.playerNames,
                gamePlayers: gameData.gamePlayers ?? null,
                farbeSettings: prevState.farbeSettings, 
                scoreSettings: prevState.scoreSettings,
                strokeSettings: prevState.strokeSettings,
                historyState: { ...prevState.historyState, lastNavigationTimestamp: Date.now() }, 
            };
        });

        // TimerStore initialisieren/wiederherstellen (nur einmalig oder wenn Zeiten sich ändern)
        // Dies könnte optimiert werden, um nicht bei jedem Snapshot neu zu setzen
        useTimerStore.getState().restoreTimers(jassStartTime, gameStartTime);

        // ReadOnly Modus setzen, nur wenn gameData für die korrekte activeGameId geladen wurde UND currentUser vorhanden ist.
        // Das isInitialized-Flag wird erst danach gesetzt.
        if (docSnap.id === activeGameId && currentUser) { // Explizite Prüfung auf currentUser hier
            // Detailliertes Logging HIER
            console.log('[LiveGamePage] ReadOnly Check (Bedingungen erfüllt - gameData.id === activeGameId && currentUser exists):',
              {
                activeGameIdFromUrl: activeGameId,
                gameDataId: docSnap.id,
                currentUserUid: currentUser?.uid,
                gamePlayerUids: gameData.gamePlayers ? Object.values(gameData.gamePlayers).map(p => (p as any)?.uid) : 'N/A',
                rawGamePlayers: JSON.stringify(gameData.gamePlayers).substring(0, 100) + "...",
                isTournamentGame: !!gameData.tournamentInstanceId,
                tournamentInstanceIdFromGame: gameData.tournamentInstanceId,
                tournamentAdminIds: useTournamentStore.getState().currentTournamentInstance?.adminIds
              }
            );

            let isCurrentUserInPasse = false;
            if (gameData.gamePlayers) { // currentUser ist hier schon geprüft
                // Verbesserte Prüfung mit detailliertem Logging für mehr Transparenz
                const playerInfos = Object.values(gameData.gamePlayers);
                console.log('[LiveGamePage] Prüfe Spielerberechtigung für currentUser.uid:', currentUser.uid);
                console.log('[LiveGamePage] Game Players UIDs:', playerInfos.map(p => 
                    p && typeof p === 'object' ? 
                    (('uid' in p && p.uid) || ('userId' in p && p.userId)) : 
                    'kein Objekt'
                ));
                
                isCurrentUserInPasse = playerInfos.some((playerInfo) => {
                    // Prüfe sowohl uid als auch userId (bei Turnieren kann userId statt uid verwendet werden)
                    return playerInfo && typeof playerInfo === 'object' && (
                        // Fall 1: uid ist direkt verfügbar und stimmt überein
                        ('uid' in playerInfo && playerInfo.uid === currentUser.uid) ||
                        // Fall 2: userId ist verfügbar und stimmt überein
                        ('userId' in playerInfo && playerInfo.userId === currentUser.uid)
                    );
                });
            }
            console.log('[LiveGamePage] Check Result - isCurrentUserInPasse:', isCurrentUserInPasse);

            if (isCurrentUserInPasse) {
                console.log("[LiveGamePage] User IS participant. Setting ReadOnly mode to FALSE.");
                setReadOnlyMode(false);
            } else {
                let isTournamentAdminForThisGame = false;
                if (gameData.tournamentInstanceId) { // currentUser ist hier schon geprüft
                    const tournamentInstance = useTournamentStore.getState().currentTournamentInstance;
                    // Zusätzlicher Check: Ist die geladene tournamentInstance auch die für dieses Spiel?
                    if (tournamentInstance && tournamentInstance.id === gameData.tournamentInstanceId) {
                        isTournamentAdminForThisGame = tournamentInstance.adminIds?.includes(currentUser.uid) ?? false;
                    } else {
                        console.warn("[LiveGamePage] Tournament instance in store does not match gameData.tournamentInstanceId for admin check.",
                            { storeInstanceId: tournamentInstance?.id, gameInstanceId: gameData.tournamentInstanceId });
                    }
                }
                console.log('[LiveGamePage] Check Result - isTournamentAdminForThisGame:', isTournamentAdminForThisGame);

                if (isTournamentAdminForThisGame) {
                    console.log("[LiveGamePage] User IS tournament admin. Setting ReadOnly mode to FALSE.");
                    setReadOnlyMode(false);
                } else {
                    console.log("[LiveGamePage] User NOT participant AND NOT admin. Setting ReadOnly mode to TRUE.");
                    setReadOnlyMode(true);
                }
            }
        } else if (!currentUser) {
            console.warn("[LiveGamePage] ReadOnly Check übersprungen: currentUser ist noch nicht verfügbar.");
        } else if (docSnap.id !== activeGameId) {
            // Dieser Fall sollte durch die Prüfung oben abgedeckt sein, aber zur Sicherheit.
            console.warn("[LiveGamePage] ReadOnly Check übersprungen: Snapshot ID (${docSnap.id}) stimmt nicht mit URL ID (${activeGameId}) überein.");
        }

        // WICHTIG: Initialisierung abschließen, NACHDEM alle Daten verarbeitet wurden
        console.log("[LiveGamePage] Alle Daten im Snapshot verarbeitet. Setze isLoading=false, isInitialized=true.");
        setIsLoading(false);
        setIsInitialized(true);

    }, (error) => {
        console.error("[LiveGamePage GameListener ERROR] Error in game snapshot listener:", error);
        setInternalError(`Fehler beim Abrufen der Spieldaten: ${error.message} (Code: ${error.code})`);
        setIsLoading(false);
        setIsInitialized(true); // Auch bei Fehler Initialisierung abschließen
    });

    // Listener für die Runden-Subkollektion
    const roundsQuery = query(roundsCollectionRef, orderBy('roundId'));
    const unsubscribeRounds = onSnapshot(roundsQuery, (snapshot) => {
        console.log(`[LiveGamePage] Rounds snapshot received (${snapshot.docs.length} docs).`);
        const rounds = snapshot.docs.map(doc => parseRoundEntryTimestamps(doc.data()));
        useGameStore.setState({
            roundHistory: rounds,
            // History Index auf das Ende setzen, wenn sich die History ändert
            currentHistoryIndex: (rounds.length || 1) - 1,
        });
    }, (error) => {
        console.error("[LiveGamePage] Error in rounds snapshot listener:", error);
        // Optional: Fehler anzeigen, aber weniger kritisch als Hauptspiel
    });

    // Cleanup-Funktion: Listener beim Verlassen der Seite entfernen
    return () => {
        console.log(`[LiveGamePage] Cleaning up listeners for game: ${activeGameId}`);
        unsubscribeGame();
        unsubscribeRounds();
    };

  // Abhängigkeiten: Verwende currentUser?.uid statt currentUser, um instabile Objekt-Referenzen zu vermeiden
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGameId, router.isReady, currentUser?.uid]);

  // Ladezustand anzeigen
  if (isLoading || !isInitialized) {
    return <FullscreenLoader text="Spiel wird geladen..." />;
  }

  // Fehlerzustand anzeigen
  if (internalError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Fehler</h1>
          <p className="text-gray-300">{internalError}</p>
          {/* Optional: Link zur Startseite */}
      </div>
    );
  }

  // Übergabe der isReadOnly-Prop an die JassKreidetafel
  // Beachte: isReadOnly wird jetzt über den uiStore global verwaltet
  return (
     <JassKreidetafel zShapeConfig={{ innerSpacing: 50, sideSpacing: 40, edgeSpacing: 70 }} />
  );
};

export default LiveGamePage;