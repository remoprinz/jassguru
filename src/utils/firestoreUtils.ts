/**
 * Hilfsfunktionen für die Arbeit mit Firestore
 */

import { Timestamp, FieldValue } from "firebase/firestore";

/**
 * Bereinigt ein Objekt oder Array von allen undefined-Werten, die von Firestore nicht unterstützt werden.
 * Ersetzt undefined durch null, NaN durch 0 und kann optional leere Arrays/Objekte entfernen.
 * 
 * @param data Das zu bereinigende Objekt oder Array
 * @param options Konfigurationsoptionen für die Bereinigung
 * @returns Das bereinigte Objekt oder Array, sicher für Firestore
 */
export function sanitizeDataForFirestore(
  data: any,
  options: {
    removeEmptyArrays?: boolean;
    removeEmptyObjects?: boolean;
    replaceNaNWith?: number;
    fixDuplicateFields?: boolean;
  } = {}
): any {
  // Standardwerte für Optionen
  const opts = {
    removeEmptyArrays: false,
    removeEmptyObjects: false,
    replaceNaNWith: 0,
    fixDuplicateFields: true,
    ...options
  };

  // Fallunterscheidungen nach Datentyp
  
  // null ist bereits für Firestore geeignet
  if (data === null) {
    return null;
  }
  
  // undefined wird durch null ersetzt
  if (data === undefined) {
    return null;
  }

  // NaN wird durch die angegebene Zahl (Standard: 0) ersetzt
  if (typeof data === 'number' && isNaN(data)) {
    return opts.replaceNaNWith;
  }

  // Einfache Typen direkt zurückgeben
  if (typeof data !== 'object') {
    return data;
  }

  // Firestore-spezifische Typen unverändert durchlassen
  if (data instanceof Timestamp || 
      data instanceof FieldValue || 
      // Für serverTimestamp() und andere FieldValue-Objekte
      (data && typeof data === 'object' && 
       ('_methodName' in data || // Erkennt serverTimestamp()
        '_seconds' in data && '_nanoseconds' in data))) { // Erkennt Timestamp-Objekte
    return data;
  }

  // Datum in Firestore Timestamp umwandeln falls nötig (hier nicht implementiert, da wir serverTimestamp() verwenden)
  if (data instanceof Date) {
    return data; // In einer erweiterten Version könnte dies in einen Firestore Timestamp umgewandelt werden
  }

  // Arrays rekursiv verarbeiten
  if (Array.isArray(data)) {
    const cleanedArray = data
      .map(item => sanitizeDataForFirestore(item, opts))
      .filter(item => !(opts.removeEmptyArrays && Array.isArray(item) && item.length === 0))
      .filter(item => !(opts.removeEmptyObjects && typeof item === 'object' && item !== null && !Array.isArray(item) && Object.keys(item).length === 0));

    return opts.removeEmptyArrays && cleanedArray.length === 0 ? null : cleanedArray;
  }

  // Objekte rekursiv verarbeiten
  const cleanedObj: Record<string, any> = {};
  
  // NEU: Fix für doppelte weisPoints-Felder
  // Wenn wir ein 'weisPoints'-Feld auf oberster Ebene haben, überprüfen wir, ob es ein zweites gibt
  // z.B. in einer subdocument roundHistory, das zu einer doppelten Eigenschaft führen könnte
  if (opts.fixDuplicateFields && 'weisPoints' in data && 'roundHistory' in data && Array.isArray(data.roundHistory)) {
    // Mache eine tiefe Kopie der Daten, um kein direktes Mutieren der Originaldaten zu vermeiden
    const dataCopy = { ...data };
    
    // Versuche, alle weisPoints-Felder in der roundHistory entfernen, da diese potenziell beim Speichern
    // zu einem Duplikat des obersten weisPoints-Feldes führen können
    if (dataCopy.roundHistory && Array.isArray(dataCopy.roundHistory)) {
      dataCopy.roundHistory = dataCopy.roundHistory.map((entry) => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          // Tiefe Kopie, um Mutationen zu vermeiden
          const entryCopy = { ...entry };
          
          // Prüfe, ob es ein weisPoints-Feld gibt, und ersetze es optional durch ein anderes Feld,
          // das später nicht mit dem obersten weisPoints kollidieren kann
          if ('weisPoints' in entryCopy) {
            entryCopy._savedWeisPoints = entryCopy.weisPoints; // Speichere unter anderem Namen
          }
          
          return entryCopy;
        }
        return entry;
      });
    }
    
    // Verwende die modifizierte Version für die weitere Verarbeitung
    data = dataCopy;
  }
  
  for (const key in data) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      const value = sanitizeDataForFirestore(data[key], opts);
      
      // Überspringe leere Arrays wenn die Option gesetzt ist
      if (opts.removeEmptyArrays && Array.isArray(value) && value.length === 0) {
        continue;
      }
      
      // Überspringe leere Objekte wenn die Option gesetzt ist
      if (opts.removeEmptyObjects && typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) {
        continue;
      }
      
      cleanedObj[key] = value;
    }
  }

  // Wenn das Objekt leer ist und die Option gesetzt ist, null zurückgeben
  if (opts.removeEmptyObjects && Object.keys(cleanedObj).length === 0) {
    return null;
  }

  return cleanedObj;
}

/**
 * Einfache Version, die nur undefined-Werte durch null ersetzt, ohne weitere Optionen
 */
export function replaceUndefinedWithNull(data: any): any {
  return sanitizeDataForFirestore(data, {
    removeEmptyArrays: false,
    removeEmptyObjects: false
  });
} 