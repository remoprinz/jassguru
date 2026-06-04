/**
 * deleteMyAccount — In-App Account-Löschung (Apple Guideline 5.1.1(v) Pflicht).
 *
 * Tombstone-Architektur:
 *  - users/{uid}                 → komplett gelöscht (PII weg)
 *  - players/{playerId}          → ANONYMISIERT (displayName = Initialen + Suffix
 *                                   aus playerId, email/photoURL/userId null)
 *  - players/{playerId}/subcollections (partnerStats, opponentStats etc.)
 *                                → bleiben (Aggregat-Werte, nach Anonymisierung
 *                                   keine personenbezogenen Daten mehr)
 *  - Profilbild in Storage       → gelöscht
 *  - Firebase Auth User          → komplett gelöscht
 *
 * Ergebnis: alle anderen User sehen weiterhin korrekte Stats, statt
 * "Daniel" jetzt z.B. "D-1234". DSGVO-Art-17- und Apple-konform.
 */

import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

if (!admin.apps.length) {
  admin.initializeApp();
}

const USERS_COLLECTION = "users";
const PLAYERS_COLLECTION = "players";
const PROFILE_PICTURES_PREFIX = "profilePictures";

/**
 * Generiert anonymisierten Display-Namen aus dem Original-Namen + playerId-Suffix.
 *   "Daniel"             → "D-1234"
 *   "Martin Widmer"      → "MW-1234"
 *   "Lukas Müller-Senn"  → "LMS-1234"
 *   "" (leer)            → "?-1234"
 */
function makeAnonymizedName(originalName: string | null | undefined, playerId: string): string {
  const suffix = playerId.slice(-4) || "????";
  if (!originalName || !originalName.trim()) {
    return `?-${suffix}`;
  }
  // Split bei Whitespace + Bindestrich; ignoriere leere Tokens
  const tokens = originalName.split(/[\s-]+/).filter(Boolean);
  const initials = tokens
    .map((t) => t.charAt(0).toUpperCase())
    .join("");
  return `${initials || "?"}-${suffix}`;
}

export const deleteMyAccount = onCall(
  { region: "europe-west6" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Du musst eingeloggt sein, um deinen Account zu löschen.",
      );
    }

    const db = admin.firestore();
    logger.info(`[deleteMyAccount] Start für uid=${uid}`);

    // 1) Player-Document finden (kann via users/{uid}.playerId oder via Query gehen)
    let playerId: string | null = null;
    let originalDisplayName: string | null = null;
    let photoStoragePath: string | null = null;

    try {
      const userDocSnap = await db.collection(USERS_COLLECTION).doc(uid).get();
      const userData = userDocSnap.data();
      playerId = userData?.playerId ?? null;
    } catch (e) {
      logger.warn(`[deleteMyAccount] User-Doc lesen scheiterte für ${uid}`, e);
    }

    // Fallback: über players-Collection nach userId suchen
    if (!playerId) {
      const playerQuery = await db
        .collection(PLAYERS_COLLECTION)
        .where("userId", "==", uid)
        .limit(1)
        .get();
      if (!playerQuery.empty) {
        playerId = playerQuery.docs[0].id;
      }
    }

    // 2) Player-Doc lesen für Original-Name + Storage-Pfad
    if (playerId) {
      try {
        const playerDocSnap = await db.collection(PLAYERS_COLLECTION).doc(playerId).get();
        const playerData = playerDocSnap.data();
        originalDisplayName = playerData?.displayName ?? null;
        photoStoragePath = playerData?.profilePicturePath ?? null;
      } catch (e) {
        logger.warn(`[deleteMyAccount] Player-Doc ${playerId} lesen scheiterte`, e);
      }
    }

    // 3) Player-Doc ANONYMISIEREN (nicht löschen — sonst Stats kaputt)
    if (playerId) {
      const anonName = makeAnonymizedName(originalDisplayName, playerId);
      try {
        await db.collection(PLAYERS_COLLECTION).doc(playerId).update({
          displayName: anonName,
          email: null,
          photoURL: null,
          profilePicturePath: null,
          userId: null,
          statusMessage: null,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        logger.info(`[deleteMyAccount] Player ${playerId} anonymisiert zu "${anonName}"`);
      } catch (e) {
        logger.error(`[deleteMyAccount] Anonymisierung scheiterte für ${playerId}`, e);
      }
    } else {
      logger.warn(`[deleteMyAccount] Kein playerId für uid=${uid} gefunden`);
    }

    // 4) Profilbild aus Storage löschen
    if (photoStoragePath) {
      try {
        await admin.storage().bucket().file(photoStoragePath).delete();
        logger.info(`[deleteMyAccount] Storage-Foto ${photoStoragePath} gelöscht`);
      } catch (e) {
        logger.warn(`[deleteMyAccount] Storage-Foto ${photoStoragePath} löschen scheiterte`, e);
      }
    }
    // Plus: Generic-Pattern profilePictures/{uid}/ aufräumen falls vorhanden
    try {
      const [files] = await admin.storage().bucket().getFiles({ prefix: `${PROFILE_PICTURES_PREFIX}/${uid}/` });
      await Promise.all(files.map((f) => f.delete().catch(() => {})));
      if (files.length > 0) {
        logger.info(`[deleteMyAccount] ${files.length} Storage-Objekte unter ${PROFILE_PICTURES_PREFIX}/${uid}/ gelöscht`);
      }
    } catch (e) {
      logger.warn(`[deleteMyAccount] Storage-Cleanup scheiterte für uid=${uid}`, e);
    }

    // 5) User-Doc komplett löschen (PII raus)
    try {
      await db.collection(USERS_COLLECTION).doc(uid).delete();
      logger.info(`[deleteMyAccount] User-Doc ${uid} gelöscht`);
    } catch (e) {
      logger.warn(`[deleteMyAccount] User-Doc ${uid} löschen scheiterte`, e);
    }

    // 6) Firebase Auth User löschen (User kann sich nie wieder einloggen)
    try {
      await admin.auth().deleteUser(uid);
      logger.info(`[deleteMyAccount] Auth-User ${uid} gelöscht`);
    } catch (e) {
      logger.error(`[deleteMyAccount] Auth-User ${uid} löschen scheiterte`, e);
      throw new HttpsError(
        "internal",
        "Account konnte nicht vollständig gelöscht werden — bitte später erneut versuchen.",
      );
    }

    return { success: true, anonymizedAs: playerId ? makeAnonymizedName(originalDisplayName, playerId) : null };
  },
);
