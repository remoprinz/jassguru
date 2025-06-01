import * as admin from 'firebase-admin';

// Prüfe, ob die App bereits initialisiert wurde
if (!admin.apps.length) {
  try {
    // Lade Service Account Credentials aus Umgebungsvariablen
    // Stelle sicher, dass FIREBASE_SERVICE_ACCOUNT_JSON gesetzt ist
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');

    // Prüfe, ob die Credentials gültig sind (einfache Prüfung)
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON ist nicht korrekt konfiguriert.');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Optional: databaseURL hinzufügen, wenn Realtime Database verwendet wird
      // databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    });
    console.log('Firebase Admin SDK erfolgreich initialisiert.');
  } catch (error) {
    console.error('Fehler bei der Initialisierung des Firebase Admin SDK:', error);
    // Im Fehlerfall wird ein leeres Objekt exportiert, um Abstürze zu vermeiden,
    // aber Funktionen werden nicht korrekt arbeiten.
    // Überlege, ob hier ein kritischerer Fehler ausgelöst werden sollte.
  }
}

// Exportiere das initialisierte Admin SDK
export const firebaseAdmin = admin; 