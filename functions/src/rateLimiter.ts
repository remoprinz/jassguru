import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
}

/**
 * Rate-Limiting-Funktion für Cloud Functions
 * Verwendet Firestore als Backend für verteilte Rate-Limiting
 */
export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<void> {
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const rateLimitKey = `${config.keyPrefix}:${userId}`;
  
  const rateLimitRef = db.collection('rateLimits').doc(rateLimitKey);
  
  try {
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      
      if (!doc.exists) {
        // Erstes Request - erstelle neuen Eintrag
        transaction.set(rateLimitRef, {
          requests: [{
            timestamp: now,
            ip: null // Könnte erweitert werden
          }],
          lastReset: now
        });
        return;
      }
      
      const data = doc.data();
      let requests = data?.requests || [];
      
      // Entferne alte Requests außerhalb des Zeitfensters
      requests = requests.filter((req: any) => req.timestamp > windowStart);
      
      // Prüfe Rate-Limit
      if (requests.length >= config.maxRequests) {
        throw new HttpsError(
          "resource-exhausted",
          `Rate limit exceeded. Max ${config.maxRequests} requests per ${config.windowMs / 1000} seconds.`
        );
      }
      
      // Füge neues Request hinzu
      requests.push({
        timestamp: now,
        ip: null
      });
      
      // Update Dokument
      transaction.update(rateLimitRef, {
        requests: requests,
        lastReset: now
      });
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    // BEWUSST: Fail-open (Request erlauben) - App-Funktionalität hat Priorität
    // Bei Firestore-Fehlern soll die App weiter funktionieren
    console.warn(`Rate limit check failed for ${userId}:`, error);
  }
}

// Vordefinierte Konfigurationen - GELOCKERT für bessere UX
export const RATE_LIMITS = {
  MERGE_SESSIONS: {
    maxRequests: 20, // 5 → 20 (4x mehr)
    windowMs: 60 * 60 * 1000, // 1 Stunde
    keyPrefix: 'merge_sessions'
  },
  UPDATE_STATS: {
    maxRequests: 50, // 10 → 50 (5x mehr)
    windowMs: 5 * 60 * 1000, // 1 Minute → 5 Minuten
    keyPrefix: 'update_stats'
  },
  FILE_UPLOAD: {
    maxRequests: 100, // 20 → 100 (5x mehr)
    windowMs: 5 * 60 * 1000, // 1 Minute → 5 Minuten
    keyPrefix: 'file_upload'
  }
};

/**
 * Bereinigt alte Rate-Limit-Einträge
 * Läuft als Scheduled Function täglich um 03:00 Uhr
 */
export async function cleanupRateLimits(): Promise<void> {
  const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 Stunden
  
  const rateLimitsRef = db.collection('rateLimits');
  const oldEntries = await rateLimitsRef
    .where('lastReset', '<', cutoffTime)
    .limit(100)
    .get();
  
  const batch = db.batch();
  oldEntries.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  if (!oldEntries.empty) {
    await batch.commit();
    console.log(`Cleaned up ${oldEntries.size} old rate limit entries`);
  }
} 