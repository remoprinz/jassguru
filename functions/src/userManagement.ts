import { onDocumentUpdated, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { QueryDocumentSnapshot } from "firebase-admin/firestore";
import {randomBytes} from "crypto";
import { getRandomProfileThemeServer } from "./utils/randomTheme";

const db = admin.firestore();

// Collection-Namen für Konsistenz
const USERS_COLLECTION = "users";
const PLAYERS_COLLECTION = "players";

// 🤖 BOT-SCHUTZ: Intelligentes adaptives Rate Limiting für User-Creation
const userCreationLimitStore = new Map<string, { count: number; lastReset: number }>();
const registrationActivityTracker = new Map<string, number>(); // Zeitstempel der letzten Registrierungen
const USER_CREATION_RATE_LIMIT_WINDOW = 3600000; // 1 Stunde

// 🛡️ ANTI-SABOTAGE: Multi-Layer Bot-Erkennung
// (Reserviert für zukünftige erweiterte Pattern-Erkennung)

// 🎯 ADAPTIVE LIMITS mit Anti-Sabotage-Schutz
function getAdaptiveRegistrationLimits(): { domainLimit: number; eventDetected: boolean; sabotageRisk: boolean } {
  const now = Date.now();
  const last15Minutes = now - (15 * 60 * 1000); // 15 Minuten
  const lastHour = now - (60 * 60 * 1000); // 1 Stunde
  const last5Minutes = now - (5 * 60 * 1000); // 5 Minuten für Sabotage-Erkennung
  
  // Bereinige alte Einträge
  for (const [timestamp, time] of registrationActivityTracker.entries()) {
    if (time < lastHour) {
      registrationActivityTracker.delete(timestamp);
    }
  }
  
  // Zähle Registrierungen in verschiedenen Zeitfenstern
  const registrationsLast5Min = Array.from(registrationActivityTracker.values())
    .filter(time => time >= last5Minutes).length;
  const registrationsLast15Min = Array.from(registrationActivityTracker.values())
    .filter(time => time >= last15Minutes).length;
  const registrationsLastHour = registrationActivityTracker.size;
  
  // 🚨 SABOTAGE-ERKENNUNG: Sehr schnelle Spitzen deuten auf Bot-Angriff hin
  let sabotageRisk = false;
  
  // Analyse der Domain-Diversität in letzten 5 Minuten
  const recentDomains = new Set<string>();
  const recentRegistrations = Array.from(registrationActivityTracker.entries())
    .filter(([, time]) => time >= last5Minutes);
  
  recentRegistrations.forEach(([id]) => {
    const domain = id.split('_')[0]; // Format: "domain_timestamp"
    recentDomains.add(domain);
  });
  
  const domainDiversity = recentDomains.size;
  const registrationsPerDomain = registrationsLast5Min / Math.max(domainDiversity, 1);
  
  // 🚨 SABOTAGE-INDIKATOREN:
  if (registrationsLast5Min >= 10 && domainDiversity <= 2) {
    // 10+ Registrierungen in 5min von nur 1-2 Domains = verdächtig
    sabotageRisk = true;
    logger.warn(`🚨 SABOTAGE RISK: ${registrationsLast5Min} registrations in 5min from only ${domainDiversity} domains`);
  } else if (registrationsLast5Min >= 15 && registrationsPerDomain >= 8) {
    // 15+ Registrierungen, 8+ pro Domain = Bot-Pattern
    sabotageRisk = true;
    logger.warn(`🚨 SABOTAGE RISK: ${registrationsLast5Min} registrations, ${registrationsPerDomain.toFixed(1)} per domain`);
  } else if (registrationsLast15Min >= 25 && registrationsLast5Min >= 20) {
    // Massive Beschleunigung in letzten 5min = Angriff
    sabotageRisk = true;
    logger.warn(`🚨 SABOTAGE RISK: Massive acceleration - ${registrationsLast5Min} in 5min, ${registrationsLast15Min} in 15min`);
  }
  
  // 🎪 EVENT-ERKENNUNG mit Sabotage-Schutz
  let eventDetected = false;
  let domainLimit = 10; // Standard-Limit
  
  if (sabotageRisk) {
    // 🛡️ SABOTAGE-MODUS: Sehr restriktive Limits trotz hoher Aktivität
    domainLimit = 5; // Noch restriktiver als normal
    eventDetected = false; // Kein Event-Bonus bei Sabotage
    logger.warn(`🛡️ SABOTAGE MODE: Restricting to ${domainLimit}/hour despite high activity`);
  } else if (registrationsLast15Min >= 15 && domainDiversity >= 5) {
    // 🎪 ECHTES MEGA-EVENT: Hohe Aktivität + hohe Domain-Diversität
    eventDetected = true;
    domainLimit = 100;
    logger.info(`🎪 LEGITIMATE MEGA-EVENT: ${registrationsLast15Min} registrations from ${domainDiversity} domains → ${domainLimit}/hour`);
  } else if (registrationsLast15Min >= 8 && domainDiversity >= 4) {
    // 🎯 ECHTES GROSSES EVENT: Mittlere Aktivität + gute Diversität
    eventDetected = true;
    domainLimit = 50;
    logger.info(`🎯 LEGITIMATE LARGE EVENT: ${registrationsLast15Min} registrations from ${domainDiversity} domains → ${domainLimit}/hour`);
  } else if (registrationsLastHour >= 20 && domainDiversity >= 6) {
    // 📈 ECHTES MEDIUM EVENT: Über Zeit verteilt + sehr diverse Domains
    eventDetected = true;
    domainLimit = 30;
    logger.info(`📈 LEGITIMATE MEDIUM EVENT: ${registrationsLastHour} registrations from ${domainDiversity} domains → ${domainLimit}/hour`);
  } else if (registrationsLastHour >= 12 && domainDiversity >= 4) {
    // 🎮 ECHTES KLEINES EVENT: Leicht erhöht + gute Diversität
    eventDetected = true;
    domainLimit = 20;
    logger.info(`🎮 LEGITIMATE SMALL EVENT: ${registrationsLastHour} registrations from ${domainDiversity} domains → ${domainLimit}/hour`);
  }
  
  return { domainLimit, eventDetected, sabotageRisk };
}

// 🤖 BOT-SCHUTZ: Verdächtige Email-Domains
const SUSPICIOUS_EMAIL_DOMAINS = [
  'tempmail.org', '10minutemail.com', 'guerrillamail.com', 'mailinator.com',
  'yopmail.com', 'throwaway.email', 'maildrop.cc', 'temp-mail.org'
];

// 🎯 TURNIER-SCHUTZ: Vertrauenswürdige Event-Domains (höhere Toleranz)
const TRUSTED_EVENT_DOMAINS = [
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'bluewin.ch',
  'gmx.ch', 'gmx.de', 'web.de', 'icloud.com', 'protonmail.com'
];

// 🤖 BOT-SCHUTZ: Intelligentes User-Creation Rate Limiting
function checkUserCreationRateLimit(email: string): boolean {
  const now = Date.now();
  
  // 1. Verdächtige Email-Domains blockieren (immer)
  const emailDomain = email.split('@')[1]?.toLowerCase();
  if (emailDomain && SUSPICIOUS_EMAIL_DOMAINS.includes(emailDomain)) {
    logger.warn(`🚫 Suspicious email domain blocked: ${emailDomain}`);
    return false;
  }
  
  // 2. Registrierungsaktivität tracken
  const registrationId = `${emailDomain || 'unknown'}_${now}`;
  registrationActivityTracker.set(registrationId, now);
  
  // 3. Adaptive Limits basierend auf aktueller Aktivität
  const { domainLimit, eventDetected, sabotageRisk } = getAdaptiveRegistrationLimits();
  
  // 4. Email-Domain Rate Limiting mit adaptiven Limits und Trusted-Domain-Bonus
  let effectiveDomainLimit = domainLimit;
  
  // 🎯 TURNIER-SCHUTZ: Vertrauenswürdige Domains bekommen höhere Limits
  if (emailDomain && TRUSTED_EVENT_DOMAINS.includes(emailDomain)) {
    effectiveDomainLimit = Math.max(domainLimit, domainLimit * 1.5); // 50% Bonus für vertrauenswürdige Domains
    logger.info(`🎯 TRUSTED DOMAIN BONUS: ${emailDomain} gets ${effectiveDomainLimit}/${domainLimit} limit`);
  }
  
  const domainEntry = userCreationLimitStore.get(emailDomain || 'unknown');
  if (!domainEntry || now - domainEntry.lastReset > USER_CREATION_RATE_LIMIT_WINDOW) {
    userCreationLimitStore.set(emailDomain || 'unknown', { count: 1, lastReset: now });
  } else {
    if (domainEntry.count >= effectiveDomainLimit) {
      const blockReason = sabotageRisk ? '[SABOTAGE PROTECTION]' : (eventDetected ? '[EVENT MODE]' : '[NORMAL MODE]');
      logger.warn(`🚫 User creation rate limit exceeded for domain: ${emailDomain} (${domainEntry.count}/${effectiveDomainLimit} creations/hour) ${blockReason}`);
      return false;
    }
    domainEntry.count++;
  }
  
  // 5. Event-spezifisches Logging
  if (eventDetected && !sabotageRisk) {
    logger.info(`✅ Registration allowed during legitimate event: ${emailDomain} (${domainEntry?.count || 1}/${effectiveDomainLimit} limit)`);
  } else if (sabotageRisk) {
    logger.warn(`⚠️ Registration allowed despite sabotage risk: ${emailDomain} (${domainEntry?.count || 1}/${effectiveDomainLimit} limit) - monitoring closely`);
  }
  
  return true;
}

/**
 * Cloud Function (Gen 2), die auf die Aktualisierung des Anzeigenamens (displayName) 
 * im 'players'-Dokument reagiert und diesen Namen mit allen Gruppen synchronisiert,
 * in denen der Spieler Mitglied ist.
 */
export const syncUserNameOnChange = onDocumentUpdated({
    document: "players/{playerId}",
    region: "europe-west1"
  }, async (event: FirestoreEvent<Change<QueryDocumentSnapshot> | undefined>) => {
    if (!event || !event.data) {
        logger.error("Event data is missing for syncUserNameOnChange");
        return;
    }

    const change = event.data;
    const playerId = event.params.playerId;

    if (!change || !change.before || !change.after || !change.after.exists) {
        logger.error(`Event data, before, or after snapshot is missing for player ${playerId}.`);
        return null;
    }

    const beforeData = change.before.data(); 
    const afterData = change.after.data();

    if (beforeData.displayName === afterData.displayName) {
        logger.log(`Player ${playerId}: displayName not changed. Skipping name sync.`);
        return null;
    }

    const newDisplayName = afterData.displayName || `Spieler_${playerId.substring(0, 6)}`;
    logger.info(`Player ${playerId}: displayName changed to "${newDisplayName}". Syncing group data...`);

    try {
        const groupIds = afterData.groupIds;
        if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
            logger.info(`Player ${playerId} is not in any groups. No names to sync.`);
            return null;
        }
        
        const batch = db.batch();
        let groupsToUpdateCount = 0;

        groupIds.forEach((groupId: string) => {
            if (typeof groupId === 'string' && groupId.trim() !== '') {
                const groupRef = db.collection('groups').doc(groupId);
                const updateData = { [`players.${playerId}.displayName`]: newDisplayName };
                batch.update(groupRef, updateData);
                groupsToUpdateCount++;
            }
        });

        if (groupsToUpdateCount > 0) {
            await batch.commit();
            logger.info(`Finished syncing name for player ${playerId} across ${groupsToUpdateCount} groups.`);
        }
    } catch (error) {
        logger.error(`Error syncing displayName for player ${playerId}:`, error);
    }
    return null;
});

