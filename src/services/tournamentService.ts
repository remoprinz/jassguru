import {
  doc,
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
  increment,
  setDoc,
  getFirestore
} from 'firebase/firestore';
import { db } from './firebaseInit'; // Nur db importieren
import { getPublicPlayerProfilesByUserIds } from './playerService';
import type {
  TournamentInstance,
  TournamentGame,
  TournamentSettings,
  PlayerPasseResult, // Sicherstellen, dass dieser Import vorhanden ist
  TournamentPlayerStats,
  PassePlayerDetail, // Sicherstellen, dass dieser Import vorhanden ist
} from '../types/tournament';
import type { PlayerNumber, PlayerNames, TeamPosition, FirestorePlayer, ActiveGame, TeamScores, StricheRecord, RoundEntry, ScoreSettings, StrokeSettings, GamePlayers, FarbeSettings, MemberInfo } from '../types/jass';
import { isJassRoundEntry } from '../types/jass'; // isJassRoundEntry importieren
import { firebaseApp } from './firebaseInit'; // firebaseApp importieren für Functions
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FieldValue } from 'firebase/firestore'; // FieldValue importieren
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage"; // NEU: Storage Imports

// NEU: Importiere Default Jass-Einstellungen
import { DEFAULT_SCORE_SETTINGS } from '@/config/ScoreSettings';
import { DEFAULT_STROKE_SETTINGS } from '@/config/GameSettings';
import { DEFAULT_FARBE_SETTINGS } from '@/config/FarbeSettings';

// --- Turnier Instanz Operationen ---

/**
 * Erstellt eine neue Turnierinstanz in Firestore.
 * @param groupId ID der zugehörigen Gruppe.
 * @param creatorUid ID des Benutzers, der das Turnier erstellt.
 * @param name Name des Turniers.
 * @param participantUids Array der UIDs der initialen Teilnehmer.
 * @param settings Turnier-Einstellungen.
 * @param initialStatus Initialer Status des Turniers.
 * @returns Die ID der neu erstellten Turnierinstanz.
 */
export const createTournamentInstance = async (
  groupId: string,
  creatorUid: string,
  name: string,
  participantUids: string[],
  settings: TournamentSettings,
  initialStatus: 'upcoming' | 'active' | 'completed' | 'archived' = 'upcoming'
): Promise<string> => {
  try {
    const tournamentsCol = collection(db, 'tournaments');
    
    // Stelle sicher, dass participantUids ein gültiges Array ist, auch wenn leer übergeben
    const finalParticipantUids = Array.isArray(participantUids) ? [...new Set([creatorUid, ...participantUids])] : [creatorUid];
    
    // Stelle sicher, dass adminIds korrekt initialisiert wird
    const adminIds = [creatorUid]; // Der Ersteller ist immer der erste Admin

    const newTournamentData: Omit<TournamentInstance, 'id'> = {
      groupId,
      name: name.trim(),
      description: '', // NEU: Leere Beschreibung initialisieren
      logoUrl: null, // NEU: logoUrl initialisieren
      instanceDate: null, 
      status: initialStatus, // Verwende den neuen Parameter
      createdBy: creatorUid,
      adminIds: adminIds, // KORREKT VERWENDET
      participantUids: finalParticipantUids,
      settings, // Hier sollten die Defaults bereits im Aufrufer (Store) verarbeitet worden sein
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedPasseCount: 0,
      currentActiveGameId: null, // NEU: Initialisieren
      lastActivity: serverTimestamp(), // NEU: Initialisieren
    };

    // Validierung: Prüfen, ob der Name gültig ist
    if (!newTournamentData.name || newTournamentData.name.length < 3) {
      throw new Error("Der Turniername muss mindestens 3 Zeichen lang sein.");
    }
    
    // Validierung: Mindestteilnehmer prüfen (wenn settings und minParticipants definiert sind)
    if (newTournamentData.settings && newTournamentData.settings.minParticipants && finalParticipantUids.length < newTournamentData.settings.minParticipants) {
        // Erlaube das Erstellen trotzdem, aber gib eine Warnung aus?
        // console.warn(`[tournamentService] Creating tournament with ${finalParticipantUids.length} participants, but minimum required is ${newTournamentData.settings.minParticipants}.`);
        // Optional: Hier einen Fehler werfen, wenn das Erstellen blockiert werden soll.
        // throw new Error(`Mindestens ${newTournamentData.settings.minParticipants} Teilnehmer sind erforderlich.`);
    }

    // console.log("[tournamentService] Creating tournament with data:", newTournamentData);
    const docRef = await addDoc(tournamentsCol, newTournamentData);
    // console.log(`[tournamentService] Tournament instance created successfully with ID: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    console.error("[tournamentService] Error creating tournament instance:", error);
    // Gib eine spezifischere Fehlermeldung zurück
    const message = error instanceof Error ? error.message : "Turnier konnte nicht erstellt werden.";
    throw new Error(message);
  }
};

/**
 * Ruft alle Turnierinstanzen für eine bestimmte Gruppe ab.
 * @param groupId ID der Gruppe.
 * @returns Ein Array von TournamentInstance-Objekten.
 */
export const fetchTournamentInstancesForGroup = async (
  groupId: string
): Promise<TournamentInstance[]> => {
  try {
    const tournamentsCol = collection(db, 'tournaments');
    const q = query(
      tournamentsCol,
      where("groupId", "==", groupId),
      orderBy("createdAt", "desc") // Neueste zuerst
    );
    const querySnapshot = await getDocs(q);
    const instances: TournamentInstance[] = [];
    querySnapshot.forEach((doc) => {
      // Füge die Dokument-ID zum Datenobjekt hinzu
      instances.push({ id: doc.id, ...doc.data() } as TournamentInstance);
    });
    // console.log(`[tournamentService] Fetched ${instances.length} tournament instances for group ${groupId}.`);
    return instances;
  } catch (error) {
    console.error(`[tournamentService] Error fetching tournaments for group ${groupId}:`, error);
    throw new Error("Turniere konnten nicht geladen werden.");
  }
};

/**
 * Holt die Details einer einzelnen Turnierinstanz.
 * @param instanceId ID der Turnierinstanz.
 * @returns Das TournamentInstance-Objekt oder null, wenn nicht gefunden.
 */
export const fetchTournamentInstanceDetails = async (
  instanceId: string
): Promise<TournamentInstance | null> => {
  try {
    const docRef = doc(db, 'tournaments', instanceId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      // console.log(`[tournamentService] Fetched details for tournament instance: ${instanceId}`); // Kann bleiben, ist nicht zu gesprächig
      const data = docSnap.data();
      // EXPLIZITES DEBUGGING für updatedAt kann jetzt entfernt werden
      // console.log('[tournamentService DEBUG] docSnap.data().updatedAt raw:', data.updatedAt);
      // if (data.updatedAt && typeof (data.updatedAt as any).toDate === 'function') {
      //   console.log('[tournamentService DEBUG] docSnap.data().updatedAt is a Firestore Timestamp. Date:', (data.updatedAt as Timestamp).toDate());
      // } else {
      //   console.warn('[tournamentService DEBUG] docSnap.data().updatedAt is NOT a Firestore Timestamp or toDate is not a function.');
      // }
      return { id: docSnap.id, ...data } as TournamentInstance;
    } else {
      console.warn(`[tournamentService] Tournament instance with ID ${instanceId} not found.`);
      return null;
    }
  } catch (error) {
    console.error(`[tournamentService] Error fetching tournament details for ${instanceId}:`, error);
    // Wirf den Fehler nicht weiter, damit der Store null zurückgeben kann
    // throw new Error("Turnierdetails konnten nicht geladen werden.");
    return null; // Gib null bei Fehler zurück
  }
};

/**
 * Ruft das aktuell aktive Turnier ab, an dem ein Benutzer teilnimmt.
 * @param userId ID des Benutzers.
 * @returns Das TournamentInstance-Objekt des aktivsten Turniers oder null, wenn keins gefunden wurde.
 */
export const fetchActiveTournamentForUser = async (
  userId: string
): Promise<TournamentInstance | null> => {
  if (!userId) {
    // console.warn("[tournamentService] fetchActiveTournamentForUser called without userId.");
    return null;
  }

  try {
    const tournamentsCol = collection(db, 'tournaments');
    const q = query(
      tournamentsCol,
      where("participantUids", "array-contains", userId),
      where("status", "==", "active"),
      orderBy("createdAt", "desc"), // Das zuletzt erstellte aktive Turnier
      limit(1)
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docData = querySnapshot.docs[0].data();
      const docId = querySnapshot.docs[0].id;
      // console.log(`[tournamentService] Active tournament found for user ${userId}: ${docId}`);
      return { ...docData, id: docId } as TournamentInstance;
    }
    
    // console.log(`[tournamentService] No active tournament found for user ${userId}.`);
    return null;
  } catch (error) {
    console.error("Error fetching active tournament:", error);
    return null;
  }
};

