import { StatAnalyzer } from './statAnalyzer';
import { TemplateSystem } from './templateSystem';
import { SmartCompositor } from './smartCompositor';
import type { GroupComputedStats } from '@/../../functions/src/models/group-stats.model';

// === TYPEN FÜR NEXT-LEVEL SPRÜCHE ===

export interface PlayerNames {
  [key: string]: string;
}

export interface NextLevelConfig {
  maxContexts: number;
  minRelevance: number;
  redundancyThreshold: number;
  enableContextSensitivity?: boolean;
  enableAntiRepetition?: boolean;
}

export interface NextLevelResult {
  sprueche: string[];
  metadata: {
    totalInsights: number;
    contextualInsights: number;
    redundancyRemoved: number;
    processingTime: number;
    sessionCharacteristics?: SessionCharacteristics;
  };
}

export interface SessionCharacteristics {
  matschIntensity: number;
  schneiderActivity: number;
  speedVariance: number;
  competitiveness: number;
  dominance: number;
  isEventRich: boolean;
  isBalanced: boolean;
  isSpeedFocused: boolean;
}

export class NextLevelSprueche {
  private analyzer: StatAnalyzer;
  private templateSystem: TemplateSystem;
  private compositor: SmartCompositor;
  private sessionCharacteristics: SessionCharacteristics | null = null;

  constructor(
    private groupStats: GroupComputedStats,
    private playerNames: PlayerNames,
    private config: NextLevelConfig
  ) {
    // Erstelle Mock-PlayerNames Map für StatAnalyzer
    const playerNameMap = new Map(Object.entries(playerNames));
    
    this.analyzer = new StatAnalyzer(groupStats, playerNameMap);
    this.templateSystem = new TemplateSystem({
      minRelevance: config.minRelevance,
      maxTemplatesPerCategory: config.maxContexts,
      defaultTone: 'witzig'
    });
    
    // Vereinfachte SmartCompositor-Erstellung
    this.compositor = new SmartCompositor({
      maxContexts: config.maxContexts,
      minRelevanceScore: config.minRelevance,
      redundancyThreshold: config.redundancyThreshold,
      diversityBonus: 0,
      surpriseBonus: 0,
      categoryPriority: new Map()
    });
  }

  /**
   * Generiert intelligente Sprüche basierend auf Session-Charakteristika
   */
  generateEnhancedSprueche(existingSprueche: string[] = []): NextLevelResult {
    const startTime = Date.now();
    
    // 1. Berechne Session-Charakteristika
    this.sessionCharacteristics = this.calculateSessionCharacteristics();
    
    // 2. Analysiere Stats mit vereinfachter Methode
    const allInsights = this.analyzer.analyzeStats();
    
    // 3. Filtere Insights basierend auf Session-Kontext
    const contextualInsights = this.filterInsightsByContext(allInsights);
    
    // 4. Wähle intelligente Spruch-Kandidaten
    const smartCandidates = this.selectSmartCandidates(contextualInsights);
    
    // 5. Generiere finale Sprüche mit vereinfachter Komposition
    const finalSprueche = this.simplifyComposition(smartCandidates, existingSprueche);

    const processingTime = Date.now() - startTime;
    
    return {
      sprueche: finalSprueche,
      metadata: {
        totalInsights: allInsights.length,
        contextualInsights: contextualInsights.length,
        redundancyRemoved: smartCandidates.length - finalSprueche.length,
        processingTime,
        sessionCharacteristics: this.sessionCharacteristics
      }
    };
  }

  /**
   * Vereinfachte Komposition da compose-Methode nicht existiert
   */
  private simplifyComposition(candidates: string[], existing: string[]): string[] {
    // Einfache Redundanz-Entfernung
    const uniqueCandidates = candidates.filter(candidate => 
      !existing.some(existing => 
        this.calculateSimpleSimilarity(candidate, existing) > 0.7
      )
    );
    
    // Limitiere auf maxContexts
    return uniqueCandidates.slice(0, this.config.maxContexts);
  }

  /**
   * Einfache String-Ähnlichkeit
   */
  private calculateSimpleSimilarity(str1: string, str2: string): number {
    const normalize = (str: string) => str.toLowerCase().replace(/[^\w]/g, '');
    const norm1 = normalize(str1);
    const norm2 = normalize(str2);
    
    if (norm1 === norm2) return 1;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.8;
    
    return 0;
  }

