import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getFirestore, doc, getDoc, collection, getDocs, query, where, orderBy, limit, Timestamp, FieldValue } from 'firebase/firestore';
import { firebaseApp } from '@/services/firebaseInit';
import MainLayout from '@/components/layout/MainLayout';
import { ClipLoader } from 'react-spinners';
import { GroupView } from '@/components/group/GroupView';
import { getGroupMembersSortedByGames } from '@/services/playerService';
import { fetchTournamentInstancesForGroup } from '@/services/tournamentService';
import { fetchAllGroupSessions } from '@/services/sessionService';
import type { 
  FirestorePlayer, 
  JassColor,
  FarbeSettings,
  ScoreSettings,
  StrokeSettings 
} from '@/types/jass';
import type { TournamentInstance } from '@/types/tournament';
import { subscribeToGroupStatistics, GroupStatistics } from '@/services/statisticsService';

import { THEME_COLORS } from '@/config/theme';
import { format } from 'date-fns';
import Link from 'next/link';
import ProfileImage from '@/components/ui/ProfileImage';
import AvatarPreloader from '@/components/ui/AvatarPreloader';
import { CheckCircle, XCircle, MinusCircle, Award as AwardIcon } from 'lucide-react';

// Typ-Guard für Firestore Timestamp
function isFirestoreTimestamp(value: unknown): value is Timestamp {
  return Boolean(value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function');
}

type ArchiveItemType = (any & { type: 'session' }) | (TournamentInstance & { type: 'tournament' });

// 🚀 PERFORMANCE-OPTIMIERUNG: Erstelle eine Member-Map für schnellen Zugriff
const useMemberMap = (members: FirestorePlayer[]) => {
  return useMemo(() => {
    const map = new Map<string, FirestorePlayer>();
    members.forEach(member => {
      if (member.displayName) {
        map.set(member.displayName.toLowerCase(), member);
      }
    });
    return map;
  }, [members]);
};

// Hilfsfunktion zum Finden des Spieler-Profilbilds anhand des Namens
function findPlayerPhotoByName(playerName: string, memberMap: Map<string, FirestorePlayer>): string | undefined {
  if (!playerName || !memberMap) return undefined;
  const player = memberMap.get(playerName.toLowerCase());
  return player?.photoURL || undefined;
}

// Hilfsfunktion zum Finden des Spieler-Objekts anhand des Namens
function findPlayerByName(playerName: string, memberMap: Map<string, FirestorePlayer>): FirestorePlayer | undefined {
  if (!playerName || !memberMap) return undefined;
  return memberMap.get(playerName.toLowerCase());
}

const PublicGroupPage = () => {
  const router = useRouter();
  const { groupId } = router.query;

  // ===== STATE FÜR GRUPPENDATEN =====
  const [currentGroup, setCurrentGroup] = useState<any>(null);
  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [groupStats, setGroupStats] = useState<GroupStatistics | null>(null);
  const [completedSessions, setCompletedSessions] = useState<any[]>([]);
  const [groupTournaments, setGroupTournaments] = useState<TournamentInstance[]>([]);

  // ===== LOADING & ERROR STATES =====
  const [groupLoading, setGroupLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  
  const [groupError, setGroupError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);

  // 🚀 PERFORMANCE-OPTIMIERUNG: Member-Map für schnellen Zugriff
  const memberMap = useMemberMap(members);

  // 🔥 Sammle alle Photo-URLs, die im UI auftauchen, damit der Preloader sie dekodieren kann
  const groupAvatarPhotoURLs = useMemo(() => {
    const urls: (string | undefined | null)[] = [];

    // Mitglieder
    if (members) {
      urls.push(...members.map((m) => m.photoURL));
    }

    // Statistiken: Elo (playerRatings)
    // playerRatings.forEach((rating) => {
    //   if (!rating?.id) return;
    //   const member = members?.find((m) => (m.id || m.userId) === rating.id);
    //   if (member?.photoURL) {
    //     urls.push(member.photoURL);
    //   }
    // });

    const pushMemberPhotoByName = (playerName?: string, fallbackId?: string) => {
      if (!playerName && !fallbackId) return;
      const normalizedName = playerName?.toLowerCase();
      const member = members?.find((m) => {
        const matchById = fallbackId && (m.id === fallbackId || m.userId === fallbackId);
        if (matchById) return true;
        const displayName = m.displayName?.toLowerCase();
        return normalizedName && displayName === normalizedName;
      });
      if (member?.photoURL) {
        urls.push(member.photoURL);
      }
    };

    const safeStatsArray = <T extends { playerName?: string; playerId?: string; names?: string[]; }>(arr?: T[]) => Array.isArray(arr) ? arr : [];

    safeStatsArray(groupStats?.playerAllRoundTimes).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestStricheDiff).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestPointsDiff).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestWinRateSession).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestWinRateGame).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestMatschBilanz).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestSchneiderBilanz).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithHighestKontermatschBilanz).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    safeStatsArray(groupStats?.playerWithMostWeisPointsAvg).forEach((stat) => {
      pushMemberPhotoByName(stat.playerName, stat.playerId);
    });

    const collectTeamPhotos = (teams?: { names: string[] }[]) => {
      safeStatsArray(teams).forEach((team) => {
        team.names?.forEach((name) => pushMemberPhotoByName(name));
      });
    };

    collectTeamPhotos(groupStats?.teamWithHighestStricheDiff);
    collectTeamPhotos(groupStats?.teamWithHighestPointsDiff);
    collectTeamPhotos(groupStats?.teamWithHighestWinRateSession);
    collectTeamPhotos(groupStats?.teamWithHighestWinRateGame);
    collectTeamPhotos(groupStats?.teamWithHighestMatschBilanz || groupStats?.teamWithHighestMatschRate);
    collectTeamPhotos(groupStats?.teamWithHighestSchneiderBilanz || groupStats?.teamWithHighestSchneiderRate);
    collectTeamPhotos(groupStats?.teamWithHighestKontermatschBilanz || groupStats?.teamWithHighestKontermatschRate);
    collectTeamPhotos(groupStats?.teamWithMostWeisPointsAvg);
    collectTeamPhotos(groupStats?.teamWithFastestRounds);

    return Array.from(new Set(urls.filter((url): url is string => typeof url === 'string' && url.trim() !== '')));
  }, [members, groupStats]);

  // ===== THEME SYSTEM =====
  const groupTheme = currentGroup?.theme || 'yellow';
  const theme = THEME_COLORS[groupTheme as keyof typeof THEME_COLORS] || THEME_COLORS.yellow;

  // ===== HAUPTDATEN LADEN =====
  useEffect(() => {
    if (typeof groupId !== 'string') return;

    const loadGroup = async () => {
      setGroupLoading(true);
      setGroupError(null);
      
      try {
        // console.log('🔄 Lade Gruppe:', groupId);
        const db = getFirestore(firebaseApp);
        const groupRef = doc(db, 'groups', groupId);
        const groupSnap = await getDoc(groupRef);

        if (!groupSnap.exists()) {
          throw new Error('Gruppe nicht gefunden.');
        }

        const groupData = { id: groupId, ...groupSnap.data() } as any;
        // console.log('✅ Gruppe geladen:', groupData.name);
        
        // 🚨 PRÜFE NUR: Ist es privat?
        if (groupData.isPublic === false) {
          throw new Error('Diese Gruppe ist privat.');
        }

        setCurrentGroup(groupData);
      } catch (err) {
        console.error('❌ Fehler beim Laden:', err);
        setGroupError(err instanceof Error ? err.message : 'Fehler beim Laden der Gruppe.');
      } finally {
        setGroupLoading(false);
      }
    };

    loadGroup();
  }, [groupId]);

  // 🚀 NEU: Preload Gruppenbild für sofortige Anzeige
  useEffect(() => {
    if (currentGroup?.logoUrl && typeof window !== 'undefined') {
      // console.log('[PublicGroupPage] Preloading group logo:', currentGroup.logoUrl);
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = currentGroup.logoUrl;
      link.type = 'image/jpeg'; // Standard für Firebase Storage
      document.head.appendChild(link);

      // Cleanup: Link nach 10 Sekunden entfernen (Browser hat genug Zeit zum Preloaden)
      const cleanup = setTimeout(() => {
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      }, 10000);

      return () => {
        clearTimeout(cleanup);
        if (document.head.contains(link)) {
          document.head.removeChild(link);
        }
      };
    }
  }, [currentGroup?.logoUrl]);

  // ===== MITGLIEDER LADEN =====
  useEffect(() => {
    if (!currentGroup) return;

    const loadMembers = async () => {
          setMembersLoading(true);
          setMembersError(null);
      
      try {
        const fetchedMembers = await getGroupMembersSortedByGames(currentGroup.id);
        setMembers(fetchedMembers);
        } catch (error) {
          console.error("Fehler beim Laden der Gruppenmitglieder:", error);
        setMembersError('Mitglieder konnten nicht geladen werden.');
        } finally {
          setMembersLoading(false);
        }
    };

    loadMembers();
  }, [currentGroup]);

  // ===== STATISTIKEN LADEN =====
  useEffect(() => {
    if (!currentGroup?.id) return;

    setStatsLoading(true);
    setStatsError(null);

    const unsubscribe = subscribeToGroupStatistics(
      currentGroup.id,
      (statistics) => {
        setGroupStats(statistics);
        setStatsLoading(false);
      },
      currentGroup?.mainLocationZip
    );

    return () => unsubscribe();
  }, [currentGroup]);

  // ===== ARCHIV-DATEN LADEN =====
  useEffect(() => {
    if (!currentGroup?.id) return;

    const loadArchiveData = async () => {
      // Sessions laden (öffentlich zugänglich)
          setSessionsLoading(true);
          setSessionsError(null);
      try {
        // 🚨 KORREKTUR: Verwende den zentralen Service statt einer lokalen Abfrage
        const sessions = await fetchAllGroupSessions(currentGroup.id);
          setCompletedSessions(sessions);
        } catch (error) {
          console.error("Fehler beim Laden der Sessions:", error);
        setSessionsError('Sessions konnten nicht geladen werden.');
        } finally {
          setSessionsLoading(false);
        }
        
      // Turniere laden
          setTournamentsLoading(true);
          setTournamentsError(null);
      try {
        // ✅ LADE TURNIERE FÜR GRUPPE: Alle Tournament-Instances für diese Gruppe
        const tournaments = await fetchTournamentInstancesForGroup(currentGroup.id);
        setGroupTournaments(tournaments); 
      } catch (error) {
        console.error("Fehler beim Laden der Gruppen-Turniere:", error);
        setTournamentsError('Turniere konnten nicht geladen werden.');
      } finally {
        setTournamentsLoading(false);
      }
    };

    loadArchiveData();
  }, [currentGroup?.id]);

  // ===== ARCHIV-KOMBINIERUNG =====
  const combinedArchiveItems = useMemo(() => {
    // 🎯 IDENTISCH ZU GROUPVIEW: Trennung zwischen normalen Sessions und Turnier-Sessions
    // ✅ KORRIGIERT: fetchAllGroupSessions lädt bereits gruppenspezifische Sessions, kein zusätzlicher Filter nötig!
    const allGroupSessions = completedSessions.filter(session => 
      (session.status === 'completed' || session.status === 'completed_empty')
    );
    
    const normalSessions = allGroupSessions.filter(session => !session.tournamentId);
    const tournamentSessions = allGroupSessions.filter(session => session.tournamentId);

    const sessionsWithType: ArchiveItemType[] = normalSessions.map(s => ({ ...s, type: 'session' }));
    
    // 🎯 IDENTISCH ZU GROUPVIEW: Turnier-Sessions als type: 'tournament' markieren
    const tournamentSessionsWithType: ArchiveItemType[] = tournamentSessions.map(s => ({ ...s, type: 'tournament' } as any));
    
    // 🎯 IDENTISCH ZU GROUPVIEW: Nur echte Tournament-Instances hinzufügen, die NICHT bereits als Sessions existieren
    const tournamentIdsFromSessions = new Set(tournamentSessions.map(s => s.tournamentId).filter(Boolean));
    const uniqueTournaments = groupTournaments.filter(t => !tournamentIdsFromSessions.has(t.id));
    const tournamentsWithType: ArchiveItemType[] = uniqueTournaments.map(t => ({ ...t, type: 'tournament' }));

    const combined = [...sessionsWithType, ...tournamentSessionsWithType, ...tournamentsWithType];

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
        // Echte Tournament-Instance: Enddatum bevorzugen
        dateAValue = (a as any).finalizedAt ?? (a as any).instanceDate ?? (a as any).createdAt;
      }

      if (b.type === 'session') {
        dateBValue = b.startedAt;
      } else if ('tournamentId' in b && 'startedAt' in b) {
        // Turnier-Session: verwende startedAt
        dateBValue = (b as any).startedAt;
      } else {
        // Echte Tournament-Instance: Enddatum bevorzugen
        dateBValue = (b as any).finalizedAt ?? (b as any).instanceDate ?? (b as any).createdAt;
      }

      const timeA = isFirestoreTimestamp(dateAValue) ? dateAValue.toMillis() :
                    (typeof dateAValue === 'number' ? dateAValue :
                    (dateAValue && typeof (dateAValue as Timestamp).isEqual === 'function') ? Date.now() : 0);
      
      const timeB = isFirestoreTimestamp(dateBValue) ? dateBValue.toMillis() :
                    (typeof dateBValue === 'number' ? dateBValue :
                    (dateBValue && typeof (dateBValue as Timestamp).isEqual === 'function') ? Date.now() : 0);

      // 🎯 IDENTISCH ZU GROUPVIEW: Absteigende Sortierung (neueste zuerst)
      return timeB - timeA;
    });

    return combined;
  }, [completedSessions, groupTournaments]);

  const groupedArchiveByYear = combinedArchiveItems.reduce<Record<string, ArchiveItemType[]>>((acc, item) => {
    // 🎯 IDENTISCH ZU GROUPVIEW: Für Turnier-Sessions auch startedAt verwenden
    let dateToSort;
    if (item.type === 'session') {
      dateToSort = item.startedAt;
    } else if ('tournamentId' in item && 'startedAt' in item) {
      // Turnier-Session: verwende startedAt
      dateToSort = (item as any).startedAt;
    } else {
      // Echte Tournament-Instance: Enddatum bevorzugen
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

  const sortedYears = Object.keys(groupedArchiveByYear).sort((a, b) => parseInt(b) - parseInt(a));

  // ===== ARCHIV ITEM RENDERER =====
  const renderArchiveItem = useCallback((item: ArchiveItemType) => {
    // 🎯 EXAKT WIE STARTPAGE: Prüfe ZUERST den Typ, dann ob es eine Turnier-Session ist
    if (item.type === 'tournament') {
      const isTournamentSession = 'tournamentId' in item && 'startedAt' in item;
      
      if (isTournamentSession) {
      // Dies ist ein jassGameSummary mit tournamentId (Turnier-Session)
      const session = item as any;
      const tournamentId = session.tournamentId;
      // 🚨 ENDDATUM: endedAt ist das korrekte Enddatum aus jassGameSummaries
      const rawDate: any = (session as any).endedAt ?? null;
      const displayDate = rawDate instanceof Timestamp ? rawDate.toDate() : (typeof rawDate === 'number' ? new Date(rawDate) : null);
      const formattedDate = displayDate ? format(displayDate, 'dd.MM.yyyy') : null;
      
      return (
        <Link href={`/view/tournament/${tournamentId}`} key={`tournament-${tournamentId}`} passHref>
          <div className="px-3 py-2 lg:px-6 lg:py-3 bg-purple-900/30 rounded-lg hover:bg-purple-800/40 transition-colors duration-150 cursor-pointer mb-2 border border-purple-700/50">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <AwardIcon className="w-6 h-6 lg:w-8 lg:h-8 text-purple-400 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-base lg:text-xl font-medium text-white">{(session as any).tournamentName || 'Turnier'}</span>
                  {formattedDate && (
                    <span className="text-sm lg:text-base text-gray-400">{formattedDate}</span>
                  )}
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-600 text-gray-300">
                Abgeschlossen
              </span>
            </div>
          </div>
        </Link>
      );
      }
    } else if (item.type === 'session') {
      const session = item;
      const { id, startedAt, playerNames, finalScores, status: sessionStatus, finalStriche: sessionFinalStriche } = session; 

      const sessionStatusIcon = sessionStatus === 'completed'
        ? <CheckCircle className="w-4 h-4 text-green-500" />
        : <XCircle className="w-4 h-4 text-red-500" />;

      const title = currentGroup?.name || 'Partie';

      const calculateTotalStriche = (stricheP: any): number => {
        if (!stricheP) return 0;
        return (
          (stricheP.berg || 0) +
          (stricheP.sieg || 0) +
          (stricheP.matsch || 0) +
          (stricheP.schneider || 0) +
          (stricheP.kontermatsch || 0)
        );
      };

      const totalStricheBottom = sessionStatus === 'completed' && sessionFinalStriche 
          ? calculateTotalStriche(sessionFinalStriche.bottom) 
          : null;
      const totalStricheTop = sessionStatus === 'completed' && sessionFinalStriche 
          ? calculateTotalStriche(sessionFinalStriche.top) 
          : null;

      let displayDateValue: number | Timestamp | FieldValue | undefined | null = null;
      if (sessionStatus === 'completed' && session.endedAt && isFirestoreTimestamp(session.endedAt)) {
          displayDateValue = session.endedAt;
      } else if (session.startedAt) {
          displayDateValue = session.startedAt;
      }

      const displayDate = isFirestoreTimestamp(displayDateValue) ? displayDateValue.toDate() : 
                         (typeof displayDateValue === 'number' ? new Date(displayDateValue) : null);
      const formattedDate = displayDate ? format(displayDate, 'dd.MM.yy, HH:mm') : 'Unbekannt';

      // ✅ FIX: Verwende die GLEICHE Methode wie im privaten Modus (robuster!)
      // Suche Spieler direkt nach displayName aus playerNames (wie in /profile/index.tsx)
      const player1Data = members?.find(m => m.displayName === playerNames['1']);
      const player2Data = members?.find(m => m.displayName === playerNames['2']);
      const player3Data = members?.find(m => m.displayName === playerNames['3']);
      const player4Data = members?.find(m => m.displayName === playerNames['4']);

      return (
        <Link href={`/view/session/public/${id}?groupId=${currentGroup?.id || groupId}`} key={`session-${id}`} passHref>
          <div className="px-3 py-2 md:px-4 md:py-2.5 lg:px-6 lg:py-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors duration-150 cursor-pointer mb-2">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center flex-grow">
                <span className="text-base md:text-lg lg:text-xl font-medium mr-2" style={{ color: `${THEME_COLORS[currentGroup?.theme || 'purple']?.accentHex || '#a855f7'}` }}>
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
                      src={player1Data?.photoURL}
                      alt={playerNames['1'] || 'Spieler'}
                      size="sm"
                      className="border-2 border-gray-800"
                      style={{ zIndex: 1 }}
                      fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                      fallbackText={playerNames['1']?.charAt(0).toUpperCase() || '?'}
                      context="list"
                    />
                    <ProfileImage
                      src={player3Data?.photoURL}
                      alt={playerNames['3'] || 'Spieler'}
                      size="sm"
                      className="border-2 border-gray-800 -ml-2"
                      style={{ zIndex: 0 }}
                      fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                      fallbackText={playerNames['3']?.charAt(0).toUpperCase() || '?'}
                      context="list"
                    />
                  </div>
                  <span className="text-sm text-gray-300 truncate pr-2">{playerNames['1'] || '?'} & {playerNames['3'] || '?'}</span>
                </div>
                <span className="text-lg font-medium text-white">{totalStricheBottom !== null ? totalStricheBottom : '-'}</span>
              </div>
              
              {/* Team Top */}
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  {/* 🎨 AVATAR-PAIR: Wie im GroupView Teams-Tab */}
                  <div className="flex mr-2">
                    <ProfileImage
                      src={player2Data?.photoURL}
                      alt={playerNames['2'] || 'Spieler'}
                      size="sm"
                      className="border-2 border-gray-800"
                      style={{ zIndex: 1 }}
                      fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                      fallbackText={playerNames['2']?.charAt(0).toUpperCase() || '?'}
                      context="list"
                    />
                    <ProfileImage
                      src={player4Data?.photoURL}
                      alt={playerNames['4'] || 'Spieler'}
                      size="sm"
                      className="border-2 border-gray-800 -ml-2"
                      style={{ zIndex: 0 }}
                      fallbackClassName="bg-gray-700 text-gray-300 text-xs"
                      fallbackText={playerNames['4']?.charAt(0).toUpperCase() || '?'}
                      context="list"
                    />
                  </div>
                  <span className="text-sm text-gray-300 truncate pr-2">{playerNames['2'] || '?'} & {playerNames['4'] || '?'}</span>
                </div>
                <span className="text-lg font-medium text-white">{totalStricheTop !== null ? totalStricheTop : '-'}</span>
              </div>
            </div>
          </div>
        </Link>
      );
    }
    return null;
  }, [currentGroup?.id, members]);

  // ===== TAB HANDLING =====
  const { mainTab, statsSubTab } = router.query;
  const activeMainTab = (typeof mainTab === 'string' && ['statistics', 'archive', 'members'].includes(mainTab)) 
    ? mainTab 
    : 'statistics';
  const activeStatsSubTab = (typeof statsSubTab === 'string' && ['overview', 'players', 'teams'].includes(statsSubTab)) 
    ? statsSubTab 
    : 'overview';

  // ===== NO-OP HANDLERS FÜR ÖFFENTLICHE ANSICHT =====
  const noOpFunction = () => {};
  const noOpAsyncFunction = async () => {};
  const noOpFileChange = () => {};
  const noOpCropComplete = async () => {};
  const noOpProcessInvite = async () => {};
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🚨 LOADING
  if (groupLoading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
          <ClipLoader color="#ffffff" size={40} />
          <p className="mt-4 text-lg">Lade Gruppendaten...</p>
          <p className="mt-2 text-sm text-gray-400">Gruppe: {groupId}</p>
        </div>
      </MainLayout>
    );
  }

  // 🚨 ERROR
  if (groupError) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="text-red-400 bg-red-900/30 p-6 rounded-md max-w-md text-center">
            <h1 className="text-xl font-bold mb-2">Fehler</h1>
            <p>{groupError}</p>
            <p className="mt-2 text-sm text-gray-500">Gruppe: {groupId}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // 🚨 ZEIGE EINFACH DIE GRUPPENDATEN - PUNKT!
  if (!currentGroup) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
          <p>Keine Gruppendaten verfügbar.</p>
        </div>
      </MainLayout>
    );
  }

  // ===== VOLLSTÄNDIGE ÖFFENTLICHE ANSICHT MIT GROUPVIEW =====
  return (
    <>
      {/* 🚀 AVATAR PRELOADER: Lädt alle relevanten Avatare unsichtbar vor */}
      {groupAvatarPhotoURLs.length > 0 && (
        <AvatarPreloader photoURLs={groupAvatarPhotoURLs} />
      )}
      
      <GroupView 
      // ===== GUEST-PROPS (ÖFFENTLICHE ANSICHT) =====
      currentGroup={currentGroup}
      user={null} // Kein User in öffentlicher Ansicht
      isGuest={true} // Als Gast behandeln
      userGroups={[]} // Keine User-Gruppen
      isAuthenticated={() => false} // Nicht authentifiziert
      isPublicView={true} // 🚨 KRITISCH: Markiere als öffentliche Ansicht!
      
      // ===== NO-OP HANDLERS =====
      handleProcessInviteInput={noOpProcessInvite}
      isProcessingInvite={false}
      showNotification={noOpFunction}
      groupStatus="success"
      groupError={null}
      
      // ===== HEADER & UPLOAD (DEAKTIVIERT) =====
      isAdmin={false} // Kein Admin in öffentlicher Ansicht
      selectedFile={null}
      previewUrl={null}
      isUploading={false}
      handleSelectClick={noOpFunction}
      handleUpload={noOpAsyncFunction}
      handleCancelSelection={noOpFunction}
      handleInviteClick={noOpFunction}
      router={router}
      
      // ===== FILE INPUT (DEAKTIVIERT) =====
      fileInputRef={fileInputRef}
      handleFileChange={noOpFileChange}
      cropModalOpen={false}
      imageToCrop={null}
      handleCropComplete={noOpCropComplete}
      
      // ===== TAB-SYSTEM =====
      activeMainTab={activeMainTab}
      activeStatsSubTab={activeStatsSubTab}
      groupTheme={groupTheme}
      
      // ===== DATEN PROPS =====
      statsLoading={statsLoading}
      statsError={statsError}
      members={members}
      membersLoading={membersLoading}
      membersError={membersError}
      completedSessions={completedSessions}
      groupTournaments={groupTournaments}
      combinedArchiveItems={combinedArchiveItems}
      groupedArchiveByYear={groupedArchiveByYear}
      sortedYears={sortedYears}
      renderArchiveItem={renderArchiveItem}
      sessionsLoading={sessionsLoading}
      sessionsError={sessionsError}
      tournamentsLoading={tournamentsLoading}
      tournamentsError={tournamentsError}
      
      // ===== STATISTIK-DATEN =====
      groupStats={groupStats}
      theme={theme}
      findPlayerByName={(name) => findPlayerByName(name, memberMap)}
      findPlayerPhotoByName={(name) => findPlayerPhotoByName(name, memberMap)}
      
      // ===== MODAL PROPS (DEAKTIVIERT) =====
      isInviteModalOpen={false}
      onCloseInviteModal={noOpFunction}
      inviteLoading={false}
      inviteError={null}
      inviteToken={null}
      onGenerateNewInvite={noOpFunction}
      handleCloseInviteModal={noOpFunction}
      isGeneratingInvite={false}
      handleGenerateNewInvite={noOpFunction}
    />
    </>
  );
};

export default PublicGroupPage;
