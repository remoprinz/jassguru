import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '@/components/layout/MainLayout';
import { Loader2, ArrowLeft, BarChart3, Award, Archive, User, Users, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlayerById } from '@/services/playerService';
import type { FirestorePlayer } from '@/types/jass';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';
import Link from 'next/link';

type PlayerWithPlaceholder = FirestorePlayer & { _isPlaceholder?: boolean };

// NEU: Erweiterte Stats-Schnittstelle für die Anzeige
interface ExtendedPlayerStats {
  gamesPlayed?: number;
  wins?: number;
  totalScore?: number;
  totalSessions?: number;
  totalTournaments?: number;
  totalGames?: number;
  totalPlayTime?: string;
  firstJassDate?: string;
  lastJassDate?: string;
  tournamentWins?: number;
  avgStrichePerGame?: number;
  sessionWinRate?: number;
  gameWinRate?: number;
  avgPointsPerGame?: number;
  avgMatschPerGame?: number;
  avgSchneiderPerGame?: number;
  avgWeisPointsPerGame?: number;
  avgTimePerRound?: string;
  totalStricheDifference?: number;
  totalPointsDifference?: number;
  sessionsWon?: number;
  sessionsTied?: number;
  sessionsLost?: number;
  gamesWon?: number;
  gamesLost?: number;
  highestStrichdifferenzSession?: { value: number; date: string };
  longestWinStreakSessions?: { value: number; date: string };
  longestUnbeatenStreakSessions?: { value: number; dateRange: string };
  mostMatchSessions?: { value: number; date: string };
  mostWeisPointsSession?: { value: number; date: string };
  highestStrichdifferenzGame?: { value: number; date: string };
  longestWinStreakGames?: { value: number; date: string };
  longestUnbeatenStreakGames?: { value: number; date: string };
  mostMatchGames?: { value: number; date: string };
  mostWeisPointsGame?: { value: number; date: string };
  lowestStrichdifferenzSession?: { value: number; date: string };
  longestLossStreakSessions?: { value: number; date: string };
  longestWinlessStreakSessions?: { value: number; dateRange: string };
  mostMatchReceivedSessions?: { value: number; date: string };
  mostWeisPointsReceivedSessions?: { value: number; date: string };
  lowestStrichdifferenzGame?: { value: number; date: string };
  longestLossStreakGames?: { value: number; date: string };
  longestWinlessStreakGames?: { value: number; date: string };
  mostMatchReceivedGames?: { value: number; date: string };
  mostWeisPointsReceivedGames?: { value: number; date: string };
}

