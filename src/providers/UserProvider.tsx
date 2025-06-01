"use client";

import React, {createContext, useContext, useEffect, useState, ReactNode} from "react";
import {auth} from "@/services/firebaseInit";
import {useAuthStore} from "@/store/authStore";
import {getPlayerByUserId} from "@/services/playerService";
import {FirestorePlayer} from "@/types/jass";
import type {AuthUser} from "@/types/auth";

// Typ hier lokal definieren, aber mit dem internen AuthUser
interface UserContextType {
  user: AuthUser | null;
  player: FirestorePlayer | null;
  loading: boolean;
}

// User-Kontext erstellen
const UserContext = createContext<UserContextType>({
  user: null,
  player: null,
  loading: true,
});

export const useUser = () => useContext(UserContext);

export function UserProvider({children}: { children: React.ReactNode }) {
  const {user: authUser, status, error, appMode} = useAuthStore();
  const [player, setPlayer] = useState<FirestorePlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Effekt, um den verknüpften Spieler zu laden, wenn der AuthUser sich ändert
  useEffect(() => {
    const loadPlayer = async () => {
      setIsLoading(true);
      setPlayerError(null);

      try {
        if (authUser && appMode === "online") {
          const playerData = await getPlayerByUserId(authUser.uid);
          setPlayer(playerData);
        } else {
          setPlayer(null);
        }
      } catch (err) {
        console.error("Fehler beim Laden des Spielers:", err);
        setPlayerError("Spieler konnte nicht geladen werden");
      } finally {
        setIsLoading(false);
      }
    };

    if (status === "authenticated" || status === "unauthenticated") {
      loadPlayer();
    }
  }, [authUser, status, appMode]);

  const value: UserContextType = {
    user: authUser,
    player,
    loading: status === "loading" || isLoading,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}
