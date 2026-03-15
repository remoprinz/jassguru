
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import type { CompletedGameSummary, JassSession, RoundEntry } from '@/types/jass'; // RoundEntry hinzugefügt
import FullscreenLoader from '@/components/ui/FullscreenLoader';
import MainLayout from '@/components/layout/MainLayout';
import { ArrowLeft } from 'lucide-react'; // <-- Import ArrowLeft icon
// Firestore imports hinzufügen
import { getFirestore, doc, collection, getDoc, getDocs, query, orderBy, Timestamp as ClientTimestamp, collectionGroup, where, documentId, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { firebaseApp } from '@/services/firebaseInit'; // Client-seitige Firebase App importieren
// Importiere die Anzeige-Komponente und Defaults
import GameViewerKreidetafel from '@/components/layout/GameViewerKreidetafel';
// NEU: UIStore importieren
import { useUIStore } from '@/store/uiStore';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { format } from 'date-fns'; // Für Datumsformatierung im Titel
// NEU: Importiere benötigte Typen aus jass Typen
import type { StrokeSettings, CardStyle, PlayerNames, TeamScores, StricheRecord, ScoreSettings } from '@/types/jass';
// Entferne den Import von FirestoreGroup, definiere es lokal
// import type { FirestoreGroup } from '@/store/groupStore';
import { ClipLoader } from 'react-spinners';
import { fetchAllGamesForSession } from '@/services/sessionService'; // 🚨 NEU: Import für Spieldaten

// --- HILFSFUNKTIONEN FÜR TIMESTAMPS (ähnlich wie in [activeGameId].tsx) ---
function parseFirebaseTimestamp(timestamp: any): number | null {
    if (!timestamp) return null;

    // 1. Echte Firebase ClientTimestamp Instanz
    if (timestamp instanceof ClientTimestamp) {
        return timestamp.toMillis();
    }

    // 2. Objekt-Struktur prüfen (könnte Firebase Timestamp oder einfache Map sein)
    if (typeof timestamp === 'object' && timestamp !== null) {
        // 2a. Wenn es eine toDate-Funktion hat, ist es wahrscheinlich ein echter Timestamp
        if (typeof (timestamp as any).toDate === 'function') {
            try {
                return (timestamp as any).toDate().getTime();
            } catch (e) {
                // Fall-through zu anderen Checks
            }
        }

        // 2b. Prüfung für Objekte mit seconds/nanoseconds (z.B. manuell erstellte Maps)
        const secondsProp = (timestamp as any).seconds ?? (timestamp as any)._seconds;
        const nanosecondsProp = (timestamp as any).nanoseconds ?? (timestamp as any)._nanoseconds;

        if (typeof secondsProp === 'number' && typeof nanosecondsProp === 'number') {
            try {
                return new ClientTimestamp(secondsProp, nanosecondsProp).toMillis();
            } catch (e) {
                // Fall-through zu anderen Checks
            }
        }
    }

    // 3. ISO-String prüfen
    if (typeof timestamp === 'string') {
        try {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date.getTime();
            }
        } catch (e) {
            // Fall-through zu anderen Checks
        }
    }

    // 4. Zahl prüfen (Millisekunden)
    if (typeof timestamp === 'number' && timestamp > 0) {
        return timestamp;
    }

    // Wenn keine Methode funktioniert hat, gib null zurück
    return null;
}

function parseRoundEntryTimestamps(round: any): RoundEntry {
    return {
        ...round,
        timestamp: parseFirebaseTimestamp(round.timestamp) ?? Date.now(),
        startTime: parseFirebaseTimestamp(round.startTime),
        endTime: parseFirebaseTimestamp(round.endTime),
    } as RoundEntry;
}

