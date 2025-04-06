// src/store/groupStore.ts
import {create} from "zustand";
import {FirestoreGroup} from "../types/group";
import {useAuthStore} from "./authStore";
import {updateUserDocument} from "../services/authService";
import {getUserGroups, getUserGroupsByPlayerId, updateGroupMemberRole} from "../services/groupService";
import {doc, updateDoc, serverTimestamp} from "firebase/firestore";
import {db} from "../services/firebaseInit";
import {GROUPS_COLLECTION} from "../constants/firestore";

// Statusnamen angepasst (loaded -> success)
type GroupLoadingStatus = "idle" | "loading" | "success" | "error";

interface GroupState {
  currentGroup: FirestoreGroup | null;
  userGroups: FirestoreGroup[];
  status: GroupLoadingStatus;
  error: string | null;
  // 'loading' boolean entfernt, da durch 'status' abgedeckt
}

interface GroupActions {
  setCurrentGroup: (group: FirestoreGroup | null) => void;
  setUserGroups: (groups: FirestoreGroup[]) => void;
  loadUserGroups: (userId: string) => Promise<void>;
  loadUserGroupsByPlayerId: (playerId: string) => Promise<void>;
  // setLoading entfernt, Status direkt setzen
  setError: (error: string | null) => void;
  clearError: () => void;
  resetGroupStore: () => void;
  updateGroupInList: (groupId: string, updateData: Partial<FirestoreGroup>) => void;
  updateGroup: (groupId: string, updates: Partial<FirestoreGroup>) => Promise<void>;
  addUserGroup: (group: FirestoreGroup) => void;
  updateMemberRole: (targetPlayerId: string, newRole: 'admin' | 'member') => Promise<void>;
}

type GroupStore = GroupState & GroupActions;

const initialState: GroupState = {
  currentGroup: null,
  userGroups: [],
  status: "idle", // Startet als idle
  error: null,
};

