// src/store/groupStore.ts
import { create, StoreApi, StateCreator } from "zustand";
import { devtools, persist, createJSONStorage, PersistOptions, DevtoolsOptions } from "zustand/middleware";
// import { FirestoreGroup } from "../types/group"; 
import { useAuthStore } from "./authStore";
import { updateUserDocument } from "../services/authService";
import { getUserGroupsByPlayerId, updateGroupMemberRole, getGroupById, updateGroupSettings as updateGroupSettingsService } from "../services/groupService";
import { doc, updateDoc, serverTimestamp, onSnapshot, Unsubscribe, FirestoreError, getDoc, arrayUnion, arrayRemove, Timestamp } from "firebase/firestore";
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
import { useUIStore } from './uiStore'; // Importiere uiStore für Notifications
import { GROUPS_COLLECTION } from '@/constants/firestore';
import { getPlayerDocument } from "../services/playerService"; // Sicherstellen, dass der Import da ist

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
  lastSettingsUpdateTimestamp: number | null;
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
  updateGroup: (groupId: string, data: Partial<Omit<FirestoreGroup, 'id' | 'playerIds' | 'adminIds'>>, showNotification?: boolean) => Promise<void>; // Verwende den importierten Typ
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
  updateCurrentGroupJassSettings: (groupId: string, updates: {
    scoreSettings: ScoreSettings;
    strokeSettings: StrokeSettings;
    farbeSettingsValues: JassFarbeSettings['values'];
    cardStyle: CardStyle;
  }) => Promise<void>;
  _trySetLastActiveGroup: () => void;
}

type GroupStore = GroupState & GroupActions;

// +++ NEU: Typ für persistierte Gruppen (ohne 'players') +++
type PersistedGroup = Omit<FirestoreGroup, 'players'>;

// Define type for the persisted part of the state
type PersistedState = {
  currentGroupId: string | null;
  userGroups: PersistedGroup[]; // Verwende den neuen Typ
};