  /**
   * Berechnet Session-Charakteristiken mit VERSCHÄRFTEN Schwellen
   */
  private calculateSessionCharacteristics(): SessionCharacteristics {
    const matschStats = this.groupStats.playerWithHighestMatschBilanz;
    const schneiderStats = this.groupStats.playerWithHighestSchneiderBilanz;
    const speedStats = this.groupStats.playerWithFastestRounds;
    const winRateStats = this.groupStats.playerWithHighestWinRateGame;
    
    // VERSCHÄRFTE Matsch-Intensität (höhere Schwellen)
    const matschIntensity = this.calculateMatschIntensity(matschStats || undefined);
    
    // VERSCHÄRFTE Schneider-Aktivität (höhere Schwellen)
    const schneiderActivity = this.calculateSchneiderActivity(schneiderStats || undefined);
    
    // VERSCHÄRFTE Speed-Varianz (höhere Schwellen)
    const speedVariance = this.calculateSpeedVariance(speedStats || undefined);
    
    // VERSCHÄRFTE Competitiveness (höhere Schwellen)
    const competitiveness = this.calculateCompetitiveness(winRateStats || undefined);
    
    // VERSCHÄRFTE Dominance (höhere Schwellen)
    const dominance = this.calculateDominance(winRateStats || undefined);
    
    // VERSCHÄRFTE abgeleitete Eigenschaften
    const isEventRich = matschIntensity >= 70 || schneiderActivity >= 65; // Erhöht von 60
    const isBalanced = competitiveness >= 75 && dominance < 50; // Erhöht von 70
    const isSpeedFocused = speedVariance >= 60; // Erhöht von 50
    
    return {
      matschIntensity,
      schneiderActivity,
      speedVariance,
      competitiveness,
      dominance,
      isEventRich,
      isBalanced,
      isSpeedFocused
    };
  }

