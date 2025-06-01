"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import MainLayout from "@/components/layout/MainLayout";
import { getFirestore, doc, getDoc, Timestamp } from "firebase/firestore";
import { firebaseApp } from "@/services/firebaseInit";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Image from "next/image";
import { Users, BarChart, Archive, Award as AwardIcon, BarChart2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getGroupMembersSortedByGames } from "@/services/playerService";
import { GroupMemberList } from "@/components/group/GroupMemberList";
import type { FirestoreGroup, FirestorePlayer, StricheRecord, JassColor } from "@/types/jass";
import { fetchAllGroupSessions } from "@/services/sessionService";
import { fetchTournamentInstancesForGroup } from "@/services/tournamentService";
import { format } from "date-fns";
import Link from "next/link";
import type { SessionSummary } from "@/services/sessionService";
import type { TournamentInstance } from "@/types/tournament";
import { GroupStatistics, fetchGroupStatistics } from "@/services/statisticsService";
import { StatRow } from '@/components/statistics/StatRow';
import { FarbePictogram } from '@/components/settings/FarbePictogram';
import { FormattedDescription } from '@/components/ui/FormattedDescription';

// Typ-Guard für Firestore Timestamp
function isFirestoreTimestamp(value: any): value is Timestamp {
  return value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function';
}

type ArchiveItem = (SessionSummary & { type: 'session' }) | (TournamentInstance & { type: 'tournament' });

// Hilfsfunktion zum Finden des Spieler-Profilbilds anhand des Namens
function findPlayerPhotoByName(playerName: string, membersList: FirestorePlayer[]): string | undefined {
  if (!membersList?.length) return undefined;
  
  const player = membersList.find(
    m => m.displayName?.toLowerCase() === playerName.toLowerCase()
  );
  
  // Umwandeln von null zu undefined für typekompatibilität
  return player?.photoURL || undefined;
}

// Hilfsfunktion zum Normalisieren der Trumpffarben-Namen für die JassColor Typ-Kompatibilität
const normalizeJassColor = (farbe: string): JassColor => {
  const mappings: Record<string, JassColor> = {
    "Eichel": "Eicheln",
    "Unde": "Une"
  };
  
  return (mappings[farbe] ?? farbe) as JassColor;
};

// Hilfsfunktion zur Formatierung von Millisekunden in eine lesbare Form
function formatMillisecondsToHumanReadable(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes === 0) {
    return `${seconds}s`;
  }
  
  return `${minutes}m ${remainingSeconds}s`;
}

