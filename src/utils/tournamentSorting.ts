/**
 * 🎯 Zentrale Sortier-Logik für Turnier-Rankings
 * 
 * Diese Utility stellt sicher, dass die Sortierung in allen Komponenten
 * (Rangliste, Chart, Cloud Functions) konsistent ist.
 * 
 * Best Practice: Single Source of Truth für Ranking-Sortierung
 */

export type RankingMode = 'striche' | 'total_points' | 'striche_difference' | 'points_difference' | 'alle_ranglisten';

export interface PlayerRankingData {
  playerId: string;
  playerName: string;
  totalStriche: number;
  totalPoints: number;
  stricheDifference?: number; // ✅ NEU: Für striche_difference Modus
  pointsDifference?: number; // ✅ NEU: Für points_difference Modus
  passesPlayed?: number;
  [key: string]: any; // Für zusätzliche Felder
}

export interface PlayerWithRank extends PlayerRankingData {
  rank: number;
}

/**
 * 🎯 KERN-FUNKTION: Sortiert Spieler nach Ranking-Modus mit Tie-Breaker
 * 
 * Sortier-Logik:
 * - Mode "total_points": Punkte (Primär) → Striche (Tie-Breaker 1) → Alphabetisch (Tie-Breaker 2)
 * - Mode "striche": Striche (Primär) → Punkte (Tie-Breaker 1) → Alphabetisch (Tie-Breaker 2)
 * - Mode "striche_difference": Strichdifferenz (Primär) → Striche (Tie-Breaker 1) → Punktedifferenz (Tie-Breaker 2) → Alphabetisch (Tie-Breaker 3)
 * - Mode "points_difference": Punktedifferenz (Primär) → Striche (Tie-Breaker 1) → Alphabetisch (Tie-Breaker 2)
 * - Mode "alle_ranglisten": Wird nicht direkt sortiert, sondern zeigt alle Modi an
 * 
 * @param players Array von Spielern mit Ranking-Daten
 * @param mode Ranking-Modus ('total_points', 'striche' oder 'striche_difference')
 * @returns Sortiertes Array (höchste Werte zuerst)
 */
export function sortPlayersByRankingMode<T extends PlayerRankingData>(
  players: T[],
  mode: RankingMode
): T[] {
  return [...players].sort((a, b) => {
    if (mode === 'total_points') {
      // Primary: Punkte (höchste zuerst)
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      
      // Tie-Breaker 1: Striche (höchste zuerst)
      if (b.totalStriche !== a.totalStriche) {
        return b.totalStriche - a.totalStriche;
      }
    } else if (mode === 'striche_difference') {
      // ✅ NEU: Primary: Strichdifferenz (höchste zuerst)
      const diffA = a.stricheDifference ?? 0;
      const diffB = b.stricheDifference ?? 0;
      if (diffB !== diffA) {
        return diffB - diffA;
      }
      
      // ✅ KORRIGIERT: Tie-Breaker 1: Striche (mehr Striche gewinnt)
      if (b.totalStriche !== a.totalStriche) {
        return b.totalStriche - a.totalStriche;
      }
      
      // ✅ Tie-Breaker 2: Punktedifferenz (höchste zuerst)
      const pointsDiffA = a.pointsDifference ?? 0;
      const pointsDiffB = b.pointsDifference ?? 0;
      if (pointsDiffB !== pointsDiffA) {
        return pointsDiffB - pointsDiffA;
      }
    } else if (mode === 'points_difference') {
      // ✅ NEU: Primary: Punktedifferenz (höchste zuerst)
      const diffA = a.pointsDifference ?? 0;
      const diffB = b.pointsDifference ?? 0;
      if (diffB !== diffA) {
        return diffB - diffA;
      }
      
      // Tie-Breaker 1: Striche (höchste zuerst)
      if (b.totalStriche !== a.totalStriche) {
        return b.totalStriche - a.totalStriche;
      }
    } else {
      // mode === 'striche'
      // Primary: Striche (höchste zuerst)
      if (b.totalStriche !== a.totalStriche) {
        return b.totalStriche - a.totalStriche;
      }
      
      // Tie-Breaker 1: Punkte (höchste zuerst)
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
    }
    
    // Tie-Breaker 2: Alphabetisch (A vor Z)
    return a.playerName.localeCompare(b.playerName);
  });
}

/**
 * 🎯 Berechnet Ränge mit Tie-Handling
 * 
 * Spieler mit exakt gleichen Werten (sowohl Primär als auch Tie-Breaker 1)
 * erhalten den gleichen Rang.
 * 
 * @param sortedPlayers Bereits sortiertes Array (nutze sortPlayersByRankingMode)
 * @param mode Ranking-Modus
 * @returns Array mit berechneten Rängen
 */
