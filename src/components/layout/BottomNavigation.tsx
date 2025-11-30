import {Home, MessageCircle, ClipboardList, User, Award, Info, BookOpen, HelpCircle} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/router";
import {cn} from "@/lib/utils";
import {useAuthStore} from "@/store/authStore";
import {useTournamentStore} from "@/store/tournamentStore";
import {useGroupStore} from "@/store/groupStore";
import { useMemo, useEffect } from "react";
import type { TournamentInstance } from "@/types/tournament";
import { Timestamp } from "firebase/firestore";

export function BottomNavigation() {
  const router = useRouter();
  const currentPath = router.pathname;
  const {isGuest, user} = useAuthStore();
  const {userGroups} = useGroupStore();
  
  const {
    userActiveTournamentId,
    userTournamentInstances,
    loadUserTournamentInstances,
    loadTournamentsForUserGroups,
    status: tournamentStoreStatus
  } = useTournamentStore();

  useEffect(() => {
    if (user && user.uid && tournamentStoreStatus === 'idle') {
      // ✅ NEU: Wenn Gruppen geladen sind, lade Turniere aus allen Gruppen
      // Dies ermöglicht, dass Turniere mit showInNavigation=true für alle Gruppenmitglieder sichtbar sind
      if (userGroups && userGroups.length > 0) {
        const groupIds = userGroups.map(g => g.id);
        // Lade Turniere aus allen Gruppen (inklusive solche mit showInNavigation=true)
        // Die Filterlogik in tournamentToDisplay berücksichtigt showInNavigation
        loadTournamentsForUserGroups(groupIds);
      } else if (userTournamentInstances.length === 0) {
        // Fallback: Alte Logik für den Fall, dass Gruppen noch nicht geladen sind
      loadUserTournamentInstances(user.uid);
      }
    }
  }, [user, tournamentStoreStatus, loadUserTournamentInstances, loadTournamentsForUserGroups, userGroups]);


  const baseNavigationItems = [
    {
      name: "Home",
      href: "/start",
      icon: Home,
      active: currentPath === "/start",
      itemTournamentStatus: null,
    },
    {
      name: "Profil",
      href: "/profile",
      icon: User,
      active: currentPath.startsWith("/profile"),
      itemTournamentStatus: null,
    },
    {
      name: "Jass-Wiki",
      href: "https://jasswiki.ch/",
      icon: BookOpen,
      active: false, // Nie aktiv, da externe Seite
      itemTournamentStatus: null,
      external: true, // Marker für externen Link
    },
  ];

  const tournamentToDisplay = useMemo(() => {
    if (userTournamentInstances && userTournamentInstances.length > 0) {
      // ✅ NEU: Filtere nur Turniere aus Gruppen, bei denen der User Mitglied ist
      // 🔧 FIX: Fallback zur alten Logik, wenn userGroups noch nicht geladen ist
      const userGroupIds = userGroups.map(g => g.id);
      const tournamentsInUserGroups = userGroupIds.length > 0 
        ? userTournamentInstances.filter(t => userGroupIds.includes(t.groupId))
        : userTournamentInstances; // Fallback: Zeige alle Turniere, wenn Gruppen noch nicht geladen
      
      // Wenn keine Turniere gefunden wurden, früh abbrechen
      if (tournamentsInUserGroups.length === 0) {
        return null;
      }
      
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7); // ✅ GEÄNDERT: 1 Woche statt 24 Stunden

      const relevantTournaments = tournamentsInUserGroups
        .filter(t => {
          // 1. Explizit ausgeblendet → nie anzeigen
          if (t.showInNavigation === false) {
            return false;
          }
          
          // 2. Explizit eingeblendet → immer anzeigen (außer archived), überschreibt 1-Wochen-Regel
          if (t.showInNavigation === true) {
            return t.status !== 'archived';
          }
          
          // 3. Standard-Verhalten (showInNavigation === undefined) → bisherige Logik mit 1-Wochen-Regel
          if (t.status === 'active' || t.status === 'upcoming') {
            return true;
          }
          if (t.status === 'completed') {
            // ✅ FIX: Fallback zu pausedAt oder finalizedAt, wenn completedAt fehlt
            let completedDate: Date;
            if (t.completedAt instanceof Timestamp) {
              completedDate = t.completedAt.toDate();
            } else if (typeof t.completedAt === 'number') {
              completedDate = new Date(t.completedAt);
            } else if (t.pausedAt instanceof Timestamp) {
              completedDate = t.pausedAt.toDate(); // Fallback zu pausedAt
            } else if (t.finalizedAt instanceof Timestamp) {
              completedDate = t.finalizedAt.toDate(); // Fallback zu finalizedAt
            } else {
              completedDate = new Date(0); // Worst-case Fallback
            }
            return completedDate >= oneWeekAgo; // ✅ GEÄNDERT: 1 Woche
          }
          return false;
        })
        .sort((a, b) => {
          // Priority 1: Active
          if (a.status === 'active' && b.status !== 'active') return -1;
          if (b.status === 'active' && a.status !== 'active') return 1;
          if (a.status === 'active' && b.status === 'active') {
             const dateA = a.instanceDate instanceof Timestamp ? a.instanceDate.toMillis() : (typeof a.instanceDate === 'number' ? a.instanceDate : Infinity);
             const dateB = b.instanceDate instanceof Timestamp ? b.instanceDate.toMillis() : (typeof b.instanceDate === 'number' ? b.instanceDate : Infinity);
             return dateA - dateB; // Earliest active first (though usually only one active)
          }

          // Priority 2: Upcoming
          if (a.status === 'upcoming' && b.status !== 'upcoming') return -1;
          if (b.status === 'upcoming' && a.status !== 'upcoming') return 1;
          if (a.status === 'upcoming' && b.status === 'upcoming') {
            const dateA = a.instanceDate instanceof Timestamp ? a.instanceDate.toMillis() : (typeof a.instanceDate === 'number' ? a.instanceDate : Infinity);
            const dateB = b.instanceDate instanceof Timestamp ? b.instanceDate.toMillis() : (typeof b.instanceDate === 'number' ? b.instanceDate : Infinity);
            return dateA - dateB; // Earliest upcoming first
          }
          
          // Priority 3: Recently Completed (within 1 week)
          if (a.status === 'completed' && b.status === 'completed') {
            // ✅ FIX: Fallback zu pausedAt oder finalizedAt, wenn completedAt fehlt
            const getCompletedMillis = (t: typeof a): number => {
              if (t.completedAt instanceof Timestamp) return t.completedAt.toMillis();
              if (typeof t.completedAt === 'number') return t.completedAt;
              if (t.pausedAt instanceof Timestamp) return t.pausedAt.toMillis();
              if (t.finalizedAt instanceof Timestamp) return t.finalizedAt.toMillis();
              return 0;
            };
            
            const dateA = getCompletedMillis(a);
            const dateB = getCompletedMillis(b);
            return dateB - dateA; // Most recently completed first
          }
          
          return 0; // Should not happen if filter is correct
        });

      if (relevantTournaments.length > 0) {
        return relevantTournaments[0];
      }
    }
    // Fallback for userActiveTournamentId if instances are not loaded yet but an ID is set
    // This helps if `userActiveTournamentId` is set by another mechanism before `userTournamentInstances` is populated.
    if (userActiveTournamentId && (!userTournamentInstances || userTournamentInstances.length === 0)) {
        // Attempt to find it in the list if it becomes available, otherwise use placeholder
        const foundInInstances = userTournamentInstances.find(t => t.id === userActiveTournamentId);
        if (foundInInstances) return foundInInstances;
        // It's better to assume its status based on it being 'userActiveTournamentId'
        return { id: userActiveTournamentId, status: 'active', name: 'Turnier' } as TournamentInstance;
    }
    return null;
  }, [userActiveTournamentId, userTournamentInstances, userGroups]);

  let finalNavigationItems;

  if (tournamentToDisplay) {
    const tournamentItem = {
      name: "Turnier",
      href: `/view/tournament/${tournamentToDisplay.id}`,
      icon: Award,
      active: currentPath.startsWith(`/view/tournament/${tournamentToDisplay.id}`),
      itemTournamentStatus: tournamentToDisplay.status,
    };
    finalNavigationItems = [
      baseNavigationItems[0],
      tournamentItem,
      baseNavigationItems[1],
      baseNavigationItems[2],
    ];
  } else {
    const supportItem = {
      name: "Hilfe",
      href: "/support",
      icon: HelpCircle,
      active: currentPath.startsWith("/support"),
      itemTournamentStatus: null,
    };
    finalNavigationItems = [
      baseNavigationItems[0],
      baseNavigationItems[1],
      baseNavigationItems[2],
      supportItem,
    ];
  }

  // Navigation ausblenden auf WelcomeScreen (/, /join) und Auth-Seiten (/auth/*)
  const hideNavigation = isGuest || 
                         currentPath.startsWith("/jass") || 
                         currentPath === "/" || 
                         currentPath === "/join" || 
                         currentPath.startsWith("/auth/");

  if (hideNavigation) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 z-50 bg-gray-900 border-t border-gray-800 h-24 max-w-3xl w-full">
      <div className="w-full flex justify-around items-center h-full px-4 pb-safe pb-8">
        {finalNavigationItems.map((item) => (
          item.external ? (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1",
                "text-sm font-medium transition-colors",
                "text-gray-400 hover:text-gray-300"
              )}
            >
              <item.icon size={24} className={cn(
                item.itemTournamentStatus === 'active' ? "text-green-400" :
                item.itemTournamentStatus === 'upcoming' ? "text-yellow-500" :
                item.itemTournamentStatus === 'completed' ? "text-purple-400" : ""
              )} />
              <span className="text-xs">{item.name}</span>
            </a>
          ) : (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full space-y-1",
                "text-sm font-medium transition-colors",
                item.active && item.itemTournamentStatus === 'active' ? "text-green-400" :
                item.active && item.itemTournamentStatus === 'upcoming' ? "text-yellow-500" :
                item.active && item.itemTournamentStatus === 'completed' ? "text-purple-400" :
                item.active ? "text-blue-400" :
                "text-gray-400 hover:text-gray-300"
              )}
            >
              <item.icon size={24} className={cn(
                 item.name === "Turnier" && item.itemTournamentStatus === 'active' ? "text-green-400" :
                 item.name === "Turnier" && item.itemTournamentStatus === 'upcoming' ? "text-yellow-500" :
                 item.name === "Turnier" && item.itemTournamentStatus === 'completed' ? "text-purple-400" :
                 item.active && item.itemTournamentStatus === null ? "text-blue-400" :
                 "text-gray-400"
              )} />
              <span className={cn(
                "text-xs",
                item.name === "Turnier" && item.itemTournamentStatus === 'active' ? "text-green-400" :
                item.name === "Turnier" && item.itemTournamentStatus === 'upcoming' ? "text-yellow-500" :
                item.name === "Turnier" && item.itemTournamentStatus === 'completed' ? "text-purple-400" :
                item.active && item.itemTournamentStatus === null ? "text-blue-400" :
                item.active ? "text-blue-400" : "text-gray-400"
              )}>{item.name}</span>
            </Link>
          )
        ))}
      </div>
    </nav>
  );
}