/**
 * Aktualisiert allgemeine Felder einer Turnierinstanz.
 * @param instanceId ID der Turnierinstanz.
 * @param data Die zu aktualisierenden Daten.
 */
export const updateTournamentInstanceData = async (
  instanceId: string,
  data: Partial<Pick<TournamentInstance, 'name' | 'description' | 'logoUrl' | 'instanceDate' | 'status'>>
): Promise<void> => {
  console.log(`Updating data for tournament instance ${instanceId}`, data);
  const docRef = doc(db, 'tournaments', instanceId);
  // Stelle sicher, dass updatedAt immer mit aktualisiert wird
  const dataToUpdate = {
    ...data,
    updatedAt: serverTimestamp(),
  };
  await updateDoc(docRef, dataToUpdate);
};

// --- Teilnehmer Operationen ---

/**
 * Fügt einen Teilnehmer zu einer Turnierinstanz hinzu.
 * @param instanceId ID der Turnierinstanz.
 * @param userId ID des hinzuzufügenden Users.
 */
export const addParticipantToTournament = async (
  instanceId: string,
  userId: string
): Promise<void> => {
  console.log(`[tournamentService] Adding participant ${userId} to tournament instance ${instanceId}`);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    // Optional: Prüfen, ob Turnier noch aktiv ist?
    // const tournamentSnap = await getDoc(docRef);
    // if (tournamentSnap.exists() && (tournamentSnap.data().status === 'completed' || tournamentSnap.data().status === 'archived')) {
    //   throw new Error("Teilnehmer können nicht zu einem abgeschlossenen oder archivierten Turnier hinzugefügt werden.");
    // }
    await updateDoc(docRef, {
      participantUids: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
    console.log(`[tournamentService] Participant ${userId} successfully added to tournament ${instanceId}.`);
  } catch (error) {
    console.error(`[tournamentService] Error adding participant ${userId} to tournament ${instanceId}:`, error);
    throw new Error("Teilnehmer konnte nicht zum Turnier hinzugefügt werden.");
  }
};

/**
 * Fügt mehrere Teilnehmer auf einmal zu einer Turnierinstanz hinzu.
 * Verwendet arrayUnion, um Duplikate zu vermeiden.
 * @param instanceId ID der Turnierinstanz.
 * @param userIds Array der UIDs der hinzuzufügenden User.
 */
export const addParticipantsToTournamentBatch = async (
  instanceId: string,
  userIds: string[]
): Promise<void> => {
  if (!userIds || userIds.length === 0) {
    console.log("[tournamentService] No user IDs provided to addParticipantsToTournamentBatch.");
    return; // Nichts zu tun
  }
  console.log(`[tournamentService] Adding batch of ${userIds.length} participants to tournament instance ${instanceId}`);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    // Firestore's arrayUnion kann direkt mit einem Array von Werten umgehen.
    await updateDoc(docRef, {
      participantUids: arrayUnion(...userIds),
      updatedAt: serverTimestamp(),
    });
    console.log(`[tournamentService] Batch of participants successfully added to tournament ${instanceId}.`);
  } catch (error) {
    console.error(`[tournamentService] Error adding batch of participants to tournament ${instanceId}:`, error);
    throw new Error("Teilnehmer-Batch konnte nicht zum Turnier hinzugefügt werden.");
  }
};

/**
 * Entfernt einen Teilnehmer aus einer Turnierinstanz.
 * Stellt sicher, dass der Teilnehmer auch aus den Admins entfernt wird, falls er dort war.
 * Verhindert das Entfernen des letzten Admins, falls der zu entfernende Teilnehmer der letzte Admin ist.
 * Blockiert die Aktion, wenn das Turnier abgeschlossen oder archiviert ist.
 * @param instanceId ID der Turnierinstanz.
 * @param userId ID des zu entfernenden Users.
 */
export const removeParticipantFromTournament = async (
  instanceId: string,
  userId: string
): Promise<void> => {
  console.log(`[tournamentService] Removing participant ${userId} from tournament instance ${instanceId}`);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    const tournamentSnap = await getDoc(docRef);
    if (!tournamentSnap.exists()) {
      throw new Error("Turnier nicht gefunden.");
    }
    const tournamentData = tournamentSnap.data() as TournamentInstance;

    // Prüfe Turnierstatus
    if (tournamentData.status === 'completed' || tournamentData.status === 'archived') {
      console.warn(`[tournamentService] Cannot remove participant from completed/archived tournament ${instanceId}.`);
      throw new Error("Teilnehmer können nicht aus einem abgeschlossenen oder archivierten Turnier entfernt werden.");
    }

    const isAdmin = tournamentData.adminIds?.includes(userId);
    if (isAdmin && tournamentData.adminIds?.length === 1) {
      if (tournamentData.participantUids?.length === 1 && tournamentData.participantUids[0] === userId) {
         console.warn(`[tournamentService] Cannot remove participant ${userId} as they are the last participant and last admin.`);
         throw new Error("Der letzte Teilnehmer kann nicht entfernt werden, wenn er auch der einzige Admin ist.");
      } 
      console.warn(`[tournamentService] Participant ${userId} is an admin. Consider admin role transfer before removal if they are the last admin and other participants exist.`);
    }

    const updateData: any = {
      participantUids: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    };

    if (isAdmin && (tournamentData.adminIds?.length ?? 0) > 1) {
      updateData.adminIds = arrayRemove(userId);
      console.log(`[tournamentService] Also removing ${userId} from adminIds.`);
    } else if (isAdmin && (tournamentData.adminIds?.length ?? 0) === 1) {
      console.warn(`[tournamentService] Participant ${userId} is the last admin. Not removing from adminIds via this function directly. Use removeTournamentAdmin with caution or ensure new admin is appointed first.`);
    }

    await updateDoc(docRef, updateData);
    console.log(`[tournamentService] Participant ${userId} successfully removed from tournament ${instanceId}.`);
  } catch (error) {
    console.error(`[tournamentService] Error removing participant ${userId} from tournament ${instanceId}:`, error);
    if (error instanceof Error && (error.message.includes("letzte Teilnehmer") || error.message.includes("Turnier nicht gefunden") || error.message.includes("abgeschlossenen oder archivierten"))) {
        throw error; 
    }
    throw new Error("Teilnehmer konnte nicht aus dem Turnier entfernt werden.");
  }
};

/**
 * Fügt einen User zur Admin-Liste eines Turniers hinzu.
 * Der User muss bereits Teilnehmer des Turniers sein.
 * Blockiert die Aktion, wenn das Turnier abgeschlossen oder archiviert ist.
 * @param instanceId ID der Turnierinstanz.
 * @param userId ID des Users, der zum Admin ernannt werden soll.
 */
export const addTournamentAdmin = async (
  instanceId: string,
  userId: string
): Promise<void> => {
  console.log(`[tournamentService] Making user ${userId} admin for tournament instance ${instanceId}`);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    const tournamentSnap = await getDoc(docRef);
    if (!tournamentSnap.exists()) {
      throw new Error("Turnier nicht gefunden.");
    }
    const tournamentData = tournamentSnap.data() as TournamentInstance;

    // Prüfe Turnierstatus
    if (tournamentData.status === 'completed' || tournamentData.status === 'archived') {
      console.warn(`[tournamentService] Cannot add admin to completed/archived tournament ${instanceId}.`);
      throw new Error("Admins können nicht zu einem abgeschlossenen oder archivierten Turnier hinzugefügt werden.");
    }

    if (!tournamentData.participantUids?.includes(userId)) {
      console.warn(`[tournamentService] User ${userId} is not a participant of tournament ${instanceId}. Cannot make admin.`);
      throw new Error("Nur Turnierteilnehmer können zu Admins ernannt werden.");
    }

    await updateDoc(docRef, {
      adminIds: arrayUnion(userId),
      participantUids: arrayUnion(userId),
      updatedAt: serverTimestamp(),
    });
    console.log(`[tournamentService] User ${userId} successfully made admin in tournament ${instanceId}.`);
  } catch (error) {
    console.error(`[tournamentService] Error making user ${userId} admin for tournament ${instanceId}:`, error);
     if (error instanceof Error && (error.message.includes("Nur Turnierteilnehmer") || error.message.includes("Turnier nicht gefunden") || error.message.includes("abgeschlossenen oder archivierten"))) {
        throw error; 
    }
    throw new Error("Admin-Status konnte nicht zugewiesen werden.");
  }
};