  /**
   * Filtert Insights basierend auf Session-Charakteristiken (VERSCHÄRFT)
   */
  private filterInsightsByContext(insights: any[]): any[] {
    const char = this.sessionCharacteristics;
    if (!char) return insights;
    
    return insights.filter(insight => {
      // VERSCHÄRFTE Matsch-Sprüche nur bei wirklich matsch-intensiven Sessions
      if (insight.category === 'matsch' && char.matschIntensity < 65) {
        return false;
      }
      
      // VERSCHÄRFTE Schneider-Sprüche nur bei wirklich schneider-aktiven Sessions
      if (insight.category === 'schneider' && char.schneiderActivity < 55) {
        return false;
      }
      
      // VERSCHÄRFTE Speed-Sprüche nur bei deutlichen Geschwindigkeitsunterschieden
      if (insight.category === 'speed' && char.speedVariance < 50) {
        return false;
      }
      
      // VERSCHÄRFTE Win-Rate-Sprüche nur bei sehr kompetitiven/dominanten Sessions
      if (insight.category === 'winrate' && char.competitiveness < 60 && char.dominance < 70) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Wählt intelligente Spruch-Kandidaten mit WORLD-CLASS Anti-Repetition
   */
  private selectSmartCandidates(insights: any[]): string[] {
    const candidates: string[] = [];
    const usedCategories = new Set<string>();
    const usedSubcategories = new Set<string>();
    const usedPlayers = new Set<string>();
    
    // Freshness-Tracking für Templates
    const categoryFreshness = new Map<string, number>();
    const templateFreshness = new Map<string, number>();
    
    // Sortiere Insights nach Relevanz mit gedämpftem Überraschungsbonus
    const sortedInsights = insights.sort((a, b) => {
      // Reduzierter Überraschungsbonus (20 → 10)
      const aScore = a.relevanceScore + (a.isSurprising ? 10 : 0);
      const bScore = b.relevanceScore + (b.isSurprising ? 10 : 0);
      
      // Freshness-Bonus für seltene Kategorien
      const aFreshness = categoryFreshness.get(a.category) || 100;
      const bFreshness = categoryFreshness.get(b.category) || 100;
      
      return (bScore + (bFreshness * 0.3)) - (aScore + (aFreshness * 0.3));
    });
    
    for (const insight of sortedInsights) {
      // STRENGE Kategorie-Wiederholung vermeiden (95% Relevanz erforderlich)
      if (usedCategories.has(insight.category) && insight.relevanceScore < 95) {
        continue;
      }
      
      // NEUE: Subcategory-Wiederholung vermeiden
      const subcategoryKey = `${insight.category}_${insight.subcategory}`;
      if (usedSubcategories.has(subcategoryKey)) {
        continue;
      }
      
      // STRENGE Spieler-Übererwähnung vermeiden (nur 1 Erwähnung pro Session)
      if (insight.playerName && usedPlayers.has(insight.playerName)) {
        continue;
      }
      
      // NEUE: Template-Diversität sicherstellen
      const templateKey = `${insight.category}_${insight.subcategory}`;
      const currentFreshness = templateFreshness.get(templateKey) || 100;
      
      // Vermeide kürzlich verwendete Templates
      if (currentFreshness < 60 && insight.relevanceScore < 90) {
        continue;
      }
      
      // Generiere Spruch mit maximaler Template-Vielfalt
      const sessionContext = this.buildSessionContext();
      const spruchText = this.templateSystem.generateContext(
        insight.category,
        [insight],
        sessionContext
      );
      
      if (spruchText && spruchText.length > 10) {
        candidates.push(spruchText);
        usedCategories.add(insight.category);
        usedSubcategories.add(subcategoryKey);
        
        if (insight.playerName) {
          usedPlayers.add(insight.playerName);
        }
        
        // Update Freshness-Tracking
        categoryFreshness.set(insight.category, (categoryFreshness.get(insight.category) || 100) - 30);
        templateFreshness.set(templateKey, (templateFreshness.get(templateKey) || 100) - 40);
        
        // Maximal 3 Kandidaten pro Session für höhere Selectivität
        if (candidates.length >= 3) {
          break;
        }
      }
    }
    
    return candidates;
  }

  /**
   * Baut Session-Kontext für Template-Auswahl
   */
  private buildSessionContext(): string[] {
    const context: string[] = [];
    
    if (!this.sessionCharacteristics) return context;
    
    const char = this.sessionCharacteristics;
    
    // Event-basierte Kontexte
    if (char.matschIntensity >= 60) {
      context.push('high_matsch', 'event_rich');
    }
    if (char.schneiderActivity >= 60) {
      context.push('high_schneider', 'sensation');
    }
    if (char.schneiderActivity >= 90) {
      context.push('schneider_sensation', 'historical');
    }
    
    // Session-Charakter
    if (char.isEventRich) {
      context.push('event_rich', 'dramatic');
    }
    if (char.isBalanced) {
      context.push('balanced', 'competitive');
    }
    if (char.isSpeedFocused) {
      context.push('speed_focused', 'efficiency');
    }
    
    // Dominanz-basierte Kontexte
    if (char.dominance >= 80) {
      context.push('dominance', 'one_sided');
    } else if (char.competitiveness >= 70) {
      context.push('competitive', 'close_match');
    }
    
    return context;
  }

  /**
   * Berechnet Matsch-Intensität mit VERSCHÄRFTEN Kriterien
   */
  private calculateMatschIntensity(matschStats?: any[]): number {
    if (!this.groupStats.avgMatschPerGame) return 0;
    
    const avgMatsch = this.groupStats.avgMatschPerGame;
    const gameCount = this.groupStats.gameCount || 1;
    
    // VERSCHÄRFTE Basis-Intensität
    let intensity = 0;
    
    // Sehr hohe Matsch-Rate erforderlich
    if (avgMatsch >= 2.5) intensity += 40;
    else if (avgMatsch >= 2.0) intensity += 30;
    else if (avgMatsch >= 1.5) intensity += 20;
    else if (avgMatsch >= 1.0) intensity += 10;
    
    // Bonus für konsistente Matsch-Verteilung
    if (gameCount >= 3) {
      intensity += Math.min(20, gameCount * 2);
    }
    
    // Malus für zu wenige Spiele
    if (gameCount < 2) {
      intensity *= 0.5;
    }
    
    return Math.min(100, intensity);
  }

  /**
   * Berechnet Schneider-Aktivität mit VERSCHÄRFTEN Kriterien
   */
  private calculateSchneiderActivity(schneiderStats?: any[]): number {
    if (!schneiderStats || schneiderStats.length === 0) return 0;
    
    const topPlayer = schneiderStats[0];
    const balance = Math.abs(topPlayer.value || 0);
    const gameCount = this.groupStats.gameCount || 1;
    
    // VERSCHÄRFTE Basis-Aktivität
    let activity = 0;
    
    // Sehr hohe Schneider-Bilanz erforderlich
    if (balance >= 5) activity += 40;
    else if (balance >= 3) activity += 25;
    else if (balance >= 2) activity += 15;
    else if (balance >= 1) activity += 5;
    
    // Bonus für mehrere Spiele
    if (gameCount >= 3) {
      activity += Math.min(25, gameCount * 3);
    }
    
    // Malus für zu wenige Spiele
    if (gameCount < 2) {
      activity *= 0.6;
    }
    
    return Math.min(100, activity);
  }

  /**
   * Berechnet Speed-Varianz mit VERSCHÄRFTEN Kriterien
   */
  private calculateSpeedVariance(speedStats?: any[]): number {
    if (!speedStats || speedStats.length === 0) return 0;
    
    const topPlayer = speedStats[0];
    const speed = topPlayer.value || 0;
    const gameCount = this.groupStats.gameCount || 1;
    
    // VERSCHÄRFTE Basis-Varianz (nur sehr schnelle/langsame Spiele)
    let variance = 0;
    
    // Sehr auffällige Geschwindigkeiten erforderlich
    if (speed < 30) variance += 35; // Sehr schnell
    else if (speed < 45) variance += 25; // Schnell
    else if (speed > 180) variance += 35; // Sehr langsam
    else if (speed > 120) variance += 25; // Langsam
    
    // Bonus für konsistente Daten
    if (gameCount >= 3) {
      variance += Math.min(20, gameCount * 2);
    }
    
    return Math.min(100, variance);
  }

  /**
   * Berechnet Competitiveness mit VERSCHÄRFTEN Kriterien
   */
  private calculateCompetitiveness(winRateStats?: any[]): number {
    if (!winRateStats || winRateStats.length === 0) return 0;
    
    const topPlayer = winRateStats[0];
    const winRate = topPlayer.value || 0;
    const gameCount = this.groupStats.gameCount || 1;
    
    // VERSCHÄRFTE Basis-Competitiveness
    let competitiveness = 0;
    
    // Sehr ausgewogene Win-Rates erforderlich
    if (winRate >= 0.4 && winRate <= 0.6) competitiveness += 40; // Sehr ausgewogen
    else if (winRate >= 0.35 && winRate <= 0.65) competitiveness += 25; // Ausgewogen
    else if (winRate >= 0.3 && winRate <= 0.7) competitiveness += 15; // Etwas ausgewogen
    
    // Bonus für mehrere Spiele
    if (gameCount >= 4) {
      competitiveness += Math.min(30, gameCount * 3);
    }
    
    return Math.min(100, competitiveness);
  }

  /**
   * Berechnet Dominance mit VERSCHÄRFTEN Kriterien
   */
  private calculateDominance(winRateStats?: any[]): number {
    if (!winRateStats || winRateStats.length === 0) return 0;
    
    const topPlayer = winRateStats[0];
    const winRate = topPlayer.value || 0;
    const gameCount = this.groupStats.gameCount || 1;
    
    // VERSCHÄRFTE Basis-Dominanz
    let dominance = 0;
    
    // Sehr dominante Win-Rates erforderlich
    if (winRate >= 0.8) dominance += 50; // Sehr dominant
    else if (winRate >= 0.7) dominance += 35; // Dominant
    else if (winRate >= 0.6) dominance += 20; // Etwas dominant
    
    // Bonus für konsistente Dominanz
    if (gameCount >= 3) {
      dominance += Math.min(25, gameCount * 2);
    }
    
    return Math.min(100, dominance);
  }

  /**
   * Debugging-Informationen
   */
  getDebugInfo(): any {
    return {
      sessionCharacteristics: this.sessionCharacteristics,
      groupStats: {
        avgMatschPerGame: this.groupStats.avgMatschPerGame,
        sessionCount: this.groupStats.sessionCount,
        gameCount: this.groupStats.gameCount
      },
      config: this.config
    };
  }
}

/**
 * Factory-Funktion für einfache Erstellung
 */
export function createNextLevelSprueche(
  groupStats: GroupComputedStats,
  playerNames: PlayerNames,
  config: NextLevelConfig
): NextLevelSprueche {
  return new NextLevelSprueche(groupStats, playerNames, {
    enableContextSensitivity: true,
    enableAntiRepetition: true,
    ...config
  });
} 