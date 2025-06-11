import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '@/components/layout/MainLayout';
import { Loader2, ArrowLeft, BarChart3, Award, Archive, User, Users, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlayerById } from '@/services/playerService';
import type { FirestorePlayer } from '@/types/jass';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import ProfileImage from '@/components/ui/ProfileImage';
import { Timestamp } from 'firebase/firestore';
import Link from 'next/link';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// NEU: Importe für den Store und die Transformation
import { usePlayerStatsStore } from '@/store/playerStatsStore';
import { transformComputedStatsToExtended, type TransformedPlayerStats } from '@/utils/statsTransformer';
import NotableEventsList from "@/components/profile/NotableEventsList";
import AggregateRankingList, { FrontendPartnerAggregate, FrontendOpponentAggregate } from "@/components/profile/AggregateRankingList";
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { JassColor } from '@/types/jass';

type PlayerWithPlaceholder = FirestorePlayer & { _isPlaceholder?: boolean };

// PlayerProfilePageStats ist jetzt der primäre Typ für transformierte Statistiken
interface PlayerProfilePageStats extends TransformedPlayerStats {}

// Hilfsfunktion zum Normalisieren der Trumpffarben-Namen für die JassColor Typ-Kompatibilität
const normalizeJassColor = (farbe: string): JassColor => {
  const mappings: Record<string, JassColor> = {
    "eichel": "Eicheln",
    "unde": "Une",
    "obe": "Obe"
  };
  const lowerCaseFarbe = farbe.toLowerCase();
  return (mappings[lowerCaseFarbe] ?? farbe) as JassColor;
};

// VERALTETES INTERFACE ExtendedPlayerStats ENTFERNT

// Definiere eine Struktur, die wir von rawPlayerStats erwarten, inklusive der neuen Aggregate.
interface ExpectedPlayerStatsWithAggregates {
  [key: string]: any; 
  partnerAggregates?: FrontendPartnerAggregate[];
  opponentAggregates?: FrontendOpponentAggregate[];
  // Fügen Sie hier weitere Kernfelder hinzu, die transformComputedStatsToExtended benötigt,
  // oder stellen Sie sicher, dass der [key: string]: any; ausreicht.
}