/**
 * Entfernt einen User aus der Admin-Liste eines Turniers.
 * Stellt sicher, dass nicht der letzte Admin entfernt wird.
 * Verhindert, dass der Gründer entfernt wird.
 * Blockiert die Aktion, wenn das Turnier abgeschlossen oder archiviert ist.
 * @param instanceId ID der Turnierinstanz.
 * @param userId ID des Users, dessen Admin-Status entfernt werden soll.
 */
export const removeTournamentAdmin = async (
  instanceId: string,
  userId: string
): Promise<void> => {
  console.log(`[tournamentService] Removing admin rights for user ${userId} from tournament instance ${instanceId}`);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    const tournamentSnap = await getDoc(docRef);
    if (!tournamentSnap.exists()) {
      throw new Error("Turnier nicht gefunden.");
    }
    const tournamentData = tournamentSnap.data() as TournamentInstance;

    // Prüfe Turnierstatus
    if (tournamentData.status === 'completed' || tournamentData.status === 'archived') {
      console.warn(`[tournamentService] Cannot remove admin from completed/archived tournament ${instanceId}.`);
      throw new Error("Admin-Status kann bei einem abgeschlossenen oder archivierten Turnier nicht entfernt werden.");
    }

    // Prüfe, ob es der Gründer ist
    if (userId === tournamentData.createdBy) {
      console.warn(`[tournamentService] Cannot remove founder ${userId} as admin.`);
      throw new Error("Der Gründer des Turniers kann nicht als Admin entfernt werden.");
    }

    if (tournamentData.adminIds?.includes(userId) && tournamentData.adminIds?.length === 1) {
      console.warn(`[tournamentService] Cannot remove user ${userId} as they are the last admin.`);
      throw new Error("Der letzte Admin kann nicht entfernt werden. Bitte ernenne zuerst einen neuen Admin.");
    }

    await updateDoc(docRef, {
      adminIds: arrayRemove(userId),
      updatedAt: serverTimestamp(),
    });
    console.log(`[tournamentService] Admin status for user ${userId} successfully removed in tournament ${instanceId}.`);
  } catch (error) {
    console.error(`[tournamentService] Error removing admin rights for user ${userId} from tournament ${instanceId}:`, error);
    if (error instanceof Error && (error.message.includes("letzte Admin") || error.message.includes("Turnier nicht gefunden") || error.message.includes("Gründer") || error.message.includes("abgeschlossenen oder archivierten"))) {
        throw error; 
    }
    throw new Error("Admin-Status konnte nicht entfernt werden.");
  }
};

/**
 * Ermöglicht einem Teilnehmer, sich selbst aus einem aktiven Turnier zu entfernen.
 * Entfernt den User nur aus der Teilnehmerliste, nicht aus der Admin-Liste.
 * @param instanceId ID der Turnierinstanz.
 * @param userId ID des Users, der das Turnier verlassen möchte.
 */
export const leaveTournament = async (
  instanceId: string,
  userId: string
): Promise<void> => {
  console.log(`[tournamentService] User ${userId} attempting to leave tournament instance ${instanceId}`);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    const tournamentSnap = await getDoc(docRef);
    if (!tournamentSnap.exists()) {
      throw new Error("Turnier nicht gefunden.");
    }
    const tournamentData = tournamentSnap.data() as TournamentInstance;

    // Prüfe Turnierstatus - Nur aus aktiven Turnieren austreten?
    // Ggf. auch aus 'upcoming' falls wir diesen Status einführen?
    if (tournamentData.status !== 'active') {
      console.warn(`[tournamentService] Cannot leave a tournament that is not active (status: ${tournamentData.status}). Instance: ${instanceId}.`);
      throw new Error("Du kannst nur aus einem laufenden Turnier austreten.");
    }
    
    // Prüfe, ob der User überhaupt Teilnehmer ist
    if (!tournamentData.participantUids?.includes(userId)) {
        console.warn(`[tournamentService] User ${userId} is not a participant of tournament ${instanceId}. Cannot leave.`);
        // Wir werfen hier keinen Fehler, der User ist einfach nicht dabei.
        // Oder einen spezifischen Fehler werfen? Fürs erste: Einfach nichts tun.
        return; 
    }
    
    // TODO: Prüfen, ob bereits Spiele in der `games`-Subcollection existieren?
    // Wenn ja, könnte man das Verlassen verhindern oder anders handhaben.
    // Vorerst erlauben wir das Verlassen, solange status === 'active'.

    const isLastParticipant = tournamentData.participantUids?.length === 1 && tournamentData.participantUids[0] === userId;

    if (tournamentData.adminIds?.includes(userId) && !isLastParticipant) {
      throw new Error('Der letzte Admin kann das Turnier nicht verlassen, wenn noch andere Teilnehmer vorhanden sind. Bitte ernennen Sie zuerst einen neuen Admin.');
    }

    const updateData: any = {
      participantUids: arrayRemove(userId)
    };

    if (tournamentData.adminIds?.includes(userId) && !isLastParticipant) {
      updateData.adminIds = arrayRemove(userId);
    }

    // Stelle sicher, dass updatedAt immer gesetzt wird
    updateData.updatedAt = serverTimestamp();

    await updateDoc(docRef, updateData);
    console.log(`[tournamentService] User ${userId} successfully left tournament ${instanceId} (removed from participants).`);
  } catch (error) {
    console.error(`[tournamentService] Error allowing user ${userId} to leave tournament ${instanceId}:`, error);
    if (error instanceof Error && (error.message.includes("laufenden Turnier") || error.message.includes("Turnier nicht gefunden"))) {
        throw error; 
    }
    throw new Error("Austreten aus dem Turnier fehlgeschlagen.");
  }
};

/**
 * Ruft die Teilnehmerdaten für ein Turnier ab.
 * @param instanceId ID der Turnierinstanz.
 * @returns Ein Array von FirestorePlayer-Objekten oder eine leere Liste bei Fehlern.
 */
export const fetchTournamentParticipants = async (
  instanceId: string
): Promise<FirestorePlayer[]> => {
  try {
    // 1. Turnierinstanz laden, um Teilnehmer-UIDs zu bekommen
    const tournament = await fetchTournamentInstanceDetails(instanceId);
    if (!tournament || !tournament.participantUids || tournament.participantUids.length === 0) {
      console.log(`[tournamentService] No participants found or tournament ${instanceId} not found.`);
      return [];
    }

    const participantUids = tournament.participantUids;
    console.log(`[tournamentService] Found ${participantUids.length} participant UIDs for tournament ${instanceId}:`, participantUids);

    // 2. Rufe alle Spielerprofile auf einmal mit der neuen Service-Funktion ab.
    const validParticipants = await getPublicPlayerProfilesByUserIds(participantUids);

    // Optional: Sortiere die Teilnehmer nach Namen
    validParticipants.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

    console.log(`[tournamentService] Fetched ${validParticipants.length} detailed participant profiles for tournament ${instanceId}.`);
    return validParticipants;

  } catch (error) {
    console.error(`[tournamentService] Error fetching participants for tournament ${instanceId}:`, error);
    return [];
  }
};

// --- Aktive Passe Operationen ---

/**
 * Startet eine neue Passe innerhalb eines Turniers.
 * Erstellt ein neues Dokument in 'activeGames'.
 * @param instanceId ID der Turnierinstanz.
 * @param passeNumber Die Nummer dieser Passe (z.B. 1, 2, 3...).
 * @param players Array der Spieler (UIDs und Namen), die an dieser Passe teilnehmen.
 * @param startingPlayer Der Spieler, der diese Passe beginnt.
 * @returns Die ID des neu erstellten activeGame Dokuments.
 */
