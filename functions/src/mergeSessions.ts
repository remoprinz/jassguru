import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();

interface MergeSessionsData {
  mainSessionId: string;
  sessionToMergeId: string;
}

/**
 * Führt zwei Sessions zusammen - verschiebt alle Spiele aus sessionToMergeId 
 * zur mainSessionId und löscht dann die ursprüngliche Session.
 * 
 * WICHTIG: Diese Funktion sollte nur von Admins verwendet werden!
 */
export const mergeSessions = onCall<MergeSessionsData>(async (request) => {
  // Admin-Authentifizierung prüfen
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentifizierung erforderlich.");
  }

  const { mainSessionId, sessionToMergeId } = request.data;

  if (!mainSessionId || !sessionToMergeId) {
    throw new HttpsError("invalid-argument", "Beide Session-IDs müssen angegeben werden.");
  }

  if (mainSessionId === sessionToMergeId) {
    throw new HttpsError("invalid-argument", "Die Session-IDs dürfen nicht identisch sein.");
  }

  console.log(`[mergeSessions] Starte Zusammenführung: ${sessionToMergeId} -> ${mainSessionId}`);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // 1. Beide Sessions laden
      const mainSessionRef = db.collection("gameSessions").doc(mainSessionId);
      const sessionToMergeRef = db.collection("gameSessions").doc(sessionToMergeId);
      
      const [mainSessionSnap, sessionToMergeSnap] = await Promise.all([
        transaction.get(mainSessionRef),
        transaction.get(sessionToMergeRef)
      ]);

      if (!mainSessionSnap.exists) {
        throw new Error(`Haupt-Session ${mainSessionId} nicht gefunden.`);
      }

      if (!sessionToMergeSnap.exists) {
        throw new Error(`Zu verschmelzende Session ${sessionToMergeId} nicht gefunden.`);
      }

      const mainSessionData = mainSessionSnap.data();
      const sessionToMergeData = sessionToMergeSnap.data();

      if (!mainSessionData || !sessionToMergeData) {
          throw new Error("Fehler beim Lesen der Session-Daten.");
      }

      // 2. Validierung
      if (mainSessionData.groupId !== sessionToMergeData.groupId) {
        throw new Error("Sessions gehören zu verschiedenen Gruppen!");
      }

      // Prüfe ob participantUids übereinstimmen
      const mainParticipants = mainSessionData.participantUids?.sort() || [];
      const mergeParticipants = sessionToMergeData.participantUids?.sort() || [];
      
      if (JSON.stringify(mainParticipants) !== JSON.stringify(mergeParticipants)) {
        throw new Error("Sessions haben unterschiedliche Teilnehmer!");
      }

      // 3. Spiele aus sessionToMerge zu mainSession hinzufügen
      const mainCompletedGames = mainSessionData.completedGames || {};
      const mergeCompletedGames = sessionToMergeData.completedGames || {};

      // Bestimme die nächste Spielnummer
      const maxGameNumber = Math.max(...Object.keys(mainCompletedGames).map(Number), 0);
      
      console.log(`[mergeSessions] Höchste Spielnummer in Haupt-Session: ${maxGameNumber}`);

      // Kopiere Spiele mit neuen Nummern
      const updatedCompletedGames = { ...mainCompletedGames };
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(mergeCompletedGames).forEach(([_, gameData]: [string, any]) => {
        const newGameNumber = maxGameNumber + parseInt(gameData.gameNumber);
        console.log(`[mergeSessions] Verschiebe Spiel ${gameData.gameNumber} -> ${newGameNumber}`);
        
        // Aktualisiere gameNumber und sessionId
        const updatedGameData = {
          ...gameData,
          gameNumber: newGameNumber,
          sessionId: mainSessionId
        };
        
        updatedCompletedGames[newGameNumber.toString()] = updatedGameData;
      });

      // 4. Update der Haupt-Session
      const updateData = {
        completedGames: updatedCompletedGames,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Optional: Merge-Info für Auditierung
        mergedSessions: admin.firestore.FieldValue.arrayUnion(sessionToMergeId),
      };

      transaction.update(mainSessionRef, updateData);

      // 5. Lösche die ursprüngliche Session
      transaction.delete(sessionToMergeRef);

      const mergedGameCount = Object.keys(mergeCompletedGames).length;
      const totalGameCount = Object.keys(updatedCompletedGames).length;

      return {
        success: true,
        mergedGameCount,
        totalGameCount,
        message: `${mergedGameCount} Spiele von Session ${sessionToMergeId} zu Session ${mainSessionId} verschoben. Gesamt: ${totalGameCount} Spiele.`
      };
    });

    console.log(`[mergeSessions] Erfolgreich abgeschlossen:`, result);
    return result;
  } catch (error) {
    console.error(`[mergeSessions] Fehler:`, error);
    if (error instanceof Error) {
      throw new HttpsError("internal", `Fehler beim Zusammenführen: ${error.message}`);
    } else {
      throw new HttpsError("internal", "Unbekannter Fehler beim Zusammenführen der Sessions.");
    }
  }
});

