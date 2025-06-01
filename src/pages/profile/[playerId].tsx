import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '@/components/layout/MainLayout';
import { Loader2, ArrowLeft, BarChart3, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlayerById } from '@/services/playerService';
import type { FirestorePlayer } from '@/types/jass';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Timestamp } from 'firebase/firestore';

type PlayerWithPlaceholder = FirestorePlayer & { _isPlaceholder?: boolean };

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

        {/* === TABS für Statistik und Errungenschaften === */}
        <Tabs defaultValue="statistics" className="w-full max-w-md mb-8 mt-4">
          <TabsList className="grid w-full grid-cols-2 bg-gray-800/50 p-1 rounded-lg mb-4">
            <TabsTrigger 
              value="statistics" 
              className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 hover:bg-gray-700/50 rounded-md py-1.5 text-sm font-medium flex items-center justify-center gap-2"
            >
              <BarChart3 className="w-4 h-4" /> Statistik
            </TabsTrigger>
            <TabsTrigger 
              value="achievements" 
              className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 hover:bg-gray-700/50 rounded-md py-1.5 text-sm font-medium flex items-center justify-center gap-2"
            >
              <Award className="w-4 h-4" /> Errungenschaften
            </TabsTrigger>
          </TabsList>

          {/* Tab Content wird in nächsten Schritten gefüllt */}
          <TabsContent value="statistics">
            {/* --- STATISTIKBEREICH (Angepasst von /profile/index.tsx) --- */}
            <div className="w-full bg-gray-800/50 rounded-lg p-4">
              <div className="space-y-3 text-sm px-2 pb-2">

                {/* Block 1: Spielerübersicht */}
                <div>
                  <h3 className="text-base font-semibold text-white mb-2">Spielerübersicht</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Partien gespielt:</span>
                      <span className="text-gray-100">{player.stats?.gamesPlayed ?? 0}</span> {/* Placeholder anpassen */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Spiele gespielt:</span>
                      <span className="text-gray-100">{player.stats?.gamesPlayed ?? 0}</span> {/* Placeholder anpassen */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Gesamte Jass-Zeit:</span>
                      <span className="text-gray-100">-</span> {/* Placeholder */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Mitglied seit:</span>
                      {/* Annahme: player.createdAt existiert und ist ein Timestamp */}
                      <span className="text-gray-100">
                        {player.createdAt instanceof Timestamp 
                          ? player.createdAt.toDate().toLocaleDateString('de-CH') 
                          : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Letzte Aktivität:</span>
                      <span className="text-gray-100">-</span> {/* TODO: Nicht im Player-Objekt? */}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="pt-2 pb-1">
                  <hr className="border-gray-600/50" />
                </div>

                {/* Block 2: Persönliche Durchschnittswerte */}
                <div>
                  <h3 className="text-base font-semibold text-white mb-2">Durchschnittswerte</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Ø Punkte pro Spiel:</span>
                      <span className="text-gray-100">-</span> {/* Placeholder */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Ø Striche pro Spiel:</span>
                      <span className="text-gray-100">-</span> {/* Placeholder */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Ø Weispunkte pro Spiel:</span>
                      <span className="text-gray-100">-</span> {/* Placeholder */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Ø Matsch pro Spiel:</span>
                      <span className="text-gray-100">-</span> {/* Placeholder */}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="pt-2 pb-1">
                  <hr className="border-gray-600/50" />
                </div>

                {/* Block 3: Persönliche Highlights */}
                <div>
                  <h3 className="text-base font-semibold text-white mb-2">Highlights</h3>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Höchste Punktzahl (Spiel):</span>
                      <span className="text-gray-100">N/A (0)</span> {/* Placeholder */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Höchste Weispunkte (Spiel):</span>
                      <span className="text-gray-100">N/A (0)</span> {/* Placeholder */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Höchste Siegquote (Partie):</span>
                      <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Höchste Siegquote (Spiel):</span>
                      <span className="text-gray-100">N/A (0%)</span> {/* Placeholder */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Meiste Matches (Spiel):</span>
                      <span className="text-gray-100">N/A (0)</span> {/* Placeholder */}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </TabsContent>
          <TabsContent value="achievements">
            {/* --- ERRUNGENSCHAFTEN-BEREICH --- */}
            <div className="w-full bg-gray-800/50 rounded-lg p-4">
              <div className="space-y-3 text-sm px-2 pb-2">
                <h3 className="text-base font-semibold text-white mb-3">Errungenschaften</h3>
                
                {/* OG Badge Anzeige */}
                {player?.metadata?.isOG ? (
                  <div className="flex items-center justify-between p-3 rounded-md bg-gray-700/50 hover:bg-gray-700/70 transition-colors">
                    <span className="font-medium text-gray-200">Original Jasster</span>
                    <Award className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-4">Noch keine Errungenschaften freigeschaltet.</p>
                )}
                
                {/* Hier könnten weitere Errungenschaften hinzugefügt werden */}
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