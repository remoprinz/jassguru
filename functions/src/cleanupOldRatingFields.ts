import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';
import { onRequest } from 'firebase-functions/v2/https';

export const cleanupOldRatingFields = onRequest(async (req, res) => {
  logger.info('🧹 Starte Cleanup der alten Rating-Felder...');
  
  try {
    const db = admin.firestore();
    
    // Alle players/* Dokumente laden
    const playersSnapshot = await db.collection('players').get();
    logger.info(`📊 Gefunden: ${playersSnapshot.size} Player-Dokumente`);
    
    let processedCount = 0;
    let cleanedCount = 0;
    const batch = db.batch();
    
    for (const doc of playersSnapshot.docs) {
      const data = doc.data();
      const docId = doc.id;
      
      // Prüfe ob alte Felder vorhanden sind
      const hasOldFields = data.peakRating !== undefined || 
                          data.peakRatingDate !== undefined || 
                          data.lowestRating !== undefined || 
                          data.lowestRatingDate !== undefined ||
                          data.rating !== undefined ||
                          data.gamesPlayed !== undefined;
      
      if (hasOldFields) {
        logger.info(`🔍 Player ${docId}: Alte Felder gefunden`);
        const updates: any = {};
        
        if (data.peakRating !== undefined) {
          logger.info(`   - peakRating: ${data.peakRating}`);
          updates.peakRating = admin.firestore.FieldValue.delete();
        }
        if (data.peakRatingDate !== undefined) {
          logger.info(`   - peakRatingDate: ${data.peakRatingDate}`);
          updates.peakRatingDate = admin.firestore.FieldValue.delete();
        }
        if (data.lowestRating !== undefined) {
          logger.info(`   - lowestRating: ${data.lowestRating}`);
          updates.lowestRating = admin.firestore.FieldValue.delete();
        }
        if (data.lowestRatingDate !== undefined) {
          logger.info(`   - lowestRatingDate: ${data.lowestRatingDate}`);
          updates.lowestRatingDate = admin.firestore.FieldValue.delete();
        }
        if (data.rating !== undefined) {
          logger.info(`   - rating (veraltet): ${data.rating}`);
          updates.rating = admin.firestore.FieldValue.delete();
        }
        if (data.gamesPlayed !== undefined) {
          logger.info(`   - gamesPlayed (veraltet): ${data.gamesPlayed}`);
          updates.gamesPlayed = admin.firestore.FieldValue.delete();
        }
        
        // Felder explizit löschen
        batch.update(doc.ref, updates);
        
        cleanedCount++;
      }
      
      processedCount++;
      
      // Batch alle 500 Dokumente committen (Firestore Limit)
      if (processedCount % 500 === 0) {
        logger.info(`📝 Committe Batch nach ${processedCount} Dokumenten...`);
        await batch.commit();
        logger.info(`✅ Batch erfolgreich committed`);
      }
    }
    
    // Letzten Batch committen falls noch Dokumente übrig
    if (processedCount % 500 !== 0) {
      logger.info(`📝 Committe finalen Batch...`);
      await batch.commit();
      logger.info(`✅ Finaler Batch erfolgreich committed`);
    }
    
    logger.info(`🎉 Cleanup abgeschlossen!`);
    logger.info(`📊 Verarbeitet: ${processedCount} Dokumente`);
    logger.info(`🧹 Bereinigt: ${cleanedCount} Dokumente`);
    
    res.status(200).json({
      success: true,
      message: 'Cleanup erfolgreich abgeschlossen',
      processed: processedCount,
      cleaned: cleanedCount
    });
  } catch (error) {
    logger.error('❌ Fehler beim Cleanup:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
