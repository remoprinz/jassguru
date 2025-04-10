import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import MainLayout from '@/components/layout/MainLayout';
import { Loader2, ArrowLeft, BarChart3, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
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
          <Link href="/start" passHref legacyBehavior>
            <Button 
              variant="ghost" 
              className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
              aria-label="Zurück zur Startseite"
            >
              <ArrowLeft size={28} />
            </Button>
          </Link>
          <p className="text-red-400 text-center">{error}</p>
          <Link href="/start" passHref className="mt-4">
            <Button variant="outline">Zurück zur Startseite</Button>
          </Link>
        </div>
      </MainLayout>
    );
  }

  if (!player) {
    return (
      <MainLayout>
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 p-4 text-white">
          <p className="text-gray-400">Spielerdaten konnten nicht angezeigt werden.</p>
          <Link href="/start" passHref className="mt-4">
            <Button variant="outline">Zurück zur Startseite</Button>
          </Link>
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
        <Link href="/start" passHref legacyBehavior>
          <Button 
            variant="ghost" 
            className="absolute top-8 left-4 text-white hover:bg-gray-700 p-3"
            aria-label="Zurück zur Startseite"
          >
            <ArrowLeft size={28} />
          </Button>
        </Link>

        <div className="text-center mt-6 w-full max-w-md space-y-4">
          <div className="flex justify-center items-center mx-auto">
            <Avatar className="h-32 w-32 flex-shrink-0 border-2 border-gray-700">
              <AvatarImage src={player.photoURL} alt={player.nickname} />
              <AvatarFallback 
                className={cn(
                  "text-4xl font-bold",
                  isPlaceholder ? 'bg-yellow-700 text-gray-300' : 'bg-blue-600 text-white'
                )}
              >
                {player.nickname?.charAt(0).toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
          </div>

          <h1 className="mt-4 text-3xl font-bold text-center text-white mb-1">
            {player.nickname || "Unbekannter Spieler"}
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
                      <span className="font-medium text-gray-300">Anzahl Gruppen:</span>
                      {/* Annahme: player.groupIds existiert */}
                      <span className="text-gray-100">{player.groupIds?.length ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Anzahl Jass-Partien gespielt:</span>
                      <span className="text-gray-100">{player.stats?.gamesPlayed ?? 0}</span> {/* Placeholder anpassen */}
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-300">Anzahl Spiele gespielt:</span>
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