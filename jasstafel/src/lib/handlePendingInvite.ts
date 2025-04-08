import { getFunctions, httpsCallable } from 'firebase/functions';
import { LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY } from '../constants/appConstants';
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
 * @returns {Promise<string | null>} The ID of the joined group, or null if no group was joined or an error occurred.
 */
export const processPendingInviteToken = async (): Promise<string | null> => {
  const showNotification = useUIStore.getState().showNotification;
  const addUserGroup = useGroupStore.getState().addUserGroup;
  const setCurrentGroup = useGroupStore.getState().setCurrentGroup;

  let pendingToken: string | null = null;
  try {
      pendingToken = localStorage.getItem(LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY);
  } catch (storageError) {
      console.error("Failed to read from localStorage:", storageError);
      return null; // Exit if reading fails
  }

  if (pendingToken) {
    console.log('Found pending invite token after login:', pendingToken);
    // IMPORTANT: Remove token IMMEDIATELY to prevent multiple attempts
    try {
        localStorage.removeItem(LOCAL_STORAGE_PENDING_INVITE_TOKEN_KEY);
    } catch (storageError) {
        console.error("Failed to remove item from localStorage:", storageError);
        // Continue trying, but log the error
    }

    try {
      const functions = getFunctions(undefined, 'europe-west1'); // Adjust region if needed
      const joinFunction = httpsCallable(functions, 'joinGroupByToken');

      console.log(`Attempting to join group with pending token: ${pendingToken}`);
      const result = await joinFunction({ token: pendingToken });

      console.log("RAW Result from joinGroupByToken function:", JSON.stringify(result));

      const data = result.data as {success?: boolean, group?: Partial<FirestoreGroup>, message?: string};
      // Wichtig: Prüfe auf group.id!
      if (data?.success && data.group && data.group.id) {
          const joinedGroup = data.group as FirestoreGroup;
          console.log(`Successfully joined group '${joinedGroup.name}' via pending token. ID: ${joinedGroup.id}`);
          
          addUserGroup(joinedGroup);
          setCurrentGroup(joinedGroup as any);
          
          showNotification({ 
              message: `Du bist jetzt Mitglied der Gruppe '${joinedGroup.name}'.`,
              type: "success",
              duration: 5000,
          });
          return joinedGroup.id; // Gib die ID zurück
      } else {
          console.error('Error joining group via pending token (success=false or group/id object missing):', data);
          const message = data?.message || 'Beitritt fehlgeschlagen. Ungültige Antwort von Funktion.';
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
      showNotification({ 
         message: message,
         type: "error",
         duration: 7000,
       });
       return null; // Fehler beim Aufruf
    }
  } else {
    console.log('No pending invite token found after login.');
    return null; // Kein Token gefunden
  }
}; 