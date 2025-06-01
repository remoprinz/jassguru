/**
 * Cloud Function: cleanupFutureRounds
 * 
 * Diese Funktion wird ausgelöst, wenn ein neues Dokument in der 'rounds'-Unterkollektion
 * eines aktiven Spiels erstellt wird. Sie deaktiviert (statt zu löschen) alle aktiven Rundeneinträge
 * mit einer höheren roundId als die des neu hinzugefügten Eintrags, sowie alle älteren
 * Einträge mit der gleichen roundId.
 */
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.cleanupFutureRounds = functions.firestore
  .document('activeGames/{gameId}/rounds/{roundId}')
  .onCreate(async (snapshot, context) => {
    const newRound = snapshot.data();
    const gameId = context.params.gameId;
    const documentId = context.params.roundId; // Die Dokument-ID (nicht die roundId) der neuen Runde
    
    console.log(`[cleanupFutureRounds] Triggered for game ${gameId} by new round ${documentId} with roundId ${newRound.roundId}.`);

    // Sicherstellen, dass die neue Runde eine gültige roundId hat
    if (typeof newRound.roundId !== 'number') {
      console.warn(`[cleanupFutureRounds] Invalid roundId in new document: ${newRound.roundId}. Expected a number.`);
      return null;
    }

    try {
      const db = admin.firestore();
      const batch = db.batch();
      
      // 1. Alle aktiven Runden mit höherer roundId (zukünftige Runden) finden
      const futureRoundsQuery = db.collection(`activeGames/${gameId}/rounds`)
        .where('roundId', '>', newRound.roundId)
        .where('isActive', '==', true);
      
      const futureRoundsSnapshot = await futureRoundsQuery.get();
      
      // 2. Alle anderen aktiven Einträge mit gleicher roundId (Duplikate) finden, 
      // außer dem gerade erstellten Dokument
      const duplicatesQuery = db.collection(`activeGames/${gameId}/rounds`)
        .where('roundId', '==', newRound.roundId)
        .where('isActive', '==', true);
      
      const duplicatesSnapshot = await duplicatesQuery.get();
      
      // Zähler für deaktivierte Dokumente
      let deactivatedCount = 0;
      
      // Deaktiviere zukünftige Runden
      if (!futureRoundsSnapshot.empty) {
        futureRoundsSnapshot.forEach(doc => {
          console.log(`[cleanupFutureRounds] Deaktiviere Dokument ${doc.id} (roundId: ${doc.data().roundId})`);
          batch.update(doc.ref, { 
            isActive: false,
            deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          deactivatedCount++;
        });
      }
      
      // Deaktiviere Duplikate (gleiche roundId, aber nicht das aktuelle Dokument)
      if (!duplicatesSnapshot.empty) {
        duplicatesSnapshot.forEach(doc => {
          // Überspringe das gerade erstellte Dokument
          if (doc.id !== documentId) {
            console.log(`[cleanupFutureRounds] Deaktiviere Duplikat ${doc.id} (roundId: ${doc.data().roundId})`);
            batch.update(doc.ref, { 
              isActive: false,
              deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            deactivatedCount++;
          }
        });
      }
      
      // Commit the batch if there's anything to update
      if (deactivatedCount > 0) {
        await batch.commit();
        console.log(`[cleanupFutureRounds] Erfolgreich ${deactivatedCount} Runden deaktiviert für Spiel ${gameId} nach roundId ${newRound.roundId}.`);
      } else {
        console.log(`[cleanupFutureRounds] Keine zukünftigen Runden oder Duplikate gefunden für Spiel ${gameId} nach roundId ${newRound.roundId}. Nichts zu tun.`);
      }
      
      return null;
    } catch (error) {
      console.error(`[cleanupFutureRounds] Fehler beim Deaktivieren von Runden für Spiel ${gameId}:`, error);
      return null;
    }
  }); 