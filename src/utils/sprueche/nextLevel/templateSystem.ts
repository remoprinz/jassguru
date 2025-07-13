import { StatInsight, ContextTemplate } from '../../../types/sprueche';

// === ERWEITERTE TEMPLATE-STRUKTUR ===
export interface ExtendedTemplate {
  id: string;
  template: string;
  tonality: string;
  priority: number;
  context: string[];
}

// === ANTI-REPETITION ENGINE ===
interface UsageHistory {
  recentTemplates: Set<string>;
  recentCategories: Map<string, number>;
  recentPlayerMentions: Map<string, number>;
  sessionCount: number;
}

let usageHistory: UsageHistory = {
  recentTemplates: new Set(),
  recentCategories: new Map(),
  recentPlayerMentions: new Map(),
  sessionCount: 0
};

// Reset nach jeder Session
function resetUsageHistory() {
  usageHistory = {
    recentTemplates: new Set(),
    recentCategories: new Map(),
    recentPlayerMentions: new Map(),
    sessionCount: usageHistory.sessionCount + 1
  };
}

// Track Template Usage
function trackTemplateUsage(templateId: string, category: string, playerName?: string) {
  usageHistory.recentTemplates.add(templateId);
  usageHistory.recentCategories.set(category, (usageHistory.recentCategories.get(category) || 0) + 1);
  if (playerName) {
    usageHistory.recentPlayerMentions.set(playerName, (usageHistory.recentPlayerMentions.get(playerName) || 0) + 1);
  }
}

// Calculate Freshness Score (0-100, higher = fresher)
function calculateFreshnessScore(templateId: string, category: string, playerName?: string): number {
  let score = 100;
  
  // Template recently used?
  if (usageHistory.recentTemplates.has(templateId)) {
    score -= 50;
  }
  
  // Category overused?
  const categoryUsage = usageHistory.recentCategories.get(category) || 0;
  if (categoryUsage >= 2) {
    score -= 30;
  }
  
  // Player overmentioned?
  if (playerName) {
    const playerUsage = usageHistory.recentPlayerMentions.get(playerName) || 0;
    if (playerUsage >= 3) {
      score -= 20;
    }
  }
  
  return Math.max(0, score);
}