export const startTournamentPasseService = async (
  instanceId: string,
  passeNumber: number,
  players: { uid: string; name: string; playerNumber: PlayerNumber }[],
  startingPlayer: PlayerNumber
): Promise<ActiveGame | null> => {
  const db = getFirestore(firebaseApp);
  const tournamentDocRef = doc(db, 'tournaments', instanceId);

  try {
    const tournamentSnap = await getDoc(tournamentDocRef);
    if (!tournamentSnap.exists()) {
      throw new Error(`Tournament instance ${instanceId} not found.`);
    }
    const tournamentData = tournamentSnap.data() as TournamentInstance;

    const teamBottomNumbers: PlayerNumber[] = players
      .filter(p => p.playerNumber === 1 || p.playerNumber === 3)
      .map(p => p.playerNumber) as PlayerNumber[];
    const teamTopNumbers: PlayerNumber[] = players
      .filter(p => p.playerNumber === 2 || p.playerNumber === 4)
      .map(p => p.playerNumber) as PlayerNumber[];

    if (teamBottomNumbers.length !== 2 || teamTopNumbers.length !== 2) {
      throw new Error('Ungültige Spielerzuweisung zu Teams. Es müssen 2 Spieler pro Team sein.');
    }
    
    const playerNames: PlayerNames = {
      1: players.find(p => p.playerNumber === 1)?.name || 'Spieler 1',
      2: players.find(p => p.playerNumber === 2)?.name || 'Spieler 2',
      3: players.find(p => p.playerNumber === 3)?.name || 'Spieler 3',
      4: players.find(p => p.playerNumber === 4)?.name || 'Spieler 4',
    };

    const passeParticipantUids = players.map(p => p.uid);

    const gamePlayers: GamePlayers = {
      1: players.find(p => p.playerNumber === 1) ? { type: 'member', uid: players.find(p => p.playerNumber === 1)!.uid, name: players.find(p => p.playerNumber === 1)!.name } : null,
      2: players.find(p => p.playerNumber === 2) ? { type: 'member', uid: players.find(p => p.playerNumber === 2)!.uid, name: players.find(p => p.playerNumber === 2)!.name } : null,
      3: players.find(p => p.playerNumber === 3) ? { type: 'member', uid: players.find(p => p.playerNumber === 3)!.uid, name: players.find(p => p.playerNumber === 3)!.name } : null,
      4: players.find(p => p.playerNumber === 4) ? { type: 'member', uid: players.find(p => p.playerNumber === 4)!.uid, name: players.find(p => p.playerNumber === 4)!.name } : null,
    };

    const scoreSettings: ScoreSettings = tournamentData.settings?.scoreSettings ?? DEFAULT_SCORE_SETTINGS;
    const strokeSettings: StrokeSettings = tournamentData.settings?.strokeSettings ?? DEFAULT_STROKE_SETTINGS;
    const farbeSettings: FarbeSettings = tournamentData.settings?.farbeSettings ?? DEFAULT_FARBE_SETTINGS;

    // Stelle sicher, dass startingPlayer als Zahl gespeichert wird
    const numericStartingPlayer = Number(startingPlayer);
    
    const newPasseData = {
      groupId: tournamentData.groupId, 
      sessionId: instanceId, 
      tournamentInstanceId: instanceId, 
      status: 'live',
      participantUids: passeParticipantUids,
      playerNames,
      gamePlayers, 
      teams: { 
        top: teamTopNumbers, 
        bottom: teamBottomNumbers, 
      },
      scores: { top: 0, bottom: 0 } as TeamScores,
      striche: {
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } as StricheRecord,
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 } as StricheRecord,
      },
      weisPoints: { top: 0, bottom: 0 } as TeamScores,
      currentRound: 1,
      currentGameNumber: passeNumber, 
      startingPlayer: numericStartingPlayer,
      initialStartingPlayer: numericStartingPlayer,
      currentPlayer: numericStartingPlayer,
      isRoundCompleted: false,
      isGameCompleted: false,
      activeScoreSettings: scoreSettings,
      activeStrokeSettings: strokeSettings,
      activeFarbeSettings: farbeSettings,
    };

    const activeTournamentGamesCol = collection(db, 'activeGames');
    try {
      const activeGameDocRef = await addDoc(activeTournamentGamesCol, newPasseData as Omit<ActiveGame, 'createdAt' | 'lastUpdated' | 'status' | 'gameStartTime' | 'jassStartTime' | 'activeGameId'>);
      
      await updateDoc(activeGameDocRef, {
        activeGameId: activeGameDocRef.id,
        createdAt: serverTimestamp(),      
        lastUpdated: serverTimestamp(),
        gameStartTime: serverTimestamp(),
        jassStartTime: serverTimestamp()
      });

      const sessionDocRef = doc(db, 'sessions', instanceId);
      const sessionData = {
        gruppeId: tournamentData.groupId,
        startedAt: tournamentData.createdAt ?? serverTimestamp(),
        playerNames: playerNames,
        participantUids: tournamentData.participantUids,
        status: 'active',
        isTournamentSession: true,
        currentActiveGameId: activeGameDocRef.id,
        tournamentInstanceId: instanceId,
        lastActivity: serverTimestamp(),
      };
      
      try {
        await setDoc(sessionDocRef, sessionData, { merge: true });
      } catch (sessionError) {
        console.error(`[tournamentService] Error creating/updating session document ${instanceId}:`, sessionError);
      }
      
      const tournamentDocRef = doc(db, 'tournaments', instanceId);
      try {
        await updateDoc(tournamentDocRef, {
          currentActiveGameId: activeGameDocRef.id,
          updatedAt: serverTimestamp(),
          lastActivity: serverTimestamp()
        });
      } catch (tournamentUpdateError) {
        console.error(`[tournamentService] Error updating tournament document ${instanceId} with active game ID:`, tournamentUpdateError);
      }

      try {
        const newGameSnap = await getDoc(activeGameDocRef);
        if (newGameSnap.exists()) {
          const createdGame = { activeGameId: newGameSnap.id, ...newGameSnap.data() } as ActiveGame;
          return createdGame;
        } else {
          console.error('[tournamentService ERROR] Failed to fetch newly created passe document.');
          return null;
        }
      } catch (fetchError) {
        console.error('[tournamentService ERROR] Error fetching newly created passe:', fetchError);
        return null;
      }
    } catch (innerError) {
      console.error('[tournamentService ERROR] Error in inner try-block of startTournamentPasseService:', innerError);
      return null;
    }
  } catch (outerError) {
    console.error('[tournamentService ERROR] Error in outer try-block of startTournamentPasseService:', outerError);
    return null;
  }
};

/**
 * Sucht nach einer laufenden Turnier-Passe für einen bestimmten User in einer Instanz.
 * @param instanceId ID der Turnierinstanz.
 * @param userId ID des Users.
 * @returns Das aktive Turnier-Passe-Dokument oder null.
 */
export const fetchActivePasseForUser = async (
  instanceId: string,
  userId: string
): Promise<ActiveGame | null> => {
  console.log(`Fetching active passe for user ${userId} in instance ${instanceId}`);
  const q = query(
    collection(db, 'activeGames'),
    where('tournamentInstanceId', '==', instanceId),
    where('participantUids', 'array-contains', userId),
    where('status', '==', 'live'),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return null;
  }
  const gameDoc = snapshot.docs[0];
  const data = gameDoc.data();

  const requiredFields: (keyof Omit<ActiveGame, 'tournamentInstanceId' | 'activeGameId' | 'currentJassPoints' | 'isRoundCompleted' | 'gamePlayers' | 'gameStartTime' | 'jassStartTime'>)[] = [
    'groupId', 'sessionId', 'currentGameNumber', 'participantUids', 'status',
    'playerNames', 'teams', 'scores', 'striche', 'weisPoints', 'currentPlayer',
    'currentRound', 'startingPlayer', 'initialStartingPlayer', 'createdAt', 'lastUpdated'
  ];

  for (const field of requiredFields) {
    if (data[field] === undefined) {
      console.error(`[tournamentService] Fetched active game ${gameDoc.id} is missing required field: ${field}. Data:`, data);
      // Hier könnte man null zurückgeben oder einen Fehler werfen, wenn ein kritisches Feld fehlt.
      // Für den Moment loggen wir nur und verlassen uns auf die Defaults unten.
    }
  }

  const activeGame: ActiveGame = {
    // id: gameDoc.id, // Entfernt, da 'id' nicht Teil des ActiveGame Typs ist.
                    // Die ID ist gameDoc.id und kann vom Aufrufer separat behandelt werden.
                    // Optional könnte man activeGameId hier setzen, wenn es die Dokument-ID sein soll.
    activeGameId: gameDoc.id, // Setze die Dokument ID in das optionale activeGameId Feld
    groupId: data.groupId, 
    sessionId: data.sessionId, 
    tournamentInstanceId: data.tournamentInstanceId,
    currentGameNumber: data.currentGameNumber || 0, 
    participantUids: data.participantUids || [],
    status: data.status || 'aborted', 
    playerNames: data.playerNames || { 1: '', 2: '', 3: '', 4: '' },
    teams: data.teams || { top: [], bottom: [] },
    scores: data.scores || { top: 0, bottom: 0 },
    striche: data.striche || {
        top: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 },
        bottom: { berg: 0, sieg: 0, matsch: 0, schneider: 0, kontermatsch: 0 }
    },
    weisPoints: data.weisPoints || { top: 0, bottom: 0 },
    currentPlayer: data.currentPlayer, 
    currentRound: data.currentRound || 1,
    startingPlayer: data.startingPlayer, 
    initialStartingPlayer: data.initialStartingPlayer, 
    currentJassPoints: data.currentJassPoints, 
    isRoundCompleted: data.isRoundCompleted, 
    gamePlayers: data.gamePlayers, 
    gameStartTime: data.gameStartTime, 
    jassStartTime: data.jassStartTime, 
    createdAt: data.createdAt || Timestamp.now(),
    lastUpdated: data.lastUpdated || Timestamp.now(),
  };
  return activeGame;
};