const GroupView: React.FC = () => {
  const router = useRouter();
  const { groupId } = router.query;

  const [group, setGroup] = useState<FirestoreGroup | null>(null);
  const [members, setMembers] = useState<FirestorePlayer[]>([]);
  const [loadingPage, setLoadingPage] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  
  const [completedSessions, setCompletedSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  
  const [groupTournaments, setGroupTournaments] = useState<TournamentInstance[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  // Neue State-Variablen für erweiterte Statistiken
  const [groupStats, setGroupStats] = useState<GroupStatistics | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    const loadGroup = async () => {
      if (!groupId || typeof groupId !== "string") return;

      setLoadingPage(true);
      setError(null);

      try {
        const db = getFirestore(firebaseApp);
        const groupRef = doc(db, "groups", groupId);
        const groupSnap = await getDoc(groupRef);

        if (!groupSnap.exists()) {
          setError("Gruppe nicht gefunden");
          setLoadingPage(false);
          return;
        }

        const groupData = { ...groupSnap.data(), id: groupSnap.id } as FirestoreGroup;

        if (!groupData.isPublic) {
          setError("Diese Gruppe ist nicht öffentlich sichtbar");
          setLoadingPage(false);
          return;
        }

        setGroup(groupData);
        
        // Gruppenmitglieder laden
        try {
          setMembersLoading(true);
          setMembersError(null);
          const members = await getGroupMembersSortedByGames(groupId);
          setMembers(members);
        } catch (error) {
          console.error("Fehler beim Laden der Gruppenmitglieder:", error);
          setMembersError("Mitglieder konnten nicht geladen werden");
        } finally {
          setMembersLoading(false);
        }
        
        // Sessions der Gruppe laden
        try {
          setSessionsLoading(true);
          setSessionsError(null);
          const sessions = await fetchAllGroupSessions(groupId);
          setCompletedSessions(sessions);
        } catch (error) {
          console.error("Fehler beim Laden der Sessions:", error);
          setSessionsError("Abgeschlossene Partien konnten nicht geladen werden");
        } finally {
          setSessionsLoading(false);
        }
        
        // Turniere der Gruppe laden
        try {
          setTournamentsLoading(true);
          setTournamentsError(null);
          const tournaments = await fetchTournamentInstancesForGroup(groupId);
          setGroupTournaments(tournaments.filter(t => t.status === 'completed' || t.status === 'active'));
        } catch (error) {
          console.error("Fehler beim Laden der Turniere:", error);
          setTournamentsError("Turniere konnten nicht geladen werden");
        } finally {
          setTournamentsLoading(false);
        }
        
        // Gruppenstatistiken laden
        try {
          setStatsLoading(true);
          setStatsError(null);
          const statistics = await fetchGroupStatistics(groupId, groupData?.mainLocationZip);
          setGroupStats(statistics);
        } catch (error) {
          console.error("Fehler beim Laden der Gruppenstatistiken:", error);
          setStatsError("Statistiken konnten nicht geladen werden");
        } finally {
          setStatsLoading(false);
        }
        
      } catch (error) {
        console.error("Fehler beim Laden der Gruppe:", error);
        setError("Fehler beim Laden der Gruppendaten");
      } finally {
        setLoadingPage(false);
      }
    };

    loadGroup();
  }, [groupId]);

  const combinedArchiveItems = useMemo(() => {
    const sessionsWithType: ArchiveItem[] = completedSessions.map(s => ({ ...s, type: 'session' }));
    const tournamentsWithType: ArchiveItem[] = groupTournaments.map(t => ({ ...t, type: 'tournament' }));

    const combined = [...sessionsWithType, ...tournamentsWithType];

    combined.sort((a, b) => {
      const dateA = a.type === 'session' ? a.startedAt : (a.instanceDate ?? a.createdAt);
      const dateB = b.type === 'session' ? b.startedAt : (b.instanceDate ?? b.createdAt);

      const timeA = isFirestoreTimestamp(dateA) ? dateA.toMillis() :
                    (typeof dateA === 'number' ? dateA : 0);
      const timeB = isFirestoreTimestamp(dateB) ? dateB.toMillis() :
                    (typeof dateB === 'number' ? dateB : 0);

      return timeB - timeA;
    });

    return combined;
  }, [completedSessions, groupTournaments]);

  const groupedArchiveByYear = useMemo(() => {
    return combinedArchiveItems.reduce<Record<string, ArchiveItem[]>>((acc, item) => {
    const dateToSort = item.type === 'session' ? item.startedAt : (item.instanceDate ?? item.createdAt);
    const year = isFirestoreTimestamp(dateToSort) ? dateToSort.toDate().getFullYear().toString() :
                 (typeof dateToSort === 'number' ? new Date(dateToSort).getFullYear().toString() :
                 'Unbekannt');
    if (!acc[year]) {
      acc[year] = [];
    }
    acc[year].push(item);
    return acc;
  }, {});
  }, [combinedArchiveItems]);

  const sortedYears = useMemo(() => {
    return Object.keys(groupedArchiveByYear).sort((a, b) => parseInt(b) - parseInt(a));
  }, [groupedArchiveByYear]);

  const renderArchiveItem = (item: ArchiveItem) => {
    if (item.type === 'session') {
      const session = item;
      const { id, startedAt, playerNames, finalScores, status, finalStriche } = session;

      const calculateTotalStriche = (striche: StricheRecord | undefined): number => {
        if (!striche) return 0;
        return (striche.berg || 0) + (striche.sieg || 0) + (striche.matsch || 0) + (striche.schneider || 0) + (striche.kontermatsch || 0);
      };
      const totalStricheBottom = status === 'completed' && finalStriche ? calculateTotalStriche(finalStriche.bottom) : null;
      const totalStricheTop = status === 'completed' && finalStriche ? calculateTotalStriche(finalStriche.top) : null;

      const displayDate = isFirestoreTimestamp(startedAt) ? startedAt.toDate() : 
                         (typeof startedAt === 'number' ? new Date(startedAt) : null);
      const formattedDate = displayDate ? format(displayDate, 'dd.MM.yy, HH:mm') : 'Unbekannt';

      return (
        <Link href={`/view/session/${id}`} key={`session-${id}`} passHref>
          <div className="p-3 bg-gray-700/50 rounded-lg hover:bg-gray-600/50 transition-colors duration-150 cursor-pointer mb-2">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center flex-grow">
                <span className="text-sm font-medium text-white mr-2">
                  {group?.name || 'Jass-Session'} - {formattedDate}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs text-gray-400">
                <div>
                  <span className="block">Team 1:&nbsp;<span className="text-white">{playerNames['1'] || '?'} + {playerNames['3'] || '?'}</span></span>
                </div>
                <span className="text-sm font-semibold text-white pl-2">{totalStricheBottom !== null ? totalStricheBottom : '-'}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-400">
                <div>
                  <span className="block">Team 2:&nbsp;<span className="text-white">{playerNames['2'] || '?'} + {playerNames['4'] || '?'}</span></span>
                </div>
                <span className="text-sm font-semibold text-white pl-2">{totalStricheTop !== null ? totalStricheTop : '-'}</span>
              </div>
            </div>
          </div>
        </Link>
      );
    } else if (item.type === 'tournament') {
      const tournament = item;
      const { id, name, instanceDate, status: tournamentStatus } = tournament;
      const displayDate = instanceDate instanceof Timestamp ? instanceDate.toDate() : (typeof instanceDate === 'number' ? new Date(instanceDate) : null);
      const formattedDate = displayDate ? format(displayDate, 'dd.MM.yyyy') : null;

      return (
        <Link href={`/view/tournament/${id}`} key={`tournament-${id}`} passHref>
          <div className="p-3 bg-purple-900/30 rounded-lg hover:bg-purple-800/40 transition-colors duration-150 cursor-pointer mb-2 border border-purple-700/50">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <AwardIcon className="w-5 h-5 text-purple-400 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-white">{name}</span>
                  {formattedDate && (
                    <span className="text-xs text-gray-400">{formattedDate}</span>
                  )}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${tournamentStatus === 'completed' ? 'bg-gray-600 text-gray-300' : 'bg-green-600 text-white'}`}>
                {tournamentStatus === 'completed' ? 'Abgeschlossen' : (tournamentStatus === 'active' ? 'Aktiv' : 'Bevorstehend')}
              </span>
            </div>
          </div>
        </Link>
      );
    }
    return null;
  };

  if (loadingPage) {
    return (
      <MainLayout>
        <div className="flex flex-1 flex-col items-center justify-center min-h-[calc(100vh-112px)]">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
            <span className="ml-3 text-white">Laden...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex flex-1 flex-col items-center justify-center min-h-[calc(100vh-112px)] p-4">
          <div className="bg-red-900/30 px-6 py-4 rounded-lg max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-white mb-2">Fehler</h2>
            <p className="text-red-200">{error}</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!group) {
    return (
      <MainLayout>
        <div className="flex flex-1 flex-col items-center justify-center min-h-[calc(100vh-112px)] p-4">
          <div className="bg-gray-800 px-6 py-4 rounded-lg max-w-md w-full text-center">
            <h2 className="text-xl font-bold text-white mb-2">Gruppe nicht gefunden</h2>
            <p className="text-gray-300">Die angeforderte Gruppe existiert nicht oder ist nicht öffentlich.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-start min-h-screen bg-gray-900 text-white p-4 relative pt-8 pb-20">
        <div className="absolute top-0 right-0 left-0 h-16 bg-gradient-to-b from-blue-900/20 to-transparent"></div>
        
        <div className="relative mb-4 mt-6">
          <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-gray-700 flex items-center justify-center bg-gray-800">
            {group?.logoUrl ? (
              <Image
                src={group.logoUrl}
                alt={`Logo ${group?.name ?? 'Gruppe'}`}
                layout="fill"
                objectFit="cover"
                priority
                sizes="(max-width: 768px) 128px, 128px" 
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/placeholder-logo.png";
                }}
              />
            ) : (
              <span className="text-4xl font-bold text-gray-500">
                {(group?.name ?? '?').charAt(0).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="w-full text-center mb-6 px-4">
          <h1 className="text-3xl font-bold mb-1 text-white break-words">{group?.name ?? 'Keine Gruppe ausgewählt'}</h1>
          <div className="text-sm text-gray-400 mx-auto max-w-xl break-words">
            <FormattedDescription 
              description={group?.description} 
              className="mx-auto" 
            />
          </div>
        </div>

        <Tabs defaultValue="statistics" className="flex-grow flex flex-col w-full max-w-2xl mx-auto">
          <TabsList className="grid w-full grid-cols-3 bg-gray-800 sticky top-0 z-10 rounded-md mb-4">
            <TabsTrigger 
              value="statistics" 
              className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-l-md py-2.5"
            >
              <BarChart className="w-4 h-4 mr-2" /> Statistik
            </TabsTrigger>
            <TabsTrigger 
              value="archive"
              className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white py-2.5"
            >
              <Archive className="w-4 h-4 mr-2" /> Archiv
            </TabsTrigger>
            <TabsTrigger
              value="members" 
              className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-r-md py-2.5"
            >
              <Users className="w-4 h-4 mr-2" /> Mitglieder
            </TabsTrigger>
          </TabsList>

          <div className="flex-grow p-0 md:p-4 overflow-y-auto">
            <TabsContent value="statistics">
              {statsError && !statsLoading && (
                <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md mb-4">
                  Fehler beim Laden der Statistiken: {statsError}
                </div>
            )}
              {statsLoading ? (
                <div className="flex justify-center items-center py-10">
                  <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                  <span className="ml-3 text-gray-300">Lade Statistiken...</span>
                </div>
              ) : (
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 bg-gray-800 sticky top-0 z-10 rounded-md mb-4">
                    <TabsTrigger value="overview" className="py-1.5 data-[state=active]:bg-gray-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-l-md">
                      <BarChart2 className="w-4 h-5 mr-1.5"/> Übersicht
                    </TabsTrigger>
                    <TabsTrigger value="players" className="py-1.5 data-[state=active]:bg-gray-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white">
                      <Users className="w-4 h-5 mr-1.5"/> Spieler
                    </TabsTrigger>
                    <TabsTrigger value="teams" className="py-1.5 data-[state=active]:bg-gray-600 data-[state=active]:text-white data-[state=active]:shadow-md text-gray-400 hover:text-white rounded-r-md">
                      <Users className="w-4 h-5 mr-1.5"/> Teams
                    </TabsTrigger>
                  </TabsList>

                  {/* Übersicht Tab */}
                  <TabsContent value="overview" className="space-y-3 text-sm">
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Gruppenübersicht</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <StatRow 
                          label="Mitglieder:" 
                          value={groupStats?.memberCount || 0} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Anzahl Partien:" 
                          value={groupStats?.sessionCount || 0} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Anzahl Spiele:" 
                          value={groupStats?.gameCount || 0} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Gesamte Jass-Zeit:" 
                          value={groupStats?.totalPlayTime || '-'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Erster Jass:" 
                          value={groupStats?.firstJassDate || '-'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Letzter Jass:" 
                          value={groupStats?.lastJassDate || '-'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Hauptspielort:" 
                          value={groupStats?.hauptspielortName || 'N/A'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                      </div>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Durchschnittswerte & Details</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        <StatRow 
                          label="Ø Dauer pro Partie:" 
                          value={groupStats?.avgSessionDuration || '-'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Ø Dauer pro Spiel:" 
                          value={groupStats?.avgGameDuration || '-'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Ø Spiele pro Partie:" 
                          value={groupStats?.avgGamesPerSession ? groupStats.avgGamesPerSession.toFixed(1) : '-'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Ø Runden pro Spiel:" 
                          value={groupStats?.avgRoundsPerGame ? groupStats.avgRoundsPerGame.toFixed(1) : '-'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow 
                          label="Ø Matsch pro Spiel:" 
                          value={groupStats?.avgMatschPerGame ? groupStats.avgMatschPerGame.toFixed(2) : '-'} 
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                        <StatRow
                          label="Ø Rundenzeit:"
                          value={groupStats?.avgRoundDuration || '-'}
                          className="bg-gray-700/30 px-2 py-1.5 rounded-md"
                        />
                      </div>
                    </div>
                    
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Spieler mit meisten Spielen</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.playerWithMostGames && groupStats.playerWithMostGames.length > 0 ? (
                          groupStats.playerWithMostGames.map((player, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <Avatar className="h-6 w-6 mr-2 bg-yellow-600/20 flex items-center justify-center">
                                  {findPlayerPhotoByName(player.name, members) ? (
                                    <Image
                                      src={findPlayerPhotoByName(player.name, members)!}
                                      alt={player.name}
                                      width={24}
                                      height={24}
                                      className="rounded-full object-cover"
                                    />
                                  ) : (
                                    <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                      {player.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  )}
                                </Avatar>
                                <span className="text-gray-300">{player.name}</span>
                  </div>
                              <span className="text-white font-medium">{player.value}</span>
                  </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                  </div>
                </div>

                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Trumpffarben</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.trumpfFarbenStatistik && groupStats.trumpfFarbenStatistik.length > 0 ? (
                          groupStats.trumpfFarbenStatistik.map((farbe, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <FarbePictogram 
                                  farbe={normalizeJassColor(farbe.farbe)} 
                                  mode="svg" 
                                  className="h-6 w-6 mr-2"
                                />
                                <span className="text-gray-300">{farbe.farbe}</span>
                              </div>
                              <span className="text-white font-medium">{(farbe.anteil * 100).toFixed(1)}%</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Trumpfstatistik verfügbar</div>
                        )}
              </div>
            </div>
          </TabsContent>

                  {/* Spieler Tab */}
                  <TabsContent value="players" className="space-y-3 text-sm">
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Strichedifferenz</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.playerWithHighestStricheDiff && groupStats.playerWithHighestStricheDiff.length > 0 ? (
                          groupStats.playerWithHighestStricheDiff.map((player, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <Avatar className="h-6 w-6 mr-2 bg-yellow-600/20 flex items-center justify-center">
                                  {findPlayerPhotoByName(player.name, members) ? (
                                    <Image
                                      src={findPlayerPhotoByName(player.name, members)!}
                                      alt={player.name}
                                      width={24}
                                      height={24}
                                      className="rounded-full object-cover"
                                    />
                                  ) : (
                                    <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                      {player.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  )}
                                </Avatar>
                                <span className="text-gray-300">{player.name}</span>
                              </div>
                              <span className="text-white font-medium">
                                {player.value > 0 ? '+' : ''}{Math.trunc(player.value)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* NEU: Ø Siegquote (Spiel) für Spieler */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Ø Siegquote (Spiel)</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.playerWithHighestWinRateGame && groupStats.playerWithHighestWinRateGame.length > 0 ? (
                          groupStats.playerWithHighestWinRateGame.map((player, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <Avatar className="h-6 w-6 mr-2 bg-yellow-600/20 flex items-center justify-center">
                                  {findPlayerPhotoByName(player.name, members) ? (
                                    <Image
                                      src={findPlayerPhotoByName(player.name, members)!}
                                      alt={player.name}
                                      width={24}
                                      height={24}
                                      className="rounded-full object-cover"
                                    />
                                  ) : (
                                    <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                      {player.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  )}
                                </Avatar>
                                <span className="text-gray-300">{player.name}</span>
                              </div>
                              <span className="text-white font-medium">{(player.value * 100).toFixed(1)}%</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* NEU: Ø Matschquote (Spiel) für Spieler */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Ø Matschquote (Spiel)</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.playerWithHighestMatschRate && groupStats.playerWithHighestMatschRate.length > 0 ? (
                          groupStats.playerWithHighestMatschRate.map((player, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <Avatar className="h-6 w-6 mr-2 bg-yellow-600/20 flex items-center justify-center">
                                  {findPlayerPhotoByName(player.name, members) ? (
                                    <Image
                                      src={findPlayerPhotoByName(player.name, members)!}
                                      alt={player.name}
                                      width={24}
                                      height={24}
                                      className="rounded-full object-cover"
                                    />
                                  ) : (
                                    <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                      {player.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  )}
                                </Avatar>
                                <span className="text-gray-300">{player.name}</span>
                              </div>
                              <span className="text-white font-medium">{player.value.toFixed(2)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* NEU: Ø Weispunkte (Spiel) für Spieler */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Ø Weispunkte (Spiel)</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.playerWithMostWeisPointsAvg && groupStats.playerWithMostWeisPointsAvg.length > 0 ? (
                          groupStats.playerWithMostWeisPointsAvg.map((player, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <Avatar className="h-6 w-6 mr-2 bg-yellow-600/20 flex items-center justify-center">
                                  {findPlayerPhotoByName(player.name, members) ? (
                                    <Image
                                      src={findPlayerPhotoByName(player.name, members)!}
                                      alt={player.name}
                                      width={24}
                                      height={24}
                                      className="rounded-full object-cover"
                                    />
                                  ) : (
                                    <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                      {player.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  )}
                                </Avatar>
                                <span className="text-gray-300">{player.name}</span>
                              </div>
                              <span className="text-white font-medium">{player.value}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* NEU: Rundenzeit für Spieler */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Rundenzeit</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.playerAllRoundTimes && groupStats.playerAllRoundTimes.length > 0 ? (
                          groupStats.playerAllRoundTimes.map((player, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <Avatar className="h-6 w-6 mr-2 bg-yellow-600/20 flex items-center justify-center">
                                  {findPlayerPhotoByName(player.name, members) ? (
                                    <Image
                                      src={findPlayerPhotoByName(player.name, members)!}
                                      alt={player.name}
                                      width={24}
                                      height={24}
                                      className="rounded-full object-cover"
                                    />
                                  ) : (
                                    <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                      {player.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  )}
                                </Avatar>
                                <span className="text-gray-300">{player.name}</span>
                              </div>
                              <span className="text-white font-medium">
                                {(player as any).displayValue || formatMillisecondsToHumanReadable(player.value)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">
                            Keine Rundenzeiten erfasst
                </div>
            )}
                      </div>
                    </div>
                  </TabsContent>

                  {/* Teams Tab */}
                  <TabsContent value="teams" className="space-y-3 text-sm">
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Ø Siegquote (Partie)</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithHighestWinRateSession && groupStats.teamWithHighestWinRateSession.length > 0 ? (
                          groupStats.teamWithHighestWinRateSession.map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <Avatar className="h-6 w-6 border-2 border-gray-800 bg-yellow-600/20 flex items-center justify-center">
                                    {findPlayerPhotoByName(team.names[0], members) ? (
                                      <Image
                                        src={findPlayerPhotoByName(team.names[0], members)!}
                                        alt={team.names[0]}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                        {team.names[0].charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                  <Avatar className="h-6 w-6 border-2 border-gray-800 bg-yellow-600/20 flex items-center justify-center">
                                    {findPlayerPhotoByName(team.names[1], members) ? (
                                      <Image
                                        src={findPlayerPhotoByName(team.names[1], members)!}
                                        alt={team.names[1]}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                        {team.names[1].charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium">{(team.value * 100).toFixed(1)}%</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>

                    {/* Hinzugefügt: Ø Siegquote (Spiel) für Teams */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Ø Siegquote (Spiel)</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithHighestWinRateGame && groupStats.teamWithHighestWinRateGame.length > 0 ? (
                          groupStats.teamWithHighestWinRateGame.map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <Avatar className="h-6 w-6 border-2 border-gray-800 bg-yellow-600/20 flex items-center justify-center">
                                    {findPlayerPhotoByName(team.names[0], members) ? (
                                      <Image
                                        src={findPlayerPhotoByName(team.names[0], members)!}
                                        alt={team.names[0]}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                        {team.names[0].charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                  <Avatar className="h-6 w-6 border-2 border-gray-800 bg-yellow-600/20 flex items-center justify-center">
                                    {findPlayerPhotoByName(team.names[1], members) ? (
                                      <Image
                                        src={findPlayerPhotoByName(team.names[1], members)!}
                                        alt={team.names[1]}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                        {team.names[1].charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium">{(team.value * 100).toFixed(1)}%</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Bestehend: Ø Matschquote (Spiel) für Teams */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Ø Matschquote (Spiel)</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithHighestMatschRate && groupStats.teamWithHighestMatschRate.length > 0 ? (
                          groupStats.teamWithHighestMatschRate.map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <Avatar className="h-6 w-6 border-2 border-gray-800 bg-yellow-600/20 flex items-center justify-center">
                                    {findPlayerPhotoByName(team.names[0], members) ? (
                                      <Image
                                        src={findPlayerPhotoByName(team.names[0], members)!}
                                        alt={team.names[0]}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                        {team.names[0].charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                  <Avatar className="h-6 w-6 border-2 border-gray-800 bg-yellow-600/20 flex items-center justify-center">
                                    {findPlayerPhotoByName(team.names[1], members) ? (
                                      <Image
                                        src={findPlayerPhotoByName(team.names[1], members)!}
                                        alt={team.names[1]}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                        {team.names[1].charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium">{team.value.toFixed(2)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Bestehend: Ø Weispunkte (Spiel) für Teams */}
                    <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
                      <div className="flex items-center border-b border-gray-700/50 px-4 py-3">
                        <div className="w-1 h-6 bg-yellow-500 rounded-r-md mr-3"></div>
                        <h3 className="text-base font-semibold text-white">Ø Weispunkte (Spiel)</h3>
                      </div>
                      <div className="p-4 space-y-2 max-h-[calc(10*2.5rem)] overflow-y-auto pr-2">
                        {groupStats?.teamWithMostWeisPointsAvg && groupStats.teamWithMostWeisPointsAvg.length > 0 ? (
                          groupStats.teamWithMostWeisPointsAvg.map((team, index) => (
                            <div key={index} className="flex justify-between items-center px-2 py-1.5 rounded-md bg-gray-700/30">
                              <div className="flex items-center">
                                <span className="text-gray-400 min-w-5 mr-2">{index + 1}.</span>
                                <div className="flex -space-x-2 mr-2">
                                  <Avatar className="h-6 w-6 border-2 border-gray-800 bg-yellow-600/20 flex items-center justify-center">
                                    {findPlayerPhotoByName(team.names[0], members) ? (
                                      <Image
                                        src={findPlayerPhotoByName(team.names[0], members)!}
                                        alt={team.names[0]}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                        {team.names[0].charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                  <Avatar className="h-6 w-6 border-2 border-gray-800 bg-yellow-600/20 flex items-center justify-center">
                                    {findPlayerPhotoByName(team.names[1], members) ? (
                                      <Image
                                        src={findPlayerPhotoByName(team.names[1], members)!}
                                        alt={team.names[1]}
                                        width={24}
                                        height={24}
                                        className="rounded-full object-cover"
                                      />
                                    ) : (
                                      <AvatarFallback className="bg-gray-700 text-gray-300 text-xs">
                                        {team.names[1].charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    )}
                                  </Avatar>
                                </div>
                                <span className="text-gray-300">{team.names.join(' & ')}</span>
                              </div>
                              <span className="text-white font-medium">{team.value.toFixed(1)}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2">Keine Daten verfügbar</div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
          </TabsContent>

            <TabsContent value="archive">
            {sessionsError && !sessionsLoading && !tournamentsLoading && combinedArchiveItems.length === 0 && (
                <div className="text-center text-gray-400 py-6 px-4 bg-gray-800/30 rounded-md">
                    <Archive size={32} className="mx-auto mb-3 text-gray-500" />
                    <p className="font-semibold text-gray-300">Keine Einträge im Archiv</p>
                    <p className="text-sm">Abgeschlossene Partien und Turniere werden hier angezeigt.</p>
                </div>
            )}
             {(sessionsLoading || tournamentsLoading) && (!sessionsError && !tournamentsError) && (
              <div className="flex justify-center items-center py-10">
                <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-white animate-spin"></div>
                <span className="ml-3 text-gray-300">Lade Archiv...</span>
              </div>
            )}
            {!sessionsLoading && !tournamentsLoading && combinedArchiveItems.length > 0 && (
              <div className="space-y-4">
                {sortedYears.map(year => (
                  <div key={year}>
                    <h3 className="text-lg font-semibold text-white mb-2 sticky top-0 bg-gray-900 py-1 z-10">{year}</h3>
                    <div className="space-y-2">
                      {groupedArchiveByYear[year].map(renderArchiveItem)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

            <TabsContent value="members">
              {membersError && !membersLoading && (
                <div className="text-red-400 text-sm text-center p-4 bg-red-900/30 rounded-md">
                  Fehler: {membersError}
                </div>
              )}
              <GroupMemberList members={members} isLoading={membersLoading} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default GroupView; 