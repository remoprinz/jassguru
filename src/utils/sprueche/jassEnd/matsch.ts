import type {SpruchGenerator} from "../../../types/sprueche";

// Hilfsfunktion für korrekte Matsch-Anzahl-Grammatik
function formatMatschAnzahl(anzahl: number): string {
  if (anzahl === 0) return "keinen Matsch";
  if (anzahl === 1) return "einen Matsch";
  if (anzahl === 2) return "zwei Matsche";
  if (anzahl === 3) return "drei Matsche";
  if (anzahl === 4) return "vier Matsche";
  if (anzahl === 5) return "fünf Matsche";
  return `${anzahl} Matsche`;
}

// Hilfsfunktion um Matsch-Kontext zu analysieren
function analyzeMatschContext(params: any): {
  topMatsche: number;
  bottomMatsche: number;
  matschDifferenz: number;
  dominantTeam: 'top' | 'bottom' | null;
  matschBilanz: string;
  isEntscheidend: boolean;
  isDominanz: boolean;
  totalMatsche: number;
  winnerHasMoreMatsche: boolean;
  // NEUE INTELLIGENTE ANALYSE
  sessionWinner: 'top' | 'bottom' | 'draw';
  matschParadox: boolean;
  matschIronie: 'matsche_umsonst' | 'qualität_statt_quantität' | 'ausgeglichen' | null;
  matschEffektivität: number; // Wie effektiv waren die Matsche für den Sieg?
} {
  // Extrahiere Matsch-Daten aus eventCounts oder anderen Quellen
  const topMatsche = params.eventCounts?.top?.matsch || 0;
  const bottomMatsche = params.eventCounts?.bottom?.matsch || 0;
  const totalMatsche = topMatsche + bottomMatsche;
  const matschDifferenz = Math.abs(topMatsche - bottomMatsche);
  
  // Bestimme dominantes Team (bezogen auf Matsche)
  let dominantTeam: 'top' | 'bottom' | null = null;
  if (topMatsche > bottomMatsche) dominantTeam = 'top';
  else if (bottomMatsche > topMatsche) dominantTeam = 'bottom';
  
  // Matsch-Bilanz als String
  const matschBilanz = `${Math.max(topMatsche, bottomMatsche)}:${Math.min(topMatsche, bottomMatsche)}`;
  
  // NEUE: Session-Gewinner basierend auf Strichen
  const topStriche = params.gesamtStand?.team2 || 0;
  const bottomStriche = params.gesamtStand?.team1 || 0;
  let sessionWinner: 'top' | 'bottom' | 'draw' = 'draw';
  if (topStriche > bottomStriche) sessionWinner = 'top';
  else if (bottomStriche > topStriche) sessionWinner = 'bottom';
  
  // Ist der Matsch-Unterschied entscheidend?
  const stricheDifferenz = params.stricheDifference || 0;
  const isEntscheidend = matschDifferenz * 2 >= stricheDifferenz; // Matsche könnten Spiel entschieden haben
  
  // Echte Dominanz (3+ Matsche Unterschied)
  const isDominanz = matschDifferenz >= 3;
  
  // Hat der SESSION-Gewinner mehr Matsche?
  const winnerHasMoreMatsche = (sessionWinner === 'top' && topMatsche >= bottomMatsche) || 
                               (sessionWinner === 'bottom' && bottomMatsche >= topMatsche);
  
  // PARADOX: Matsch-Dominator verliert die Session
  const matschParadox = (dominantTeam === 'top' && sessionWinner === 'bottom') ||
                        (dominantTeam === 'bottom' && sessionWinner === 'top');
  
  // IRONIE-ANALYSE
  let matschIronie: 'matsche_umsonst' | 'qualität_statt_quantität' | 'ausgeglichen' | null = null;
  
  if (matschParadox && matschDifferenz >= 2) {
    matschIronie = 'matsche_umsonst'; // Viele Matsche, trotzdem verloren
  } else if (!matschParadox && matschDifferenz >= 1 && sessionWinner !== 'draw') {
    matschIronie = 'qualität_statt_quantität'; // Weniger Matsche, aber trotzdem gewonnen
  } else if (matschDifferenz === 0 && sessionWinner !== 'draw') {
    matschIronie = 'ausgeglichen'; // Gleiche Matsche, aber klarer Session-Gewinner
  }
  
  // MATSCH-EFFEKTIVITÄT (0-100%)
  // Wie gut haben die Matsche zum Session-Sieg beigetragen?
  let matschEffektivität = 50; // Standard
  if (sessionWinner !== 'draw') {
    if (winnerHasMoreMatsche && matschDifferenz >= 2) {
      matschEffektivität = 90; // Matsche waren sehr effektiv
    } else if (matschParadox) {
      matschEffektivität = 10; // Matsche waren kontraproduktiv
    } else if (matschDifferenz === 0) {
      matschEffektivität = 50; // Neutral
    }
  }
  
  return {
    topMatsche,
    bottomMatsche,
    matschDifferenz,
    dominantTeam,
    matschBilanz,
    isEntscheidend,
    isDominanz,
    totalMatsche,
    winnerHasMoreMatsche,
    sessionWinner,
    matschParadox,
    matschIronie,
    matschEffektivität
  };
}