/**
 * Schließt eine aktive Turnier-Passe ab.
 * Diese Funktion wird typischerweise durch eine Cloud Function getriggert oder aufgerufen,
 * die eine Firestore Transaction ausführt, um:
 * 1. Das `TournamentGame` (Passe-Ergebnis) in der Subcollection zu erstellen.
 * 2. Das zugehörige `activeGame`-Dokument zu aktualisieren/löschen.
 * 3. (Optional) Aggregierte Statistiken im `TournamentInstance`-Dokument zu aktualisieren.
 *
 * @param activePasseId ID des zu beendenden activeGame Dokuments.
 * @param finalPasseData Die finalen Daten der Passe (TournamentGame), die gespeichert werden sollen.
 * @returns Promise<void>
 */
export const completeTournamentPasse = async (
  activePasseId: string,
  finalPasseData: TournamentGame
): Promise<void> => {
  console.warn(`[tournamentService] completeTournamentPasse (ID: ${activePasseId}) called. 
                 Implementation requires a Cloud Function with Transaction.`);
  console.log("[tournamentService] Final Passe Data:", finalPasseData);
  // Hier würde der Aufruf zur Cloud Function erfolgen oder die Logik implementiert,
  // ABER Transaktionen sollten serverseitig laufen.
  
  // === KORREKTUR ===
  const tournamentDocRef = doc(db, 'tournaments', finalPasseData.tournamentInstanceId);
  // === ENDE KORREKTUR ===

  // TODO: Transaktionale Updates wären hier sicherer, um Konsistenz zu gewährleisten.
  try {
    // 1. Aktive Passe als abgeschlossen markieren und finale Daten speichern
    const activePasseDocRef = doc(db, 'activeGames', activePasseId);
    await updateDoc(activePasseDocRef, {
      ...finalPasseData, // Enthält Spielergebnisse, Punkte etc.
      status: 'completed',
      completedAt: serverTimestamp(), // Zeitstempel für Abschluss der Passe
    });

    // 2. Turnierinstanz aktualisieren (z.B. completedPasseCount)
    // Hier könnten auch Spieler-Gesamtstatistiken aggregiert und im Turnierdokument gespeichert werden.
    await updateDoc(tournamentDocRef, {
      completedPasseCount: increment(1),
      // Beispiel: status könnte hier auf 'completed' gesetzt werden, wenn alle Passen gespielt sind
      // basierend auf tournament.settings.numberOfPasses oder ähnlichem.
      updatedAt: serverTimestamp(), // WICHTIG: updatedAt für die Turnierinstanz setzen
    });

    console.log(`[tournamentService] Passe ${activePasseId} completed and tournament ${finalPasseData.tournamentInstanceId} updated.`);

  } catch (error) {
    console.error(`[tournamentService] Error completing tournament passe ${activePasseId}:`, error);
    throw new Error("Completion logic should be server-side.");
  }
};

/**
 * Ruft alle abgeschlossenen Spiele (Passen) für ein Turnier ab.
 * @param instanceId ID der Turnierinstanz.
 * @returns Ein Array von TournamentGame-Objekten.
 */
export const fetchTournamentGames = async (
  instanceId: string
): Promise<TournamentGame[]> => {
  try {
    // Der Pfad zur Subcollection der abgeschlossenen Spiele/Passen
    const gamesColRef = collection(db, 'tournaments', instanceId, 'games');
    // Sortiere nach Passennummer, um eine konsistente Reihenfolge zu gewährleisten
    const q = query(gamesColRef, orderBy("passeNumber", "asc")); 
    
    const querySnapshot = await getDocs(q);
    const games: TournamentGame[] = [];
    querySnapshot.forEach((doc) => {
      // Füge die Dokument-ID als passeId zum Datenobjekt hinzu
      games.push({ passeId: doc.id, ...doc.data() } as TournamentGame);
    });
    
    console.log(`[tournamentService] Fetched ${games.length} completed games/passen for tournament ${instanceId}.`);
    return games;
  } catch (error) {
    console.error(`[tournamentService] Error fetching completed games for tournament ${instanceId}:`, error);
    throw new Error("Abgeschlossene Turnierspiele konnten nicht geladen werden.");
  }
};

/**
 * Ruft alle Runden für eine bestimmte Passe eines Turniers ab.
 * @param instanceId ID der Turnierinstanz.
 * @param passeId ID der Passe (entspricht der Game-ID in der Subcollection).
 * @returns Ein Array von RoundEntry-Objekten.
 */
export const fetchPasseRounds = async (
  instanceId: string,
  passeId: string
): Promise<RoundEntry[]> => {
  try {
    const roundsColRef = collection(db, 'tournaments', instanceId, 'games', passeId, 'rounds');
    const q = query(roundsColRef, orderBy("roundState.roundNumber", "asc")); 
    
    const querySnapshot = await getDocs(q);
    const rounds: RoundEntry[] = [];
    querySnapshot.forEach((doc) => {
      // Linter-Fehler umgehen: Expliziter Cast über any
      // Dies setzt voraus, dass die Daten in Firestore tatsächlich der RoundEntry-Struktur entsprechen.
      // Eine Validierung oder genauere Typanpassung wäre ideal.
      const roundData = { roundId: doc.id, ...doc.data() };
      rounds.push(roundData as any as RoundEntry); 
    });
    
    console.log(`[tournamentService] Fetched ${rounds.length} rounds for passe ${passeId} in tournament ${instanceId}.`);
    return rounds;
  } catch (error) {
    console.error(`[tournamentService] Error fetching rounds for passe ${passeId} in tournament ${instanceId}:`, error);
    throw new Error(`Runden für Passe ${passeId} konnten nicht geladen werden.`);
  }
};

/**
 * Aktualisiert Daten einer laufenden (aktiven) Turnier-Passe.
 * @param activePasseId Die ID des activeGame-Dokuments für die Passe.
 * @param updates Die zu aktualisierenden Felder.
 */
export const updateActiveTournamentPasse = async (
  activePasseId: string,
  updates: Partial<Omit<ActiveGame, 'activeGameId' | 'createdAt'>>
): Promise<void> => {
  console.log(`Updating active passe ${activePasseId}`, updates);
  const docRef = doc(db, 'activeGames', activePasseId);
  await updateDoc(docRef, {
    ...updates,
    lastUpdated: serverTimestamp(),
  });
  // TODO: Implement Firestore updateDoc logic
  // throw new Error("Not implemented yet");
};

/**
 * Aktualisiert die Einstellungen einer Turnierinstanz.
 * @param instanceId ID der Turnierinstanz.
 * @param settingsToUpdate Teilobjekt der Turnier-Einstellungen, die aktualisiert werden sollen.
 */
export const updateTournamentSettings = async (
  instanceId: string,
  settingsToUpdate: Partial<TournamentSettings>
): Promise<void> => {
  console.log(`Updating settings for tournament instance ${instanceId}:`, settingsToUpdate);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    const updates: { [key: string]: any } = { // Verwende ein allgemeineres Objekt für Updates
      updatedAt: serverTimestamp(),
    };

    // logoUrl separat behandeln und direkt auf der obersten Ebene setzen/entfernen
    if (settingsToUpdate.hasOwnProperty('logoUrl')) {
      updates.logoUrl = settingsToUpdate.logoUrl; // Kann auch null sein, um es zu entfernen
    }

    // Für alle anderen Einstellungen, die in settingsToUpdate enthalten sind,
    // erstelle Pfade mit "dot notation" für das 'settings'-Unterobjekt.
    const settingsSubUpdates: { [key: string]: any } = {};
    for (const key in settingsToUpdate) {
      if (settingsToUpdate.hasOwnProperty(key) && key !== 'logoUrl') {
        // Stelle sicher, dass der Key ein gültiger Schlüssel von TournamentSettings ist
        const typedKey = key as keyof Omit<TournamentSettings, 'logoUrl'>;
        settingsSubUpdates[`settings.${typedKey}`] = settingsToUpdate[typedKey];
      }
    }

    if (Object.keys(settingsSubUpdates).length > 0) {
      // Füge die Unter-Updates zum Haupt-Update-Objekt hinzu
      Object.assign(updates, settingsSubUpdates);
    }

    // Nur updaten, wenn tatsächlich Änderungen vorhanden sind (ausser updatedAt)
    if (Object.keys(updates).length > 1) { 
      await updateDoc(docRef, updates);
      console.log(`[tournamentService] Successfully updated settings for tournament ${instanceId} with data:`, updates);
    } else {
      console.log(`[tournamentService] No specific settings (besides logo or updatedAt) to update for tournament ${instanceId}.`);
      // Wenn nur updatedAt da wäre, könnte man ein leeres Update vermeiden, aber serverTimestamp() allein ist ok.
      // Falls auch kein logoUrl und keine anderen settings geändert wurden, kann man das updateDoc ganz überspringen.
      // Aber für updatedAt ist es oft gewünscht.
      if (updates.updatedAt && Object.keys(updates).length === 1) { // Nur updatedAt
         // optional: await updateDoc(docRef, { updatedAt: serverTimestamp() });
         // oder einfach nichts tun, wenn keine anderen Änderungen
         console.log("[tournamentService] Only updatedAt was present, no other settings changed.");
      }
    }

  } catch (error) {
    console.error(`[tournamentService] Error updating settings for tournament ${instanceId}:`, error);
    throw new Error("Turniereinstellungen konnten nicht aktualisiert werden.");
  }
};

