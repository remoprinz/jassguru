// Emergency Reset für Benutzer bei App-Problemen
import { handleIndexedDBCorruption } from './indexedDBHelper';

declare global {
  interface Window {
    jassguru_emergency_reset: () => Promise<void>;
    jassguru_clear_all_data: () => Promise<void>;
  }
}

// Globale Emergency-Funktionen für die Konsole
export const setupEmergencyFunctions = (): void => {
  if (typeof window === 'undefined') return;

  // 1. IndexedDB Reparatur
  window.jassguru_emergency_reset = async (): Promise<void> => {
    try {
      console.log('🚨 EMERGENCY RESET gestartet...');
      await handleIndexedDBCorruption();
    } catch (error) {
      console.error('❌ Emergency Reset fehlgeschlagen:', error);
      alert('Emergency Reset fehlgeschlagen. Versuche Browser-Cache manuell zu löschen.');
    }
  };

  // 2. Komplette Daten-Löschung
  window.jassguru_clear_all_data = async (): Promise<void> => {
    try {
      if (!confirm('⚠️ WARNUNG: Alle App-Daten werden gelöscht!\n\nDies löscht:\n- Alle lokalen Spielstände\n- Login-Informationen\n- App-Einstellungen\n\nFortfahren?')) {
        return;
      }

      console.log('🗑️ COMPLETE DATA CLEAR gestartet...');
      
      // Alle localStorage löschen
      localStorage.clear();
      
      // Alle sessionStorage löschen  
      sessionStorage.clear();
      
      // Alle IndexedDB löschen
      await handleIndexedDBCorruption();
      
      alert('✅ Alle Daten gelöscht! Die App wird neu geladen...');
      
    } catch (error) {
      console.error('❌ Complete Data Clear fehlgeschlagen:', error);
      alert('Complete Data Clear fehlgeschlagen. Versuche Browser komplett zu schließen und neu zu öffnen.');
    }
  };

  // Hilfe-Nachrichten in der Konsole
  console.log(`
🆘 JASSGURU EMERGENCY FUNCTIONS:

Falls die App nicht funktioniert:

1. IndexedDB Reparatur:
   jassguru_emergency_reset()

2. Alle Daten löschen (VORSICHT!):
   jassguru_clear_all_data()

Kopiere eine der Funktionen und drücke Enter.
  `);
}; 