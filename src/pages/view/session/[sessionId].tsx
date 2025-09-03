"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import type { CompletedGameSummary, JassSession, RoundEntry } from '@/types/jass'; // RoundEntry hinzugefügt
import FullscreenLoader from '@/components/ui/FullscreenLoader';
import MainLayout from '@/components/layout/MainLayout';
import { ArrowLeft } from 'lucide-react'; // <-- Import ArrowLeft icon
// Firestore imports hinzufügen
import { getFirestore, doc, collection, getDoc, getDocs, query, orderBy, Timestamp as ClientTimestamp } from 'firebase/firestore';
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
  const sessionId = router.query.sessionId as string;


  // Session-Daten Zustand
  const [sessionData, setSessionData] = useState<any>(null);
  const [completedGames, setCompletedGames] = useState<CompletedGameSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupStats, setGroupStats] = useState<any>(null); // NEU: State für Gruppen-Statistiken

  // 🚨 INTELLIGENTE ZURÜCK-NAVIGATION (an den Anfang verschoben)
  const handleBackClick = useCallback(() => {
    const referrer = document.referrer;
    console.log('[SessionPage] Zurück-Navigation von Referrer:', referrer);
    
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
      console.log('[SessionPage] Interne History vorhanden, navigiere zurück');
      router.back();
    } else {
      // Fall 5: Absoluter Notfall-Fallback
      console.log('[SessionPage] Keine History, kein Referrer, keine groupId. Navigiere zu /start');
      router.push('/start');
    }
  }, [router, sessionData?.groupId]); // sessionData.groupId als Abhängigkeit hinzufügen

  useEffect(() => {
    if (!sessionId) {
      console.log('🔍 [SessionView] No sessionId, returning');
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 [SessionView] Loading session data for sessionId:', sessionId);
        }
        
        // 🚀 NEUE ARCHITEKTUR: Session aus neuer Struktur laden
        // Versuche zunächst aus allen Gruppen des Users zu laden
        const auth = getAuth(firebaseApp);
        const user = auth.currentUser;
        
        if (!user) {
          console.log('🔍 [SessionView] No authenticated user');
          setError('Nicht angemeldet');
          return;
        }

        // Hole User-Dokument um Gruppen zu finden
        const userDoc = await getDoc(doc(getFirestore(firebaseApp), 'users', user.uid));
        if (!userDoc.exists()) {
          console.log('🔍 [SessionView] User document not found');
          setError('Benutzer nicht gefunden');
          return;
        }

        const userData = userDoc.data();
        const playerDoc = await getDoc(doc(getFirestore(firebaseApp), 'players', userData.playerId));
        
        if (!playerDoc.exists()) {
          console.log('🔍 [SessionView] Player document not found');
          setError('Spieler nicht gefunden');
          return;
        }

        const playerData = playerDoc.data();
        const groupIds = playerData.groupIds || [];

        // Durchsuche alle Gruppen nach der Session
        let sessionDoc: any = null;
        let foundGroupId: string | null = null;

        for (const groupId of groupIds) {
          try {
            const groupSessionDoc = await getDoc(doc(getFirestore(firebaseApp), `groups/${groupId}/jassGameSummaries`, sessionId));
            if (groupSessionDoc.exists()) {
              sessionDoc = groupSessionDoc;
              foundGroupId = groupId;
              break;
            }
          } catch (error) {
            console.log(`🔍 [SessionView] Error checking group ${groupId}:`, error);
          }
        }
        
        if (!sessionDoc || !sessionDoc.exists()) {
          console.log('🔍 [SessionView] Session document does not exist:', sessionId);
          setError('Session nicht gefunden');
          return;
        }

        const sessionDataResult = sessionDoc.data();
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 [SessionView] Session data loaded:', sessionDataResult);
        }
        setSessionData(sessionDataResult);

        // 🚀 NEUE ARCHITEKTUR: Lade groupStats aus neuer Struktur
        if (foundGroupId) {
          try {
            const groupStatsDoc = await getDoc(doc(getFirestore(firebaseApp), 'groups', foundGroupId, 'stats', 'computed'));
            if (groupStatsDoc.exists()) {
              const groupStatsData = groupStatsDoc.data();
              if (process.env.NODE_ENV === 'development') {
                console.log('🔍 [SessionView] Group stats loaded from NEW structure:', groupStatsData);
              }
              setGroupStats(groupStatsData);
            }
          } catch (error) {
            console.warn('🔍 [SessionView] Could not load group stats from NEW structure:', error);
            // Kein kritischer Fehler - wir können ohne groupStats weitermachen
          }
        }

        // Completed Games laden
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 [SessionView] Loading completed games for sessionId:', sessionId, 'groupId:', foundGroupId);
        }
        const completedGamesResult = await fetchAllGamesForSession(sessionId, foundGroupId || undefined);
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 [SessionView] Completed games loaded:', completedGamesResult);
          console.log('🔍 [SessionView] Number of completed games:', completedGamesResult.length);
        }
        
        setCompletedGames(completedGamesResult);
        setError(null);
      } catch (error) {
        console.error('🔍 [SessionView] Error loading data:', error);
        setError('Fehler beim Laden der Session-Daten');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [sessionId]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
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
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
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
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
          <p>Keine Session-Daten verfügbar.</p>
        </div>
      </MainLayout>
    );
  }

  // 🚨 KORREKTUR: Kein Meta-Game mehr! Session-Daten direkt übergeben
  const gameDataForViewer = {
    games: completedGames, // ✅ NUR die echten Spiele
    playerNames: sessionData.playerNames || { 1: 'Spieler 1', 2: 'Spieler 2', 3: 'Spieler 3', 4: 'Spieler 4' },
    currentScores: sessionData.finalScores || { top: 0, bottom: 0 },
    currentStriche: sessionData.finalStriche || { 
      top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }, 
      bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } 
    },
    weisPoints: sessionData.weisPoints || { top: 0, bottom: 0 },
    cardStyle: sessionData.cardStyle || DEFAULT_FARBE_SETTINGS.cardStyle,
    strokeSettings: sessionData.strokeSettings || DEFAULT_STROKE_SETTINGS,
    scoreSettings: sessionData.scoreSettings || DEFAULT_SCORE_SETTINGS,
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