// NEU: Funktion zum Hochladen eines Turnierlogos
/**
 * Lädt ein Turnierlogo (Profilbild) zu Firebase Storage hoch.
 * @param tournamentId Die ID des Turniers.
 * @param file Die hochzuladende Datei (Blob oder File).
 * @returns Die Download-URL des hochgeladenen Bildes.
 */
export const uploadTournamentLogoFirebase = async (tournamentId: string, file: File): Promise<string> => {
  if (!file) throw new Error("Keine Datei für den Upload ausgewählt.");
  if (!tournamentId) throw new Error("Keine Turnier-ID für den Logo-Upload angegeben.");

  const storage = getStorage(firebaseApp); // firebaseApp hier verwenden
  const fileExtension = file.name.split('.').pop() || 'jpg'; // Fallback
  const fileName = `logo.${fileExtension}`; // Fester Name für das Logo, um Überschreiben zu ermöglichen
  const filePath = `tournamentLogos/${tournamentId}/${fileName}`;
  const fileStorageRef = storageRef(storage, filePath); // Alias `storageRef` verwenden

  try {
    console.log(`[tournamentService] Uploading tournament logo to: ${filePath}`);
    const snapshot = await uploadBytes(fileStorageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log("[tournamentService] Tournament logo uploaded successfully. Download URL:", downloadURL);
    return downloadURL;
    } catch (error) {
    console.error("[tournamentService] Error uploading tournament logo:", error);
    if (error instanceof Error && 'code' in error) {
      const firebaseError = error as any; 
      if (firebaseError.code === 'storage/unauthorized') {
        throw new Error("Fehlende Berechtigung für den Logo-Upload. Überprüfe die Storage-Regeln.");
      } else if (firebaseError.code === 'storage/canceled') {
        throw new Error("Logo-Upload wurde abgebrochen.");
      }
    }
    throw new Error("Turnierlogo konnte nicht hochgeladen werden.");
  }
};

/**
 * Ruft alle Turnierinstanzen ab, an denen ein bestimmter User teilnimmt.
 * @param userId ID des Benutzers.
 * @returns Ein Array von TournamentInstance-Objekten.
 */
export const fetchTournamentsForUser = async (
  userId: string
): Promise<TournamentInstance[]> => {
  if (!userId) {
    console.warn("[tournamentService] fetchTournamentsForUser called without userId.");
    return [];
  }
  try {
    const tournamentsCol = collection(db, 'tournaments');
    // Abfrage nach Turnieren, bei denen der User in participantUids enthalten ist
    const q = query(
      tournamentsCol,
      where("participantUids", "array-contains", userId)
      // Folgende Zeilen für Testzwecke auskommentiert:
      // where("status", "!=", "archived"), 
      // orderBy("status"), 
      // orderBy("createdAt", "desc")
    );
    const querySnapshot = await getDocs(q);
    const instances: TournamentInstance[] = [];
    querySnapshot.forEach((doc) => {
      instances.push({ id: doc.id, ...doc.data() } as TournamentInstance);
    });
    if (process.env.NODE_ENV === 'development') {
      console.log(`[tournamentService] Fetched ${instances.length} tournament instances for user ${userId}.`);
    }
    return instances;
  } catch (error) {
    console.error(`[tournamentService] Error fetching tournaments for user ${userId}:`, error);
    throw new Error("Turniere für den Benutzer konnten nicht geladen werden.");
  }
};

// NEU: Funktion zum Generieren eines Einladungs-Tokens für ein Turnier
/**
 * Fordert einen Einladungs-Token für ein Turnier von einer Cloud Function an.
 * @param tournamentId ID der Turnierinstanz.
 * @returns Der generierte Einladungs-Token als String.
 */
export const generateTournamentInviteToken = async (
  tournamentId: string
): Promise<string> => {
  if (!tournamentId) {
    throw new Error("Tournament ID is required to generate an invite token.");
  }

  try {
    const functions = getFunctions(firebaseApp, 'europe-west1'); // firebaseApp hier verwenden
    const generateTokenFunction = httpsCallable(functions, 'generateTournamentInviteToken');
    
    console.log(`[tournamentService] Calling cloud function 'generateTournamentInviteToken' for tournament: ${tournamentId}`);
    const result = await generateTokenFunction({ tournamentId });
    
    const token = (result.data as { token: string })?.token;

    if (!token) {
      throw new Error("No token received from cloud function.");
    }
    console.log(`[tournamentService] Received invite token for tournament ${tournamentId}`);
    return token;
  } catch (error) {
    console.error("[tournamentService] Error calling 'generateTournamentInviteToken' cloud function:", error);
    const message = error instanceof Error ? error.message : "Failed to generate tournament invite token.";
    // Ggf. spezifischere Fehlermeldungen basierend auf error.code von Firebase Functions
    throw new Error(message);
  }
};

// Optional: Cloud Function Trigger oder weitere Admin-Funktionen (invalidate invites etc.)
// könnten hier auch vorbereitet oder referenziert werden. 

/**
 * Löst einen Einladungs-Token für ein Turnier über eine Cloud Function ein.
 * @param token Der Einladungs-Token.
 * @returns Ein Objekt, das Erfolg, eine Nachricht und optional die Turnier-ID enthält.
 */
export const redeemTournamentInvite = async (
  token: string
): Promise<{ success: boolean; message: string; tournamentId?: string }> => {
  if (!token) {
    return { success: false, message: "Kein Token angegeben." };
  }

  try {
    const functions = getFunctions(firebaseApp, 'europe-west1');
    const acceptInviteFunction = httpsCallable(functions, 'acceptTournamentInviteFunction'); // Name der hypothetischen Cloud Function
    
    console.log(`[tournamentService] Calling cloud function 'acceptTournamentInviteFunction' with token.`);
    const result = await acceptInviteFunction({ token });
    
    // Die Cloud Function sollte ein Objekt zurückgeben, das dem erwarteten Rückgabetyp entspricht.
    // z.B. { data: { success: true, message: "Erfolgreich beigetreten!", tournamentId: "xyz" } }
    const responseData = result.data as { success: boolean; message: string; tournamentId?: string };

    if (!responseData || typeof responseData.success !== 'boolean') {
      console.error("[tournamentService] Invalid response from 'acceptTournamentInviteFunction\'", responseData);
      return { success: false, message: "Ungültige Antwort vom Server." };
    }

    if (responseData.success) {
      console.log(`[tournamentService] Successfully redeemed invite token for tournament: ${responseData.tournamentId}`);
    } else {
      console.warn(`[tournamentService] Failed to redeem invite token: ${responseData.message}`);
    }
    return responseData;

  } catch (error) {
    console.error("[tournamentService] Error calling 'acceptTournamentInviteFunction\' cloud function:", error);
    const message = error instanceof Error ? error.message : "Beitritt zum Turnier fehlgeschlagen.";
    // Ggf. spezifischere Fehlermeldungen basierend auf error.code von Firebase Functions
    return { success: false, message };
  }
};

// NEU: Funktion zum Abschließen und Aufzeichnen einer Turnierpasse
/**
 * Liest die Daten einer abgeschlossenen aktiven Passe, erstellt ein 
 * TournamentGame-Dokument in der Subkollektion des Turniers und 
 * aktualisiert den Status der aktiven Passe sowie der Turnierinstanz.
 * @param activePasseId Die ID des activeGame-Dokuments der abzuschließenden Passe.
 * @param tournamentInstanceId Die ID der übergeordneten Turnierinstanz.
 * @returns boolean - True bei Erfolg, False bei Fehler.
 */
export const completeAndRecordTournamentPasse = async (
  activePasseId: string,
  tournamentInstanceId: string
): Promise<boolean> => {
  // console.log(`[tournamentService] Starting completion process for passe ${activePasseId} in tournament ${tournamentInstanceId}`); // DEBUG-LOG ENTFERNT

  const db = getFirestore(firebaseApp);
  const activeGameRef = doc(db, 'activeGames', activePasseId);
  const tournamentDocRef = doc(db, 'tournaments', tournamentInstanceId);
  const tournamentGameRef = doc(db, 'tournaments', tournamentInstanceId, 'games', activePasseId);
  const roundsRef = collection(db, 'activeGames', activePasseId, 'rounds');

  try {
    // 1. Aktives Spiel und Runden lesen
    // console.log("[tournamentService] Fetching active game data..."); // DEBUG-LOG ENTFERNT
    const activeGameSnap = await getDoc(activeGameRef);
    if (!activeGameSnap.exists()) {
      console.error(`[tournamentService] Active passe document ${activePasseId} not found.`);
      throw new Error("Aktive Passe nicht gefunden.");
    }
    const activeGameData = activeGameSnap.data() as ActiveGame;
    // console.log("[tournamentService] Active game data fetched."); // DEBUG-LOG ENTFERNT

    // 2. Runden lesen
    // console.log("[tournamentService] Fetching round history..."); // DEBUG-LOG ENTFERNT
    const roundsQuery = query(roundsRef, orderBy('roundId')); // Sort by roundId (timestamp)
    const roundsSnap = await getDocs(roundsQuery);
    const roundHistoryData = roundsSnap.docs.map(d => d.data() as RoundEntry);
    // console.log(`[tournamentService] Fetched ${roundHistoryData.length} rounds.`); // DEBUG-LOG ENTFERNT

    // --- Schritt C.2: Daten-Transformation zu TournamentGame --- 
    // console.log("[tournamentService] Transforming data to TournamentGame format..."); // DEBUG-LOG ENTFERNT
    const passeNumber = activeGameData.currentGameNumber;
    const instanceId = tournamentInstanceId;
    const playerDetails: PassePlayerDetail[] = [];

    // Ermittle Weispunkte pro Team FÜR DIESE PASSE (aus der letzten Runde der History)
    // Finde den letzten JassRoundEntry, falls vorhanden
    const lastJassRound = [...roundHistoryData].reverse().find(isJassRoundEntry);
    const weisPointsPasse = lastJassRound?.weisPoints ?? { top: 0, bottom: 0 };

    for (const pNum of [1, 2, 3, 4]) {
      const seat = pNum as PlayerNumber;
      const gamePlayerEntry = activeGameData.gamePlayers?.[seat];
      if (!gamePlayerEntry) {
        console.warn(`[tournamentService] Missing gamePlayer entry for seat ${seat} in activeGame ${activePasseId}`);
        continue; // Spieler nicht gefunden?
      }
      
      // Type Guard für MemberInfo, bevor auf uid zugegriffen wird
      if (gamePlayerEntry.type !== 'member') {
          console.warn(`[tournamentService] Skipping player at seat ${seat} because they are not a 'member' type.`);
          continue;
      }

      // Jetzt ist der Zugriff auf uid sicher
      const playerId = gamePlayerEntry.uid;
      const playerName = gamePlayerEntry.name;
      // Finde das Team für den Spieler basierend auf der Aufstellung in activeGameData
      const team: TeamPosition = activeGameData.teams.top.includes(seat) ? 'top' : 'bottom';
      
      // Score und Striche des Teams in dieser Passe
      const scoreInPasse = activeGameData.scores[team];
      const stricheInPasse = activeGameData.striche[team];
      // Weispunkte des Teams in dieser Passe (aus letzter Runde extrahiert)
      const weisInPasse = weisPointsPasse[team] ?? 0;

      playerDetails.push({ 
        playerId, 
        playerName, 
        seat, 
        team, 
        scoreInPasse, 
        stricheInPasse, 
        weisInPasse 
      });
    }

    // NEU: Extrahieren der UIDs für participantUidsForPasse
    const participantUidsForPasse = playerDetails.map(pd => pd.playerId);

    // Berechne Dauer, falls createdAt vorhanden ist
    let durationMillis: number | undefined = undefined;
    let startedAtTimestamp: Timestamp | FieldValue | undefined = undefined;
    if (activeGameData.createdAt && activeGameData.createdAt instanceof Timestamp) {
      startedAtTimestamp = activeGameData.createdAt; // Speichere für startedAt
      // NEU: durationMillis hier direkt berechnen
      durationMillis = Timestamp.now().toMillis() - (activeGameData.createdAt as Timestamp).toMillis();
    } else if (typeof activeGameData.createdAt === 'object' && activeGameData.createdAt) {
      // Fallback für serverTimestamp() Objekt vor dem Schreiben - sollte nicht passieren, wenn wir lesen
      startedAtTimestamp = serverTimestamp(); // Setze es als serverTimestamp
      // In diesem Fall können wir durationMillis clientseitig nicht sinnvoll berechnen, lassen es undefined, der Fallback greift
    }

    // NEU: Sicherstellen, dass durationMillis immer eine Zahl ist
    const finalDurationMillis = typeof durationMillis === 'number' ? durationMillis : 0;

    const tournamentGameData: TournamentGame = {
      passeId: activePasseId,
      tournamentInstanceId: instanceId,
      passeNumber: passeNumber,
      completedAt: serverTimestamp(), // Wird beim Schreiben gesetzt
      startedAt: startedAtTimestamp, // Optionaler Startzeitstempel
      durationMillis: finalDurationMillis, // Verwende den finalen numerischen Wert
      startingPlayer: activeGameData.initialStartingPlayer, // Wer hat die Passe gestartet
      participantUidsForPasse: participantUidsForPasse, // NEUES FELD HINZUGEFÜGT
      playerDetails: playerDetails,
      teamScoresPasse: activeGameData.scores, // Direkte Übernahme der Team-Scores der Passe
      teamStrichePasse: activeGameData.striche, // Direkte Übernahme der Team-Striche der Passe
      // Kopieren der Einstellungen, die für diese Passe galten
      activeScoreSettings: activeGameData.activeScoreSettings ?? DEFAULT_SCORE_SETTINGS, // Fallback auf Defaults
      activeStrokeSettings: activeGameData.activeStrokeSettings ?? DEFAULT_STROKE_SETTINGS,
      activeFarbeSettings: activeGameData.activeFarbeSettings ?? DEFAULT_FARBE_SETTINGS,
      roundHistory: roundHistoryData, // Bereinigte History verwenden
    };
    // console.log("[tournamentService] Data transformation complete.", JSON.parse(JSON.stringify(tournamentGameData))); // DEBUG-LOG ENTFERNT

    // --- Schritt C.3: Schreiben des TournamentGame Dokuments --- 
    // console.log(`[tournamentService] Writing tournament game document: tournaments/${instanceId}/games/${activePasseId}`); // DEBUG-LOG ENTFERNT
    await setDoc(tournamentGameRef, tournamentGameData);
    // console.log(`[tournamentService] Tournament game document successfully written.`); // DEBUG-LOG ENTFERNT

    // --- Schritt C.4: ActiveGame Dokument aktualisieren --- 
    // console.log(`[tournamentService] Updating active game document ${activePasseId} status to 'completed'.`); // DEBUG-LOG ENTFERNT
    await updateDoc(activeGameRef, { 
      status: 'completed', 
      completedAt: serverTimestamp() 
    });
    // console.log(`[tournamentService] Active game document status updated.`); // DEBUG-LOG ENTFERNT

    // --- Schritt C.5: Tournament Instanz Dokument aktualisieren --- 
    // console.log(`[tournamentService] Updating tournament instance document ${tournamentInstanceId}.`); // DEBUG-LOG ENTFERNT
    await updateDoc(tournamentDocRef, {
      completedPasseCount: increment(1),
      currentActiveGameId: null, // Zurücksetzen, da keine Passe mehr aktiv ist
      updatedAt: serverTimestamp(),
      lastActivity: serverTimestamp()
    });
    // console.log(`[tournamentService] Tournament instance document updated.`); // DEBUG-LOG ENTFERNT

    // Alle Schritte erfolgreich abgeschlossen
    // console.log(`[tournamentService] Passe ${activePasseId} successfully completed and recorded.`); // DEBUG-LOG ENTFERNT
    return true; // Signalisiert Erfolg

  } catch (error) {
    console.error(`[tournamentService] Error completing and recording passe ${activePasseId}:`, error);
    // Hier könnte eine spezifischere Fehlermeldung im UI Store gesetzt werden
    // z.B. useUIStore.getState().showNotification({ type: 'error', message: 'Fehler beim Abschliessen der Passe.' });
    return false; // Signalisiert einen Fehler
  }
};

/**
 * Markiert eine Turnierinstanz als abgeschlossen.
 * @param instanceId ID der Turnierinstanz.
 * @returns Promise<void>
 */
export const markTournamentAsCompletedService = async (
  instanceId: string
): Promise<void> => {
  console.log(`[tournamentService] Marking tournament instance ${instanceId} as completed.`);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    await updateDoc(docRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(), // Auch updatedAt aktualisieren
    });
    console.log(`[tournamentService] Tournament instance ${instanceId} successfully marked as completed.`);
  } catch (error) {
    console.error(`[tournamentService] Error marking tournament ${instanceId} as completed:`, error);
    throw new Error("Turnier konnte nicht als abgeschlossen markiert werden.");
  }
};