/**
 * Hilfsfunktion für einmalige Ausführung per Admin SDK
 * Kann direkt in der Firebase Console oder über ein Admin-Skript aufgerufen werden
 */
export const mergeSpecificSessions = async () => {
  const mainSessionId = "Ph8oDZYvcV5y3NkFBiZDu";
  const sessionToMergeId = "tPE0JJoJAYpRZO9Scefrp";

  console.log(`[mergeSpecificSessions] Starte Zusammenführung: ${sessionToMergeId} -> ${mainSessionId}`);

  try {
    const result = await db.runTransaction(async (transaction) => {
      // Sessions laden
      const mainSessionRef = db.collection("gameSessions").doc(mainSessionId);
      const sessionToMergeRef = db.collection("gameSessions").doc(sessionToMergeId);
      
      const [mainSessionSnap, sessionToMergeSnap] = await Promise.all([
        transaction.get(mainSessionRef),
        transaction.get(sessionToMergeRef)
      ]);

      if (!mainSessionSnap.exists) {
        throw new Error(`Haupt-Session ${mainSessionId} nicht gefunden.`);
      }

      if (!sessionToMergeSnap.exists) {
        throw new Error(`Session ${sessionToMergeId} nicht gefunden.`);
      }

      const mainSessionData = mainSessionSnap.data();
      const sessionToMergeData = sessionToMergeSnap.data();

      if (!mainSessionData || !sessionToMergeData) {
          throw new Error("Fehler beim Lesen der Session-Daten.");
      }

      // Validierung
      console.log(`[mergeSpecificSessions] Haupt-Session hat ${Object.keys(mainSessionData.completedGames || {}).length} Spiele`);
      console.log(`[mergeSpecificSessions] Zu mergende Session hat ${Object.keys(sessionToMergeData.completedGames || {}).length} Spiele`);

      // Spiele zusammenführen
      const mainCompletedGames = mainSessionData.completedGames || {};
      const mergeCompletedGames = sessionToMergeData.completedGames || {};

      const maxGameNumber = Math.max(...Object.keys(mainCompletedGames).map(Number), 0);
      const updatedCompletedGames = { ...mainCompletedGames };
      
      // Spiele aus Session 2 als Spiel 3 und 4 hinzufügen
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.entries(mergeCompletedGames).forEach(([_, gameData]: [string, any]) => {
        const newGameNumber = maxGameNumber + parseInt(gameData.gameNumber);
        console.log(`[mergeSpecificSessions] Verschiebe Spiel ${gameData.gameNumber} zu Spielnummer ${newGameNumber}`);
        
        const updatedGameData = {
          ...gameData,
          gameNumber: newGameNumber,
          sessionId: mainSessionId
        };
        
        updatedCompletedGames[newGameNumber.toString()] = updatedGameData;
      });

      // Update der Haupt-Session
      transaction.update(mainSessionRef, {
        completedGames: updatedCompletedGames,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        mergedSessions: admin.firestore.FieldValue.arrayUnion(sessionToMergeId),
        mergedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Session 2 löschen
      transaction.delete(sessionToMergeRef);

      return {
        success: true,
        mergedGameCount: Object.keys(mergeCompletedGames).length,
        totalGameCount: Object.keys(updatedCompletedGames).length
      };
    });

    console.log(`[mergeSpecificSessions] Erfolgreich abgeschlossen:`, result);
    return result;
  } catch (error) {
    console.error(`[mergeSpecificSessions] Fehler:`, error);
    throw error;
  }
};