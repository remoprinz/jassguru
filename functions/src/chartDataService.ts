import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const db = admin.firestore();

// 🎨 Chart-Farbpalette (verbesserte Palette ohne ähnliche Grüntöne)
const CHART_COLORS = [
  { border: '#059669', background: 'rgba(5, 150, 105, 0.1)' }, // Emerald (einziges Grün)
  { border: '#ea580c', background: 'rgba(234, 88, 12, 0.1)' }, // Orange
  { border: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)' }, // Blue
  { border: '#dc2626', background: 'rgba(220, 38, 38, 0.1)' }, // Red
  { border: '#9333ea', background: 'rgba(147, 51, 234, 0.1)' }, // Violet
  { border: '#ec4899', background: 'rgba(236, 72, 153, 0.1)' }, // Pink
  { border: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)' }, // Amber
  { border: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)' }, // Violet-500
  { border: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }, // Red-500
  { border: '#06b6d4', background: 'rgba(6, 182, 212, 0.1)' }, // Cyan
  { border: '#f97316', background: 'rgba(249, 115, 22, 0.1)' }, // Orange-500
  { border: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' }, // Purple
  { border: '#e11d48', background: 'rgba(225, 29, 72, 0.1)' }, // Rose
  { border: '#0891b2', background: 'rgba(8, 145, 178, 0.1)' }, // Sky
  { border: '#7c3aed', background: 'rgba(124, 58, 237, 0.1)' }, // Indigo
];

export interface ChartDataset {
  label: string;
  data: (number | null)[];
  borderColor: string;
  backgroundColor: string;
  playerId: string;
  displayName: string;
  tension: number;
  pointRadius: number;
  pointHoverRadius: number;
  spanGaps: boolean;
}

export interface ChartDataSnapshot {
  labels: string[];
  datasets: ChartDataset[];
  lastUpdated: admin.firestore.Timestamp;
  totalPlayers: number;
  totalSessions: number;
}

/**
 * 🎯 ELEGANTE LÖSUNG: Aggregiere Game-by-Game zu Session-Level
 * 
 * Diese Funktion liest Game-by-Game Daten aus players/{pid}/ratingHistory
 * und aggregiert sie intelligent zu Session-Level Daten für GroupView.tsx
 * 
 * KERN-LOGIK: Für jede Session → Rating nach dem LETZTEN Spiel
 */
export async function saveChartDataSnapshot(groupId: string): Promise<void> {
  logger.info(`[ChartData] Starting elegant chart data calculation for group ${groupId}`);
  
  try {
    // 1. Hole alle Mitglieder der Gruppe
    const membersRef = db.collection(`groups/${groupId}/members`);
    const membersSnap = await membersRef.get();
    
    if (membersSnap.empty) {
      logger.warn(`[ChartData] No members found for group ${groupId}`);
      return;
    }

    // 2. Sammle alle Game-by-Game Rating History Einträge
    const allGameEntries = new Map<string, Array<{
      sessionId: string;
      gameNumber: number;
      rating: number;
      timestamp: Date;
      playerId: string;
    }>>();

    for (const memberDoc of membersSnap.docs) {
      const playerId = memberDoc.id;
      
      // Lade Game-by-Game Rating History
      const historyRef = db.collection(`players/${playerId}/ratingHistory`);
      const historySnap = await historyRef.orderBy('createdAt', 'asc').get();
      
      if (historySnap.empty) continue;

      const playerEntries: Array<{
        sessionId: string;
        gameNumber: number;
        rating: number;
        timestamp: Date;
        playerId: string;
      }> = [];

      historySnap.forEach(doc => {
        const data = doc.data();
        
        // Robuste Datum-Konvertierung
        let timestamp: Date;
        if (data.createdAt && typeof data.createdAt.toDate === 'function') {
          timestamp = data.createdAt.toDate();
        } else if (data.createdAt && typeof data.createdAt === 'object' && '_seconds' in data.createdAt) {
          const seconds = data.createdAt._seconds || 0;
          const nanoseconds = data.createdAt._nanoseconds || 0;
          timestamp = new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000));
        } else {
          logger.warn(`[ChartData] Ungültiges Datum für Spieler ${playerId}:`, data.createdAt);
          timestamp = new Date(); // Fallback
        }
        
        playerEntries.push({
          sessionId: data.sessionId || 'unknown',
          gameNumber: data.gameNumber || 1,
          rating: data.rating || 100,
          timestamp: timestamp,
          playerId: playerId
        });
      });

      if (playerEntries.length > 0) {
        allGameEntries.set(playerId, playerEntries);
      }
    }

    if (allGameEntries.size === 0) {
      logger.warn(`[ChartData] No game entries found for group ${groupId}`);
      return;
    }

    // 3. Hole alle Sessions der Gruppe für Validierung
    const sessionsRef = db.collection(`groups/${groupId}/jassGameSummaries`)
      .where('status', '==', 'completed')
      .orderBy('endedAt', 'asc');
    const sessionsSnap = await sessionsRef.get();
    
    // Erstelle Session-Map für Validierung
    const sessionMap = new Map<string, {
      date: string;
      participants: string[];
      endedAt: Date;
    }>();
    
    sessionsSnap.docs.forEach(doc => {
      const data = doc.data();
      const endedAt = data.endedAt?.toDate?.() || new Date();
      const dateKey = endedAt.toISOString().split('T')[0];
      
      sessionMap.set(doc.id, {
        date: dateKey,
        participants: data.participantPlayerIds || [],
        endedAt: endedAt
      });
    });

    // 4. 🎯 KERN-LOGIK: Aggregiere zu Session-Level
    // Für jede Session: Finde das Rating nach dem LETZTEN Spiel
    const sessionEndRatings = new Map<string, Map<string, {
      rating: number;
      date: string;
      playerName: string;
    }>>();

    // Gruppiere alle Game-Einträge nach Session
    const sessionGameMap = new Map<string, Array<{
      playerId: string;
      gameNumber: number;
      rating: number;
      timestamp: Date;
    }>>();

    allGameEntries.forEach((playerEntries, playerId) => {
      playerEntries.forEach(entry => {
        if (!sessionGameMap.has(entry.sessionId)) {
          sessionGameMap.set(entry.sessionId, []);
        }
        sessionGameMap.get(entry.sessionId)!.push({
          playerId: playerId,
          gameNumber: entry.gameNumber,
          rating: entry.rating,
          timestamp: entry.timestamp
        });
      });
    });

    // Für jede Session: Finde das letzte Spiel pro Spieler
    sessionGameMap.forEach((gameEntries, sessionId) => {
      const sessionInfo = sessionMap.get(sessionId);
      if (!sessionInfo) {
        logger.warn(`[ChartData] Session ${sessionId} nicht in Session-Map gefunden`);
        return;
      }

      // Gruppiere nach Spieler und finde höchste gameNumber
      const playerLastGames = new Map<string, {
        gameNumber: number;
        rating: number;
        timestamp: Date;
      }>();

      gameEntries.forEach(entry => {
        // ✅ VALIDIERUNG: Prüfe ob Spieler wirklich in Session war
        if (!sessionInfo.participants.includes(entry.playerId)) {
          logger.warn(`[ChartData] Spieler ${entry.playerId} war nicht in Session ${sessionId}, aber hat Rating History Eintrag`);
          return; // Überspringe diesen Eintrag
        }

        const existing = playerLastGames.get(entry.playerId);
        if (!existing || entry.gameNumber > existing.gameNumber) {
          playerLastGames.set(entry.playerId, {
            gameNumber: entry.gameNumber,
            rating: entry.rating,
            timestamp: entry.timestamp
          });
        }
      });

      // Speichere Session-End-Ratings
      if (!sessionEndRatings.has(sessionInfo.date)) {
        sessionEndRatings.set(sessionInfo.date, new Map());
      }

      playerLastGames.forEach((lastGame, playerId) => {
        const memberDoc = membersSnap.docs.find(doc => doc.id === playerId);
        const memberData = memberDoc?.data();
        const playerName = memberData?.displayName || `Spieler_${playerId.slice(0, 6)}`;

        sessionEndRatings.get(sessionInfo.date)!.set(playerId, {
          rating: lastGame.rating,
          date: sessionInfo.date,
          playerName: playerName
        });
      });
    });

    // 5. Erstelle sortierte Liste aller Session-Daten
    const sortedSessionDates = Array.from(sessionEndRatings.keys()).sort();

    // 6. Erstelle Chart-Datasets
    const datasets: ChartDataset[] = [];
    const allPlayerIds = new Set<string>();
    
    // Sammle alle Spieler-IDs
    sessionEndRatings.forEach(sessionData => {
      sessionData.forEach((_, playerId) => {
        allPlayerIds.add(playerId);
      });
    });

    // Sortiere Spieler nach aktuellem Rating (höchstes zuerst)
    const sortedPlayers = Array.from(allPlayerIds).sort((a, b) => {
      // Finde das neueste Rating für jeden Spieler
      let aLatestRating = 100;
      let bLatestRating = 100;
      
      // Durchlaufe alle Sessions chronologisch und finde das neueste Rating
      for (const dateKey of sortedSessionDates) {
        const sessionData = sessionEndRatings.get(dateKey);
        if (sessionData?.has(a)) {
          aLatestRating = sessionData.get(a)?.rating || 100;
        }
        if (sessionData?.has(b)) {
          bLatestRating = sessionData.get(b)?.rating || 100;
        }
      }
      
      return bLatestRating - aLatestRating;
    });

    sortedPlayers.forEach((playerId, colorIndex) => {
      const memberDoc = membersSnap.docs.find(doc => doc.id === playerId);
      const memberData = memberDoc?.data();
      const playerName = memberData?.displayName || `Spieler_${playerId.slice(0, 6)}`;

      const alignedData: (number | null)[] = sortedSessionDates.map(dateKey => {
        return sessionEndRatings.get(dateKey)?.get(playerId)?.rating ?? null;
      });
      
      datasets.push({
        label: playerName,
        data: alignedData,
        borderColor: CHART_COLORS[colorIndex % CHART_COLORS.length].border,
        backgroundColor: CHART_COLORS[colorIndex % CHART_COLORS.length].background,
        playerId,
        displayName: playerName,
        tension: 0.1,
        pointRadius: 2,
        pointHoverRadius: 4,
        spanGaps: true,
      });
    });

    // 7. Erstelle Labels (Session-Datum-Strings)
    const labels = sortedSessionDates.map(dateStr => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
      });
    });

    // 8. Erstelle Chart-Data-Snapshot
    const chartDataSnapshot: ChartDataSnapshot = {
      labels,
      datasets,
      lastUpdated: admin.firestore.Timestamp.now(),
      totalPlayers: sortedPlayers.length,
      totalSessions: sortedSessionDates.length,
    };

    // 9. Speichere in Firestore
    await db.doc(`groups/${groupId}/aggregated/chartData`).set(chartDataSnapshot);
    
    logger.info(`[ChartData] Successfully saved elegant chart data for group ${groupId}:`, {
      players: sortedPlayers.length,
      sessions: sortedSessionDates.length,
      dataPoints: labels.length,
      datasets: datasets.length,
      gameEntriesProcessed: Array.from(allGameEntries.values()).reduce((sum, entries) => sum + entries.length, 0)
    });
  } catch (error) {
    logger.error(`[ChartData] Error calculating elegant chart data for group ${groupId}:`, error);
    throw error;
  }
}

/**
 * 🧹 Cleanup: Entferne alte Chart-Daten (falls nötig)
 */
export async function cleanupChartData(groupId: string): Promise<void> {
  try {
    // Für jetzt: Einfach das aktuelle Dokument löschen
    // Später könnte man hier eine Retention-Policy implementieren
    await db.doc(`groups/${groupId}/aggregated/chartData`).delete();
    logger.info(`[ChartData] Cleaned up chart data for group ${groupId}`);
  } catch (error) {
    logger.warn(`[ChartData] Error during cleanup for group ${groupId}:`, error);
  }
}