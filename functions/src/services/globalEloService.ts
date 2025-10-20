import * as admin from 'firebase-admin';
import { GlobalPlayerRating } from '../types';

/**
 * Service für globale Elo-Rating-Verwaltung
 * Verwaltet das globale Elo-Rating eines Spielers über alle Gruppen hinweg
 */
export class GlobalEloService {
  private db: admin.firestore.Firestore;

  constructor(db: admin.firestore.Firestore) {
    this.db = db;
  }

  /**
   * Holt das aktuelle globale Elo-Rating eines Spielers
   * ✅ KORRIGIERT: Liest direkt aus players.globalRating statt Sub-Collection
   */
  async getGlobalElo(playerId: string): Promise<number | null> {
    try {
      const playerDoc = await this.db.collection('players').doc(playerId).get();
      
      if (playerDoc.exists) {
        const data = playerDoc.data();
        return data?.globalRating || null;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Fehler beim Abrufen des globalen Elo für Spieler ${playerId}:`, error);
      return null;
    }
  }

  /**
   * Aktualisiert das globale Elo-Rating eines Spielers
   */
  async updateGlobalElo(
    playerId: string, 
    newRating: number, 
    groupId: string, 
    eventId: string,
    delta: number
  ): Promise<void> {
    try {
      const globalRatingRef = this.db.collection('players').doc(playerId).collection('globalRating').doc('current');
      const now = admin.firestore.Timestamp.now();
      
      // Hole aktuelles Rating für Peak/Lowest-Berechnung
      const currentSnap = await globalRatingRef.get();
      let currentData: GlobalPlayerRating;
      
      if (currentSnap.exists) {
        currentData = currentSnap.data() as GlobalPlayerRating;
      } else {
        // Erstelle neues globales Rating
        currentData = {
          playerId,
          currentRating: 100, // Default-Rating
          totalGamesPlayed: 0,
          lastUpdated: now,
          lastGroupId: groupId,
          lastEventId: eventId,
          peakRating: 100,
          peakRatingDate: now,
          lowestRating: 100,
          lowestRatingDate: now,
          lastDelta: 0
        };
      }
      
      // Aktualisiere Rating-Daten
      const updatedData: GlobalPlayerRating = {
        ...currentData,
        currentRating: newRating,
        totalGamesPlayed: currentData.totalGamesPlayed + 1,
        lastUpdated: now,
        lastGroupId: groupId,
        lastEventId: eventId,
        lastDelta: delta,
        
        // Peak-Rating aktualisieren
        peakRating: Math.max(currentData.peakRating, newRating),
        peakRatingDate: newRating > currentData.peakRating ? now : currentData.peakRatingDate,
        
        // Lowest-Rating aktualisieren
        lowestRating: Math.min(currentData.lowestRating, newRating),
        lowestRatingDate: newRating < currentData.lowestRating ? now : currentData.lowestRatingDate
      };
      
      await globalRatingRef.set(updatedData);
      
      console.log(`✅ Globales Elo für Spieler ${playerId} aktualisiert: ${currentData.currentRating} → ${newRating} (${delta > 0 ? '+' : ''}${delta})`);
    } catch (error) {
      console.error(`❌ Fehler beim Aktualisieren des globalen Elo für Spieler ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Erstellt ein neues globales Elo-Rating für einen Spieler
   */
  async createGlobalElo(playerId: string, initialRating: number = 100): Promise<void> {
    try {
      const globalRatingRef = this.db.collection('players').doc(playerId).collection('globalRating').doc('current');
      const now = admin.firestore.Timestamp.now();
      
      const initialData: GlobalPlayerRating = {
        playerId,
        currentRating: initialRating,
        totalGamesPlayed: 0,
        lastUpdated: now,
        lastGroupId: '',
        lastEventId: '',
        peakRating: initialRating,
        peakRatingDate: now,
        lowestRating: initialRating,
        lowestRatingDate: now,
        lastDelta: 0
      };
      
      await globalRatingRef.set(initialData);
      
      console.log(`✅ Neues globales Elo für Spieler ${playerId} erstellt: ${initialRating}`);
    } catch (error) {
      console.error(`❌ Fehler beim Erstellen des globalen Elo für Spieler ${playerId}:`, error);
      throw error;
    }
  }

  /**
   * Holt alle Spieler mit globalen Elo-Ratings
   */
  async getAllGlobalRatings(): Promise<GlobalPlayerRating[]> {
    try {
      const playersRef = this.db.collection('players');
      const playersSnap = await playersRef.get();
      
      const globalRatings: GlobalPlayerRating[] = [];
      
      for (const playerDoc of playersSnap.docs) {
        const globalRatingRef = playerDoc.ref.collection('globalRating').doc('current');
        const globalRatingSnap = await globalRatingRef.get();
        
        if (globalRatingSnap.exists) {
          globalRatings.push(globalRatingSnap.data() as GlobalPlayerRating);
        }
      }
      
      return globalRatings.sort((a, b) => b.currentRating - a.currentRating);
    } catch (error) {
      console.error('❌ Fehler beim Abrufen aller globalen Elo-Ratings:', error);
      throw error;
    }
  }

  /**
   * Berechnet das globale Elo-Rating aus allen Gruppen-Histories
   * Wird für Migration verwendet
   */
  async calculateGlobalEloFromHistory(playerId: string): Promise<number> {
    try {
      // Hole alle Gruppen des Spielers
      const playerRef = this.db.collection('players').doc(playerId);
      const playerSnap = await playerRef.get();
      
      if (!playerSnap.exists) {
        return 100; // Default-Rating
      }
      
      const playerData = playerSnap.data();
      const groupIds = playerData?.groupIds || [];
      
      let latestRating = 100;
      let latestTimestamp = 0;
      
      // Durchsuche alle Gruppen nach dem neuesten Rating
      for (const groupId of groupIds) {
        const historyRef = this.db.collection(`groups/${groupId}/playerRatings/${playerId}/history`);
        const historySnap = await historyRef.orderBy('createdAt', 'desc').limit(1).get();
        
        if (!historySnap.empty) {
          const latestEntry = historySnap.docs[0].data();
          const entryTimestamp = latestEntry.createdAt?.toMillis?.() || latestEntry.createdAt?._seconds * 1000 || 0;
          
          if (entryTimestamp > latestTimestamp) {
            latestRating = latestEntry.rating || latestEntry.globalRating || 100;
            latestTimestamp = entryTimestamp;
          }
        }
      }
      
      return latestRating;
    } catch (error) {
      console.error(`❌ Fehler beim Berechnen des globalen Elo aus History für Spieler ${playerId}:`, error);
      return 100; // Fallback
    }
  }
}
