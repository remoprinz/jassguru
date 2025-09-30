import type { StatInsight, GeneratedContext, CompositionRules } from '../../../types/sprueche.d.ts';

interface SpruchCandidate {
  text: string;
  category: string;
  relevanceScore: number;
  source: 'existing' | 'context';
  keywords: string[];
  metadata?: any;
}

interface SimilarityResult {
  score: number; // 0-1, höher = ähnlicher
  keywords: string[];
  sharedTokens: string[];
}

export class SmartCompositor {
  private rules: CompositionRules;
  private commonWords: Set<string>;

  constructor(rules: Partial<CompositionRules> = {}) {
    this.rules = {
      maxContexts: 6, // 5-8 Kontexte statt nur 3
      minRelevanceScore: 50,
      diversityBonus: 10,
      surpriseBonus: 15,
      categoryPriority: new Map([
        ['matsch', 100],
        ['schneider', 90],
        ['winrate', 80],
        ['team', 70],
        ['veteran', 60],
        ['speed', 50],
        ['session', 40]
      ]),
      redundancyThreshold: 0.7, // Ähnlichkeits-Schwelle für Duplikate
      ...rules
    };
    
    // Häufige Wörter, die bei Ähnlichkeits-Check ignoriert werden
    this.commonWords = new Set([
      'der', 'die', 'das', 'und', 'oder', 'mit', 'ein', 'eine', 'einen', 'einer', 'eines',
      'ist', 'sind', 'war', 'waren', 'hat', 'haben', 'wird', 'werden', 'kann', 'könnte',
      'sehr', 'mehr', 'auch', 'nur', 'noch', 'schon', 'aber', 'doch', 'dann', 'wenn',
      'bei', 'von', 'zu', 'für', 'auf', 'an', 'in', 'um', 'über', 'unter', 'vor', 'nach',
      'spiel', 'spiele', 'spielen', 'spieler', 'runde', 'runden', 'jass', 'heute', 'hier'
    ]);
  }

  /**
   * Hauptmethode: Kombiniert bestehende und neue Sprüche intelligent
   */
  public composeOptimalSprueche(
    existingSprueche: string[], 
    contextSprueche: GeneratedContext[]
  ): string[] {
    if (process.env.NODE_ENV === 'development') {
      console.log('🎭 SmartCompositor: Processing', existingSprueche.length, 'existing +', contextSprueche.length, 'context sprüche');
    }

    // 1. Alle Sprüche zu einheitlichen Kandidaten konvertieren
    const allCandidates = this.prepareCandidates(existingSprueche, contextSprueche);
    
    // 2. Redundanz-Check: Ähnliche Sprüche identifizieren
    const filteredCandidates = this.removeRedundantSprueche(allCandidates);
    
    // 3. Diversität und Relevanz optimieren
    const optimizedCandidates = this.optimizeForDiversity(filteredCandidates);
    
    // 4. Finale Auswahl basierend auf Regeln
    const finalSelection = this.selectFinalSprueche(optimizedCandidates);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🎭 SmartCompositor: Selected', finalSelection.length, 'sprüche from', allCandidates.length, 'candidates');
      console.log('  Redundancy removed:', allCandidates.length - filteredCandidates.length);
      console.log('  Diversity optimized:', filteredCandidates.length - optimizedCandidates.length);
    }
    
