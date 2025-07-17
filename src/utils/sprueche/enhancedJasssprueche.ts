/**
 * JASSSSPRUCH-GENERIERUNG v4.0 - KOMPLETTE NEUIMPLEMENTIERUNG
 * 
 * Features:
 * - KORREKTE Event-Attribution (wer erzielt vs. wer erhält Schneider/Matsch)
 * - Integration ALLER existierenden Spruch-Module
 * - Reichhaltige, detaillierte Sprüche mit verschiedenen Elementen
 * - Intelligente Zusammenstellung aus verschiedenen Quellen
 * - Spielverlauf-Narrative wie ein Sportjournalist
 * - Zeit-Details, Matsch-Statistiken, Team-Performance
 */

// NextLevel Integration - intelligente Kontext-Sprüche ohne Redundanz
import { createNextLevelSprueche } from './nextLevel/nextLevelSprueche';
import type { GroupComputedStats } from '@/../../functions/src/models/group-stats.model';

import { TeamScores, CompletedGameSummary, GameEntry, PlayerNames, EventCounts, TrumpfCountsByPlayer, RoundDurationsByPlayer, JassSpruchParams } from '../../types/jass';
import { SpruchMitIcon, SpruchGenerator, SpieltempoKategorie } from '../../types/sprueche';
import { formatDuration, getSpieltempoKategorie } from '../formatUtils';

// Import der verwendeten Sprüche
import { deutlichSprueche } from './jassEnd/deutlich';
import { hauchdünnSprueche } from './jassEnd/hauchdünn';
import { hochSprueche } from './jassEnd/hoch';
import { knappSprueche } from './jassEnd/knapp';
import { sehrHochSprueche } from './jassEnd/sehr_hoch';
import { unentschiedenSprueche } from './jassEnd/unentschieden';
import { vernichtendSprueche } from './jassEnd/vernichtend';
import { schneiderSprueche } from './common/schneider';
import { jassEndZeitSprueche } from './zeit/jassEnd';

// ===== NEUE STRUKTUREN FÜR KORREKTE EVENT-ATTRIBUTION =====

interface SessionEventAnalysis {
  // WER hat WAS ERZIELT
  topTeamErzielte: {
    schneider: number;
    matsch: number;
    kontermatsch: number;
    berg: number;
    sieg: number;
  };
  bottomTeamErzielte: {
    schneider: number;
    matsch: number;
    kontermatsch: number;
    berg: number;
    sieg: number;
  };
  
  // WER hat WAS ERHALTEN (das Gegenteil)
  topTeamErhielt: {
    schneider: number;
    matsch: number;
    kontermatsch: number;
  };
  bottomTeamErhielt: {
    schneider: number;
    matsch: number;
    kontermatsch: number;
  };
  
  // Spezifische Spiel-Events für Details
  gameSpecificEvents: Array<{
    gameNumber: number;
    event: 'schneider' | 'matsch' | 'kontermatsch' | 'berg';
    erzielendTeam: 'top' | 'bottom';
    empfangendesTeam: 'top' | 'bottom';
    score: { top: number; bottom: number };
  }>;
}

export interface EnhancedGameData {
  // Basis-Daten
  games: Array<GameEntry | CompletedGameSummary>;
  playerNames: PlayerNames;
  currentTotals: TeamScores;
  
  // Session-Daten aus jassGameSummaries
  eventCounts?: EventCounts;
  aggregatedTrumpfCountsByPlayer?: TrumpfCountsByPlayer;
  aggregatedRoundDurationsByPlayer?: RoundDurationsByPlayer;
  sessionTotalWeisPoints?: TeamScores;
  gameWinsByPlayer?: { [playerId: string]: { wins: number; losses: number } };
  gameWinsByTeam?: { top: number; bottom: number };
  gamesPlayed?: number;
  durationSeconds?: number;
  finalStriche?: { top: any; bottom: any };
  winnerTeamKey?: 'top' | 'bottom' | 'draw';
  gameResults?: Array<{ topScore: number; bottomScore: number; winnerTeam: string }>;
  participantPlayerIds?: string[];
  
  // Erweiterte Gruppen-Statistiken für Kontext-Sprüche
  groupStats?: {
    groupName?: string;
    // Spieler-Statistiken
    playerWithHighestMatschBilanz?: Array<{ playerName: string; value: number; eventsMade: number; eventsReceived?: number; eventsPlayed?: number }>;
    playerWithHighestSchneiderBilanz?: Array<{ playerName: string; value: number; eventsMade: number; eventsReceived?: number; eventsPlayed?: number }>;
    playerWithHighestStricheDiff?: Array<{ playerName: string; value: number; eventsPlayed?: number }>;
    playerWithHighestWinRateSession?: Array<{ playerName: string; value: number; eventsPlayed?: number }>;
    playerWithHighestWinRateGame?: Array<{ playerName: string; value: number; eventsPlayed?: number }>;
    playerWithHighestPointsDiff?: Array<{ playerName: string; value: number; eventsPlayed?: number }>;
    playerWithMostGames?: Array<{ playerName: string; value: number }>;
    playerWithMostWeisPointsAvg?: Array<{ playerName: string; value: number }>;
    // Team-Statistiken
    teamWithHighestMatschBilanz?: Array<{ names: string[]; value: number; eventsMade: number; eventsReceived?: number; eventsPlayed?: number }>;
    teamWithHighestSchneiderBilanz?: Array<{ names: string[]; value: number; eventsMade: number; eventsReceived?: number; eventsPlayed?: number }>;
    teamWithHighestStricheDiff?: Array<{ names: string[]; value: number; eventsPlayed?: number }>;
    teamWithHighestWinRateGame?: Array<{ names: string[]; value: number; eventsPlayed?: number }>;
    teamWithHighestWinRateSession?: Array<{ names: string[]; value: number; eventsPlayed?: number }>;
    // Aggregierte Statistiken
    avgGamesPerSession?: number;
    avgMatschPerGame?: number;
    sessionCount?: number;
    gameCount?: number;
    // Speed-Statistiken
    playerAllRoundTimes?: Array<{ displayValue: string; eventsPlayed: number; playerId: string; playerName: string; value: number }>;
    playerWithFastestRounds?: Array<{ displayValue: string; eventsPlayed: number; playerId: string; playerName: string; value: number }>;
    playerWithSlowestRounds?: Array<{ displayValue: string; eventsPlayed: number; playerId: string; playerName: string; value: number }>;
  };
}

// ===== KORREKTE EVENT-ANALYSE MIT ATTRIBUTION =====

function analyzeSessionEvents(games: Array<GameEntry | CompletedGameSummary>, eventCounts?: EventCounts): SessionEventAnalysis {
  const result: SessionEventAnalysis = {
    topTeamErzielte: { schneider: 0, matsch: 0, kontermatsch: 0, berg: 0, sieg: 0 },
    bottomTeamErzielte: { schneider: 0, matsch: 0, kontermatsch: 0, berg: 0, sieg: 0 },
    topTeamErhielt: { schneider: 0, matsch: 0, kontermatsch: 0 },
    bottomTeamErhielt: { schneider: 0, matsch: 0, kontermatsch: 0 },
    gameSpecificEvents: []
  };
  
  // Verwende eventCounts für Gesamt-Statistik
  if (eventCounts) {
    // Top Team ERZIELT diese Events
    result.topTeamErzielte = { ...eventCounts.top };
    // Bottom Team ERZIELT diese Events
    result.bottomTeamErzielte = { ...eventCounts.bottom };
    
    // Wer ERHÄLT ist das Gegenteil von wer ERZIELT
    result.topTeamErhielt = {
      schneider: eventCounts.bottom.schneider, // Bottom erzielt = Top erhält
      matsch: eventCounts.bottom.matsch,
      kontermatsch: eventCounts.bottom.kontermatsch
    };
    result.bottomTeamErhielt = {
      schneider: eventCounts.top.schneider, // Top erzielt = Bottom erhält
      matsch: eventCounts.top.matsch,
      kontermatsch: eventCounts.top.kontermatsch
    };
  }
  
  // Analysiere einzelne Spiele für spezifische Event-Details
  games.forEach((game, index) => {
    if ('teams' in game && game.teams) {
      // Explizite Typ-Prüfung für TeamStand
      const topTeam = game.teams.top;
      const bottomTeam = game.teams.bottom;
      
      if (topTeam && 'total' in topTeam && bottomTeam && 'total' in bottomTeam) {
        const topScore = topTeam.total || 0;
        const bottomScore = bottomTeam.total || 0;
        const diff = Math.abs(topScore - bottomScore);
        
        // Schneider-Erkennung (>= 500 Punkte Unterschied)
        if (diff >= 500) {
          const erzielendTeam = topScore > bottomScore ? 'top' : 'bottom';
          const empfangendesTeam = erzielendTeam === 'top' ? 'bottom' : 'top';
          
          result.gameSpecificEvents.push({
            gameNumber: index + 1,
            event: 'schneider',
            erzielendTeam,
            empfangendesTeam,
            score: { top: topScore, bottom: bottomScore }
          });
        }
        
        // Matsch-Erkennung (0 Punkte)
        if (topScore === 0 || bottomScore === 0) {
          const erzielendTeam = topScore > 0 ? 'top' : 'bottom';
          const empfangendesTeam = erzielendTeam === 'top' ? 'bottom' : 'top';
          
          result.gameSpecificEvents.push({
            gameNumber: index + 1,
            event: 'matsch',
            erzielendTeam,
            empfangendesTeam,
            score: { top: topScore, bottom: bottomScore }
          });
        }
      }
    }
  });
  
  return result;
}

// ===== NARRATIVE ANALYSE (aus vorherigem Code) =====

interface GameMomentum {
  game: number;
  leader: 'top' | 'bottom' | 'tied';
  leadSize: number;
  isSwing?: boolean;
  isCritical?: boolean;
}

interface NarrativePattern {
  type: 'comeback' | 'blitzstart' | 'collapse' | 'thriller' | 'dominance' | 'nearComeback' | 'backAndForth' | 'boring' | 'streak';
  description: string;
  keyMoments: number[];
  intensity: number;
  details?: string; // Zusätzliche Details zum Verlauf
}

