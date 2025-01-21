import type { SpruchMitIcon, JassSpruchBaseParams } from '../../../../types/jass';
import { useJassStore } from '../../../../store/jassStore';
import { useGameStore } from '../../../../store/gameStore';
import { aggregateStricheForTeam, aggregateStricheTotal } from '../../../stricheCalculations';

// Erweitern der Basis-Parameter um Match-spezifische Daten
interface MatchSpruchParams extends JassSpruchBaseParams {
  type: 'gameEnd' | 'jassEnd';
  winnerNames: string[];
  loserNames: string[];
  isUnentschieden: boolean;
  stricheDifference: number;
}

// Hilfsfunktion für zufällige Spruchauswahl direkt hier definieren
function getRandomSpruch(sprueche: SpruchMitIcon[]): SpruchMitIcon {
  return sprueche[Math.floor(Math.random() * sprueche.length)];
}

export const matchDetailsSprueche = [
  (params: MatchSpruchParams): SpruchMitIcon => {
    const jassStore = useJassStore.getState();
    const gameStore = useGameStore.getState();

    // Gesamtmatsche aus allen Spielen
    const allGamesMatsche = aggregateStricheTotal(jassStore.games);
    const gesamtMatsche = {
      team1: allGamesMatsche.bottom.matsch,
      team2: allGamesMatsche.top.matsch
    };

    // Striche-Differenz für Sieg-Bestimmung
    const stricheDiff = params.stricheDifference;
    const totalMatsche = gesamtMatsche.team1 + gesamtMatsche.team2;

    // Keine Matsche im ganzen Jass
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

    // Bei Unentschieden spezielle Sprüche
    if (params.isUnentschieden) {
      if (totalMatsche === 1) {
        const matchWinnerTeam = gesamtMatsche.team1 === 1 ? params.winnerNames : params.loserNames;
        return {
          text: `${matchWinnerTeam.join(' & ')} holten den einzigen Matsch in diesem unentschiedenen Jass!`,
          icon: '🤝'
        };
      }
      if (gesamtMatsche.team1 === gesamtMatsche.team2) {
        const matchText = gesamtMatsche.team1 === 1 
          ? 'je einen Matsch' 
          : `je ${gesamtMatsche.team1} Matsche`;
        return {
          text: `Beide Teams haben ${matchText} gemacht - passend zum Unentschieden!`,
          icon: '🤝'
        };
      }
      // Bei unterschiedlichen Matsch-Zahlen im Unentschieden
      const führendesTeam = gesamtMatsche.team1 > gesamtMatsche.team2 ? params.winnerNames : params.loserNames;
      const mehrMatsche = Math.max(gesamtMatsche.team1, gesamtMatsche.team2);
      const wenigerMatsche = Math.min(gesamtMatsche.team1, gesamtMatsche.team2);
      return {
        text: `${führendesTeam.join(' & ')} haben zwar ${mehrMatsche}:${wenigerMatsche} bei den Matschen geführt - am Ende steht's aber unentschieden!`,
        icon: '🤝'
      };
    }

    // Nur ein einziger Matsch im ganzen Jass (nicht unentschieden)
    if (params.type === 'jassEnd' && totalMatsche === 1) {
      const matchWinnerTeam = gesamtMatsche.team1 === 1 ? params.winnerNames : params.loserNames;
      const matchWinnerHasMoreStriche = (gesamtMatsche.team1 === 1 && stricheDiff > 0) || 
                                      (gesamtMatsche.team2 === 1 && stricheDiff < 0);

      if (matchWinnerHasMoreStriche && Math.abs(stricheDiff) <= 20) {
        return getRandomSpruch([
          { text: `Ein Matsch, ein Sieg - perfekt gespielt von ${matchWinnerTeam.join(' & ')}!`, icon: '✨' }
        ]);
      } else if (matchWinnerHasMoreStriche && Math.abs(stricheDiff) === 1) {
        return getRandomSpruch([
          { text: `Der einzige Matsch geht an ${matchWinnerTeam.join(' & ')}!`, icon: '🏆' },
          { text: `${matchWinnerTeam.join(' & ')} holen sich den Sieges-Matsch!`, icon: '🎯' },
          { text: `Der goldene Matsch gehört ${matchWinnerTeam.join(' & ')}!`, icon: '👑' }
        ]);
      } else if (matchWinnerHasMoreStriche) {
        return {
          text: `${matchWinnerTeam.join(' & ')} holen sich den einzigen Matsch und den Sieg!`,
          icon: '🎯'
        };
      } else {
        return getRandomSpruch([
          { text: `${matchWinnerTeam.join(' & ')} holten zwar den einzigen Matsch, verloren aber trotzdem!`, icon: '😅' },
          { text: `Der einzige Matsch ging an ${matchWinnerTeam.join(' & ')}, der Sieg aber nicht!`, icon: '🤷' },
          { text: `${matchWinnerTeam.join(' & ')} schnappten sich den Matsch - zum Sieg hat's trotzdem nicht gereicht!`, icon: '😬' }
        ]);
      }
    }

    // Gleiche Anzahl Matsche
    if (gesamtMatsche.team1 === gesamtMatsche.team2) {
      const matchText = gesamtMatsche.team1 === 1 
        ? 'je einen Matsch' 
        : `je ${gesamtMatsche.team1} Matsche`;
      return {
        text: `Beide Teams haben ${matchText} gemacht!`,
        icon: '🤝'
      };
    }

    // Genau 1 Matsch Differenz
    const matchDiff = Math.abs(gesamtMatsche.team1 - gesamtMatsche.team2);
    if (matchDiff === 1) {
      const führendesTeam = gesamtMatsche.team1 > gesamtMatsche.team2 ? params.winnerNames : params.loserNames;
      const isWinner = (gesamtMatsche.team1 > gesamtMatsche.team2 && führendesTeam === params.winnerNames);

      if (isWinner) {
        return getRandomSpruch([
          { text: `Der eine Matsch mehr hat ${führendesTeam.join(' & ')} zum Sieg verholfen!`, icon: '🏆' },
          { text: `Ein entscheidender Matsch-Vorsprung für ${führendesTeam.join(' & ')}!`, icon: '💫' },
          { text: `Dieser eine Matsch mehr machte ${führendesTeam.join(' & ')} zu den Siegern!`, icon: '🎯' }
        ]);
      } else {
        return getRandomSpruch([
          { text: `Trotz einem Matsch mehr haben ${führendesTeam.join(' & ')} den Jass verloren!`, icon: '😅' },
          { text: `Ein Matsch-Vorsprung hat ${führendesTeam.join(' & ')} heute nicht zum Sieg gereicht!`, icon: '🤷' },
          { text: `Der eine Matsch mehr war heute leider zu wenig für ${führendesTeam.join(' & ')}!`, icon: '📉' }
        ]);
      }
    }

    // Matsch-Differenz Kategorien für deutliche Siege
    if (!params.isUnentschieden && params.type === 'jassEnd') {
      const matchDiff = Math.abs(gesamtMatsche.team1 - gesamtMatsche.team2);
      const mehrMatsche = Math.max(gesamtMatsche.team1, gesamtMatsche.team2);
      const wenigerMatsche = Math.min(gesamtMatsche.team1, gesamtMatsche.team2);
      const führendesTeam = gesamtMatsche.team1 > gesamtMatsche.team2 ? params.winnerNames : params.loserNames;
      const verliererTeam = gesamtMatsche.team1 > gesamtMatsche.team2 ? params.loserNames : params.winnerNames;
      
      // Nur wenn das Team mit mehr Matschen auch gewonnen hat
      const matchWinnerIsGameWinner = (gesamtMatsche.team1 > gesamtMatsche.team2 && stricheDiff > 0) || 
                                    (gesamtMatsche.team2 > gesamtMatsche.team1 && stricheDiff < 0);

      if (matchWinnerIsGameWinner) {
        if (matchDiff >= 5) {
          // Extreme Dominanz (5+ Matsche Differenz)
          return getRandomSpruch([
            { text: `${verliererTeam.join(' & ')} wurden von ${führendesTeam.join(' & ')} regelrecht abgematscht! ${mehrMatsche}:${wenigerMatsche}!`, icon: '💪' },
            { text: `Das war eine Matsch-Demonstration von ${führendesTeam.join(' & ')}! ${mehrMatsche}:${wenigerMatsche}!`, icon: '🔥' },
            { text: `${führendesTeam.join(' & ')} haben ${verliererTeam.join(' & ')} heute keine Chance gelassen! ${mehrMatsche}:${wenigerMatsche} Matsche!`, icon: '👊' },
            { text: `${verliererTeam.join(' & ')} gingen heute in der Matsch-Schlacht unter! ${mehrMatsche}:${wenigerMatsche}!`, icon: '💥' },
            { text: `Eine Matsch-Lektion von ${führendesTeam.join(' & ')}! ${mehrMatsche}:${wenigerMatsche}!`, icon: '📚' }
          ]);
        } else if (matchDiff >= 3) {
          // Deutliche Überlegenheit (3-4 Matsche Differenz)
          return getRandomSpruch([
            { text: `${führendesTeam.join(' & ')} dominieren mit ${mehrMatsche}:${wenigerMatsche} Matschen!`, icon: '💪' },
            { text: `Eine klare Matsch-Überlegenheit von ${führendesTeam.join(' & ')}! ${mehrMatsche}:${wenigerMatsche}!`, icon: '🎯' },
            { text: `${führendesTeam.join(' & ')} zeigen's heute allen - ${mehrMatsche}:${wenigerMatsche} Matsche!`, icon: '🔥' },
            { text: `${verliererTeam.join(' & ')} haben heute Matsch-Nachhilfe bekommen! ${mehrMatsche}:${wenigerMatsche}!`, icon: '📝' }
          ]);
        } else if (matchDiff === 2) {
          // Klarer Vorsprung (2 Matsche Differenz)
          return getRandomSpruch([
            { text: `${führendesTeam.join(' & ')} waren heute bei den Matschen einfach stärker! ${mehrMatsche}:${wenigerMatsche}!`, icon: '💫' },
            { text: `Mit ${mehrMatsche}:${wenigerMatsche} Matschen zeigen ${führendesTeam.join(' & ')} wie's geht!`, icon: '👑' },
            { text: `${führendesTeam.join(' & ')} haben heute das Matsch-Händchen! ${mehrMatsche}:${wenigerMatsche}!`, icon: '✨' }
          ]);
        }
      }
    }

    // Default-Fall für kleinere Differenzen oder wenn Matsch-Sieger nicht Spiel-Sieger
    const führendesTeam = gesamtMatsche.team1 > gesamtMatsche.team2 ? params.winnerNames : params.loserNames;
    const mehrMatsche = Math.max(gesamtMatsche.team1, gesamtMatsche.team2);
    const wenigerMatsche = Math.min(gesamtMatsche.team1, gesamtMatsche.team2);
    
    return getRandomSpruch([
      { text: `${mehrMatsche}:${wenigerMatsche} Matsche für ${führendesTeam.join(' & ')}!`, icon: '🎯' },
      { text: `${führendesTeam.join(' & ')} sammeln ${mehrMatsche} Matsche, ${wenigerMatsche} gehen an die Gegner!`, icon: '📊' },
      { text: `${mehrMatsche} zu ${wenigerMatsche} Matsche - Vorteil ${führendesTeam.join(' & ')}!`, icon: '✨' },
      { text: `${führendesTeam.join(' & ')} holen sich ${mehrMatsche} Matsche!`, icon: '🎪' }
    ]);
  }
]; 