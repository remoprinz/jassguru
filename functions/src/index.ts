import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentWritten, Change, FirestoreEvent, QueryDocumentSnapshot, DocumentSnapshot, DocumentOptions } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as logger from "firebase-functions/logger";
import { getRandomProfileThemeServer } from "./utils/randomTheme";
// GELÖSCHT: Unbenutzter Import von PlayerComputedStats etc.
// import { FirestoreGroup } from "../../src/types/group"; // <-- Entfernt wegen Modul-Konflikt

// Initialisierung von Firebase Admin (nur einmal pro Instanz)
try {
  admin.initializeApp();
} catch (e) {
  console.info("Firebase Admin SDK already initialized.");
}

// --- Import für neue HTTPS Callable Function ---
import * as finalizeSessionLogic from './finalizeSession';
// --- NEUE IMPORTE ---
import * as userManagementLogic from './userManagement'; // WIEDER HINZUGEFÜGT
// 🆕 Player Scores Migration wird direkt exportiert
import * as scheduledTaskLogic from './scheduledTasks'; // WIEDER HINZUGEFÜGT
import * as batchUpdateLogic from './batchUpdateGroupStats'; // NEU: Batch-Update für Gruppenstatistiken
import * as updateGroupStatsLogic from './updateGroupStats'; // NEU: Manuelle Gruppenstatistik-Aktualisierung
import * as rateLimiterCleanupLogic from './rateLimiterCleanup'; // NEU: Rate-Limiter Cleanup
import { updateGroupComputedStatsAfterSession } from './groupStatsCalculator'; // NEU: Import für Gruppenstatistiken
// import { updateEloForSingleTournamentPasse } from './jassEloUpdater'; // NEU: Elo-Update für einzelne Tournament-Passe (aktuell ungenutzt)
// ------------------------------------------

// --- Globale Optionen für Gen 2 setzen --- 
setGlobalOptions({ region: "europe-west1" });

// --- Lokale Typdefinition START ---
// Notwendig, da der direkte Import von ../../src/types nicht zuverlässig funktioniert
interface FirestorePlayerInGroup {
  displayName: string | null;
  joinedAt: admin.firestore.Timestamp;
}

interface FirestoreGroup {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string | null;
  createdAt: admin.firestore.Timestamp;
  createdBy: string;
  playerIds: string[];
  adminIds: string[];
  isPublic: boolean;
  players?: { [key: string]: FirestorePlayerInGroup };
  updatedAt?: admin.firestore.Timestamp; // Optional, falls verwendet
}

// NEU: Lokale Typdefinitionen für Turniere START
interface FirestoreTournamentSettings {
  rankingMode: 'total_points' | 'wins' | 'average_score_per_passe';
  scoreSettings: Record<string, unknown>; // Geändert von any
  strokeSettings: Record<string, unknown>; // Geändert von any
  farbeSettings: Record<string, unknown>; // Geändert von any
  minParticipants?: number;
  maxParticipants?: number;
}

interface FirestoreTournamentInstance {
  id: string;
  name: string;
  description?: string;
  groupId?: string; // Turniere können optional einer Gruppe angehören
  instanceDate?: admin.firestore.Timestamp | null;
  status: 'upcoming' | 'active' | 'completed' | 'archived';
  createdBy: string;
  adminIds: string[];
  participantUids: string[];
  settings: FirestoreTournamentSettings;
  createdAt: admin.firestore.Timestamp;
  updatedAt: admin.firestore.Timestamp;
  completedPasseCount?: number;
  // Weitere Felder bei Bedarf...
}
// NEU: Lokale Typdefinitionen für Turniere ENDE

// --- NEU: Lokale Typdefinitionen für Jass-Export ---
interface JassGameSummary {
  id: string;
  groupId: string;
  startedAt: admin.firestore.Timestamp;
  playerNames: { [key: string]: string };
  participantUids?: string[]; // User-IDs der Teilnehmer (optional für Legacy)
  participantPlayerIds?: string[]; // ✅ NEU: Player-Document-IDs
  teams: {
    top: { players: { displayName: string; playerId?: string }[] };
    bottom: { players: { displayName: string; playerId?: string }[] };
  };
  finalStriche: {
    top: { sieg: number };
    bottom: { sieg: number };
  };
  winnerTeamKey: 'top' | 'bottom'; // ✅ NUR top/bottom!
  Rosen10player?: string | null; // ✅ HINZUGEFÜGT: Für Google Sheets Export
  // ✅ NEU: Turnier-Felder für Prüfung
  tournamentId?: string | null; // ID des Turniers, falls Session zu einem Turnier gehört
  isTournamentSession?: boolean; // Flag ob es eine Turnier-Session ist
  tournamentInstanceId?: string | null; // Alternative Turnier-Referenz
}

interface StrichData {
  berg?: number;
  sieg?: number;
  matsch?: number;
  schneider?: number;
  kontermatsch?: number;
}

interface CompletedGame {
  id: string;
  gameNumber: number;
  initialStartingPlayer: number;
  finalStriche?: {
    top?: StrichData;
    bottom?: StrichData;
  };
}

const db = admin.firestore();

// Interface für die erwarteten Eingabedaten
interface GenerateTokenData {
  groupId: string;
}

// Interface für invalidateActiveGroupInvites
interface InvalidateInvitesData {
  groupId: string;
}

// Interface für joinGroupByToken
interface JoinGroupByTokenData {
  token: string;
}

// NEU: Interface für generateTournamentInviteToken
interface GenerateTournamentTokenData {
  tournamentId: string;
}

// NEU: Interface für acceptTournamentInviteFunction
interface AcceptTournamentInviteData {
  token: string;
}

// NEU: Import für Google Sheets API
import { google } from "googleapis";

// ✅ SICHER: Service Account Key als Firebase Secret
const googleSheetsServiceAccount = defineSecret('GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY');

// --- Konfiguration für Google Sheets Export ---
const SPREADSHEET_ID = "1wffL-mZRMVoXjVL3WPMiRJ_AsC5ALZXn1Jx6GYxKqKA";
const SHEET_NAME = "Rohdaten"; // Name des Tabellenblatts, in das geschrieben werden soll
// ✅ Erlaubte Gruppe für Spreadsheet-Export
const ALLOWED_GROUP_IDS = ["Tz0wgIHMTlhvTtFastiJ"];

// ✅ EINFACH & DYNAMISCH: Verwende Namen direkt aus der Session
function getSpreadsheetNameFromSession(session: JassGameSummary, playerDisplayName: string): string {
  // ✅ DIREKT: Verwende den Display-Namen aus der Session
  // Das funktioniert für alle Spieler, auch neue, und ist immer aktuell
  return playerDisplayName || "Unbekannt";
}

// 🧠 INTELLIGENTES ADAPTIVES Rate Limiting
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const userBasedLimitStore = new Map<string, { count: number; lastReset: number }>();
const activeUsersTracker = new Map<string, number>(); // userId -> lastSeenTimestamp

// 🤖 BOT-SCHUTZ: Registrierungs-Rate-Limiting ist in userManagement.ts implementiert
// (handleUserCreation Trigger mit checkUserCreationRateLimit Funktion)

const RATE_LIMIT_WINDOW = 60000; // 1 Minute
const ACTIVE_USER_TIMEOUT = 300000; // 5 Minuten bis User als inaktiv gilt

// 📊 Monitoring: Log active users every 5 minutes
let lastMonitoringLog = 0;
const MONITORING_INTERVAL = 300000; // 5 Minuten

// 🎯 Dynamische Limits basierend auf aktiven Usern
function getAdaptiveLimits(): { ipLimit: number; userLimit: number; activeUsers: number } {
  const now = Date.now();
  
  // Bereinige inactive Users
  for (const [userId, lastSeen] of activeUsersTracker.entries()) {
    if (now - lastSeen > ACTIVE_USER_TIMEOUT) {
      activeUsersTracker.delete(userId);
    }
  }
  
  const activeUsers = activeUsersTracker.size;
  
  // 🚀 INTELLIGENTE SKALIERUNG:
  let ipLimit: number;
  let userLimit: number;
  
  if (activeUsers < 10) {
    // 👥 Normaler Betrieb
    ipLimit = 100;
    userLimit = 30;
  } else if (activeUsers < 30) {
    // 🎮 Kleine Gruppe/Event
    ipLimit = 200;
    userLimit = 45;
  } else if (activeUsers < 60) {
    // 🏆 Mittleres Turnier
    ipLimit = 400;
    userLimit = 60;
  } else if (activeUsers < 100) {
    // 🎪 Großes Turnier
    ipLimit = 800; // Erhöht für extra Sicherheit bei 60+ Turnieren
    userLimit = 80;
  } else {
    // 🚨 Mega-Event oder potentieller Angriff
    ipLimit = 1000;
    userLimit = 100;
    logger.warn(`🚨 MEGA-EVENT DETECTED: ${activeUsers} active users - Max limits activated`);
  }
  
  return { ipLimit, userLimit, activeUsers };
}

function checkRateLimit(clientIp: string, userId?: string): boolean {
  const now = Date.now();
  
  // 📊 User Activity Tracking
  if (userId) {
    activeUsersTracker.set(userId, now);
  }
  
  // 🧠 Hole adaptive Limits
  const { ipLimit, userLimit, activeUsers } = getAdaptiveLimits();
  
  // 📊 Monitoring & Transparenz
  if (now - lastMonitoringLog > MONITORING_INTERVAL) {
    logger.info(`📊 SYSTEM STATUS: ${activeUsers} active users → IP: ${ipLimit}/min, User: ${userLimit}/min`);
    lastMonitoringLog = now;
  }
  
  // 📝 Event-spezifisches Logging
  if (activeUsers >= 30) {
    logger.info(`🎯 EVENT DETECTED: ${activeUsers} active users → IP: ${ipLimit}/min, User: ${userLimit}/min`);
  }
  
  // 1. 🌐 IP-basiertes Limit (adaptiv)
  const ipEntry = rateLimitStore.get(clientIp);
  if (!ipEntry || now - ipEntry.lastReset > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(clientIp, { count: 1, lastReset: now });
  } else {
    if (ipEntry.count >= ipLimit) {
      logger.warn(`🚫 IP rate limit exceeded: ${clientIp} (${ipEntry.count}/${ipLimit} requests, ${activeUsers} active users)`);
      return false;
    }
    ipEntry.count++;
  }
  
  // 2. 👤 User-basiertes Limit (adaptiv)
  if (userId) {
    const userEntry = userBasedLimitStore.get(userId);
    if (!userEntry || now - userEntry.lastReset > RATE_LIMIT_WINDOW) {
      userBasedLimitStore.set(userId, { count: 1, lastReset: now });
    } else {
      if (userEntry.count >= userLimit) {
        logger.warn(`🚫 User rate limit exceeded: ${userId} (${userEntry.count}/${userLimit} requests, ${activeUsers} active users)`);
        return false;
      }
      userEntry.count++;
    }
  }
  
  return true;
}