function analyzeGameNarrative(
  gameResults?: Array<{ topScore: number; bottomScore: number; winnerTeam: string }>,
  eventAnalysis?: SessionEventAnalysis,
  winnerTeamKey?: 'top' | 'bottom' | 'draw'
): {
  momentum: GameMomentum[];
  pattern: NarrativePattern | null;
  criticalGames: number[];
  dramaSummary: string;
} {
  if (!gameResults || gameResults.length === 0) {
    return { momentum: [], pattern: null, criticalGames: [], dramaSummary: '' };
  }

  const momentum: GameMomentum[] = [];
  const criticalGames: number[] = [];
  
  let topWins = 0;
  let bottomWins = 0;
  let previousLeader: 'top' | 'bottom' | 'tied' = 'tied';
  let leadChanges = 0;
  let maxLead = 0;
  let maxLeadTeam: 'top' | 'bottom' | null = null;
  let maxLeadAtGame = 0;
  let currentStreak = 0;
  let maxStreak = 0;
  let streakTeam: 'top' | 'bottom' | null = null;
  let lastWinner: 'top' | 'bottom' | null = null;
  
  // NEU: Explizite 0:2 Comeback-Erkennung vor dem gameResults.forEach
  const firstTwoGamesWinner = gameResults.slice(0, 2).every(g => g.winnerTeam === 'bottom') ? 'bottom' :
                              gameResults.slice(0, 2).every(g => g.winnerTeam === 'top') ? 'top' : null;
  
  let comeback = false;
  let collapse = false;
  
  if (firstTwoGamesWinner && gameResults.length >= 4) {
    // Ein Team führte 2:0
    const losingTeam = firstTwoGamesWinner === 'top' ? 'bottom' : 'top';
    const finalWinner = winnerTeamKey || (topWins > bottomWins ? 'top' : 'bottom');
    
    if (finalWinner === losingTeam) {
      // Das Team, das 0:2 zurücklag, hat gewonnen!
      comeback = true;
      collapse = true; // Für das andere Team
    }
  }

  gameResults.forEach((game, index) => {
    const gameWinner = game.winnerTeam === 'top' ? 'top' : 'bottom';
    if (gameWinner === 'top') topWins++;
    else bottomWins++;
    
    // Streak-Tracking
    if (gameWinner === lastWinner) {
      currentStreak++;
    } else {
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        streakTeam = lastWinner;
      }
      currentStreak = 1;
    }
    lastWinner = gameWinner;
    
    const currentLeader = topWins > bottomWins ? 'top' : bottomWins > topWins ? 'bottom' : 'tied';
    const leadSize = Math.abs(topWins - bottomWins);
    const isSwing = previousLeader !== 'tied' && currentLeader !== previousLeader && currentLeader !== 'tied';
    
    const gameNumber = index + 1;
    const remainingGames = gameResults.length - gameNumber;
    const isCritical = 
      isSwing ||
      (previousLeader !== 'tied' && currentLeader === 'tied') ||
      (leadSize > remainingGames && leadSize > 1) ||
      (gameNumber === gameResults.length && leadSize <= 1);
    
    if (isCritical) criticalGames.push(gameNumber);
    if (isSwing) leadChanges++;
    
    if (leadSize > maxLead) {
      maxLead = leadSize;
      maxLeadTeam = currentLeader === 'tied' ? null : currentLeader;
      maxLeadAtGame = gameNumber;
    }
    
    momentum.push({
      game: gameNumber,
      leader: currentLeader,
      leadSize,
      isSwing,
      isCritical
    });
    
    previousLeader = currentLeader;
  });
  
  // Finale Streak checken
  if (currentStreak > maxStreak) {
    maxStreak = currentStreak;
    streakTeam = lastWinner;
  }
  
  // Muster erkennen
  let pattern: NarrativePattern | null = null;
  const finalWinner = winnerTeamKey && winnerTeamKey !== 'draw' ? winnerTeamKey : 
                     (topWins > bottomWins ? 'top' : bottomWins > topWins ? 'bottom' : null);
  const totalGames = gameResults.length;
  
  // EXPLIZITES 0:2 COMEBACK/COLLAPSE - Höchste Priorität!
  if (comeback && finalWinner && firstTwoGamesWinner) {
    const comebackTeam = finalWinner;
    const collapseTeam = firstTwoGamesWinner;
    
    if (comebackTeam !== collapseTeam) {
      pattern = {
        type: 'comeback',
        description: `Unglaubliches Comeback nach 0:2-Rückstand!`,
        keyMoments: [3, 4],
        intensity: 10, // Maximale Intensität für 0:2 Comebacks!
        details: `Nach 2 Spielen noch 0:2 zurück, dann ${totalGames-2} Spiele in Folge gewonnen!`
      };
    }
  }
  // STRICHE-BASIERTES MEGA-COMEBACK - Noch höhere Priorität!
  // Wenn ein Team nach 2 Spielen mit 6+ Strichen führte und dann verliert
  else if (finalWinner && gameResults.length >= 3) {
    // Analysiere Führung nach 2 Spielen
    const firstTwoGames = gameResults.slice(0, 2);
    const bottomWinsAfter2 = firstTwoGames.filter(g => g.winnerTeam === 'bottom').length;
    const topWinsAfter2 = firstTwoGames.filter(g => g.winnerTeam === 'top').length;
    
    // Starke Führung = beide Spiele gewonnen oder deutlicher Punktvorsprung
    const hadStrongLead = (bottomWinsAfter2 === 2 && finalWinner === 'top') || 
                         (topWinsAfter2 === 2 && finalWinner === 'bottom');
    
    if (hadStrongLead) {
      const leadingTeamAfter2 = bottomWinsAfter2 === 2 ? 'bottom' : 'top';
      const comebackTeam = finalWinner;
      
      pattern = {
        type: 'comeback',
        description: `FANTASTISCHES COMEBACK!`,
        keyMoments: [3, 4],
        intensity: 10, // Maximale Intensität!
        details: leadingTeamAfter2 === 'bottom' ? 
          `Marc & Roger führten nach 2 Spielen klar, dann holten Claudia & Frank ${totalGames-2} Spiele in Folge!` :
          `Claudia & Frank führten nach 2 Spielen klar, dann holten Marc & Roger ${totalGames-2} Spiele in Folge!`
      };
    }
  }
  // COLLAPSE - Verspielte Führung (BESONDERS BITTER!)
  else if (finalWinner && maxLeadTeam && maxLeadTeam !== finalWinner && maxLead >= 2) {
    const collapseStartGame = maxLeadAtGame;
    const gamesNeededToLose = totalGames - collapseStartGame;
    
    pattern = {
      type: 'collapse',
      description: `${maxLead}-Spiele-Vorsprung verspielt!`,
      keyMoments: [collapseStartGame, totalGames],
      intensity: Math.min(10, 7 + maxLead),
      details: `Nach ${collapseStartGame} Spielen noch ${maxLead}:${topWins < bottomWins ? topWins : bottomWins} geführt, dann ${gamesNeededToLose} Spiele in Folge verloren!`
    };
  }
  // COMEBACK - Rückstand gedreht
  else if (finalWinner && maxLeadTeam && maxLeadTeam !== finalWinner && maxLead >= 2) {
    pattern = {
      type: 'comeback',
      description: `${maxLead}-Spiele-Rückstand gedreht!`,
      keyMoments: criticalGames,
      intensity: Math.min(10, 6 + maxLead)
    };
  }
  // STREAK - Siegesserie
  else if (maxStreak >= 4) {
    pattern = {
      type: 'streak',
      description: `${maxStreak} Siege in Serie!`,
      keyMoments: Array.from({length: maxStreak}, (_, i) => totalGames - maxStreak + i + 1),
      intensity: Math.min(10, 5 + maxStreak),
      details: streakTeam === finalWinner ? 'Unaufhaltsam bis zum Schluss!' : 'Aber am Ende doch verloren...'
    };
  }
  // BACK AND FORTH - Viele Führungswechsel
  else if (leadChanges >= 3) {
    pattern = {
      type: 'backAndForth',
      description: `${leadChanges} Führungswechsel!`,
      keyMoments: criticalGames,
      intensity: 9,
      details: 'Ein Hin und Her bis zum Schluss!'
    };
  }
  // THRILLER - Knappes Ende
  else if (Math.abs(topWins - bottomWins) <= 1 && totalGames >= 5) {
    pattern = {
      type: 'thriller',
      description: 'Nervenkrimi bis zum letzten Spiel!',
      keyMoments: [totalGames],
      intensity: 8,
      details: `${topWins}:${bottomWins} - jedes Spiel zählte!`
    };
  }
  // BLITZSTART - Frühe Führung behalten
  else if (maxLeadTeam === finalWinner && maxLeadAtGame <= Math.ceil(totalGames / 3)) {
    pattern = {
      type: 'blitzstart',
      description: 'Blitzstart und souverän durchgezogen!',
      keyMoments: [1, maxLeadAtGame],
      intensity: 5,
      details: `Nach ${maxLeadAtGame} Spielen schon ${maxLead} vorne!`
    };
  }
  // DOMINANCE - Einseitiges Spiel
  else if (leadChanges === 0 && finalWinner && Math.abs(topWins - bottomWins) >= 3) {
    pattern = {
      type: 'dominance',
      description: 'Durchmarsch ohne Gegenwehr!',
      keyMoments: [1],
      intensity: 4,
      details: `${Math.max(topWins, bottomWins)}:${Math.min(topWins, bottomWins)} - keine Chance gelassen!`
    };
  }
  // BORING - Langweiliges Spiel ohne Events
  else if (eventAnalysis) {
    const totalEvents = (eventAnalysis.topTeamErzielte.matsch + eventAnalysis.bottomTeamErzielte.matsch +
                        eventAnalysis.topTeamErzielte.schneider + eventAnalysis.bottomTeamErzielte.schneider);
    if (totalEvents === 0 && totalGames >= 4) {
      pattern = {
        type: 'boring',
        description: 'Solides Spiel ohne grosse Höhepunkte',
        keyMoments: [],
        intensity: 2,
        details: 'Keine Matsche, keine Schneider - nur ehrliches Jassen'
      };
    }
  }
  
  // Drama-Zusammenfassung mit erweiterten Details
  let dramaSummary = '';
  if (pattern) {
    // Basis-Beschreibung
    dramaSummary = pattern.description;
    
    // Details hinzufügen
    if (pattern.details) {
      dramaSummary += ` ${pattern.details}`;
    }
    
    // Event-spezifische Details
    if (pattern.type === 'collapse' && eventAnalysis) {
      const dramaticEvents = eventAnalysis.gameSpecificEvents.filter(e => 
        (e.event === 'matsch' || e.event === 'schneider') && 
        e.gameNumber > maxLeadAtGame
      );
      
      if (dramaticEvents.length > 0) {
        const eventDescriptions = dramaticEvents.map(e => 
          `${e.event === 'matsch' ? 'Matsch' : 'Schneider'} in Spiel ${e.gameNumber}`
        ).join(', ');
        dramaSummary += ` Besonders bitter: ${eventDescriptions} während des Zusammenbruchs!`;
      }
    }
    
    if (pattern.type === 'comeback' && eventAnalysis) {
      const turnAroundEvents = eventAnalysis.gameSpecificEvents.filter(e => 
        (e.event === 'matsch' || e.event === 'kontermatsch') && 
        criticalGames.includes(e.gameNumber)
      );
      
      if (turnAroundEvents.length > 0) {
        dramaSummary += ` Der ${turnAroundEvents[0].event === 'matsch' ? 'Matsch' : 'Kontermatsch'} in Spiel ${turnAroundEvents[0].gameNumber} war der Wendepunkt!`;
      }
    }
  }
  
  return { momentum, pattern, criticalGames, dramaSummary };
}

// ===== SPRUCH-KOMPOSITION AUS VERSCHIEDENEN QUELLEN =====

interface SpruchKomponenten {
  hauptspruch: string;          // Basis-Spruch (z.B. Schneider/Sieg)
  narrativ?: string;           // Spielverlauf-Geschichte
  matchDetails?: string;       // Matsch-Statistiken
  zeitDetails?: string;        // Dauer-Informationen
  specialEvents?: string[];    // Besondere Ereignisse
  gruppenContext?: string;     // Gruppen-Statistiken
  emoji: string;
}

function komponiereReichhaltigerSpruch(komponenten: SpruchKomponenten): SpruchMitIcon {
  const parts: string[] = [];
  
  // 1. Hauptspruch (immer)
  parts.push(komponenten.hauptspruch);
  
  // Bei extremen Ergebnissen (14+ Striche Differenz) ALLES hinzufügen!
  const isExtreme = komponenten.hauptspruch.includes("16:") || komponenten.hauptspruch.includes("15:") || 
                   komponenten.hauptspruch.includes("14:") || komponenten.hauptspruch.includes(":16") ||
                   komponenten.hauptspruch.includes(":15") || komponenten.hauptspruch.includes(":14");
  
  // Bei vernichtenden Siegen (10+ Striche) sehr hohe Wahrscheinlichkeiten
  const isVernichtend = komponenten.hauptspruch.includes("vernicht") || komponenten.hauptspruch.includes("Massaker") ||
                       komponenten.hauptspruch.includes("atomisiert") || komponenten.hauptspruch.includes("Blutbad") ||
                       komponenten.emoji === "💥" || komponenten.emoji === "☢️" || komponenten.emoji === "🔪";
  
  // 2. Narrativ (wenn dramatisch)
  if (komponenten.narrativ) {
    parts.push(komponenten.narrativ);
  }
  
  // 3. Match-Details - bei extremen/vernichtenden Siegen IMMER, sonst zufällig
  if (komponenten.matchDetails && (isExtreme || isVernichtend || Math.random() < 0.5)) {
    parts.push(komponenten.matchDetails);
  }
  
  // 4. Special Events - bei extremen Siegen ALLE
  if (komponenten.specialEvents && komponenten.specialEvents.length > 0) {
    const eventsToAdd = isExtreme ? komponenten.specialEvents : 
                       komponenten.specialEvents.slice(0, Math.random() < 0.5 ? 1 : 2);
    parts.push(...eventsToAdd);
  }
  
  // 5. Gruppen-Context - bei extremen Siegen sehr wahrscheinlich
  if (komponenten.gruppenContext && (isExtreme || Math.random() < (isVernichtend ? 0.8 : 0.4))) {
    parts.push(komponenten.gruppenContext);
  }
  
  // 6. Zeit-Details - GANZ AM ENDE! Bei extremen Siegen häufiger
  if (komponenten.zeitDetails && (isExtreme || Math.random() < (isVernichtend ? 0.7 : 0.3))) {
    parts.push(komponenten.zeitDetails);
  }
  
  // Zusammenfügen mit vernünftiger Formatierung
  let text = parts[0]; // Hauptspruch
  
  if (parts.length > 1) {
    // Weitere Teile als separate Sätze oder Aufzählungen
    for (let i = 1; i < parts.length; i++) {
      if (parts[i].startsWith('-') || parts[i].startsWith('•')) {
        text += ` ${parts[i]}`;
      } else {
        text += ` ${parts[i]}`;
      }
    }
  }
  
  return {
    text: text.trim(),
    icon: komponenten.emoji
  };
}

// ===== HILFSFUNKTIONEN =====

// formatDuration ist jetzt aus formatUtils.ts importiert

function getTeamDisplay(playerNames: PlayerNames, team: 'top' | 'bottom'): string {
  if (team === 'top') {
    return `${playerNames[2] || 'Spieler 2'} & ${playerNames[4] || 'Spieler 4'}`;
  } else {
    return `${playerNames[1] || 'Spieler 1'} & ${playerNames[3] || 'Spieler 3'}`;
  }
}

// NEUE Hilfsfunktion für korrekte Grammatik bei Zahlen
function formatZahlAlsWort(anzahl: number, singular: string, plural?: string): string {
  if (anzahl === 0) return `null ${plural || singular}`;
  if (anzahl === 1) return singular;
  
  const pluralForm = plural || `${singular}e`;
  
  switch (anzahl) {
    case 1: return `einen ${singular}`;
    case 2: return `zwei ${pluralForm}`;
    case 3: return `drei ${pluralForm}`;
    case 4: return `vier ${pluralForm}`;
    case 5: return `fünf ${pluralForm}`;
    case 6: return `sechs ${pluralForm}`;
    case 7: return `sieben ${pluralForm}`;
    case 8: return `acht ${pluralForm}`;
    case 9: return `neun ${pluralForm}`;
    case 10: return `zehn ${pluralForm}`;
    default: return `${anzahl} ${pluralForm}`;
  }
}

// Hilfsfunktion nur für die Zahl ohne Substantiv
function formatNurZahl(anzahl: number): string {
  switch (anzahl) {
    case 1: return 'einen';
    case 2: return 'zwei';
    case 3: return 'drei';
    case 4: return 'vier';
    case 5: return 'fünf';
    case 6: return 'sechs';
    case 7: return 'sieben';
    case 8: return 'acht';
    case 9: return 'neun';
    case 10: return 'zehn';
    default: return `${anzahl}`;
  }
}

// getSpieltempoKategorie ist jetzt aus formatUtils.ts importiert

// ===== GRUPPEN-KONTEXT SPRÜCHE =====

interface GroupContextAnalysis {
  playerContexts: Map<string, string[]>;  // playerName -> context sprüche
  teamContexts: string[];                 // team-bezogene sprüche
  sessionContext: string[];               // session-bezogene sprüche
  usedEventTypes?: Set<string>;           // NEU: Tracking verwendeter Event-Types
}

