import * as admin from 'firebase-admin';

const serviceAccount = require('../../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Trigger updateGroupChartData für die korrigierte Session
 */
async function updateChartData() {
  const groupId = 'Tz0wgIHMTlhvTtFastiJ';
  
  console.log('🔧 Triggering updateGroupChartData...');
  
  try {
    console.log('📊 Regenerating chartData_elo...');
    
    // Lade alle Sessions
    const sessionsSnap = await db.collection(`groups/${groupId}/jassGameSummaries`)
      .orderBy('completedAt', 'asc')
      .get();
    
    const allLabels = new Set<string>();
    const playerDataMap = new Map<string, any[]>();
    
    // Sammle alle Datenpunkte
    for (const doc of sessionsSnap.docs) {
      const sessionData = doc.data();
      const playerFinalRatings = sessionData.playerFinalRatings || {};
      const sessionDate = sessionData.completedAt?.toDate?.() || new Date();
      const label = sessionDate.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: '2-digit' 
      });
      
      allLabels.add(label);
      
      for (const [playerId, ratingData] of Object.entries(playerFinalRatings)) {
        if (!playerDataMap.has(playerId)) {
          playerDataMap.set(playerId, []);
        }
        
        const data = ratingData as any;
        if (data && typeof data.rating === 'number') {
          playerDataMap.get(playerId)!.push({
            label,
            rating: data.rating
          });
        }
      }
    }
    
    // Sortiere Labels
    const sortedLabels = Array.from(allLabels).sort((a, b) => {
      const [dayA, monthA, yearA] = a.split('.');
      const [dayB, monthB, yearB] = b.split('.');
      const dateA = new Date(2000 + parseInt(yearA), parseInt(monthA) - 1, parseInt(dayA));
      const dateB = new Date(2000 + parseInt(yearB), parseInt(monthB) - 1, parseInt(dayB));
      return dateA.getTime() - dateB.getTime();
    });
    
    // Erstelle Datasets
    const colors = [
      { bg: 'rgba(5, 150, 105, 0.1)', border: '#059669' },
      { bg: 'rgba(234, 88, 12, 0.1)', border: '#ea580c' },
      { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6' },
      { bg: 'rgba(220, 38, 38, 0.1)', border: '#dc2626' },
      { bg: 'rgba(147, 51, 234, 0.1)', border: '#9333ea' },
      { bg: 'rgba(236, 72, 153, 0.1)', border: '#ec4899' },
      { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b' },
      { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981' },
      { bg: 'rgba(139, 92, 246, 0.1)', border: '#8b5cf6' },
      { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444' },
    ];
    
    const datasets = [];
    let colorIndex = 0;
    
    for (const [playerId, dataPoints] of playerDataMap.entries()) {
      // Hole Spieler-Daten
      const memberDoc = await db.doc(`groups/${groupId}/members/${playerId}`).get();
      const memberData = memberDoc.data();
      const displayName = memberData?.displayName || `Spieler_${playerId.slice(0, 6)}`;
      
      // Erstelle Dataset mit allen Labels (null für fehlende Sessions)
      const data = sortedLabels.map(label => {
        const dataPoint = dataPoints.find(d => d.label === label);
        return dataPoint ? dataPoint.rating : null;
      });
      
      const color = colors[colorIndex % colors.length];
      colorIndex++;
      
      datasets.push({
        label: displayName,
        data,
        backgroundColor: color.bg,
        borderColor: color.border,
        playerId,
        displayName,
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.1,
        spanGaps: true,
      });
    }
    
    // Sortiere Datasets nach aktuellem Rating
    datasets.sort((a, b) => {
      const aLast = a.data.filter((d: any) => d !== null).pop() || 0;
      const bLast = b.data.filter((d: any) => d !== null).pop() || 0;
      return bLast - aLast;
    });
    
    // Speichere chartData_elo
    const chartData = {
      datasets,
      labels: sortedLabels,
      lastUpdated: admin.firestore.Timestamp.now(),
      totalPlayers: datasets.length,
      totalSessions: sortedLabels.length,
    };
    
    await db.doc(`groups/${groupId}/aggregated/chartData_elo`).set(chartData);
    
    console.log('✅ chartData_elo successfully regenerated!');
    console.log(`   - ${datasets.length} players`);
    console.log(`   - ${sortedLabels.length} sessions`);
    console.log(`   - Labels: ${sortedLabels.slice(-5).join(', ')}`);
    
  } catch (error) {
    console.error('❌ ERROR:', error);
  }
}

updateChartData()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

