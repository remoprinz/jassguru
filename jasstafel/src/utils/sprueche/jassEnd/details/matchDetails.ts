import type { SpruchMitIcon, JassSpruchBaseParams } from '../../../../types/jass';
import { useJassStore } from '../../../../store/jassStore';
import { useGameStore } from '../../../../store/gameStore';
import { aggregateStricheTotal } from '../../../stricheCalculations';

// Erweitern der Basis-Parameter um Match-spezifische Daten
interface MatchSpruchParams extends JassSpruchBaseParams {
  type: 'gameEnd' | 'jassEnd';
  winnerNames: string[];       // Wird vom aufrufenden Code befüllt, wenn man's braucht
  loserNames: string[];        // ""
  isUnentschieden: boolean;
  stricheDifference: number;   // topScore - bottomScore
  // > 0 => Team 2 (top) hat mehr Striche => Team 2 gewinnt
  // < 0 => Team 1 (bottom) hat mehr Striche => Team 1 gewinnt
  // = 0 => Unentschieden
}

// Hilfsfunktion für zufällige Spruchauswahl
function getRandomSpruch(sprueche: SpruchMitIcon[]): SpruchMitIcon {
  return sprueche[Math.floor(Math.random() * sprueche.length)];
}

export const matchDetailsSprueche = [
  (params: MatchSpruchParams): SpruchMitIcon => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();

    // Gesamt-Matsche beider Teams:
    const allGamesMatsche = aggregateStricheTotal(jassStore.games);
    // Team 1 = bottom (Spieler 1 & 3), Team 2 = top (Spieler 2 & 4)
    const gesamtMatsche = {
      team1: allGamesMatsche.bottom.matsch,
      team2: allGamesMatsche.top.matsch
    };

    // Sicherere Version mit Fallback
    const team1Names = [
      gameStore.playerNames[1] || 'Spieler 1', 
      gameStore.playerNames[3] || 'Spieler 3'
    ];
    const team2Names = [
      gameStore.playerNames[2] || 'Spieler 2', 
      gameStore.playerNames[4] || 'Spieler 4'
    ];

    const totalMatsche = gesamtMatsche.team1 + gesamtMatsche.team2;

    // Da stricheDifference = topScore - bottomScore:
    //  > 0 => top > bottom => Team 1 gewinnt
    //  < 0 => bottom > top => Team 2 gewinnt
    const { stricheDifference } = params;
    const bottomWonTheJass = stricheDifference > 0;   // Team 1 (bottom) hat mehr Striche
    const topWonTheJass    = stricheDifference < 0;   // Team 2 (top)    hat mehr Striche

    // Gesamt-Matsche:
    const matchDiff = gesamtMatsche.team1 - gesamtMatsche.team2;  // Positiv = Team 1 hat mehr Matsche

    // --- 1) Keine Matsche im ganzen Jass ---
    if (params.type === 'jassEnd' && totalMatsche === 0) {
      return getRandomSpruch([
        { text: "Keine Matsche in diesem Jass!", icon: "😴" },
        { text: "Ein matschloser Jass - aber spannend war's trotzdem!", icon: "🥱" },
        { text: "Heute waren keine Matsche drin!", icon: "😴" },
        { text: "Ein Jass ohne Matsche - auch das gibt's!", icon: "🥱" },
        { text: "Matschfrei gespielt - dafür mit viel Taktik!", icon: "😴" },
        { text: "Kein einziger Matsch heute - dafür viele schöne Stiche!", icon: "🥱" }
      ]);
    }

    // --- 2) Unentschieden (stricheDifference === 0) ---
    if (params.isUnentschieden) {
      // a) Genau 1 Matsch insgesamt
      if (totalMatsche === 1) {
        if (gesamtMatsche.team1 === 1) {
          // Einziger Matsch bei Team 1
          return {
            text: `${team1Names.join(' & ')} holten den einzigen Matsch in diesem unentschiedenen Jass!`,
            icon: '👆'
          };
        } else {
          // Einziger Matsch bei Team 2
          return {
            text: `${team2Names.join(' & ')} holten den einzigen Matsch in diesem unentschiedenen Jass!`,
            icon: '👆'
          };
        }
      }

      // b) Gleiche Matschanzahl
      if (gesamtMatsche.team1 === gesamtMatsche.team2) {
        const matchText =
          gesamtMatsche.team1 === 1
            ? 'je einen Matsch'
            : `je ${gesamtMatsche.team1} Matsche`;
        return {
          text: `Beide Teams haben ${matchText} gemacht - passend zum Unentschieden!`,
          icon: '🤝'
        };
      }

      // c) Unterschiedliche Matsch-Anzahl => trotzdem Unentschieden nach Strichen
      const führendesTeam =
        gesamtMatsche.team1 > gesamtMatsche.team2 ? team1Names : team2Names;
      const mehrMatsche = Math.max(gesamtMatsche.team1, gesamtMatsche.team2);
      const wenigerMatsche = Math.min(gesamtMatsche.team1, gesamtMatsche.team2);

      return {
        text: `${führendesTeam.join(' & ')} führten ${mehrMatsche}:${wenigerMatsche} bei den Matschen – am Ende trotzdem Unentschieden!`,
        icon: '🤝'
      };
    }

    // --- 3) Genau 1 Matsch im ganzen Jass (kein Unentschieden) ---
    if (params.type === 'jassEnd' && totalMatsche === 1) {
      const bottomHasSingleMatsch = gesamtMatsche.team1 === 1; // Team 1?

      if (bottomHasSingleMatsch) {
        // Einziger Matsch bei Team 1
        if (bottomWonTheJass) {
          // Team 1 hat auch den Jass gewonnen (stricheDifference > 0)
          if (Math.abs(stricheDifference) <= 20) {
            return getRandomSpruch([
              {
                text: `Ein Matsch, ein Sieg – perfekt gespielt von ${team1Names.join(' & ')}!`,
                icon: '😎'
              }
            ]);
          } else {
            return getRandomSpruch([
              {
                text: `Der einzige Matsch geht an ${team1Names.join(' & ')}!`,
                icon: '🏆'
              },
              {
                text: `${team1Names.join(' & ')} holen sich den Sieges-Matsch!`,
                icon: '✌️'
              },
              {
                text: `Der goldene Matsch gehört ${team1Names.join(' & ')}!`,
                icon: '👑'
              }
            ]);
          }
        } else {
          // Team 1 hat den einzigen Matsch – aber Jass verloren (topWonTheJass)
          return getRandomSpruch([
            {
              text: `${team1Names.join(' & ')} holten zwar den einzigen Matsch, verloren aber trotzdem!`,
              icon: '😅'
            },
            {
              text: `Der einzige Matsch ging an ${team1Names.join(' & ')}, der Sieg aber nicht!`,
              icon: '🤷'
            },
            {
              text: `${team1Names.join(' & ')} schnappten sich den Matsch – zum Sieg hat's trotzdem nicht gereicht!`,
              icon: '😤'
            }
          ]);
        }
      } else {
        // Einziger Matsch bei Team 2
        if (topWonTheJass) {
          // Team 2 hat auch den Jass gewonnen (stricheDifference < 0)
          if (Math.abs(stricheDifference) <= 20) {
            return getRandomSpruch([
              {
                text: `Ein Matsch, ein Sieg – perfekt gespielt von ${team2Names.join(' & ')}!`,
                icon: '✨'
              }
            ]);
          } else {
            return getRandomSpruch([
              {
                text: `Der einzige Matsch geht an ${team2Names.join(' & ')}!`,
                icon: '🏆'
              },
              {
                text: `${team2Names.join(' & ')} holen sich den Sieges-Matsch!`,
                icon: '🥳'
              },
              {
                text: `Der goldene Matsch gehört ${team2Names.join(' & ')}!`,
                icon: '👑'
              }
            ]);
          }
        } else {
          // Team 2 hat den einzigen Matsch – aber Jass verloren (bottomWonTheJass)
          return getRandomSpruch([
            {
              text: `${team2Names.join(' & ')} holten zwar den einzigen Matsch, verloren aber trotzdem!`,
              icon: '😅'
            },
            {
              text: `Der einzige Matsch ging an ${team2Names.join(' & ')}, der Sieg aber nicht!`,
              icon: '🤷'
            },
            {
              text: `${team2Names.join(' & ')} schnappten sich den Matsch – zum Sieg hat's trotzdem nicht gereicht!`,
              icon: '😬'
            }
          ]);
        }
      }
    }

    // --- 4) Gleiche Anzahl Matsche (aber kein Unentschieden) ---
    //     -> Beide Teams haben z.B. je 2 Matsche, aber Striche nicht gleich.
    if (gesamtMatsche.team1 === gesamtMatsche.team2) {
      const matchText =
        gesamtMatsche.team1 === 1
          ? 'je einen Matsch'
          : `je ${gesamtMatsche.team1} Matsche`;
      return {
        text: `Beide Teams haben ${matchText} gemacht!`,
        icon: '🤝'
      };
    }

    // --- 5) Genau 1 Matsch Unterschied ---
    if (matchDiff === 1) {
      // Wer hat mehr Matsche?
      const teamWithMore =
        gesamtMatsche.team1 > gesamtMatsche.team2 ? team1Names : team2Names;

      // Prüfen, ob dieses Team auch den Jass gewonnen hat
      // (z.B. team1 > team2 in Matsche + bottomWonTheJass => Team 1 ist zugleich Jass-Sieger)
      const team1HasMoreMatsche = gesamtMatsche.team1 > gesamtMatsche.team2;
      const matchWinnerIsGameWinner =
        (team1HasMoreMatsche && bottomWonTheJass) ||
        (!team1HasMoreMatsche && topWonTheJass);

      if (matchWinnerIsGameWinner) {
        return getRandomSpruch([
          {
            text: `Der eine Matsch mehr hat ${teamWithMore.join(' & ')} zum Sieg verholfen!`,
            icon: '🏆'
          },
          {
            text: `Ein entscheidender Matsch-Vorsprung für ${teamWithMore.join(' & ')}!`,
            icon: '🥳'
          },
          {
            text: `Dieser eine Matsch mehr machte ${teamWithMore.join(' & ')} zu den Siegern!`,
            icon: '🥳'
          }
        ]);
      } else {
        // Mehr Matsche, aber trotzdem verloren
        return getRandomSpruch([
          {
            text: `Trotz einem Matsch mehr haben ${teamWithMore.join(' & ')} den Jass verloren!`,
            icon: '😮'
          },
          {
            text: `Ein Matsch-Vorsprung hat ${teamWithMore.join(' & ')} heute nicht zum Sieg gereicht!`,
            icon: '🤷'
          },
          {
            text: `Der eine Matsch mehr war heute leider zu wenig für ${teamWithMore.join(' & ')}!`,
            icon: '😤'
          }
        ]);
      }
    }

    // --- 6) Deutliche Matsch-Differenz (>= 2), kein Unentschieden, jassEnd ---
    if (!params.isUnentschieden && params.type === 'jassEnd') {
      const moreMatsch = Math.max(gesamtMatsche.team1, gesamtMatsche.team2);
      const lessMatsch = Math.min(gesamtMatsche.team1, gesamtMatsche.team2);
      const teamWithMore =
        gesamtMatsche.team1 > gesamtMatsche.team2 ? team1Names : team2Names;
      const teamWithLess =
        gesamtMatsche.team1 > gesamtMatsche.team2 ? team2Names : team1Names;

      const diff = Math.abs(gesamtMatsche.team1 - gesamtMatsche.team2);

      // Prüfen, ob das Team mit mehr Matsche auch den Jass gewonnen hat
      const team1HasMoreMatsche = gesamtMatsche.team1 > gesamtMatsche.team2;
      const matchWinnerIsGameWinner =
        (team1HasMoreMatsche && bottomWonTheJass) ||
        (!team1HasMoreMatsche && topWonTheJass);

      if (matchWinnerIsGameWinner) {
        // a) 5+ Matsch-Differenz
        if (diff >= 5) {
          return getRandomSpruch([
            {
              text: `${teamWithLess.join(' & ')} wurden von ${teamWithMore.join(' & ')} regelrecht abgematscht! ${moreMatsch}:${lessMatsch}!`,
              icon: '💪'
            },
            {
              text: `Das war eine Matsch-Demonstration von ${teamWithMore.join(' & ')}! ${moreMatsch}:${lessMatsch}!`,
              icon: '🔥'
            },
            {
              text: `${teamWithMore.join(' & ')} haben ${teamWithLess.join(' & ')} heute keine Chance gelassen! ${moreMatsch}:${lessMatsch} Matsche!`,
              icon: '👊'
            },
            {
              text: `${teamWithLess.join(' & ')} gingen heute in der Matsch-Schlacht unter! ${moreMatsch}:${lessMatsch}!`,
              icon: '💥'
            },
            {
              text: `Eine Matsch-Lektion von ${teamWithMore.join(' & ')}! ${moreMatsch}:${lessMatsch}!`,
              icon: '📚'
            }
          ]);
        }
        // b) 3–4 Matsch-Differenz
        if (diff >= 3) {
          return getRandomSpruch([
            {
              text: `${teamWithMore.join(' & ')} dominieren mit ${moreMatsch}:${lessMatsch} Matschen!`,
              icon: '💪'
            },
            {
              text: `Eine klare Matsch-Überlegenheit von ${teamWithMore.join(' & ')}! ${moreMatsch}:${lessMatsch}!`,
              icon: '🎯'
            },
            {
              text: `${teamWithMore.join(' & ')} zeigen's heute allen – ${moreMatsch}:${lessMatsch} Matsche!`,
              icon: '🔥'
            },
            {
              text: `${teamWithLess.join(' & ')} haben heute Matsch-Nachhilfe bekommen! ${moreMatsch}:${lessMatsch}!`,
              icon: '📝'
            }
          ]);
        }
        // c) Genau 2 Matsch-Differenz
        if (diff === 2) {
          return getRandomSpruch([
            {
              text: `${teamWithMore.join(' & ')} waren heute bei den Matschen einfach stärker! ${moreMatsch}:${lessMatsch}!`,
              icon: '💫'
            },
            {
              text: `Mit ${moreMatsch}:${lessMatsch} Matschen zeigen ${teamWithMore.join(' & ')} wie's geht!`,
              icon: '👑'
            },
            {
              text: `${teamWithMore.join(' & ')} haben heute das Matsch-Händchen! ${moreMatsch}:${lessMatsch}!`,
              icon: '✨'
            }
          ]);
        }
      }
    }

    // --- 7) Fallback, falls keiner der obigen Fälle gegriffen hat ---
    const führendesTeam =
      gesamtMatsche.team1 > gesamtMatsche.team2 ? team1Names : team2Names;
    const more = Math.max(gesamtMatsche.team1, gesamtMatsche.team2);
    const less = Math.min(gesamtMatsche.team1, gesamtMatsche.team2);

    return getRandomSpruch([
      {
        text: `${more}:${less} Matsche für ${führendesTeam.join(' & ')}!`,
        icon: '🎯'
      },
      {
        text: `${führendesTeam.join(' & ')} sammeln ${more} Matsche, ${less} gehen an die Gegner!`,
        icon: '📊'
      },
      {
        text: `${more} zu ${less} Matsche – Vorteil ${führendesTeam.join(' & ')}!`,
        icon: '✨'
      },
      {
        text: `${führendesTeam.join(' & ')} holen sich ${more} Matsche!`,
        icon: '🎪'
      }
    ]);
  }
];