// === ERWEITERTE TEMPLATE-BIBLIOTHEK ===
const expandedTemplates: Record<string, ExtendedTemplate[]> = {
  matsch: [
    // Bestehende Templates
    {
      id: 'matsch_witzig_1',
      template: '{playerName} sammelt {value} Matsch-Punkte wie ein Profi!',
      tonality: 'witzig',
      priority: 80,
      context: ['high_matsch', 'individual_dominance']
    },
    {
      id: 'matsch_statistisch_1',
      template: '{playerName} führt mit {value} Matsch-Ereignissen (+{diff} zum Durchschnitt)',
      tonality: 'statistisch',
      priority: 70,
      context: ['statistical_comparison']
    },
    // NEUE TEMPLATES - MASSIVE EXPANSION
    {
      id: 'matsch_witzig_2',
      template: '{playerName} ist heute der ungekrönte Matsch-König mit {value} Treffern!',
      tonality: 'witzig',
      priority: 85,
      context: ['high_matsch', 'individual_dominance']
    },
    {
      id: 'matsch_witzig_3',
      template: 'Matsch-Alarm! {playerName} räumt mit {value} Matschen ab wie ein Staubsauger!',
      tonality: 'witzig',
      priority: 80,
      context: ['high_matsch', 'session_highlight']
    },
    {
      id: 'matsch_witzig_4',
      template: '{playerName} macht {value} Matsche - das ist schon fast eine Kunst!',
      tonality: 'witzig',
      priority: 75,
      context: ['high_matsch', 'appreciation']
    },
    {
      id: 'matsch_witzig_5',
      template: 'Matsch-Meister {playerName} zeigt heute, wie es geht: {value} perfekte Nullrunden!',
      tonality: 'witzig',
      priority: 85,
      context: ['high_matsch', 'mastery']
    },
    {
      id: 'matsch_dramatisch_1',
      template: '{playerName} dominiert mit {value} Matschen - eine Demonstration der Macht!',
      tonality: 'dramatisch',
      priority: 90,
      context: ['high_matsch', 'dominance']
    },
    {
      id: 'matsch_dramatisch_2',
      template: 'Historisch! {playerName} erzielt {value} Matsche und schreibt Jass-Geschichte!',
      tonality: 'dramatisch',
      priority: 95,
      context: ['record_breaking', 'historical']
    },
    {
      id: 'matsch_dramatisch_3',
      template: 'Episch! {playerName} mit {value} Matschen - so entstehen Legenden!',
      tonality: 'dramatisch',
      priority: 88,
      context: ['legendary_performance']
    },
    {
      id: 'matsch_statistisch_2',
      template: 'Matsch-Statistik: {playerName} liegt mit {value} Ereignissen {diff}% über dem Gruppenschnitt',
      tonality: 'statistisch',
      priority: 75,
      context: ['statistical_comparison', 'group_benchmark']
    },
    {
      id: 'matsch_statistisch_3',
      template: 'Datenanalyse: {playerName} erzielt {value} Matsche (Erwartung: {expected})',
      tonality: 'statistisch',
      priority: 70,
      context: ['expectation_vs_reality']
    },
    {
      id: 'matsch_motivierend_1',
      template: '{playerName} zeigt mit {value} Matschen, dass auch Rückschläge zum Erfolg führen!',
      tonality: 'motivierend',
      priority: 80,
      context: ['resilience', 'positive_spin']
    },
    {
      id: 'matsch_motivierend_2',
      template: 'Respekt! {playerName} macht aus {value} Matschen eine Tugend!',
      tonality: 'motivierend',
      priority: 85,
      context: ['respect', 'character_building']
    },
    {
      id: 'matsch_lässig_1',
      template: '{playerName} sammelt entspannt {value} Matsche - alles unter Kontrolle!',
      tonality: 'lässig',
      priority: 70,
      context: ['casual_excellence']
    },
    {
      id: 'matsch_lässig_2',
      template: 'Easy going: {playerName} macht {value} Matsche, als wäre es das Normalste der Welt',
      tonality: 'lässig',
      priority: 75,
      context: ['effortless_performance']
    }
  ],

  schneider: [
    // Bestehende Templates
    {
      id: 'schneider_witzig_1',
      template: '{playerName} schneidet die Konkurrenz mit {value} Schneidern kurz und klein!',
      tonality: 'witzig',
      priority: 90,
      context: ['high_schneider', 'competitive_edge']
    },
    // NEUE TEMPLATES - MASSIVE EXPANSION
    {
      id: 'schneider_witzig_2',
      template: 'Schneider-Alarm! {playerName} zerschnippelt mit {value} Schneidern die Hoffnungen der Gegner!',
      tonality: 'witzig',
      priority: 92,
      context: ['high_schneider', 'devastation']
    },
    {
      id: 'schneider_witzig_3',
      template: '{playerName} ist heute der Schneider-Schneider mit {value} perfekten Schnitten!',
      tonality: 'witzig',
      priority: 85,
      context: ['wordplay', 'perfection']
    },
    {
      id: 'schneider_witzig_4',
      template: 'Schnipp-schnapp! {playerName} macht {value} Schneider - die Schere sitzt!',
      tonality: 'witzig',
      priority: 88,
      context: ['sound_effect', 'precision']
    },
    {
      id: 'schneider_witzig_5',
      template: '{playerName} näht heute {value} Schneider-Kostüme - maßgeschneidert für jeden Gegner!',
      tonality: 'witzig',
      priority: 80,
      context: ['metaphor', 'customization']
    },
    {
      id: 'schneider_dramatisch_1',
      template: 'SENSATION! {playerName} erzielt {value} Schneider - das ist Jass-Geschichte!',
      tonality: 'dramatisch',
      priority: 98,
      context: ['sensation', 'historical']
    },
    {
      id: 'schneider_dramatisch_2',
      template: 'Unglaublich! {playerName} dominiert mit {value} Schneidern - eine Machtdemonstration!',
      tonality: 'dramatisch',
      priority: 95,
      context: ['dominance', 'power_display']
    },
    {
      id: 'schneider_dramatisch_3',
      template: 'Spektakulär! {playerName} mit {value} Schneidern - so wird Geschichte geschrieben!',
      tonality: 'dramatisch',
      priority: 93,
      context: ['spectacular', 'legacy']
    },
    {
      id: 'schneider_statistisch_1',
      template: 'Schneider-Analyse: {playerName} erreicht {value} Ereignisse ({diff}% über Erwartung)',
      tonality: 'statistisch',
      priority: 75,
      context: ['statistical_analysis', 'expectation_exceeded']
    },
    {
      id: 'schneider_statistisch_2',
      template: 'Datenbasiert: {playerName} mit {value} Schneidern - Effizienz auf höchstem Niveau',
      tonality: 'statistisch',
      priority: 80,
      context: ['efficiency', 'data_driven']
    },
    {
      id: 'schneider_motivierend_1',
      template: '{playerName} zeigt mit {value} Schneidern, wie man Perfektion anstrebt!',
      tonality: 'motivierend',
      priority: 85,
      context: ['perfection_pursuit', 'inspiration']
    },
    {
      id: 'schneider_motivierend_2',
      template: 'Vorbildlich! {playerName} macht {value} Schneider - ein Beispiel für alle!',
      tonality: 'motivierend',
      priority: 82,
      context: ['role_model', 'exemplary']
    },
    {
      id: 'schneider_lässig_1',
      template: '{playerName} macht entspannt {value} Schneider - sieht einfach aus, ist aber Kunst!',
      tonality: 'lässig',
      priority: 78,
      context: ['effortless_mastery']
    }
  ],

  winrate: [
    // Templates für Win-Rate (verkürzt)
    {
      id: 'winrate_statistisch_1',
      template: '{playerName} dominiert mit {value}% Siegquote - mathematisch überlegen!',
      tonality: 'statistisch',
      priority: 85,
      context: ['statistical_dominance']
    },
    {
      id: 'winrate_witzig_1',
      template: '{playerName} gewinnt {value}% der Spiele - fast wie ein Cheat-Code!',
      tonality: 'witzig',
      priority: 85,
      context: ['gaming_reference', 'dominance']
    }
  ],

  speed: [
    // Templates für Speed (verkürzt)
    {
      id: 'speed_witzig_1',
      template: '{playerName} spielt in {value} - Zeit ist Geld!',
      tonality: 'witzig',
      priority: 75,
      context: ['time_value']
    }
  ],

  veteran: [
    // Templates für Veteran (verkürzt)
    {
      id: 'veteran_respektvoll_1',
      template: '{playerName} bringt {value} Spiele Erfahrung mit - ein wahrer Veteran!',
      tonality: 'respektvoll',
      priority: 85,
      context: ['experience_value']
    }
  ],

  team: [
    // Templates für Team (verkürzt)
    {
      id: 'team_witzig_1',
      template: '{teamNames} harmonieren perfekt - ein eingespieltes Team!',
      tonality: 'witzig',
      priority: 80,
      context: ['harmony', 'teamwork']
    }
  ],

  session: [
    // Templates für Session (verkürzt)
    {
      id: 'session_witzig_1',
      template: 'Diese Session: {value} - ein Marathon der Extraklasse!',
      tonality: 'witzig',
      priority: 75,
      context: ['marathon_session']
    }
  ]
};

