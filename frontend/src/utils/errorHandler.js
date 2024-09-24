import { logError } from './logger';

export const errorHandler = (err, vm, info) => {
  logError('Globaler Fehlerhandler', err, { 
    komponente: vm?.$options.name || 'Unbekannte Komponente',
    zusatzinfo: info 
  });
  
  // Hier können Sie zusätzliche Fehlerbehandlungslogik implementieren
  // z.B. Fehler an einen Fehler-Tracking-Service senden
};