export function assignRanksToPlayers<T extends PlayerRankingData>(
  sortedPlayers: T[],
  mode: RankingMode
): PlayerWithRank[] {
  const results: PlayerWithRank[] = [];
  
  sortedPlayers.forEach((player, index) => {
    // Berechne Rang basierend auf gleichen Werten
    let rank = index + 1;
    
    if (index > 0) {
      const prevPlayer = sortedPlayers[index - 1];
      
      // Prüfe ob Werte exakt gleich sind (Primär UND Tie-Breaker 1)
      let isEqual = false;
      if (mode === 'total_points') {
        isEqual = prevPlayer.totalPoints === player.totalPoints && 
                  prevPlayer.totalStriche === player.totalStriche;
      } else if (mode === 'striche_difference') {
        // ✅ KORRIGIERT: Für striche_difference: Primär = stricheDifference, Tie-Breaker 1 = totalStriche, Tie-Breaker 2 = pointsDifference
        isEqual = (prevPlayer.stricheDifference ?? 0) === (player.stricheDifference ?? 0) && 
                  prevPlayer.totalStriche === player.totalStriche &&
                  (prevPlayer.pointsDifference ?? 0) === (player.pointsDifference ?? 0);
      } else if (mode === 'points_difference') {
        // ✅ NEU: Für points_difference: Primär = pointsDifference, Tie-Breaker = totalStriche
        isEqual = (prevPlayer.pointsDifference ?? 0) === (player.pointsDifference ?? 0) && 
                  prevPlayer.totalStriche === player.totalStriche;
      } else {
        // mode === 'striche'
        isEqual = prevPlayer.totalStriche === player.totalStriche && 
          prevPlayer.totalPoints === player.totalPoints;
      }
      
      if (isEqual) {
        // Verwende den Rang des vorherigen Spielers
        rank = results[index - 1].rank;
      }
    }
    
    results.push({
      ...player,
      rank
    });
  });
  
  return results;
}

/**
 * 🎯 KOMBI-FUNKTION: Sortiert UND berechnet Ränge in einem Schritt
 * 
 * @param players Array von Spielern
 * @param mode Ranking-Modus
 * @returns Sortiertes Array mit berechneten Rängen
 */
export function sortAndRankPlayers<T extends PlayerRankingData>(
  players: T[],
  mode: RankingMode
): PlayerWithRank[] {
  const sorted = sortPlayersByRankingMode(players, mode);
  return assignRanksToPlayers(sorted, mode);
}

/**
 * 🎯 Hilfsfunktion: Deutsche Labels für Ranking-Modi
 */
export function getRankingModeLabel(mode: RankingMode, short: boolean = false): string {
  if (short) {
    if (mode === 'total_points') return 'Nach Punkten';
    if (mode === 'striche_difference') return 'Nach Strichdifferenz';
    if (mode === 'points_difference') return 'Nach Punktedifferenz';
    if (mode === 'alle_ranglisten') return 'Alle Ranglisten';
    return 'Nach Strichen';
  }
  if (mode === 'total_points') return 'Zählart nach Punkten';
  if (mode === 'striche_difference') return 'Zählart nach Strichdifferenz';
  if (mode === 'points_difference') return 'Zählart nach Punktedifferenz';
  if (mode === 'alle_ranglisten') return 'Alle Ranglisten';
  return 'Zählart nach Strichen';
}

/**
 * 🎯 Hilfsfunktion: Beschreibung für Settings-UI
 */
export function getRankingModeDescription(mode: RankingMode): string {
  if (mode === 'total_points') {
    return 'Spieler werden nach der Gesamtpunktzahl sortiert. Bei gleichen Punkten entscheiden die Striche.';
  }
  if (mode === 'striche_difference') {
    return 'Spieler werden nach der Strichdifferenz sortiert. Bei gleicher Differenz entscheiden die Punkte.';
  }
  if (mode === 'points_difference') {
    return 'Spieler werden nach der Punktedifferenz sortiert. Bei gleicher Differenz entscheiden die Striche.';
  }
  if (mode === 'alle_ranglisten') {
    return 'Zeigt alle Ranglisten-Modi gleichzeitig an: Strichdifferenz, Striche, Punkte und Punktedifferenz.';
  }
  return 'Spieler werden nach der Anzahl Striche sortiert. Bei gleichen Strichen entscheiden die Punkte.';
}