interface TemplateConfig {
  minRelevance: number;
  maxTemplatesPerCategory: number;
  defaultTone: string;
}

export class TemplateSystem {
  private templates: Map<string, ContextTemplate[]> = new Map();
  
  constructor(private config: TemplateConfig) {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    // Konvertiere expandedTemplates zu kompatiblem Format
    Object.entries(expandedTemplates).forEach(([category, extendedTemplates]) => {
      const compatibleTemplates: ContextTemplate[] = extendedTemplates.map(extTemplate => ({
        category,
        condition: () => true, // Vereinfacht für jetzt
        templates: [(insight: StatInsight, tone: string) => {
          let result = extTemplate.template;
          // Replace placeholders
          if (insight.playerName) {
            result = result.replace(/\{playerName\}/g, insight.playerName);
          }
          if (insight.data.value !== undefined) {
            result = result.replace(/\{value\}/g, String(insight.data.value));
          }
          if (insight.data.displayValue) {
            result = result.replace(/\{displayValue\}/g, insight.data.displayValue);
          }
          return result;
        }],
        tones: [extTemplate.tonality as any],
        minRelevance: this.config.minRelevance
      }));
      
      this.templates.set(category, compatibleTemplates);
    });
  }

  generateContext(
    category: string,
    insights: StatInsight[],
    sessionContext: string[] = []
  ): string | null {
    const template = this.selectSmartTemplate(category, insights, sessionContext);
    if (!template) return null;

    const insight = insights[0];
    if (!insight) return null;

    // Verwende die erste Template-Funktion
    const templateFunction = template.templates[0];
    const tone = template.tones[0];
    
    return templateFunction(insight, tone);
  }

  getAvailableTemplates(): Map<string, ContextTemplate[]> {
    return this.templates;
  }

  // NEUE METHODE: Smart Template Selection mit Anti-Repetition
  selectSmartTemplate(
    category: string,
    insights: StatInsight[],
    sessionContext: string[] = []
  ): ContextTemplate | null {
    const templates = this.templates.get(category) || [];
    if (templates.length === 0) return null;

    // Für jetzt vereinfacht - nimm das erste verfügbare Template
    return templates[0] || null;
  }
}

// Export function to reset between sessions
export function resetTemplateUsage() {
  resetUsageHistory();
} 