const initialState: GroupState = {
  currentGroupId: null,
  currentGroup: null,
  userGroups: [],
  status: "idle", // Startet als idle
  error: null,
  _currentGroupListenerUnsubscribe: null,
  lastSettingsUpdateTimestamp: null,
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
      // console.log("GROUP_STORE: Unsubscribing from current group listener.");
      unsubscribe();
      set({ _currentGroupListenerUnsubscribe: null }, false, 'cleanupListener');
    }
  },

  setCurrentGroup: (group: Group | null) => {
    // Race Condition Prevention: Keine Group-Operations während Logout
    const authState = useAuthStore.getState();
    if (authState.isLoggingOut) {
      console.log("GROUP_STORE: Skipping setCurrentGroup during logout process");
      return; 
    }
    
    // Bestehende Listener für die vorherige Gruppe bereinigen
        get()._cleanupCurrentGroupListener();

    set({ currentGroup: group }, false, 'setCurrentGroup');
    
    const userId = authState.user?.uid;

    if (userId && authState.status === "authenticated" && !authState.isLoggingOut) { // Zusätzlicher isLoggingOut Check
      updateUserDocument(userId, { lastActiveGroupId: group?.id || null }).catch(err => {
        console.warn(`GROUP_STORE: Failed to update lastActiveGroupId to ${group?.id || 'null'} for user ${userId} (maybe during logout?):`, err);
      });
    } else {
      console.log(`GROUP_STORE: Skipping update of lastActiveGroupId for group ${group?.id || 'null'} because user is not authenticated or is logging out.`);
    }
  },

  setUserGroups: (groups: FirestoreGroup[]) => set({
      userGroups: groups.map(g => ({...g, farbeSettings: g.farbeSettings ?? DEFAULT_FARBE_SETTINGS }))
  }, false, 'setUserGroups'),

  loadUserGroups: async (userId: string) => {
    // console.warn("GROUP_STORE: Deprecated loadUserGroups(userId) called. Use loadUserGroupsByPlayerId instead.");
    set({ status: "idle", userGroups: [], error: "Deprecated function called" }, false, 'loadUserGroups');
  },

  loadUserGroupsByPlayerId: async (playerId: string) => {
    if (!playerId) {
        // console.error("GROUP_STORE: loadUserGroupsByPlayerId called without playerId!");
        set({ userGroups: [], status: "error", error: "Player-ID fehlt." }, false, 'loadGroupsByPlayerIdError');
        return;
    }
    set({ status: "loading", error: null }, false, 'loadGroupsByPlayerIdStart');
    try {
        const groups = await getUserGroupsByPlayerId(playerId);
        // HINWEIS: getUserGroupsByPlayerId liefert bereits angereicherte Daten
        const groupsWithDefaults = groups.map(g => ({
          ...g,
          farbeSettings: g.farbeSettings ?? DEFAULT_FARBE_SETTINGS
          // Defaults für score/stroke hier nicht nötig, da sie schon in `g` sein sollten, wenn vorhanden
        }));
        const oldState = get();
        const currentGroup = oldState.currentGroup;
        // Überprüfung, ob die aktuelle Gruppe noch in der *neuen* Liste vorhanden ist
        const currentGroupStillExists = currentGroup && groupsWithDefaults.some((g: FirestoreGroup) => g.id === currentGroup.id);
        
        set({
            userGroups: groupsWithDefaults,
            // Setze currentGroup auf null, wenn es nicht mehr existiert ODER wenn es die gleiche ID hat,
            // aber möglicherweise veraltete Daten (z.B. wenn Anreicherung im Listener fehlt).
            // Es ist sicherer, es auf null zu setzen und den User neu auswählen zu lassen, 
            // oder den Listener robuster zu machen.
            currentGroup: currentGroupStillExists ? currentGroup : null, 
            status: "success",
            error: null,
        }, false, 'loadGroupsByPlayerIdSuccess');
        
        if (currentGroup && !currentGroupStillExists) {
            const userId = useAuthStore.getState().user?.uid;
            if (userId) {
                 // console.warn(`GROUP_STORE: Current group ${currentGroup.id} no longer exists for player ${playerId}. Clearing lastActiveGroupId for user ${userId}.`);
                 updateUserDocument(userId, { lastActiveGroupId: null }).catch((err) => {
                   console.error("GROUP_STORE: Failed to clear lastActiveGroupId after current group became invalid:", err);
                 });
            } else {
                 // console.warn(`GROUP_STORE: Current group ${currentGroup.id} no longer exists for player ${playerId}, but couldn't get userId to clear lastActiveGroupId.`);
            }
        }

        // 🚀 NEU: Automatisches Setzen der lastActiveGroup nach dem Laden
        // Nur wenn noch keine currentGroup gesetzt ist, versuche lastActiveGroupId zu verwenden
        if (!currentGroupStillExists && !currentGroup) {
          get()._trySetLastActiveGroup();
        }
    } catch (error) {
        // console.error(`GROUP_STORE: Failed to load groups for playerId ${playerId}:`, error);
        set({ status: "error", error: "Fehler beim Laden der Gruppen.", userGroups: [] }, false, 'loadGroupsByPlayerIdFail');
    }
  },

  fetchCurrentGroup: async (groupId: string) => {
    set({ status: "loading", error: null }, false, 'fetchCurrentGroupStart');
    try {
      // HINWEIS: getGroupById liefert aktuell *keine* angereicherten Spielerdaten!
      // Das könnte zu Inkonsistenzen führen, wenn diese Funktion verwendet wird.
      const group = await getGroupById(groupId);
      get().setCurrentGroup(group as any); // Typ-Assertion beibehalten
      if (!group) {
        set({ status: "error", error: "Gruppe nicht gefunden" }, false, 'fetchCurrentGroupNotFound');
      }
    } catch (error) {
      // console.error(`Fehler beim Abrufen der Gruppe ${groupId}:`, error);
      set({
        status: "error",
        error: error instanceof Error ? error.message : "Fehler beim Laden der Gruppe",
        currentGroup: null,
      }, false, 'fetchCurrentGroupFail');
    }
  },

  updateGroup: async (groupId: string, data: Partial<Omit<FirestoreGroup, 'id' | 'playerIds' | 'adminIds'>>, showNotification: boolean = true) => {
    const uiStore = useUIStore.getState();
    if (!groupId) {
      console.error("GROUP_STORE: updateGroup called without groupId.");
      uiStore.showNotification({ message: "Fehler: Gruppen-ID fehlt.", type: "error" });
       return;
    }
    // console.log(`GROUP_STORE: Updating group ${groupId} with data:`, data);
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    try {
      await updateDoc(groupRef, { ...data, updatedAt: serverTimestamp() });
      // console.log(`GROUP_STORE: Group ${groupId} updated successfully.`);
      // Aktualisiere das currentGroup im Store, falls es die aktuelle Gruppe ist
      const currentStateForUpdate = get();
      const nextStateAfterUpdate = produce(currentStateForUpdate, (draft: GroupStore) => {
         if (draft.currentGroup && draft.currentGroup.id === groupId) {
          draft.currentGroup = { ...draft.currentGroup, ...data, updatedAt: Timestamp.now() } as Group;
          }
        const groupIndex = draft.userGroups.findIndex(g => g.id === groupId);
          if (groupIndex !== -1) {
          draft.userGroups[groupIndex] = { ...draft.userGroups[groupIndex], ...data, updatedAt: Timestamp.now() } as FirestoreGroup;
        }
        draft.lastSettingsUpdateTimestamp = Date.now();
      });
      set(nextStateAfterUpdate);
      // 🎨 NEU: Nur Benachrichtigung zeigen, wenn explizit gewünscht
      if (showNotification) {
        uiStore.showNotification({ message: "Gruppeneinstellungen gespeichert.", type: "success" });
      }
    } catch (error) {
      console.error(`GROUP_STORE: Error updating group ${groupId}:`, error);
      
      // Stille Behandlung für "No document to update" Fehler
      if (error instanceof Error && error.message.includes("No document to update")) {
        console.warn(`GROUP_STORE: Group ${groupId} does not exist, silently ignoring update.`);
        return;
      }
      
      let message = "Fehler beim Speichern der Gruppeneinstellungen.";
      if (error instanceof Error) {
        message += `: ${error.message}`;
      }
      uiStore.showNotification({ message, type: "error" });
      set({ error: message }, false, 'updateGroupError');
    }
  },
  
  updateCurrentGroupFarbeSettings: async (groupId: string, newFarbeSettings: Omit<JassFarbeSettings, 'isFlipped'>) => {
    // console.log(`GROUP_STORE: Updating farbeSettings for group ${groupId}`);
    set({ status: "loading" }, false, 'updateCurrentGroupFarbeSettingsStart');
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        farbeSettings: newFarbeSettings,
        updatedAt: serverTimestamp()
      });

      set(state => produce(state, (draft: GroupStore) => {
          if (draft.currentGroup && draft.currentGroup.id === groupId) {
            draft.currentGroup.farbeSettings = newFarbeSettings;
          draft.currentGroup.updatedAt = Timestamp.now();
          }
          const groupIndex = draft.userGroups.findIndex((g) => g.id === groupId);
          if (groupIndex !== -1) {
            draft.userGroups[groupIndex].farbeSettings = newFarbeSettings;
          (draft.userGroups[groupIndex] as any).updatedAt = Timestamp.now();
          }
          draft.status = "idle";
      }), false, 'updateCurrentGroupFarbeSettingsSuccess');
      // console.log(`GROUP_STORE: Successfully updated farbeSettings for group ${groupId}`);
    } catch (error) {
      // console.error(`GROUP_STORE: Failed to update farbeSettings for group ${groupId}:`, error);
      
      // Stille Behandlung für "No document to update" Fehler
      if (error instanceof Error && error.message.includes("No document to update")) {
        console.warn(`GROUP_STORE: Group ${groupId} does not exist, silently ignoring farbeSettings update.`);
        set({ status: "idle" }, false, 'updateCurrentGroupFarbeSettingsIgnored');
        return;
      }
      
      set({ status: "error", error: "Fehler beim Speichern der Farbeinstellungen." }, false, 'updateCurrentGroupFarbeSettingsError');
      throw error;
    }
  },

  updateCurrentGroupScoreSettings: async (groupId: string, newScoreSettings: ScoreSettings) => {
    // console.log(`GROUP_STORE: Updating scoreSettings for group ${groupId}`);
    set({ status: "loading" }, false, 'updateCurrentGroupScoreSettingsStart');
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        scoreSettings: newScoreSettings,
        updatedAt: serverTimestamp()
      });

      set(state => produce(state, (draft: GroupStore) => {
           if (draft.currentGroup && draft.currentGroup.id === groupId) {
            draft.currentGroup.scoreSettings = newScoreSettings;
          draft.currentGroup.updatedAt = Timestamp.now();
          }
          const groupIndex = draft.userGroups.findIndex((g) => g.id === groupId);
          if (groupIndex !== -1) {
            draft.userGroups[groupIndex].scoreSettings = newScoreSettings;
          (draft.userGroups[groupIndex] as any).updatedAt = Timestamp.now();
          }
           draft.status = "idle";
      }), false, 'updateCurrentGroupScoreSettingsSuccess');
      // console.log(`GROUP_STORE: Successfully updated scoreSettings for group ${groupId}`);
    } catch (error) {
      // console.error(`GROUP_STORE: Failed to update scoreSettings for group ${groupId}:`, error);
      
      // Stille Behandlung für "No document to update" Fehler
      if (error instanceof Error && error.message.includes("No document to update")) {
        console.warn(`GROUP_STORE: Group ${groupId} does not exist, silently ignoring scoreSettings update.`);
        set({ status: "idle" }, false, 'updateCurrentGroupScoreSettingsIgnored');
        return;
      }
      
      set({ status: "error", error: "Fehler beim Speichern der Punkteeinstellungen." }, false, 'updateCurrentGroupScoreSettingsError');
      throw error;
    }
  },

  updateCurrentGroupStrokeSettings: async (groupId: string, newStrokeSettings: StrokeSettings) => {
    // console.log(`GROUP_STORE: Updating strokeSettings for group ${groupId}`);
    set({ status: "loading" }, false, 'updateCurrentGroupStrokeSettingsStart');
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        strokeSettings: newStrokeSettings,
        updatedAt: serverTimestamp()
      });

      set(state => produce(state, (draft: GroupStore) => {
           if (draft.currentGroup && draft.currentGroup.id === groupId) {
            draft.currentGroup.strokeSettings = newStrokeSettings;
          draft.currentGroup.updatedAt = Timestamp.now();
          }
          const groupIndex = draft.userGroups.findIndex((g) => g.id === groupId);
          if (groupIndex !== -1) {
            draft.userGroups[groupIndex].strokeSettings = newStrokeSettings;
          (draft.userGroups[groupIndex] as any).updatedAt = Timestamp.now();
          }
           draft.status = "idle";
      }), false, 'updateCurrentGroupStrokeSettingsSuccess');
       // console.log(`GROUP_STORE: Successfully updated strokeSettings for group ${groupId}`);
    } catch (error) {
      // console.error(`GROUP_STORE: Failed to update strokeSettings for group ${groupId}:`, error);
       
      // Stille Behandlung für "No document to update" Fehler
      if (error instanceof Error && error.message.includes("No document to update")) {
        console.warn(`GROUP_STORE: Group ${groupId} does not exist, silently ignoring strokeSettings update.`);
        set({ status: "idle" }, false, 'updateCurrentGroupStrokeSettingsIgnored');
        return;
      }
       
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
      // console.error("Fehler beim Aktualisieren des Kartensatzes:", error);
      
      // Stille Behandlung für "No document to update" Fehler
      if (error instanceof Error && error.message.includes("No document to update")) {
        console.warn(`GROUP_STORE: Group ${groupId} does not exist, silently ignoring cardStyle update.`);
        return;
      }
      
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
          // Stelle sicher, dass `players` nicht überschrieben wird, wenn `updates` es nicht enthält
          players: updates.players ?? updatedGroups[groupIndex].players, 
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
          // Stelle sicher, dass die hinzugefügte Gruppe Defaults hat und angereichert ist
          // Normalerweise sollte die Gruppe bereits angereichert sein, wenn sie hier ankommt
          const groupWithDefaults = {
              ...group,
              farbeSettings: group.farbeSettings ?? DEFAULT_FARBE_SETTINGS,
              players: group.players // Behalte die (hoffentlich) angereicherten Spieler bei
          };
          set({ userGroups: [...currentGroups, groupWithDefaults] }, false, 'addUserGroup');
      }
  },

  updateMemberRole: async (playerId: string, role: 'admin' | 'member') => {
    const { currentGroup } = get();
    const showNotification = useUIStore.getState().showNotification;
    console.log(`[updateMemberRole] Attempting to change role for playerId: ${playerId} to ${role}`); // LOGGING

    if (!currentGroup || !playerId) {
      console.error(`[updateMemberRole] Failed: Current group missing (${!currentGroup}) or playerId missing (${!playerId}).`); // LOGGING
      throw new Error("Ungültige IDs für Gruppen- oder Spieleroperation.");
    }

    const groupId = currentGroup.id;
    console.log(`[updateMemberRole] Target Group ID: ${groupId}`); // LOGGING

    set({ status: "loading" }, false, 'updateMemberRoleStart');
    try {
      // Hole das Player-Dokument, um die userId zu bekommen
      console.log(`[updateMemberRole] Calling getPlayerDocument for playerId: ${playerId}`); // LOGGING
      const playerDoc = await getPlayerDocument(playerId);
      console.log(`[updateMemberRole] Result from getPlayerDocument for ${playerId}:`, playerDoc); // LOGGING

      if (!playerDoc || !playerDoc.userId) {
        console.error(`[updateMemberRole] Failed: Player document not found (${!playerDoc}) or userId missing (${!playerDoc?.userId}) for playerId ${playerId}.`); // LOGGING
        throw new Error("Benutzerinformationen für das Mitglied konnten nicht gefunden werden.");
      }

      const targetUserId = playerDoc.userId;
      console.log(`[updateMemberRole] Found targetUserId: ${targetUserId} for playerId: ${playerId}`); // LOGGING

      // --- Update Firestore ---
      const groupRef = doc(db, GROUPS_COLLECTION, groupId);
      const updateData = role === 'admin'
        ? { adminIds: arrayUnion(targetUserId) }   // Füge userId zu adminIds hinzu
        : { adminIds: arrayRemove(targetUserId) }; // Entferne userId von adminIds
      
      console.log(`[updateMemberRole] Updating Firestore group ${groupId} with:`, updateData); // LOGGING
      await updateDoc(groupRef, updateData);
      console.log(`[updateMemberRole] Firestore update successful for group ${groupId}.`); // LOGGING
      // --- Ende Firestore Update ---

      // --- Update lokalen State ---
      set(state => produce(state, (draft: GroupStore) => {
        if (draft.currentGroup) {
           // Local state update für Admin-Rolle
          if (role === 'admin') {
            if (!draft.currentGroup.adminIds.includes(targetUserId)) {
              draft.currentGroup.adminIds.push(targetUserId);
              // Admin-Rolle hinzugefügt
            }
          } else {
            const initialLength = draft.currentGroup.adminIds.length;
            draft.currentGroup.adminIds = draft.currentGroup.adminIds.filter(id => id !== targetUserId);
            if (draft.currentGroup.adminIds.length < initialLength) {
                 // Admin-Rolle entfernt
            }
          }
        }
        draft.status = 'success';
        draft.error = null;
      }), false, 'updateMemberRoleSuccess');

    } catch (error) {
      console.error(`GROUP_STORE: Failed to update role for playerId ${playerId} to ${role} in group ${groupId}:`, error); // Behalte bestehendes Error-Logging
      
      // Stille Behandlung für "No document to update" Fehler
      if (error instanceof Error && error.message.includes("No document to update")) {
        console.warn(`GROUP_STORE: Group ${groupId} does not exist, silently ignoring role update for playerId ${playerId}.`);
        set({ status: "idle", error: null }, false, 'updateMemberRoleIgnored');
        return;
      }
      
      const message = error instanceof Error ? error.message : "Rollenänderung fehlgeschlagen.";
      set({ status: "error", error: message }, false, 'updateMemberRoleError');
      throw new Error(message);
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
    // Überprüfe, ob die adminIds existieren und die userId enthalten
    return Array.isArray(group.adminIds) && group.adminIds.includes(user.uid);
  },

  _trySetLastActiveGroup: () => {
    // 🚀 NEU: Automatisches Setzen der lastActiveGroup nach dem Laden der userGroups
    const authUser = useAuthStore.getState().user;
    const currentGroups = get().userGroups;
    const currentGroup = get().currentGroup;
    
    // Nur ausführen wenn:
    // 1. User eingeloggt ist
    // 2. UserGroups bereits geladen sind
    // 3. Noch keine currentGroup gesetzt ist
    // 4. User hat eine lastActiveGroupId
    if (!authUser?.lastActiveGroupId || currentGroup || currentGroups.length === 0) {
      return;
    }

    // Finde die lastActiveGroup in den geladenen userGroups
    const lastActiveGroup = currentGroups.find(g => g.id === authUser.lastActiveGroupId);
    
    if (lastActiveGroup) {
      console.log(`[GroupStore] 🎯 Automatisch lastActiveGroup gesetzt: ${lastActiveGroup.name} (${lastActiveGroup.id})`);
      get().setCurrentGroup(lastActiveGroup as any);
    } else {
      console.warn(`[GroupStore] ⚠️ lastActiveGroupId ${authUser.lastActiveGroupId} nicht in userGroups gefunden`);
      // Optional: lastActiveGroupId löschen, da die Gruppe nicht mehr existiert
      if (authUser.uid) {
        updateUserDocument(authUser.uid, { lastActiveGroupId: null }).catch(error => {
          console.error('Failed to clear invalid lastActiveGroupId:', error);
        });
      }
    }
  },

  updateCurrentGroupJassSettings: async (groupId: string, updates: {
    scoreSettings: ScoreSettings;
    strokeSettings: StrokeSettings;
    farbeSettingsValues: JassFarbeSettings['values'];
    cardStyle: CardStyle;
  }) => {
    const uiStore = useUIStore.getState();
    if (!groupId) {
      console.error("GROUP_STORE: updateCurrentGroupJassSettings called without groupId.");
      uiStore.showNotification({ message: "Fehler: Gruppen-ID für Jass-Einstellungen fehlt.", type: "error" });
      return;
    }
    
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    try {
      const updatePayload = {
        "scoreSettings": updates.scoreSettings,
        "strokeSettings": updates.strokeSettings,
        "farbeSettings.values": updates.farbeSettingsValues, // Korrekter Pfad für verschachtelte Map
        "farbeSettings.cardStyle": updates.cardStyle, // Korrekter Pfad für cardStyle in farbeSettings
        "updatedAt": serverTimestamp(),
      };
      // console.log("GROUP_STORE: Update-Payload für Jass-Einstellungen:", updatePayload);
      await updateDoc(groupRef, updatePayload);

      const currentStateForJassSettings = get();
      const nextStateAfterJassSettings = produce(currentStateForJassSettings, (draft: GroupStore) => {
        if (draft.currentGroup && draft.currentGroup.id === groupId) {
          draft.currentGroup = {
            ...draft.currentGroup,
            scoreSettings: updates.scoreSettings,
            strokeSettings: updates.strokeSettings,
            farbeSettings: {
              ...(draft.currentGroup.farbeSettings || DEFAULT_FARBE_SETTINGS),
              values: updates.farbeSettingsValues,
              cardStyle: updates.cardStyle,
            },
            updatedAt: Timestamp.now(),
          } as Group;
        }
        const groupIndex = draft.userGroups.findIndex(g => g.id === groupId);
        if (groupIndex !== -1) {
           draft.userGroups[groupIndex] = {
            ...draft.userGroups[groupIndex],
            scoreSettings: updates.scoreSettings,
            strokeSettings: updates.strokeSettings,
          farbeSettings: {
              ...(draft.userGroups[groupIndex].farbeSettings || DEFAULT_FARBE_SETTINGS),
              values: updates.farbeSettingsValues,
              cardStyle: updates.cardStyle,
            },
            updatedAt: Timestamp.now(),
          } as FirestoreGroup;
        }
        draft.lastSettingsUpdateTimestamp = Date.now();
      });
      set(nextStateAfterJassSettings);

      uiStore.showNotification({ message: "Jass-Einstellungen erfolgreich aktualisiert.", type: "success" });
    } catch (error) {
      console.error("GROUP_STORE: Fehler beim Aktualisieren der Jass-Einstellungen für Gruppe", groupId, error);
      
      // Stille Behandlung für "No document to update" Fehler
      if (error instanceof Error && error.message.includes("No document to update")) {
        console.warn(`GROUP_STORE: Group ${groupId} does not exist, silently ignoring Jass-Einstellungen update.`);
        return;
      }
      
      let message = "Fehler beim Aktualisieren der Jass-Einstellungen.";
      if (error instanceof Error) {
        message += `: ${error.message}`;
      }
      uiStore.showNotification({ message, type: "error" });
      set({ error: message }, false, 'updateJassSettingsError');
    }
  },
});