// === LOKALE IMPLEMENTIERUNG DER LOCK-FUNKTION FÜR CLOUD FUNCTIONS ===
const PLAYER_LOCKS_COLLECTION = 'player-locks';

/**
 * Versucht, ein Lock-Dokument für eine userId zu erstellen.
 * Gibt `true` zurück, wenn das Lock erfolgreich erstellt wurde.
 * Gibt `false` zurück, wenn das Lock bereits existiert.
 */
const acquirePlayerCreationLock = async (userId: string): Promise<boolean> => {
  const lockRef = db.collection(PLAYER_LOCKS_COLLECTION).doc(userId);
  try {
    await db.runTransaction(async (transaction) => {
      const lockDoc = await transaction.get(lockRef);
      if (lockDoc.exists) {
        throw new Error("Lock already exists");
      }
      transaction.set(lockRef, { createdAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    console.log(`[Lock] Lock für userId ${userId} erfolgreich akquiriert.`);
    return true;
  } catch (error: any) {
    if (error.message === "Lock already exists") {
      console.log(`[Lock] Lock für userId ${userId} existiert bereits. Prozess wartet.`);
    } else {
      console.error(`[Lock] Unerwarteter Fehler beim Akquirieren des Locks für userId ${userId}:`, error);
    }
    return false;
  }
};

/**
 * Gibt das Lock-Dokument für eine userId frei.
 */
const releasePlayerCreationLock = async (userId: string): Promise<void> => {
  const lockRef = db.collection(PLAYER_LOCKS_COLLECTION).doc(userId);
  try {
    await lockRef.delete();
    console.log(`[Lock] Lock für userId ${userId} freigegeben.`);
  } catch (error) {
    console.error(`[Lock] Fehler beim Freigeben des Locks für userId ${userId}:`, error);
  }
};

/**
 * Cloud Functions Version von getPlayerIdForUser mit Lock-Mechanismus
 */
const getPlayerIdForUserWithLock = async (userId: string, displayName: string | null): Promise<string | null> => {
  const hasLock = await acquirePlayerCreationLock(userId);

  try {
    if (hasLock) {
      console.log(`[getPlayerIdForUserWithLock] Prozess hat Lock für ${userId}, führt interne Logik aus.`);
      return await getPlayerIdForUserInternal(userId, displayName);
    } else {
      console.log(`[getPlayerIdForUserWithLock] Prozess wartet auf Lock-Freigabe für ${userId}.`);
      // Warte-Logik mit Retries
      let attempts = 0;
      const maxAttempts = 5;
      const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

      while (attempts < maxAttempts) {
        await delay(300 * Math.pow(2, attempts)); // Exponential backoff
        
        // Suche nach existierendem Player
        const playerQuery = db.collection("players").where("userId", "==", userId).limit(1);
        const playerSnapshot = await playerQuery.get();
        if (!playerSnapshot.empty) {
          const playerId = playerSnapshot.docs[0].id;
          console.log(`[getPlayerIdForUserWithLock] Player für ${userId} nach Warten gefunden: ${playerId}`);
          return playerId;
        }
        
        attempts++;
        console.log(`[getPlayerIdForUserWithLock] Versuch ${attempts}/${maxAttempts} für ${userId} fehlgeschlagen.`);
      }
      
      console.error(`[getPlayerIdForUserWithLock] Konnte Player für ${userId} auch nach ${maxAttempts} Versuchen nicht finden.`);
      return null;
    }
  } finally {
    if (hasLock) {
      await releasePlayerCreationLock(userId);
    }
  }
};

/**
 * Interne Implementierung - erstellt Player wenn nötig
 * 🔧 FIX: Liest displayName aus Firestore User-Dokument statt nur aus Auth Token
 */
const getPlayerIdForUserInternal = async (userId: string, displayName: string | null): Promise<string | null> => {
  try {
    // 1. Prüfe User-Dokument
    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    // 🆕 BEST PRACTICE: Lese displayName aus Firestore User-Dokument (höhere Priorität!)
    let finalDisplayName = displayName; // Von Auth Token (kann leer sein bei neuen Users)

    if (userSnap.exists) {
      const userData = userSnap.data();
      
      // Prüfe existierende playerId
      if (userData?.playerId && typeof userData.playerId === 'string') {
        const playerRef = db.collection("players").doc(userData.playerId);
        const playerSnap = await playerRef.get();
        if (playerSnap.exists) {
          return userData.playerId;
        }
      }

      // 🆕 FIX: Verwende displayName aus User-Dokument (zuverlässiger als Auth Token!)
      if (userData?.displayName && typeof userData.displayName === 'string') {
        finalDisplayName = userData.displayName;
        console.log(`[getPlayerIdForUserInternal] ✅ DisplayName aus User-Dokument: "${finalDisplayName}" (Auth Token: "${displayName || 'null'}")`);
      }
    }

    // 2. Direkte Suche nach bestehenden Player-Dokumenten
    const playerQuery = db.collection("players").where("userId", "==", userId).limit(1);
    const querySnapshot = await playerQuery.get();

    if (!querySnapshot.empty) {
      const foundPlayerId = querySnapshot.docs[0].id;
      // Player ID im User-Dokument nachtragen
      await userRef.set({ playerId: foundPlayerId }, { merge: true });
      return foundPlayerId;
    }

    // 3. Erstelle neuen Player MIT KORREKTEM DISPLAYNAME
    // 🔒 SECURITY FIX: Use cryptographically secure random IDs
    const newPlayerId = crypto.randomBytes(12).toString('hex');
    const playerDisplayName = finalDisplayName || `Spieler ${newPlayerId.slice(0, 8)}`;
    
    const newPlayerData = {
      displayName: playerDisplayName,
      userId,
      isGuest: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      groupIds: [],
      // 🎨 NEU: Zufällige Profilfarbe für neue Spieler
      profileTheme: getRandomProfileThemeServer(),
      stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
      metadata: { isOG: false },
    };

    console.log(`[getPlayerIdForUserInternal] Erstelle neuen Player ${newPlayerId} für userId ${userId} mit displayName: "${playerDisplayName}"`);
    
    await db.collection("players").doc(newPlayerId).set(newPlayerData);
    await userRef.set({ playerId: newPlayerId }, { merge: true });
    
    console.log(`[getPlayerIdForUserInternal] ✅ Player ${newPlayerId} erfolgreich erstellt mit displayName "${playerDisplayName}"`);
    return newPlayerId;
  } catch (error) {
    console.error(`[getPlayerIdForUserInternal] Fehler für userId ${userId}:`, error);
    return null;
  }
};

/**
 * Generiert einen sicheren, zeitlich begrenzten Einladungstoken für eine Gruppe.
 * Nur Admins der Gruppe können diese Funktion aufrufen.
 */
export const generateGroupInviteToken = onCall<GenerateTokenData>(async (request) => {
    // 1. Authentifizierung prüfen (context.auth -> request.auth)
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um einen Einladungscode zu generieren."
      );
    }

    const userId = request.auth.uid;
    const groupId = request.data.groupId; // data.groupId -> request.data.groupId

    // 2. Input validieren
    if (!groupId || typeof groupId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Die Gruppen-ID fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} requests invite token for group ${groupId}`);

    try {
      // 3. Admin-Berechtigung prüfen (Logik bleibt gleich)
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data();
      if (!groupData?.adminIds?.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Nur Gruppen-Admins können Einladungscodes generieren."
        );
      }

      // 4. Sicheren Token generieren (Logik bleibt gleich)
      const token = crypto.randomBytes(24).toString("hex");

      // 5. Ablaufdatum berechnen (Logik bleibt gleich)
      const now = admin.firestore.Timestamp.now();
      const expirationSeconds = now.seconds + (30 * 24 * 60 * 60); 
      const expiresAt = admin.firestore.Timestamp.fromMillis(expirationSeconds * 1000);

      // 6. Token in Firestore speichern (Logik bleibt gleich)
      const inviteData = {
        groupId: groupId,
        token: token,
        expiresAt: expiresAt,
        isValid: true,
        generatedBy: userId,
        createdAt: now,
      };

      await db.collection("groupInvites").add(inviteData);

      console.info(`Successfully generated invite token for group ${groupId} by user ${userId}`);

      // 7. Token an Client zurückgeben
      return {token: token};
    } catch (error) {
      console.error(`Error generating invite token for group ${groupId} by user ${userId}:`, error);
      if (error instanceof HttpsError) {
        throw error; 
      } else {
        throw new HttpsError(
          "internal",
          "Ein interner Fehler ist beim Generieren des Einladungscodes aufgetreten."
        );
      }
    }
  });

/**
 * Macht alle aktuell gültigen Einladungstokens für eine Gruppe ungültig.
 * Nur Admins der Gruppe können diese Funktion aufrufen.
 */
export const invalidateActiveGroupInvites = onCall<InvalidateInvitesData>(async (request) => {
    // 1. Authentifizierung prüfen (context.auth -> request.auth)
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Der Nutzer muss angemeldet sein, um Einladungscodes zurückzusetzen."
      );
    }

    const userId = request.auth.uid;
    const groupId = request.data.groupId; // data.groupId -> request.data.groupId

    // 2. Input validieren
    if (!groupId || typeof groupId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Die Gruppen-ID fehlt oder hat ein ungültiges Format."
      );
    }

    console.info(`User ${userId} requests invalidation of active invites for group ${groupId}`);

    try {
      // 3. Admin-Berechtigung prüfen (Logik bleibt gleich)
      const groupRef = db.collection("groups").doc(groupId);
      const groupSnap = await groupRef.get();

      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data();
      if (!groupData?.adminIds?.includes(userId)) {
        throw new HttpsError(
          "permission-denied",
          "Nur Gruppen-Admins können Einladungscodes zurücksetzen."
        );
      }

      // 4. Alle gültigen Tokens für die Gruppe abfragen (Logik bleibt gleich)
      const invitesQuery = db.collection("groupInvites")
        .where("groupId", "==", groupId)
        .where("isValid", "==", true);

      const querySnapshot = await invitesQuery.get();

      if (querySnapshot.empty) {
        console.info(`No active invites found for group ${groupId} to invalidate.`);
        return {success: true, invalidatedCount: 0}; 
      }

      // 5. Batch Write vorbereiten (Logik bleibt gleich)
      const batch = db.batch();
      querySnapshot.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
        batch.update(doc.ref, {isValid: false});
      });

      // 6. Batch ausführen (Logik bleibt gleich)
      await batch.commit();

      const invalidatedCount = querySnapshot.size;
      console.info(`Successfully invalidated ${invalidatedCount} active invites for group ${groupId} by user ${userId}`);

      // 7. Erfolg zurückgeben
      return {success: true, invalidatedCount: invalidatedCount};
    } catch (error) {
      console.error(`Error invalidating invites for group ${groupId} by user ${userId}:`, error);
      if (error instanceof HttpsError) {
        throw error;
      } else {
        throw new HttpsError(
          "internal",
          "Ein interner Fehler ist beim Zurücksetzen der Einladungscodes aufgetreten."
        );
      }
    }
  });

/**
 * Ermöglicht einem authentifizierten Nutzer, einer Gruppe mittels eines gültigen Tokens beizutreten.
 * FIX V2: Stellt sicher, dass alle Reads vor Writes in der Transaktion erfolgen.
 */
export const joinGroupByToken = onCall<JoinGroupByTokenData>(async (request) => {
    console.log("--- joinGroupByToken V11 START --- (Gen 2 mit manueller Korrektur)");

    if (!request.auth) {
        console.error("[joinGroupByToken LOG] Fehler: Nicht authentifiziert.");
        throw new HttpsError("unauthenticated", "Der Nutzer muss angemeldet sein, um einer Gruppe beizutreten.");
    }

    // TURNIER-SICHERES DDoS-Schutz: Rate Limiting
    const clientIp = request.rawRequest.ip || 'unknown';
    const userId = request.auth.uid;
    if (!checkRateLimit(clientIp, userId)) {
        throw new HttpsError("resource-exhausted", "Zu viele Anfragen. Bitte warten Sie eine Minute.");
    }
    const userDisplayNameFromToken = request.auth.token.name || "Unbekannter Jasser (aus Token)";
    const userEmailFromToken = request.auth.token.email;
    const token = request.data.token;

    if (!token || typeof token !== "string") {
        console.error(`[joinGroupByToken LOG] Fehler: Ungültiger Token-Input: ${token}`);
        throw new HttpsError("invalid-argument", "Der Einladungscode fehlt oder hat ein ungültiges Format.");
    }

    let groupIdFromToken: string | null = null;

    try {
        const tokenQuery = db.collection("groupInvites").where("token", "==", token);
        const tokenQuerySnapshot = await tokenQuery.get();

        if (tokenQuerySnapshot.empty) {
            console.error(`[joinGroupByToken LOG] Fehler: Token ${token} nicht in groupInvites gefunden.`);
            throw new HttpsError("not-found", "Einladungscode nicht gefunden oder ungültig.");
        }

        const tokenDocSnapshot = tokenQuerySnapshot.docs[0];
        const tokenDataOutside = tokenDocSnapshot.data();
        const tokenDocId = tokenDocSnapshot.id;

        if (!tokenDataOutside) {
            throw new HttpsError("internal", "Fehler beim Lesen der Token-Daten.");
        }

        if (!tokenDataOutside.isValid) {
            throw new HttpsError("permission-denied", "Dieser Einladungscode ist nicht mehr gültig.");
        }

        const now = admin.firestore.Timestamp.now();
        if (tokenDataOutside.expiresAt.toMillis() < now.toMillis()) {
            await tokenDocSnapshot.ref.update({ isValid: false });
            throw new HttpsError("permission-denied", "Dieser Einladungscode ist abgelaufen.");
        }

        groupIdFromToken = tokenDataOutside.groupId;
        if (!groupIdFromToken) {
            throw new HttpsError("internal", "Gruppen-ID im Token nicht gefunden.");
        }

        const joinResult = await db.runTransaction(async (transaction: admin.firestore.Transaction) => {
            const userRef = db.collection("users").doc(userId);
            const userSnap = await transaction.get(userRef);

            const tokenRef = db.collection("groupInvites").doc(tokenDocId);
            const tokenDoc = await transaction.get(tokenRef);

            if (!tokenDoc.exists) {
                throw new Error("Einladungscode konnte nicht erneut gelesen werden.");
            }
            const tokenDataInTx = tokenDoc.data();
            if (!tokenDataInTx || !tokenDataInTx.isValid || tokenDataInTx.expiresAt.toMillis() < admin.firestore.Timestamp.now().toMillis()) {
                throw new Error("Einladungscode wurde während des Vorgangs ungültig oder ist abgelaufen.");
            }
            const currentGroupIdInTx = tokenDataInTx.groupId;
            if (!currentGroupIdInTx || typeof currentGroupIdInTx !== 'string') {
                throw new Error("Gruppen-ID im Token nicht gefunden oder ungültig.");
            }

            const groupRef = db.collection("groups").doc(currentGroupIdInTx);
            const groupSnap = await transaction.get(groupRef);

            if (!groupSnap.exists) {
                throw new Error("Die zugehörige Gruppe wurde nicht gefunden.");
            }
            const groupData = groupSnap.data();
            if (!groupData) {
                throw new Error("Fehler beim Lesen der Gruppendaten.");
            }

            let playerVerifySnap: admin.firestore.DocumentSnapshot | null = null;
            let playerQuerySnapshot: admin.firestore.QuerySnapshot | null = null;
            let initialPlayerIdFromUserDoc: string | null = null;

            if (userSnap.exists && userSnap.data()?.playerId) {
                initialPlayerIdFromUserDoc = userSnap.data()?.playerId;
                if (initialPlayerIdFromUserDoc) { // Sichere Prüfung
                    const playerVerifyRef = db.collection("players").doc(initialPlayerIdFromUserDoc);
                    playerVerifySnap = await transaction.get(playerVerifyRef);
                }
            } else {
                const playerQuery = db.collection("players").where("userId", "==", userId).limit(1);
                playerQuerySnapshot = await transaction.get(playerQuery);
            }

            // NEU: photoURL frühzeitig extrahieren für spätere Verwendung
            let playerPhotoURL: string | null = null;
            if (playerVerifySnap?.exists) {
                playerPhotoURL = playerVerifySnap.data()?.photoURL || null;
            } else if (playerQuerySnapshot && !playerQuerySnapshot.empty) {
                playerPhotoURL = playerQuerySnapshot.docs[0].data()?.photoURL || null;
            }

            const finalUserDisplayName = userSnap.exists && userSnap.data()?.displayName ? userSnap.data()?.displayName : userDisplayNameFromToken;
            const finalUserEmail = userSnap.exists && userSnap.data()?.email ? userSnap.data()?.email : userEmailFromToken;

            let finalPlayerId: string | null = null;
            let createNewPlayerDoc = false;

            if (initialPlayerIdFromUserDoc && playerVerifySnap?.exists) {
                finalPlayerId = initialPlayerIdFromUserDoc;
            } else if (playerQuerySnapshot && !playerQuerySnapshot.empty) {
                finalPlayerId = playerQuerySnapshot.docs[0].id;
                if (userSnap.exists && userSnap.data()?.playerId !== finalPlayerId) {
                    transaction.update(userRef, { playerId: finalPlayerId, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
                }
            } else {
                finalPlayerId = crypto.randomBytes(12).toString('hex');
                createNewPlayerDoc = true;
            }

            if (!finalPlayerId) {
                throw new Error("Konnte die Spieler-ID nicht bestimmen.");
            }

            if (groupData.playerIds?.includes(finalPlayerId)) {
                if (!groupData.players || !groupData.players[finalPlayerId]) {
                    const missingPlayerEntry = {
                        displayName: finalUserDisplayName,
                        joinedAt: admin.firestore.Timestamp.now(),
                    };
                    transaction.update(groupRef, {
                        [`players.${finalPlayerId}`]: missingPlayerEntry,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    if (!groupData.players) groupData.players = {};
                    groupData.players[finalPlayerId] = missingPlayerEntry;
                }
                
                // HINZUGEFÜGT: Self-healing für die members-Subcollection
                const memberDocRef = groupRef.collection("members").doc(finalPlayerId);
                const memberSnap = await transaction.get(memberDocRef);
                if (!memberSnap.exists) {
                    transaction.set(memberDocRef, {
                        displayName: finalUserDisplayName,
                        photoURL: playerPhotoURL,
                        joinedAt: admin.firestore.Timestamp.now(),
                    });
                }
                
                return { success: true, alreadyMember: true, group: { id: groupSnap.id, ...groupData } };
            }

            if (createNewPlayerDoc) {
                const newPlayerRef = db.collection("players").doc(finalPlayerId);
                transaction.set(newPlayerRef, {
                    userId: userId,
                    nickname: finalUserDisplayName || `Spieler_${userId.substring(0, 6)}`,
                    displayName: finalUserDisplayName,
                    email: finalUserEmail ?? null,
                    isGuest: false,
                    stats: { gamesPlayed: 0, wins: 0, totalScore: 0 },
                    groupIds: [currentGroupIdInTx],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } else {
                const existingPlayerRef = db.collection("players").doc(finalPlayerId);
                transaction.update(existingPlayerRef, {
                    groupIds: admin.firestore.FieldValue.arrayUnion(currentGroupIdInTx),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            const userUpdateData = {
                playerId: finalPlayerId,
                lastActiveGroupId: currentGroupIdInTx,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            };
            
            // ✅ ELEGANTE LÖSUNG: Immer vollständiges users-Dokument schreiben
            const completeUserData = {
                ...userUpdateData,
                displayName: finalUserDisplayName,
                email: finalUserEmail ?? null,
                ...(userSnap.exists ? {} : { 
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastLogin: admin.firestore.FieldValue.serverTimestamp() 
                })
            };
            
            transaction.set(userRef, completeUserData, { merge: true });

            const groupPlayerEntry = {
                displayName: finalUserDisplayName,
                joinedAt: admin.firestore.Timestamp.now(),
            };

            transaction.update(groupRef, {
                playerIds: admin.firestore.FieldValue.arrayUnion(finalPlayerId),
                [`players.${finalPlayerId}`]: groupPlayerEntry,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // HINZUGEFÜGT: Dokument in members-Subcollection mit robuster Struktur erstellen
            const memberDocRef = groupRef.collection("members").doc(finalPlayerId);
            const memberData = {
                displayName: finalUserDisplayName,
                photoURL: playerPhotoURL, // Ist null für neue Spieler, was korrekt ist
                joinedAt: groupPlayerEntry.joinedAt, // Gleichen Timestamp verwenden
            };
            transaction.set(memberDocRef, memberData);

            const resultingGroupData = {
              id: groupSnap.id, 
              ...groupData,
              playerIds: [...(groupData.playerIds || []), finalPlayerId].filter((id, index, self) => self.indexOf(id) === index),
              players: { ...(groupData.players || {}), [finalPlayerId]: groupPlayerEntry }
            };

            return { success: true, alreadyMember: false, group: resultingGroupData };
        });

        return joinResult;
    } catch (error) {
        console.error(`[joinGroupByToken LOG] Fehler beim Beitritt:`, error);
        if (error instanceof HttpsError) {
            throw error;
        } else if (error instanceof Error) {
            throw new HttpsError("internal", `Interner Fehler: ${error.message}`);
        } else {
            throw new HttpsError("internal", "Ein unbekannter interner Fehler ist aufgetreten.");
        }
    }
});

// --- finalizeSession (Callable Function wird exportiert) ---
export const finalizeSession = finalizeSessionLogic.finalizeSession;

// --- 🆕 migrateRoundDurations (Callable Function) ---
import * as migrateRoundDurationsLogic from './migrateRoundDurations';
export const migrateRoundDurations = migrateRoundDurationsLogic.migrateRoundDurations;

// --- NEU: cleanupAbortedSession (Callable Function) ---
/**
 * Löscht eine abgebrochene Session und alle zugehörigen activeGames-Einträge.
 * Kann nur vom Ersteller der Session oder einem Admin aufgerufen werden.
 */
export const cleanupAbortedSession = onCall(async (request) => {
  // 1. Authentifizierung prüfen
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Der Nutzer muss angemeldet sein, um eine Session zu löschen."
    );
  }

  const userId = request.auth.uid;
  const sessionId = request.data?.sessionId;

  // 2. Input validieren
  if (!sessionId || typeof sessionId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Die Session-ID fehlt oder hat ein ungültiges Format."
    );
  }

  console.info(`User ${userId} requests cleanup of session ${sessionId}`);

  try {
    // 3. Session-Dokument prüfen und Berechtigung validieren
    const sessionRef = db.collection("sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();

    // 🚀 NEUE ARCHITEKTUR: Sessions sind nur noch in sessions Collection
    let sessionData: any = null;
    let sessionDocToDelete: admin.firestore.DocumentReference | null = null;

    if (sessionSnap.exists) {
      sessionData = sessionSnap.data();
      sessionDocToDelete = sessionRef;
      console.info(`Found session in 'sessions' collection: ${sessionId}`);
    } else {
      throw new HttpsError("not-found", "Session nicht gefunden.");
    }

    // Berechtigung prüfen: Nur der Ersteller oder ein Admin der zugehörigen Gruppe kann löschen
    if (sessionData?.createdBy !== userId) {
      // Zusätzliche Prüfung: Ist der User Admin der zugehörigen Gruppe?
      if (sessionData?.groupId) {
        const groupRef = db.collection("groups").doc(sessionData.groupId);
        const groupSnap = await groupRef.get();
        const groupData = groupSnap.data();
        
        if (!groupData?.adminIds?.includes(userId)) {
          throw new HttpsError(
            "permission-denied",
            "Nur der Ersteller der Session oder ein Gruppen-Admin kann diese löschen."
          );
        }
      } else {
        throw new HttpsError(
          "permission-denied",
          "Nur der Ersteller der Session kann diese löschen."
        );
      }
    }

    // 4. Alle activeGames der Session finden
    const activeGamesQuery = db.collection("activeGames")
      .where("sessionId", "==", sessionId);
    
    const activeGamesSnapshot = await activeGamesQuery.get();
    
    console.info(`Found ${activeGamesSnapshot.size} active games to delete for session ${sessionId}`);

    // 5. Batch-Operation für das Löschen aller Daten
    const batch = db.batch();
    
    // Session-Dokument(e) löschen
    if (sessionDocToDelete) {
      batch.delete(sessionDocToDelete);
      console.info(`Marked main session document for deletion: ${sessionDocToDelete.path}`);
    }

    
    // Alle activeGames-Dokumente und ihre Subkollektionen löschen
    for (const gameDoc of activeGamesSnapshot.docs) {
      const gameId = gameDoc.id;
      
      // Haupt-activeGame-Dokument löschen
      batch.delete(gameDoc.ref);
      
      // Rounds-Subkollektion löschen
      const roundsQuery = db.collection("activeGames").doc(gameId).collection("rounds");
      const roundsSnapshot = await roundsQuery.get();
      
      for (const roundDoc of roundsSnapshot.docs) {
        batch.delete(roundDoc.ref);
      }
      
      console.info(`Marked game ${gameId} and ${roundsSnapshot.size} rounds for deletion`);
    }

    // 6. Batch ausführen
    await batch.commit();
    
    const deletedGamesCount = activeGamesSnapshot.size;
    const deletedSessionsCount = sessionDocToDelete ? 1 : 0;

    console.info(`Successfully cleaned up session ${sessionId}: deleted ${deletedSessionsCount} session document(s), ${deletedGamesCount} games, and their rounds`);

    return {
      success: true,
      deletedSession: sessionId,
      deletedGamesCount: deletedGamesCount,
      message: `Session und ${deletedGamesCount} zugehörige Spiele wurden erfolgreich gelöscht.`
    };
  } catch (error) {
    console.error(`Error cleaning up session ${sessionId} by user ${userId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    } else {
      throw new HttpsError(
        "internal",
        "Ein interner Fehler ist beim Löschen der Session aufgetreten."
      );
    }
  }
});

// --- cleanupOldData (Scheduled Function) ---
export const cleanupOldData = scheduledTaskLogic.cleanupOldData; 

// --- NEU: scheduledFirestoreBackup (Scheduled Function) ---
export const scheduledFirestoreBackup = scheduledTaskLogic.scheduledFirestoreBackup;

// --- Trigger aus userManagement.ts ---
export const syncUserNameOnChange = userManagementLogic.syncUserNameOnChange;

/**
 * Erstellt eine neue Gruppe in Firestore.
 */
export const createNewGroup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentifizierung erforderlich.");
  }

  const userId = request.auth.uid;
  
  const data = request.data as { name?: string; description?: string; isPublic?: boolean };
  if (!data || typeof data.name !== "string" || data.name.trim().length === 0) {
    throw new HttpsError("invalid-argument", "Gruppenname ist erforderlich.");
  }

  // 🆕 FIX: Lese displayName aus User-Dokument (nicht nur aus Token!)
  const userRef = db.collection("users").doc(userId);
  const userSnap = await userRef.get();
  
  let userDisplayName = request.auth.token.name || `Spieler_${userId.substring(0, 6)}`;
  
  // Verwende displayName aus Firestore User-Dokument (höhere Priorität!)
  if (userSnap.exists && userSnap.data()?.displayName) {
    userDisplayName = userSnap.data()!.displayName;
    console.log(`[createNewGroup] ✅ DisplayName aus User-Dokument: "${userDisplayName}" (Auth Token: "${request.auth.token.name || 'null'}")`);
  } else if (request.auth.token.name) {
    console.log(`[createNewGroup] ℹ️  Verwende displayName aus Auth Token: "${userDisplayName}"`);
  } else {
    console.log(`[createNewGroup] ⚠️  Kein displayName gefunden, verwende Fallback: "${userDisplayName}"`);
  }
  
  const userEmail = request.auth.token.email || null;

  try {
    const newGroupRef = db.collection("groups").doc();

    // === VERWENDE LOCK-MECHANISMUS ===
    let playerDocId: string | null = null;
    
    // Versuche zuerst, die playerId aus dem User-Dokument zu holen
    if (userSnap.exists) {
      const userData = userSnap.data();
      if (userData?.playerId && typeof userData.playerId === 'string') {
        const playerCheckRef = db.collection("players").doc(userData.playerId);
        const playerCheckSnap = await playerCheckRef.get();
        if (playerCheckSnap.exists) {
          playerDocId = userData.playerId;
          console.log(`[createNewGroup] Found existing playerDocId ${playerDocId} from user doc for creator ${userId}.`);
        }
      }
    }

    // Falls kein gültiger Player gefunden, verwende Lock-Mechanismus
    if (!playerDocId) {
      console.log(`[createNewGroup] No valid playerDocId found, using lock mechanism for ${userId}.`);
      playerDocId = await getPlayerIdForUserWithLock(userId, userDisplayName);
      
      if (!playerDocId) {
        throw new HttpsError("internal", "Player-Dokument konnte nicht erstellt oder gefunden werden.");
      }
      
      console.log(`[createNewGroup] Lock mechanism returned playerDocId ${playerDocId} for creator ${userId}.`);
    }

    // Stelle sicher, dass die neue groupID in groupIds-Array ist
    const playerRefToUpdate = db.collection("players").doc(playerDocId);
    await playerRefToUpdate.update({
        groupIds: admin.firestore.FieldValue.arrayUnion(newGroupRef.id),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Erstelle Gruppe
    const newGroupData = {
      name: data.name.trim(),
      description: typeof data.description === "string" ? data.description.trim() : "",
      isPublic: typeof data.isPublic === "boolean" ? data.isPublic : false,
      createdAt: admin.firestore.Timestamp.now(),
      createdBy: userId,
      playerIds: [playerDocId],
      adminIds: [userId],
      players: {
        [playerDocId]: {
          displayName: userDisplayName,
          joinedAt: admin.firestore.Timestamp.now(),
        }
      },
      updatedAt: admin.firestore.Timestamp.now(),
    };

    await newGroupRef.set(newGroupData);

    // Update user document
    if (userSnap.exists) {
        await userRef.update({ 
          lastActiveGroupId: newGroupRef.id, 
          playerId: playerDocId,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp() 
        });
    } else {
         await userRef.set({
            displayName: userDisplayName,
            email: userEmail,
            playerId: playerDocId,
            lastActiveGroupId: newGroupRef.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastLogin: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    console.log(`Group ${newGroupRef.id} created by user ${userId} (playerDocId: ${playerDocId}).`);
    return { success: true, groupId: newGroupRef.id, playerDocId: playerDocId };
  } catch (error) {
    console.error(`Error creating group for user ${userId}:`, error);
    throw new HttpsError("internal", "Gruppe konnte nicht erstellt werden.");
  }
});

/**
 * Fügt einen Spieler zu einer bestehenden Gruppe hinzu (nur Admins).
 */
export const addPlayerToGroup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentifizierung erforderlich.");
  }
  const adminUserId = request.auth.uid;
  const data = request.data as { groupId?: string; playerToAddAuthUid?: string }; // Umbenannt zur Klarheit

  if (!data || typeof data.groupId !== "string" || typeof data.playerToAddAuthUid !== "string") {
    throw new HttpsError("invalid-argument", "Gruppen-ID oder Spieler-Authentifizierungs-ID fehlt.");
  }
  const { groupId, playerToAddAuthUid } = data;

  const groupRef = db.collection("groups").doc(groupId);

  try {
    let playerDocIdToAdd: string | null = null;
    let playerDisplayName = "Unbekannter Jasser";

    // Schritt 1: Finde den User und seinen playerDocId
    const userToAddRef = db.collection("users").doc(playerToAddAuthUid);
    const userToAddSnap = await userToAddRef.get();

    if (userToAddSnap.exists) {
      const userToAddData = userToAddSnap.data();
      playerDisplayName = userToAddData?.displayName || playerDisplayName;
      if (userToAddData?.playerId) {
        // Überprüfe, ob dieser Player-Datensatz auch wirklich existiert
        const playerCheckRef = db.collection("players").doc(userToAddData.playerId);
        const playerCheckSnap = await playerCheckRef.get();
        if (playerCheckSnap.exists) {
          playerDocIdToAdd = userToAddData.playerId;
          console.log(`[addPlayerToGroup] Found existing playerDocId ${playerDocIdToAdd} from user doc for user ${playerToAddAuthUid}.`);
        } else {
          console.warn(`[addPlayerToGroup] playerDocId ${userToAddData.playerId} from user doc for ${playerToAddAuthUid} does not exist in players collection.`);
          // playerDocIdToAdd bleibt null, wird unten behandelt
        }
      }
    }

    // Schritt 2: Falls playerDocId nicht im User-Dokument, suche in der "players"-Collection
    if (!playerDocIdToAdd) {
      const playerQuery = db.collection("players").where("userId", "==", playerToAddAuthUid).limit(1);
      const playerQuerySnapshot = await playerQuery.get();
      if (!playerQuerySnapshot.empty) {
        playerDocIdToAdd = playerQuerySnapshot.docs[0].id;
        const playerData = playerQuerySnapshot.docs[0].data();
        playerDisplayName = playerData?.displayName || playerData?.nickname || playerDisplayName;
        console.log(`[addPlayerToGroup] Found existing playerDocId ${playerDocIdToAdd} via query for user ${playerToAddAuthUid}.`);
        // Stelle sicher, dass der User-Doc auch diesen PlayerId hat (falls userDoc existiert)
        if (userToAddSnap.exists && userToAddSnap.data()?.playerId !== playerDocIdToAdd) {
          await userToAddRef.update({ playerId: playerDocIdToAdd, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
        }
      } else {
        // SICHERHEITS-FIX: Werfe einen generischen Fehler, um nicht preiszugeben, ob ein Benutzer existiert oder nicht (Information Disclosure).
        // Der vorherige "not-found"-Fehler war zu spezifisch.
        throw new HttpsError("internal", "Der angegebene Spieler konnte dem System nicht zugeordnet werden.");
      }
    }

    if (!playerDocIdToAdd) {
        // Sollte durch die Logik oben eigentlich nicht erreicht werden, aber als Sicherheitsnetz
        // Auch hier eine generische Meldung.
        throw new HttpsError("internal", `Die Spieler-ID konnte nicht ermittelt werden.`);
    }

    await db.runTransaction(async (transaction) => {
      const groupSnap = await transaction.get(groupRef);
      if (!groupSnap.exists) {
        throw new HttpsError("not-found", "Gruppe nicht gefunden.");
      }

      const groupData = groupSnap.data() as FirestoreGroup | undefined;
      if (!groupData?.adminIds?.includes(adminUserId)) {
        throw new HttpsError("permission-denied", "Nur Admins dürfen Spieler hinzufügen.");
      }

      // Verwende playerDocIdToAdd statt playerToAddAuthUid für die Überprüfung und das Hinzufügen
      if (groupData.playerIds?.includes(playerDocIdToAdd)) {
        console.log(`Player (docId: ${playerDocIdToAdd}) is already in group ${groupId}.`);
        // Prüfe, ob der Eintrag im players-Objekt fehlt oder aktualisiert werden muss
        if (!groupData.players?.[playerDocIdToAdd]) {
            console.log(`Player (docId: ${playerDocIdToAdd}) is in playerIds but missing in players object. Adding now.`);
            transaction.update(groupRef, {
                [`players.${playerDocIdToAdd}`]: {
                    displayName: playerDisplayName,
                    joinedAt: admin.firestore.Timestamp.now(),
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // ✅ FIX: Stelle sicher, dass auch members-Subcollection aktualisiert wird
        const playerRef = db.collection("players").doc(playerDocIdToAdd);
        const playerSnap = await transaction.get(playerRef);
        const playerData = playerSnap.data();
        const playerPhotoURL = playerData?.photoURL ?? null;
        
        const memberRef = groupRef.collection("members").doc(playerDocIdToAdd);
        transaction.set(memberRef, {
          displayName: playerDisplayName,
          photoURL: playerPhotoURL, // ✅ FIXED: photoURL auch für bestehende Mitglieder!
          joinedAt: groupData.players?.[playerDocIdToAdd]?.joinedAt || admin.firestore.Timestamp.now(),
        }, { merge: true });
        
        return; // Nichts weiter zu tun, wenn schon Mitglied und Eintrag vorhanden
      }

      // Spieler zum playerIds Array hinzufügen
      transaction.update(groupRef, {
        playerIds: admin.firestore.FieldValue.arrayUnion(playerDocIdToAdd),
        [`players.${playerDocIdToAdd}`]: {
          displayName: playerDisplayName,
          joinedAt: admin.firestore.Timestamp.now(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Füge die groupId zum groupIds Array des Spielers hinzu
      const playerRef = db.collection("players").doc(playerDocIdToAdd);
      transaction.update(playerRef, {
        groupIds: admin.firestore.FieldValue.arrayUnion(groupId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Neu: Member-Subcollection upserten (sichert Anzeige in GroupView & Foto-Sync)
      // ✅ FIX: Lade photoURL aus dem Player-Dokument
      const playerSnap = await transaction.get(playerRef);
      const playerData = playerSnap.data();
      const playerPhotoURL = playerData?.photoURL ?? null;
      
      const memberRef = groupRef.collection("members").doc(playerDocIdToAdd);
      transaction.set(memberRef, {
        displayName: playerDisplayName,
        photoURL: playerPhotoURL, // ✅ FIXED: photoURL jetzt enthalten!
        joinedAt: admin.firestore.Timestamp.now(),
      }, { merge: true });
    });

    console.log(`Player (docId: ${playerDocIdToAdd}, authUid: ${playerToAddAuthUid}) added to group ${groupId} by admin ${adminUserId}`);
    return { success: true, playerDocIdAdded: playerDocIdToAdd };
  } catch (error) {
    console.error(`Error adding player (authUid: ${playerToAddAuthUid}) to group ${groupId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    } else {
      throw new HttpsError("internal", "Der Spieler konnte der Gruppe aufgrund eines internen Fehlers nicht hinzugefügt werden.");
    }
  }
});

// NEU: Funktion zum Generieren eines Einladungstokens für ein Turnier
export const generateTournamentInviteToken = onCall<GenerateTournamentTokenData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Der Nutzer muss angemeldet sein, um einen Turnier-Einladungscode zu generieren."
    );
  }

  const userId = request.auth.uid;
  const tournamentId = request.data.tournamentId;

  if (!tournamentId || typeof tournamentId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Die Turnier-ID fehlt oder hat ein ungültiges Format."
    );
  }

  console.info(`User ${userId} requests invite token for tournament ${tournamentId}`);

  try {
    const tournamentRef = db.collection("tournaments").doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();

    if (!tournamentSnap.exists) {
      throw new HttpsError("not-found", "Turnier nicht gefunden.");
    }

    const tournamentData = tournamentSnap.data() as FirestoreTournamentInstance | undefined;
    if (!tournamentData?.adminIds?.includes(userId)) {
      throw new HttpsError(
        "permission-denied",
        "Nur Turnier-Admins können Einladungscodes generieren."
      );
    }
    
    // Token-Generierung (analog zu Gruppen)
    const token = crypto.randomBytes(24).toString("hex");
    const now = admin.firestore.Timestamp.now();
    // Token-Ablaufzeit: z.B. 7 Tage (konfigurierbar)
    const expirationSeconds = now.seconds + (7 * 24 * 60 * 60); 
    const expiresAt = admin.firestore.Timestamp.fromMillis(expirationSeconds * 1000);

    const inviteTokenData = {
      tournamentId: tournamentId,
      token: token,
      expiresAt: expiresAt,
      isValid: true,
      generatedBy: userId,
      createdAt: now,
    };

    // Token in neuer Collection speichern, z.B. 'tournamentInviteTokens'
    await db.collection("tournamentInviteTokens").add(inviteTokenData);

    console.info(`Successfully generated invite token for tournament ${tournamentId} by user ${userId}`);
    return { token: token };
  } catch (error) {
    console.error(`Error generating invite token for tournament ${tournamentId} by user ${userId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    } else {
      throw new HttpsError(
        "internal",
        "Ein interner Fehler ist beim Generieren des Turnier-Einladungscodes aufgetreten."
      );
    }
  }
});

// NEU: Funktion zum Einlösen eines Turnier-Einladungstokens
export const acceptTournamentInviteFunction = onCall<AcceptTournamentInviteData>(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Der Nutzer muss angemeldet sein, um einer Einladung zu folgen."
    );
  }

  const userId = request.auth.uid;
  const tokenString = request.data.token;

  if (!tokenString || typeof tokenString !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "Der Einladungscode fehlt oder hat ein ungültiges Format."
    );
  }

  console.info(`User ${userId} attempts to join tournament with token ${tokenString}`);
  let tournamentIdToJoin: string | null = null;

  try {
    // 1. Token-Dokument finden
    const tokenQuery = db.collection("tournamentInviteTokens").where("token", "==", tokenString);
    const tokenQuerySnapshot = await tokenQuery.get();

    if (tokenQuerySnapshot.empty) {
      throw new HttpsError("not-found", "Einladungscode nicht gefunden oder ungültig.");
    }

    const tokenDocSnapshot = tokenQuerySnapshot.docs[0];
    const tokenData = tokenDocSnapshot.data();

    if (!tokenData) {
      throw new HttpsError("internal", "Fehler beim Lesen der Token-Daten.");
    }

    // 2. Token validieren (Gültigkeit, Ablaufdatum)
    if (!tokenData.isValid) {
      throw new HttpsError("permission-denied", "Dieser Einladungscode ist nicht mehr gültig.");
    }

    const now = admin.firestore.Timestamp.now();
    if (tokenData.expiresAt.toMillis() < now.toMillis()) {
      // Token als ungültig markieren, wenn abgelaufen
      await tokenDocSnapshot.ref.update({ isValid: false });
      throw new HttpsError("permission-denied", "Dieser Einladungscode ist abgelaufen.");
    }

    tournamentIdToJoin = tokenData.tournamentId;
    if (!tournamentIdToJoin) {
      throw new HttpsError("internal", "Turnier-ID im Token nicht gefunden.");
    }

    // 3. Turnierbeitritt in einer Transaktion
    const joinResult = await db.runTransaction(async (transaction) => {
      // Type Guard um TypeScript zu versichern, dass tournamentIdToJoin ein string ist
      if (!tournamentIdToJoin) {
        throw new Error("Turnier-ID ist ungültig");
      }
      const tournamentRef = db.collection("tournaments").doc(tournamentIdToJoin);
      const tournamentSnap = await transaction.get(tournamentRef);

      if (!tournamentSnap.exists) {
        throw new Error("Turnier nicht gefunden."); // Wird von HttpsError unten behandelt
      }

      const tournamentData = tournamentSnap.data() as FirestoreTournamentInstance | undefined;
      if (!tournamentData) {
        throw new Error("Fehler beim Lesen der Turnierdaten.");
      }

      // Prüfen, ob Turnier den Beitritt erlaubt (Status 'active' oder 'upcoming')
      if (tournamentData.status !== 'active' && tournamentData.status !== 'upcoming') {
        throw new Error("Diesem Turnier kann derzeit nicht beigetreten werden (Status: " + tournamentData.status + ").");
      }

      // Prüfen, ob User bereits Teilnehmer ist
      if (tournamentData.participantUids?.includes(userId)) {
        console.log(`User ${userId} is already a participant of tournament ${tournamentIdToJoin}.`);
        return { success: true, alreadyMember: true, tournamentId: tournamentIdToJoin };
      }

      // Max-Participants-Limit prüfen
      const maxParticipants = tournamentData.settings?.maxParticipants;
      if (maxParticipants && maxParticipants > 0 && tournamentData.participantUids?.length >= maxParticipants) {
        throw new Error("Das Turnier hat bereits die maximale Teilnehmerzahl erreicht.");
      }

      // User zur Teilnehmerliste hinzufügen
      transaction.update(tournamentRef, {
        participantUids: admin.firestore.FieldValue.arrayUnion(userId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Optional: Token als verbraucht markieren (isValid: false)
      // Für einmalige Verwendung, hier einkommentieren:
      // transaction.update(tokenDocSnapshot.ref, { isValid: false });

      return { success: true, alreadyMember: false, tournamentId: tournamentIdToJoin };
    });

    console.info(`User ${userId} successfully joined tournament ${joinResult.tournamentId}`);
    return joinResult;
  } catch (error) {
    console.error(`Error for user ${userId} joining tournament with token ${tokenString}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    } else {
      // Transaktionsfehler oder andere interne Fehler in HttpsError umwandeln
      throw new HttpsError("internal", error instanceof Error ? error.message : "Beitritt zum Turnier fehlgeschlagen.");
    }
  }
});

// ============================================
// === Cloud Function zur Synchronisation von User zu Player ===
// ============================================

// Interface für die User-Daten
interface FirestoreUser { 
  displayName?: string;
  photoURL?: string | null;
  statusMessage?: string;
  profileTheme?: string | null; // NEU: Profilfarbe/Theme
  playerId?: string;
}

/**
 * Synchronisiert Änderungen an displayName, photoURL und statusMessage
 * von einem /users/{userId} Dokument zum entsprechenden /players/{playerId} Dokument.
 * Verwendet Firestore v2 Trigger.
 */
export const syncUserProfileToPlayer = onDocumentUpdated(
  // Pfad und Optionen
  { document: "users/{userId}", region: "europe-west1" } as DocumentOptions<"users/{userId}">,
  // Event Handler mit korrekten Typen
  async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined, { userId: string }>) => {
    const change = event.data;
    if (!change) {
      console.log(`[syncUserProfileToPlayer] Event data missing for event ID: ${event.id}. Exiting.`);
      return null;
    }

    // Korrektes Typ-Casting für beforeData und afterData
    const beforeData = change.before.data() as FirestoreUser | undefined;
    const afterData = change.after.data() as FirestoreUser | undefined; 
    const userId = event.params.userId;

    if (!afterData) {
       console.log(`[syncUserProfileToPlayer] Document users/${userId} deleted. No sync needed.`);
       return null;
    }

    const nameChanged = beforeData?.displayName !== afterData.displayName;
    const photoChanged = beforeData?.photoURL !== afterData.photoURL;
    const statusChanged = beforeData?.statusMessage !== afterData.statusMessage;
    const themeChanged = beforeData?.profileTheme !== afterData.profileTheme;

    if (!nameChanged && !photoChanged && !statusChanged && !themeChanged) {
      return null;
    }

    const playerId = afterData.playerId; 
    if (!playerId || typeof playerId !== 'string') {
      console.warn(`[syncUserProfileToPlayer] No valid playerId found in users/${userId}. Cannot sync.`);
      return null;
    }

    console.log(`[syncUserProfileToPlayer] Changes detected for user ${userId}. Syncing to player ${playerId}.`);

    const playerUpdateData: { [key: string]: unknown } = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (nameChanged) {
        playerUpdateData.displayName = afterData.displayName ?? null; 
    }
    if (photoChanged) {
        playerUpdateData.photoURL = afterData.photoURL ?? null; 
    }
    if (statusChanged) {
        playerUpdateData.statusMessage = afterData.statusMessage ?? null;
    }
    if (themeChanged) {
        playerUpdateData.profileTheme = afterData.profileTheme ?? null;
    }

    const playerRef = admin.firestore().collection("players").doc(playerId);
    const db = admin.firestore();
    
    try {
      // 1. Aktualisiere das Player-Dokument
      await playerRef.set(playerUpdateData, { merge: true }); 
      console.log(`[syncUserProfileToPlayer] Successfully synced user ${userId} changes to player ${playerId}.`);
      
      // 2. 🚨 NEU: Aktualisiere auch alle members-Subcollections in den Gruppen
      if (nameChanged || photoChanged) {
        console.log(`[syncUserProfileToPlayer] Updating members subcollections for player ${playerId}...`);
        
        // Hole das Player-Dokument um die groupIds zu bekommen
        const playerDoc = await playerRef.get();
        const playerData = playerDoc.data();
        const groupIds = playerData?.groupIds || [];
        
        if (groupIds.length > 0) {
          const updatePromises = groupIds.map(async (groupId: string) => {
            try {
              const memberRef = db.collection("groups").doc(groupId).collection("members").doc(playerId);
              const memberUpdateData: { [key: string]: unknown } = {};
              
              if (nameChanged && afterData.displayName) {
                memberUpdateData.displayName = afterData.displayName;
              }
              if (photoChanged) {
                memberUpdateData.photoURL = afterData.photoURL ?? null;
              }
              
              if (Object.keys(memberUpdateData).length > 0) {
                // Upsert statt reinem Update: erstellt Member-Dokument falls nicht vorhanden
                await memberRef.set(memberUpdateData, { merge: true });
                console.log(`[syncUserProfileToPlayer] Upserted member in group ${groupId}`);
              }
            } catch (groupError) {
              // Member existiert möglicherweise nicht in dieser Gruppe - das ist ok
              console.log(`[syncUserProfileToPlayer] Could not update member in group ${groupId} (may not exist)`);
            }
          });
          
          await Promise.all(updatePromises);
          console.log(`[syncUserProfileToPlayer] Finished updating ${groupIds.length} group member entries`);
        }
      }
      
      return null;
    } catch (error) {
      console.error(`[syncUserProfileToPlayer] Error updating player document ${playerId} for user ${userId}:`, error);
      return null;
    }
  }
);

/**
 * **MASTER-FUNKTION:** Reagiert auf alle Schreib-Änderungen an Jass-Sessions.
 * Fall 1: Status wechselt zu "completed" -> Exportiert die Session ins Google Sheet.
 * Fall 2: Status wechselt von "completed" weg -> Löscht die Session aus dem Google Sheet.
 * Fall 3: Alle anderen Änderungen werden ignoriert.
 * 
 * Diese Funktion ersetzt die alten `exportCompletedSessionToSheet` und `removeSessionOnStatusChange`.
 */
export const handleSessionUpdate = onDocumentWritten(
  {
    document: "groups/{groupId}/jassGameSummaries/{sessionId}",
    secrets: [googleSheetsServiceAccount],
  },
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined>) => {
    const sessionId = event.params.sessionId;
    const groupId = event.params.groupId;
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    const beforeStatus = beforeData?.status;
    const afterStatus = afterData?.status;

    // --- Fall 1: EXPORTIEREN ---
    // Wird ausgelöst, wenn eine Session den Status "completed" erhält (egal von welchem Status vorher).
    if (afterStatus === "completed" && beforeStatus !== "completed") {
      console.log(`[handleSessionUpdate] EXPORT: Session ${sessionId} in Gruppe ${groupId} wurde abgeschlossen. Starte Export...`);
      
      // ✅ TEMPORÄR: Prüfung für erlaubte Gruppen (inkl. Testgruppe)
      if (!ALLOWED_GROUP_IDS.includes(groupId)) {
        console.log(`[handleSessionUpdate] EXPORT-SKIP: Session ${sessionId} gehört nicht zu einer erlaubten Gruppe (groupId: ${groupId}). Export übersprungen.`);
        return;
      }

      const session = afterData as JassGameSummary;
      session.id = sessionId;

      // ✅ KRITISCH: Export NUR im Gruppenmodus, NICHT im Turniermodus!
      const isTournamentSession = session.tournamentId || session.isTournamentSession || session.tournamentInstanceId;
      if (isTournamentSession) {
        console.log(`[handleSessionUpdate] EXPORT-SKIP: Session ${sessionId} ist eine Turnier-Session (tournamentId: ${session.tournamentId || 'N/A'}, isTournamentSession: ${session.isTournamentSession || false}, tournamentInstanceId: ${session.tournamentInstanceId || 'N/A'}). Export übersprungen.`);
        return;
      }

      try {
        // ✅ SICHER: Service Account Key aus Firebase Secret lesen
        const serviceAccountKeyJson = googleSheetsServiceAccount.value();
        let serviceAccountKey: any;
        
        try {
          serviceAccountKey = JSON.parse(serviceAccountKeyJson);
        } catch (parseError) {
          console.error(`[handleSessionUpdate] EXPORT-FEHLER: Service Account Key konnte nicht geparst werden:`, parseError);
          throw new Error("Service Account Key ist kein gültiges JSON");
        }
        
        const auth = new google.auth.GoogleAuth({
          credentials: serviceAccountKey,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const sheets = google.sheets({ version: "v4", auth });
        
        const completedGamesSnapshot = await db.collection("groups").doc(groupId).collection("jassGameSummaries").doc(session.id).collection("completedGames").orderBy("gameNumber").get();

        if (completedGamesSnapshot.empty) {
          console.log(`[handleSessionUpdate] EXPORT-WARN: Session ${session.id} hat keine abgeschlossenen Spiele. Kein Export.`);
          return;
        }

        // ✅ KORRIGIERT: Verwende nur noch top/bottom
        const team1Player1 = getSpreadsheetNameFromSession(session, session.teams.bottom.players[0]?.displayName || "");
        const team1Player2 = getSpreadsheetNameFromSession(session, session.teams.bottom.players[1]?.displayName || "");
        const team2Player1 = getSpreadsheetNameFromSession(session, session.teams.top.players[0]?.displayName || "");
        const team2Player2 = getSpreadsheetNameFromSession(session, session.teams.top.players[1]?.displayName || "");

        // ✅ KORREKTUR: Rosen10player aus Session-Daten extrahieren (Player ID -> Display Name)
        let rosen10PlayerName = "";
        if (session.Rosen10player && typeof session.Rosen10player === 'string') {
          // Versuche den Namen aus playerNames zu finden
          const rosen10PlayerId = session.Rosen10player;
          // Suche in allen Teams nach dem Spieler
          const allPlayers = [
            ...session.teams.top.players,
            ...session.teams.bottom.players
          ];
          const rosen10Player = allPlayers.find(p => p.playerId === rosen10PlayerId);
          if (rosen10Player) {
            rosen10PlayerName = rosen10Player.displayName || "";
          } else {
            // Fallback: Versuche aus playerNames zu extrahieren (falls noch als Number-Key gespeichert)
            const playerNameEntry = Object.entries(session.playerNames || {}).find(([_, name]) => name === rosen10PlayerId);
            if (playerNameEntry) {
              rosen10PlayerName = playerNameEntry[1];
            }
          }
        }

        const rowsToAppend: (string | number)[][] = [];

        for (const gameDoc of completedGamesSnapshot.docs) {
          const game = gameDoc.data() as CompletedGame;
          const datum = session.startedAt ? new Date(session.startedAt.seconds * 1000).toLocaleDateString("de-CH") : "";
          const spielNr = game.gameNumber || "";
          // ✅ KORREKTUR: Verwende Session-Rosen10player nur für das erste Spiel
          const rosen10 = game.gameNumber === 1 ? rosen10PlayerName : "";
          
          const stricheBottom = game.finalStriche?.bottom || {};
          const stricheTop = game.finalStriche?.top || {};
          const siegBottom = stricheBottom.sieg || 0;
          const siegTop = stricheTop.sieg || 0;

          let berg: number | string = ""; if ((stricheBottom.berg || 0) > 0) berg = 1; else if ((stricheTop.berg || 0) > 0) berg = 2;
          let sieg: number | string = ""; if (siegBottom > 0) sieg = 1; else if (siegTop > 0) sieg = 2;
          let schneider: number | string = "";
          if ((stricheBottom.schneider || 0) + (stricheTop.schneider || 0) > 0) {
            if (siegBottom > siegTop) schneider = 1; else if (siegTop > siegBottom) schneider = 2;
          }

          const t1Matsch = stricheBottom.matsch ?? "";
          const t2Matsch = stricheTop.matsch ?? "";
          const t1Kontermatsch = (stricheBottom.kontermatsch || 0) > 0 ? 1 : "";
          const t2Kontermatsch = (stricheTop.kontermatsch || 0) > 0 ? 1 : "";
          
          rowsToAppend.push([
            datum, spielNr, rosen10,
            team1Player1, team1Player2, team2Player1, team2Player2,
            berg, sieg, t1Matsch, t2Matsch, schneider,
            t1Kontermatsch, t2Kontermatsch,
          ]);
        }

        if (rowsToAppend.length > 0) {
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A1`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: rowsToAppend },
          });
          console.log(`[handleSessionUpdate] EXPORT-OK: Erfolgreich ${rowsToAppend.length} Spiele von Session ${session.id} exportiert.`);
        } else {
          console.log(`[handleSessionUpdate] EXPORT-WARN: Keine Zeilen zum Exportieren für Session ${session.id}.`);
        }
      } catch (error) {
        console.error(`[handleSessionUpdate] EXPORT-FEHLER bei Session ${session.id}:`, error);
        // ✅ KORREKTUR: Detailliertes Error-Logging
        if (error instanceof Error) {
          console.error(`[handleSessionUpdate] Error message: ${error.message}`);
          console.error(`[handleSessionUpdate] Error stack: ${error.stack}`);
        }
        // Funktion nicht weiter propagieren, um andere Prozesse nicht zu blockieren
      }
      return; // Wichtig: Ausführung hier beenden
    }

    // --- Fall 2: LÖSCHEN ---
    // Wird ausgelöst, wenn eine "completed" Session ihren Status verliert (in der App gelöscht wird).
    if (beforeStatus === "completed" && afterStatus !== "completed") {
      console.log(`[handleSessionUpdate] LÖSCHEN: Session ${sessionId} in Gruppe ${groupId} wurde entfernt (Status: ${beforeStatus} -> ${afterStatus}). Starte Löschung...`);
      
      // ✅ TEMPORÄR: Prüfung für erlaubte Gruppen (inkl. Testgruppe)
      if (!ALLOWED_GROUP_IDS.includes(groupId)) {
        console.log(`[handleSessionUpdate] LÖSCH-SKIP: Session ${sessionId} gehört nicht zu einer erlaubten Gruppe (groupId: ${groupId}). Löschung übersprungen.`);
        return;
      }

      const session = beforeData as JassGameSummary;
      session.id = sessionId;

      // ✅ KRITISCH: Löschung NUR im Gruppenmodus, NICHT im Turniermodus!
      const isTournamentSession = session.tournamentId || session.isTournamentSession || session.tournamentInstanceId;
      if (isTournamentSession) {
        console.log(`[handleSessionUpdate] LÖSCH-SKIP: Session ${sessionId} ist eine Turnier-Session (tournamentId: ${session.tournamentId || 'N/A'}, isTournamentSession: ${session.isTournamentSession || false}, tournamentInstanceId: ${session.tournamentInstanceId || 'N/A'}). Löschung übersprungen.`);
        return;
      }

      try {
        // ✅ SICHER: Service Account Key aus Firebase Secret lesen
        const serviceAccountKeyJson = googleSheetsServiceAccount.value();
        let serviceAccountKey: any;
        
        try {
          serviceAccountKey = JSON.parse(serviceAccountKeyJson);
        } catch (parseError) {
          console.error(`[handleSessionUpdate] LÖSCH-FEHLER: Service Account Key konnte nicht geparst werden:`, parseError);
          throw new Error("Service Account Key ist kein gültiges JSON");
        }
        
        const auth = new google.auth.GoogleAuth({
          credentials: serviceAccountKey,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });
        const sheets = google.sheets({ version: "v4", auth });

        // --- NEU: Feste, stabile GID verwenden, die sich nie ändert ---
        const sheetId = 1173362828;

        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAME}!A:N`,
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) {
          console.log("[handleSessionUpdate] LÖSCH-INFO: Keine Daten im Sheet zum Löschen gefunden.");
          return;
        }
        
        const sessionDate = session.startedAt ? new Date(session.startedAt.seconds * 1000).toLocaleDateString("de-CH") : "";
        // ✅ KORRIGIERT: Verwende nur noch top/bottom
        const team1Player1 = getSpreadsheetNameFromSession(session, session.teams.bottom.players[0]?.displayName || "");
        const team1Player2 = getSpreadsheetNameFromSession(session, session.teams.bottom.players[1]?.displayName || "");

        const requests: any[] = [];
        for (let i = rows.length - 1; i >= 1; i--) { // Rückwärts iterieren
          const row = rows[i];
          const rowDate = row[0];
          const rowPlayer1 = row[3];
          const rowPlayer2 = row[4];
          
          if (rowDate === sessionDate && rowPlayer1 === team1Player1 && rowPlayer2 === team1Player2) {
            requests.push({
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: "ROWS",
                  startIndex: i,
                  endIndex: i + 1,
                },
              },
            });
          }
        }

        if (requests.length > 0) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: { requests },
          });
          console.log(`[handleSessionUpdate] LÖSCH-OK: Erfolgreich ${requests.length} Zeilen für Session ${session.id} gelöscht.`);
        } else {
          console.log(`[handleSessionUpdate] LÖSCH-INFO: Keine passenden Zeilen für Session ${session.id} im Sheet gefunden.`);
        }
      } catch (error) {
        console.error(`[handleSessionUpdate] LÖSCH-FEHLER bei Session ${session.id}:`, error);
      }
      return; // Wichtig: Ausführung hier beenden
    }

    // --- Fall 3: IGNORIEREN ---
    // Alle anderen Fälle (z.B. completed -> completed, active -> active etc.)
    console.log(`[handleSessionUpdate] IGNORIEREN: Statuswechsel von "${beforeStatus}" zu "${afterStatus}" für Session ${sessionId} ist nicht relevant. Überspringe.`);
  }
);

// ============================================
// === EXPORT BATCH UPDATE FUNCTIONS ===
// ============================================

// Batch Update Functions für Gruppenstatistiken
export const batchUpdateGroupStats = batchUpdateLogic.batchUpdateGroupStats;
export const triggerBatchUpdateGroupStats = batchUpdateLogic.triggerBatchUpdateGroupStats;

// Manuelle Gruppenstatistik-Aktualisierung
export const updateGroupStats = updateGroupStatsLogic.updateGroupStats;

// Rate-Limiter Cleanup
export const cleanupRateLimitsScheduled = rateLimiterCleanupLogic.cleanupRateLimitsScheduled;

export {handleUserCreation} from "./userManagement";

// ============================================
// === SYNCHRONISATION: NAMEN IN COMPUTED STATS ===
// ============================================

/**
 * Synchronisiert Spielernamen-Änderungen zu playerComputedStats
 * Wird ausgelöst, wenn sich das displayName Feld in einem players Dokument ändert
 */
export const onPlayerDocumentUpdated = onDocumentUpdated(
  "players/{playerId}",
  async (event) => {
    const change = event.data;
    if (!change) {
      logger.info(`[onPlayerDocumentUpdated] Event data missing for player ${event.params.playerId}. Exiting.`);
      return;
    }

    const beforeData = change.before.data();
    const afterData = change.after.data();
    const playerId = event.params.playerId;

    // Prüfe, ob sich der displayName geändert hat
    const nameChanged = beforeData?.displayName !== afterData?.displayName;

    if (!nameChanged) {
      logger.info(`[onPlayerDocumentUpdated] No displayName change for player ${playerId}. Skipping.`);
      return;
    }

    const newName = afterData?.displayName || null;
    logger.info(`[onPlayerDocumentUpdated] Player ${playerId} name changed from "${beforeData?.displayName}" to "${newName}". Updating stats.`);

    const updatePromises: Promise<void>[] = [];

    // 1. Aktualisiere playerComputedStats (bestehende Logik)
    const playerStatsUpdatePromise = (async () => {
      try {
        const playerStatsRef = db.collection('playerComputedStats').doc(playerId);
        await playerStatsRef.update({
          playerName: newName,
          lastUpdateTimestamp: admin.firestore.Timestamp.now()
        });
        logger.info(`[onPlayerDocumentUpdated] Successfully updated playerName for ${playerId} to "${newName}"`);
      } catch (error) {
        // Log error but don't block other updates
        logger.error(`[onPlayerDocumentUpdated] Error updating playerName for ${playerId}:`, error);
      }
    })();
    updatePromises.push(playerStatsUpdatePromise);

    // 2. NEU: Aktualisiere jassGameSummaries in allen Gruppen (ROBUSTERE VARIANTE)
    const summaryUpdatePromise = (async () => {
      try {
        // Schritt 1: Hole die Gruppen des Spielers
        const playerDoc = await db.collection('players').doc(playerId).get();
        const playerData = playerDoc.data();
        const groupIds = playerData?.groupIds || [];

        if (groupIds.length === 0) {
          logger.info(`[onPlayerDocumentUpdated] Player ${playerId} is not in any groups. No summaries to update.`);
          return;
        }

        logger.info(`[onPlayerDocumentUpdated] Player ${playerId} is in ${groupIds.length} groups. Checking each for summaries.`);

        // Schritt 2: Durchsuche jede Gruppe einzeln nach relevanten Sessions
        const updatePromises = groupIds.map(async (groupId: string) => {
          const summariesToUpdate = await db.collection('groups').doc(groupId).collection('jassGameSummaries')
            .where('participantPlayerIds', 'array-contains', playerId)
            .get();

          if (summariesToUpdate.empty) {
            return; // Nichts zu tun in dieser Gruppe
          }
          
          const batch = db.batch();
          let updatedCount = 0;

          summariesToUpdate.forEach(doc => {
              const summaryData = doc.data();
              const updateData: { [key: string]: any } = {};

              // teams-Struktur aktualisieren
              let teamsUpdated = false;
              const newTeams = JSON.parse(JSON.stringify(summaryData.teams || {}));
              
              if (newTeams?.top?.players) {
                  newTeams.top.players.forEach((p: {playerId?: string; displayName?: string}) => {
                      if (p.playerId === playerId) {
                          p.displayName = newName;
                          teamsUpdated = true;
                      }
                  });
              }
              if (newTeams?.bottom?.players) {
                  newTeams.bottom.players.forEach((p: {playerId?: string; displayName?: string}) => {
                      if (p.playerId === playerId) {
                          p.displayName = newName;
                          teamsUpdated = true;
                      }
                  });
              }
              if (teamsUpdated) {
                  updateData['teams'] = newTeams;
              }

              // playerNames-Map aktualisieren
              if (summaryData.participantPlayerIds && summaryData.playerNames) {
                  const playerIndex = summaryData.participantPlayerIds.indexOf(playerId);
                  if (playerIndex !== -1) {
                      const playerKey = (playerIndex + 1).toString();
                      if (summaryData.playerNames[playerKey]) {
                         updateData[`playerNames.${playerKey}`] = newName;
                      }
                  }
              }
              
              if (Object.keys(updateData).length > 0) {
                batch.update(doc.ref, updateData);
                updatedCount++;
              }
          });

          if (updatedCount > 0) {
            await batch.commit();
            logger.info(`[onPlayerDocumentUpdated] Updated ${updatedCount} summaries in group ${groupId} for player ${playerId}.`);
          }
        });
        
        await Promise.all(updatePromises);
    } catch (error) {
        logger.error(`[onPlayerDocumentUpdated] CRITICAL: Failed to update jassGameSummaries for player ${playerId}:`, error);
    }
    })();
    updatePromises.push(summaryUpdatePromise);

    await Promise.all(updatePromises);
  }
);

/**
 * Synchronisiert Gruppennamen-Änderungen zu groupComputedStats
 * Wird ausgelöst, wenn sich das name Feld in einem groups Dokument ändert
 */
export const onGroupDocumentUpdated = onDocumentUpdated(
  "groups/{groupId}",
  async (event) => {
    const change = event.data;
    if (!change) {
      logger.info(`[onGroupDocumentUpdated] Event data missing for group ${event.params.groupId}. Exiting.`);
      return;
    }

    const beforeData = change.before.data();
    const afterData = change.after.data();
    const groupId = event.params.groupId;

    // Prüfe, ob sich der name geändert hat
    const nameChanged = beforeData?.name !== afterData?.name;
    
    // ✅ NEU: Prüfe auch ob Stats-Neuberechnung angefordert wurde
    const needsStatsRecalc = afterData?.needsStatsRecalculation === true;

    if (!nameChanged && !needsStatsRecalc) {
      logger.info(`[onGroupDocumentUpdated] No relevant changes for group ${groupId}. Skipping.`);
      return;
    }

    // ✅ HANDLE NAME CHANGE
    if (nameChanged) {
      const newName = afterData?.name || null;
      logger.info(`[onGroupDocumentUpdated] Group ${groupId} name changed from "${beforeData?.name}" to "${newName}". Updating stats.`);

      try {
        // 🚀 NEUE ARCHITEKTUR: Aktualisiere GroupStats mit neuem Namen
        const updateData = {
          groupName: newName,
          lastUpdateTimestamp: admin.firestore.Timestamp.now()
        };
        
        logger.info(`[NEW ARCHITECTURE] 📊 Update GroupName für Gruppe ${groupId} zu "${newName}"`);
        const statsRef = db.collection('groups').doc(groupId).collection('stats').doc('computed');
        await statsRef.update(updateData);

        logger.info(`[onGroupDocumentUpdated] Successfully updated groupName for ${groupId} to "${newName}"`);
      } catch (error) {
        logger.error(`[onGroupDocumentUpdated] Error updating groupName for ${groupId}:`, error);
      }
    }
    
    // ✅ HANDLE STATS RECALCULATION
    if (needsStatsRecalc) {
      logger.info(`[onGroupDocumentUpdated] Stats recalculation requested for group ${groupId}. Triggering full recalculation.`);
      
      try {
        // Rufe updateGroupComputedStatsAfterSession auf
        await updateGroupComputedStatsAfterSession(groupId);
        
        // Entferne das Flag nach erfolgreicher Berechnung
        await db.collection('groups').doc(groupId).update({
          needsStatsRecalculation: admin.firestore.FieldValue.delete(),
          lastStatsRecalcTrigger: admin.firestore.FieldValue.delete()
        });
        
        logger.info(`[onGroupDocumentUpdated] Successfully recalculated stats for group ${groupId}`);
      } catch (error) {
        logger.error(`[onGroupDocumentUpdated] Error recalculating stats for ${groupId}:`, error);
      }
    }
  }
);

// ✅ NEU: Export finalizeTournament
export { finalizeTournament } from './finalizeTournament';

// ✅ NEU: Export Player Scores Migration
// ❌ REMOVED: backfillAllPlayerScores.ts (deprecated, replaced by backfillPlayerDataFromSummaries.ts)

// ✅ NEU: Export addTournamentName Script

// ✅ NEU: Export Master Fix Function
export { masterFix } from './masterFixFunction';

// ✅ NEU: Export Cleanup Old Rating Fields
export { cleanupOldRatingFields } from './cleanupOldRatingFields';

// ✅ NEU: Export Jassmeister Registration Processing
export { processJassmeisterRegistration } from './jassmeisterRegistrations';

// ✅ NEU: Export Support Query API für ChatGPT
export { supportQuery } from './supportQuery';