/**
 * Aktualisiert die Basinformationen (Name und Beschreibung) einer Turnierinstanz.
 * @param instanceId ID der Turnierinstanz.
 * @param details Objekt mit optional `name` und/oder `description`.
 */
export const updateTournamentBaseDetails = async (
  instanceId: string,
  details: { name?: string; description?: string }
): Promise<void> => {
  if (!instanceId) {
    throw new Error("Eine Turnier-Instanz-ID ist erforderlich.");
  }
  if (!details || (details.name === undefined && details.description === undefined)) {
    throw new Error("Keine Details zum Aktualisieren übergeben (Name oder Beschreibung erforderlich).");
  }

  const tournamentDocRef = doc(db, 'tournaments', instanceId);
  const dataToUpdate: { name?: string; description?: string; updatedAt: any } = {
    updatedAt: serverTimestamp(),
  };

  if (details.name !== undefined) {
    if (typeof details.name !== 'string' || details.name.trim().length < 3) {
      throw new Error("Turniername muss mindestens 3 Zeichen lang sein.");
    }
    dataToUpdate.name = details.name.trim();
  }

  if (details.description !== undefined) {
    // Erlaube leere Beschreibung oder eine bestimmte Mindest-/Maximallänge, falls gewünscht.
    // Hier wird einfach der übergebene String genommen (ggf. getrimmt).
    dataToUpdate.description = typeof details.description === 'string' ? details.description.trim() : '';
  }

  try {
    await updateDoc(tournamentDocRef, dataToUpdate);
    console.log(`[TournamentService] Basinformationen für Turnier ${instanceId} erfolgreich aktualisiert.`);
  } catch (error) {
    console.error(`[TournamentService] Fehler beim Aktualisieren der Basinformationen für Turnier ${instanceId}:`, error);
    // Überlege, ob der Fehler hier spezifischer behandelt oder einfach weitergeworfen werden soll.
    // Für eine bessere Fehlerbehandlung im UI ist es oft gut, den Fehler weiterzuwerfen.
    throw error;
  }
};

