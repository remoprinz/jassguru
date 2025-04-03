// src/store/groupStore.ts
import {create} from "zustand";
import {FirestoreGroup} from "../types/group";
import {useAuthStore} from "./authStore";
import {updateUserDocument} from "../services/authService";
import {getUserGroups} from "../services/groupService";
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
  // setLoading entfernt, Status direkt setzen
  setError: (error: string | null) => void;
  clearError: () => void;
  resetGroupStore: () => void;
  updateGroupInList: (groupId: string, updateData: Partial<FirestoreGroup>) => void;
  updateGroup: (groupId: string, updates: Partial<FirestoreGroup>) => Promise<void>;
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
    if (!userId) {
      console.warn("GROUP_STORE: loadUserGroups called without userId.");
      set({userGroups: [], status: "idle"});
      return;
    }
    console.log(`GROUP_STORE: Loading groups for user ${userId}...`);
    set({status: "loading", error: null}); // Status direkt setzen
    try {
      const groups = await getUserGroups(userId);
      console.log(`GROUP_STORE: Found ${groups.length} groups for user ${userId}.`);
      const currentGroup = get().currentGroup;
      const currentGroupStillExists = currentGroup && groups.some((g) => g.id === currentGroup.id);

      // Status nach Erfolg IMMER auf 'success' setzen
      set({
        userGroups: groups,
        currentGroup: currentGroupStillExists ? currentGroup : null,
        status: "success", // <-- KORRIGIERT
        error: null,
      });

      if (currentGroup && !currentGroupStillExists) {
        console.warn(`GROUP_STORE: Current group ${currentGroup.id} no longer exists for user ${userId}. Clearing lastActiveGroupId.`);
        updateUserDocument(userId, {lastActiveGroupId: null}).catch((err) => {
          console.error("GROUP_STORE: Failed to clear lastActiveGroupId after current group became invalid:", err);
        });
      }
    } catch (error) {
      console.error(`GROUP_STORE: Failed to load groups for user ${userId}:`, error);
      set({status: "error", error: "Fehler beim Laden der Gruppen.", userGroups: []}); // Status direkt setzen
    }
  },
  // setLoading entfernt
  setError: (error) => set({status: "error", error}),
  clearError: () => set({error: null}), // Status bleibt error, bis neu geladen wird
  resetGroupStore: () => {
    console.log("GROUP_STORE: Resetting group store...");
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
}));

// Optional: Selektoren für häufig verwendeten Zustand
export const selectCurrentGroup = (state: GroupStore) => state.currentGroup;
export const selectUserGroups = (state: GroupStore) => state.userGroups;
export const selectGroupLoadingStatus = (state: GroupStore) => state.status;
