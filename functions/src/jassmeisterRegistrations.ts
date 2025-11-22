import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import * as crypto from "crypto";
import { getRandomProfileThemeServer } from "./utils/randomTheme";
import { 
  DEFAULT_SCORE_SETTINGS, 
  DEFAULT_STROKE_SETTINGS, 
  DEFAULT_FARBE_SETTINGS 
} from "./utils/defaultSettings";

const db = admin.firestore();

// --- Typdefinitionen ---

interface JassmeisterRegistration {
  captainEmail: string;
  captainName: string; // Wird als Jassname verwendet
  captainPhone: string;
  groupName: string;
  groupSize: string;
  region: string;
  isStudentGroup: boolean;
  newsletter: boolean;
  socialMedia: string;
  termsAccepted: boolean;
  status: 'pending' | 'processed' | 'error' | 'duplicate';
  createdAt: admin.firestore.Timestamp;
  processedAt?: admin.firestore.Timestamp;
  error?: string;
  createdUserId?: string;
  createdGroupId?: string;
}

interface FirestorePlayer {
  displayName: string;
  lowercaseDisplayName?: string; // Für case-insensitive Suche
  userId: string;
  isGuest: boolean;
  createdAt: admin.firestore.FieldValue;
  updatedAt: admin.firestore.FieldValue;
  groupIds: string[];
  profileTheme: string | null;
  stats: { gamesPlayed: number; wins: number; totalScore: number };
  metadata: { isOG: boolean };
}

// --- Hilfsfunktionen ---

/**
 * Generiert eine sichere zufällige ID (als Ersatz für nanoid im Backend)
 */
function generateSecureId(length: number = 20): string {
  return crypto.randomBytes(length).toString('hex').substring(0, length);
}

/**
 * Cloud Function: Verarbeitet neue Jassmeister-Registrierungen
 * Trigger: Neues Dokument in 'jassmeisterRegistrations'
 */
