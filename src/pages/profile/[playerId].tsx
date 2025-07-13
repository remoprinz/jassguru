import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getPublicPlayerProfile, getGroupMembersSortedByGames } from '@/services/playerService';
import type { FirestorePlayer } from '@/types/jass';
import { getPublicProfileTheme, THEME_COLORS } from '@/config/theme';
import { ProfileView } from '@/components/profile/ProfileView';
import MainLayout from '@/components/layout/MainLayout';
import { ClipLoader } from 'react-spinners';
import { usePlayerStatsStore } from '@/store/playerStatsStore';
import { transformComputedStatsToExtended, type TransformedPlayerStats } from '@/utils/statsTransformer';
import type { FrontendPartnerAggregate, FrontendOpponentAggregate } from '@/types/computedStats';
import { fetchCompletedSessionsForUser, SessionSummary } from '@/services/sessionService';
import { fetchTournamentsForUser } from '@/services/tournamentService';
import type { TournamentInstance } from '@/types/tournament';
import { Timestamp, FieldValue } from 'firebase/firestore';
import { format } from 'date-fns';
import Link from 'next/link';
import { CheckCircle, XCircle, Award as AwardIcon, Archive } from 'lucide-react';

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

  // Members laden für Profilbilder
  useEffect(() => {
    const loadMembers = async () => {
      if (!player?.groupIds || player.groupIds.length === 0) {
        setMembers([]);
        return;
      }
      setMembersLoading(true);
      try {
        const primaryGroupId = player.groupIds[0];
        const fetchedMembers = await getGroupMembersSortedByGames(primaryGroupId);
        setMembers(fetchedMembers);
      } catch (error) {
        console.error("Fehler beim Laden der Gruppenmitglieder für Profilbilder:", error);
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
      if (!player?.userId) return;
      
      setSessionsLoading(true);
      try {
        const sessions = await fetchCompletedSessionsForUser(player.userId);
        setCompletedSessions(sessions);
      } catch (e) {
 setSessionsError("Sessions konnten nicht geladen werden.");
} finally {
 setSessionsLoading(false);
}

      setTournamentsLoading(true);
      try {
        const tournaments = await fetchTournamentsForUser(player.userId);
        setUserTournaments(tournaments);
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
  const combinedArchiveItems = useMemo(() => {
    const sessionsWithType: ArchiveItem[] = completedSessions.map(s => ({ ...s, type: 'session' }));
    const tournamentsWithType: ArchiveItem[] = userTournaments.map(t => ({ ...t, type: 'tournament' }));

    const combined = [...sessionsWithType, ...tournamentsWithType];

    combined.sort((a, b) => {
      const dateA = a.type === 'session' ? a.startedAt : (a.instanceDate ?? a.createdAt);
      const dateB = b.type === 'session' ? b.startedAt : (b.instanceDate ?? b.createdAt);

      const timeA = isFirestoreTimestamp(dateA) ? dateA.toMillis() :
                    (typeof dateA === 'number' ? dateA : 0);
      const timeB = isFirestoreTimestamp(dateB) ? dateB.toMillis() :
                    (typeof dateB === 'number' ? dateB : 0);

      const validTimeA = timeA || 0;
      const validTimeB = timeB || 0;

      return validTimeB - validTimeA;
    });

    return combined;
  }, [completedSessions, userTournaments]);

  const groupedArchiveByYear = useMemo(() => {
      return combinedArchiveItems.reduce<Record<string, ArchiveItem[]>>((acc, item) => {
        const dateToSort = item.type === 'session' ? item.startedAt : (item.instanceDate ?? item.createdAt);
        let year = 'Unbekannt';
        if (isFirestoreTimestamp(dateToSort)) {
            year = dateToSort.toDate().getFullYear().toString();
        } else if (typeof dateToSort === 'number' && dateToSort > 0) {
            year = new Date(dateToSort).getFullYear().toString();
        }
        
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

      return (
          <Link href={`/view/session/${id}?returnTo=/profile/${player?.id}&returnMainTab=archive`} key={`session-${id}`} passHref>
            <div className="p-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors duration-150 cursor-pointer mb-2">
              <div className="flex justify-between items-center mb-1.5">
                 <div className="flex items-center flex-grow"> 
                   <span className="text-sm font-medium text-white mr-2"> 
                     {title} - {formattedDate} 
                      </span>
                   <div className="flex-shrink-0">
                      {sessionStatusIcon}
                   </div>
                 </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center text-sm text-gray-400">
                  <div>
                     <span className="block">
                        Team 1:&nbsp; 
                        <span className="text-white">{playerNames['1'] || '?'} + {playerNames['3'] || '?'}</span>
                     </span>
                  </div>
                  <span className="text-sm font-semibold text-white pl-2">
                    {totalStricheBottom !== null ? totalStricheBottom : '-'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-400">
                  <div>
                     <span className="block">
                        Team 2:&nbsp; 
                        <span className="text-white">{playerNames['2'] || '?'} + {playerNames['4'] || '?'}</span>
                     </span>
                  </div>
                  <span className="text-sm font-semibold text-white pl-2">
                    {totalStricheTop !== null ? totalStricheTop : '-'}
                  </span>
                </div>
                  </div>
              </div>
          </Link>
      );
    } else if (item.type === 'tournament') {
      const tournament = item;
      const { id, name, instanceDate, status: tournamentStatus, createdAt } = tournament;
      
      const dateToDisplay = instanceDate ?? createdAt;
      let formattedDate: string | null = null;
      if (isFirestoreTimestamp(dateToDisplay)) {
          formattedDate = format(dateToDisplay.toDate(), 'dd.MM.yyyy');
      } else if (typeof dateToDisplay === 'number') {
          formattedDate = format(new Date(dateToDisplay), 'dd.MM.yyyy');
      }

      const statusText = tournamentStatus === 'completed' ? 'Abgeschlossen' :
                         tournamentStatus === 'active' ? 'Aktiv' : 'Archiviert';
      const statusClass = tournamentStatus === 'completed' ? 'bg-gray-600 text-gray-300' :
                          tournamentStatus === 'active' ? 'bg-green-600 text-white' : 'bg-yellow-600 text-black';

      return (
        <Link href={`/view/tournament/${id}`} key={`tournament-${id}`} passHref>
          <div className="p-3 bg-purple-900/30 rounded-lg hover:bg-purple-800/40 transition-colors duration-150 cursor-pointer mb-2 border border-purple-700/50">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <AwardIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">{name}</span>
                  {formattedDate && (
                    <span className="text-sm text-gray-400">{formattedDate}</span>
                  )}
                </div>
              </div>
              <span className={`text-sm px-2 py-0.5 rounded-full ${statusClass}`}>
                {statusText}
              </span>
            </div>
          </div>
        </Link>
      );
    }
    return null;
  }, [player?.id]);

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
  );
};

export default PlayerProfilePage; 