export const useGroupStore = create<GroupStore>((set, get) => ({
  ...initialState,

  setCurrentGroup: (group) => {
    const oldGroupId = get().currentGroup?.id;
    console.log("GROUP_STORE: setCurrentGroup wird ausgeführt. Alte ID:", oldGroupId ?? "undefined", "Neue ID:", group?.id ?? "null");
    // Setzt currentGroup, Status bleibt unberührt (oder auf success setzen?)
    set({currentGroup: group, error: null});
  },
  setUserGroups: (groups) => set({userGroups: groups}),
  loadUserGroups: async (userId: string) => {
    console.warn("GROUP_STORE: Deprecated loadUserGroups(userId) called. Use loadUserGroupsByPlayerId instead.");
    // Hier könnte man versuchen, die playerId zu holen und dann die neue Funktion aufzurufen,
    // aber einfacher ist es, den Aufrufer (initAuth) anzupassen, was wir getan haben.
    // Vorerst einfach nichts tun oder leere Liste setzen?
    set({ status: "idle", userGroups: [], error: "Deprecated function called" });
    // Original-Implementierung lassen wir vorerst auskommentiert:
    /*
    if (!userId) { ... }
    set({status: "loading", error: null});
    try {
      const groups = await getUserGroups(userId);
      set({
        userGroups: groups,
        status: "success",
        error: null,
      });
    } catch (error) {
      set({status: "error", error: "Fehler beim Laden der Gruppen.", userGroups: []});
    }
    */
  },
  loadUserGroupsByPlayerId: async (playerId: string) => {
    if (!playerId) {
        console.error("GROUP_STORE: loadUserGroupsByPlayerId called without playerId!");
        set({ userGroups: [], status: "error", error: "Player-ID fehlt." });
        return;
    }
    set({ status: "loading", error: null });
    try {
        const groups = await getUserGroupsByPlayerId(playerId); // Neue Service-Funktion

        const oldState = get();
        const currentGroup = oldState.currentGroup;
        const currentGroupStillExists = currentGroup && groups.some((g: FirestoreGroup) => g.id === currentGroup.id);

        set({
            userGroups: groups,
            currentGroup: currentGroupStillExists ? currentGroup : null,
            status: "success",
            error: null,
        });
        const newState = get();

        // Logik zum Bereinigen der lastActiveGroupId bleibt (angepasst an playerId)
        if (currentGroup && !currentGroupStillExists) {
            const userId = useAuthStore.getState().user?.uid; // userId holen
            if (userId) {
                 console.warn(`GROUP_STORE: Current group ${currentGroup.id} no longer exists for player ${playerId}. Clearing lastActiveGroupId for user ${userId}.`);
                 updateUserDocument(userId, { lastActiveGroupId: null }).catch((err) => {
                   console.error("GROUP_STORE: Failed to clear lastActiveGroupId after current group became invalid:", err);
                 });
            } else {
                 console.warn(`GROUP_STORE: Current group ${currentGroup.id} no longer exists for player ${playerId}, but couldn't get userId to clear lastActiveGroupId.`);
            }
        }

    } catch (error) {
        console.error(`GROUP_STORE: Failed to load groups for playerId ${playerId}:`, error);
        set({ status: "error", error: "Fehler beim Laden der Gruppen.", userGroups: [] });
    }
  },
  // setLoading entfernt
  setError: (error) => set({status: "error", error}),
  clearError: () => set({error: null}), // Status bleibt error, bis neu geladen wird
  resetGroupStore: () => {
    const {user} = useAuthStore.getState(); // Check if user is logged in
    if (user) {
      // Optional: Update lastActiveGroupId to null in Firestore on reset?
      // Consider if this is desired behavior.
      // updateUserDocument(user.uid, { lastActiveGroupId: null });
    }
    set(initialState);
  },

  // NEUE FUNKTION: Aktualisiert Daten für eine Gruppe in der userGroups-Liste
  updateGroupInList: (groupId, updateData) => {
    set((state) => {
      const groupIndex = state.userGroups.findIndex((g) => g.id === groupId);
      if (groupIndex !== -1) {
        const updatedGroups = [...state.userGroups];
        // Führe Update durch und stelle sicher, dass das Objekt FirestoreGroup entspricht
        const updatedGroup = {
          ...updatedGroups[groupIndex],
          ...updateData,
        } as FirestoreGroup; // Type Assertion hier sinnvoll
        updatedGroups[groupIndex] = updatedGroup;

        // Wenn die aktualisierte Gruppe die aktuelle ist, auch currentGroup updaten
        const newCurrentGroup = state.currentGroup?.id === groupId ?
          updatedGroup : // Verwende das bereits aktualisierte Objekt
          state.currentGroup;

        console.log(`GROUP_STORE: Updated group ${groupId} in list with data:`, updateData);
        return {userGroups: updatedGroups, currentGroup: newCurrentGroup};
      } else {
        // Optional: Wenn die Gruppe nicht in der Liste ist (sollte nicht passieren),
        // könnte man sie hinzufügen oder einen Fehler loggen.
        console.warn(`GROUP_STORE: updateGroupInList: Gruppe ${groupId} nicht in userGroups gefunden zum Aktualisieren.`);
        return {}; // Keine Änderung
      }
    });
  },

  updateGroup: async (groupId: string, updates: Partial<FirestoreGroup>) => {
    if (!db) throw new Error("Firestore ist nicht initialisiert.");

    try {
      const groupRef = doc(db, GROUPS_COLLECTION, groupId);
      await updateDoc(groupRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      // Aktualisiere den Store
      const currentGroup = get().currentGroup;
      if (currentGroup?.id === groupId) {
        set({currentGroup: {...currentGroup, ...updates}});
      }

      // Aktualisiere die Gruppe in der Liste
      get().updateGroupInList(groupId, updates);
    } catch (error) {
      console.error("Fehler beim Aktualisieren der Gruppe:", error);
      throw new Error("Gruppe konnte nicht aktualisiert werden.");
    }
  },

  // NEUE AKTION: Fügt eine einzelne Gruppe zur Liste hinzu (falls nicht schon vorhanden)
  addUserGroup: (group: FirestoreGroup) => {
    const currentGroups = get().userGroups;
    if (!currentGroups.some((g) => g.id === group.id)) {
      set({userGroups: [...currentGroups, group]});
    }
  },

  // NEUE AKTION: Aktualisiert die Rolle eines Mitglieds
  updateMemberRole: async (targetPlayerId: string, newRole: 'admin' | 'member') => {
    const { currentGroup } = get();
    const { user } = useAuthStore.getState(); // Holen des AuthUser Objekts

    if (!currentGroup) {
      console.error("GROUP_STORE: updateMemberRole - Keine aktive Gruppe ausgewählt.");
      throw new Error("Keine Gruppe ausgewählt.");
    }
    if (!user?.uid) {
      console.error("GROUP_STORE: updateMemberRole - Keine uid für den aktuellen Benutzer gefunden.");
      throw new Error("Aktueller Benutzer konnte nicht identifiziert werden.");
    }

    const requestingUserId = user.uid; // Hier user.uid statt playerId verwenden
    const groupId = currentGroup.id;

    set({ status: "loading", error: null });

    try {
      // Rufe die Service-Funktion auf, die jetzt die targetUserId zurückgibt
      const targetUserId = await updateGroupMemberRole(groupId, targetPlayerId, newRole, requestingUserId);

      // Erfolgsfall - Aktualisiere den lokalen Store manuell
      set((state) => {
        if (!state.currentGroup) return {}; // Sollte nicht passieren, aber sicher ist sicher

        let updatedAdminIds = [...(state.currentGroup.adminIds || [])];
        if (newRole === 'admin' && !updatedAdminIds.includes(targetUserId)) {
          updatedAdminIds.push(targetUserId);
        } else if (newRole === 'member' && updatedAdminIds.includes(targetUserId)) {
          updatedAdminIds = updatedAdminIds.filter(id => id !== targetUserId);
        }

        const updatedGroup = {
          ...state.currentGroup,
          adminIds: updatedAdminIds
        };
        
        console.log(`GROUP_STORE: Lokales currentGroup für ${groupId} aktualisiert. Neue AdminIds:`, updatedAdminIds);

        // Aktualisiere auch die Gruppe in der userGroups-Liste
        const groupIndex = state.userGroups.findIndex(g => g.id === groupId);
        const updatedUserGroups = [...state.userGroups];
        if (groupIndex !== -1) {
            updatedUserGroups[groupIndex] = updatedGroup;
        }

        return { 
            currentGroup: updatedGroup, 
            userGroups: updatedUserGroups,
            status: "success", 
            error: null 
        };
      });

      console.log(`GROUP_STORE: updateMemberRole - Rolle für Spieler ${targetPlayerId} (User ${targetUserId}) in Gruppe ${groupId} erfolgreich auf ${newRole} gesetzt.`);
    } catch (error) {
      console.error(`GROUP_STORE: updateMemberRole - Fehler beim Aktualisieren der Rolle für ${targetPlayerId}:`, error);
      const errorMessage = error instanceof Error ? error.message : "Rollenaktualisierung fehlgeschlagen.";
      set({ status: "error", error: errorMessage });
      throw error; // Fehler weiterwerfen für UI-Behandlung
    }
  },
}));

// Optional: Selektoren für häufig verwendeten Zustand
export const selectCurrentGroup = (state: GroupStore) => state.currentGroup;
export const selectUserGroups = (state: GroupStore) => state.userGroups;
export const selectGroupLoadingStatus = (state: GroupStore) => state.status;
