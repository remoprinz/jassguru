"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useTournamentStore } from '@/store/tournamentStore';
import { useAuthStore } from '@/store/authStore';
import MainLayout from '@/components/layout/MainLayout';
import GameViewerKreidetafel from '@/components/layout/GameViewerKreidetafel';
import FullscreenLoader from '@/components/ui/FullscreenLoader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

import type { TournamentGame, TournamentSettings } from '@/types/tournament';
import type { GameViewerKreidetafelProps } from '@/components/layout/GameViewerKreidetafel';
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { Timestamp } from 'firebase/firestore';
import type { GameEntry, PlayerNames, GamePlayers } from '@/types/jass';
import { TournamentRoundHistoryDisplay } from '@/statistics/TournamentRoundHistoryDisplay';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';


// Die Transformationsfunktion (vorerst hierhin kopiert und angepasst)
// TODO: Ggf. in eine Utility-Datei auslagern, falls auch woanders benötigt
const transformTournamentGameToViewerData = (
  passe: TournamentGame | null,
  settings: TournamentSettings | undefined
): GameViewerKreidetafelProps['gameData'] | null => {
  if (!passe) return null;

  const currentSettings = settings || {
    scoreSettings: DEFAULT_SCORE_SETTINGS,
    strokeSettings: DEFAULT_STROKE_SETTINGS,
    // farbeSettings: DEFAULT_FARBE_SETTINGS, // Falls benötigt
    // gameTypeSettings: DEFAULT_GAME_TYPE_SETTINGS, // Falls benötigt
  };

  const playerNames: PlayerNames = { 1: '', 2: '', 3: '', 4: '' };
  const gamePlayers: GamePlayers = { 1: null, 2: null, 3: null, 4: null };

  passe.playerDetails.forEach(detail => {
    playerNames[detail.seat] = detail.playerName;
    gamePlayers[detail.seat] = {
      userId: detail.playerId,
      displayName: detail.playerName,
      // Das 'team'-Feld ist hier nicht direkt Teil von MemberInfo/GuestInfo
      // und wird durch die Struktur von GameViewerKreidetafel basierend auf playerNames und Team-Layouts gehandhabt.
    } as any; // Halten wir 'as any' für den Moment bei, um die Struktur zu vervollständigen.
  });

  const gameEntryForViewer: GameEntry = {
    id: passe.passeId,
    gameNumber: passe.passeNumber,
    teams: {
      top: {
        striche: passe.teamStrichePasse.top,
        jassPoints: passe.teamScoresPasse.top - (passe.playerDetails.filter(d => d.team === 'top').reduce((sum, d) => sum + (d.weisInPasse || 0), 0)),
        weisPoints: passe.playerDetails.filter(d => d.team === 'top').reduce((sum, d) => sum + (d.weisInPasse || 0), 0),
        total: passe.teamScoresPasse.top,
        playerStats: {1: null, 2: null, 3: null, 4: null} as any, bergActive: false, bedankenActive: false, isSigned: false,
      },
      bottom: {
        striche: passe.teamStrichePasse.bottom,
        jassPoints: passe.teamScoresPasse.bottom - (passe.playerDetails.filter(d => d.team === 'bottom').reduce((sum, d) => sum + (d.weisInPasse || 0), 0)),
        weisPoints: passe.playerDetails.filter(d => d.team === 'bottom').reduce((sum, d) => sum + (d.weisInPasse || 0), 0),
        total: passe.teamScoresPasse.bottom,
        playerStats: {1: null, 2: null, 3: null, 4: null} as any, bergActive: false, bedankenActive: false, isSigned: false,
      },
    },
    timestamp: passe.startedAt instanceof Timestamp ? passe.startedAt.toMillis() : Date.now(),
    sessionId: passe.tournamentInstanceId,
    currentRound: passe.roundHistory ? passe.roundHistory.length + 1 : 1,
    startingPlayer: passe.startingPlayer,
    initialStartingPlayer: passe.startingPlayer,
    currentPlayer: passe.startingPlayer,
    roundHistory: passe.roundHistory ?? [],
    currentHistoryIndex: passe.roundHistory ? passe.roundHistory.length -1 : -1,
    historyState: { lastNavigationTimestamp: Date.now() },
    isGameStarted: true,
    isRoundCompleted: true,
    isGameCompleted: true,
    scoreSettings: currentSettings.scoreSettings,
    strokeSettings: currentSettings.strokeSettings,
  };

  const viewerData: GameViewerKreidetafelProps['gameData'] = {
    games: [gameEntryForViewer],
    playerNames,
    currentScores: passe.teamScoresPasse,
    currentStriche: passe.teamStrichePasse,
    weisPoints: {
      top: passe.playerDetails.filter(d => d.team === 'top').reduce((sum, d) => sum + (d.weisInPasse || 0), 0),
      bottom: passe.playerDetails.filter(d => d.team === 'bottom').reduce((sum, d) => sum + (d.weisInPasse || 0), 0),
    },
    scoreSettings: currentSettings.scoreSettings,
    strokeSettings: currentSettings.strokeSettings,
    // cardStyle: currentSettings.farbeSettings?.cardStyle, // Beispiel, falls farbeSettings relevant werden
  };

  return viewerData;
};