/**
 * Erstellt die initialen Daten für ein neues Firestore-Player-Dokument.
 * Enthält nur öffentliche Daten.
 */
const createInitialPlayerData = (
  playerId: string,
  userId: string,
  displayName: string | null
) => {
  const finalDisplayName = displayName || `Spieler ${playerId.slice(0, 4)}`;
  return {
    displayName: finalDisplayName,
    userId: userId,
    isGuest: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    groupIds: [],
    // 🎨 NEU: Zufällige Profilfarbe für neue Spieler
    profileTheme: getRandomProfileThemeServer(),
    // 🔧 OPTIMIZATION: Stats werden nicht mehr initial erstellt - werden bei Bedarf hinzugefügt
    metadata: {isOG: false},
  };
};

/**
 * Diese Funktion wird ausgelöst, wenn ein neuer Firebase-Benutzer erstellt wird.
 * Sie erstellt die zugehörigen Dokumente in Firestore (users und players)
 * und verknüpft diese miteinander, wobei private und öffentliche Daten getrennt werden.
 * 
 * 🔧 RACE CONDITION FIX: Wartet 3 Sekunden, damit Client-seitige Player-Erstellung Vorrang hat
 * 🔧 2ND GENERATION: Konvertiert auf Firebase Functions v2
 */
