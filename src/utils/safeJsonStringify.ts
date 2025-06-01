import { Timestamp } from 'firebase-admin/firestore'; // Wichtig: Admin SDK Timestamp importieren!

/**
 * Konvertiert ein beliebiges Objekt sicher in einen JSON-String.
 * Behandelt Firestore Timestamps korrekt, indem sie in ISO-Strings umgewandelt werden.
 * Andere nicht-serialisierbare Typen werden ignoriert oder als null behandelt.
 *
 * @param obj Das zu serialisierende Objekt.
 * @returns Ein JSON-String oder null bei einem Fehler.
 */
export function safeJsonStringify(obj: any): string | null {
  try {
    const replacer = (key: string, value: any) => {
      // Firestore Timestamps (Admin SDK) in ISO Strings umwandeln
      if (value instanceof Timestamp) {
        return value.toDate().toISOString();
      }
      // Optional: Behandlung anderer Typen wie Date-Objekte
      // if (value instanceof Date) {
      //   return value.toISOString();
      // }

      // Optional: Behandlung von undefined (wird standardmäßig von JSON.stringify entfernt)
      if (value === undefined) {
        return null; // Oder einen anderen Platzhalter, falls gewünscht
      }
      
      // Optional: Behandlung von BigInt (nicht direkt serialisierbar)
      if (typeof value === 'bigint') {
        return value.toString(); // Konvertiere BigInt in String
      }

      // Alles andere normal behandeln
      return value;
    };

    return JSON.stringify(obj, replacer);
  } catch (error) {
    console.error('Fehler beim sicheren JSON Stringify:', error);
    return null; // Bei Fehlern null zurückgeben
  }
} 