function parseCompletedGameSummaryTimestamps(summary: any): CompletedGameSummary {
    const handleTimestamp = (timestamp: any) => {
        if (timestamp instanceof ClientTimestamp) return timestamp;
        if (!timestamp) return null;
        
        try {
            // Wenn es ein Objekt mit seconds/nanoseconds ist
            if (typeof timestamp === 'object' && 
                ('seconds' in timestamp || '_seconds' in timestamp) &&
                ('nanoseconds' in timestamp || '_nanoseconds' in timestamp)) {
                const seconds = timestamp.seconds ?? timestamp._seconds ?? 0;
                const nanoseconds = timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0;
                return new ClientTimestamp(seconds, nanoseconds);
            }
            
            // Wenn es eine Nummer ist, als Millisekunden interpretieren
            if (typeof timestamp === 'number') {
                const seconds = Math.floor(timestamp / 1000);
                const nanoseconds = (timestamp % 1000) * 1000000;
                return new ClientTimestamp(seconds, nanoseconds);
            }
            
            // Fallback: null zurückgeben
            return null;
        } catch (error) {
            // Nur silent fail, kein Logging mehr notwendig
            return null;
        }
    };
    
    return {
        ...summary,
        timestampCompleted: handleTimestamp(summary.timestampCompleted),
        completedAt: handleTimestamp(summary.completedAt),
        roundHistory: summary.roundHistory?.map(parseRoundEntryTimestamps) ?? [],
    } as CompletedGameSummary;
}
// --- ENDE HILFSFUNKTIONEN ---

// Typ für Session-Metadaten, jetzt mit korrektem PlayerNames Typ
type SessionMetadata = {
    sessionId: string;
    groupId: string | null;
    groupName: string | null;
    startedAt: number | ClientTimestamp | any;
    participantUids: string[];
    playerNames: PlayerNames; // KORRIGIERTER TYP
    status?: string;
    notes?: string[]; // NEU: Für Warnungen
    // ... weitere Metadaten ...
} | null;
type CompletedGamesData = CompletedGameSummary[];

// Lokale Definition für FirestoreGroup (Spiegelung der erwarteten Struktur)
interface FarbeSettings {
  cardStyle: CardStyle;
  // ... andere Farbeinstellungen falls vorhanden ...
}

interface FirestoreGroup {
  strokeSettings?: StrokeSettings;
  farbeSettings?: FarbeSettings;
  scoreSettings?: ScoreSettings;
  // ... andere Felder der Gruppe, die wir hier nicht brauchen ...
}

