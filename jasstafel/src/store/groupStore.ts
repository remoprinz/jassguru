// src/store/groupStore.ts
import {create} from "zustand";
import {devtools} from "zustand/middleware";
import {FirestoreGroup} from "../types/group";
import {useAuthStore} from "./authStore";
import {updateUserDocument} from "../services/authService";
import {getUserGroups, getUserGroupsByPlayerId, updateGroupMemberRole} from "../services/groupService";
import {doc, updateDoc, serverTimestamp, onSnapshot, Unsubscribe, FirestoreError} from "firebase/firestore";
import {db} from "../services/firebaseInit";
import {GROUPS_COLLECTION} from "../constants/firestore";

// Statusnamen angepasst (loaded -> success)
type GroupLoadingStatus = "idle" | "loading" | "success" | "error";

interface GroupState {
  currentGroup: FirestoreGroup | null;
  userGroups: FirestoreGroup[];
  status: GroupLoadingStatus;
  error: string | null;
  _currentGroupListenerUnsubscribe: Unsubscribe | null;
}

interface GroupActions {
  setCurrentGroup: (group: FirestoreGroup | null) => void;
  setUserGroups: (groups: FirestoreGroup[]) => void;
  loadUserGroups: (userId: string) => Promise<void>;
  loadUserGroupsByPlayerId: (playerId: string) => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
  resetGroupStore: () => void;
  updateGroupInList: (groupId: string, updateData: Partial<FirestoreGroup>) => void;
  updateGroup: (groupId: string, updates: Partial<FirestoreGroup>) => Promise<void>;
  addUserGroup: (group: FirestoreGroup) => void;
  updateMemberRole: (targetPlayerId: string, newRole: 'admin' | 'member') => Promise<void>;
  _cleanupCurrentGroupListener: () => void;
}

type GroupStore = GroupState & GroupActions;

const initialState: GroupState = {
  currentGroup: null,
  userGroups: [],
  status: "idle", // Startet als idle
  error: null,
  _currentGroupListenerUnsubscribe: null,
};

