// src/store/groupStore.ts
import { create, StoreApi, StateCreator } from "zustand";
import { devtools, persist, createJSONStorage, PersistOptions, DevtoolsOptions } from "zustand/middleware";
// import { FirestoreGroup } from "../types/group"; 
import { useAuthStore } from "./authStore";
import { updateUserDocument } from "../services/authService";
import { getUserGroupsByPlayerId, updateGroupMemberRole, getGroupById, updateGroupSettings as updateGroupSettingsService } from "../services/groupService";
import { doc, updateDoc, serverTimestamp, onSnapshot, Unsubscribe, FirestoreError, getDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { db } from "../services/firebaseInit";
import { DEFAULT_FARBE_SETTINGS } from "@/config/FarbeSettings";
import { produce } from "immer";
import type { // Verwende 'type' für reine Typ-Importe
  FirestoreGroup, // Stelle sicher, dass dieser Import existiert und korrekt ist
  FarbeSettings as JassFarbeSettings, 
  FirestorePlayer, 
  ScoreSettings,
  StrokeSettings,
  CardStyle
} from '@/types/jass'; // Import aus der zentralen Datei
import { DEFAULT_SCORE_SETTINGS, DEFAULT_STROKE_SETTINGS } from '../config/ScoreSettings';
import { Timestamp } from 'firebase/firestore';

// Statusnamen angepasst (loaded -> success)
type GroupLoadingStatus = "idle" | "loading" | "success" | "error";

// Definiere den Typ für currentGroup basierend auf dem importierten FirestoreGroup
type CurrentGroupType = (FirestoreGroup & { id: string; updatedAt?: Date | Timestamp });

interface Group extends FirestoreGroup {
  scoreSettings?: ScoreSettings;
  strokeSettings?: StrokeSettings;
  farbeSettings?: Omit<JassFarbeSettings, 'isFlipped'>;
}

interface GroupState {
  currentGroupId: string | null;
  currentGroup: Group | null;
  userGroups: FirestoreGroup[]; // Verwende den importierten Typ
  status: GroupLoadingStatus;
  error: string | null;
  _currentGroupListenerUnsubscribe: Unsubscribe | null;
  updateCurrentGroupScoreSettings: (groupId: string, settings: ScoreSettings) => Promise<void>;
  updateCurrentGroupStrokeSettings: (groupId: string, settings: StrokeSettings) => Promise<void>;
  updateCurrentGroupFarbeSettings: (groupId: string, settings: Omit<JassFarbeSettings, 'isFlipped' | 'cardStyle'>) => Promise<void>;
  updateCurrentGroupCardStyle: (groupId: string, cardStyle: CardStyle) => Promise<void>;
}

interface GroupActions {
  setCurrentGroup: (group: Group | null) => void; // Verwende den lokalen Typ
  setUserGroups: (groups: FirestoreGroup[]) => void; // Verwende den importierten Typ
  loadUserGroups: (userId: string) => Promise<void>;
  loadUserGroupsByPlayerId: (playerId: string) => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
  resetGroupStore: () => void;
  updateGroupInList: (groupId: string, updateData: Partial<FirestoreGroup>) => void; // Verwende den importierten Typ
  updateGroup: (groupId: string, data: Partial<Omit<FirestoreGroup, 'id' | 'playerIds' | 'adminIds'>>) => Promise<void>; // Verwende den importierten Typ
  addUserGroup: (group: FirestoreGroup) => void; // Verwende den importierten Typ
  updateMemberRole: (playerId: string, role: 'admin' | 'member') => Promise<void>;
  _cleanupCurrentGroupListener: () => void;
  fetchCurrentGroup: (groupId: string) => Promise<void>;
  updateCurrentGroupFarbeSettings: (groupId: string, newFarbeSettings: Omit<JassFarbeSettings, 'isFlipped'>) => Promise<void>;
  updateCurrentGroupScoreSettings: (groupId: string, newScoreSettings: ScoreSettings) => Promise<void>;
  updateCurrentGroupStrokeSettings: (groupId: string, newStrokeSettings: StrokeSettings) => Promise<void>;
  updateCurrentGroupCardStyle: (groupId: string, cardStyle: CardStyle) => Promise<void>;
  loadGroup: (groupId: string) => Promise<void>;
  leaveGroup: (groupId: string, userId: string) => Promise<void>;
  subscribeToGroup: (groupId: string) => void;
  unsubscribeFromGroup: () => void;
  setCurrentGroupId: (groupId: string | null) => void;
  clearGroupState: () => void;
  isCurrentUserAdmin: (groupId?: string) => boolean;
}

type GroupStore = GroupState & GroupActions;

// Define type for the persisted part of the state
type PersistedState = {
  currentGroupId: string | null;
  userGroups: FirestoreGroup[];
};

const initialState: GroupState = {
  currentGroupId: null,
  currentGroup: null,
  userGroups: [],
  status: "idle", // Startet als idle
  error: null,
  _currentGroupListenerUnsubscribe: null,
  updateCurrentGroupScoreSettings: async (groupId, settings) => {
    // Implementation needed
  },
  updateCurrentGroupStrokeSettings: async (groupId, settings) => {
    // Implementation needed
  },
  updateCurrentGroupFarbeSettings: async (groupId, settings) => {
    // Implementation needed
  },
  updateCurrentGroupCardStyle: async (groupId, cardStyle) => {
    // Implementation needed
  },
};

const groupStoreCreator: StateCreator<
  GroupStore,
  [["zustand/devtools", never], ["zustand/persist", unknown]],
  [],
  GroupStore
> = (set, get) => ({
  ...initialState,

  _cleanupCurrentGroupListener: () => {
    const unsubscribe = get()._currentGroupListenerUnsubscribe;
    if (unsubscribe) {
      console.log("GROUP_STORE: Unsubscribing from current group listener.");
      unsubscribe();
      set({ _currentGroupListenerUnsubscribe: null }, false, 'cleanupListener');
    }
  },

  setCurrentGroup: (group) => {
    const currentListener = get()._currentGroupListenerUnsubscribe;
    if (currentListener) {
      currentListener(); // Alten Listener stoppen
    }

    if (group === null) {
      // === Block nun entfernt, da Logik in JassKreidetafel.tsx ===
      return; 
    }
    
    console.log(`GROUP_STORE: Setting current group to ${group.id} and attaching listener.`);
    const groupRef = doc(db, 'groups', group.id);
    
    const unsubscribe = onSnapshot(groupRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const rawData = docSnap.data();
          const farbeSettings = rawData.farbeSettings ?? DEFAULT_FARBE_SETTINGS;
          const updatedGroupData = { id: docSnap.id, ...rawData, farbeSettings } as FirestoreGroup;
          
          console.log(`GROUP_STORE: Snapshot received for current group ${group.id}. Updating state.`);
          if (get().currentGroup?.id === group.id) {
             set({ currentGroup: updatedGroupData as any, status: "success", error: null }, false, 'onSnapshotUpdate');
             get().updateGroupInList(group.id, updatedGroupData);
          }
        } else {
          console.warn(`GROUP_STORE: Current group ${group.id} snapshot indicates it was deleted.`);
          if (get().currentGroup?.id === group.id) {
            set({ currentGroup: null, status: "idle", error: "Ausgewählte Gruppe wurde gelöscht." }, false, 'onSnapshotDelete');
            get()._cleanupCurrentGroupListener();
          }
        }
      },
      (error: FirestoreError) => {
        console.error(`GROUP_STORE: Error in onSnapshot listener for group ${group.id}:`, error);
        if (get().currentGroup?.id === group.id) {
           set({ status: "error", error: "Fehler beim Empfangen von Gruppen-Updates." }, false, 'onSnapshotError');
        }
        get()._cleanupCurrentGroupListener();
      }
    );
    
    const groupWithDefaults = {
        ...group,
        farbeSettings: group.farbeSettings ?? DEFAULT_FARBE_SETTINGS,
        scoreSettings: group.scoreSettings ?? DEFAULT_SCORE_SETTINGS,
        strokeSettings: group.strokeSettings ?? DEFAULT_STROKE_SETTINGS,
    };
    set({ currentGroup: groupWithDefaults, _currentGroupListenerUnsubscribe: unsubscribe, status: "success", error: null }, false, 'setCurrentGroup');
    
    const userId = useAuthStore.getState().user?.uid;
    if (userId) {
      updateUserDocument(userId, { lastActiveGroupId: group.id }).catch(err => {
        console.error(`GROUP_STORE: Failed to update lastActiveGroupId to ${group.id} for user ${userId}:`, err);
      });
    }
  },

  setUserGroups: (groups: FirestoreGroup[]) => set({
      userGroups: groups.map(g => ({...g, farbeSettings: g.farbeSettings ?? DEFAULT_FARBE_SETTINGS }))
  }, false, 'setUserGroups'),

  loadUserGroups: async (userId: string) => {
    console.warn("GROUP_STORE: Deprecated loadUserGroups(userId) called. Use loadUserGroupsByPlayerId instead.");
    set({ status: "idle", userGroups: [], error: "Deprecated function called" }, false, 'loadUserGroups');
  },

  loadUserGroupsByPlayerId: async (playerId: string) => {
    if (!playerId) {
        console.error("GROUP_STORE: loadUserGroupsByPlayerId called without playerId!");
        set({ userGroups: [], status: "error", error: "Player-ID fehlt." }, false, 'loadGroupsByPlayerIdError');
        return;
    }
    set({ status: "loading", error: null }, false, 'loadGroupsByPlayerIdStart');
    try {
        const groups = await getUserGroupsByPlayerId(playerId);
        const groupsWithDefaults = groups.map(g => ({
          ...g,
          farbeSettings: g.farbeSettings ?? DEFAULT_FARBE_SETTINGS
        }));
        const oldState = get();
        const currentGroup = oldState.currentGroup;
        const currentGroupStillExists = currentGroup && groupsWithDefaults.some((g: FirestoreGroup) => g.id === currentGroup.id);
        set({
            userGroups: groupsWithDefaults,
            currentGroup: currentGroupStillExists ? currentGroup : null,
            status: "success",
            error: null,
        }, false, 'loadGroupsByPlayerIdSuccess');
        if (currentGroup && !currentGroupStillExists) {
            const userId = useAuthStore.getState().user?.uid;
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
        set({ status: "error", error: "Fehler beim Laden der Gruppen.", userGroups: [] }, false, 'loadGroupsByPlayerIdFail');
    }
  },

  fetchCurrentGroup: async (groupId: string) => {
    set({ status: "loading", error: null }, false, 'fetchCurrentGroupStart');
    try {
      const group = await getGroupById(groupId);
      get().setCurrentGroup(group as any);
      if (!group) {
        set({ status: "error", error: "Gruppe nicht gefunden" }, false, 'fetchCurrentGroupNotFound');
      }
    } catch (error) {
      console.error(`Fehler beim Abrufen der Gruppe ${groupId}:`, error);
      set({
        status: "error",
        error: error instanceof Error ? error.message : "Fehler beim Laden der Gruppe",
        currentGroup: null,
      }, false, 'fetchCurrentGroupFail');
    }
  },

  updateGroup: async (groupId: string, data: Partial<Omit<FirestoreGroup, 'id' | 'playerIds' | 'adminIds'>>) => {
    if (Object.keys(data).length === 0) {
       console.warn("updateGroup called without updatable fields.");
       return;
    }
    try {
      const groupRef = doc(db, 'groups', groupId);
      const updateData = { ...data, updatedAt: serverTimestamp() };
      await updateDoc(groupRef, updateData);
      get().updateGroupInList(groupId, data);
    } catch (error) {
      console.error(`Fehler beim Aktualisieren der Gruppe ${groupId}:`, error);
      const message = error instanceof Error ? error.message : "Update fehlgeschlagen";
      set({ error: message }, false, 'updateGroupFail');
      throw error; 
    }
  },
  
  updateCurrentGroupFarbeSettings: async (groupId: string, newFarbeSettings: Omit<JassFarbeSettings, 'isFlipped'>) => {
    console.log(`GROUP_STORE: Updating farbeSettings for group ${groupId}`);
    set({ status: "loading" }, false, 'updateCurrentGroupFarbeSettingsStart');
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        farbeSettings: newFarbeSettings,
        updatedAt: serverTimestamp()
      });

      set(
        produce((draft) => {
          if (draft.currentGroup && draft.currentGroup.id === groupId) {
            draft.currentGroup.farbeSettings = newFarbeSettings;
            draft.currentGroup.updatedAt = new Date() as any;
          }
          const groupIndex = draft.userGroups.findIndex((g) => g.id === groupId);
          if (groupIndex !== -1) {
            draft.userGroups[groupIndex].farbeSettings = newFarbeSettings;
            (draft.userGroups[groupIndex] as any).updatedAt = new Date();
          }
          draft.status = "idle";
        }), 
        false, 
        'updateCurrentGroupFarbeSettingsSuccess'
      );
      console.log(`GROUP_STORE: Successfully updated farbeSettings for group ${groupId}`);
    } catch (error) {
      console.error(`GROUP_STORE: Failed to update farbeSettings for group ${groupId}:`, error);
      set({ status: "error", error: "Fehler beim Speichern der Farbeinstellungen." }, false, 'updateCurrentGroupFarbeSettingsError');
      throw error;
    }
  },

  updateCurrentGroupScoreSettings: async (groupId: string, newScoreSettings: ScoreSettings) => {
    console.log(`GROUP_STORE: Updating scoreSettings for group ${groupId}`);
    set({ status: "loading" }, false, 'updateCurrentGroupScoreSettingsStart');
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        scoreSettings: newScoreSettings,
        updatedAt: serverTimestamp()
      });

      set(
        produce((draft) => {
           if (draft.currentGroup && draft.currentGroup.id === groupId) {
            draft.currentGroup.scoreSettings = newScoreSettings;
            draft.currentGroup.updatedAt = new Date() as any;
          }
          const groupIndex = draft.userGroups.findIndex((g) => g.id === groupId);
          if (groupIndex !== -1) {
            draft.userGroups[groupIndex].scoreSettings = newScoreSettings;
            (draft.userGroups[groupIndex] as any).updatedAt = new Date();
          }
           draft.status = "idle";
        }), 
        false, 
        'updateCurrentGroupScoreSettingsSuccess'
      );
      console.log(`GROUP_STORE: Successfully updated scoreSettings for group ${groupId}`);
    } catch (error) {
      console.error(`GROUP_STORE: Failed to update scoreSettings for group ${groupId}:`, error);
      set({ status: "error", error: "Fehler beim Speichern der Punkteeinstellungen." }, false, 'updateCurrentGroupScoreSettingsError');
      throw error;
    }
  },

  updateCurrentGroupStrokeSettings: async (groupId: string, newStrokeSettings: StrokeSettings) => {
    console.log(`GROUP_STORE: Updating strokeSettings for group ${groupId}`);
    set({ status: "loading" }, false, 'updateCurrentGroupStrokeSettingsStart');
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        strokeSettings: newStrokeSettings,
        updatedAt: serverTimestamp()
      });

      set(
        produce((draft) => {
           if (draft.currentGroup && draft.currentGroup.id === groupId) {
            draft.currentGroup.strokeSettings = newStrokeSettings;
            draft.currentGroup.updatedAt = new Date() as any;
          }
          const groupIndex = draft.userGroups.findIndex((g) => g.id === groupId);
          if (groupIndex !== -1) {
            draft.userGroups[groupIndex].strokeSettings = newStrokeSettings;
            (draft.userGroups[groupIndex] as any).updatedAt = new Date();
          }
           draft.status = "idle";
        }), 
        false, 
        'updateCurrentGroupStrokeSettingsSuccess'
      );
       console.log(`GROUP_STORE: Successfully updated strokeSettings for group ${groupId}`);
    } catch (error) {
      console.error(`GROUP_STORE: Failed to update strokeSettings for group ${groupId}:`, error);
       set({ status: "error", error: "Fehler beim Speichern der Stricheinstellungen." }, false, 'updateCurrentGroupStrokeSettingsError');
      throw error;
    }
  },

  updateCurrentGroupCardStyle: async (groupId: string, cardStyle: CardStyle) => {
    if (!get().isCurrentUserAdmin(groupId)) throw new Error("Nur Admins können den Kartensatz ändern.");
    const groupRef = doc(db, 'groups', groupId);
    try {
      await updateDoc(groupRef, { cardStyle: cardStyle });
      set((state) => ({
        currentGroup: state.currentGroup
          ? { ...state.currentGroup, cardStyle: cardStyle }
          : null,
      }));
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Kartensatzes:", error);
      throw error;
    }
  },

  updateGroupInList: (groupId: string, updates: Partial<FirestoreGroup>) => {
    set((state) => {
      const groupIndex = state.userGroups.findIndex((g) => g.id === groupId);
      if (groupIndex !== -1) {
        const updatedGroups = [...state.userGroups];
        const updatedGroup = {
          ...updatedGroups[groupIndex],
          ...updates,
          farbeSettings: updates.farbeSettings ?? updatedGroups[groupIndex].farbeSettings ?? DEFAULT_FARBE_SETTINGS
        } as FirestoreGroup;
        updatedGroups[groupIndex] = updatedGroup;
        return { userGroups: updatedGroups };
      } else {
        return {};
      }
    }, false, 'updateGroupInList');
  },

  addUserGroup: (group: FirestoreGroup) => {
      const currentGroups = get().userGroups;
      if (!currentGroups.some((g) => g.id === group.id)) {
          const groupWithDefaults = {
              ...group,
              farbeSettings: group.farbeSettings ?? DEFAULT_FARBE_SETTINGS
          };
          set({ userGroups: [...currentGroups, groupWithDefaults] }, false, 'addUserGroup');
      }
  },

  updateMemberRole: async (playerId: string, role: 'admin' | 'member') => {
    const { currentGroup } = get();
    const { user } = useAuthStore.getState();
    if (!currentGroup) {
      console.error("GROUP_STORE: updateMemberRole - Keine aktive Gruppe ausgewählt.");
      throw new Error("Keine Gruppe ausgewählt.");
    }
    if (!user?.uid) {
      console.error("GROUP_STORE: updateMemberRole - Keine uid für den aktuellen Benutzer gefunden.");
      throw new Error("Aktueller Benutzer konnte nicht identifiziert werden.");
    }
    const requestingUserId = user.uid;
    const groupId = currentGroup.id;
    set({ status: "loading", error: null }, false, 'updateMemberRoleStart');
    try {
      const targetUserId = await updateGroupMemberRole(groupId, playerId, role, requestingUserId);
      set((state) => {
         if (!state.currentGroup) return { status: "success", error: null };
         let updatedAdminIds = [...(state.currentGroup.adminIds || [])];
         if (role === 'admin' && !updatedAdminIds.includes(targetUserId)) {
           updatedAdminIds.push(targetUserId);
         } else if (role === 'member' && updatedAdminIds.includes(targetUserId)) {
           updatedAdminIds = updatedAdminIds.filter(id => id !== targetUserId);
         }
         get().updateGroupInList(groupId, { adminIds: updatedAdminIds });
         return { status: "success", error: null };
       }, false, 'updateMemberRoleSuccess');
      console.log(`GROUP_STORE: updateMemberRole - Rolle für Spieler ${playerId} (User ${targetUserId}) in Gruppe ${groupId} erfolgreich auf ${role} gesetzt.`);
    } catch (error) {
      console.error(`GROUP_STORE: updateMemberRole - Fehler beim Aktualisieren der Rolle für ${playerId}:`, error);
      const errorMessage = error instanceof Error ? error.message : "Rollenaktualisierung fehlgeschlagen.";
      set({ status: "error", error: errorMessage }, false, 'updateMemberRoleFail');
      throw error;
    }
  },
  
  setError: (error: string | null) => set({ status: "error", error }, false, 'setError'),
  clearError: () => set({ error: null }, false, 'clearError'),
  resetGroupStore: () => {
    get()._cleanupCurrentGroupListener();
    set(initialState);
  },

  loadGroup: async (groupId: string) => {
    // Implementation needed
  },

  leaveGroup: async (groupId: string, userId: string) => {
    // Implementation needed
  },

  subscribeToGroup: (groupId: string) => {
    // Implementation needed
  },

  unsubscribeFromGroup: () => {
    // Implementation needed
  },

  setCurrentGroupId: (groupId: string | null) => set({ currentGroupId: groupId }),

  clearGroupState: () => set({ ...initialState }),

  isCurrentUserAdmin: (groupId?: string) => {
    const group = get().currentGroup;
    const user = useAuthStore.getState().user; // Annahme: Zugriff auf AuthStore nötig
    const targetGroupId = groupId ?? group?.id;
    if (!user || !group || group.id !== targetGroupId) return false;
    return group.adminIds.includes(user.uid);
  },
});

