import type { StatInsight } from '../../../types/sprueche.d.ts';
import type { GroupComputedStats } from '@/../../functions/src/models/group-stats.model';

export class StatAnalyzer {
  private groupStats: GroupComputedStats;
  private playerNames: Map<string, string>;

  constructor(groupStats: GroupComputedStats, playerNames: Map<string, string>) {
    this.groupStats = groupStats;
    this.playerNames = playerNames;
  }

  /**
   * Analysiert alle verfügbaren Statistiken und gibt relevante Insights zurück
   */
  public analyzeStats(): StatInsight[] {
    const insights: StatInsight[] = [];
    
    // Analysiere verschiedene Kategorien
    insights.push(...this.analyzeMatschStats());
    insights.push(...this.analyzeSchneiderStats());
    insights.push(...this.analyzeWinRateStats());
    insights.push(...this.analyzeSpeedStats());
    insights.push(...this.analyzeVeteranStats());
    insights.push(...this.analyzeTeamStats());
    insights.push(...this.analyzeSessionStats());
    
    // Sortiere nach Relevanz
    insights.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 StatAnalyzer generated', insights.length, 'insights');
      insights.slice(0, 5).forEach(insight => {
        console.log(`  ${insight.category}: ${insight.relevanceScore}% - ${insight.playerName || 'Session'}`);
      });
    }
    