export const useGroupStore = create<GroupStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      _cleanupCurrentGroupListener: () => {
        const unsubscribe = get()._currentGroupListenerUnsubscribe;
        if (unsubscribe) {
          console.log("GROUP_STORE: Unsubscribing from current group listener.");
          unsubscribe();
          set({ _currentGroupListenerUnsubscribe: null });
        }
      },

      setCurrentGroup: (group: FirestoreGroup | null) => {
        const { _cleanupCurrentGroupListener } = get();
        _cleanupCurrentGroupListener();

        if (group) {
          console.log(`GROUP_STORE: Setting current group to ${group.id} and attaching listener.`);
          const groupRef = doc(db, GROUPS_COLLECTION, group.id);
          
          const unsubscribe = onSnapshot(groupRef, 
            (docSnap) => {
              if (docSnap.exists()) {
                const updatedGroupData = { id: docSnap.id, ...docSnap.data() } as FirestoreGroup;
                console.log(`GROUP_STORE: Snapshot received for current group ${group.id}. Updating state.`);
                if (get().currentGroup?.id === group.id) {
                  set({ currentGroup: updatedGroupData, status: "success", error: null });
                  get().updateGroupInList(group.id, updatedGroupData);
                }
              } else {
                console.warn(`GROUP_STORE: Current group ${group.id} snapshot indicates it was deleted.`);
                if (get().currentGroup?.id === group.id) {
                  set({ currentGroup: null, status: "idle", error: "Ausgewählte Gruppe wurde gelöscht." });
                  get()._cleanupCurrentGroupListener();
                }
              }
            },
            (error: FirestoreError) => {
              console.error(`GROUP_STORE: Error in onSnapshot listener for group ${group.id}:`, error);
              if (get().currentGroup?.id === group.id) {
                 set({ status: "error", error: "Fehler beim Empfangen von Gruppen-Updates." });
              }
              get()._cleanupCurrentGroupListener();
            }
          );
          
          set({ currentGroup: group, _currentGroupListenerUnsubscribe: unsubscribe, status: "success", error: null });
          
          const userId = useAuthStore.getState().user?.uid;
          if (userId) {
            updateUserDocument(userId, { lastActiveGroupId: group.id }).catch(err => {
              console.error(`GROUP_STORE: Failed to update lastActiveGroupId to ${group.id} for user ${userId}:`, err);
            });
          }
          
        } else {
          console.log("GROUP_STORE: Current group set to null. Cleaning up listener.");
          set({ currentGroup: null, status: "idle" });
          const userId = useAuthStore.getState().user?.uid;
           if (userId) {
             updateUserDocument(userId, { lastActiveGroupId: null }).catch(err => {
               console.error(`GROUP_STORE: Failed to clear lastActiveGroupId for user ${userId}:`, err);
             });
           }
        }
      },
      setUserGroups: (groups) => set({userGroups: groups}),
      loadUserGroups: async (userId: string) => {
        console.warn("GROUP_STORE: Deprecated loadUserGroups(userId) called. Use loadUserGroupsByPlayerId instead.");
        set({ status: "idle", userGroups: [], error: "Deprecated function called" });
      },
      loadUserGroupsByPlayerId: async (playerId: string) => {
        if (!playerId) {
            console.error("GROUP_STORE: loadUserGroupsByPlayerId called without playerId!");
            set({ userGroups: [], status: "error", error: "Player-ID fehlt." });
            return;
        }
        set({ status: "loading", error: null });
        try {
            const groups = await getUserGroupsByPlayerId(playerId);

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
            set({ status: "error", error: "Fehler beim Laden der Gruppen.", userGroups: [] });
        }
      },
      setError: (error) => set({status: "error", error}),
      clearError: () => set({error: null}),
      resetGroupStore: () => {
        get()._cleanupCurrentGroupListener();
        const {user} = useAuthStore.getState();
        if (user) {
        }
        set(initialState);
      },
      updateGroupInList: (groupId, updateData) => {
        set((state) => {
          const groupIndex = state.userGroups.findIndex((g) => g.id === groupId);
          if (groupIndex !== -1) {
            const updatedGroups = [...state.userGroups];
            const updatedGroup = {
              ...updatedGroups[groupIndex],
              ...updateData,
            } as FirestoreGroup;
            updatedGroups[groupIndex] = updatedGroup;

            const newCurrentGroup = state.currentGroup?.id === groupId ?
              updatedGroup :
              state.currentGroup;

            console.log(`GROUP_STORE: Updated group ${groupId} in list with data:`, updateData);
            return {userGroups: updatedGroups, currentGroup: newCurrentGroup};
          } else {
            console.warn(`GROUP_STORE: updateGroupInList: Gruppe ${groupId} nicht in userGroups gefunden zum Aktualisieren.`);
            return {};
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

          const currentGroup = get().currentGroup;
          if (currentGroup?.id === groupId) {
            set({currentGroup: {...currentGroup, ...updates}});
          }

          get().updateGroupInList(groupId, updates);
        } catch (error) {
          console.error("Fehler beim Aktualisieren der Gruppe:", error);
          throw new Error("Gruppe konnte nicht aktualisiert werden.");
        }
      },
      addUserGroup: (group: FirestoreGroup) => {
        const currentGroups = get().userGroups;
        if (!currentGroups.some((g) => g.id === group.id)) {
          set({userGroups: [...currentGroups, group]});
        }
      },
      updateMemberRole: async (targetPlayerId: string, newRole: 'admin' | 'member') => {
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

        set({ status: "loading", error: null });

        try {
          const targetUserId = await updateGroupMemberRole(groupId, targetPlayerId, newRole, requestingUserId);

          set((state) => {
            if (!state.currentGroup) return {};

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
          throw error;
        }
      },
    }),
    {
      name: "group-storage", 
      partialize: (state: GroupState) => ({ /* Persistiere nur, was nötig ist */ }),
    }
  )
);

// Optional: Selektoren für häufig verwendeten Zustand
export const selectCurrentGroup = (state: GroupStore) => state.currentGroup;
export const selectUserGroups = (state: GroupStore) => state.userGroups;
export const selectGroupLoadingStatus = (state: GroupStore) => state.status;
