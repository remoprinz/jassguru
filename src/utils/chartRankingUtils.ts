// ✅ LÖSUNG: Verwende Backfill-Daten für alle Ranglisten
// Das Problem: Charts zeigen korrekte Werte, aber Ranglisten zeigen falsche Werte
// Grund: Charts verwenden Backfill-Daten (mit Tournament-Daten), Ranglisten verwenden groupStats (ohne Tournament-Daten)

// 🎯 STRATEGIE: Erstelle eine Hilfsfunktion die Backfill-Daten für Ranglisten verwendet

export const getRankingFromChartData = (chartData: any, members: any[], playerStats?: any) => {
  if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
    return [];
  }


  // ✅ Hilfsfunktion: Finde letzten nicht-null Wert (optimiert!)
  const getLastNonNullValue = (data: any[]): number => {
    // Durchsuche von hinten nach vorne (für letzten Wert)
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i] !== null && data[i] !== undefined) {
        return data[i];
      }
    }
    return 0; // Fallback wenn alle null sind
  };

  // Sortiere Datasets nach letztem nicht-null Wert (höchster Wert zuerst)
  const sortedDatasets = chartData.datasets
    .map(dataset => ({
      ...dataset,
      currentValue: getLastNonNullValue(dataset.data),
      dataPoints: dataset.data.filter(d => d !== null && d !== undefined).length
    }))
    .sort((a, b) => b.currentValue - a.currentValue);

  return sortedDatasets.map((dataset, index) => {
    const playerData = members.find(m => (m.id || m.userId) === dataset.playerId);
    
    // ✅ KORREKTUR: Verwende gamesPlayed aus playerStats (Anzahl Spiele, nicht Sessions!)
    let gamesPlayed = dataset.dataPoints; // Fallback: Sessions als Anzahl
    
    if (playerStats && playerStats[dataset.playerId]) {
      gamesPlayed = playerStats[dataset.playerId].gamesPlayed || dataset.dataPoints;
    } else if (playerData && playerData.globalStats?.current?.gamesPlayed) {
      gamesPlayed = playerData.globalStats.current.gamesPlayed;
    }
    
    // ✅ NEU: Session-Siege/Niederlagen/Unentschiedene für Siegquote
    // Format: (wins/losses/draws) z.B. (14/7/1)
    let sessionStats = '';
    if (playerStats && playerStats[dataset.playerId] && playerStats[dataset.playerId].sessionStats) {
      const stats = playerStats[dataset.playerId].sessionStats;
      const totalDecidedSessions = stats.wins + stats.losses;
      // Nur entschiedene Sessions anzeigen (wins/losses), draws separat
      sessionStats = `(${stats.wins}/${stats.losses}/${stats.draws})`;
    }
    
    return {
      rank: index + 1,
      playerId: dataset.playerId,
      playerName: dataset.label,
      displayName: dataset.displayName,
      currentValue: Math.trunc(dataset.currentValue),
      dataPoints: dataset.dataPoints, // Sessions (für Chart)
      gamesPlayed: gamesPlayed, // ✅ NEU: Anzahl Spiele (für Rangliste)
      sessionStats: sessionStats, // ✅ NEU: Session-Siege/Niederlagen/Unentschiedene
      playerData: playerData
    };
  });
};

// 🎯 VERWENDUNG in GroupView.tsx:
// 
// // Strichdifferenz Rangliste
// const stricheRanking = getRankingFromChartData(stricheChartData, members);
// 
// // Punktedifferenz Rangliste  
// const pointsRanking = getRankingFromChartData(pointsChartData, members);
//
// // Elo Rangliste
// const eloRanking = getRankingFromChartData(chartData, members);

/**
 * 🎯 TEAM-RANKING aus Chart-Daten
 * Analog zu getRankingFromChartData, aber für Team-Datasets
 */
export const getTeamRankingFromChartData = (
  chartData: any,
  members: any[]
): Array<{
  rank: number;
  teamId: string;
  teamName: string;
  currentValue: number;
  gamesPlayed?: number;
  dataPoints: number;
}> => {
  if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
    return [];
  }

  // ✅ Hilfsfunktion: Finde letzten nicht-null Wert
  const getLastNonNullValue = (data: any[]): number => {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i] !== null && data[i] !== undefined && !isNaN(data[i])) {
        return data[i];
      }
    }
    return 0;
  };

  // Sortiere Datasets nach letztem nicht-null Wert
  const sortedDatasets = chartData.datasets
    .map(dataset => ({
      ...dataset,
      currentValue: getLastNonNullValue(dataset.data),
      dataPoints: dataset.data.filter(d => d !== null && d !== undefined && !isNaN(d)).length
    }))
    .sort((a, b) => b.currentValue - a.currentValue);

  return sortedDatasets.map((dataset, index) => {
    // Extrahiere Team-Info aus Dataset
    const teamName = dataset.displayName || dataset.label;
    const teamId = dataset.teamId || '';
    
    // Berechne Anzahl Spiele für dieses Team
    // Dazu müssten wir alle Sessions durchgehen und zählen wie oft dieses Team gespielt hat
    // Für jetzt: Verwende dataPoints als Approximation
    const gamesPlayed = dataset.dataPoints;

    return {
      rank: index + 1,
      teamId,
      teamName,
      currentValue: Math.trunc(dataset.currentValue),
      dataPoints: dataset.dataPoints,
      gamesPlayed
    };
  });
};
