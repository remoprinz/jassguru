import {Home, MessageCircle, ClipboardList, User, Award, Info, BookOpen} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/router";
import {cn} from "@/lib/utils";
import {useAuthStore} from "@/store/authStore";
import {useTournamentStore} from "@/store/tournamentStore";
import { useMemo, useEffect } from "react";
import type { TournamentInstance } from "@/types/tournament";
import { Timestamp } from "firebase/firestore";

export function BottomNavigation() {
  const router = useRouter();
  const currentPath = router.pathname;
  const {isGuest, user} = useAuthStore();
  
  const {
    userActiveTournamentId,
    userTournamentInstances,
    loadUserTournamentInstances,
    status: tournamentStoreStatus
  } = useTournamentStore();

  useEffect(() => {
    if (user && user.uid && tournamentStoreStatus === 'idle' && userTournamentInstances.length === 0) {
      loadUserTournamentInstances(user.uid);
    }
  }, [user, tournamentStoreStatus, loadUserTournamentInstances, userTournamentInstances.length]);


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
      href: "/wissen",
      icon: BookOpen,
      active: currentPath.startsWith("/wissen"),
      itemTournamentStatus: null,
    },
  ];

  const tournamentToDisplay = useMemo(() => {
    if (userTournamentInstances && userTournamentInstances.length > 0) {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1); // ✅ GEÄNDERT: Nur 24 Stunden statt 7 Tage

      const relevantTournaments = userTournamentInstances
        .filter(t => {
          if (t.status === 'active' || t.status === 'upcoming') {
            return true;
          }
          if (t.status === 'completed') {
            const completedDate = t.completedAt instanceof Timestamp ? t.completedAt.toDate() : (typeof t.completedAt === 'number' ? new Date(t.completedAt) : new Date(0)); // Fallback for safety, use completedAt
            return completedDate >= oneDayAgo; // ✅ GEÄNDERT: Nur 24 Stunden
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
          
          // Priority 3: Recently Completed (within 24 hours)
          if (a.status === 'completed' && b.status === 'completed') {
            const dateA = a.completedAt instanceof Timestamp ? a.completedAt.toMillis() : (typeof a.completedAt === 'number' ? a.completedAt : 0);
            const dateB = b.completedAt instanceof Timestamp ? b.completedAt.toMillis() : (typeof b.completedAt === 'number' ? b.completedAt : 0);
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
  }, [userActiveTournamentId, userTournamentInstances]);

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
    const infoItem = {
      name: "Info",
      href: "/features",
      icon: Info,
      active: currentPath === "/features",
      itemTournamentStatus: null,
    };
    finalNavigationItems = [
      baseNavigationItems[0],
      baseNavigationItems[1],
      baseNavigationItems[2],
      infoItem,
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