export const processJassmeisterRegistration = onDocumentCreated(
  {
    document: "jassmeisterRegistrations/{registrationId}",
    region: "europe-west1",
    // Keine Secrets benötigt, da wir native Firebase Auth nutzen
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.error("No data associated with the event");
      return;
    }

    const registrationId = event.params.registrationId;
    const data = snapshot.data() as JassmeisterRegistration;

    // 1. Idempotenz-Check: Nur 'pending' verarbeiten
    if (data.status !== 'pending') {
      logger.info(`Registration ${registrationId} already processed or in status ${data.status}. Skipping.`);
      return;
    }

    logger.info(`Processing Jassmeister registration ${registrationId} for ${data.captainEmail}`);

    const { captainEmail, captainName, groupName } = data;

    // Validierung
    if (!captainEmail || !captainName || !groupName) {
      logger.error(`Registration ${registrationId} missing required fields.`);
      await snapshot.ref.update({ 
        status: 'error', 
        error: 'Pflichtfelder fehlen (Email, Name oder Gruppenname)',
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    let userId: string;
    let isNewUser = false;

    try {
      // 2. User Check / Creation
      try {
        // Prüfen, ob User bereits existiert
        const userRecord = await admin.auth().getUserByEmail(captainEmail);
        userId = userRecord.uid;
        logger.info(`User ${userId} already exists for email ${captainEmail}.`);
      } catch (authError: any) {
        if (authError.code === 'auth/user-not-found') {
          // User existiert nicht -> Neu erstellen
          // Wir setzen ein zufälliges, starkes Passwort. Der User muss es resetten.
          const tempPassword = crypto.randomBytes(16).toString('hex') + 'Aa1!';
          
          const userRecord = await admin.auth().createUser({
            email: captainEmail,
            password: tempPassword,
            displayName: captainName,
            emailVerified: false, // WICHTIG: false, damit der Passwort-Reset-Link funktioniert!
            disabled: false
          });
          userId = userRecord.uid;
          isNewUser = true;
          logger.info(`Created new user ${userId} for email ${captainEmail}.`);
        } else {
          throw authError;
        }
      }

      // 3. Player Document Handling (Synchron & Explizit)
      // Wir verlassen uns NICHT auf den handleUserCreation Trigger, um Race Conditions zu vermeiden.
      
      // Prüfen, ob User schon ein Player-Dokument hat (via users/{uid}.playerId)
      const userDocRef = db.collection('users').doc(userId);
      const userDocSnap = await userDocRef.get();
      let playerId: string | null = userDocSnap.data()?.playerId || null;

      // Falls nicht im User-Doc, suche in Players-Collection
      if (!playerId) {
        const playersQuery = await db.collection('players').where('userId', '==', userId).limit(1).get();
        if (!playersQuery.empty) {
          playerId = playersQuery.docs[0].id;
          // Fix User Doc Link
          await userDocRef.set({ playerId }, { merge: true });
        }
      }

      // Immer noch kein Player? Erstellen!
      if (!playerId) {
        // ✅ CHECK: Prüfe, ob Jassname bereits vergeben ist (case-insensitive)
        const lowercaseDisplayName = captainName.toLowerCase().trim();
        const existingPlayerQuery = await db
          .collection('players')
          .where('lowercaseDisplayName', '==', lowercaseDisplayName)
          .limit(1)
          .get();
        
        if (!existingPlayerQuery.empty) {
          logger.warn(`Jassname "${captainName}" ist bereits vergeben (Player ID: ${existingPlayerQuery.docs[0].id})`);
          await snapshot.ref.update({
            status: 'duplicate',
            error: `Der Jassname "${captainName}" ist bereits vergeben. Bitte wähle einen anderen Namen.`,
            processedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          return;
        }

        playerId = generateSecureId(20); // Konsistente ID-Länge
        const playerDocRef = db.collection('players').doc(playerId);

        const newPlayerData: FirestorePlayer = {
          displayName: captainName.trim(),
          lowercaseDisplayName: lowercaseDisplayName, // Für case-insensitive Suche
          userId: userId,
          isGuest: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          groupIds: [], // Wird gleich aktualisiert
          profileTheme: getRandomProfileThemeServer(),
          stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
          metadata: { isOG: true } // Jassmeister Registrierungen sind OGs!
        };

        // User Doc vorbereiten
        const userDocData = {
          email: captainEmail,
          displayName: captainName,
          playerId: playerId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          playerCreatedBy: 'jassmeister-registration'
        };

        // Batch Write für Atomarität
        const batch = db.batch();
        batch.set(playerDocRef, newPlayerData);
        batch.set(userDocRef, userDocData, { merge: true });
        await batch.commit();
        
        logger.info(`Created new player ${playerId} for user ${userId}.`);
      } else {
        logger.info(`Using existing player ${playerId} for user ${userId}.`);
      }

      // 4. Gruppe erstellen
      // ✅ CHECK: Prüfe, ob Gruppenname bereits vergeben ist
      const trimmedGroupName = groupName.trim();
      const existingGroupQuery = await db
        .collection('groups')
        .where('name', '==', trimmedGroupName)
        .limit(1)
        .get();
      
      if (!existingGroupQuery.empty) {
        logger.warn(`Gruppenname "${trimmedGroupName}" ist bereits vergeben (Group ID: ${existingGroupQuery.docs[0].id})`);
        await snapshot.ref.update({
          status: 'duplicate',
          error: `Eine Gruppe mit dem Namen "${trimmedGroupName}" existiert bereits. Bitte wähle einen anderen Namen.`,
          processedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return;
      }
      
      const groupRef = db.collection('groups').doc();
      const groupId = groupRef.id;

      const groupData = {
        name: trimmedGroupName,
        description: "Offizielle Jassmeister-Gruppe",
        isPublic: false, // Private Gruppe für das Team
        logoUrl: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
        adminIds: [userId],
        players: {
          [playerId]: {
            displayName: captainName,
            joinedAt: admin.firestore.Timestamp.now()
          }
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        
        // ✅ KORRIGIERT: Verwende dieselbe Struktur wie normale Gruppen-Erstellung
        scoreSettings: DEFAULT_SCORE_SETTINGS,
        strokeSettings: DEFAULT_STROKE_SETTINGS,
        farbeSettings: DEFAULT_FARBE_SETTINGS,
        theme: getRandomProfileThemeServer()
      };

      // Gruppe speichern
      await groupRef.set(groupData);

      // Member-Subcollection Eintrag erstellen (wichtig für die neue Architektur)
      await groupRef.collection('members').doc(playerId).set({
          displayName: captainName,
          joinedAt: admin.firestore.Timestamp.now(),
          photoURL: null // Haben wir noch nicht
      });

      logger.info(`Created group ${groupId} ('${groupName}') for captain ${userId}.`);

      // 5. Verknüpfungen aktualisieren
      // Player: groupId hinzufügen
      await db.collection('players').doc(playerId).update({
        groupIds: admin.firestore.FieldValue.arrayUnion(groupId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // User: lastActiveGroupId setzen
      await userDocRef.update({
        lastActiveGroupId: groupId,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });

      // 6. Passwort-Reset-Link generieren (nur für neue User)
      let passwordResetLink: string | null = null;
      if (isNewUser) {
        try {
          // Generiere einen Passwort-Reset-Link
          passwordResetLink = await admin.auth().generatePasswordResetLink(captainEmail, {
            url: 'https://jassguru.ch/auth/reset-password',
            handleCodeInApp: false
          });
          logger.info(`Generated password reset link for ${captainEmail}.`);
        } catch (resetError: any) {
          logger.warn(`Could not generate password reset link for ${captainEmail}: ${resetError.message}`);
          // Nicht kritisch - User kann es manuell machen
        }
      }

      // 7. Registrierung abschließen
      await snapshot.ref.update({
        status: 'processed',
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdUserId: userId,
        createdGroupId: groupId,
        info: isNewUser ? 'User created' : 'User existed',
        ...(passwordResetLink && { passwordResetLink }) // Speichere Link nur wenn vorhanden
      });

      logger.info(`Successfully processed registration ${registrationId}.`);
    } catch (error: any) {
      logger.error(`Error processing registration ${registrationId}:`, error);
      await snapshot.ref.update({
        status: 'error',
        error: error.message || 'Unknown error',
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }
);