// Create the store using the combined middlewares and the explicitly typed creator
export const useGroupStore = create<GroupStore>()(
  devtools(
    persist(
      groupStoreCreator,
      {
        name: "jass-group-storage", // Name für den Speicher
        storage: createJSONStorage(() => localStorage), // Speicherort (localStorage)
        // Wähle aus, welche Teile des States persistiert werden sollen
        partialize: (state) => ({
          currentGroupId: state.currentGroupId,
          // NEU: Nur relevante Felder von userGroups speichern (ohne players-Map etc.)
          userGroups: state.userGroups.map((g): PersistedGroup => ({
            // Explizit nur die Felder auswählen, die im PersistedGroup-Typ sind
            id: g.id,
            name: g.name,
            description: g.description,
            createdAt: g.createdAt,
            createdBy: g.createdBy,
            updatedAt: g.updatedAt,
            playerIds: g.playerIds,
            adminIds: g.adminIds,
            isPublic: g.isPublic,
            logoUrl: g.logoUrl,
            farbeSettings: g.farbeSettings,
            scoreSettings: g.scoreSettings,
            strokeSettings: g.strokeSettings,
            cardStyle: g.cardStyle,
            // memberUserIds: g.memberUserIds, // Diese Zeile entfernen
          })),
        }),
        onRehydrateStorage: () => {
          // console.log("GroupStore: Rehydrierung beginnt.");
          return (state: GroupStore | undefined, error?: unknown) => {
            if (error) {
              // console.error("GroupStore: Fehler bei Rehydrierung:", error);
              state?.resetGroupStore();
              return;
            }
            // console.log("GroupStore: Rehydrierung abgeschlossen.");
            const persistedGroupId = state?.currentGroupId;
            
            if (persistedGroupId) {
              // console.log(`GroupStore: Rehydrierte Gruppen-ID ${persistedGroupId} gefunden. Warte auf vollständiges Laden.`);
            } else {
               // console.log("GroupStore: Keine aktuelle Gruppe nach Rehydrierung.");
            }
          };
        },
        version: 1,
        migrate: (persistedState, version) => {
          // Migration von Version 0 zu Version 1
          if (version === 0) {
             console.log("Migrating GroupStore from version 0 to 1...");
             const oldState = persistedState as any; // Typisierung für alten Zustand
             return {
               currentGroupId: oldState.currentGroupId,
               userGroups: (oldState.userGroups || []).map((g: any) => ({
                  // Alle bekannten Felder aus dem alten Zustand übernehmen
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
                  // Fehlendes Feld 'memberUserIds' mit Standardwert hinzufügen
                  memberUserIds: [], 
               }))
             } as PersistedState;
          }
          // Für zukünftige Migrationen hier weitere 'if (version === X)' Blöcke einfügen
          console.log(`GroupStore: No migration needed for version ${version}.`);
          return persistedState as PersistedState; // Keine Migration nötig für aktuelle Version
        },
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
