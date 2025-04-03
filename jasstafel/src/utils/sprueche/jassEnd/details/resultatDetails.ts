import type {SpruchGenerator} from "../../../../types/sprueche";

export const resultatDetailsSprueche: SpruchGenerator[] = [
  (params) => {
    const [leftScore, rightScore] = params.winnerNames[0] === "Team 1" ?
      [params.gesamtStand.team1, params.gesamtStand.team2] :
      [params.gesamtStand.team2, params.gesamtStand.team1];

    return {
      text: `${leftScore} : ${rightScore} Striche`,
      icon: "",
    };
  },
  (params) => {
    const [leftScore, rightScore] = params.winnerNames[0] === "Team 1" ?
      [params.gesamtStand.team1, params.gesamtStand.team2] :
      [params.gesamtStand.team2, params.gesamtStand.team1];

    return {
      text: `${leftScore}:${rightScore}`,
      icon: "",
    };
  },
];