const PasseDetailPage: React.FC = () => {
  const router = useRouter();
  const { instanceId, passeId } = router.query as { instanceId: string; passeId: string };
  const { user } = useAuthStore();

  const fetchTournamentInstanceDetails = useTournamentStore((state) => state.fetchTournamentInstanceDetails);
  const fetchTournamentGameById = useTournamentStore((state) => state.fetchTournamentGameById);
  const tournament = useTournamentStore((state) => state.currentTournamentInstance);
  const currentPasse = useTournamentStore((state) => state.currentViewingPasse);
  const detailsStatus = useTournamentStore((state) => state.detailsStatus);
  const passeStatus = useTournamentStore((state) => state.passeDetailsStatus); // Neuer Status für einzelne Passe
  const error = useTournamentStore((state) => state.error);

  const [viewerData, setViewerData] = useState<GameViewerKreidetafelProps['gameData'] | null>(null);

  useEffect(() => {
    if (instanceId && !tournament) {
      console.log(`[PasseDetailPage] Fetching tournament details for instance: ${instanceId}`);
      fetchTournamentInstanceDetails(instanceId);
    }
  }, [instanceId, tournament, fetchTournamentInstanceDetails]);

  useEffect(() => {
    const shouldFetch = instanceId && passeId &&
                        (!currentPasse || currentPasse.passeId !== passeId) &&
                        passeStatus !== 'loading';

    if (shouldFetch) {
      console.log(`[PasseDetailPage修正] Fetching passe details for: ${passeId} in tournament ${instanceId}. CurrentPasseId: ${currentPasse?.passeId}`);
      fetchTournamentGameById(instanceId, passeId);
    }
  }, [instanceId, passeId, currentPasse?.passeId, fetchTournamentGameById, passeStatus]);

  useEffect(() => {
    if (currentPasse && tournament && tournament.settings) {
      const transformedData = transformTournamentGameToViewerData(currentPasse, tournament.settings);
      setViewerData(transformedData);
    } else {
      setViewerData(null); // Zurücksetzen, wenn Daten fehlen
    }
  }, [currentPasse, tournament]);

  const handleGoBack = () => {
    router.push(`/view/tournament/${instanceId}`);
  };

  if (detailsStatus === 'loading' || passeStatus === 'loading') {
    return <FullscreenLoader text="Lade Passen-Details..." />;
  }

  if (error && (detailsStatus === 'error' || passeStatus === 'error')) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-xl font-semibold mb-2">Fehler beim Laden</h1>
          <p className="text-red-400 text-center mb-6">{error}</p>
          <Button onClick={handleGoBack} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zur Turnierübersicht
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (!currentPasse || !viewerData) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mb-4" />
          <h1 className="text-xl font-semibold mb-2">Passen-Details nicht gefunden</h1>
          <p className="text-yellow-300 text-center mb-6">
            Die Details für diese Passe konnten nicht geladen werden oder die Passe existiert nicht.
          </p>
          <Button onClick={handleGoBack} variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zur Turnierübersicht
          </Button>
        </div>
      </MainLayout>
    );
  }

  // PlayerNames und CardStyle für TournamentRoundHistoryDisplay extrahieren
  const playerNamesForHistory = viewerData.playerNames;
  const cardStyleForHistory = tournament?.settings?.farbeSettings?.cardStyle || DEFAULT_FARBE_SETTINGS.cardStyle;

  return (
    <MainLayout>
      {/* Entfernen: Fixed-Positionierter Button hier */}
      {/* 
      <div className="fixed top-0 left-0 z-50 p-3">
        <Button variant="ghost" size="icon" onClick={handleGoBack} className="bg-gray-800/50 hover:bg-gray-700/80 text-white rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>
      */}
      
      {/* Hauptansicht Container mit Padding für den Header-Button und ggf. Footer */}
      {/* Das Padding oben (pt-16) kann reduziert oder entfernt werden, wenn der Button nicht mehr fixed ist und den Platz nicht benötigt */}
      <div className="pb-4 h-screen flex flex-col">
        {/* Button hier oben im Flow des Containers einfügen */}
        <div className="p-3 flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={handleGoBack} className="bg-gray-800/50 hover:bg-gray-700/80 text-white rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-shrink-0 px-4 md:px-0"> {/* Optional: Horizontales Padding für die Kreidetafel, falls nötig */}
          <GameViewerKreidetafel gameData={viewerData} gameTypeLabel="Passe" />
        </div>
      </div>
    </MainLayout>
  );
};

export default PasseDetailPage; 