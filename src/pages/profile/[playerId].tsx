import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getPublicPlayerProfile, getGroupMembersSortedByGames } from '@/services/playerService';
import { getGroupMembersOptimized } from '@/services/groupService';
import type { FirestorePlayer } from '@/types/jass';
import { getPublicProfileTheme, THEME_COLORS } from '@/config/theme';
import { ProfileView } from '@/components/profile/ProfileView';
import MainLayout from '@/components/layout/MainLayout';
import { ClipLoader } from 'react-spinners';
import { usePlayerStatsStore } from '@/store/playerStatsStore';
import { transformComputedStatsToExtended, type TransformedPlayerStats } from '@/utils/statsTransformer';
import type { FrontendPartnerAggregate, FrontendOpponentAggregate } from '@/types/computedStats';
import { fetchCompletedSessionsForPlayer, SessionSummary } from '@/services/sessionService';
import { fetchTournamentInstancesForGroup } from '@/services/tournamentService';
import type { TournamentInstance } from '@/types/tournament';
import { Timestamp, FieldValue } from 'firebase/firestore';
import { format } from 'date-fns';
import Link from 'next/link';
import { CheckCircle, XCircle, Award as AwardIcon, Archive } from 'lucide-react';
import ProfileImage from '@/components/ui/ProfileImage';
import AvatarPreloader from '@/components/ui/AvatarPreloader';

// PlayerProfilePageStats ist jetzt der primäre Typ für transformierte Statistiken
interface PlayerProfilePageStats extends TransformedPlayerStats {
  partnerAggregates?: FrontendPartnerAggregate[];
  opponentAggregates?: FrontendOpponentAggregate[];
}

// Definiere eine Struktur, die wir von rawPlayerStats erwarten
interface ExpectedPlayerStatsWithAggregates {
  [key: string]: any; 
  partnerAggregates?: FrontendPartnerAggregate[];
  opponentAggregates?: FrontendOpponentAggregate[];
}

// Archive Item Type (IDENTISCH ZU GROUPVIEW)
type ArchiveItem = (SessionSummary & { type: 'session' }) | (TournamentInstance & { type: 'tournament' });