    return finalSelection.map(candidate => candidate.text);
  }

  /**
   * Konvertiert alle Sprüche zu einheitlichen Kandidaten
   */
  private prepareCandidates(
    existingSprueche: string[],
    contextSprueche: GeneratedContext[]
  ): SpruchCandidate[] {
    const candidates: SpruchCandidate[] = [];
    
    // Bestehende Sprüche
    existingSprueche.forEach(spruch => {
      candidates.push({
        text: spruch,
        category: this.categorizeExistingSpruch(spruch),
        relevanceScore: 100, // Bestehende Sprüche haben hohe Priorität
        source: 'existing',
        keywords: this.extractKeywords(spruch)
      });
    });
    
    // Neue Kontext-Sprüche
    contextSprueche.forEach(context => {
      candidates.push({
        text: context.text,
        category: context.category,
        relevanceScore: context.relevanceScore,
        source: 'context',
        keywords: this.extractKeywords(context.text),
        metadata: context.insight
      });
    });
    
    return candidates;
  }

  /**
   * Entfernt redundante Sprüche basierend auf Ähnlichkeit
   */
  private removeRedundantSprueche(candidates: SpruchCandidate[]): SpruchCandidate[] {
    const filtered: SpruchCandidate[] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < candidates.length; i++) {
      if (processed.has(i)) continue;
      
      const candidate = candidates[i];
      let shouldInclude = true;
      
      // Prüfe gegen bereits ausgewählte Kandidaten
      for (const accepted of filtered) {
        const similarity = this.calculateSimilarity(candidate, accepted);
        
        if (similarity.score > this.rules.redundancyThreshold) {
          // Ähnlichkeit zu hoch - entscheide welcher besser ist
          if (candidate.relevanceScore > accepted.relevanceScore) {
            // Ersetze den bereits akzeptierten
            const acceptedIndex = filtered.indexOf(accepted);
            filtered[acceptedIndex] = candidate;
            
            if (process.env.NODE_ENV === 'development') {
              console.log('  🔄 Replaced redundant:', {
                old: accepted.text.substring(0, 50) + '...',
                new: candidate.text.substring(0, 50) + '...',
                similarity: similarity.score.toFixed(2)
              });
            }
          }
          
          shouldInclude = false;
          break;
        }
      }
      
      if (shouldInclude) {
        filtered.push(candidate);
      } else if (process.env.NODE_ENV === 'development') {
        console.log('  ❌ Removed redundant:', candidate.text.substring(0, 50) + '...');
      }
      
      processed.add(i);
    }
    
    return filtered;
  }

  /**
   * Optimiert für Diversität zwischen Kategorien
   */
  private optimizeForDiversity(candidates: SpruchCandidate[]): SpruchCandidate[] {
    const categoryCount = new Map<string, number>();
    const optimized: SpruchCandidate[] = [];
    
    // Sortiere nach Relevanz
    const sorted = [...candidates].sort((a, b) => {
      const aScore = this.calculateFinalScore(a, categoryCount);
      const bScore = this.calculateFinalScore(b, categoryCount);
      return bScore - aScore;
    });
    
    for (const candidate of sorted) {
      const currentCount = categoryCount.get(candidate.category) || 0;
      
      // Maximal 2 Sprüche pro Kategorie (außer bei sehr hoher Relevanz)
      if (currentCount < 2 || candidate.relevanceScore > 90) {
        optimized.push(candidate);
        categoryCount.set(candidate.category, currentCount + 1);
      } else if (process.env.NODE_ENV === 'development') {
        console.log('  🎯 Diversity limit reached for category:', candidate.category);
      }
    }
    
    return optimized;
  }

  /**
   * Finale Auswahl basierend auf Kompositions-Regeln
   */
  private selectFinalSprueche(candidates: SpruchCandidate[]): SpruchCandidate[] {
    // Sortiere nach finaler Bewertung
    const sorted = [...candidates].sort((a, b) => {
      const aScore = this.calculateFinalScore(a, new Map());
      const bScore = this.calculateFinalScore(b, new Map());
      return bScore - aScore;
    });
    
    // Nimm die besten bis maxContexts
    return sorted.slice(0, this.rules.maxContexts);
  }

  /**
   * Berechnet Ähnlichkeit zwischen zwei Spruch-Kandidaten
   */
  private calculateSimilarity(a: SpruchCandidate, b: SpruchCandidate): SimilarityResult {
    const aTokens = new Set(a.keywords);
    const bTokens = new Set(b.keywords);
    
    // Finde geteilte Keywords
    const sharedTokens = Array.from(aTokens).filter(token => bTokens.has(token));
    const unionSize = new Set([...aTokens, ...bTokens]).size;
    
    // Jaccard-Ähnlichkeit
    const jaccardScore = sharedTokens.length / unionSize;
    
    // Kategorie-Bonus: Gleiche Kategorie = höhere Ähnlichkeit
    const categoryBonus = a.category === b.category ? 0.2 : 0;
    
    // Themen-spezifische Ähnlichkeit
    const thematicScore = this.calculateThematicSimilarity(a.text, b.text);
    
    const finalScore = Math.min(1.0, jaccardScore + categoryBonus + thematicScore);
    
    return {
      score: finalScore,
      keywords: sharedTokens,
      sharedTokens: sharedTokens
    };
  }

  /**
   * Berechnet thematische Ähnlichkeit (Zahlen, spezifische Begriffe)
   */
  private calculateThematicSimilarity(textA: string, textB: string): number {
    let score = 0;
    
    // Zahlenwerte extrahieren
    const numbersA = (textA.match(/\d+/g) || []).map(Number);
    const numbersB = (textB.match(/\d+/g) || []).map(Number);
    
    // Gemeinsame Zahlen = hohe Ähnlichkeit
    const sharedNumbers = numbersA.filter(num => numbersB.includes(num));
    if (sharedNumbers.length > 0) {
      score += 0.3; // Starker Ähnlichkeits-Boost
    }
    
    // Spezifische Themen-Keywords
    const themeKeywords = [
      'matsch', 'schneider', 'konter', 'weis', 'trumpf',
      'marathon', 'schnell', 'langsam', 'veteran', 'newcomer',
      'champion', 'bilanz', 'win-rate', 'team', 'dream-team'
    ];
    
    const themeA = themeKeywords.filter(keyword => textA.toLowerCase().includes(keyword));
    const themeB = themeKeywords.filter(keyword => textB.toLowerCase().includes(keyword));
    const sharedThemes = themeA.filter(theme => themeB.includes(theme));
    
    if (sharedThemes.length > 0) {
      score += 0.2 * sharedThemes.length;
    }
    
    return Math.min(0.5, score); // Maximal 0.5 Bonus
  }

  /**
   * Extrahiert relevante Keywords aus einem Spruch
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.commonWords.has(word));
    
    // Entferne Duplikate
    return Array.from(new Set(words));
  }

  /**
   * Kategorisiert bestehende Sprüche
   */
  private categorizeExistingSpruch(spruch: string): string {
    const text = spruch.toLowerCase();
    
    if (text.includes('matsch')) return 'matsch';
    if (text.includes('schneider')) return 'schneider';
    if (text.includes('konter')) return 'matsch';
    if (text.includes('win-rate') || text.includes('siege')) return 'winrate';
    if (text.includes('team') || text.includes('duo')) return 'team';
    if (text.includes('veteran') || text.includes('spiele')) return 'veteran';
    if (text.includes('schnell') || text.includes('langsam') || text.includes('tempo')) return 'speed';
    if (text.includes('marathon') || text.includes('session')) return 'session';
    
    return 'general';
  }

  /**
   * Berechnet finalen Score für Auswahl
   */
  private calculateFinalScore(candidate: SpruchCandidate, categoryCount: Map<string, number>): number {
    let score = candidate.relevanceScore;
    
    // Kategorie-Priorität
    const categoryPriority = this.rules.categoryPriority.get(candidate.category) || 50;
    score += categoryPriority * 0.1;
    
    // Diversitäts-Bonus
    const currentCount = categoryCount.get(candidate.category) || 0;
    if (currentCount === 0) {
      score += this.rules.diversityBonus;
    }
    
    // Surprise-Bonus
    if (candidate.metadata?.isSurprising) {
      score += this.rules.surpriseBonus;
    }
    
    // Source-Bonus (bestehende Sprüche leicht bevorzugen)
    if (candidate.source === 'existing') {
      score += 5;
    }
    
    return score;
  }

  /**
   * Debugging: Zeigt Ähnlichkeits-Matrix
   */
  public analyzeRedundancy(candidates: SpruchCandidate[]): void {
    if (process.env.NODE_ENV !== 'development') return;
    
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const similarity = this.calculateSimilarity(candidates[i], candidates[j]);
        if (similarity.score > 0.5) {
          console.log(`  ${similarity.score.toFixed(2)}: "${candidates[i].text.substring(0, 40)}..." vs "${candidates[j].text.substring(0, 40)}..."`);
        }
      }
    }
  }
} 