export const matschSprueche: SpruchGenerator[] = [
  // === NEUE INTELLIGENTE PARADOX-SPRÜCHE ===
  
  // 1. MATSCHE UMSONST (Mehr Matsche, trotzdem verloren)
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.matschIronie === 'matsche_umsonst') {
      const matschDominatorNames = context.dominantTeam === 'top' ? 
        (context.topMatsche > context.bottomMatsche ? params.loserNames : params.winnerNames) :
        (context.bottomMatsche > context.topMatsche ? params.loserNames : params.winnerNames);
      
      const matschAnzahl = context.matschDifferenz;
      
      if (matschDominatorNames.length > 0) {
        if (matschAnzahl === 1) {
          return {
            text: `Bitter! ${matschDominatorNames.join(' & ')} machen einen Matsch mehr, verlieren aber trotzdem die Partie! Pech gehabt!`,
            icon: "😤",
          };
        } else {
          return {
            text: `IRONIE PUR! ${matschDominatorNames.join(' & ')} sammeln ${matschAnzahl} Matsche mehr (${context.matschBilanz}) - hat ihnen aber nichts gebracht! Die Partie ist weg!`,
            icon: "🤷‍♂️",
          };
        }
      }
    }
    
    // Korrekte Session-Matsch-Anzahl verwenden statt "einen Matsch"
    const contextFallback = analyzeMatschContext(params);
    const winnerMatsche = contextFallback.sessionWinner === 'top' ? contextFallback.topMatsche : contextFallback.bottomMatsche;
    
    return {
      text: `${params.winnerNames.join(" & ")} holen sich ${formatMatschAnzahl(winnerMatsche)}! Sauber gespielt!`,
      icon: "🎯",
    };
  },
  
  // 2. QUALITÄT STATT QUANTITÄT (Weniger Matsche, trotzdem gewonnen)
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.matschIronie === 'qualität_statt_quantität' && !context.winnerHasMoreMatsche) {
      const matschVerliererNames = context.dominantTeam === 'top' ? 
        (context.topMatsche > context.bottomMatsche ? params.loserNames : params.winnerNames) :
        (context.bottomMatsche > context.topMatsche ? params.loserNames : params.winnerNames);
      
      if (matschVerliererNames.length > 0 && params.winnerNames.length > 0) {
        return {
          text: `Qualität statt Quantität! ${params.winnerNames.join(' & ')} gewinnen die Partie trotz weniger Matsche (${context.matschBilanz})! ${matschVerliererNames.join(' & ')} schauen dumm aus der Wäsche!`,
          icon: "🧠",
        };
      }
    }
    
    return {
      text: `${params.winnerNames.join(" & ")} sammeln ${context.totalMatsche} Matsche! Das ist die Belohnung für gutes Jassen!`,
      icon: "🏆",
    };
  },
  
  // 3. STRATEGISCHE BEOBACHTUNGEN
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.matschEffektivität <= 20 && context.matschDifferenz >= 2) {
      return {
        text: `Tragisch! ${context.matschDifferenz} Matsche Vorsprung und trotzdem verloren! Manchmal ist Jassen halt nicht nur Matsche sammeln!`,
        icon: "📉",
      };
    } else if (context.matschEffektivität >= 80 && context.isEntscheidend) {
      return {
        text: `Perfekt! Die Matsche waren heute der Schlüssel zum Sieg! ${context.matschBilanz} Bilanz entschied die ${params.stricheDifference} Striche Partie!`,
        icon: "🗝️",
      };
    }
    
    // Verwende korrekte Session-Matsch-Anzahl
    const contextLocal = analyzeMatschContext(params);
    const winnerMatscheLocal = contextLocal.sessionWinner === 'top' ? contextLocal.topMatsche : contextLocal.bottomMatsche;
    
    return {
      text: `${params.winnerNames.join(" & ")} machen ${formatMatschAnzahl(winnerMatscheLocal)}! Das brennt schön!`,
      icon: "🔥",
    };
  },
  
  // 4. EMOTIONALE WENDUNGEN
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.matschParadox && context.matschDifferenz >= 3) {
      const enttäuschteTeam = context.dominantTeam === 'top' ? 
        (context.sessionWinner === 'bottom' ? params.loserNames : params.winnerNames) :
        (context.sessionWinner === 'top' ? params.loserNames : params.winnerNames);
      
      if (enttäuschteTeam.length > 0) {
        return {
          text: `HERZSCHMERZ! ${enttäuschteTeam.join(' & ')} dominieren bei den Matschen (${context.matschBilanz}), aber die Partie ist trotzdem futsch! Das tut weh!`,
          icon: "💔",
        };
      }
    }
    
    return {
      text: `Matsch-Bilanz ${context.matschBilanz}! ${params.winnerNames.join(' & ')} sind heute die Matsch-Könige!`,
      icon: "👑",
    };
  },
  
  // 5. PHILOSOPHISCHE MATSCH-WEISHEITEN
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.matschIronie === 'ausgeglichen' && context.totalMatsche >= 4) {
      return {
        text: `Ausgeglichene Matsch-Bilanz ${context.matschBilanz}, aber ${params.winnerNames.join(' & ')} gewinnen trotzdem klar! Matsche sind nicht alles - aber ohne Matsche ist alles nichts!`,
        icon: "🤔",
      };
    }
    
    // KORRIGIERT: Nur "ALLE" sagen, wenn wirklich ALLE Matsche von einem Team gemacht wurden
    const winnerMatsche = context.sessionWinner === 'top' ? context.topMatsche : context.bottomMatsche;
    const loserMatsche = context.sessionWinner === 'top' ? context.bottomMatsche : context.topMatsche;
    
    if (winnerMatsche === context.totalMatsche && loserMatsche === 0 && context.totalMatsche > 0) {
      return {
        text: `MATSCH-SHUTDOWN! ${params.winnerNames.join(' & ')} holen ALLE ${context.totalMatsche} Matsche!`,
        icon: "🚫",
      };
    } else if (winnerMatsche > loserMatsche && context.totalMatsche >= 3) {
      return {
        text: `Matsch-Dominanz! ${params.winnerNames.join(' & ')} sammeln ${winnerMatsche} von ${context.totalMatsche} Matschen!`,
        icon: "💪",
      };
    } else {
      return {
        text: `${params.winnerNames.join(' & ')} erkämpfen sich ${formatMatschAnzahl(winnerMatsche)}! Bilanz: ${context.matschBilanz}`,
        icon: "🎯",
      };
    }
  },
  
  // === CLEVERE TIMING-SPRÜCHE ===
  
  // 6. COMEBACK MIT MATSCH-UNTERSTÜTZUNG
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (params.gameStats?.isComeback && context.winnerHasMoreMatsche) {
      return {
        text: `COMEBACK MIT MATSCH-POWER! ${params.winnerNames.join(' & ')} drehen das Spiel und werden dabei noch von ${context.matschDifferenz} Matsche mehr unterstützt! Doppelt schön!`,
        icon: "🚀",
      };
    } else if (params.gameStats?.isComeback && !context.winnerHasMoreMatsche) {
      return {
        text: `Unglaubliches Comeback TROTZ weniger Matsche! ${params.winnerNames.join(' & ')} zeigen: Hirn schlägt Matsch! (${context.matschBilanz})`,
        icon: "🧠",
      };
    }
    
    // Verwende korrekte Session-Matsch-Anzahl
    const contextLocal2 = analyzeMatschContext(params);
    const winnerMatscheLocal2 = contextLocal2.sessionWinner === 'top' ? contextLocal2.topMatsche : contextLocal2.bottomMatsche;
    
    return {
      text: `${params.winnerNames.join(" & ")} landen ${formatMatschAnzahl(winnerMatscheLocal2)}! Volltreffer!`,
      icon: "🎯",
    };
  },
  
  // 7. MATSCH-STATISTIK MIT KONTEXT
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.totalMatsche >= 6) {
      const matschProzent = Math.round((Math.max(context.topMatsche, context.bottomMatsche) / context.totalMatsche) * 100);
      // KORRIGIERT: Korrekte Team-Zuordnung für die Prozente
      const topProzent = Math.round((context.topMatsche / context.totalMatsche) * 100);
      const bottomProzent = Math.round((context.bottomMatsche / context.totalMatsche) * 100);
      
      return {
        text: `MATSCH-MARATHON! ${context.totalMatsche} Matsche total, Verteilung ${context.matschBilanz} (${topProzent}% vs ${bottomProzent}%) - was für eine Session!`,
        icon: "📊",
      };
    }
    
    return {
      text: `Ausgeglichene Matsch-Bilanz ${context.matschBilanz}! Beide Teams zeigen Klasse!`,
      icon: "⚖️",
    };
  },
  
  // === SWISS-GERMAN AUTHENTIC ERWEITERT ===
  
  // 8. DIALEKT-SPRÜCHE MIT KONTEXT
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.matschParadox) {
      return {
        text: `Ach du liebi Zyt! Mehr Matsche und trotzdem verlore - das git's nur bim Jasse! ${context.matschBilanz} für nüt und wider nüt!`,
        icon: "🤦‍♂️",
      };
    } else if (context.isDominanz) {
      return {
        text: `${params.winnerNames.join(' & ')} machen ä richtige Matsch-Show! ${context.matschBilanz} - das git gueti Stimmig!`,
        icon: "🎭",
      };
    }
    
    return {
      text: `${params.winnerNames.join(" & ")} putzen ${params.loserNames.join(" & ")} weg - Matsch!`,
      icon: "🧹",
    };
  },
  
  // === URSPRÜNGLICHE INTELLIGENTE SPRÜCHE (erweitert) ===
  
  // 9. MATSCH-DOMINANZ (3+ Matsche Unterschied) - erweitert
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.isDominanz) {
      const dominantTeamNames = context.winnerHasMoreMatsche ? params.winnerNames : params.loserNames;
      const weakTeamNames = context.winnerHasMoreMatsche ? params.loserNames : params.winnerNames;
      
      if (dominantTeamNames.length > 0 && weakTeamNames.length > 0) {
        // KORRIGIERT: Zeige die tatsächliche Anzahl, nicht "alle"
        const dominantMatsche = context.dominantTeam === 'top' ? context.topMatsche : context.bottomMatsche;
        const weakMatsche = context.dominantTeam === 'top' ? context.bottomMatsche : context.topMatsche;
        
        if (context.winnerHasMoreMatsche) {
          if (weakMatsche === 0 && dominantMatsche === context.totalMatsche) {
            return {
              text: `${dominantTeamNames.join(' & ')} dominieren mit ALLEN ${context.totalMatsche} Matschen UND gewinnen die Partie! ${weakTeamNames.join(' & ')} bleiben matschlos!`,
              icon: "👑",
            };
          } else {
            return {
              text: `${dominantTeamNames.join(' & ')} dominieren mit ${dominantMatsche} von ${context.totalMatsche} Matschen (${context.matschBilanz}) UND gewinnen die Partie!`,
              icon: "👑",
            };
          }
        } else {
          return {
            text: `${dominantTeamNames.join(' & ')} sammeln ${dominantMatsche} von ${context.totalMatsche} Matschen (${context.matschBilanz}), verlieren aber trotzdem! Jassen ist grausam!`,
            icon: "😱",
          };
        }
      }
    }
    
    // Fallback für normale Matsch-Sprüche mit korrekter Session-Anzahl
    const contextFallback3 = analyzeMatschContext(params);
    const winnerMatscheFallback = contextFallback3.sessionWinner === 'top' ? contextFallback3.topMatsche : contextFallback3.bottomMatsche;
    
    return {
      text: `${params.winnerNames.join(" & ")} holen sich ${formatMatschAnzahl(winnerMatscheFallback)}! Sauber gespielt!`,
      icon: "🎯",
    };
  },
  
  // 10. ENTSCHEIDENDE MATSCHE - erweitert
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.isEntscheidend && context.winnerHasMoreMatsche) {
      return {
        text: `Die ${context.matschDifferenz} Matsche Unterschied machten den Unterschied! ${params.winnerNames.join(" & ")} gewinnen dank Matsch-Überlegenheit bei ${params.stricheDifference} Striche Differenz!`,
        icon: "🔑",
      };
    } else if (context.isEntscheidend && !context.winnerHasMoreMatsche) {
      return {
        text: `Paradox! Trotz ${context.matschDifferenz} Matsche weniger gewinnen ${params.winnerNames.join(" & ")}! Die anderen Spiele waren entscheidend!`,
        icon: "🎭",
      };
    }
    
    return {
      text: `${params.winnerNames.join(" & ")} sammeln ${context.totalMatsche} Matsche! Das ist die Belohnung für gutes Jassen!`,
      icon: "🏆",
    };
  },
  
  // === KLASSISCHE MATSCH-SPRÜCHE (mit korrekter Session-Anzahl) ===
  (params) => {
    const context = analyzeMatschContext(params);
    
    // Bestimme die Anzahl Matsche des Session-Gewinners
    const winnerMatsche = context.sessionWinner === 'top' ? context.topMatsche : context.bottomMatsche;
    
    if (winnerMatsche > 0) {
      return {
        text: `${params.winnerNames.join(" & ")} holen sich ${formatMatschAnzahl(winnerMatsche)}! Bilanz heute: ${context.matschBilanz}`,
        icon: "👍",
      };
    }
    
    return {
      text: `Matsch-Bilanz ${context.matschBilanz}! ${context.totalMatsche} Matsche wurden heute verteilt!`,
      icon: "👍",
    };
  },
  
  (params) => {
    const context = analyzeMatschContext(params);
    
    if (context.totalMatsche === 1) {
      // KORRIGIERT: Zeige wer den einzigen Matsch gemacht hat
      const matschMacher = context.topMatsche === 1 ? 
        (context.sessionWinner === 'top' ? params.winnerNames : params.loserNames) :
        (context.sessionWinner === 'bottom' ? params.winnerNames : params.loserNames);
      
      return {
        text: `Der einzige Matsch geht an ${matschMacher.join(' & ')}! Ein seltener Abend!`,
        icon: "🥇",
      };
    }
    
    // Session-Anzahl korrekt darstellen
    const winnerMatsche = context.sessionWinner === 'top' ? context.topMatsche : context.bottomMatsche;
    
    if (winnerMatsche > 0) {
      return {
        text: `${params.winnerNames.join(" & ")} sammeln ${formatMatschAnzahl(winnerMatsche)}! Gesamt-Bilanz: ${context.matschBilanz}`,
        icon: "👍",
      };
    } else {
      // Gewinner haben keine Matsche gemacht
      const loserMatsche = context.sessionWinner === 'top' ? context.bottomMatsche : context.topMatsche;
      return {
        text: `${params.winnerNames.join(" & ")} gewinnen ohne einen einzigen Matsch! ${params.loserNames.join(" & ")} sammeln ${formatMatschAnzahl(loserMatsche)} umsonst!`,
        icon: "🤷‍♂️",
      };
    }
  }
];