// NEUE FUNKTION
/**
 * Aktiviert eine Turnierinstanz (setzt Status auf 'active').
 * @param instanceId ID der zu aktivierenden Turnierinstanz.
 * @returns Promise<void>
 */
export const activateTournamentService = async (instanceId: string): Promise<void> => {
  console.log(`[tournamentService] Activating tournament instance ${instanceId}.`);
  const docRef = doc(db, 'tournaments', instanceId);
  try {
    // Optional: Prüfen, ob das Turnier überhaupt im Status 'upcoming' ist
    const tournamentSnap = await getDoc(docRef);
    if (tournamentSnap.exists() && tournamentSnap.data().status !== 'upcoming') {
      throw new Error("Turnier kann nur aktiviert werden, wenn es den Status 'anstehend' hat.");
    }

    await updateDoc(docRef, {
      status: 'active',
      updatedAt: serverTimestamp(),
    });
    console.log(`[tournamentService] Tournament instance ${instanceId} successfully activated.`);
  } catch (error) {
    console.error(`[tournamentService] Error activating tournament ${instanceId}:`, error);
    const message = error instanceof Error ? error.message : "Turnier konnte nicht aktiviert werden.";
    throw new Error(message);
  }
};

/**
 * Setzt die currentActiveGameId im Haupt-Turnierdokument auf null.
 * Dies wird verwendet, wenn eine Turnierpasse abgebrochen wird.
 * @param instanceId ID der Turnierinstanz.
 */
export const clearActivePasseInTournament = async (instanceId: string): Promise<void> => {
  if (!instanceId) {
    console.warn("[tournamentService] clearActivePasseInTournament called without instanceId.");
    return;
  }
  console.log(`[tournamentService] Clearing currentActiveGameId for tournament instance ${instanceId}`);
  const tournamentDocRef = doc(db, 'tournaments', instanceId);
  try {
    // SCHRITT 1: Zuerst die activeGameId vom Turnierdokument abrufen
    const tournamentSnap = await getDoc(tournamentDocRef);
    if (!tournamentSnap.exists()) {
      throw new Error(`Turnier ${instanceId} nicht gefunden.`);
    }

    const tournamentData = tournamentSnap.data();
    const currentActiveGameId = tournamentData.currentActiveGameId;
    const passesToAbort: string[] = [];
    let abortedAnyPasse = false;
    
    // SCHRITT 2a: Wenn es eine aktive Passe im Tournament-Dokument gibt
    if (currentActiveGameId) {
      console.log(`[tournamentService] Found active passe ${currentActiveGameId} in tournament document`);
      passesToAbort.push(currentActiveGameId);
    } else {
      console.log(`[tournamentService] No active passe found in tournament document, searching all active passes for tournament ${instanceId}`);
    }

    // SCHRITT 2b: Suche nach ALLEN aktiven Passen für dieses Turnier (ein Fallback)
    const activePassesQuery = query(
      collection(db, 'activeGames'),
      where('tournamentInstanceId', '==', instanceId),
      where('status', '==', 'live')
    );
    
    const activePassesSnapshot = await getDocs(activePassesQuery);
    if (!activePassesSnapshot.empty) {
      console.log(`[tournamentService] Found ${activePassesSnapshot.size} active passes in tournament ${instanceId} from direct query`);
      activePassesSnapshot.forEach(doc => {
        const passeId = doc.id;
        if (!passesToAbort.includes(passeId)) {
          console.log(`[tournamentService] Adding passe ${passeId} to abort list from query results`);
          passesToAbort.push(passeId);
        }
      });
    } else if (passesToAbort.length === 0) {
      console.log(`[tournamentService] No active passes found for tournament ${instanceId} through any method`);
    }

    // SCHRITT 3: Für jede gefundene aktive Passe den Status auf 'aborted' setzen
    for (const passeId of passesToAbort) {
      try {
        console.log(`[tournamentService] Setting status to 'aborted' for passe ${passeId}`);
        const activeGameDocRef = doc(db, 'activeGames', passeId);
        
        // Prüfe vorher, ob das Dokument existiert
        const activeGameSnap = await getDoc(activeGameDocRef);
        if (!activeGameSnap.exists()) {
          console.warn(`[tournamentService] Active game document ${passeId} not found, skipping abort.`);
          continue;
        }
        
        // Prüfe, ob es bereits aborted ist
        const activeGameData = activeGameSnap.data();
        if (activeGameData.status === 'aborted') {
          console.log(`[tournamentService] Passe ${passeId} is already in 'aborted' state, skipping.`);
          continue;
        }
        
        // Setze den Status auf aborted
        await updateDoc(activeGameDocRef, {
          status: 'aborted',
          completedAt: serverTimestamp()
        });
        
        console.log(`[tournamentService] Successfully set status to 'aborted' for passe ${passeId}`);
        abortedAnyPasse = true;
      } catch (error) {
        console.error(`[tournamentService] Error aborting passe ${passeId}:`, error);
        // Fehler hier nicht weitergeben, sondern nur loggen, damit wir mit dem nächsten fortfahren können
      }
    }

    // SCHRITT 4: Dann die currentActiveGameId im Turnierdokument zurücksetzen
    console.log(`[tournamentService] Resetting currentActiveGameId to null in tournament document ${instanceId}`);
    await updateDoc(tournamentDocRef, {
      currentActiveGameId: null,
      updatedAt: serverTimestamp(),
      lastActivity: serverTimestamp()
    });
    
    console.log(`[tournamentService] Successfully cleared currentActiveGameId for tournament ${instanceId}.`);
    
    // Abschließendes Log-Statement zur Zusammenfassung der Aktionen
    if (abortedAnyPasse) {
      console.log(`[tournamentService] Successfully aborted ${passesToAbort.length} active passes and reset currentActiveGameId in tournament ${instanceId}.`);
    } else {
      console.log(`[tournamentService] Reset currentActiveGameId in tournament ${instanceId}, but no active passes were found or needed to be aborted.`);
    }
  } catch (error) {
    console.error(`[tournamentService] Error clearing active passe in tournament ${instanceId}:`, error);
    throw new Error("Die aktive Passe im Turnier konnte serverseitig nicht korrekt bereinigt werden.");
  }
}; 