    return insights;
  }

  /**
   * Analysiert Matsch-Statistiken
   */
  private analyzeMatschStats(): StatInsight[] {
    const insights: StatInsight[] = [];
    
    // Analysiere durchschnittliche Matsch-Rate (Team-Event!)
    if (this.groupStats.avgMatschPerGame && this.groupStats.avgMatschPerGame > 0) {
      const avgMatsch = this.groupStats.avgMatschPerGame;
      
      // Hohe Matsch-Rate (Team-Event)
      if (avgMatsch >= 1.5) {
        insights.push({
          category: 'matsch',
          subcategory: 'high',
          relevanceScore: Math.min(85, 60 + (avgMatsch * 10)),
          playerName: undefined, // TEAM-EVENT: Keine Individual-Namen!
          data: {
            value: avgMatsch,
            displayValue: `${avgMatsch.toFixed(1)}`,
            eventsPlayed: this.groupStats.gameCount || 0,
            context: { 
              sessionType: 'team',
              eventType: 'matsch'
            }
          },
          contextType: 'team',
          isPositive: false,
          isSurprising: avgMatsch > 2.0
        });
      }
    }
    
    // Analysiere individuelle Matsch-Bilanz (nur für groupComputedStats-basierte Insights)
    if (this.groupStats.playerWithHighestMatschBilanz && this.groupStats.playerWithHighestMatschBilanz.length > 0) {
      const player = this.groupStats.playerWithHighestMatschBilanz[0];
      const playerName = this.playerNames.get(player.playerId) || player.playerName || 'Unbekannt';
      const balance = player.value;
      
      // NUR für extreme Bilanzen und NUR als groupComputedStats-basierte Individual-Insights
      if (Math.abs(balance) > 8) { // Sehr hohe Schwelle für Individual-Insights
        insights.push({
          category: 'matsch',
          subcategory: balance > 0 ? 'veteran_positive' : 'veteran_negative',
          relevanceScore: Math.min(75, 50 + (Math.abs(balance) * 2)),
          playerName,
          data: {
            value: balance,
            displayValue: balance > 0 ? `+${balance}` : `${balance}`,
            eventsPlayed: this.groupStats.gameCount || 0,
            context: { 
              type: 'veteran_stat',
              isHistorical: true
            }
          },
          contextType: 'player',
          isPositive: balance > 0,
          isSurprising: Math.abs(balance) > 12
        });
      }
    }
    
    return insights;
  }

  /**
   * Analysiert Schneider-Statistiken (Team-Events!)
   */
  private analyzeSchneiderStats(): StatInsight[] {
    const insights: StatInsight[] = [];
    
    // Schneider ist ein TEAM-EVENT - keine Individual-Namen!
    if (this.groupStats.playerWithHighestSchneiderBilanz && this.groupStats.playerWithHighestSchneiderBilanz.length > 0) {
      const player = this.groupStats.playerWithHighestSchneiderBilanz[0];
      const balance = player.value;
      
      // NUR für extreme Bilanzen und NUR als groupComputedStats-basierte Individual-Insights
      if (Math.abs(balance) > 5) { // Sehr hohe Schwelle für Individual-Insights
        const playerName = this.playerNames.get(player.playerId) || player.playerName || 'Unbekannt';
        
        insights.push({
          category: 'schneider',
          subcategory: balance > 0 ? 'veteran_positive' : 'veteran_negative',
          relevanceScore: Math.min(70, 40 + (Math.abs(balance) * 5)),
          playerName,
          data: {
            value: balance,
            displayValue: balance > 0 ? `+${balance}` : `${balance}`,
            eventsPlayed: this.groupStats.gameCount || 0,
            context: { 
              type: 'veteran_stat',
              isHistorical: true
            }
          },
          contextType: 'player',
          isPositive: balance > 0,
          isSurprising: Math.abs(balance) > 8
        });
      }
    }
    
    return insights;
  }

  /**
   * Analysiert Win-Rate Statistiken
   */
  private analyzeWinRateStats(): StatInsight[] {
    const insights: StatInsight[] = [];
    
    if (this.groupStats.playerWithHighestWinRateGame && this.groupStats.playerWithHighestWinRateGame.length > 0) {
      const player = this.groupStats.playerWithHighestWinRateGame[0];
      const playerName = this.playerNames.get(player.playerId) || player.playerName || 'Unbekannt';
      const winRate = player.value * 100; // Annahme: value ist 0-1, wir brauchen Prozent
      
      // Hohe Win-Rate
      if (winRate > 60) {
        insights.push({
          category: 'winrate',
          subcategory: 'high',
          relevanceScore: Math.min(85, 50 + (winRate - 50)),
          playerName,
          data: {
            value: winRate,
            displayValue: `${Math.round(winRate)}%`,
            eventsPlayed: player.eventsPlayed || 0,
            context: { 
              value: player.value
            }
          },
          contextType: 'player',
          isPositive: true,
          isSurprising: winRate > 80
        });
      }
      
      // Niedrige Win-Rate
      if (winRate < 40) {
        insights.push({
          category: 'winrate',
          subcategory: 'low',
          relevanceScore: Math.min(70, 40 + (50 - winRate)),
          playerName,
          data: {
            value: winRate,
            displayValue: `${Math.round(winRate)}%`,
            eventsPlayed: player.eventsPlayed || 0,
            context: { 
              value: player.value
            }
          },
          contextType: 'player',
          isPositive: false,
          isSurprising: winRate < 20
        });
      }
    }
    
    return insights;
  }

  /**
   * Analysiert Geschwindigkeits-Statistiken
   */
  private analyzeSpeedStats(): StatInsight[] {
    const insights: StatInsight[] = [];
    
    // Schnellster Spieler
    if (this.groupStats.playerWithFastestRounds && this.groupStats.playerWithFastestRounds.length > 0) {
      const player = this.groupStats.playerWithFastestRounds[0];
      const playerName = this.playerNames.get(player.playerId) || player.playerName || 'Unbekannt';
      const avgTime = player.value;
      
      if (avgTime < 300) { // Unter 5 Minuten
        insights.push({
          category: 'speed',
          subcategory: 'fastest',
          relevanceScore: Math.min(60, 40 + (300 - avgTime) / 10),
          playerName,
          data: {
            value: avgTime,
            displayValue: this.formatDuration(avgTime),
            eventsPlayed: player.eventsPlayed || 0,
            context: { type: 'fast' }
          },
          contextType: 'player',
          isPositive: true,
          isSurprising: avgTime < 180
        });
      }
    }
    
    // Langsamster Spieler
    if (this.groupStats.playerWithSlowestRounds && this.groupStats.playerWithSlowestRounds.length > 0) {
      const player = this.groupStats.playerWithSlowestRounds[0];
      const playerName = this.playerNames.get(player.playerId) || player.playerName || 'Unbekannt';
      const avgTime = player.value;
      
      if (avgTime > 360) { // Über 6 Minuten
        insights.push({
          category: 'speed',
          subcategory: 'slowest',
          relevanceScore: Math.min(55, 30 + (avgTime - 360) / 20),
          playerName,
          data: {
            value: avgTime,
            displayValue: this.formatDuration(avgTime),
            eventsPlayed: player.eventsPlayed || 0,
            context: { type: 'slow' }
          },
          contextType: 'player',
          isPositive: false,
          isSurprising: avgTime > 600
        });
      }
    }
    
    return insights;
  }

  /**
   * Analysiert Veteran-Status
   */
  private analyzeVeteranStats(): StatInsight[] {
    const insights: StatInsight[] = [];
    
    if (this.groupStats.playerWithMostGames && this.groupStats.playerWithMostGames.length > 0) {
      const player = this.groupStats.playerWithMostGames[0];
      const playerName = this.playerNames.get(player.playerId) || player.playerName || 'Unbekannt';
      const gamesPlayed = player.value;
      
      // Veteran (viele Spiele)
      if (gamesPlayed > 30) {
        insights.push({
          category: 'veteran',
          subcategory: 'experienced',
          relevanceScore: Math.min(50, 20 + gamesPlayed),
          playerName,
          data: {
            value: gamesPlayed,
            displayValue: `${gamesPlayed}`,
            eventsPlayed: gamesPlayed,
            context: { status: 'veteran' }
          },
          contextType: 'player',
          isPositive: true,
          isSurprising: gamesPlayed > 100
        });
      }
      
      // Newcomer (wenige Spiele, aber erwähnenswert)
      if (gamesPlayed < 5) {
        insights.push({
          category: 'veteran',
          subcategory: 'newcomer',
          relevanceScore: 30,
          playerName,
          data: {
            value: gamesPlayed,
            displayValue: `${gamesPlayed}`,
            eventsPlayed: gamesPlayed,
            context: { status: 'newcomer' }
          },
          contextType: 'player',
          isPositive: false,
          isSurprising: false
        });
      }
    }
    
    return insights;
  }

  /**
   * Analysiert Team-Statistiken
   */
  private analyzeTeamStats(): StatInsight[] {
    const insights: StatInsight[] = [];
    
    if (this.groupStats.teamWithHighestWinRateGame && this.groupStats.teamWithHighestWinRateGame.length > 0) {
      const team = this.groupStats.teamWithHighestWinRateGame[0];
      const teamNames = team.names || ['Team'];
      const winRate = (typeof team.value === 'number' ? team.value : 0) * 100;
      
      // Nur erwähnen wenn signifikante Win-Rate und genügend Spiele
      if (winRate > 60 && (team.eventsPlayed || 0) > 3) {
        insights.push({
          category: 'team',
          subcategory: 'chemistry',
          relevanceScore: Math.min(65, 35 + (winRate - 50)),
          teamNames,
          data: {
            value: winRate,
            displayValue: `${Math.round(winRate)}%`,
            eventsPlayed: team.eventsPlayed || 0,
            context: { 
              made: team.eventsMade || 0, 
              received: team.eventsReceived || 0 
            }
          },
          contextType: 'team',
          isPositive: true,
          isSurprising: winRate > 80
        });
      }
      
      // Schwache Teams
      if (winRate < 35 && (team.eventsPlayed || 0) > 3) {
        insights.push({
          category: 'team',
          subcategory: 'chemistry',
          relevanceScore: Math.min(60, 30 + (50 - winRate)),
          teamNames,
          data: {
            value: winRate,
            displayValue: `${Math.round(winRate)}%`,
            eventsPlayed: team.eventsPlayed || 0,
            context: { 
              made: team.eventsMade || 0, 
              received: team.eventsReceived || 0 
            }
          },
          contextType: 'team',
          isPositive: false,
          isSurprising: winRate < 20
        });
      }
    }
    
    return insights;
  }

  /**
   * Analysiert Session-Statistiken
   */
  private analyzeSessionStats(): StatInsight[] {
    const insights: StatInsight[] = [];
    
    // Marathon-Session
    if (this.groupStats.avgGamesPerSession > 4) {
      const avgGames = this.groupStats.avgGamesPerSession;
      insights.push({
        category: 'session',
        subcategory: 'marathon',
        relevanceScore: Math.min(40, 20 + (avgGames * 3)),
        data: {
          value: avgGames,
          displayValue: `${Math.round(avgGames)}`,
          eventsPlayed: this.groupStats.gameCount || 0,
          context: { type: 'marathon' }
        },
        contextType: 'session',
        isPositive: true,
        isSurprising: avgGames > 8
      });
    }
    
    // Kurze Sessions
    if (this.groupStats.avgGamesPerSession < 2) {
      const avgGames = this.groupStats.avgGamesPerSession;
      insights.push({
        category: 'session',
        subcategory: 'short',
        relevanceScore: 25,
        data: {
          value: avgGames,
          displayValue: `${Math.round(avgGames)}`,
          eventsPlayed: this.groupStats.gameCount || 0,
          context: { type: 'short' }
        },
        contextType: 'session',
        isPositive: false,
        isSurprising: false
      });
    }
    
    return insights;
  }

  /**
   * Formatiert Sekunden in Stunden:Minuten:Sekunden Format
   */
  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }
} 