export const handleUserCreation = onCall({
  region: "europe-west1"
}, async (request) => {
  const user = request.auth?.token;
  if (!user) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const {uid, email, name: displayName} = user;

  // 🔍 DEBUGGING: Zeige relevante User-Daten
  console.log(`[handleUserCreation] User creation event for ${uid}:`, {
    uid,
    email,
    displayName,
    email_verified: user.email_verified,
    firebase: user.firebase
  });

  // 🔒 RACE CONDITION FIX: Warte 3 Sekunden, damit Client-seitige Player-Erstellung Vorrang hat
  console.log(`[handleUserCreation] Warte 3 Sekunden auf Client-seitige Player-Erstellung...`);
  await new Promise(resolve => setTimeout(resolve, 3000));

  // 🚀 EVENT-KONTEXT-ERKENNUNG: Prüfe auf aktive Turnier/Gruppen-Einladungen
  let eventContextDetected = false;
  try {
    const openInvitesQuery = db.collection("invites").where("invitedEmail", "==", email);
    const openInvitesSnapshot = await openInvitesQuery.get();
    if (!openInvitesSnapshot.empty) {
      eventContextDetected = true;
      console.log(`[handleUserCreation] Event-Kontext erkannt: ${openInvitesSnapshot.size} offene Einladungen für ${email}`);
    }
  } catch (error) {
    console.warn(`[handleUserCreation] Fehler beim Prüfen offener Einladungen für ${email}:`, error);
  }

  // 🤖 BOT-SCHUTZ: Rate Limiting für User-Creation (mit Event-Kontext)
  if (email && !checkUserCreationRateLimit(email)) {
    logger.error(`[handleUserCreation] Rate limit exceeded for user: ${uid} (${email})${eventContextDetected ? ' [EVENT CONTEXT DETECTED]' : ''}`);
    // User wird trotzdem erstellt (Firebase Auth bereits erfolgt), aber geloggt
    // Bei Event-Kontext: Weniger strenge Behandlung
    if (eventContextDetected) {
      logger.info(`[handleUserCreation] Allowing registration despite rate limit due to active event context`);
    }
  }

  const userDocRef = db.collection(USERS_COLLECTION).doc(uid);

  try {
    console.log(`[handleUserCreation] Processing user ${uid} (nach 3s Delay)...`);
    
    // 🔒 ERWEITERTE PRÜFUNG: Prüfe sowohl Player als auch User-Dokument
    const [existingPlayerQuery, existingUserDoc] = await Promise.all([
      db.collection(PLAYERS_COLLECTION).where("userId", "==", uid).limit(1).get(),
      userDocRef.get()
    ]);
    
    // Fall 1: Player bereits vorhanden (Client-seitig erstellt)
    if (!existingPlayerQuery.empty) {
      const existingPlayerId = existingPlayerQuery.docs[0].id;
      console.log(`[handleUserCreation] ✅ Player bereits vorhanden (Client-seitig): ${existingPlayerId}. Nur User-Dokument aktualisieren.`);
      
      // Stelle sicher, dass User-Dokument die Referenz hat
      await userDocRef.set({
        playerId: existingPlayerId,
        email: email,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        playerCreatedBy: 'client-side'
      }, {merge: true});
      
      return;
    }
    
    // Fall 2: User-Dokument bereits vorhanden mit Player-ID
    if (existingUserDoc.exists && existingUserDoc.data()?.playerId) {
      const existingPlayerId = existingUserDoc.data()?.playerId;
      console.log(`[handleUserCreation] ✅ User-Dokument bereits mit Player-ID: ${existingPlayerId}. Nichts zu tun.`);
      return;
    }

    // Fall 3: FALLBACK - Weder Player noch User-Dokument vorhanden
    console.log(`[handleUserCreation] 🔄 FALLBACK: Erstelle Player server-seitig für ${uid}...`);
    
    // 🔒 SECURITY FIX: Use cryptographically secure random IDs
    const playerId = randomBytes(12).toString('hex');
    const playerDocRef = db.collection(PLAYERS_COLLECTION).doc(playerId);

    // 1. Öffentliche Daten für das 'players'-Dokument (ohne E-Mail)
    const newPlayerData = createInitialPlayerData(playerId, uid, displayName || null);
    
    // 2. Private Daten für das 'users'-Dokument (nur E-Mail und Verknüpfung)
    const newUserDocumentData = {
      playerId: playerId,
      email: email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      playerCreatedBy: 'server-side-fallback'
    };

    // Schreibe beide Dokumente in einer atomaren Batch-Operation
    const batch = db.batch();
    batch.set(playerDocRef, newPlayerData);
    batch.set(userDocRef, newUserDocumentData, {merge: true});

    await batch.commit();

    console.log(`[handleUserCreation] ✅ FALLBACK SUCCESS: User ${uid} and Player ${playerId} created and linked (server-side).`);
  } catch (error) {
    console.error(`[handleUserCreation] ERROR for user ${uid}:`, error);
  }
});

