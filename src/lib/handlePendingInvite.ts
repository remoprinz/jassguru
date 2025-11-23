import { getFunctions, httpsCallable } from 'firebase/functions';
// import { LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY } from '../constants/appConstants'; // Removed
import { getGroupToken, clearGroupToken } from '@/utils/tokenStorage';
import { useUIStore } from '@/store/uiStore';
import { useGroupStore } from '@/store/groupStore';
import type { FirestoreGroup } from '@/types/jass';

/**
 * Checks for a pending invite token in localStorage and attempts to join the group.
 * IMPORTANT: This should be called IMMEDIATELY after a user successfully authenticates.
 * It removes the token from localStorage regardless of success or failure.
 *
 * NOTE: Direct use of `useToast` here might not work if called outside React context.
 * Consider passing a toast function or using a different notification mechanism if needed.
 *
 * @param {boolean} suppressNotification - If true, suppresses success notifications (useful when registration notification is already shown)
 * @returns {Promise<string | null>} The ID of the joined group, or null if no group was joined or an error occurred.
 */
export const processPendingInviteToken = async (suppressNotification: boolean = false): Promise<string | null> => {
  const showNotification = useUIStore.getState().showNotification;
  const addUserGroup = useGroupStore.getState().addUserGroup;
  const setCurrentGroup = useGroupStore.getState().setCurrentGroup;

  let pendingToken: string | null = null;
  try {
      // pendingToken = localStorage.getItem(LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY);
      pendingToken = getGroupToken();
  } catch (storageError) {
      console.error("Failed to read token from storage:", storageError);
      return null; // Exit if reading fails
  }

  if (pendingToken) {
    // console.log("Found pending invite token after login:", pendingToken);
    // IMPORTANT: Remove token IMMEDIATELY to prevent multiple attempts
    try {
        // localStorage.removeItem(LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY);
        clearGroupToken();
    } catch (storageError) {
        console.error("Failed to remove item from storage:", storageError);
        // Continue trying, but log the error
    }

    try {
      const functions = getFunctions(undefined, 'europe-west1'); // Adjust region if needed
      const joinFunction = httpsCallable< { token: string }, { success?: boolean; group?: Partial<FirestoreGroup>; message?: string } >(functions, 'joinGroupByToken');

      const result = await joinFunction({ token: pendingToken });

      // Wichtig: Daten sind im `data`-Objekt des Ergebnisses
      const data = result.data;

      if (data?.success && data.group && data.group.id) {
        const joinedGroup = data.group as FirestoreGroup; // Type assertion
        // console.log(`Successfully joined group '${joinedGroup.name}' via pending token. ID: ${joinedGroup.id}`);
        
        addUserGroup(joinedGroup);
        setCurrentGroup(joinedGroup as any);
        
        // Zeige nur Notification, wenn nicht unterdrückt
        if (!suppressNotification) {
          showNotification({ 
              message: `Du bist jetzt Mitglied der Gruppe '${joinedGroup.name}'.`,
              type: "success",
              duration: 5000,
          });
        }
        return joinedGroup.id; // Gib die ID zurück
      } else {
          console.error('Error joining group via pending token (success=false or group/id object missing):', data);
          const message = data?.message || 'Beitritt fehlgeschlagen. Ungültige Antwort von Funktion.';
          // Fehler-Notifications immer anzeigen
          showNotification({ 
             message: message,
             type: "error",
             duration: 7000,
          });
          return null; // Kein Erfolg oder keine ID
      }
    } catch (error: unknown) {
      console.error('Error joining group via pending token:', error);
      let message = 'Beitritt fehlgeschlagen. Der Code war ungültig oder ist abgelaufen.';
      if (error instanceof Error) {
           message = error.message || message;
      }
      // Fehler-Notifications immer anzeigen
      showNotification({ 
         message: message,
         type: "error",
         duration: 7000,
       });
       return null; // Fehler beim Aufruf
    }
  } else {
    // console.log('No pending invite token found after login.');
    return null; // Kein Token gefunden
  }
}; 