// Typ-Guard für Firestore Timestamp (IDENTISCH ZU GROUPVIEW)
function isFirestoreTimestamp(value: unknown): value is Timestamp {
  return Boolean(value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function');
}

const PlayerProfilePage = () => {
  const router = useRouter();
  const { playerId } = router.query;

  const [player, setPlayer] = useState<FirestorePlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Archive Data
  const [completedSessions, setCompletedSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [userTournaments, setUserTournaments] = useState<TournamentInstance[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);

  // State und Actions aus dem playerStatsStore
  const {
    stats: rawPlayerStats,
    isLoading: statsLoading,
    error: statsError,
    subscribeToPlayerStats,
    unsubscribePlayerStats,
  } = usePlayerStatsStore();

  // Abgeleiteter State für transformierte Statistiken
  const [extendedStats, setExtendedStats] = useState<PlayerProfilePageStats | null>(null);
  
  // Daten laden
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
        const fetchedPlayer = await getPublicPlayerProfile(playerId);
        if (!fetchedPlayer) {
          setError("Spieler nicht gefunden.");
        } else {
          setPlayer(fetchedPlayer);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Profil konnte nicht geladen werden.");
      } finally {
        setIsLoading(false);
      }
    };

    if (router.isReady) {
      fetchPlayerData();
    }
  }, [playerId, router.isReady]);

  // Statistik-Abonnement
  useEffect(() => {
    if (typeof playerId === 'string' && playerId) {
      subscribeToPlayerStats(playerId);
    }
    return () => {
      unsubscribePlayerStats(); 
    };
  }, [playerId, subscribeToPlayerStats, unsubscribePlayerStats]);

  // Transformation der rohen Statistiken
  useEffect(() => {
    if (rawPlayerStats) {
      const groupCount = player?.groupIds?.length || 0;
      const transformed = transformComputedStatsToExtended(rawPlayerStats, groupCount);
      if (transformed) {
        const finalStats: PlayerProfilePageStats = {
          ...transformed,
          partnerAggregates: (rawPlayerStats as ExpectedPlayerStatsWithAggregates).partnerAggregates,
          opponentAggregates: (rawPlayerStats as ExpectedPlayerStatsWithAggregates).opponentAggregates,
        };
        setExtendedStats(finalStats);
    } else {
        setExtendedStats(null);
    }
    } else {
      setExtendedStats(null);
    }
  }, [rawPlayerStats, player?.groupIds]);

  // Members laden für Profilbilder (alle Gruppen des Spielers, dedupliziert)
  useEffect(() => {
    const loadMembers = async () => {
      if (!player?.groupIds || player.groupIds.length === 0) {
        setMembers([]);
        return;
      }
      setMembersLoading(true);
      try {
        const allMembers: FirestorePlayer[] = [];
        const seenPlayerIds = new Set<string>();
        for (const groupId of player.groupIds) {
          try {
            const groupMembers = await getGroupMembersOptimized(groupId);
            groupMembers.forEach(member => {
              const pid = member.id || member.userId;
              if (pid && !seenPlayerIds.has(pid)) {
                seenPlayerIds.add(pid);
                allMembers.push(member);
              }
            });
          } catch (e) {
            // Fallback: versuche sortedByGames, falls optimized fehlschlägt
            try {
              const groupMembersFallback = await getGroupMembersSortedByGames(groupId);
              groupMembersFallback.forEach(member => {
                const pid = member.id || member.userId;
                if (pid && !seenPlayerIds.has(pid)) {
                  seenPlayerIds.add(pid);
                  allMembers.push(member);
                }
              });
            } catch (ignored) {}
          }
        }
        setMembers(allMembers);
      } catch (error) {
        console.error("Fehler beim Laden der Gruppenmitglieder für Profilbilder:", error);
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };
    if (player) {
      loadMembers();
    }
  }, [player]);

  // Archive Data laden
  useEffect(() => {
    const loadArchiveData = async () => {
      if (!player?.id) return;
      
      setSessionsLoading(true);
      try {
        const sessions = await fetchCompletedSessionsForPlayer(player.id);
        setCompletedSessions(sessions);
      } catch (e) {
 setSessionsError("Sessions konnten nicht geladen werden.");
} finally {
 setSessionsLoading(false);
}

      setTournamentsLoading(true);
      try {
        // 🚨 KEINE TURNIER-INSTANZEN MEHR: Nur Turnier-Sessions aus jassGameSummaries
        setUserTournaments([]);
      } catch (e) { 
        console.error("Fehler beim Laden der Turniere für öffentliches Profil:", e);
        setTournamentsError("Turniere konnten nicht geladen werden."); 
      } finally { 
        setTournamentsLoading(false); 
      }
    };
    if (player) {
      loadArchiveData();
    }
  }, [player]);

  // ===== ARCHIV-VERARBEITUNG (IDENTISCH ZU INDEX.TSX) =====
  // 🔥 Sammle alle Photo-URLs, die im UI auftauchen, damit der Preloader sie dekodieren kann
  const profileAvatarPhotoURLs = useMemo(() => {
    const urls: (string | undefined | null)[] = [];

    // Aktueller Spieler
    if (player?.photoURL) {
      urls.push(player.photoURL);
    }

    // Mitglieder (für Statistiken)
    if (members) {
      urls.push(...members.map((m) => m.photoURL));
    }

    return Array.from(new Set(urls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')));
  }, [player, members]);

  const combinedArchiveItems = useMemo(() => {
    // 🎯 IDENTISCH ZU GROUPVIEW: Trennung zwischen normalen Sessions und Turnier-Sessions
    const normalSessions = completedSessions.filter(session => 
      (session.status === 'completed' || session.status === 'completed_empty') &&
      !session.tournamentId // Nur normale Sessions (OHNE tournamentId)
    );
    
    const tournamentSessions = completedSessions.filter(session =>
      (session.status === 'completed' || session.status === 'completed_empty') &&
      session.tournamentId // Sessions die Teil eines Turniers sind
    );

    const sessionsWithType: ArchiveItem[] = normalSessions.map(s => ({ ...s, type: 'session' }));
    
        // 🚨 EXAKT WIE PRIVATE PROFILEVIEW: Alle Turniere anzeigen, nicht nur die mit Sessions
        const relevantTournaments = userTournaments;
    const tournamentsWithType: ArchiveItem[] = relevantTournaments.map(t => ({ ...t, type: 'tournament' }));

    const combined = [...sessionsWithType, ...tournamentsWithType];

    combined.sort((a, b) => {
      // 🎯 IDENTISCH ZU GROUPVIEW: Einheitliche Datums-Extraktion für alle Typen
      let dateAValue: number | Timestamp | FieldValue | undefined | null;
      let dateBValue: number | Timestamp | FieldValue | undefined | null;

      if (a.type === 'session') {
        dateAValue = a.startedAt;
      } else if ('tournamentId' in a && 'startedAt' in a) {
        // Turnier-Session: verwende startedAt
        dateAValue = (a as any).startedAt;
      } else {
        // 🚨 EXAKT WIE STARTSEITE: Nur instanceDate und createdAt für Sortierung
        dateAValue = (a as any).instanceDate ?? (a as any).createdAt;
      }

      if (b.type === 'session') {
        dateBValue = b.startedAt;
      } else if ('tournamentId' in b && 'startedAt' in b) {
        // Turnier-Session: verwende startedAt
        dateBValue = (b as any).startedAt;
      } else {
        // 🚨 EXAKT WIE STARTSEITE: Nur instanceDate und createdAt für Sortierung
        dateBValue = (b as any).instanceDate ?? (b as any).createdAt;
      }

    const timeA = isFirestoreTimestamp(dateAValue) ? dateAValue.toMillis() :
                  (typeof dateAValue === 'number' ? dateAValue : 0);
      
    const timeB = isFirestoreTimestamp(dateBValue) ? dateBValue.toMillis() :
                  (typeof dateBValue === 'number' ? dateBValue : 0);

      // 🎯 IDENTISCH ZU GROUPVIEW: Absteigende Sortierung (neueste zuerst)
      return timeB - timeA;
    });

    return combined;
  }, [completedSessions, userTournaments]);

  const groupedArchiveByYear = useMemo(() => {
      return combinedArchiveItems.reduce<Record<string, ArchiveItem[]>>((acc, item) => {
        // 🎯 IDENTISCH ZU GROUPVIEW: Für Turnier-Sessions auch startedAt verwenden
        let dateToSort;
        if (item.type === 'session') {
          dateToSort = item.startedAt;
        } else if ('tournamentId' in item && 'startedAt' in item) {
          // Turnier-Session: verwende startedAt
          dateToSort = (item as any).startedAt;
        } else {
          // 🚨 FIX: Echte Tournament-Instance - Enddatum bevorzugen (identisch zu GroupView!)
          dateToSort = (item as any).finalizedAt ?? (item as any).instanceDate ?? (item as any).createdAt;
        }
        
        const year = isFirestoreTimestamp(dateToSort) ? dateToSort.toDate().getFullYear().toString() :
                     (typeof dateToSort === 'number' ? new Date(dateToSort).getFullYear().toString() :
                     '2025'); // Fallback zu 2025 statt 'Unbekannt'
        
        if (!acc[year]) {
            acc[year] = [];
        }
        acc[year].push(item);
        return acc;
    }, {});
  }, [combinedArchiveItems]);

  const sortedYears = useMemo(() => {
      return Object.keys(groupedArchiveByYear).sort((a, b) => {
          if (a === 'Unbekannt') return 1;
          if (b === 'Unbekannt') return -1;
          return parseInt(b) - parseInt(a);
      });
  }, [groupedArchiveByYear]);

  // ===== ARCHIV ITEM RENDERER (IDENTISCH ZU INDEX.TSX) =====
  const renderArchiveItem = useCallback((item: ArchiveItem) => {
    if (item.type === 'session') {
      const session = item;
      const { id, startedAt, playerNames, finalScores, status: sessionStatus, finalStriche: sessionFinalStriche } = session; 

      const sessionStatusIcon = sessionStatus === 'completed'
        ? <CheckCircle className="w-4 h-4 text-green-500" />
        : <XCircle className="w-4 h-4 text-red-500" />;

      const title = 'Partie';

      const calculateTotalStriche = (striche: any): number => {
        if (!striche) return 0;
        return (striche.berg || 0) + (striche.sieg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0);
      };
      const totalStricheBottom = sessionStatus === 'completed' && sessionFinalStriche ? calculateTotalStriche(sessionFinalStriche.bottom) : null;
      const totalStricheTop = sessionStatus === 'completed' && sessionFinalStriche ? calculateTotalStriche(sessionFinalStriche.top) : null;

      const displayDate = isFirestoreTimestamp(startedAt) ? startedAt.toDate() :
                         (typeof startedAt === 'number' ? new Date(startedAt) : null);
      const formattedDate = displayDate ? format(displayDate, 'dd.MM.yy, HH:mm') : 'Unbekannt';

      // 🚨 ENDGÜLTIG FIX: Spieler-IDs aus der KORREKTEN teams.teamA/teamB-Struktur extrahieren
      const teamAPlayer1Id = session.teams?.teamA?.players?.[0]?.playerId;
      const teamAPlayer2Id = session.teams?.teamA?.players?.[1]?.playerId;
      const teamBPlayer1Id = session.teams?.teamB?.players?.[0]?.playerId;
      const teamBPlayer2Id = session.teams?.teamB?.players?.[1]?.playerId;

      // 🚨 ENDGÜLTIG FIX: Spieler-Objekte anhand der playerId suchen
      const teamAPlayer1 = members?.find(m => m.id === teamAPlayer1Id || m.userId === teamAPlayer1Id);
      const teamAPlayer2 = members?.find(m => m.id === teamAPlayer2Id || m.userId === teamAPlayer2Id);
      const teamBPlayer1 = members?.find(m => m.id === teamBPlayer1Id || m.userId === teamBPlayer1Id);
      const teamBPlayer2 = members?.find(m => m.id === teamBPlayer2Id || m.userId === teamBPlayer2Id);

      // Fallback-Namen, falls Spieler nicht gefunden werden
      const player1Name = teamAPlayer1?.displayName || playerNames['1'] || 'Spieler 1';
      const player3Name = teamAPlayer2?.displayName || playerNames['3'] || 'Spieler 3';
      const player2Name = teamBPlayer1?.displayName || playerNames['2'] || 'Spieler 2';
      const player4Name = teamBPlayer2?.displayName || playerNames['4'] || 'Spieler 4';

      return (
          <Link href={`/view/session/public/${id}?groupId=${session.groupId || session.gruppeId || ''}&returnTo=/profile/${player?.id}&returnMainTab=archive`} key={`session-${id}`} passHref>
            <div className="px-3 py-2 lg:px-6 lg:py-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors duration-150 cursor-pointer mb-2">
              <div className="flex justify-between items-center mb-3">
                 <div className="flex items-center flex-grow"> 
                   <span className="text-base lg:text-xl font-medium mr-2" style={{ color: `${THEME_COLORS[activeTheme || 'blue']?.accentHex || '#3b82f6'}` }}>
                     {title}
                   </span>
                   <span className="text-sm text-white mr-2">|</span>
                   <span className="text-sm text-white">{formattedDate}</span>
                   <div className="flex-shrink-0 ml-2">
                      {sessionStatusIcon}
                   </div>
                 </div>
              </div>
              <div className="space-y-1">
                {/* Team Bottom */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    {/* 🎨 AVATAR-PAIR: Wie im GroupView Teams-Tab */}
                    <div className="flex mr-2">
                      <ProfileImage
                        src={teamAPlayer1?.photoURL}
                        alt={player1Name}
                        size="sm"
                        className="border-2 border-gray-800"
                        style={{ zIndex: 1 }}
                        fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                        fallbackText={player1Name.charAt(0).toUpperCase()}
                        context="list"
                      />
                      <ProfileImage
                        src={teamAPlayer2?.photoURL}
                        alt={player3Name}
                        size="sm"
                        className="border-2 border-gray-800 -ml-2"
                        style={{ zIndex: 0 }}
                        fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                        fallbackText={player3Name.charAt(0).toUpperCase()}
                        context="list"
                      />
                    </div>
                    <span className="text-sm text-gray-300 truncate pr-2">{player1Name} & {player3Name}</span>
                  </div>
                  <span className="text-lg font-medium text-white">{totalStricheBottom !== null ? totalStricheBottom : '-'}</span>
                </div>
                
                {/* Team Top */}
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    {/* 🎨 AVATAR-PAIR: Wie im GroupView Teams-Tab */}
                    <div className="flex mr-2">
                      <ProfileImage
                        src={teamBPlayer1?.photoURL}
                        alt={player2Name}
                        size="sm"
                        className="border-2 border-gray-800"
                        style={{ zIndex: 1 }}
                        fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                        fallbackText={player2Name.charAt(0).toUpperCase()}
                        context="list"
                      />
                      <ProfileImage
                        src={teamBPlayer2?.photoURL}
                        alt={player4Name}
                        size="sm"
                        className="border-2 border-gray-800 -ml-2"
                        style={{ zIndex: 0 }}
                        fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                        fallbackText={player4Name.charAt(0).toUpperCase()}
                        context="list"
                      />
                    </div>
                    <span className="text-sm text-gray-300 truncate pr-2">{player2Name} & {player4Name}</span>
                  </div>
                  <span className="text-lg font-medium text-white">{totalStricheTop !== null ? totalStricheTop : '-'}</span>
                </div>
                  </div>
              </div>
          </Link>
      );
    } else if (item.type === 'tournament') {
      // 🎯 EXAKT WIE GROUPVIEW: Unterscheidung zwischen Turnier-Instanz und Turnier-Session
      const isTournamentSession = 'tournamentId' in item && 'startedAt' in item;
      
      if (isTournamentSession) {
        // Dies ist ein jassGameSummary mit tournamentId (Turnier-Session)
        const session = item as any;
        const tournamentId = session.tournamentId;
        // 🚨 ENDDATUM: endedAt ist das korrekte Enddatum aus jassGameSummaries
        const rawDate: any = (session as any).endedAt ?? null;
        const displayDate = rawDate instanceof Timestamp ? rawDate.toDate() : (typeof rawDate === 'number' ? new Date(rawDate) : null);
        const formattedDate = displayDate ? format(displayDate, 'dd.MM.yyyy') : null;
        
        // 🚨 TURNIERNAME: Direkt aus jassGameSummaries
        const tournamentName = (session as any).tournamentName || 'Turnier';
        
        return (
          <Link href={`/view/tournament/${tournamentId}`} key={`tournament-session-${session.id}`} passHref>
            <div className="px-3 py-2 lg:px-6 lg:py-3 bg-purple-900/30 rounded-lg hover:bg-purple-800/40 transition-colors duration-150 cursor-pointer mb-2 border border-purple-700/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <AwardIcon className="w-6 h-6 lg:w-8 lg:h-8 text-purple-400 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-base lg:text-xl font-medium text-white">{tournamentName}</span>
                    {formattedDate && (
                      <span className="text-sm lg:text-base text-gray-400">{formattedDate}</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full bg-gray-600 text-gray-300`}>
                  Abgeschlossen
                </span>
              </div>
            </div>
          </Link>
        );
      } else {
        // Dies ist eine echte TournamentInstance aus tournaments Collection
        const tournament = item;
        const { id, name, instanceDate, status: tournamentStatus } = tournament;
        
        // 🚨 ENDDATUM: endedAt ist das korrekte Enddatum aus jassGameSummaries
        const rawDate: any = (tournament as any).endedAt ?? null;
        const displayDate = rawDate instanceof Timestamp ? rawDate.toDate() : (typeof rawDate === 'number' ? new Date(rawDate) : null);
        const formattedDate = displayDate ? format(displayDate, 'dd.MM.yyyy') : null;

        return (
          <Link href={`/view/tournament/${id}`} key={`tournament-${id}`} passHref>
            <div className="px-3 py-2 lg:px-6 lg:py-3 bg-purple-900/30 rounded-lg hover:bg-purple-800/40 transition-colors duration-150 cursor-pointer mb-2 border border-purple-700/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <AwardIcon className="w-6 h-6 lg:w-8 lg:h-8 text-purple-400 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="text-base lg:text-xl font-medium text-white">{(tournament as any).tournamentName || name || 'Turnier'}</span>
                    {formattedDate && (
                      <span className="text-sm lg:text-base text-gray-400">{formattedDate}</span>
                    )}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${tournamentStatus === 'completed' ? 'bg-gray-600 text-gray-300' : (tournamentStatus === 'active' ? 'bg-green-600 text-white' : 'bg-blue-500 text-white')}`}>
                  {tournamentStatus === 'completed' ? 'Abgeschlossen' : (tournamentStatus === 'active' ? 'Aktiv' : 'Anstehend')}
                </span>
              </div>
            </div>
          </Link>
        );
      }
    }
    return null;
  }, [player?.id, members]);

  // 🚨 LOADING (EXAKT WIE GROUPVIEW)
  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
          <ClipLoader color="#ffffff" size={40} />
          <p className="mt-4 text-lg">Lade Spielerprofil...</p>
        </div>
      </MainLayout>
    );
  }

  // 🚨 ERROR (EXAKT WIE GROUPVIEW)
  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="text-red-400 bg-red-900/30 p-6 rounded-md max-w-md text-center">
            <h1 className="text-xl font-bold mb-2">Fehler</h1>
            <p>{error}</p>
            <p className="mt-2 text-sm text-gray-500">Spieler-ID: {playerId}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // 🚨 ZEIGE EINFACH DIE DATEN (EXAKT WIE GROUPVIEW)
  if (!player) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
          <p>Spieler nicht gefunden.</p>
        </div>
      </MainLayout>
    );
  }

  // ===== Ab hier ist `player` garantiert vorhanden =====

  const activeTheme = getPublicProfileTheme(player?.profileTheme);
  const activeThemeColors = THEME_COLORS[activeTheme] || THEME_COLORS.blue;

  return (
    <>
      {/* 🚀 AVATAR PRELOADER: Lädt alle relevanten Avatare unsichtbar vor */}
      {profileAvatarPhotoURLs.length > 0 && (
        <AvatarPreloader photoURLs={profileAvatarPhotoURLs} />
      )}
      
      <ProfileView
      user={player}
      player={player}
      isPublicView={true}
      isAuthenticated={() => false}
      router={router}
      showNotification={() => {}}
      activeMainTab={router.query.mainTab as string || 'stats'}
      activeStatsSubTab={router.query.statsSubTab as string || 'individual'}
      playerStats={extendedStats}
      statsLoading={statsLoading}
      statsError={statsError}
      members={members}
      membersLoading={membersLoading}
      completedSessions={completedSessions}
      userTournaments={userTournaments}
      sessionsLoading={sessionsLoading}
      sessionsError={sessionsError}
      tournamentsLoading={tournamentsLoading}
      tournamentsError={tournamentsError}
      combinedArchiveItems={combinedArchiveItems}
      groupedArchiveByYear={groupedArchiveByYear}
      sortedYears={sortedYears}
      renderArchiveItem={renderArchiveItem}
      theme={activeThemeColors}
      profileTheme={activeTheme}
    />
    </>
  );
};

export default PlayerProfilePage; 