// Create the store using the combined middlewares and the explicitly typed creator
export const useGroupStore = create<GroupStore>()(
  devtools(
    persist(
      groupStoreCreator,
      {
        name: "jass-group-store",
        partialize: (state): PersistedState => ({
          currentGroupId: state.currentGroupId,
          userGroups: state.userGroups.map(g => ({
            id: g.id,
            name: g.name,
            description: g.description,
            createdBy: g.createdBy,
            createdAt: g.createdAt,
            updatedAt: g.updatedAt,
            playerIds: g.playerIds,
            adminIds: g.adminIds,
            isPublic: g.isPublic,
            logoUrl: g.logoUrl,
            farbeSettings: g.farbeSettings,
            scoreSettings: g.scoreSettings,
            strokeSettings: g.strokeSettings,
          })),
        }),
        onRehydrateStorage: () => {
          console.log("GroupStore: Rehydrierung beginnt.");
          return (state: GroupStore | undefined, error?: unknown) => {
            if (error) {
              console.error("GroupStore: Fehler bei Rehydrierung:", error);
              state?.resetGroupStore();
              return;
            }
            console.log("GroupStore: Rehydrierung abgeschlossen.");
            const persistedGroupId = state?.currentGroupId;
            const rehydratedGroup = state?.userGroups.find(g => g.id === persistedGroupId);

            if (rehydratedGroup) {
                console.log(`GroupStore: Rehydrierte Gruppe ${rehydratedGroup.id} gefunden. Setze Gruppe und starte Listener.`);
                state?.setCurrentGroup({ ...rehydratedGroup } as any);
            } else if (persistedGroupId) {
                 console.warn(`GroupStore: Persistierte Gruppen-ID ${persistedGroupId} gefunden, aber Gruppe nicht in rehydrierter Liste.`);
                 state?.setCurrentGroup(null);
            } else {
                 console.log("GroupStore: Keine aktuelle Gruppe nach Rehydrierung.");
                 state?.setCurrentGroup(null);
            }
          };
        },
        version: 1,
      } as PersistOptions<GroupStore, PersistedState>
    ),
    {
      name: "GroupStore",
    } as DevtoolsOptions
  )
);

// Optional: Selektoren für häufig verwendeten Zustand
export const selectCurrentGroup = (state: GroupStore) => state.currentGroup;
export const selectUserGroups = (state: GroupStore) => state.userGroups;
export const selectGroupLoadingStatus = (state: GroupStore) => state.status;
