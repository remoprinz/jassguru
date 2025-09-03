"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import type { CompletedGameSummary, JassSession, RoundEntry } from '@/types/jass';
import FullscreenLoader from '@/components/ui/FullscreenLoader';
import MainLayout from '@/components/layout/MainLayout';
import { ArrowLeft } from 'lucide-react';
// Firestore imports
import { getFirestore, doc, collection, getDoc, getDocs, query, orderBy, Timestamp as ClientTimestamp, onSnapshot } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit';
// Import display component and defaults
import GameViewerKreidetafel from '@/components/layout/GameViewerKreidetafel';
// Import UIStore
import { useUIStore } from '@/store/uiStore';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { format } from 'date-fns';
// Import needed types
import type { StrokeSettings, CardStyle, PlayerNames, TeamScores, StricheRecord, ScoreSettings } from '@/types/jass';
import { ClipLoader } from 'react-spinners';
// Imports entfernt - wir laden direkt aus Firestore statt über Services

// Helper functions for timestamps (same as in original)
function parseFirebaseTimestamp(timestamp: any): number | null {
    if (!timestamp) return null;

    // 1. Real Firebase ClientTimestamp instance
    if (timestamp instanceof ClientTimestamp) {
        return timestamp.toMillis();
    }

    // 2. Object structure check
    if (typeof timestamp === 'object' && timestamp !== null) {
        // 2a. If it has a toDate function
        if (typeof (timestamp as any).toDate === 'function') {
            try {
                return (timestamp as any).toDate().getTime();
            } catch (e) {
                // Fall-through
            }
        }

        // 2b. Check for objects with seconds/nanoseconds
        const secondsProp = (timestamp as any).seconds ?? (timestamp as any)._seconds;
        const nanosecondsProp = (timestamp as any).nanoseconds ?? (timestamp as any)._nanoseconds;

        if (typeof secondsProp === 'number' && typeof nanosecondsProp === 'number') {
            try {
                return new ClientTimestamp(secondsProp, nanosecondsProp).toMillis();
            } catch (e) {
                // Fall-through
            }
        }
    }

    // 3. ISO string check
    if (typeof timestamp === 'string') {
        try {
            const date = new Date(timestamp);
            if (!isNaN(date.getTime())) {
                return date.getTime();
            }
        } catch (e) {
            // Fall-through
        }
    }

    // 4. Number check (milliseconds)
    if (typeof timestamp === 'number' && timestamp > 0) {
        return timestamp;
    }

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
            if (typeof timestamp === 'object' && 
                ('seconds' in timestamp || '_seconds' in timestamp) &&
                ('nanoseconds' in timestamp || '_nanoseconds' in timestamp)) {
                const seconds = timestamp.seconds ?? timestamp._seconds ?? 0;
                const nanoseconds = timestamp.nanoseconds ?? timestamp._nanoseconds ?? 0;
                return new ClientTimestamp(seconds, nanoseconds);
            }
            
            if (typeof timestamp === 'number') {
                const seconds = Math.floor(timestamp / 1000);
                const nanoseconds = (timestamp % 1000) * 1000000;
                return new ClientTimestamp(seconds, nanoseconds);
            }
            
            return null;
        } catch (error) {
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

interface FarbeSettings {
  cardStyle: CardStyle;
}

interface FirestoreGroup {
  strokeSettings?: StrokeSettings;
  farbeSettings?: FarbeSettings;
  scoreSettings?: ScoreSettings;
}

const PublicSessionViewPage = () => {
  const router = useRouter();
  const sessionId = router.query.sessionId as string;

  // Session data state
  const [sessionData, setSessionData] = useState<any>(null);
  const [completedGames, setCompletedGames] = useState<CompletedGameSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupStats, setGroupStats] = useState<any>(null);
  const [groupId, setGroupId] = useState<string | null>(null);

  // Real-time listener cleanup
  const [unsubscribeGames, setUnsubscribeGames] = useState<(() => void) | null>(null);
  const [unsubscribeSession, setUnsubscribeSession] = useState<(() => void) | null>(null);

  // Back navigation
  const handleBackClick = useCallback(() => {
    const referrer = document.referrer;
    console.log('[PublicSessionView] Back navigation from referrer:', referrer);
    
    // Case 1: Coming from a public group page
    const publicGroupMatch = referrer.match(/\/view\/group\/([^/?]+)/);
    if (publicGroupMatch) {
      const groupIdFromReferrer = publicGroupMatch[1];
      console.log('[PublicSessionView] Navigating back to public group:', `/view/group/${groupIdFromReferrer}`);
      router.push(`/view/group/${groupIdFromReferrer}`);
      return;
    }
    
    // Case 2: We have group data
    if (groupId) {
      console.log(`[PublicSessionView] Using groupId (${groupId}) to navigate back`);
      router.push(`/view/group/${groupId}`);
      return;
    }

    // Case 3: Fallback to home
    console.log('[PublicSessionView] No group context, navigating to home');
    router.push('/');
  }, [router, groupId]);

  // Load session data
  useEffect(() => {
    if (!sessionId) {
      console.log('🔍 [PublicSessionView] No sessionId, returning');
      return;
    }

    const loadData = async () => {
      try {
        setIsLoading(true);
        console.log('🔍 [PublicSessionView] Loading public session data for sessionId:', sessionId);
        
        const db = getFirestore(firebaseApp);
        
        // ✅ KORREKTUR: Suche direkt im Sessions-Hauptverzeichnis (nicht in Gruppen!)
        console.log('🔍 [PublicSessionView] Searching for session in /sessions/', sessionId);
        
        const sessionDocRef = doc(db, 'sessions', sessionId);
        const sessionDoc = await getDoc(sessionDocRef);
        
        if (!sessionDoc.exists()) {
          console.log('🔍 [PublicSessionView] Session document does not exist:', sessionId);
          setError('Session nicht gefunden oder nicht öffentlich zugänglich');
          return;
        }
        
        // Session-Daten extrahieren
        const sessionDataResult = sessionDoc.data();
        const foundGroupId = sessionDataResult.groupId || sessionDataResult.gruppeId || null;
        
        // Optional: Gruppen-Daten laden für zusätzliche Informationen (falls benötigt)
        let foundGroupData: any = null;
        if (foundGroupId) {
          try {
            const groupDoc = await getDoc(doc(db, 'groups', foundGroupId));
            if (groupDoc.exists()) {
              foundGroupData = groupDoc.data();
            }
          } catch (error) {
            console.log(`🔍 [PublicSessionView] Error loading group data:`, error);
          }
        }

        console.log('🔍 [PublicSessionView] Session data loaded:', sessionDataResult);
        setSessionData(sessionDataResult);
        setGroupId(foundGroupId);

        // Load group stats if available
        if (foundGroupId) {
          try {
            const groupStatsDoc = await getDoc(doc(db, 'groups', foundGroupId, 'stats', 'computed'));
            if (groupStatsDoc.exists()) {
              const groupStatsData = groupStatsDoc.data();
              console.log('🔍 [PublicSessionView] Group stats loaded:', groupStatsData);
              setGroupStats(groupStatsData);
            }
          } catch (error) {
            console.warn('🔍 [PublicSessionView] Could not load group stats:', error);
          }
        }

        // ✅ KORREKTUR: Lade sowohl CompletedGames als auch ActiveGame
        if (!foundGroupId) {
          setError('Session is not associated with a group. Cannot load game data.');
          setIsLoading(false);
          return;
        }

        console.log(`🔍 [PublicSessionView] Loading completed games from /groups/${foundGroupId}/jassGameSummaries/${sessionId}/completedGames`);
        const completedGamesRef = collection(db, 'groups', foundGroupId, 'jassGameSummaries', sessionId, 'completedGames');
        const completedGamesQuery = query(completedGamesRef, orderBy('gameNumber', 'asc'));
        const completedGamesSnapshot = await getDocs(completedGamesQuery);
        
        let completedGamesData = completedGamesSnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        }));
        
        console.log('🔍 [PublicSessionView] Completed games loaded:', completedGamesData.length);
        
        // ✅ NEU: Lade auch das aktive Spiel falls vorhanden
        if (sessionDataResult.currentActiveGameId) {
          console.log('🔍 [PublicSessionView] Loading active game:', sessionDataResult.currentActiveGameId);
          try {
            const activeGameDoc = await getDoc(doc(db, 'activeGames', sessionDataResult.currentActiveGameId));
            if (activeGameDoc.exists()) {
              const activeGameData = activeGameDoc.data();
              console.log('🔍 [PublicSessionView] Active game loaded:', activeGameData);
              
              // ✅ KRITISCH: Lade die roundHistory aus der Subcollection
              const roundsRef = collection(db, 'activeGames', sessionDataResult.currentActiveGameId, 'rounds');
              const roundsQuery = query(roundsRef, orderBy('roundId', 'asc'));
              const roundsSnapshot = await getDocs(roundsQuery);
              
              const loadedRounds = roundsSnapshot.docs
                .map(doc => ({
                  ...doc.data(),
                  id: doc.id
                }))
                .filter((round: any) => round.isActive !== false) // Nur aktive Runden
                .sort((a: any, b: any) => (a.roundId || 0) - (b.roundId || 0));
              
              console.log('🔍 [PublicSessionView] Loaded rounds from subcollection:', loadedRounds.length);
              
              // Überschreibe die leere roundHistory mit den geladenen Runden
              activeGameData.roundHistory = loadedRounds;
              
              // 🐛 DEBUG: Log the roundHistory at initial load
              console.log('🔍 [PublicSessionView] Initial active game roundHistory:', activeGameData.roundHistory?.length || 0, 'rounds');
              if (activeGameData.roundHistory?.length > 0) {
                console.log('🔍 [PublicSessionView] Initial first round example:', activeGameData.roundHistory[0]);
              }
              
              // Konvertiere ActiveGame zu CompletedGameSummary-Format für die Anzeige
              const activeGameAsSummary = {
                gameNumber: activeGameData.currentGameNumber || (completedGamesData.length + 1),
                finalScores: activeGameData.scores || { top: 0, bottom: 0 },
                finalStriche: activeGameData.striche || { 
                  top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                  bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
                },
                playerNames: activeGameData.playerNames || sessionDataResult.playerNames,
                timestampCompleted: new Date(), // Aktueller Zeitstempel für aktive Spiele
                weisPoints: activeGameData.weisPoints || { top: 0, bottom: 0 },
                startingPlayer: activeGameData.startingPlayer || 1,
                initialStartingPlayer: activeGameData.initialStartingPlayer || 1,
                roundHistory: activeGameData.roundHistory || [],
                participantUids: sessionDataResult.participantUids || [],
                groupId: foundGroupId,
                activeGameId: sessionDataResult.currentActiveGameId,
                // ✅ NEU: Fehlende CompletedGameSummary Properties hinzufügen
                durationMillis: 0, // Aktive Spiele haben noch keine finale Dauer
                eventCounts: { // Standard-Eventcounts für aktive Spiele
                  top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                  bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
                },
                trumpColorsPlayed: [], // Noch keine finalen Trumpf-Farben
                isActiveGame: true // Markiere als aktives Spiel
              } as any; // Type Assertion um TypeScript zu umgehen
              
              console.log('🔍 [PublicSessionView] Adding active game to list with isActiveGame:', true);
              completedGamesData.push(activeGameAsSummary as any);
              console.log('🔍 [PublicSessionView] Combined games (completed + active):', completedGamesData.length);
            }
          } catch (error) {
            console.warn('🔍 [PublicSessionView] Could not load active game:', error);
          }
        }
        
        setCompletedGames(completedGamesData as any);

        // ✅ KORREKTUR: Real-time Listener für sowohl CompletedGames als auch ActiveGame
        const unsubscribeGamesFn = onSnapshot(completedGamesQuery, async (snapshot) => {
          let games = snapshot.docs.map(doc => ({
            ...doc.data(),
            id: doc.id
          }));
          
          // ✅ NEU: Auch ActiveGame in Real-time Updates einbeziehen
          if (sessionDataResult.currentActiveGameId) {
            try {
              const activeGameDoc = await getDoc(doc(db, 'activeGames', sessionDataResult.currentActiveGameId));
              if (activeGameDoc.exists()) {
                              const activeGameData = activeGameDoc.data();
              const activeGameAsSummary = {
                gameNumber: activeGameData.currentGameNumber || (games.length + 1),
                finalScores: activeGameData.scores || { top: 0, bottom: 0 },
                finalStriche: activeGameData.striche || { 
                  top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                  bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
                },
                playerNames: activeGameData.playerNames || sessionDataResult.playerNames,
                timestampCompleted: new Date(),
                weisPoints: activeGameData.weisPoints || { top: 0, bottom: 0 },
                startingPlayer: activeGameData.startingPlayer || 1,
                initialStartingPlayer: activeGameData.initialStartingPlayer || 1,
                roundHistory: activeGameData.roundHistory || [],
                participantUids: sessionDataResult.participantUids || [],
                groupId: foundGroupId,
                activeGameId: sessionDataResult.currentActiveGameId,
                // ✅ NEU: Fehlende CompletedGameSummary Properties hinzufügen
                durationMillis: 0, // Aktive Spiele haben noch keine finale Dauer
                eventCounts: { // Standard-Eventcounts für aktive Spiele
                  top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                  bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
                },
                trumpColorsPlayed: [], // Noch keine finalen Trumpf-Farben
                isActiveGame: true
              } as any; // Type Assertion um TypeScript zu umgehen
                games.push(activeGameAsSummary as any);
              }
            } catch (error) {
              console.warn('🔍 [PublicSessionView] Real-time: Could not load active game:', error);
            }
          }
          
          console.log('🔍 [PublicSessionView] Real-time update: games changed', games.length);
          setCompletedGames(games as any);
        });
        setUnsubscribeGames(() => unsubscribeGamesFn);
        
        // ✅ KORREKTUR: Real-time Listener für Session-Metadaten direkt aus Sessions
        const unsubscribeSessionFn = onSnapshot(sessionDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const updatedSessionData = docSnap.data();
            console.log('🔍 [PublicSessionView] Real-time update: session metadata changed');
            setSessionData(updatedSessionData);
          }
        }, (error) => {
          console.error('🔍 [PublicSessionView] Error in session listener:', error);
        });
        setUnsubscribeSession(() => unsubscribeSessionFn);
        
        // ✅ NEU: Separater Real-time Listener für das ActiveGame
        if (sessionDataResult.currentActiveGameId) {
          console.log('🔍 [PublicSessionView] Setting up real-time listener for active game:', sessionDataResult.currentActiveGameId);
          const activeGameRef = doc(db, 'activeGames', sessionDataResult.currentActiveGameId);
          
          // ✅ KRITISCH: Listener für die rounds Subcollection
          const roundsRef = collection(db, 'activeGames', sessionDataResult.currentActiveGameId, 'rounds');
          const roundsQuery = query(roundsRef, orderBy('roundId', 'asc'));
          
          // Kombinierter Listener für Hauptdokument UND rounds
          const unsubscribeActiveGameFn = onSnapshot(activeGameRef, async (doc) => {
            if (doc.exists()) {
              console.log('🔍 [PublicSessionView] Real-time update: active game changed');
              // ✅ KORREKTUR: Aktualisiere die Games-Liste direkt mit neuen ActiveGame-Daten
              const activeGameData = doc.data();
              
              // ✅ KRITISCH: Lade rounds aus der Subcollection bei jedem Update
              try {
                const roundsSnapshot = await getDocs(roundsQuery);
                const loadedRounds = roundsSnapshot.docs
                  .map(doc => ({
                    ...doc.data(),
                    id: doc.id
                  }))
                  .filter((round: any) => round.isActive !== false)
                  .sort((a: any, b: any) => (a.roundId || 0) - (b.roundId || 0));
                
                activeGameData.roundHistory = loadedRounds;
                console.log('🔍 [PublicSessionView] Real-time: Loaded rounds from subcollection:', loadedRounds.length);
              } catch (error) {
                console.warn('🔍 [PublicSessionView] Real-time: Error loading rounds:', error);
                activeGameData.roundHistory = [];
              }
              
              // 🐛 DEBUG: Log the roundHistory to see what we're getting
              console.log('🔍 [PublicSessionView] Active game roundHistory:', activeGameData.roundHistory?.length || 0, 'rounds');
              if (activeGameData.roundHistory?.length > 0) {
                console.log('🔍 [PublicSessionView] First round example:', activeGameData.roundHistory[0]);
              }
              
              setCompletedGames(currentGames => {
                // Entferne alte ActiveGame-Einträge und füge das neue hinzu
                const gamesWithoutActive = currentGames.filter((game: any) => !game.isActiveGame);
                const activeGameAsSummary = {
                  gameNumber: activeGameData.currentGameNumber || (gamesWithoutActive.length + 1),
                  finalScores: activeGameData.scores || { top: 0, bottom: 0 },
                  finalStriche: activeGameData.striche || { 
                    top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                    bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
                  },
                  playerNames: activeGameData.playerNames || sessionDataResult.playerNames,
                  timestampCompleted: new Date(),
                  weisPoints: activeGameData.weisPoints || { top: 0, bottom: 0 },
                  startingPlayer: activeGameData.startingPlayer || 1,
                  initialStartingPlayer: activeGameData.initialStartingPlayer || 1,
                  roundHistory: activeGameData.roundHistory || [],
                  participantUids: sessionDataResult.participantUids || [],
                  groupId: foundGroupId,
                  activeGameId: sessionDataResult.currentActiveGameId,
                  // ✅ NEU: Fehlende CompletedGameSummary Properties hinzufügen
                  durationMillis: 0, // Aktive Spiele haben noch keine finale Dauer
                  eventCounts: { // Standard-Eventcounts für aktive Spiele
                    top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
                    bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
                  },
                  trumpColorsPlayed: [], // Noch keine finalen Trumpf-Farben
                  isActiveGame: true
                } as any; // Type Assertion um TypeScript zu umgehen
                
                console.log('🔍 [PublicSessionView] Real-time: Adding active game with roundHistory length:', activeGameData.roundHistory?.length || 0);
                return [...gamesWithoutActive, activeGameAsSummary];
              });
            }
          }, (error) => {
            console.error('🔍 [PublicSessionView] Error in active game listener:', error);
          });
          // Cleanup-Funktion für ActiveGame-Listener (erstmal nur loggen)
          const cleanup = unsubscribeSession;
          setUnsubscribeSession(() => () => {
            cleanup?.();
            unsubscribeActiveGameFn();
          });
        }
        
        setError(null);
      } catch (error) {
        console.error('🔍 [PublicSessionView] Error loading data:', error);
        setError('Fehler beim Laden der Session-Daten');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
    
    // Cleanup real-time listeners on unmount
    return () => {
      if (unsubscribeGames) {
        unsubscribeGames();
      }
      if (unsubscribeSession) {
        unsubscribeSession();
      }
    };
  }, [sessionId]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
          <ClipLoader color="#ffffff" size={40} />
          <p className="mt-4 text-lg">Lade öffentliche Jass-Session...</p>
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

  // Prepare data for GameViewerKreidetafel
  const gameDataForViewer = {
    games: completedGames,
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
    sessionId: sessionId,
    jassSpruch: undefined,
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
    sessionLevelData: {
      eventCounts: sessionData.eventCounts,
      gameResults: sessionData.gameResults,
      gameWinsByTeam: sessionData.gameWinsByTeam,
      gameWinsByPlayer: sessionData.gameWinsByPlayer,
      gamesPlayed: sessionData.gamesPlayed,
      durationSeconds: sessionData.durationSeconds,
      winnerTeamKey: sessionData.winnerTeamKey,
      finalStriche: sessionData.finalStriche,
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
          gameTypeLabel="Live Jass" 
          onBackClick={handleBackClick}
        />
      </div>
    </MainLayout>
  );
};

export default PublicSessionViewPage; 

