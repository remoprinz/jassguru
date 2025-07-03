// IndexedDB Corruption Recovery Helper
export const clearCorruptedIndexedDB = async (): Promise<void> => {
  try {
    console.log('🔧 [IndexedDB Recovery] Starte Reparatur korrupter IndexedDB...');
    
    // 1. Alle bekannten App-Datenbanken löschen
    const dbNamesToClear = [
      'keyval-store',           // Zustand persistence
      'firebase-installations-store',
      'firebase-messaging-store',
      'firebaseLocalStorageDb',
      'firebase-app-check-store',
      'jassguru-app-store',    // Falls vorhanden
      '_defaultdb',            // Fallback
    ];

    for (const dbName of dbNamesToClear) {
      try {
        console.log(`🗑️ [IndexedDB Recovery] Lösche Datenbank: ${dbName}`);
        await new Promise<void>((resolve, reject) => {
          const deleteReq = indexedDB.deleteDatabase(dbName);
          deleteReq.onsuccess = () => {
            console.log(`✅ [IndexedDB Recovery] ${dbName} erfolgreich gelöscht`);
            resolve();
          };
          deleteReq.onerror = () => {
            console.log(`⚠️ [IndexedDB Recovery] ${dbName} nicht gefunden (OK)`);
            resolve(); // Nicht als Fehler werten
          };
          deleteReq.onblocked = () => {
            console.log(`🔄 [IndexedDB Recovery] ${dbName} blockiert, warte...`);
            setTimeout(() => resolve(), 1000);
          };
        });
      } catch (error) {
        console.log(`⚠️ [IndexedDB Recovery] Fehler bei ${dbName}:`, error);
        // Weiter machen, nicht stoppen
      }
    }

    // 2. LocalStorage für Zustand-Persistence löschen  
    const zustandKeys = Object.keys(localStorage).filter(key => 
      key.includes('zustand') || 
      key.includes('jassguru') ||
      key.includes('firebase') ||
      key.includes('tutorial') ||
      key.includes('auth')
    );
    
    zustandKeys.forEach(key => {
      try {
        localStorage.removeItem(key);
        console.log(`🗑️ [IndexedDB Recovery] LocalStorage Key gelöscht: ${key}`);
      } catch (error) {
        console.log(`⚠️ [IndexedDB Recovery] Fehler bei LocalStorage:`, error);
      }
    });

    console.log('✅ [IndexedDB Recovery] IndexedDB Reparatur abgeschlossen');
    
  } catch (error) {
    console.error('❌ [IndexedDB Recovery] Kritischer Fehler bei DB-Reparatur:', error);
    throw error;
  }
};

export const handleIndexedDBCorruption = async (): Promise<void> => {
  try {
    await clearCorruptedIndexedDB();
    
    // Kurz warten, dann Seite neu laden
    setTimeout(() => {
      console.log('🔄 [IndexedDB Recovery] Lade Seite neu...');
      window.location.reload();
    }, 1000);
    
  } catch (error) {
    console.error('❌ [IndexedDB Recovery] Fehler bei Korruptions-Behandlung:', error);
    
    // Letzter Ausweg: Hard-Reload
    setTimeout(() => {
      window.location.href = window.location.href;
    }, 2000);
  }
};

export const isIndexedDBCorruptionError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message || error.toString();
  return errorMessage.includes('refusing to open IndexedDB') ||
         errorMessage.includes('potential corruption') ||
         errorMessage.includes('lastClosedDbVersion') ||
         (error.name === 'VersionError' && errorMessage.includes('database'));
}; 