function generateGroupContextSprueche(
  enhancedData: EnhancedGameData,
  eventAnalysis: SessionEventAnalysis,
  winnerNames: string[],
  loserNames: string[],
  isTopWinner: boolean,
  useStriche: boolean,
  diff: number
): GroupContextAnalysis {
  const result: GroupContextAnalysis = {
    playerContexts: new Map(),
    teamContexts: [],
    sessionContext: []
  };
  
  // GLOBALES EVENT-TYPE TRACKING
  const globalEventTypes = new Set<string>();
  
  // Hilfsfunktion zur Event-Type-Prüfung
  const isEventTypeUsed = (eventType: string): boolean => {
    return globalEventTypes.has(eventType);
  };
  
  const markEventTypeUsed = (eventType: string): void => {
    globalEventTypes.add(eventType);
  };

  if (!enhancedData.groupStats) return result;

  const { groupStats, playerNames, participantPlayerIds } = enhancedData;
  const currentPlayers = [playerNames[1], playerNames[2], playerNames[3], playerNames[4]].filter(Boolean);

  // === SPIELER-KONTEXT ANALYSE ===
  
  // 1. MATSCH-BILANZ KONTEXT - VALIDIERT
  if (groupStats.playerWithHighestMatschBilanz) {
    // ZUFALLSBASIERT: Nur 35% Chance für Matsch-Bilanz-Sprüche
    if (Math.random() > 0.35) return result;
    
    // GLOBAL CHECK: Verhindere mehrfache Matsch-Sprüche
    if (isEventTypeUsed('matsch')) return result;
    
    // Finde Spieler mit negativer Matsch-Bilanz
    const matschLoser = groupStats.playerWithHighestMatschBilanz.find(p => 
      p.value < -5 && currentPlayers.includes(p.playerName) // Zurück auf -5 (niedrigere Schwelle)
    );
    
    if (matschLoser) {
      // KORRIGIERT: Matsch-Bilanz sollte sich auf MATSCHE beziehen, nicht aufs Gewinnen!
      const teamMatscheHeute = isTopWinner ? 
        eventAnalysis.topTeamErzielte.matsch : 
        eventAnalysis.bottomTeamErzielte.matsch;
      
      // Nur wenn der Spieler mit schlechter Bilanz heute Matsche gemacht hat
      if (teamMatscheHeute > 0) {
        const contexts = result.playerContexts.get(matschLoser.playerName) || [];
        
        // Sinnvolle Matsch-bezogene Sprüche - KORRIGIERTE LOGIK
        if (matschLoser.value <= -10) {
          contexts.push(`${matschLoser.playerName} verschlechtert seine katastrophale ${matschLoser.value} Matsch-Bilanz weiter!`);
        } else if (matschLoser.value <= -5) {
          contexts.push(`${matschLoser.playerName} baut an seiner ${matschLoser.value} Matsch-Bilanz weiter!`);
        } else {
          // Bei weniger negativen Bilanzen kann "aufbessern" passen (ironisch)
          contexts.push(`${matschLoser.playerName} "verbessert" seine ${matschLoser.value} Bilanz mit ${teamMatscheHeute} ${teamMatscheHeute === 1 ? 'Matsch' : 'Matschen'}!`);
        }
        
        result.playerContexts.set(matschLoser.playerName, contexts);
        markEventTypeUsed('matsch'); // Event-Typ als verwendet markieren
      }
    }

    // Finde Matsch-König (niedrigere Schwelle dank Zufallsgenerator)
    const matschKing = groupStats.playerWithHighestMatschBilanz.find(p => 
      p.value >= 5 && currentPlayers.includes(p.playerName) // Zurück auf 5
    );
    
    if (matschKing) {
      const lostToday = loserNames.includes(matschKing.playerName);
      if (lostToday && eventAnalysis.bottomTeamErhielt.matsch + eventAnalysis.topTeamErhielt.matsch > 0) {
        // KORRIGIERT: Verwende die tatsächliche Anzahl kassierte Matsche des SPIELERS, nicht des Teams
        const isTopPlayer = [playerNames[2], playerNames[4]].includes(matschKing.playerName);
        const teamMatscheKassiert = isTopPlayer ? eventAnalysis.topTeamErhielt.matsch : eventAnalysis.bottomTeamErhielt.matsch;
        
        if (teamMatscheKassiert > 0) {
          // VALIDIERT: Nur wenn das Team des Spielers tatsächlich Matsche kassiert hat
          const matschText = teamMatscheKassiert === 1 ? 'einen Matsch' : formatNurZahl(teamMatscheKassiert) + ' Matsche';
        
        const contexts = result.playerContexts.get(matschKing.playerName) || [];
        contexts.push(`Ausgerechnet ${matschKing.playerName} (Matsch-König mit +${matschKing.value}) kassiert heute ${matschText}!`);
        result.playerContexts.set(matschKing.playerName, contexts);
        markEventTypeUsed('matsch'); // Event-Typ als verwendet markieren
        }
      }
    }
  }

  // 2. WIN-RATE KONTEXT - ZUFALLSBASIERT
  if (groupStats.playerWithHighestWinRateGame && Math.random() <= 0.25) { // 25% Chance
    // Schlechteste Win-Rate
    const worstPlayer = groupStats.playerWithHighestWinRateGame.find(p => 
      p.value < 0.3 && p.eventsPlayed && p.eventsPlayed >= 10 && currentPlayers.includes(p.playerName)
    );
    
    if (worstPlayer && winnerNames.includes(worstPlayer.playerName)) {
      const contexts = result.playerContexts.get(worstPlayer.playerName) || [];
      const winRate = Math.round(worstPlayer.value * 100);
      contexts.push(`${worstPlayer.playerName} siegt! Bei nur ${winRate}% Siegquote eine Seltenheit!`);
      result.playerContexts.set(worstPlayer.playerName, contexts);
    }

    // Beste Win-Rate
    const bestPlayer = groupStats.playerWithHighestWinRateGame.find(p => 
      p.value > 0.7 && p.eventsPlayed && p.eventsPlayed >= 10 && currentPlayers.includes(p.playerName)
    );
    
    if (bestPlayer && loserNames.includes(bestPlayer.playerName)) {
      const contexts = result.playerContexts.get(bestPlayer.playerName) || [];
      const winRate = Math.round(bestPlayer.value * 100);
      contexts.push(`${bestPlayer.playerName} verliert? Mit ${winRate}% Siegquote normalerweise undenkbar!`);
      result.playerContexts.set(bestPlayer.playerName, contexts);
    }
  }

  // 3. PUNKTE-DIFFERENZ KONTEXT (Historie vs. Heute) - Validiert
  if (groupStats.playerWithHighestPointsDiff) {
    const historicLoser = groupStats.playerWithHighestPointsDiff.find(p => 
      p.value < -5000 && currentPlayers.includes(p.playerName)
    );
    
    if (historicLoser && winnerNames.includes(historicLoser.playerName) && diff >= 5) {
      const contexts = result.playerContexts.get(historicLoser.playerName) || [];
      contexts.push(`${historicLoser.playerName} dreht den Spiess um! Historisch ${Math.abs(historicLoser.value)} Punkte im Minus!`);
      result.playerContexts.set(historicLoser.playerName, contexts);
    }
  }

  // 4. WEIS-KÖNIG KONTEXT - Validiert
  if (groupStats.playerWithMostWeisPointsAvg && enhancedData.sessionTotalWeisPoints) {
    const weisKing = groupStats.playerWithMostWeisPointsAvg.find(p => 
      p.value >= 100 && currentPlayers.includes(p.playerName)
    );
    
    if (weisKing) {
      // Check ob der Weis-König heute keine Weis hatte
      const topWeis = enhancedData.sessionTotalWeisPoints.top || 0;
      const bottomWeis = enhancedData.sessionTotalWeisPoints.bottom || 0;
      const weisKingTeam = [playerNames[2], playerNames[4]].includes(weisKing.playerName) ? 'top' : 'bottom';
      const teamWeis = weisKingTeam === 'top' ? topWeis : bottomWeis;
      
      if (teamWeis === 0) {
        const contexts = result.playerContexts.get(weisKing.playerName) || [];
        contexts.push(`${weisKing.playerName} ohne Weis? Der Weis-König (Ø ${Math.round(weisKing.value)}) schwächelt!`);
        result.playerContexts.set(weisKing.playerName, contexts);
      }
    }
  }

  // === TEAM-KONTEXT ANALYSE ===
  
  // Aktuelle Paarungen prüfen
  const topTeamKey = [playerNames[2], playerNames[4]].sort().join('_');
  const bottomTeamKey = [playerNames[1], playerNames[3]].sort().join('_');
  
  if (groupStats.teamWithHighestWinRateGame) {
    // Suche historische Performance dieser Teams
    const topTeamHistory = groupStats.teamWithHighestWinRateGame.find(t => 
      t.names.sort().join('_') === topTeamKey && t.eventsPlayed && t.eventsPlayed >= 3
    );
    
    const bottomTeamHistory = groupStats.teamWithHighestWinRateGame.find(t => 
      t.names.sort().join('_') === bottomTeamKey && t.eventsPlayed && t.eventsPlayed >= 3
    );
    
    // Historisches Dream-Team verliert?
    if (topTeamHistory && topTeamHistory.value >= 0.8 && !isTopWinner) {
      const winRate = Math.round(topTeamHistory.value * 100);
      result.teamContexts.push(`${playerNames[2]} & ${playerNames[4]} verlieren? Das Dream-Team mit ${winRate}% Siegquote strauchelt!`);
    }
    
    if (bottomTeamHistory && bottomTeamHistory.value >= 0.8 && isTopWinner) {
      const winRate = Math.round(bottomTeamHistory.value * 100);
      result.teamContexts.push(`${playerNames[1]} & ${playerNames[3]} geschlagen! Normalerweise mit ${winRate}% Siegquote unschlagbar!`);
    }
    
    // Historisches Verlierer-Team gewinnt?
    if (topTeamHistory && topTeamHistory.value <= 0.2 && isTopWinner) {
      const winRate = Math.round(topTeamHistory.value * 100);
      result.teamContexts.push(`Sensation! ${playerNames[2]} & ${playerNames[4]} gewinnen trotz nur ${winRate}% historischer Siegquote!`);
    }
    
    if (bottomTeamHistory && bottomTeamHistory.value <= 0.2 && !isTopWinner) {
      const winRate = Math.round(bottomTeamHistory.value * 100);
      result.teamContexts.push(`Überraschung! ${playerNames[1]} & ${playerNames[3]} siegen mit nur ${winRate}% Siegquote!`);
    }
  }

  // Direkte Team-Rivalität - VALIDIERT
  if (groupStats.teamWithHighestStricheDiff) {
    const rivalry = groupStats.teamWithHighestStricheDiff.find(t => {
      const teamKey = t.names.sort().join('_');
      return (teamKey === topTeamKey || teamKey === bottomTeamKey) && 
             t.eventsPlayed && t.eventsPlayed >= 5;
    });
    
    if (rivalry && Math.abs(rivalry.value) >= 10) {
      const isDominant = rivalry.value > 0;
      const teamNames = rivalry.names.join(' & ');
      const rivalryWonToday = (rivalry.names.sort().join('_') === topTeamKey && isTopWinner) ||
                             (rivalry.names.sort().join('_') === bottomTeamKey && !isTopWinner);
      
      if (isDominant && !rivalryWonToday) {
        result.teamContexts.push(`${teamNames} verlieren! Nach +${rivalry.value} Striche Dominanz eine Demütigung!`);
      } else if (!isDominant && rivalryWonToday) {
        result.teamContexts.push(`${teamNames} drehen die Serie! Von ${rivalry.value} Striche Rückstand zum Sieg!`);
      }
    }
  }

  // === SESSION-KONTEXT ===
  
  // Rekord-Sessions - ZUFALLSBASIERT
  if (enhancedData.gamesPlayed && groupStats.avgGamesPerSession && Math.random() <= 0.40) { // 40% Chance
    if (enhancedData.gamesPlayed >= groupStats.avgGamesPerSession * 2) {
      result.sessionContext.push(`Marathon-Session mit ${enhancedData.gamesPlayed} Spielen!`);
    }
  }

  // Matsch-Rekorde - ZUFALLSBASIERT + GLOBAL CHECK
  const totalMatsche = eventAnalysis.topTeamErzielte.matsch + eventAnalysis.bottomTeamErzielte.matsch;
  if (totalMatsche > 0 && groupStats.avgMatschPerGame && enhancedData.gamesPlayed && 
      Math.random() <= 0.30 && !isEventTypeUsed('matsch')) { // 30% Chance + KEINE doppelten Matsch-Sprüche
    const expectedMatsche = Math.round(groupStats.avgMatschPerGame * enhancedData.gamesPlayed);
    if (totalMatsche >= expectedMatsche * 2 && expectedMatsche > 0) {
      // KORRIGIERT: Zeige korrekte Matsch-Bilanz
      const topMatsche = eventAnalysis.topTeamErzielte.matsch;
      const bottomMatsche = eventAnalysis.bottomTeamErzielte.matsch;
      
      // VALIDIERT: Nur aussagekräftige Vergleiche
      if (totalMatsche >= 4) {
      result.sessionContext.push(`${totalMatsche} Matsche heute (${topMatsche}:${bottomMatsche}) - doppelt so viel wie üblich!`);
      markEventTypeUsed('matsch'); // Event-Typ als verwendet markieren
      } else if (totalMatsche >= 3 && expectedMatsche <= 1) {
        result.sessionContext.push(`${totalMatsche} Matsche (${topMatsche}:${bottomMatsche}) - mehr Action als gewöhnlich!`);
        markEventTypeUsed('matsch'); // Event-Typ als verwendet markieren
      }
    }
  }

  // Rückgabe mit Event-Type-Tracking
  return {
    ...result,
    usedEventTypes: globalEventTypes // NEU: Event-Types weiterreichen
  };
}

// ===== HAUPTGENERATOR MIT KORREKTER LOGIK =====