const PlayerProfilePage = () => {
  const router = useRouter();
  const { playerId } = router.query;

  const [player, setPlayer] = useState<FirestorePlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    if (router.isReady) {
      fetchPlayerData();
    }
  }, [playerId, router.isReady]);

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

  // NEU: Hilfsfunktion für erweiterte Stats
  const getExtendedStats = (player: FirestorePlayer | null): ExtendedPlayerStats => {
    if (!player?.stats) return {};
    return player.stats as any; // Type-Assertion für erweiterte Properties
  };

  const extendedStats = getExtendedStats(player);

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
            <Avatar className="h-32 w-32 flex-shrink-0 border-2 border-gray-700">
              <AvatarImage src={player.photoURL === null ? undefined : player.photoURL} alt={player.displayName} />
              <AvatarFallback 
                className={cn(
                  "text-4xl font-bold",
                  isPlaceholder ? 'bg-yellow-700 text-gray-300' : 'bg-blue-600 text-white'
                )}
              >
                {player?.displayName?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
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
        <Tabs defaultValue="statistics" className="w-full">
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
            <Tabs defaultValue="individual" className="w-full">
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
                {/* Inhalt kopiert von profile/index.tsx, angepasst für [playerId].tsx */}
                {/* {statsError && !statsLoading && ( // Diese Logik (statsError/statsLoading) ist spezifisch für die Datenladung in index.tsx und wird hier vorerst nicht 1:1 übernommen oder angepasst für player.error/isLoading) */} 
                {isLoading ? (
                  <div className="flex justify-center items-center py-10">
                    <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                    <span className="ml-3 text-gray-300">Lade Statistiken...</span>
                  </div>
                ) : error ? (
                  <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md mb-4">
                    Fehler beim Laden der Statistiken: {error}
                  </div>
                ) : (
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
                          {/* Annahme: Diese Info ist nicht direkt im player Objekt, daher Platzhalter */}
                          <span className="text-gray-100">1</span> 
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
                           {/* Annahme: extendedStats.avgSchneiderPerGame existiert */}
                          <span className="text-gray-100">{extendedStats?.avgSchneiderPerGame?.toFixed(2) || '0.00'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Weispunkte pro Spiel:</span>
                          <span className="text-gray-100">{extendedStats?.avgWeisPointsPerGame?.toFixed(1) || '0.0'}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Ø Zeit pro Runde:</span>
                           {/* Annahme: extendedStats.avgTimePerRound existiert und ist ein String */}
                          <span className="text-gray-100">{extendedStats?.avgTimePerRound || '0m 0s'}</span>
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
                          {/* Annahme: extendedStats.totalStricheDifference existiert */}
                          <span className="text-gray-100">{extendedStats?.totalStricheDifference && extendedStats.totalStricheDifference > 0 ? '+' : ''}{extendedStats?.totalStricheDifference || 0}</span>
                        </div>
                        <div className="flex justify-between bg-gray-700/30 px-2 py-1.5 rounded-md">
                          <span className="font-medium text-gray-300">Punktdifferenz:</span>
                           {/* Annahme: extendedStats.totalPointsDifference existiert */}
                          <span className="text-gray-100">{extendedStats?.totalPointsDifference && extendedStats.totalPointsDifference > 0 ? '+' : ''}{extendedStats?.totalPointsDifference || 0}</span>
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
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
                          <span className="text-gray-100">{extendedStats?.highestStrichdifferenzSession?.value ?? '0'} ({extendedStats?.highestStrichdifferenzSession?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Längste Siegesserie:</span>
                          <span className="text-gray-100">{extendedStats?.longestWinStreakSessions?.value ?? '0'} ({extendedStats?.longestWinStreakSessions?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Längste Serie ohne Niederlage:</span>
                          <span className="text-gray-100">{extendedStats?.longestUnbeatenStreakSessions?.value ?? '0'} ({extendedStats?.longestUnbeatenStreakSessions?.dateRange ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Höchste Anzahl Matsche:</span>
                          <span className="text-gray-100">{extendedStats?.mostMatchSessions?.value ?? '0'} ({extendedStats?.mostMatchSessions?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Meiste Weispunkte:</span>
                          <span className="text-gray-100">{extendedStats?.mostWeisPointsSession?.value ?? '0'} ({extendedStats?.mostWeisPointsSession?.date ?? '-'})</span>
                        </Link>
                      </div>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Highlights Spiele</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Höchste Strichdifferenz:</span>
                          <span className="text-gray-100">{extendedStats?.highestStrichdifferenzGame?.value ?? '0'} ({extendedStats?.highestStrichdifferenzGame?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Längste Siegesserie:</span>
                          <span className="text-gray-100">{extendedStats?.longestWinStreakGames?.value ?? '0'} ({extendedStats?.longestWinStreakGames?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Längste Serie ohne Niederlage:</span>
                          <span className="text-gray-100">{extendedStats?.longestUnbeatenStreakGames?.value ?? '0'} ({extendedStats?.longestUnbeatenStreakGames?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Höchste Anzahl Matsche:</span>
                          <span className="text-gray-100">{extendedStats?.mostMatchGames?.value ?? '0'} ({extendedStats?.mostMatchGames?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Meiste Weispunkte:</span>
                          <span className="text-gray-100">{extendedStats?.mostWeisPointsGame?.value ?? '0'} ({extendedStats?.mostWeisPointsGame?.date ?? '-'})</span>
                        </Link>
                      </div>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Lowlights Partien</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Höchste erhaltene Strichdifferenz:</span>
                          <span className="text-gray-100">{extendedStats?.lowestStrichdifferenzSession?.value ?? '0'} ({extendedStats?.lowestStrichdifferenzSession?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Längste Niederlagenserie:</span>
                          <span className="text-gray-100">{extendedStats?.longestLossStreakSessions?.value ?? '0'} ({extendedStats?.longestLossStreakSessions?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Längste Serie ohne Sieg:</span>
                          <span className="text-gray-100">{extendedStats?.longestWinlessStreakSessions?.value ?? '0'} ({extendedStats?.longestWinlessStreakSessions?.dateRange ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Höchste Anzahl Matsche bekommen:</span>
                          <span className="text-gray-100">{extendedStats?.mostMatchReceivedSessions?.value ?? '0'} ({extendedStats?.mostMatchReceivedSessions?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Meiste Weispunkte erhalten:</span>
                          <span className="text-gray-100">{extendedStats?.mostWeisPointsReceivedSessions?.value ?? '0'} ({extendedStats?.mostWeisPointsReceivedSessions?.date ?? '-'})</span>
                        </Link>
                      </div>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Lowlights Spiele</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Höchste erhaltene Strichdifferenz:</span>
                          <span className="text-gray-100">{extendedStats?.lowestStrichdifferenzGame?.value ?? '0'} ({extendedStats?.lowestStrichdifferenzGame?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Längste Niederlagen:</span>
                          <span className="text-gray-100">{extendedStats?.longestLossStreakGames?.value ?? '0'} ({extendedStats?.longestLossStreakGames?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Längste Serie ohne Sieg:</span>
                          <span className="text-gray-100">{extendedStats?.longestWinlessStreakGames?.value ?? '0'} ({extendedStats?.longestWinlessStreakGames?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Höchste Anzahl Matsche bekommen:</span>
                          <span className="text-gray-100">{extendedStats?.mostMatchReceivedGames?.value ?? '0'} ({extendedStats?.mostMatchReceivedGames?.date ?? '-'})</span>
                        </Link>
                        <Link href="#" className="flex justify-between hover:bg-gray-700/50 p-1 rounded-md cursor-pointer">
                          <span className="font-medium text-gray-300">Meiste Weispunkte erhalten:</span>
                          <span className="text-gray-100">{extendedStats?.mostWeisPointsReceivedGames?.value ?? '0'} ({extendedStats?.mostWeisPointsReceivedGames?.date ?? '-'})</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="partner" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                {/* Rangliste: Strichdifferenz (mit Partner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Strichdifferenz (mit Partner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <div key={`partner-strichdiff-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <div className="flex -space-x-2 mr-3">
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-pink-500/30 text-xs">P1</AvatarFallback>
                            </Avatar>
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-teal-500/30 text-xs">P2</AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="text-gray-300">Partner A & Partner B</span>
                        </div>
                        <span className="text-white font-medium">+{120 - index * 10}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rangliste: Siegquote Partien (mit Partner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Siegquote Partien (mit Partner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div key={`partner-siegquote-partie-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <div className="flex -space-x-2 mr-3">
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-indigo-500/30 text-xs">P3</AvatarFallback>
                            </Avatar>
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-lime-500/30 text-xs">P4</AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="text-gray-300">Partner C & Partner D</span>
                        </div>
                        <span className="text-white font-medium">{75 - index * 5}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Rangliste: Siegquote Spiele (mit Partner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Siegquote Spiele (mit Partner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={`partner-siegquote-spiel-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <div className="flex -space-x-2 mr-3">
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-rose-500/30 text-xs">P5</AvatarFallback>
                            </Avatar>
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-cyan-500/30 text-xs">P6</AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="text-gray-300">Partner E & Partner F</span>
                        </div>
                        <span className="text-white font-medium">{80 - index * 6}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rangliste: Punkte (mit Partner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Punkte (mit Partner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 15 }).map((_, index) => (
                      <div key={`partner-punkte-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <div className="flex -space-x-2 mr-3">
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-fuchsia-500/30 text-xs">P7</AvatarFallback>
                            </Avatar>
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-sky-500/30 text-xs">P8</AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="text-gray-300">Partner G & Partner H</span>
                        </div>
                        <span className="text-white font-medium">{2500 - index * 150}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rangliste: Matsch-Quote Spiel (mit Partner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Matsch-Quote Spiel (mit Partner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 7 }).map((_, index) => (
                      <div key={`partner-matsch-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <div className="flex -space-x-2 mr-3">
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-violet-500/30 text-xs">P9</AvatarFallback>
                            </Avatar>
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-amber-500/30 text-xs">P10</AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="text-gray-300">Partner I & Partner J</span>
                        </div>
                        <span className="text-white font-medium">{(0.75 - index * 0.05).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Rangliste: Schneider-Quote Spiel (mit Partner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Schneider-Quote Spiel (mit Partner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`partner-schneider-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <div className="flex -space-x-2 mr-3">
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-orange-500/30 text-xs">P11</AvatarFallback>
                            </Avatar>
                            <Avatar className="h-6 w-6 border-2 border-gray-800">
                              <AvatarFallback className="bg-emerald-500/30 text-xs">P12</AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="text-gray-300">Partner K & Partner L</span>
                        </div>
                        <span className="text-white font-medium">{(0.30 - index * 0.07).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="opponent" className="w-full bg-gray-800/50 rounded-lg p-4 space-y-6">
                {/* Rangliste: Strichdifferenz (gegen Gegner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Strichdifferenz (gegen Gegner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <div key={`opponent-strichdiff-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <Avatar className="h-6 w-6 border-2 border-gray-800 mr-3">
                            <AvatarFallback className="bg-red-500/30 text-xs">G{index+1}</AvatarFallback>
                          </Avatar>
                          <span className="text-gray-300">Gegner {String.fromCharCode(65 + index)}</span>
                        </div>
                        <span className="text-white font-medium">{100 - index * 12}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rangliste: Siegquote Partien (gegen Gegner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Siegquote Partien (gegen Gegner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <div key={`opponent-siegquote-partie-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <Avatar className="h-6 w-6 border-2 border-gray-800 mr-3">
                            <AvatarFallback className="bg-yellow-500/30 text-xs">G{index+1}</AvatarFallback>
                          </Avatar>
                          <span className="text-gray-300">Gegner {String.fromCharCode(65 + index + 2)}</span>
                        </div>
                        <span className="text-white font-medium">{65 - index * 4}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Rangliste: Siegquote Spiele (gegen Gegner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Siegquote Spiele (gegen Gegner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div key={`opponent-siegquote-spiel-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <Avatar className="h-6 w-6 border-2 border-gray-800 mr-3">
                            <AvatarFallback className="bg-green-500/30 text-xs">G{index+1}</AvatarFallback>
                          </Avatar>
                          <span className="text-gray-300">Gegner {String.fromCharCode(65 + index + 4)}</span>
                        </div>
                        <span className="text-white font-medium">{90 - index * 7}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rangliste: Punkte (gegen Gegner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Punkte (gegen Gegner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 11 }).map((_, index) => (
                      <div key={`opponent-punkte-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <Avatar className="h-6 w-6 border-2 border-gray-800 mr-3">
                            <AvatarFallback className="bg-purple-500/30 text-xs">G{index+1}</AvatarFallback>
                          </Avatar>
                          <span className="text-gray-300">Gegner {String.fromCharCode(65 + index + 6)}</span>
                        </div>
                        <span className="text-white font-medium">{1800 - index * 120}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rangliste: Matsch-Quote Spiel (gegen Gegner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Matsch-Quote Spiel (gegen Gegner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={`opponent-matsch-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <Avatar className="h-6 w-6 border-2 border-gray-800 mr-3">
                            <AvatarFallback className="bg-blue-500/30 text-xs">G{index+1}</AvatarFallback>
                          </Avatar>
                          <span className="text-gray-300">Gegner {String.fromCharCode(65 + index + 8)}</span>
                        </div>
                        <span className="text-white font-medium">{(0.65 - index * 0.04).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Rangliste: Schneider-Quote Spiel (gegen Gegner) */}
                <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                  <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                    <div className="w-1 h-6 bg-blue-500 rounded-r-md mr-3"></div>
                    <h3 className="text-base font-semibold text-white">Rangliste: Schneider-Quote Spiel (gegen Gegner)</h3>
                  </div>
                  <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                    {Array.from({ length: 14 }).map((_, index) => (
                      <div key={`opponent-schneider-${index}`} className="flex items-center justify-between bg-gray-700/30 px-2 py-1.5 rounded-md hover:bg-gray-700/60 transition-colors">
                        <div className="flex items-center">
                          <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                          <Avatar className="h-6 w-6 border-2 border-gray-800 mr-3">
                            <AvatarFallback className="bg-pink-700/30 text-xs">G{index+1}</AvatarFallback>
                          </Avatar>
                          <span className="text-gray-300">Gegner {String.fromCharCode(65 + index + 10)}</span>
                        </div>
                        <span className="text-white font-medium">{(0.25 - index * 0.01).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
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