const PublicSessionPage = () => {
  const router = useRouter();
  const sessionId = typeof router.query.sessionId === 'string' ? router.query.sessionId : undefined;
  const groupIdFromQuery = typeof router.query.groupId === 'string' ? router.query.groupId : null;
  
  // Robustere Public-Route-Erkennung
  const isPublicRoute = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    
    // Prüfe mehrere Indikatoren für Public Route
    const pathIndicators = [
      // 1. Aktueller Window-Pfad (zuverlässigste Quelle beim direkten Laden)
      window.location.pathname.includes('/view/session/public'),
      // 2. Router asPath (funktioniert nach Navigation)
      router.asPath?.includes('/view/session/public'),
      // 3. Router pathname (für Re-Export-Erkennung)
      router.pathname?.includes('/view/session/public')
    ];
    
    // Wenn irgendein Indikator true ist, ist es eine Public Route
    return pathIndicators.some(indicator => indicator === true);
  }, [router.asPath, router.pathname]);


  // Session-Daten Zustand
  const [sessionData, setSessionData] = useState<any>(null);
  const [completedGames, setCompletedGames] = useState<CompletedGameSummary[]>([]);
  const [activeGameData, setActiveGameData] = useState<any | null>(null);
  const [activeGameRounds, setActiveGameRounds] = useState<RoundEntry[]>([]);
  const [allActiveGames, setAllActiveGames] = useState<any[]>([]); // V4: Für alle Live/kürzlichen Spiele
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupStats, setGroupStats] = useState<any>(null); // NEU: State für Gruppen-Statistiken

  // 🚀 V4/FIX: Hook vor die bedingten Returns verschieben, um React Error #310 zu vermeiden
  const allGames = useMemo(() => {
    const gameMap = new Map<number, any>();
    const defaultStriche: StricheRecord = { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 };

    // 1. Archivierte Spiele als Basis nehmen
    completedGames.forEach(game => {
      if (typeof game?.gameNumber === 'number') {
        gameMap.set(game.gameNumber, game);
      }
    });

    // 2. Mit Live/kürzlichen Spielen überschreiben/ergänzen
    allActiveGames.forEach(activeGame => {
      // Unterstütze sowohl gameNumber als auch currentGameNumber
      const gameNum = typeof (activeGame as any)?.gameNumber === 'number'
        ? (activeGame as any).gameNumber
        : (typeof (activeGame as any)?.currentGameNumber === 'number'
            ? (activeGame as any).currentGameNumber
            : undefined);

      if (typeof gameNum === 'number') {
        const isCurrentActiveGame = activeGame.id === activeGameData?.id;
        const rounds = isCurrentActiveGame ? activeGameRounds : activeGame.roundHistory;

        const compatibleGame = {
          id: activeGame.id,
          gameNumber: gameNum,
          finalScores: activeGame.scores,
          roundHistory: rounds,
          weisPoints: activeGame.weisPoints,
          finalStriche: activeGame.striche,
          playerNames: activeGame.playerNames,
          teams: {
            top: { striche: activeGame.striche?.top || defaultStriche },
            bottom: { striche: activeGame.striche?.bottom || defaultStriche }
          }
        };
        gameMap.set(gameNum, compatibleGame);
      }
    });

    // 3. Nach Spielnummer sortieren für korrekte Chronologie
    return Array.from(gameMap.values()).sort((a, b) => a.gameNumber - b.gameNumber);
  }, [completedGames, allActiveGames, activeGameData, activeGameRounds]); // V4.1: Wichtige Abhängigkeiten hinzugefügt

  // 🚨 INTELLIGENTE ZURÜCK-NAVIGATION (an den Anfang verschoben)
  const handleBackClick = useCallback(() => {
    const referrer = document.referrer;
    // console.log('[SessionPage] Zurück-Navigation von Referrer:', referrer);
    
    // 🚨 NEU: Fall 0: Spezieller Fall wenn wir von einem abgeschlossenen Jass kommen
    const fromJassCompletion = router.query.fromJassCompletion === 'true';
    if (fromJassCompletion) {
      console.log('[SessionPage] 🎯 SPEZIELLER FALL: Von abgeschlossenem Jass kommend, navigiere zu /start');
      router.push('/start');
      return;
    }
    
    // Fall 1: Wir kommen von einer öffentlichen Gruppenseite (der häufigste Fall)
    const publicGroupMatch = referrer.match(/\/view\/group\/([^/?]+)/);
    if (publicGroupMatch) {
      const groupIdFromReferrer = publicGroupMatch[1];
      console.log('[SessionPage] Erkenne öffentliche Gruppenseite, navigiere zurück zu:', `/view/group/${groupIdFromReferrer}`);
      router.push(`/view/group/${groupIdFromReferrer}`);
      return;
    }
    
    // Fall 2: Wir kommen von der Jass-Seite (eingeloggter Flow)
    const isFromJass = referrer.includes('/jass');
    if (isFromJass) {
      console.log('[SessionPage] Von Jass-Seite kommend, navigiere zu /start');
      router.push('/start');
      return;
    }
    
    // Fall 3: Der Referrer ist leer oder extern (z.B. neuer Tab), ABER wir haben die Gruppendaten
    if ((!referrer || !referrer.startsWith(window.location.origin)) && sessionData?.groupId) {
      console.log(`[SessionPage] Kein interner Referrer, aber groupId (${sessionData.groupId}) vorhanden. Navigiere zur Gruppe.`);
      router.push(`/view/group/${sessionData.groupId}`);
      return;
    }

    // Fall 4: Standard-Browser-History als Fallback
    if (window.history.length > 1) {
      // console.log('[SessionPage] Interne History vorhanden, navigiere zurück');
      router.back();
    } else {
      // Fall 5: Absoluter Notfall-Fallback
      console.log('[SessionPage] Keine History, kein Referrer, keine groupId. Navigiere zu /start');
      router.push('/start');
    }
  }, [router, sessionData?.groupId]); // sessionData.groupId als Abhängigkeit hinzufügen

  useEffect(() => {
    let activeGameUnsubscribe: Unsubscribe | null = null;
    let activeRoundsUnsubscribe: Unsubscribe | null = null;
    let isCancelled = false;

    if (!router.isReady || !sessionId) {
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const db = getFirestore(firebaseApp);
        let sessionDoc: any = null;
        let foundGroupId: string | null = null;
        let loadedFromGroupSummary = false; // Kennzeichnet Public-Quelle (groups/*/jassGameSummaries)

        if (isPublicRoute) {
          // ÖFFENTLICHE ROUTE: Zuerst Live-Quelle prüfen (sessions/{sessionId})
          const liveSessionRef = doc(db, 'sessions', sessionId);
          const liveSessionSnap = await getDoc(liveSessionRef);

          if (liveSessionSnap.exists()) {
            // ✅ Live Session gefunden in sessions
            sessionDoc = liveSessionSnap;
            const sd: any = liveSessionSnap.data();
            foundGroupId = sd?.groupId || sd?.gruppeId || groupIdFromQuery || null;
            
            // 🔥 BONUS: groupId zur URL hinzufügen für zukunftssicheren Link (wenn noch nicht vorhanden)
            if (foundGroupId && !groupIdFromQuery) {
              router.replace({
                pathname: router.pathname,
                query: { ...router.query, groupId: foundGroupId }
              }, undefined, { shallow: true });
            }
          } else {
            // ✅ PRIORITÄT: Wenn groupId via Query bekannt ist, versuche direkten Zugriff (schnellster Pfad)
            if (!sessionDoc && groupIdFromQuery) {
              try {
                const directRef = doc(db, `groups/${groupIdFromQuery}/jassGameSummaries`, sessionId);
                const directSnap = await getDoc(directRef);
                if (directSnap.exists()) {
                  sessionDoc = directSnap;
                  foundGroupId = groupIdFromQuery;
                  loadedFromGroupSummary = true;
                }
              } catch (error) {
                console.warn('[SessionPage] Direct groupId lookup failed:', error);
              }
            }

            // Fallback: Abgeschlossene Session über collectionGroup finden
            try {
              const cg = query(
                collectionGroup(db, 'jassGameSummaries'),
                where(documentId(), '==', sessionId)
              );
              const cgSnap = await getDocs(cg);
              if (!cgSnap.empty) {
                const jgsDoc = cgSnap.docs[0];
                sessionDoc = jgsDoc;
                const jassGameSummariesCol = jgsDoc.ref.parent;
                const groupDocRef = jassGameSummariesCol?.parent; // groups/{groupId}
                foundGroupId = groupDocRef?.id || null;
                loadedFromGroupSummary = true;
              }
            } catch (error) {
              // Ignorieren – wird unten als "nicht gefunden" behandelt
            }
          }
        } else {
          // Privater Flow: über User → Player → groupIds iterieren
          const auth = getAuth(firebaseApp);
          const user = auth.currentUser;
          if (!user) {
            if (!isCancelled) setError('Nicht angemeldet');
            return;
          }

          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (!userDoc.exists()) {
            if (!isCancelled) setError('Benutzer nicht gefunden');
            return;
          }

          const userData = userDoc.data();
          const playerDoc = await getDoc(doc(db, 'players', userData.playerId));
          if (!playerDoc.exists()) {
            if (!isCancelled) setError('Spieler nicht gefunden');
            return;
          }
          const playerData = playerDoc.data();
          const groupIds = playerData.groupIds || [];

          for (const groupId of groupIds) {
            try {
              const groupSessionDoc = await getDoc(doc(db, `groups/${groupId}/jassGameSummaries`, sessionId));
              if (groupSessionDoc.exists()) {
                sessionDoc = groupSessionDoc;
                foundGroupId = groupId;
                break;
              }
            } catch (error) {
            }
          }
        }
        
        if (!sessionDoc || !sessionDoc.exists()) {
          if (!isCancelled) setError('Session nicht gefunden');
          return;
        }

        const sessionDataResult = sessionDoc.data();
        if (!isCancelled) {
          setSessionData(sessionDataResult);
        }

        // 🎯 V3 FIX: IMMER abgeschlossene Spiele aus der Gruppe laden (Single Source of Truth)
        let initialCompletedGames: CompletedGameSummary[] = [];
        if (foundGroupId) {
          initialCompletedGames = await fetchAllGamesForSession(sessionId, foundGroupId);
          if (!isCancelled) {
            setCompletedGames(initialCompletedGames);
          }
        }

        // 🚀 NEUE ARCHITEKTUR: Lade groupStats aus neuer Struktur
        if (foundGroupId) {
          try {
            const groupStatsDoc = await getDoc(doc(getFirestore(firebaseApp), 'groups', foundGroupId, 'stats', 'computed'));
            if (groupStatsDoc.exists() && !isCancelled) {
              const groupStatsData = groupStatsDoc.data();
              setGroupStats(groupStatsData);
            }
          } catch (error) {
            // Kein kritischer Fehler - wir können ohne groupStats weitermachen
          }
        }

        const status = sessionDataResult?.status || null;
        // Öffentliche Quelle (group summaries) → immer als abgeschlossen behandeln, keine Live-Listener öffnen
        const isCompleted = loadedFromGroupSummary || status === 'completed' || status === 'completed_empty';

        if (!isCompleted) {
          // LIVE: Session ist aktiv. completedGames sind bereits geladen.
          // Jetzt ALLE aktiven/kürzlichen Spiele für diese Session abonnieren.
          try {
            const activeGamesQuery = query(collection(db, 'activeGames'), where('sessionId', '==', sessionId));
            
            activeGameUnsubscribe = onSnapshot(activeGamesQuery, async (querySnapshot) => {
              const fetchedGames = await Promise.all(querySnapshot.docs.map(async (doc) => {
                const gameData = doc.data();
                const roundsQuery = query(collection(doc.ref, 'rounds'), orderBy('timestamp'));
                const roundsSnapshot = await getDocs(roundsQuery);
                const rounds = roundsSnapshot.docs.map(d => parseRoundEntryTimestamps(d.data()));
                return { ...gameData, id: doc.id, roundHistory: rounds };
              }));

              if (isCancelled) {
                return;
              }

              setAllActiveGames(fetchedGames);

              // Finde das "aktuellste" Spiel für die Hauptanzeige
              const currentActiveId = sessionDataResult?.currentActiveGameId;
              const currentLiveGame = currentActiveId ? fetchedGames.find(g => g.id === currentActiveId) : null;
              
              if (currentLiveGame) {
                setActiveGameData(currentLiveGame);
                setActiveGameRounds(currentLiveGame.roundHistory || []);
              } else if (fetchedGames.length > 0) {
                // Fallback: Nimm das Spiel mit dem höchsten gameNumber
                const latestGame = fetchedGames.reduce((latest: any, game: any) => {
                  if (typeof game?.gameNumber !== 'number') return latest;
                  if (!latest || game.gameNumber > latest.gameNumber) {
                    return game;
                  }
                  return latest;
                }, null);
                setActiveGameData(latestGame);
                setActiveGameRounds(latestGame?.roundHistory || []);
              }
            });

          } catch (e) {
            console.error('[SessionView] Could not attach active games query listener:', e);
            if (!isCancelled) {
              setActiveGameData(null);
              setActiveGameRounds([]);
            }
          }
        } else {
          // ABGESCHLOSSEN: Alle Spiele sind bereits über fetchAllGamesForSession geladen.
          // Nichts weiter zu tun.
          if (!isCancelled) {
            setActiveGameData(null);
            setActiveGameRounds([]);
          }
          if (activeGameUnsubscribe) { activeGameUnsubscribe(); activeGameUnsubscribe = null; }
          if (activeRoundsUnsubscribe) { activeRoundsUnsubscribe(); activeRoundsUnsubscribe = null; }
        }

        if (!isCancelled) {
          setError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setError('Fehler beim Laden der Session-Daten');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    // Cleanup beim Unmount oder Dependency-Wechsel
    return () => {
      isCancelled = true;
      if (activeGameUnsubscribe) {
        activeGameUnsubscribe();
        activeGameUnsubscribe = null;
      }
      if (activeRoundsUnsubscribe) {
        activeRoundsUnsubscribe();
        activeRoundsUnsubscribe = null;
      }
    };
  }, [router.isReady, sessionId, groupIdFromQuery]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent text-white">
          <ClipLoader color="#ffffff" size={40} />
          <p className="mt-4 text-lg">Lade Jass-Session...</p>
          <p className="mt-2 text-sm text-gray-400">ID: {sessionId}</p>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent text-white p-4">
          <div className="text-red-400 bg-red-900/30 p-6 rounded-md max-w-md text-center">
            <h1 className="text-xl font-bold mb-2">Fehler</h1>
            <p>{error}</p>
            <p className="mt-2 text-sm text-gray-500">ID: {sessionId}</p>
          </div>
        </div>
      </MainLayout>
    );
  }
  
  if (!sessionData) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent text-white">
          <p>Keine Session-Daten verfügbar.</p>
        </div>
      </MainLayout>
    );
  }

  // 🎯 BULLETPROOF: Warte auf vollständige Live-Daten bevor Rendering
  const hasActiveGame = sessionData.currentActiveGameId || sessionData.activeGameId;
  
  if (isPublicRoute && hasActiveGame && (!activeGameData || activeGameRounds.length === 0)) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-transparent text-white">
          <ClipLoader color="#ffffff" size={40} />
          <p className="mt-4 text-lg">Lade Live-Spieldaten...</p>
          <p className="mt-2 text-sm text-gray-400">ActiveGame: {sessionData.currentActiveGameId || sessionData.activeGameId}</p>
        </div>
      </MainLayout>
    );
  }

  const gameDataForViewer = {
    games: allGames, // ✅ V4: Verwendet die kombinierte und sortierte Liste
    playerNames: sessionData.playerNames || { 1: 'Spieler 1', 2: 'Spieler 2', 3: 'Spieler 3', 4: 'Spieler 4' },
    currentScores: (activeGameData?.scores) || sessionData.finalScores || { top: 0, bottom: 0 },
    currentStriche: (activeGameData?.striche) || sessionData.finalStriche || { 
      top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
      bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
    },
    weisPoints: (activeGameData?.weisPoints) || sessionData.weisPoints || { top: 0, bottom: 0 },
    // 🎯 NEU: Live-Runden für aktuelle Partie
    roundHistory: activeGameRounds, // Live-Runden aus activeGames/{id}/rounds
    currentHistoryIndex: activeGameRounds.length > 0 ? activeGameRounds.length - 1 : -1,
    cardStyle: sessionData.cardStyle || DEFAULT_FARBE_SETTINGS.cardStyle,
    strokeSettings: sessionData.strokeSettings || DEFAULT_STROKE_SETTINGS,
    scoreSettings: {
      ...DEFAULT_SCORE_SETTINGS,
      ...(sessionData.scoreSettings || {}),
    },
    startedAt: sessionData.startedAt || Date.now(),
    // NEU: Spruch-relevante Felder für GameViewerKreidetafel
    sessionId: sessionId, // Wichtig für Spruch-Generierung und -Speicherung
    jassSpruch: undefined, // Sprüche werden nicht mehr gespeichert, sondern immer fresh generiert
    // NEU: Gruppen-Statistiken falls verfügbar
    groupStats: groupStats ? {
      groupName: groupStats.groupName,
      playerWithHighestMatschBilanz: groupStats.playerWithHighestMatschBilanz,
      playerWithHighestSchneiderBilanz: groupStats.playerWithHighestSchneiderBilanz,
      playerWithHighestStricheDiff: groupStats.playerWithHighestStricheDiff,
      playerWithHighestWinRateSession: groupStats.playerWithHighestWinRateSession,
      teamWithHighestMatschBilanz: groupStats.teamWithHighestMatschBilanz,
      avgGamesPerSession: groupStats.avgGamesPerSession,
      avgMatschPerGame: groupStats.avgMatschPerGame,
      sessionCount: groupStats.sessionCount
    } : undefined,
    
    // ✅ NEU: Session-Level Daten für Spruch-Generierung (OHNE Meta-Game!)
    sessionLevelData: {
      eventCounts: sessionData.eventCounts,
      gameResults: sessionData.gameResults,
      gameWinsByTeam: sessionData.gameWinsByTeam,
      gameWinsByPlayer: sessionData.gameWinsByPlayer,
      gamesPlayed: sessionData.gamesPlayed,
      durationSeconds: sessionData.durationSeconds,
      winnerTeamKey: sessionData.winnerTeamKey,
      finalStriche: sessionData.finalStriche,                  // 🚨 KRITISCH: finalStriche hinzufügen!
      aggregatedTrumpfCountsByPlayer: sessionData.aggregatedTrumpfCountsByPlayer,
      aggregatedRoundDurationsByPlayer: sessionData.aggregatedRoundDurationsByPlayer,
      sessionTotalWeisPoints: sessionData.sessionTotalWeisPoints,
      totalRounds: sessionData.totalRounds
    }
  };


  return (
    <MainLayout>
      <div className="h-full-minus-header">
        <GameViewerKreidetafel 
          gameData={gameDataForViewer} 
          gameTypeLabel="Spiel" 
          onBackClick={handleBackClick} // 🚨 HIER: Intelligente Funktion übergeben
        />
      </div>
    </MainLayout>
  );
};

export default PublicSessionPage; 