export function generateEnhancedJassSpruch(data: {
  games: Array<GameEntry | CompletedGameSummary>;
  playerNames: PlayerNames;
  currentTotals: TeamScores;
  legacy?: boolean;
  groupStats?: EnhancedGameData['groupStats'];
}): SpruchMitIcon {
  // DEBUG: Logging für Analyse (nur in Development)
  if (process.env.NODE_ENV === 'development') {
    console.log('[JassSpruch] Generating spruch with data:', {
      gamesCount: data.games.length,
      playerNames: data.playerNames,
      currentTotals: data.currentTotals,
      hasGroupStats: !!data.groupStats
    });
  }

  // Extrahiere Session-Daten
  const lastGame = data.games[data.games.length - 1];
  let enhancedData: EnhancedGameData = { ...data };
  
  if (lastGame && 'eventCounts' in lastGame) {
    const summary = lastGame as CompletedGameSummary;
    enhancedData = {
      ...data,
      eventCounts: summary.eventCounts,
      aggregatedTrumpfCountsByPlayer: summary.trumpfCountsByPlayer,
      aggregatedRoundDurationsByPlayer: summary.roundDurationsByPlayer,
      sessionTotalWeisPoints: summary.weisPoints,
      participantPlayerIds: summary.participantUids,
      gameResults: summary.gameResults,
      gameWinsByTeam: summary.gameWinsByTeam,
      gamesPlayed: summary.gamesPlayed,
      durationSeconds: summary.durationSeconds,
      finalStriche: summary.finalStriche,
      winnerTeamKey: summary.winnerTeamKey
    };
    
    // DEBUG: Log enhanced data (nur in Development)
    if (process.env.NODE_ENV === 'development') {
      console.log('[JassSpruch] Enhanced data:', {
        hasEventCounts: !!enhancedData.eventCounts,
        eventCounts: enhancedData.eventCounts,
        gamesPlayed: enhancedData.gamesPlayed,
        winnerTeamKey: enhancedData.winnerTeamKey,
        hasFinalStriche: !!enhancedData.finalStriche
      });
    }
  }
  
  // Basis-Berechnungen - WICHTIG: Bei Striche-Jassen zählen STRICHE, nicht Punkte!
  const { games, playerNames, currentTotals } = enhancedData;
  
  // Berechne TOTALE Striche für das angezeigte Endergebnis
  let topStricheTotal = 0;
  let bottomStricheTotal = 0;
  
  if (enhancedData.finalStriche) {
    // Zähle ALLE Striche für die Anzeige
    const topStriche = enhancedData.finalStriche.top;
    const bottomStriche = enhancedData.finalStriche.bottom;
    
    topStricheTotal = (topStriche.berg || 0) + 
                     (topStriche.sieg || 0) + 
                     (topStriche.matsch || 0) + 
                     (topStriche.schneider || 0) + 
                     (topStriche.kontermatsch || 0);
                     
    bottomStricheTotal = (bottomStriche.berg || 0) + 
                        (bottomStriche.sieg || 0) + 
                        (bottomStriche.matsch || 0) + 
                        (bottomStriche.schneider || 0) + 
                        (bottomStriche.kontermatsch || 0);
  }
  
  // Verwende Striche wenn vorhanden, sonst Punkte
  const useStriche = topStricheTotal > 0 || bottomStricheTotal > 0;
  const topTotal = useStriche ? topStricheTotal : (currentTotals.top || 0);
  const bottomTotal = useStriche ? bottomStricheTotal : (currentTotals.bottom || 0);
  
  // Differenz für Kategorisierung
  const diff = Math.abs(topTotal - bottomTotal);
  const isTopWinner = enhancedData.winnerTeamKey ? enhancedData.winnerTeamKey === 'top' : topTotal > bottomTotal;
  const isUnentschieden = topTotal === bottomTotal;
  
  // Für Spruch-Generierung: verwende gamesDiff als diff für Kompatibilität
  const gamesDiff = useStriche ? Math.abs(topStricheTotal - bottomStricheTotal) / 2 : Math.abs(topTotal - bottomTotal);
  
  // Team-Namen
  const topTeamDisplay = getTeamDisplay(playerNames, 'top');
  const bottomTeamDisplay = getTeamDisplay(playerNames, 'bottom');
  const winnerNames = isUnentschieden ? [] : (isTopWinner ? [playerNames[2], playerNames[4]] : [playerNames[1], playerNames[3]]);
  const loserNames = isUnentschieden ? [] : (isTopWinner ? [playerNames[1], playerNames[3]] : [playerNames[2], playerNames[4]]);
  
  // KORREKTE Event-Analyse
  const eventAnalysis = analyzeSessionEvents(games, enhancedData.eventCounts);
  
  // DEBUG: Log event analysis (nur in Development)
  if (process.env.NODE_ENV === 'development') {
    console.log('[JassSpruch] Event analysis:', {
      topTeamErzielte: eventAnalysis.topTeamErzielte,
      bottomTeamErzielte: eventAnalysis.bottomTeamErzielte,
      topTeamErhielt: eventAnalysis.topTeamErhielt,
      bottomTeamErhielt: eventAnalysis.bottomTeamErhielt,
      totalMatsche: eventAnalysis.topTeamErzielte.matsch + eventAnalysis.bottomTeamErzielte.matsch
    });
  }
  
  const narrativeAnalysis = analyzeGameNarrative(enhancedData.gameResults, eventAnalysis, enhancedData.winnerTeamKey);
  
  // === NEUE MULTI-KATEGORIE ANALYSE ===
  interface KategorieMatch {
    kategorie: string;
    prioritaet: number;
    spruchText: string;
    emoji: string;
    details?: string[];
  }
  
  const kategorien: KategorieMatch[] = [];
  
  // 1. KONTERMATSCH (höchste Priorität!)
  if (eventAnalysis.topTeamErzielte.kontermatsch > 0 || eventAnalysis.bottomTeamErzielte.kontermatsch > 0) {
    const kontermatschTeam = eventAnalysis.topTeamErzielte.kontermatsch > 0 ? topTeamDisplay : bottomTeamDisplay;
    const kontermatschCount = Math.max(eventAnalysis.topTeamErzielte.kontermatsch, eventAnalysis.bottomTeamErzielte.kontermatsch);
    const kontermatschText = kontermatschCount === 1 ? 'einen Kontermatsch' : `${kontermatschCount} Kontermatsche`;
    
    kategorien.push({
      kategorie: 'KONTERMATSCH',
      prioritaet: 1000,
      spruchText: `${kontermatschTeam} machen ${kontermatschText} - ABSOLUT BRUTAL!`,
      emoji: '💀',
      details: ['Das ist ein Kontermatsch - passiert sehr selten!']
    });
  }
  
  // 2. SCHNEIDER (sehr hohe Priorität)
  if (eventAnalysis.topTeamErzielte.schneider > 0 || eventAnalysis.bottomTeamErzielte.schneider > 0) {
    const schneiderEvent = eventAnalysis.gameSpecificEvents.find(e => e.event === 'schneider');
    if (schneiderEvent) {
      const schneiderWinnerNames = schneiderEvent.erzielendTeam === 'top' 
        ? [playerNames[2], playerNames[4]]
        : [playerNames[1], playerNames[3]];
      const schneiderLoserNames = schneiderEvent.empfangendesTeam === 'top'
        ? [playerNames[2], playerNames[4]]
        : [playerNames[1], playerNames[3]];
      
      // Verwende einen der klassischen Schneider-Sprüche
      const schneiderGenerator = schneiderSprueche[Math.floor(Math.random() * schneiderSprueche.length)];
      const schneiderParams: JassSpruchParams = {
        winnerNames: schneiderWinnerNames.filter(Boolean),
        loserNames: schneiderLoserNames.filter(Boolean),
        isUnentschieden: false,
        isStricheMode: true,
        type: 'jassEnd',
        isSchneider: true,
        stricheDifference: diff,
        pointDifference: schneiderEvent.score[schneiderEvent.erzielendTeam] - schneiderEvent.score[schneiderEvent.empfangendesTeam],
        timerAnalytics: { totalJassTime: (enhancedData.durationSeconds || 0) * 1000, currentGameDuration: 0 },
        matchCount: { team1: enhancedData.gameWinsByTeam?.bottom || 0, team2: enhancedData.gameWinsByTeam?.top || 0 },
        gameStats: { currentGameNumber: games.length, totalGames: games.length, isComeback: false, führungsWechsel: false, höchsterVorsprung: { team: 'team1', differenz: 0 } },
        gesamtStand: { team1: bottomTotal, team2: topTotal },
        previousGesamtStand: { team1: 0, team2: 0 },
        totalMatsche: 0
      };
      
      const schneiderSpruch = schneiderGenerator(schneiderParams);
      
      kategorien.push({
        kategorie: 'SCHNEIDER',
        prioritaet: 900,
        spruchText: schneiderSpruch ? schneiderSpruch.text : `Schnipp, schnapp, Schneider! ${schneiderLoserNames.join(' & ')} wurden zerschnippelt!`,
        emoji: schneiderSpruch ? schneiderSpruch.icon : '✂️',
        details: [`Spiel ${schneiderEvent.gameNumber}: ${schneiderEvent.score[schneiderEvent.erzielendTeam]}:${schneiderEvent.score[schneiderEvent.empfangendesTeam]}`]
      });
    }
  }
  
  // 3. PUNKTBASIERTE KATEGORIEN
  if ((useStriche && diff >= 14) || (!useStriche && diff >= 20)) {
    kategorien.push({
      kategorie: 'EXTREME_VERNICHTUNG',
      prioritaet: 800,
      spruchText: `${diff} Striche Unterschied - HISTORISCHE DEMÜTIGUNG!`,
      emoji: '☢️',
      details: [`Das ist eine ${diff}-Striche-Vernichtung der Extraklasse!`]
    });
  } else if ((useStriche && diff >= 10) || (!useStriche && diff >= 15)) {
    const generator = vernichtendSprueche[Math.floor(Math.random() * vernichtendSprueche.length)];
    const spruch = generator(createJassSpruchParams());
    kategorien.push({
      kategorie: 'VERNICHTEND',
      prioritaet: 700,
      spruchText: spruch ? spruch.text : `Vernichtender Sieg! ${winnerNames.join(' & ')} demütigen ${loserNames.join(' & ')}!`,
      emoji: spruch ? spruch.icon : '💥',
      details: [`${diff} Striche Unterschied sprechen eine deutliche Sprache!`]
    });
  } else if ((useStriche && diff >= 8) || (!useStriche && diff >= 10)) {
    const generator = sehrHochSprueche[Math.floor(Math.random() * sehrHochSprueche.length)];
    const spruch = generator(createJassSpruchParams());
    kategorien.push({
      kategorie: 'SEHR_HOCH',
      prioritaet: 600,
      spruchText: spruch ? spruch.text : `Hoher Sieg! ${winnerNames.join(' & ')} dominierten klar!`,
      emoji: spruch ? spruch.icon : '🏆'
    });
  } else if ((useStriche && diff >= 6) || (!useStriche && diff >= 7)) {
    const generator = hochSprueche[Math.floor(Math.random() * hochSprueche.length)];
    const spruch = generator(createJassSpruchParams());
    kategorien.push({
      kategorie: 'HOCH',
      prioritaet: 500,
      spruchText: spruch ? spruch.text : `Hoher Sieg! ${winnerNames.join(' & ')} dominierten!`,
      emoji: spruch ? spruch.icon : '👑'
    });
  } else if ((useStriche && diff >= 5) || (!useStriche && diff >= 5)) {
    const generator = deutlichSprueche[Math.floor(Math.random() * deutlichSprueche.length)];
    const spruch = generator(createJassSpruchParams());
    kategorien.push({
      kategorie: 'DEUTLICH',
      prioritaet: 400,
      spruchText: spruch ? spruch.text : `Deutlicher Sieg! ${winnerNames.join(' & ')} setzten ein Zeichen!`,
      emoji: spruch ? spruch.icon : '🎖️'
    });
  } else if (diff === 1) {
    const generator = hauchdünnSprueche[Math.floor(Math.random() * hauchdünnSprueche.length)];
    const spruch = generator(createJassSpruchParams());
    kategorien.push({
      kategorie: 'HAUCHDÜNN',
      prioritaet: 300,
      spruchText: spruch ? spruch.text : `Hauchdünner Sieg! ${winnerNames.join(' & ')} mit nur einem ${useStriche ? 'Strich' : 'Punkt'} Vorsprung!`,
      emoji: spruch ? spruch.icon : '🎯'
    });
  } else if (!isUnentschieden) {
    const generator = knappSprueche[Math.floor(Math.random() * knappSprueche.length)];
    const spruch = generator(createJassSpruchParams());
    kategorien.push({
      kategorie: 'KNAPP',
      prioritaet: 200,
      spruchText: spruch ? spruch.text : `Knapper Sieg! ${winnerNames.join(' & ')} mit ${diff} ${useStriche ? 'Strichen' : 'Punkten'} Vorsprung!`,
      emoji: spruch ? spruch.icon : '🔥'
    });
  }
  
  // Unentschieden separat behandeln
  if (isUnentschieden) {
    const generator = unentschiedenSprueche[Math.floor(Math.random() * unentschiedenSprueche.length)];
    const spruch = generator(createJassSpruchParams());
    kategorien.push({
      kategorie: 'UNENTSCHIEDEN',
      prioritaet: 999, // Sehr hoch wenn es passiert
      spruchText: spruch ? spruch.text : `Unentschieden! ${topTeamDisplay} und ${bottomTeamDisplay} trennten sich ehrenhaft!`,
      emoji: spruch ? spruch.icon : '🤝'
    });
  }
  
  // Sortiere nach Priorität und nimm die besten 3-4
  kategorien.sort((a, b) => b.prioritaet - a.prioritaet);
  
  // WICHTIG: IMMER mindestens 3 Kategorien auswählen!
  const selectedKategorien = kategorien.slice(0, Math.min(4, kategorien.length));
  
  // Falls weniger als 3 Kategorien vorhanden, füge zusätzliche hinzu
  if (selectedKategorien.length < 3) {
    // Ergänze mit zusätzlichen kontextbezogenen Kategorien
    
    // Zeit-Kategorie hinzufügen wenn noch nicht vorhanden
    if (!selectedKategorien.find(k => k.kategorie === 'ZEIT') && enhancedData.durationSeconds) {
      const dauer = formatDuration(enhancedData.durationSeconds);
      selectedKategorien.push({
        kategorie: 'ZEIT',
        prioritaet: 100,
        spruchText: `Nach ${dauer} intensivem Jassen!`,
        emoji: '⏱️'
      });
    }
    
    // Spiele-Anzahl hinzufügen
    if (!selectedKategorien.find(k => k.kategorie === 'SPIELE') && enhancedData.gamesPlayed) {
      selectedKategorien.push({
        kategorie: 'SPIELE',
        prioritaet: 90,
        spruchText: `${enhancedData.gamesPlayed} Spiele wurden heute gespielt!`,
        emoji: '🃏'
      });
    }
    
    // Berg-Erwähnung (wenn vorhanden)
    if (!selectedKategorien.find(k => k.kategorie === 'BERG')) {
      const topBerge = eventAnalysis.topTeamErzielte.berg;
      const bottomBerge = eventAnalysis.bottomTeamErzielte.berg;
      const bergDiff = Math.abs(topBerge - bottomBerge);
      
      if (bergDiff > 0) {
        const bergTeam = topBerge > bottomBerge ? topTeamDisplay : bottomTeamDisplay;
        // KORRIGIERT: Zeige die tatsächliche Berg-Bilanz
        const bergText = formatZahlAlsWort(bergDiff, 'Berg', 'Berge');
        selectedKategorien.push({
          kategorie: 'BERG',
          prioritaet: 80,
          spruchText: `${bergTeam} holten ${bergText} mehr! Bilanz: ${Math.max(topBerge, bottomBerge)}:${Math.min(topBerge, bottomBerge)}`,
          emoji: '⛰️'
        });
      }
    }
    
    // Falls immer noch weniger als 3, füge allgemeine Session-Info hinzu
    if (selectedKategorien.length < 3) {
      selectedKategorien.push({
        kategorie: 'SESSION',
        prioritaet: 50,
        spruchText: `Eine ${isTopWinner ? 'klare' : 'spannende'} Angelegenheit heute!`,
        emoji: '🎯'
      });
    }
  }
  
  // Berechne Matsch-Total für Parameter
  const totalMatscheErzielt = eventAnalysis.topTeamErzielte.matsch + eventAnalysis.bottomTeamErzielte.matsch;
  
  // INTELLIGENTE DEDUPLICATION-FUNKTION mit EVENT-TYPE TRACKING
  function deduplicateTexts(texts: string[]): string[] {
    const unique: string[] = [];
    const seen = new Set<string>();
    const eventTypeCounts = new Map<string, number>();
    
    // Hilfsfunktion zur Event-Typ Erkennung
    const detectEventType = (text: string): string => {
      const lowerText = text.toLowerCase();
      
      if (lowerText.includes('matsch')) return 'matsch';
      if (lowerText.includes('schneider')) return 'schneider';
      if (lowerText.includes('kontermatsch')) return 'kontermatsch';
      if (lowerText.includes('berg')) return 'berg';
      if (lowerText.includes('weis')) return 'weis';
      if (lowerText.includes('stunde') || lowerText.includes('minute') || lowerText.includes('zeit')) return 'zeit';
      if (lowerText.includes('punkte') || lowerText.includes('striche')) return 'score';
      if (lowerText.includes('bilanz')) return 'bilanz';
      
      return 'generic';
    };
    
    for (const text of texts) {
      const cleanText = text.trim();
      if (!cleanText) continue;
      
      // 1. Exakte Duplikate vermeiden
      if (seen.has(cleanText)) continue;
      
      // 2. EVENT-TYPE BASIERTE LIMITIERUNG
      const eventType = detectEventType(cleanText);
      const currentCount = eventTypeCounts.get(eventType) || 0;
      
      // STRENGE REGEL: Max 1 Spruch pro Event-Typ (außer generic und score)
      if (eventType !== 'generic' && eventType !== 'score' && currentCount >= 1) {
        continue; // Skip weitere Sprüche des gleichen Typs
      }
      
      // 3. Ähnliche Inhalte erkennen und vermeiden
      let isDuplicate = false;
      for (const existingText of unique) {
        // Prüfe auf sehr ähnliche Texte (gleiche Kernaussage)
        if (areTextsSimilar(cleanText, existingText)) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        unique.push(cleanText);
        seen.add(cleanText);
        eventTypeCounts.set(eventType, currentCount + 1);
      }
    }
    
    return unique;
  }
  
  // Hilfsfunktion für Ähnlichkeitsprüfung
  function areTextsSimilar(text1: string, text2: string): boolean {
    // Normalisiere Texte für Vergleich
    const normalize = (text: string) => text.toLowerCase()
      .replace(/[^\w\s:]/g, '') // Entferne Sonderzeichen, behalte Zahlen und Doppelpunkte
      .replace(/\s+/g, ' ')     // Normalisiere Leerzeichen
      .trim();
    
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);
    
    // 1. Identische normalisierte Texte
    if (norm1 === norm2) return true;
    
    // 2. Einer enthält den anderen (mit mindestens 70% Überlappung)
    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    const longer = norm1.length >= norm2.length ? norm1 : norm2;
    
    if (shorter.length > 0 && longer.includes(shorter) && shorter.length / longer.length >= 0.7) {
      return true;
    }
    
    // 3. Spezifische Matsch-Erkennungen (alle Varianten)
    const matschKeywords = ['matsch', 'matsche', 'matschen'];
    const hasMatsch1 = matschKeywords.some(keyword => norm1.includes(keyword));
    const hasMatsch2 = matschKeywords.some(keyword => norm2.includes(keyword));
    
    if (hasMatsch1 && hasMatsch2) {
      // Beide reden über Matsche - prüfe ob gleiche Teams/Zahlen
      const extractNumbers = (text: string) => text.match(/\d+/g) || [];
      const nums1 = extractNumbers(norm1);
      const nums2 = extractNumbers(norm2);
      
      // Gleiche Zahlen in beiden Texten = wahrscheinlich Duplikat
      if (nums1.length > 0 && nums2.length > 0 && nums1.join(',') === nums2.join(',')) {
        return true;
      }
      
      // Gleiche Team-Namen in beiden Texten
      const teamNames = ['claudia', 'frank', 'marc', 'roger'];
      const teams1 = teamNames.filter(name => norm1.includes(name));
      const teams2 = teamNames.filter(name => norm2.includes(name));
      
      if (teams1.length > 0 && teams2.length > 0 && teams1.join(',') === teams2.join(',')) {
        return true;
      }
    }
    
    // 4. Spezifische Matsch-Sammel-Erkennungen
    if ((norm1.includes('sammeln') || norm1.includes('holen')) && 
        (norm2.includes('sammeln') || norm2.includes('holen'))) {
      const teamNames = ['claudia', 'frank', 'marc', 'roger'];
      const teams1 = teamNames.filter(name => norm1.includes(name));
      const teams2 = teamNames.filter(name => norm2.includes(name));
      
      if (teams1.length > 0 && teams2.length > 0 && teams1.join(',') === teams2.join(',')) {
        return true;
      }
    }
    
    // 5. Spezifische Jubiläums-Erkennungen - DEAKTIVIERT
    // Da Jubiläumssprüche deaktiviert sind, entfällt auch die Deduplication dafür
    /*
    if (norm1.includes('partie') && norm2.includes('partie')) {
      // Prüfe auf spezifische Jubiläums-Phrasen
      const jubiKeywords = ['gefeiert', 'jubiläum', 'silber', 'gold', 'jahrhundert'];
      const hasJubi1 = jubiKeywords.some(keyword => norm1.includes(keyword));
      const hasJubi2 = jubiKeywords.some(keyword => norm2.includes(keyword));
      
      if (hasJubi1 || hasJubi2) {
        return true;
      }
      
      // Prüfe auf gleiche Partien-Nummer
      const nums1 = norm1.match(/\d+/g) || [];
      const nums2 = norm2.match(/\d+/g) || [];
      
      if (nums1.length > 0 && nums2.length > 0 && nums1[0] === nums2[0]) {
        return true; // Gleiche Partie-Nummer = Duplikat
      }
    }
    */
    
    // 6. Spezifische Schneider-Erkennungen
    if (norm1.includes('schneider') && norm2.includes('schneider')) {
      return true;
    }
    
    // 7. Spezifische Kontermatsch-Erkennungen
    if (norm1.includes('kontermatsch') && norm2.includes('kontermatsch')) {
      return true;
    }
    
    // ERWEITERT: Prüfe auf "alle X Matsche" Formulierungen
    const alleMatschPattern = /alle \d+ matsche?/;
    if (alleMatschPattern.test(norm1) && alleMatschPattern.test(norm2)) {
      return true; // Beide sprechen über "alle X Matsche"
    }
    
    // VALIDIERT: Prüfe auf Matsch-Bilanzen
    const bilanzPattern = /\d+:\d+/;
    const bilanz1Match = norm1.match(bilanzPattern);
    const bilanz2Match = norm2.match(bilanzPattern);
    
    if (bilanz1Match && bilanz2Match && bilanz1Match[0] === bilanz2Match[0]) {
      return true; // Gleiche Bilanz erwähnt
    }
    
    // Gleiche Team-Namen in beiden Texten
    const teamNames = Object.values(playerNames).filter(Boolean).map(n => n.toLowerCase());
    const teams1 = teamNames.filter(name => norm1.includes(name));
    const teams2 = teamNames.filter(name => norm2.includes(name));
    
    if (teams1.length > 0 && teams2.length > 0 && 
        teams1.sort().join(',') === teams2.sort().join(',')) {
      // Prüfe ob es um die gleiche Aussage geht
      const sammelnPattern = /(sammeln|holen|machen|servieren)/;
      if (sammelnPattern.test(norm1) && sammelnPattern.test(norm2)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Helper-Funktion für Parameter-Erstellung (nach oben verlagert)
  function createJassSpruchParams(): JassSpruchParams {
    return {
      winnerNames: winnerNames.filter(Boolean),
      loserNames: loserNames.filter(Boolean),
      isUnentschieden,
      isStricheMode: true,
      type: 'jassEnd',
      isSchneider: false,
      stricheDifference: diff,
      pointDifference: diff,
      timerAnalytics: {
        totalJassTime: (enhancedData.durationSeconds || 0) * 1000,
        currentGameDuration: 0
      },
      matchCount: {
        team1: enhancedData.gameWinsByTeam?.bottom || 0,
        team2: enhancedData.gameWinsByTeam?.top || 0
      },
      gameStats: {
        currentGameNumber: games.length,
        totalGames: games.length,
        isComeback: narrativeAnalysis.pattern?.type === 'comeback',
        führungsWechsel: narrativeAnalysis.momentum.filter(m => m.isSwing).length > 0,
        höchsterVorsprung: {
          team: isTopWinner ? 'team2' : 'team1',
          differenz: diff
        }
      },
      gesamtStand: {
        team1: bottomTotal,
        team2: topTotal
      },
      previousGesamtStand: {
        team1: 0,
        team2: 0
      },
      totalMatsche: totalMatscheErzielt
    };
  }
  
  // Spruch-Komponenten sammeln
  const komponenten: SpruchKomponenten = {
    hauptspruch: '',
    emoji: '🎯'
  };
  
  // === NEUE MULTI-KATEGORIE KOMPOSITION ===
  const endergebnis = isUnentschieden ? `${topTotal}:${bottomTotal}` : (isTopWinner ? `${topTotal}:${bottomTotal}!` : `${bottomTotal}:${topTotal}!`);
  const winnerTeam = isTopWinner ? topTeamDisplay : bottomTeamDisplay;
  const loserTeam = isTopWinner ? bottomTeamDisplay : topTeamDisplay;
  
  // Prüfe auf Comeback/Collapse für Narrativ-Überschreibung
  const isComeback = narrativeAnalysis.pattern && narrativeAnalysis.pattern.type === 'comeback';
  const isCollapse = narrativeAnalysis.pattern && narrativeAnalysis.pattern.type === 'collapse';
  
  // Bei extrem dramatischen Narrativen: Überschreibe alles
  if ((isComeback || isCollapse) && narrativeAnalysis.pattern && narrativeAnalysis.pattern.intensity >= 9) {
    if (isComeback) {
      komponenten.hauptspruch = `${endergebnis} SENSATIONELLES COMEBACK! ${winnerTeam} drehen das Spiel komplett!`;
      komponenten.narrativ = narrativeAnalysis.pattern.details || narrativeAnalysis.pattern.description;
    } else {
      komponenten.hauptspruch = `${endergebnis} BITTERE NIEDERLAGE! ${loserTeam} verspielen ${narrativeAnalysis.pattern.description}`;
      komponenten.narrativ = narrativeAnalysis.pattern.details || '';
    }
    komponenten.emoji = isComeback ? '🔥' : '😱';
    
    if (narrativeAnalysis.pattern.details) {
      komponenten.specialEvents = [narrativeAnalysis.pattern.details];
    }
  } else {
    // NEUE MULTI-KATEGORIE KOMPOSITION
    if (selectedKategorien.length === 0) {
      // Fallback
      komponenten.hauptspruch = `${endergebnis} Ein Jass ist zu Ende!`;
      komponenten.emoji = '🎯';
    } else {
      // Kombiniere die Top-Kategorien elegant
      const hauptKategorie = selectedKategorien[0];
      komponenten.emoji = hauptKategorie.emoji;
      
      // Hauptspruch: Endergebnis + dominante Kategorie
      if (hauptKategorie.kategorie === 'KONTERMATSCH' && selectedKategorien.length > 1) {
        // Bei Kontermatsch: kombiniere mit der nächsten Kategorie
        const zweitKategorie = selectedKategorien[1];
        if (zweitKategorie.kategorie === 'SCHNEIDER') {
          komponenten.hauptspruch = `${endergebnis} KONTERMATSCH + SCHNEIDER! Historische Kombination - das passiert vielleicht einmal im Jahr!`;
        } else if (zweitKategorie.kategorie === 'VERNICHTEND') {
          komponenten.hauptspruch = `${endergebnis} VERNICHTENDER SIEG MIT KONTERMATSCH! ${winnerTeam} zeigen keine Gnade!`;
        } else {
          komponenten.hauptspruch = `${endergebnis} ${hauptKategorie.spruchText}`;
        }
      } else if (hauptKategorie.kategorie === 'SCHNEIDER' && selectedKategorien.length > 1) {
        // Bei Schneider: erwähne weitere Kategorien
        const zweitKategorie = selectedKategorien[1];
        if (zweitKategorie.kategorie === 'VERNICHTEND') {
          komponenten.hauptspruch = `${endergebnis} SCHNEIDER bei vernichtendem Sieg! ${hauptKategorie.spruchText}`;
        } else {
          komponenten.hauptspruch = `${endergebnis} ${hauptKategorie.spruchText}`;
        }
      } else if (hauptKategorie.kategorie === 'JUBILÄUM') {
        // JUBILÄUM DEAKTIVIERT - Fallback zu Standard-Behandlung
        komponenten.hauptspruch = `${endergebnis} ${hauptKategorie.spruchText}`;
      } else {
        // Standard: Endergebnis + Hauptspruch
        komponenten.hauptspruch = `${endergebnis} ${hauptKategorie.spruchText}`;
      }
      
             // Sammle alle Details mit Deduplication
       const allDetails: string[] = [];
       
       // 1. Kategorie-Details sammeln (AUSSER Jubiläums-Details - da deaktiviert)
       selectedKategorien.forEach(kat => {
         if (kat.details) {
           // Überspringe Jubiläums-Details (da Jubiläumssprüche deaktiviert)
           if (kat.kategorie === 'JUBILÄUM') {
             return; // Keine Jubiläums-Details hinzufügen
           }
           allDetails.push(...kat.details);
         }
       });
       
       // 2. Zusätzliche Kategorie-Sprüche (OHNE Jubiläum - da deaktiviert)
       if (selectedKategorien.length >= 2) {
         const weitereKategorien = selectedKategorien.slice(1, 3); // Max 2 weitere
         weitereKategorien.forEach(kat => {
           if (kat.kategorie !== 'KONTERMATSCH' && 
               kat.kategorie !== 'SCHNEIDER' && 
               kat.kategorie !== 'JUBILÄUM') { // JUBILÄUM deaktiviert!
             // Nur wenn nicht schon im Hauptspruch erwähnt
             allDetails.push(kat.spruchText);
           }
         });
       }
       
       // 3. INTELLIGENTE DEDUPLICATION
       komponenten.specialEvents = deduplicateTexts(allDetails);
    }
  }
  
  // 2. NARRATIV-ERWEITERUNGEN hinzufügen
  let narrativPrefix = '';
  let narrativSuffix = '';
  
  // 🚨 FIX: Nur bei Standard-Sprüchen Narrativ-Erweiterungen anwenden
  // Bei bereits vollständig formulierten Comeback/Collapse-Sprüchen NICHT nochmal erweitern!
  const hasFullyFormulatedNarrative = isComeback || isCollapse || 
    (narrativeAnalysis.pattern && ['thriller', 'dominance', 'streak'].includes(narrativeAnalysis.pattern.type));
  
  if (narrativeAnalysis.pattern && !hasFullyFormulatedNarrative) {
    switch (narrativeAnalysis.pattern.type) {
      case 'collapse':
        // Verspielte Führung - sehr dramatisch!
        narrativPrefix = `BITTERE NIEDERLAGE! `;
        narrativSuffix = ` ${narrativeAnalysis.pattern.description} ${narrativeAnalysis.pattern.details || ''}`;
        komponenten.emoji = '😱'; // Überschreibe Emoji für maximale Dramatik
        break;
        
      case 'comeback':
        // Aufholjagd - ebenfalls sehr dramatisch!
        if (narrativeAnalysis.pattern.intensity >= 8) {
          narrativPrefix = `SENSATIONELLES COMEBACK! `;
          komponenten.emoji = '🔥';
        }
        narrativSuffix = ` ${narrativeAnalysis.pattern.description}`;
        break;
        
      case 'streak':
        // Siegesserie
        if (narrativeAnalysis.pattern.intensity >= 7) {
          narrativPrefix = `UNAUFHALTSAM! `;
          komponenten.emoji = '🚀';
        }
        narrativSuffix = ` ${narrativeAnalysis.pattern.description}`;
        break;
        
      case 'thriller':
        narrativSuffix = ` ${narrativeAnalysis.pattern.description}`;
        break;
        
      case 'backAndForth':
        narrativSuffix = ` ${narrativeAnalysis.pattern.description}`;
        break;
        
      case 'dominance':
        // Bei Dominanz passt der normale Spruch schon gut
        narrativSuffix = ` ${narrativeAnalysis.pattern.description}`;
        break;
        
      case 'blitzstart':
        narrativSuffix = ` ${narrativeAnalysis.pattern.description}`;
        break;
        
      case 'boring':
        narrativSuffix = ` Solides Spiel ohne grosse Höhepunkte.`;
        break;
    }
  }
  
  // 3. FINALER HAUPTSPRUCH ZUSAMMENSETZEN
  komponenten.hauptspruch = narrativPrefix + komponenten.hauptspruch + narrativSuffix;
  
  // 4. SCORE-PREFIX bei Striche-Jassen - IMMER das Endergebnis voranstellen!
  if (useStriche) {
    const scorePrefix = isTopWinner ? `${topTotal}:${bottomTotal}!` : `${bottomTotal}:${topTotal}!`;
    // Nur hinzufügen wenn nicht schon im Hauptspruch enthalten
    if (!komponenten.hauptspruch.startsWith(scorePrefix)) {
      komponenten.hauptspruch = `${scorePrefix} ${komponenten.hauptspruch}`;
    }
  }
  
  // 5. NARRATIV als separate Komponente (nur bei weniger dramatischen)
  if (narrativeAnalysis.pattern && !narrativPrefix && !narrativSuffix) {
    // Bei weniger dramatischen Verläufen als zusätzliche Info
    if (!komponenten.narrativ) {
      // Narrativ wurde noch nicht im Hauptspruch verwendet
      if (narrativeAnalysis.pattern.type === 'thriller') {
        komponenten.narrativ = `${narrativeAnalysis.dramaSummary} Bis zum letzten Spiel blieb es spannend!`;
      } else if (narrativeAnalysis.pattern.type === 'backAndForth') {
        komponenten.narrativ = narrativeAnalysis.dramaSummary;
      } else if (narrativeAnalysis.pattern.type === 'dominance') {
        komponenten.narrativ = `${narrativeAnalysis.dramaSummary} Eine klare Angelegenheit.`;
      } else if (narrativeAnalysis.pattern.type === 'blitzstart') {
        komponenten.narrativ = narrativeAnalysis.dramaSummary;
      } else if (narrativeAnalysis.pattern.type === 'boring') {
        komponenten.narrativ = `${narrativeAnalysis.dramaSummary} Aber Hauptsache gesellig!`;
      } else {
        komponenten.narrativ = narrativeAnalysis.dramaSummary;
      }
    }
  }
  
  // Matsch-Total bereits oben berechnet
  
  // Bei langweiligen Spielen ohne besondere Events
  if (!narrativeAnalysis.pattern && totalMatscheErzielt === 0 && 
      eventAnalysis.topTeamErzielte.schneider === 0 && eventAnalysis.bottomTeamErzielte.schneider === 0) {
    komponenten.narrativ = `Solides Spiel ohne spektakuläre Momente. ${enhancedData.gamesPlayed || games.length} Spiele ehrliches Jassen.`;
  }
  
  // === MATSCH-DETAILS ENTFERNT ===
  // Die Matsch-Information wird bereits im Hauptspruch oder in den Special Events erwähnt.
  // Um Redundanz und falsche Aussagen zu vermeiden, wurde dieser Abschnitt entfernt.
  // Matsch-Sprüche erscheinen weiterhin in den kategorie-basierten Hauptsprüchen.
  
  // 4. ZEIT-DETAILS mit strukturierten Sprüchen
  if (enhancedData.durationSeconds && enhancedData.durationSeconds > 0) {
    const kategorie = getSpieltempoKategorie(enhancedData.durationSeconds);
    const zeitSprueche = jassEndZeitSprueche[kategorie];
    
    if (zeitSprueche.length > 0) {
      const generator = zeitSprueche[Math.floor(Math.random() * zeitSprueche.length)];
      const zeitParams: JassSpruchParams = {
        winnerNames: winnerNames.filter(Boolean),
        loserNames: loserNames.filter(Boolean),
        isUnentschieden,
        isStricheMode: true,
        type: 'jassEnd',
        isSchneider: false,
        stricheDifference: diff,
        pointDifference: diff,
        timerAnalytics: {
          totalJassTime: enhancedData.durationSeconds * 1000,
          currentGameDuration: 0
        },
        matchCount: {
          team1: enhancedData.gameWinsByTeam?.bottom || 0,
          team2: enhancedData.gameWinsByTeam?.top || 0
        },
        gameStats: {
          currentGameNumber: games.length,
          totalGames: games.length,
          isComeback: narrativeAnalysis.pattern?.type === 'comeback',
          führungsWechsel: narrativeAnalysis.momentum.filter(m => m.isSwing).length > 0,
          höchsterVorsprung: {
            team: isTopWinner ? 'team2' : 'team1',
            differenz: diff
          }
        },
        gesamtStand: {
          team1: bottomTotal,
          team2: topTotal
        },
        previousGesamtStand: {
          team1: 0,
          team2: 0
        },
        totalMatsche: totalMatscheErzielt
      };
      
      const zeitSpruch = generator(zeitParams);
      if (zeitSpruch) {
        komponenten.zeitDetails = zeitSpruch.text;
      }
    } else {
      // Fallback für den Fall, dass keine Sprüche in der Kategorie vorhanden sind
      komponenten.zeitDetails = `Nach ${formatDuration(enhancedData.durationSeconds)} intensivem Jassen!`;
    }
  }
  
  // VORAB: Generiere erweiterte Gruppen-Kontext-Sprüche für Event-Type-Tracking
  const groupContextAnalysis = generateGroupContextSprueche(
    enhancedData, 
    eventAnalysis, 
    winnerNames, 
    loserNames, 
    isTopWinner, 
    useStriche, 
    diff
  );
  
  // EVENT-TYPE-TRACKING für weitere Verwendung
  const usedEventTypes = groupContextAnalysis.usedEventTypes || new Set<string>();
  
  // 3. SPEZIAL-EVENTS
  komponenten.specialEvents = [];
  
  // Bei extremen Ergebnissen mehr Drama hinzufügen
  if (useStriche && diff >= 14) {
    komponenten.specialEvents.push(`🚨 ACHTUNG: ${diff} Striche Differenz - das gab's noch nie! 🚨`);
  }
  
  // Matsch-Details in Special Events
  if (totalMatscheErzielt > 0) {
    const topMatsche = eventAnalysis.topTeamErzielte.matsch;
    const bottomMatsche = eventAnalysis.bottomTeamErzielte.matsch;
    
    // VALIDIERTE SPECIAL EVENTS für Matsche
    if (useStriche && diff >= 10) {
      if (topMatsche > 0 && bottomMatsche === 0) {
        // KORREKT: Ein Team hat ALLE Matsche
        const matschText = topMatsche === 1 ? 'den einzigen Matsch' : `alle ${topMatsche} Matsche`;
        komponenten.specialEvents.push(`${topTeamDisplay} servieren ${matschText} - ${bottomTeamDisplay} gehen leer aus!`);
      } else if (bottomMatsche > 0 && topMatsche === 0) {
        // KORREKT: Ein Team hat ALLE Matsche
        const matschText = bottomMatsche === 1 ? 'den einzigen Matsch' : `alle ${bottomMatsche} Matsche`;
        komponenten.specialEvents.push(`${bottomTeamDisplay} holen ${matschText} - ${topTeamDisplay} schauen in die Röhre!`);
      } else if (totalMatscheErzielt >= 4) {
        // KORREKT: Viele Matsche mit genauer Bilanz
        komponenten.specialEvents.push(`MATSCH-FESTIVAL! ${totalMatscheErzielt} Matsche verteilt (${topMatsche}:${bottomMatsche}) - ein wilder Ritt!`);
      } else if (topMatsche > bottomMatsche) {
        // KORREKT: Ein Team hat mehr (aber nicht alle)
        komponenten.specialEvents.push(`${topTeamDisplay} dominieren mit ${topMatsche} von ${totalMatscheErzielt} Matschen (${topMatsche}:${bottomMatsche})!`);
      } else if (bottomMatsche > topMatsche) {
        // KORREKT: Ein Team hat mehr (aber nicht alle)
        komponenten.specialEvents.push(`${bottomTeamDisplay} sichern sich ${bottomMatsche} von ${totalMatscheErzielt} Matschen (${bottomMatsche}:${topMatsche})!`);
      }
    }
    // Bei Standard-Matschen: NUR erwähnen wenn besonders interessant
    else if (totalMatscheErzielt >= 3) {
      if (topMatsche > 0 && bottomMatsche === 0) {
        // KORREKT: Alle Matsche für ein Team
        const matschText = formatZahlAlsWort(topMatsche, 'Matsch', 'Matsche');
        komponenten.specialEvents.push(`${topTeamDisplay} sammeln ${topMatsche === totalMatscheErzielt ? 'alle' : ''} ${matschText} - ${bottomTeamDisplay} bleiben matschfrei!`);
      } else if (bottomMatsche > 0 && topMatsche === 0) {
        // KORREKT: Alle Matsche für ein Team
        const matschText = formatZahlAlsWort(bottomMatsche, 'Matsch', 'Matsche');
        komponenten.specialEvents.push(`${bottomTeamDisplay} holen ${bottomMatsche === totalMatscheErzielt ? 'alle' : ''} ${matschText} - ${topTeamDisplay} mit leeren Händen!`);
      } else if (Math.abs(topMatsche - bottomMatsche) >= 3) {
        // KORREKT: Deutlicher Unterschied mit Bilanz
        const führendesTeam = topMatsche > bottomMatsche ? topTeamDisplay : bottomTeamDisplay;
        komponenten.specialEvents.push(`${führendesTeam} klar vorne beim Matsch-Sammeln! Bilanz: ${Math.max(topMatsche, bottomMatsche)}:${Math.min(topMatsche, bottomMatsche)}`);
      } else if (totalMatscheErzielt >= 5 && !usedEventTypes.has('matsch')) {
        // KORREKT: Viele Matsche insgesamt - NUR wenn noch kein Matsch-Spruch vorhanden
        // VIELFÄLTIGE Matsch-Party Sprüche
        const matschPartyVarianten = [
          `Matsch-Party! ${totalMatscheErzielt} Matsche insgesamt (${topMatsche}:${bottomMatsche}) - das war ein wildes Fest!`,
          `MATSCH-FESTIVAL! ${totalMatscheErzielt} Matsche verteilt (${topMatsche}:${bottomMatsche}) - ein denkwürdiger Abend!`,
          `${totalMatscheErzielt} Matsche heute (${topMatsche}:${bottomMatsche}) - das gibt's nicht alle Tage!`,
          `Matsch-Wahnsinn! ${totalMatscheErzielt}x wurde heute gematschelt (${topMatsche}:${bottomMatsche})!`,
          `${totalMatscheErzielt} Matsche im Protokoll (${topMatsche}:${bottomMatsche}) - was für eine Session!`,
          `Rekordverdächtig! ${totalMatscheErzielt} Matsche gezählt (${topMatsche}:${bottomMatsche})!`,
          `${totalMatscheErzielt} Matsche auf dem Konto (${topMatsche}:${bottomMatsche}) - intensives Jassen!`,
          `Matsch-Marathon mit ${totalMatscheErzielt} Einträgen (${topMatsche}:${bottomMatsche})!`
        ];
        komponenten.specialEvents.push(matschPartyVarianten[Math.floor(Math.random() * matschPartyVarianten.length)]);
      }
    }
  }
  
  // Kontermatsch (sehr selten und DRAMATISCH, daher immer erwähnen)
  // ABER: Nur wenn noch nicht im Hauptspruch integriert!
  const hasKontermatchInHauptspruch = komponenten.hauptspruch.includes("KONTERMATSCH") || komponenten.hauptspruch.includes("Kontermatsch");
  
  if (!hasKontermatchInHauptspruch) {
    if (eventAnalysis.topTeamErzielte.kontermatsch > 0) {
      const kontermatschText = eventAnalysis.topTeamErzielte.kontermatsch === 1 ? 
        'einen Kontermatsch' : `${eventAnalysis.topTeamErzielte.kontermatsch} Kontermatsche`;
      komponenten.specialEvents.push(`${topTeamDisplay} machen ${kontermatschText} - was für eine Demütigung!`);
    }
    if (eventAnalysis.bottomTeamErzielte.kontermatsch > 0) {
      const kontermatschText = eventAnalysis.bottomTeamErzielte.kontermatsch === 1 ? 
        'einen Kontermatsch' : `${eventAnalysis.bottomTeamErzielte.kontermatsch} Kontermatsche`;
      komponenten.specialEvents.push(`${bottomTeamDisplay} machen ${kontermatschText} - absolut brutal!`);
    }
  }
  
  // Berg (nur noch 10% Chance - sehr niedrige Priorität!)
  if (Math.random() < 0.1) {
    const topBerge = eventAnalysis.topTeamErzielte.berg;
    const bottomBerge = eventAnalysis.bottomTeamErzielte.berg;
    const bergDiff = Math.abs(topBerge - bottomBerge);
    
    if (topBerge > bottomBerge && bergDiff > 0) {
      // KORRIGIERT: Zeige die tatsächliche Berg-Bilanz
      const bergText = formatZahlAlsWort(bergDiff, 'Berg', 'Berge');
      komponenten.specialEvents.push(`${topTeamDisplay} sind Bergkönige! ${bergText} mehr gemacht (${topBerge}:${bottomBerge})!`);
    } else if (bottomBerge > topBerge && bergDiff > 0) {
      // KORRIGIERT: Zeige die tatsächliche Berg-Bilanz
      const bergText = formatZahlAlsWort(bergDiff, 'Berg', 'Berge');
      komponenten.specialEvents.push(`${bottomTeamDisplay} dominieren die Berge! ${bergText} mehr gemacht (${bottomBerge}:${topBerge})!`);
    }
  }
  
  // 6. GRUPPEN-CONTEXT - ENTFERNT, da Jubiläumssprüche deaktiviert sind
  // (groupContextAnalysis bereits früher generiert für Event-Type-Tracking)
  
  // Wähle die interessantesten Kontext-Sprüche aus
  const allContexts: string[] = [];
  
  // Spieler-Kontexte (max 1-2)
  groupContextAnalysis.playerContexts.forEach((contexts, playerName) => {
    if (contexts.length > 0 && allContexts.length < 2) {
      allContexts.push(contexts[0]); // Nimm den ersten/wichtigsten
    }
  });
  
  // Team-Kontext (max 1)
  if (groupContextAnalysis.teamContexts.length > 0 && allContexts.length < 3) {
    allContexts.push(groupContextAnalysis.teamContexts[0]);
  }
  
  // Session-Kontext (max 1)
  if (groupContextAnalysis.sessionContext.length > 0 && allContexts.length < 3) {
    allContexts.push(groupContextAnalysis.sessionContext[0]);
  }
  
  // Füge ausgewählte Kontexte zu specialEvents hinzu
  if (allContexts.length > 0) {
    komponenten.specialEvents = komponenten.specialEvents || [];
    // Formatiere Kontexte als Bullet Points
    allContexts.forEach(context => {
      komponenten.specialEvents!.push(`• ${context}`);
    });
  }
  
  // === MARC'S SPEZIAL-SPRÜCHE - DEBUG VERSION ===
  if (process.env.NODE_ENV === 'development') {
    console.log('[JassSpruch] Marc Debug Check:', {
      playerNames: playerNames,
      marcFoundAt: Object.keys(playerNames).find(key => playerNames[key] === 'Marc'),
      isTopWinner: isTopWinner,
      diff: diff,
      eventCounts: enhancedData.eventCounts
    });
  }
  
  // === FINALER VALIDIERUNGS-CHECK ===
  // Bevor wir den Spruch zurückgeben, validieren wir ihn nochmal
  const finalSpruch = komponiereReichhaltigerSpruch(komponenten);
  
  // VALIDATION: Prüfe ob der Spruch falsche Aussagen enthält
  const validatedSpruch = validateAndCorrectSpruch(finalSpruch, {
    eventAnalysis,
    playerNames,
    isTopWinner,
    topTotal,
    bottomTotal,
    useStriche,
    totalMatscheErzielt,
    groupStats: enhancedData.groupStats,
    gamesPlayed: enhancedData.gamesPlayed,
    winnerNames,
    loserNames
  });
  
  // NEXT-LEVEL ENHANCEMENT: Intelligente Zusatz-Sprüche ohne Redundanz
  const enhancedSpruch = enhanceWithNextLevelSprueche(
    validatedSpruch, 
    enhancedData
  );
  
  // === MARC'S SPEZIAL-SPRÜCHE - ALLEREINFACHSTE LÖSUNG ===
  // Einfach am Ende anhängen - kann NICHT fehlschlagen!
  let finalText = enhancedSpruch.text;
  
  // Prüfe ob Marc im Spiel ist (Namen-Check)
  const marcImSpiel = Object.values(playerNames).includes('Marc');
  
  if (marcImSpiel) {
    // Finde Marc's Position
    let marcPosition = 0;
    for (let i = 1; i <= 4; i++) {
      if (playerNames[i] === 'Marc') {
        marcPosition = i;
        break;
      }
    }
    
    if (marcPosition > 0) {
      const marcIsInTopTeam = marcPosition === 2 || marcPosition === 4;
      
      // Verlust-Spruch: Marc verliert mit ≥5 Strichen
      const marcVerliert = (marcIsInTopTeam && !isTopWinner && diff >= 5) || 
                          (!marcIsInTopTeam && isTopWinner && diff >= 5);
      
      // Gewinn-Spruch: Marc gewinnt mit ≥5 Strichen UND ≥2 Matsche
      const marcGewinnt = (marcIsInTopTeam && isTopWinner && diff >= 5) || 
                         (!marcIsInTopTeam && !isTopWinner && diff >= 5);
      
      let marcMatschAnzahl = 0;
      if (enhancedData.eventCounts) {
        marcMatschAnzahl = marcIsInTopTeam ? 
          (enhancedData.eventCounts.top.matsch || 0) : 
          (enhancedData.eventCounts.bottom.matsch || 0);
      }
      
      if (marcVerliert) {
        finalText += " • Marcs Augen wurden magnetisch: Sie starren jetzt noch aufs Handy.";
      } else if (marcGewinnt && marcMatschAnzahl >= 2) {
        const mischelAnzahl = Math.floor(Math.random() * 21) + 30; // 30-50
        finalText += ` • Marc kam nach seinen Matschen ins totale Schwelgen: ${mischelAnzahl} x gemischelt!!!`;
      }
    }
  }
  
  const finalResult = {
    text: finalText,
    icon: enhancedSpruch.icon
  };
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[JassSpruch] Final spruch generated:', finalResult);
  }
  
  return finalResult;
}

// NEUE VALIDIERUNGSFUNKTION
function validateAndCorrectSpruch(
  spruch: SpruchMitIcon, 
  context: {
    eventAnalysis: SessionEventAnalysis;
    playerNames: PlayerNames;
    isTopWinner: boolean;
    topTotal: number;
    bottomTotal: number;
    useStriche: boolean;
    totalMatscheErzielt: number;
    groupStats?: EnhancedGameData['groupStats'];
    gamesPlayed?: number;
    winnerNames?: string[];
    loserNames?: string[];
  }
): SpruchMitIcon {
  let text = spruch.text;
  
  // VALIDATION 1: "alle X Matsche" nur wenn wirklich alle von einem Team
  const alleMatschPattern = /alle (\d+) Matsche?/gi;
  const matches = Array.from(text.matchAll(alleMatschPattern));
  
  for (const match of matches) {
    const anzahl = parseInt(match[1]);
    
    // Prüfe ob wirklich ein Team alle Matsche hat
    const topMatsche = context.eventAnalysis.topTeamErzielte.matsch;
    const bottomMatsche = context.eventAnalysis.bottomTeamErzielte.matsch;
    
    if (anzahl === context.totalMatscheErzielt) {
      // Prüfe ob ein Team wirklich ALLE hat
      if (topMatsche === anzahl && bottomMatsche === 0) {
        // Korrekt: Top Team hat alle
        if (process.env.NODE_ENV === 'development') {
          console.log('[JassSpruch] Validation: "alle X Matsche" is correct - top team has all');
        }
      } else if (bottomMatsche === anzahl && topMatsche === 0) {
        // Korrekt: Bottom Team hat alle
        if (process.env.NODE_ENV === 'development') {
          console.log('[JassSpruch] Validation: "alle X Matsche" is correct - bottom team has all');
        }
      } else {
        // FALSCH: Korrigiere
        if (process.env.NODE_ENV === 'development') {
          console.warn('[JassSpruch] Validation: Correcting false "alle X Matsche" statement');
        }
        const actualBilanz = `${Math.max(topMatsche, bottomMatsche)} von ${anzahl} Matschen (${topMatsche}:${bottomMatsche})`;
        text = text.replace(match[0], actualBilanz);
      }
    }
  }
  
  // VALIDATION 2: Endergebnis-Check
  const endergebnisPattern = /(\d+):(\d+)!/g;
  const endergebnisMatches = Array.from(text.matchAll(endergebnisPattern));
  
  for (const match of endergebnisMatches) {
    const score1 = parseInt(match[1]);
    const score2 = parseInt(match[2]);
    
    // Prüfe ob die Scores korrekt sind
    const expectedTopScore = context.topTotal;
    const expectedBottomScore = context.bottomTotal;
    
    if ((score1 === expectedTopScore && score2 === expectedBottomScore) ||
        (score1 === expectedBottomScore && score2 === expectedTopScore)) {
      // Korrekt
      if (process.env.NODE_ENV === 'development') {
        console.log('[JassSpruch] Validation: Score is correct');
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[JassSpruch] Validation: Correcting wrong score - expected ${expectedTopScore}:${expectedBottomScore}, found ${score1}:${score2}`);
      }
      // Korrigiere auf das richtige Endergebnis
      const correctScore = context.isTopWinner ? 
        `${expectedTopScore}:${expectedBottomScore}!` : 
        `${expectedBottomScore}:${expectedTopScore}!`;
      text = text.replace(match[0], correctScore);
    }
  }
  
  // VALIDATION 3: Matsch-Zahlen bei Team-Erwähnungen
  const matschZahlenPattern = /(sammeln|holen|machen|servieren) (\d+) (von \d+)? ?Matsche?/gi;
  const matschMatches = Array.from(text.matchAll(matschZahlenPattern));
  
  for (const match of matschMatches) {
    const erwähnte_anzahl = parseInt(match[2]);
    const topMatsche = context.eventAnalysis.topTeamErzielte.matsch;
    const bottomMatsche = context.eventAnalysis.bottomTeamErzielte.matsch;
    
    // Prüfe welches Team erwähnt wird (schaue 50 Zeichen vor dem Match)
    const matchIndex = match.index || 0;
    const textVorher = text.substring(Math.max(0, matchIndex - 50), matchIndex);
    
    // Prüfe Team-Namen
    const erwähntTopTeam = textVorher.includes(context.playerNames[2]) || textVorher.includes(context.playerNames[4]);
    const erwähntBottomTeam = textVorher.includes(context.playerNames[1]) || textVorher.includes(context.playerNames[3]);
    
    if (erwähntTopTeam && erwähnte_anzahl !== topMatsche) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[JassSpruch] Validation: Correcting wrong matsch count for top team - expected ${topMatsche}, found ${erwähnte_anzahl}`);
      }
      text = text.replace(match[2], topMatsche.toString());
    } else if (erwähntBottomTeam && erwähnte_anzahl !== bottomMatsche) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[JassSpruch] Validation: Correcting wrong matsch count for bottom team - expected ${bottomMatsche}, found ${erwähnte_anzahl}`);
      }
      text = text.replace(match[2], bottomMatsche.toString());
    }
  }
  
  // === NEUE VALIDIERUNGEN FÜR GROUP-COMPUTED-STATS ===
  if (context.groupStats) {
    
    // VALIDATION 4: Win-Rate Aussagen validieren
    const winRatePattern = /(\d+)% Siegquote/gi;
    const winRateMatches = Array.from(text.matchAll(winRatePattern));
    
    for (const match of winRateMatches) {
      const erwähnte_winrate = parseInt(match[1]);
      const matchIndex = match.index || 0;
      const textVorher = text.substring(Math.max(0, matchIndex - 100), matchIndex);
      
      // Finde den erwähnten Spieler
      const allPlayers = [context.playerNames[1], context.playerNames[2], context.playerNames[3], context.playerNames[4]];
      const erwähnteSpieler = allPlayers.filter(name => name && textVorher.includes(name));
      
      if (erwähnteSpieler.length > 0 && context.groupStats.playerWithHighestWinRateGame) {
        const spielerName = erwähnteSpieler[0];
        const actualData = context.groupStats.playerWithHighestWinRateGame.find(p => p.playerName === spielerName);
        
        if (actualData) {
          const actualWinRate = Math.round(actualData.value * 100);
                     if (Math.abs(erwähnte_winrate - actualWinRate) > 5) { // Toleranz von 5%
             if (process.env.NODE_ENV === 'development') {
               console.warn(`[JassSpruch] Validation: Correcting wrong win rate for ${spielerName} - expected ${actualWinRate}%, found ${erwähnte_winrate}%`);
             }
             text = text.replace(match[0], `${actualWinRate}% Siegquote`);
           }
        }
      }
    }
    
    // VALIDATION 5: Marathon-Session Aussagen validieren
    const marathonPattern = /Marathon-Session mit (\d+) Spielen/gi;
    const marathonMatches = Array.from(text.matchAll(marathonPattern));
    
    for (const match of marathonMatches) {
      const erwähnte_spiele = parseInt(match[1]);
      const aktuelle_spiele = context.gamesPlayed || 0;
      
             if (erwähnte_spiele !== aktuelle_spiele) {
         if (process.env.NODE_ENV === 'development') {
           console.warn(`[JassSpruch] Validation: Correcting wrong games count - expected ${aktuelle_spiele}, found ${erwähnte_spiele}`);
         }
         text = text.replace(match[0], `Marathon-Session mit ${aktuelle_spiele} Spielen`);
       }
       
       // Prüfe ob es wirklich ein Marathon ist (2x mehr als normal)
       if (context.groupStats.avgGamesPerSession) {
         const isReallyMarathon = aktuelle_spiele >= context.groupStats.avgGamesPerSession * 2;
         if (!isReallyMarathon) {
           if (process.env.NODE_ENV === 'development') {
             console.warn(`[JassSpruch] Validation: Removing false marathon claim - ${aktuelle_spiele} games is not 2x avg (${context.groupStats.avgGamesPerSession})`);
           }
           text = text.replace(match[0], `Längere Session mit ${aktuelle_spiele} Spielen`);
         }
       }
    }
    
    // VALIDATION 6: "doppelt so viel wie üblich" Matsch-Aussagen validieren
    const doppeltMatschPattern = /(\d+) Matsche.*doppelt so viel wie üblich/gi;
    const doppeltMatches = Array.from(text.matchAll(doppeltMatschPattern));
    
    for (const match of doppeltMatches) {
      const erwähnte_matsche = parseInt(match[1]);
      const aktuelle_matsche = context.totalMatscheErzielt;
      
             if (erwähnte_matsche !== aktuelle_matsche) {
         if (process.env.NODE_ENV === 'development') {
           console.warn(`[JassSpruch] Validation: Correcting wrong matsch count - expected ${aktuelle_matsche}, found ${erwähnte_matsche}`);
         }
         text = text.replace(match[1], aktuelle_matsche.toString());
       }
       
       // Prüfe ob es wirklich doppelt so viel ist
       if (context.groupStats.avgMatschPerGame && context.gamesPlayed) {
         const expectedMatsche = Math.round(context.groupStats.avgMatschPerGame * context.gamesPlayed);
         const isReallyDouble = aktuelle_matsche >= expectedMatsche * 2;
         
         if (!isReallyDouble) {
           if (process.env.NODE_ENV === 'development') {
             console.warn(`[JassSpruch] Validation: Removing false "doppelt so viel" claim - ${aktuelle_matsche} is not 2x expected (${expectedMatsche})`);
           }
           text = text.replace('doppelt so viel wie üblich', 'überdurchschnittlich viel');
         }
       }
    }
    
    // VALIDATION 7: Historische Matsch-Bilanz Aussagen validieren
    const historischMatschPattern = /historischen ([+-]?\d+) Matsch-Bilanz/gi;
    const historischMatches = Array.from(text.matchAll(historischMatschPattern));
    
    for (const match of historischMatches) {
      const erwähnte_bilanz = parseInt(match[1]);
      const matchIndex = match.index || 0;
      const textVorher = text.substring(Math.max(0, matchIndex - 100), matchIndex);
      
      // Finde den erwähnten Spieler
      const allPlayers = [context.playerNames[1], context.playerNames[2], context.playerNames[3], context.playerNames[4]];
      const erwähnteSpieler = allPlayers.filter(name => name && textVorher.includes(name));
      
      if (erwähnteSpieler.length > 0 && context.groupStats.playerWithHighestMatschBilanz) {
        const spielerName = erwähnteSpieler[0];
        const actualData = context.groupStats.playerWithHighestMatschBilanz.find(p => p.playerName === spielerName);
        
                 if (actualData && actualData.value !== erwähnte_bilanz) {
           if (process.env.NODE_ENV === 'development') {
             console.warn(`[JassSpruch] Validation: Correcting wrong matsch bilanz for ${spielerName} - expected ${actualData.value}, found ${erwähnte_bilanz}`);
           }
           text = text.replace(match[1], actualData.value.toString());
         }
      }
    }
    
    // VALIDATION 8: Team-Dominanz Aussagen validieren
    const dominanzPattern = /\+(\d+) Striche Dominanz/gi;
    const dominanzMatches = Array.from(text.matchAll(dominanzPattern));
    
    for (const match of dominanzMatches) {
      const erwähnte_dominanz = parseInt(match[1]);
      const matchIndex = match.index || 0;
      const textVorher = text.substring(Math.max(0, matchIndex - 100), matchIndex);
      
      // Finde das erwähnte Team
      const topTeamMentioned = textVorher.includes(context.playerNames[2]) && textVorher.includes(context.playerNames[4]);
      const bottomTeamMentioned = textVorher.includes(context.playerNames[1]) && textVorher.includes(context.playerNames[3]);
      
      if ((topTeamMentioned || bottomTeamMentioned) && context.groupStats.teamWithHighestStricheDiff) {
        const teamKey = topTeamMentioned ? 
          [context.playerNames[2], context.playerNames[4]].sort().join('_') :
          [context.playerNames[1], context.playerNames[3]].sort().join('_');
        
        const actualData = context.groupStats.teamWithHighestStricheDiff.find(t => 
          t.names.sort().join('_') === teamKey
        );
        
                 if (actualData && Math.abs(actualData.value) !== erwähnte_dominanz) {
           if (process.env.NODE_ENV === 'development') {
             console.warn(`[JassSpruch] Validation: Correcting wrong striche dominanz - expected ${Math.abs(actualData.value)}, found ${erwähnte_dominanz}`);
           }
           text = text.replace(match[1], Math.abs(actualData.value).toString());
         }
      }
    }
    
    // VALIDATION 9: Punkte-Differenz "im Minus" Aussagen validieren
    const punkteDiffPattern = /(\d+) Punkte im Minus/gi;
    const punkteDiffMatches = Array.from(text.matchAll(punkteDiffPattern));
    
    for (const match of punkteDiffMatches) {
      const erwähnte_punkte = parseInt(match[1]);
      const matchIndex = match.index || 0;
      const textVorher = text.substring(Math.max(0, matchIndex - 100), matchIndex);
      
      // Finde den erwähnten Spieler
      const allPlayers = [context.playerNames[1], context.playerNames[2], context.playerNames[3], context.playerNames[4]];
      const erwähnteSpieler = allPlayers.filter(name => name && textVorher.includes(name));
      
      if (erwähnteSpieler.length > 0 && context.groupStats.playerWithHighestPointsDiff) {
        const spielerName = erwähnteSpieler[0];
        const actualData = context.groupStats.playerWithHighestPointsDiff.find(p => p.playerName === spielerName);
        
        if (actualData && actualData.value < 0) {
          const actualPunkte = Math.abs(actualData.value);
                     if (actualPunkte !== erwähnte_punkte) {
             if (process.env.NODE_ENV === 'development') {
               console.warn(`[JassSpruch] Validation: Correcting wrong points diff for ${spielerName} - expected ${actualPunkte}, found ${erwähnte_punkte}`);
             }
             text = text.replace(match[1], actualPunkte.toString());
           }
        }
      }
    }
  }
  
  return {
    text: text.trim(),
    icon: spruch.icon
  };
}

/**
 * Erweitert bestehende Sprüche mit intelligenten NextLevel-Kontexten ohne Redundanz
 */
function enhanceWithNextLevelSprueche(
  baseSpruch: SpruchMitIcon,
  enhancedData: EnhancedGameData
): SpruchMitIcon {
  // Nur erweitern wenn GroupStats verfügbar sind
  if (!enhancedData.groupStats) {
    return baseSpruch;
  }

  try {
    // === SESSION-CHARAKTERISTIKA BERECHNEN ===
    const sessionChar = calculateSessionCharacteristics(enhancedData);
    
    // Konvertiere enhancedData.groupStats zu vollständigem GroupComputedStats
    const mockGroupStats: GroupComputedStats = {
      // Erforderliche Basis-Felder (Mock-Werte für fehlende Daten)
      groupId: null,
      groupName: enhancedData.groupStats.groupName || null,
      lastUpdateTimestamp: null,
      memberCount: 4, // Annahme für Jass
      sessionCount: enhancedData.groupStats.sessionCount || 1,
      tournamentCount: 0,
      gameCount: enhancedData.groupStats.gameCount || enhancedData.gamesPlayed || 1,
      totalPlayTimeSeconds: enhancedData.durationSeconds || 0,
      avgSessionDurationSeconds: 0,
      avgGameDurationSeconds: 0,
      avgGamesPerSession: enhancedData.groupStats.avgGamesPerSession || 1,
      avgRoundsPerGame: 0,
      avgRoundDurationSeconds: 0,
      avgMatschPerGame: enhancedData.groupStats.avgMatschPerGame || 0,
      firstJassTimestamp: null,
      lastJassTimestamp: null,
      hauptspielortName: null,
      totalTrumpfCount: 0,
      trumpfStatistik: null,

      // Konvertiere die verfügbaren Statistiken mit korrektem Format
      playerWithHighestMatschBilanz: enhancedData.groupStats.playerWithHighestMatschBilanz?.map(p => ({
        playerId: 'unknown', // playerId ist nicht verfügbar
        playerName: p.playerName,
        value: p.value,
        eventsPlayed: p.eventsPlayed,
        displayValue: p.value.toString(),
        lastPlayedTimestamp: null,
        eventsMade: p.eventsMade,
        eventsReceived: p.eventsReceived
      })) || null,

      playerWithHighestSchneiderBilanz: enhancedData.groupStats.playerWithHighestSchneiderBilanz?.map(p => ({
        playerId: 'unknown',
        playerName: p.playerName,
        value: p.value,
        eventsPlayed: p.eventsPlayed,
        displayValue: p.value.toString(),
        lastPlayedTimestamp: null,
        eventsMade: p.eventsMade,
        eventsReceived: p.eventsReceived
      })) || null,

      playerWithHighestWinRateGame: enhancedData.groupStats.playerWithHighestWinRateGame?.map(p => ({
        playerId: 'unknown',
        playerName: p.playerName,
        value: p.value,
        eventsPlayed: p.eventsPlayed,
        displayValue: `${(p.value * 100).toFixed(1)}%`,
        lastPlayedTimestamp: null
      })) || null,

      playerWithFastestRounds: enhancedData.groupStats.playerWithFastestRounds?.map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        value: p.value,
        eventsPlayed: p.eventsPlayed,
        displayValue: p.displayValue,
        lastPlayedTimestamp: null
      })) || null,

      playerWithSlowestRounds: enhancedData.groupStats.playerWithSlowestRounds?.map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        value: p.value,
        eventsPlayed: p.eventsPlayed,
        displayValue: p.displayValue,
        lastPlayedTimestamp: null
      })) || null,

      playerWithMostGames: enhancedData.groupStats.playerWithMostGames?.map(p => ({
        playerId: 'unknown',
        playerName: p.playerName,
        value: p.value,
        eventsPlayed: p.value,
        displayValue: p.value.toString(),
        lastPlayedTimestamp: null
      })) || null,

      teamWithHighestWinRateGame: enhancedData.groupStats.teamWithHighestWinRateGame?.map(t => ({
        names: t.names,
        value: t.value,
        eventsPlayed: t.eventsPlayed
      })) || null,

      // Alle anderen Felder auf null setzen
      playerWithHighestStricheDiff: null,
      playerWithHighestPointsDiff: null,
      playerWithHighestWinRateSession: null,
      playerWithHighestKontermatschBilanz: null,
      playerWithMostWeisPointsAvg: null,
      playerAllRoundTimes: null,
      teamWithHighestWinRateSession: null,
      teamWithHighestPointsDiff: null,
      teamWithHighestStricheDiff: null,
      teamWithHighestMatschBilanz: null,
      teamWithHighestSchneiderBilanz: null,
      teamWithHighestKontermatschBilanz: null,
      teamWithMostWeisPointsAvg: null,
      teamWithFastestRounds: null
    };

    // === OPTIMIERTE EINSTELLUNGEN BASIEREND AUF SESSION-CHARAKTERISTIKA ===
    const settings = getOptimizedSettings(sessionChar, enhancedData);
    
    // Erstelle NextLevel-System mit optimierten Einstellungen
    const nextLevel = createNextLevelSprueche(
      mockGroupStats,
      enhancedData.playerNames,
      settings
    );

    // Extrahiere existierende Sprüche aus dem Basis-Spruch
    const existingSprueche = [baseSpruch.text];

    // Generiere intelligente Zusatz-Sprüche ohne Redundanz
    const result = nextLevel.generateEnhancedSprueche(existingSprueche);
    
    // Kombiniere nur wenn neue, nicht-redundante Sprüche verfügbar sind
    if (result.sprueche.length > 1) {
      const newContexts = result.sprueche.filter(spruch => spruch !== baseSpruch.text);
      
      if (newContexts.length > 0) {
        const enhancedText = baseSpruch.text + ' ' + newContexts.map(context => `• ${context}`).join(' ');
        
        if (process.env.NODE_ENV === 'development') {
          console.log('🎯 NextLevel enhanced with', newContexts.length, 'contexts');
          console.log('  Session characteristics:', sessionChar);
          console.log('  Optimized settings:', settings);
          console.log('  Redundancy removed:', result.metadata.redundancyRemoved);
          console.log('  Processing time:', result.metadata.processingTime, 'ms');
        }
        
        return {
          text: enhancedText,
          icon: baseSpruch.icon
        };
      }
    }

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('🚨 NextLevel enhancement failed:', error);
    }
  }

  // Fallback: Gib ursprünglichen Spruch zurück
  return baseSpruch;
}

// === NEUE HELPER-FUNKTIONEN ===

interface SessionCharacteristics {
  matschIntensity: number;      // 0-100 (wie matsch-reich?)
  schneiderActivity: number;    // 0-100 (wie viel Schneider?)
  speedVariance: number;        // 0-100 (wie auffällig die Geschwindigkeit?)
  competitiveness: number;      // 0-100 (wie knapp/überraschend?)
  dominance: number;           // 0-100 (wie dominant ein Team?)
}

function calculateSessionCharacteristics(enhancedData: EnhancedGameData): SessionCharacteristics {
  const totalMatsche = (enhancedData.eventCounts?.top.matsch || 0) + (enhancedData.eventCounts?.bottom.matsch || 0);
  const totalSchneider = (enhancedData.eventCounts?.top.schneider || 0) + (enhancedData.eventCounts?.bottom.schneider || 0);
  const avgMatsch = enhancedData.groupStats?.avgMatschPerGame || 0;
  const gamesPlayed = enhancedData.gamesPlayed || 1;
  const gameResults = enhancedData.gameResults || [];
  
  // Matsch-Intensität: Vergleich mit Durchschnitt
  const expectedMatsche = avgMatsch * gamesPlayed;
  const matschIntensity = Math.min(100, Math.max(0, 
    totalMatsche > 0 ? (totalMatsche / Math.max(expectedMatsche, 1)) * 50 : 0
  ));
  
  // Schneider-Aktivität: 1 Schneider = 40%, 2+ = 90%+
  const schneiderActivity = totalSchneider === 0 ? 0 :
    totalSchneider === 1 ? 40 :
    Math.min(100, 40 + (totalSchneider - 1) * 30);
  
  // Speed-Varianz: Basiert auf Runden-Zeitunterschiede
  const speedVariance = calculateSpeedVariance(enhancedData);
  
  // Competitiveness: Führungswechsel und knappe Spiele
  const competitiveness = calculateCompetitiveness(gameResults);
  
  // Dominance: Streuung der Siege
  const dominance = calculateDominance(gameResults);
  
  return {
    matschIntensity,
    schneiderActivity,
    speedVariance,
    competitiveness,
    dominance
  };
}

function calculateSpeedVariance(enhancedData: EnhancedGameData): number {
  if (!enhancedData.groupStats?.playerWithFastestRounds || !enhancedData.groupStats?.playerWithSlowestRounds) {
    return 0;
  }
  
  const fastest = enhancedData.groupStats.playerWithFastestRounds[0];
  const slowest = enhancedData.groupStats.playerWithSlowestRounds[0];
  
  if (!fastest || !slowest) return 0;
  
  // Verhältnis zwischen schnellster und langsamster Runde
  const ratio = slowest.value / fastest.value;
  
  // Ratio > 2 = hohe Varianz, Ratio > 1.5 = mittlere Varianz
  return Math.min(100, Math.max(0, (ratio - 1) * 50));
}

function calculateCompetitiveness(gameResults: Array<{ topScore: number; bottomScore: number; winnerTeam: string }>): number {
  if (!gameResults || gameResults.length === 0) return 0;
  
  let leadChanges = 0;
  let closeGames = 0;
  let previousLeader = '';
  
  for (const game of gameResults) {
    const currentLeader = game.winnerTeam;
    if (previousLeader && currentLeader !== previousLeader) {
      leadChanges++;
    }
    previousLeader = currentLeader;
    
    // Knappes Spiel wenn Differenz < 50 Punkte
    if (Math.abs(game.topScore - game.bottomScore) < 50) {
      closeGames++;
    }
  }
  
  const leadChangeScore = (leadChanges / Math.max(gameResults.length - 1, 1)) * 60;
  const closeGameScore = (closeGames / gameResults.length) * 40;
  
  return Math.min(100, leadChangeScore + closeGameScore);
}

function calculateDominance(gameResults: Array<{ topScore: number; bottomScore: number; winnerTeam: string }>): number {
  if (!gameResults || gameResults.length === 0) return 0;
  
  const topWins = gameResults.filter(g => g.winnerTeam === 'top').length;
  const bottomWins = gameResults.filter(g => g.winnerTeam === 'bottom').length;
  
  const dominanceRatio = Math.abs(topWins - bottomWins) / gameResults.length;
  
  return Math.min(100, dominanceRatio * 100);
}

function getOptimizedSettings(sessionChar: SessionCharacteristics, enhancedData: EnhancedGameData): any {
  // VERSCHÄRFTE Einstellungen für höhere Selectivität
  const isEventRich = sessionChar.matschIntensity >= 70 || sessionChar.schneiderActivity >= 65;
  const isBalanced = sessionChar.competitiveness >= 75 && sessionChar.dominance < 50;
  
  // Drastisch reduzierte Basis-Einstellungen
  const adaptiveConfig = {
    maxContexts: isEventRich ? 2 : 1,  // Reduziert von 4-6 auf 1-2
    minRelevance: isEventRich ? 75 : 80,  // Erhöht von 55-70 auf 75-80
    redundancyThreshold: 0.50,  // Reduziert von 0.65 auf 0.50
    enableContextSensitivity: true,
    enableAntiRepetition: true
  };
  
  // Verschärfte Dominanz-Behandlung
  if (sessionChar.dominance >= 85) {
    // Nur bei EXTREMER Dominanz weniger streng
    adaptiveConfig.maxContexts = Math.max(adaptiveConfig.maxContexts, 2);
    adaptiveConfig.minRelevance = Math.max(adaptiveConfig.minRelevance - 5, 75);
  }
  
  // Spezielle Schneider-Sensation-Behandlung (VERSCHÄRFT)
  const totalSchneider = (enhancedData.eventCounts?.top.schneider || 0) + (enhancedData.eventCounts?.bottom.schneider || 0);
  if (totalSchneider >= 2) {
    // SENSATION: 2+ Schneider = moderater Bonus (nicht übertrieben)
    adaptiveConfig.maxContexts = Math.max(adaptiveConfig.maxContexts, 2);
    adaptiveConfig.minRelevance = Math.max(adaptiveConfig.minRelevance - 10, 70);
  }
  
  return adaptiveConfig;
}