const PlayerProfilePage = () => {
  const router = useRouter();
  const { playerId } = router.query;

  const [activeMainTab, setActiveMainTab] = useState("statistics");
  const [activeStatsSubTab, setActiveStatsSubTab] = useState("individual");

  const [player, setPlayer] = useState<FirestorePlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // NEU: State und Actions aus dem playerStatsStore
  const {
    stats: rawPlayerStats,
    isLoading: statsLoading,
    error: statsError,
    subscribeToPlayerStats,
    unsubscribePlayerStats,
  } = usePlayerStatsStore();

  // Abgeleiteter State für transformierte Statistiken
  const [extendedStats, setExtendedStats] = useState<PlayerProfilePageStats | null>(null);
  
  // Cast rawPlayerStats zum erweiterten Typ, den wir hier erwarten
  const typedRawPlayerStats = rawPlayerStats as ExpectedPlayerStatsWithAggregates | null;

  // Handler für den Zurück-Button - NEUE LOGIK
  const handleGoBack = () => {
    const { returnTo, returnMainTab, returnStatsSubTab } = router.query;

    if (typeof returnTo === 'string' && returnTo === '/start' && typeof returnMainTab === 'string') {
      let path = `/start?mainTab=${returnMainTab}`;
      if (returnMainTab === 'statistics' && typeof returnStatsSubTab === 'string') {
        path += `&statsSubTab=${returnStatsSubTab}`;
      }
      router.push(path);
      return;
    }

    // Generischer Fallback: Versuche, eine Seite zurückzugehen, wenn möglich.
    // Prüfen, ob es eine Browser-History gibt, um Loops auf der ersten Seite zu vermeiden.
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
      router.back();
    } else {
      // Wenn keine History oder externer Referrer, gehe zu einer sicheren Default-Seite.
      router.push('/start'); 
    }
  };

  const trumpfStatistikArray = useMemo(() => {
    if (!extendedStats?.trumpfStatistik || !extendedStats.totalTrumpfCount || extendedStats.totalTrumpfCount === 0) {
      return [];
    }
    return Object.entries(extendedStats.trumpfStatistik)
      .map(([farbe, anzahl]) => ({
        farbe,
        anzahl,
        anteil: anzahl / (extendedStats.totalTrumpfCount ?? 1),
      }))
      .sort((a, b) => b.anzahl - a.anzahl);
  }, [extendedStats]);

  useEffect(() => {
    const fetchPlayerData = async () => {
      if (typeof playerId !== 'string') {
        if (router.isReady) {
          setError("Ungültige Spieler-ID in der URL.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const fetchedPlayer = await getPlayerById(playerId);
        console.log("Fetched Player Data from getPlayerById:", fetchedPlayer);
        if (!fetchedPlayer) {
          setError("Spieler nicht gefunden.");
        } else {
          setPlayer(fetchedPlayer);
        }
      } catch (err) {
        console.error("Fehler beim Laden des Spielerprofils:", err);
        setError(err instanceof Error ? err.message : "Profil konnte nicht geladen werden.");
      } finally {
        setIsLoading(false);
      }
    };

    if (router.isReady && playerId) {
      fetchPlayerData();
    }
  }, [playerId, router.isReady]);

  // NEUER/ANGEPASSTER useEffect Hook für Statistik-Abonnement
  useEffect(() => {
    if (player && player.userId) {
      console.log(`[PlayerProfilePage] Subscribing to stats for authUid: ${player.userId}`);
      subscribeToPlayerStats(player.userId);
    }
    // Cleanup für Listener
    return () => {
      // unsubscribePlayerStats erwartet laut Linter keine Argumente.
      // Es beendet einfach das aktuelle Abonnement des Stores.
      console.log(`[PlayerProfilePage] Unsubscribing from player stats.`);
      unsubscribePlayerStats(); 
    };
  }, [player, subscribeToPlayerStats, unsubscribePlayerStats]); // Abhängig von player Objekt

  // NEU: useEffect zur Transformation der rohen Statistiken aus dem Store
  useEffect(() => {
    if (rawPlayerStats) {
        // groupCount hier aus player.groupIds ableiten oder default 0
        const groupCount = player?.groupIds?.length || 0;
        const transformed = transformComputedStatsToExtended(rawPlayerStats, groupCount);
        setExtendedStats(transformed as PlayerProfilePageStats);
    } else {
        setExtendedStats(null);
    }
  }, [rawPlayerStats, player]);

  useEffect(() => {
    if (router.isReady) {
      const { mainTab, statsSubTab } = router.query;
      
      const newMainTab = (typeof mainTab === 'string' && ['statistics', 'archive'].includes(mainTab)) 
        ? mainTab 
        : 'statistics';
      setActiveMainTab(newMainTab);
      
      if (newMainTab === 'statistics') {
        const newStatsSubTab = (typeof statsSubTab === 'string' && ['individual', 'partner', 'opponent'].includes(statsSubTab)) 
          ? statsSubTab 
          : 'individual';
        setActiveStatsSubTab(newStatsSubTab);
      }
    }
  }, [router.isReady, router.query]);

  if (isLoading || !router.isReady) {
    return (
      <MainLayout>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
          <Loader2 className="h-8 w-8 animate-spin mb-2" />
          <span>Lade Spielerprofil...</span>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
          <Button 
            variant="ghost" 
            className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
            aria-label="Zurück"
            onClick={handleGoBack}
          >
            <ArrowLeft size={28} />
          </Button>
          <p className="text-red-400 text-center">{error}</p>
          <Button 
            variant="outline" 
            className="mt-4" 
            onClick={handleGoBack}
          >
            Zurück
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (!player) {
    return (
      <MainLayout>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
          <p className="text-gray-400">Spielerdaten konnten nicht angezeigt werden.</p>
          <Button 
            variant="outline" 
            className="mt-4" 
            onClick={handleGoBack}
          >
            Zurück
          </Button>
        </div>
      </MainLayout>
    );
  }

  const playerWithPlaceholder = player as PlayerWithPlaceholder;
  const isPlaceholder = playerWithPlaceholder._isPlaceholder;
  const jassSpruch = player.statusMessage || "Hallo! Ich jasse mit Jassguru";

  console.log("Player state before render:", player);
  console.log("Photo URL for Avatar:", player?.photoURL);
  console.log("Jass Spruch for P-Tag (using statusMessage):", jassSpruch);

  return (
    <MainLayout>
      <div className="flex min-h-screen flex-col items-center bg-gray-900 p-4 text-white relative pt-8">
        <Button 
          variant="ghost" 
          className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
          aria-label="Zurück"
          onClick={handleGoBack}
        >
          <ArrowLeft size={28} />
        </Button>

        <div className="text-center mt-6 w-full max-w-md space-y-4">
          <div className="flex justify-center items-center mx-auto">
            <ProfileImage 
              src={player.photoURL} 
              alt={player.displayName || "Unbekannter Spieler"} 
              size="xl"
              className="flex-shrink-0 border-2 border-gray-700"
              fallbackClassName={cn(
                "text-4xl font-bold",
                isPlaceholder ? 'bg-yellow-700 text-gray-300' : 'bg-blue-600 text-white'
              )}
              priority
            />
          </div>

          <h1 className="mt-4 text-3xl font-bold text-center text-white">
            {player?.displayName || "Unbekannter Spieler"}
          </h1>
          <p className="text-gray-400 text-center mb-4 px-8 max-w-[90%] mx-auto">
            {String(jassSpruch)}
          </p>
          {isPlaceholder && (
            <p className="text-xs text-yellow-400 text-center">(Unvollständiger Datensatz)</p>
          )}
        </div>

        <div className="h-8"></div>

        {/* === TABS für Statistik und Archiv (statt Errungenschaften) === */}
        <Tabs
          value={activeMainTab}
          onValueChange={(value) => {
            const query: { [key: string]: string | string[] | undefined } = { ...router.query, mainTab: value };
            if (value !== 'statistics') {
              delete query.statsSubTab;
            } else {
              query.statsSubTab = 'individual';
            }
            router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
          }}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 bg-gray-800 p-1 rounded-lg mb-4 sticky top-0 z-30 backdrop-blur-md">
            <TabsTrigger 
              value="statistics" 
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium"
            >
              <BarChart3 className="w-4 h-4 mr-2" /> Statistik
            </TabsTrigger>
            <TabsTrigger 
              value="archive"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium"
            >
              <Archive className="w-4 h-4 mr-2" /> Archiv
            </TabsTrigger>
          </TabsList>

          {/* Inhalt für Statistik-Tab (jetzt mit Sub-Tabs) */}
          <TabsContent value="statistics" className="w-full mb-8">
            <Tabs
              value={activeStatsSubTab}
              onValueChange={(value) => {
                router.replace({
                  pathname: router.pathname,
                  query: { ...router.query, mainTab: 'statistics', statsSubTab: value },
                }, undefined, { shallow: true });
              }}
              className="w-full"
            >
              {/* Kleinerer Abstand (8px statt 16px) */}
              <div className="h-2"></div>
              
              {/* Sticky Container für Sub-Tabs - mit solidem Hintergrund zwischen den Tabs */}
              <div className="sticky top-[44px] z-20 bg-gray-900 pt-0 pb-4">
                {/* Solider Hintergrund der den gesamten Bereich zwischen den Tabs abdeckt */}
                <div className="absolute top-[-44px] left-0 right-0 h-[44px] bg-gray-900"></div>
                
                <TabsList className="grid w-full grid-cols-3 bg-gray-800 p-1 rounded-lg backdrop-blur-md">
                  <TabsTrigger
                    value="individual"
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium"
                  >
                    <User className="w-4 h-4 mr-1.5" />
                    Individuell
                  </TabsTrigger>
                  <TabsTrigger
                    value="partner"
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium"
                  >
                    <Users className="w-4 h-4 mr-1.5" />
                    Partner
                  </TabsTrigger>
                  <TabsTrigger
                    value="opponent"
                    className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-gray-400 hover:bg-blue-700/80 hover:text-white rounded-md py-1.5 text-sm font-medium"
                  >
                    <Shield className="w-4 h-4 mr-1.5" />
                    Gegner
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="individual" className="w-full bg-gray-800/50 rounded-lg p-4">
                {statsLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                    <span className="ml-3 text-gray-300">Lade Statistiken...</span>
                  </div>
                ) : statsError ? (
                  <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md mb-4">
                    Fehler beim Laden der Statistiken: {statsError}
                  </div>
                ) : extendedStats ? (
                  <div className="space-y-3 text-sm"> 
                    {/* Block 1: Spielerübersicht */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Spielerübersicht</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Gruppen:</span>
                          <span className="text-gray-100">{extendedStats?.groupCount || 0}</span> 
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Partien:</span>
                          <span className="text-gray-100">{extendedStats?.totalSessions ?? 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Turniere:</span>
                          <span className="text-gray-100">{extendedStats?.totalTournaments ?? 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Anzahl Spiele:</span>
                          <span className="text-gray-100">{extendedStats?.totalGames ?? 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Gesamte Jass-Zeit:</span>
                          <span className="text-gray-100">{extendedStats?.totalPlayTime || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Erster Jass:</span>
                          <span className="text-gray-100">{extendedStats?.firstJassDate || '-'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Letzter Jass:</span>
                          <span className="text-gray-100">{extendedStats?.lastJassDate || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Sektion Turniersiege */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Turniersiege</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between items-center bg-gray-700/30 px-2 py-1.5 rounded-md">
                        <span className="font-medium text-gray-200">Turniersiege</span>
                        <span className="text-lg font-bold text-white">{extendedStats?.tournamentWins ?? 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Block Durchschnittswerte */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Durchschnittswerte</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Striche pro Spiel:</span>
                          <span className="text-gray-100">{extendedStats?.avgStrichePerGame?.toFixed(1) || '0.0'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Siegquote Partie:</span>
                          <span className="text-gray-100">
                            {extendedStats?.sessionWinRate ? `${(extendedStats.sessionWinRate * 100).toFixed(1)}%` : '0.0%'}
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Siegquote Spiel:</span>
                          <span className="text-gray-100">
                            {extendedStats?.gameWinRate ? `${(extendedStats.gameWinRate * 100).toFixed(1)}%` : '0.0%'}
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Punkte pro Spiel:</span>
                          <span className="text-gray-100">{extendedStats?.avgPointsPerGame?.toFixed(1) || '0.0'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Matsch pro Spiel:</span>
                          <span className="text-gray-100">{extendedStats?.avgMatschPerGame?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Schneider pro Spiel:</span>
                          <span className="text-gray-100">{extendedStats?.avgSchneiderPerGame?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Weispunkte pro Spiel:</span>
                          <span className="text-gray-100">{extendedStats?.avgWeisPointsPerGame?.toFixed(1) || '0.0'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Zeit pro Runde:</span>
                          <span className="text-gray-100">{extendedStats?.avgRoundTime || '0m 0s'}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Block Spieler-Ergebnisse */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Spieler-Ergebnisse</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Strichdifferenz:</span>
                          <span className="text-gray-100">
                            {extendedStats?.totalStrichesDifference !== undefined && extendedStats.totalStrichesDifference > 0 ? '+' : ''}
                            {extendedStats?.totalStrichesDifference || 0}
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Punktdifferenz:</span>
                          <span className="text-gray-100">
                            {extendedStats?.totalPointsDifference !== undefined && extendedStats.totalPointsDifference > 0 ? '+' : ''}
                            {extendedStats?.totalPointsDifference || 0}
                          </span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Partien gewonnen:</span>
                          <span className="text-gray-100">{extendedStats?.sessionsWon || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Partien unentschieden:</span>
                          <span className="text-gray-100">{extendedStats?.sessionsTied || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Partien verloren:</span>
                          <span className="text-gray-100">{extendedStats?.sessionsLost || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Spiele gewonnen:</span>
                          <span className="text-gray-100">{extendedStats?.gamesWon || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Spiele verloren:</span>
                          <span className="text-gray-100">{extendedStats?.gamesLost || 0}</span>
                        </div>
                      </div>
                    </div>

                    {/* Highlights Partien */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Highlights Partien</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        {extendedStats?.highestStricheSession && typeof extendedStats.highestStricheSession.value === 'number' ? (
                          <Link 
                            href={extendedStats.highestStricheSession.relatedId && extendedStats.highestStricheSession.relatedType === 'session' ? `/view/session/${extendedStats.highestStricheSession.relatedId}` : '#'} 
                            className={`flex justify-between p-1 rounded-md ${extendedStats.highestStricheSession.relatedId ? 'hover:bg-gray-700/50 cursor-pointer' : 'cursor-default'}`}
                          >
                          <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
                            <span className="text-gray-100">{extendedStats.highestStricheSession.value} ({extendedStats.highestStricheSession.date ?? '-'})</span>
                        </Link>
                        ) : (
                          <div className="flex justify-between p-1 rounded-md cursor-default">
                          <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
                            <span className="text-gray-100">-</span>
                          </div>
                        )}
                        {extendedStats?.longestWinStreakSessions?.value ? (
                          <Link 
                            href={'#'} // Streaks vorerst nicht verlinkbar
                            className={`flex justify-between p-1 rounded-md cursor-default`}
                          >
                          <span className="font-medium text-gray-300">Längste Siegesserie:</span>
                            <span className="text-gray-100">{extendedStats.longestWinStreakSessions.value} ({extendedStats.longestWinStreakSessions.date ?? '-'})</span>
                        </Link>
                        ) : (
                          <div className="flex justify-between p-1 rounded-md cursor-default">
                            <span className="font-medium text-gray-300">Längste Siegesserie:</span>
                            <span className="text-gray-100">-</span>
                          </div>
                        )}
                        {extendedStats?.longestUndefeatedStreakSessions?.value ? (
                          <Link 
                            href={'#'} // Streaks vorerst nicht verlinkbar
                            className={`flex justify-between p-1 rounded-md cursor-default`}
                          >
                          <span className="font-medium text-gray-300">Längste Serie ohne Niederlage:</span>
                            <span className="text-gray-100">{extendedStats.longestUndefeatedStreakSessions.value} ({extendedStats.longestUndefeatedStreakSessions.dateRange ?? extendedStats.longestUndefeatedStreakSessions.date ?? '-'})</span>
                        </Link>
                        ) : (
                          <div className="flex justify-between p-1 rounded-md cursor-default">
                            <span className="font-medium text-gray-300">Längste Serie ohne Niederlage:</span>
                            <span className="text-gray-100">-</span>
                          </div>
                        )}
                        {extendedStats?.mostMatschSession && typeof extendedStats.mostMatschSession.value === 'number' ? (
                          <Link 
                            href={extendedStats.mostMatschSession.relatedId && extendedStats.mostMatschSession.relatedType === 'session' ? `/view/session/${extendedStats.mostMatschSession.relatedId}` : '#'} 
                            className={`flex justify-between p-1 rounded-md ${extendedStats.mostMatschSession.relatedId ? 'hover:bg-gray-700/50 cursor-pointer' : 'cursor-default'}`}
                          >
                          <span className="font-medium text-gray-300">Höchste Anzahl Matsche:</span>
                            <span className="text-gray-100">{extendedStats.mostMatschSession.value} ({extendedStats.mostMatschSession.date ?? '-'})</span>
                        </Link>
                        ) : (
                          <div className="flex justify-between p-1 rounded-md cursor-default">
                            <span className="font-medium text-gray-300">Höchste Anzahl Matsche:</span>
                            <span className="text-gray-100">-</span>
                          </div>
                        )}
                        {extendedStats?.mostWeisPointsSession && typeof extendedStats.mostWeisPointsSession.value === 'number' ? (
                          <Link 
                            href={extendedStats.mostWeisPointsSession.relatedId && extendedStats.mostWeisPointsSession.relatedType === 'session' ? `/view/session/${extendedStats.mostWeisPointsSession.relatedId}` : '#'} 
                            className={`flex justify-between p-1 rounded-md ${extendedStats.mostWeisPointsSession.relatedId && extendedStats.mostWeisPointsSession.relatedType === 'session' ? 'hover:bg-gray-700/50 cursor-pointer' : 'cursor-default'}`}
                          >
                          <span className="font-medium text-gray-300">Meiste Weispunkte:</span>
                            <span className="text-gray-100">{extendedStats.mostWeisPointsSession.value} ({extendedStats.mostWeisPointsSession.date ?? '-'})</span>
                        </Link>
                        ) : (
                          <div className="flex justify-between p-1 rounded-md cursor-default">
                            <span className="font-medium text-gray-300">Meiste Weispunkte:</span>
                            <span className="text-gray-100">-</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* KORREKTE Lowlights Partien für [playerId].tsx */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-red-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Lowlights Partien</h3>
                    </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Höchste erhaltene Strichdifferenz:</span>
                          {extendedStats?.highestStricheReceivedSession && typeof extendedStats.highestStricheReceivedSession.value === 'number' ? (
                            <Link 
                              href={extendedStats.highestStricheReceivedSession.relatedId && extendedStats.highestStricheReceivedSession.relatedType === 'session' ? `/view/session/${extendedStats.highestStricheReceivedSession.relatedId}` : '#'}
                              className={`text-gray-100 ${extendedStats.highestStricheReceivedSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                            >
                              {extendedStats.highestStricheReceivedSession.value} ({extendedStats.highestStricheReceivedSession.date || '-'}) 
                        </Link>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Längste Niederlagenserie:</span>
                          {extendedStats?.longestLossStreakSessions?.value ? (
                            <span className="text-gray-100 cursor-default">
                              {extendedStats.longestLossStreakSessions.value} ({extendedStats.longestLossStreakSessions.dateRange || extendedStats.longestLossStreakSessions.date || '-'})
                            </span>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Längste Serie ohne Sieg:</span>
                          {extendedStats?.longestWinlessStreakSessions?.value ? (
                            <span className="text-gray-100 cursor-default">
                              {extendedStats.longestWinlessStreakSessions.value} ({extendedStats.longestWinlessStreakSessions.dateRange || extendedStats.longestWinlessStreakSessions.date || '-'})
                            </span>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Höchste Anzahl Matsche bekommen:</span>
                          {extendedStats?.mostMatschReceivedSession && typeof extendedStats.mostMatschReceivedSession.value === 'number' ? (
                            <Link 
                              href={extendedStats.mostMatschReceivedSession.relatedId && extendedStats.mostMatschReceivedSession.relatedType === 'session' ? `/view/session/${extendedStats.mostMatschReceivedSession.relatedId}` : '#'}
                              className={`text-gray-100 ${extendedStats.mostMatschReceivedSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                            >
                              {extendedStats.mostMatschReceivedSession.value} ({extendedStats.mostMatschReceivedSession.date || '-'}) 
                        </Link>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Meiste Weispunkte erhalten:</span>
                          {extendedStats?.mostWeisPointsReceivedSession && typeof extendedStats.mostWeisPointsReceivedSession.value === 'number' ? (
                            <Link 
                              href={extendedStats.mostWeisPointsReceivedSession.relatedId && extendedStats.mostWeisPointsReceivedSession.relatedType === 'session' ? `/view/session/${extendedStats.mostWeisPointsReceivedSession.relatedId}` : '#'}
                              className={`text-gray-100 ${extendedStats.mostWeisPointsReceivedSession.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                            >
                              {extendedStats.mostWeisPointsReceivedSession.value} ({extendedStats.mostWeisPointsReceivedSession.date || '-'}) 
                        </Link>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* KORREKTE Lowlights Spiele für [playerId].tsx */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-red-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Lowlights Spiele</h3>
                    </div>
                      <div className="p-4 space-y-2">
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Höchste erhaltene Strichdifferenz:</span>
                          {extendedStats?.highestStricheReceivedGame && typeof extendedStats.highestStricheReceivedGame.value === 'number' ? (
                            <Link 
                              href={extendedStats.highestStricheReceivedGame.relatedId && extendedStats.highestStricheReceivedGame.relatedType === 'game' ? `/view/game/${extendedStats.highestStricheReceivedGame.relatedId}` : '#'} 
                              className={`text-gray-100 ${extendedStats.highestStricheReceivedGame.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                            >
                              {extendedStats.highestStricheReceivedGame.value} ({extendedStats.highestStricheReceivedGame.date || '-'}) 
                        </Link>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Längste Niederlagen:</span>
                          {extendedStats?.longestLossStreakGames?.value ? (
                            <span className="text-gray-100 cursor-default">
                              {extendedStats.longestLossStreakGames.value} ({extendedStats.longestLossStreakGames.dateRange || extendedStats.longestLossStreakGames.date || '-'})
                            </span>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Längste Serie ohne Sieg:</span>
                          {extendedStats?.longestWinlessStreakGames?.value ? (
                            <span className="text-gray-100 cursor-default">
                              {extendedStats.longestWinlessStreakGames.value} ({extendedStats.longestWinlessStreakGames.dateRange || extendedStats.longestWinlessStreakGames.date || '-'})
                            </span>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Höchste Anzahl Matsche bekommen:</span>
                          {extendedStats?.mostMatschReceivedGame && typeof extendedStats.mostMatschReceivedGame.value === 'number' ? (
                            <Link 
                              href={extendedStats.mostMatschReceivedGame.relatedId && extendedStats.mostMatschReceivedGame.relatedType === 'game' ? `/view/game/${extendedStats.mostMatschReceivedGame.relatedId}` : '#'} 
                              className={`text-gray-100 ${extendedStats.mostMatschReceivedGame.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                            >
                              {extendedStats.mostMatschReceivedGame.value} ({extendedStats.mostMatschReceivedGame.date || '-'}) 
                        </Link>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Meiste Weispunkte erhalten:</span>
                          {extendedStats?.mostWeisPointsReceivedGame && typeof extendedStats.mostWeisPointsReceivedGame.value === 'number' ? (
                            <Link 
                              href={extendedStats.mostWeisPointsReceivedGame.relatedId && extendedStats.mostWeisPointsReceivedGame.relatedType === 'game' ? `/view/game/${extendedStats.mostWeisPointsReceivedGame.relatedId}` : '#'} 
                              className={`text-gray-100 ${extendedStats.mostWeisPointsReceivedGame.relatedId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                            >
                              {extendedStats.mostWeisPointsReceivedGame.value} ({extendedStats.mostWeisPointsReceivedGame.date || '-'}) 
                        </Link>
                          ) : (
                            <span className="text-gray-100">-</span>
                          )}
                  </div>
                      </div>
                    </div>

                    {/* NEU: Dynamische Highlights Liste einfügen */}
                    <NotableEventsList highlights={extendedStats.dynamicHighlights} />

                    {/* Trumpf Statistik */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Trumpffarben</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {trumpfStatistikArray.length > 0 ? (
                          trumpfStatistikArray.map((item, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <FarbePictogram farbe={normalizeJassColor(item.farbe)} mode="svg" className="h-6 w-6 mr-2" />
                                <span className="text-gray-300 capitalize">{item.farbe}</span>
                              </div>
                              <span className="text-white font-medium">{(item.anteil * 100).toFixed(1)}%</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Trumpfstatistik verfügbar</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-10">Keine Statistikdaten verfügbar.</div>
                )}
              </TabsContent>
              <TabsContent value="partner" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                {typedRawPlayerStats?.partnerAggregates && typedRawPlayerStats.partnerAggregates.length > 0 ? (
                  <>
                    <AggregateRankingList
                      title="Rangliste: Strichdifferenz"
                      items={typedRawPlayerStats.partnerAggregates}
                      valueSelector={(item) => (item as FrontendPartnerAggregate).totalStricheDifferenceWith}
                      valueFormatter={(val) => {
                          const numVal = Number(val);
                          return `${numVal > 0 ? '+' : ''}${numVal}`;
                      }}
                      identifierKey="partnerId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Siegquote Partien"
                      items={typedRawPlayerStats.partnerAggregates}
                      valueSelector={(item) => {
                        const pa = item as FrontendPartnerAggregate;
                        return pa.sessionsPlayedWith > 0 ? (pa.sessionsWonWith / pa.sessionsPlayedWith) : 0;
                      }}
                      valueFormatter={(val) => `${((val as number) * 100).toFixed(1)}%`}
                      identifierKey="partnerId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Siegquote Spiele"
                      items={typedRawPlayerStats.partnerAggregates}
                      valueSelector={(item) => {
                        const pa = item as FrontendPartnerAggregate;
                        return pa.gamesPlayedWith > 0 ? (pa.gamesWonWith / pa.gamesPlayedWith) : 0;
                      }}
                      valueFormatter={(val) => `${((val as number) * 100).toFixed(1)}%`}
                      identifierKey="partnerId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Punkte"
                      items={typedRawPlayerStats.partnerAggregates}
                      valueSelector={(item) => (item as FrontendPartnerAggregate).totalPointsWith}
                      identifierKey="partnerId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Matsch-Quote Spiel"
                      items={typedRawPlayerStats.partnerAggregates}
                      valueSelector={(item) => {
                        const pa = item as FrontendPartnerAggregate;
                        return pa.gamesPlayedWith > 0 ? (pa.matschGamesWonWith / pa.gamesPlayedWith) : 0;
                      }}
                      valueFormatter={(val) => `${(val as number).toFixed(2)}`}
                      identifierKey="partnerId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Schneider-Quote Spiel"
                      items={typedRawPlayerStats.partnerAggregates}
                      valueSelector={(item) => {
                        const pa = item as FrontendPartnerAggregate;
                        return pa.gamesPlayedWith > 0 ? (pa.schneiderGamesWonWith / pa.gamesPlayedWith) : 0;
                      }}
                      valueFormatter={(val) => `${(val as number).toFixed(2)}`}
                      identifierKey="partnerId"
                    />
                  </>
                ) : (
                  <div className="text-center text-gray-400 py-10">Keine Partnerstatistiken verfügbar.</div>
                )}
              </TabsContent>
              <TabsContent value="opponent" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                {typedRawPlayerStats?.opponentAggregates && typedRawPlayerStats.opponentAggregates.length > 0 ? (
                  <>
                    <AggregateRankingList
                      title="Rangliste: Strichdifferenz"
                      items={typedRawPlayerStats.opponentAggregates}
                      valueSelector={(item) => (item as FrontendOpponentAggregate).totalStricheDifferenceAgainst}
                      valueFormatter={(val) => {
                          const numVal = Number(val);
                          return `${numVal > 0 ? '+' : ''}${numVal}`;
                      }}
                      identifierKey="opponentId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Siegquote Partien"
                      items={typedRawPlayerStats.opponentAggregates}
                      valueSelector={(item) => {
                        const oa = item as FrontendOpponentAggregate;
                        return oa.sessionsPlayedAgainst > 0 ? (oa.sessionsWonAgainst / oa.sessionsPlayedAgainst) : 0;
                      }}
                      valueFormatter={(val) => `${((val as number) * 100).toFixed(1)}%`}
                      identifierKey="opponentId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Siegquote Spiele"
                      items={typedRawPlayerStats.opponentAggregates}
                      valueSelector={(item) => {
                        const oa = item as FrontendOpponentAggregate;
                        return oa.gamesPlayedAgainst > 0 ? (oa.gamesWonAgainst / oa.gamesPlayedAgainst) : 0;
                      }}
                      valueFormatter={(val) => `${((val as number) * 100).toFixed(1)}%`}
                      identifierKey="opponentId"
                    />
                     <AggregateRankingList
                      title="Rangliste: Punkte erzielt (gegen)"
                      items={typedRawPlayerStats.opponentAggregates}
                      valueSelector={(item) => (item as FrontendOpponentAggregate).totalPointsScoredWhenOpponent}
                      identifierKey="opponentId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Matsch-Siegquote Spiel (gegen)"
                      items={typedRawPlayerStats.opponentAggregates}
                      valueSelector={(item) => {
                        const oa = item as FrontendOpponentAggregate;
                        return oa.gamesPlayedAgainst > 0 ? (oa.matschGamesWonAgainstOpponentTeam / oa.gamesPlayedAgainst) : 0;
                      }}
                      valueFormatter={(val) => `${(val as number).toFixed(2)}`}
                      identifierKey="opponentId"
                    />
                    <AggregateRankingList
                      title="Rangliste: Schneider-Siegquote Spiel (gegen)"
                      items={typedRawPlayerStats.opponentAggregates}
                      valueSelector={(item) => {
                        const oa = item as FrontendOpponentAggregate;
                        return oa.gamesPlayedAgainst > 0 ? (oa.schneiderGamesWonAgainstOpponentTeam / oa.gamesPlayedAgainst) : 0;
                      }}
                      valueFormatter={(val) => `${(val as number).toFixed(2)}`}
                      identifierKey="opponentId"
                    />
                  </>
                ) : (
                  <div className="text-center text-gray-400 py-10">Keine Gegnerstatistiken verfügbar.</div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>
          
          <TabsContent value="archive">
            {/* --- ARCHIV-BEREICH --- */}
            <div className="w-full bg-gray-800/50 rounded-lg p-4">
              <div className="space-y-3 text-sm px-2 pb-2">
                <h3 className="text-base font-semibold text-white mb-3">Archiv</h3>
                <p className="text-center text-gray-500 py-4">Hier könnte das Spieler-Archiv angezeigt werden. Momentan nur als Platzhalter implementiert.</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Platz für zukünftige Elemente oder Abstand */}
        {/* <div className="h-8"></div> */}
      </div>
    </MainLayout>
  );
};

export default PlayerProfilePage; 