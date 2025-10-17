import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

/**
 * Einfaches Script zum Hinzufügen des Turniernamens für das Krakau 2025 Turnier
 */
export const addTournamentNameForKrakau = async () => {
  const db = admin.firestore();
  
  try {
    console.log('🚀 Füge Turniername für Krakau 2025 hinzu...');
    
    const tournamentId = 'kjoeh4ZPGtGr8GA8gp9p';
    const tournamentName = 'Krakau 2025';
    
    // 1. Alle Gruppen durchgehen
    const groupsSnapshot = await db.collection('groups').get();
    console.log(`📁 Gefunden: ${groupsSnapshot.size} Gruppen`);
    
    let totalUpdated = 0;
    
    for (const groupDoc of groupsSnapshot.docs) {
      const groupId = groupDoc.id;
      
      // 2. Turnier-Sessions für dieses spezifische Turnier finden
      const summariesSnapshot = await db
        .collection('groups')
        .doc(groupId)
        .collection('jassGameSummaries')
        .where('tournamentId', '==', tournamentId)
        .get();
      
      if (summariesSnapshot.size > 0) {
        console.log(`📊 Gruppe ${groupId}: ${summariesSnapshot.size} Sessions für Krakau gefunden`);
        
        for (const summaryDoc of summariesSnapshot.docs) {
          const data = summaryDoc.data();
          
          // 3. Prüfen ob bereits tournamentName vorhanden ist
          if (data.tournamentName) {
            console.log(`✅ ${summaryDoc.id}: tournamentName bereits vorhanden (${data.tournamentName})`);
            continue;
          }
          
          // 4. tournamentName hinzufügen
          await summaryDoc.ref.update({
            tournamentName: tournamentName
          });
          
          console.log(`✅ ${summaryDoc.id}: tournamentName "${tournamentName}" hinzugefügt`);
          totalUpdated++;
        }
      }
    }
    
    console.log(`\n🎉 Fertig! ${totalUpdated} Sessions für Krakau 2025 aktualisiert.`);
  } catch (error) {
    console.error('❌ Fehler beim Hinzufügen des Turniernamens:', error);
    throw error;
  }
};

/**
 * Cloud Function zum Ausführen des Scripts
 */
export const runAddTournamentNameScript = onCall(async (request) => {
  // Sicherheitsprüfung: Nur authentifizierte Benutzer
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Nur authentifizierte Benutzer können dieses Script ausführen.');
  }
  
  try {
    await addTournamentNameForKrakau();
    return { success: true, message: 'Turniername für Krakau 2025 erfolgreich hinzugefügt.' };
  } catch (error) {
    console.error('Fehler beim Ausführen des Scripts:', error);
    throw new HttpsError('internal', 'Fehler beim Hinzufügen des Turniernamens.');
  }
});