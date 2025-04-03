"use client";

import React, {createContext, useContext, useEffect, useState} from "react";
import {useAuthStore} from "@/store/authStore";
import {getPlayerByUserId} from "@/services/playerService";
import {FirestorePlayer, UserContext as UserContextType} from "@/types/jass";

// User-Kontext erstellen
const UserContext = createContext<UserContextType>({
  authUser: null,
  player: null,
  isLoading: true,
  error: null,
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
        // Wenn Online-Modus aktiv und Benutzer authentifiziert ist
        if (authUser && appMode === "online") {
          const playerData = await getPlayerByUserId(authUser.uid);
          setPlayer(playerData);
        } else {
          // Im Offline-Modus oder wenn nicht authentifiziert, setzen wir keinen Player
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
    authUser,
    player,
    isLoading: status === "loading" || isLoading,
    error: error || playerError,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}