// 🧹 EMAIL-BEREINIGUNG: Automatische Löschung unverifizierter Accounts
export const cleanupUnverifiedUsers = onSchedule({
  schedule: "0 2 * * *", // Täglich um 2 Uhr morgens
  timeZone: "Europe/Zurich",
  region: "europe-west1",
  memory: "512MiB",
  timeoutSeconds: 300,
}, async (event) => {
  logger.info("🧹 Starting cleanup of unverified users...");
  
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 Tage in Millisekunden
  let deletedCount = 0;
  let errorCount = 0;
  
  try {
    // Hole alle Firebase Auth Users
    const listUsersResult = await admin.auth().listUsers();
    
    for (const userRecord of listUsersResult.users) {
      // Prüfe: Nicht verifiziert UND älter als 7 Tage
      if (!userRecord.emailVerified && 
          userRecord.metadata.creationTime && 
          new Date(userRecord.metadata.creationTime).getTime() < sevenDaysAgo) {
        try {
          logger.info(`🗑️ Deleting unverified user: ${userRecord.uid} (${userRecord.email})`);
          
          // 1. Lösche Firestore-Dokumente
          const userDocRef = db.collection(USERS_COLLECTION).doc(userRecord.uid);
          const userDoc = await userDocRef.get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            const playerId = userData?.playerId;
            
            // Lösche Player-Dokument falls vorhanden
            if (playerId) {
              await db.collection(PLAYERS_COLLECTION).doc(playerId).delete();
              logger.info(`🗑️ Deleted player document: ${playerId}`);
            }
            
            // Lösche User-Dokument
            await userDocRef.delete();
            logger.info(`🗑️ Deleted user document: ${userRecord.uid}`);
          }
          
          // 2. Lösche Firebase Auth User
          await admin.auth().deleteUser(userRecord.uid);
          logger.info(`🗑️ Deleted auth user: ${userRecord.uid}`);
          
          deletedCount++;
        } catch (deleteError) {
          logger.error(`❌ Error deleting user ${userRecord.uid}:`, deleteError);
          errorCount++;
        }
      }
    }
    
    logger.info(`🧹 Cleanup completed: ${deletedCount} users deleted, ${errorCount} errors`);
  } catch (error) {
    logger.error("❌ Critical error during user cleanup:", error);
  }
}); 