import React, {useState, useEffect} from "react";
import {create} from "zustand";
import {useUIStore} from "../../store/uiStore";
import {useGroupStore} from "../../store/groupStore";
import type {TeamPosition, TeamScores, ScoreSettings} from "../../types/jass";

type Multiplier = number;

interface MultiplierState {
  currentMultiplier: Multiplier;
  setMultiplier: (value: Multiplier) => void;
  getDividedPoints: (points: number) => number;
  getRemainingPoints: (team: TeamPosition, scores: TeamScores) => {
    title: string;
    remaining: number;
  };
}

export const useMultiplierStore = create<MultiplierState>((set, get) => ({
  currentMultiplier: 1,
  setMultiplier: (value: Multiplier) => set({currentMultiplier: value}),
  getDividedPoints: (points) => Math.ceil(points / get().currentMultiplier),
  getRemainingPoints: (team: TeamPosition, scores: TeamScores) => {
    if (!scores || typeof scores !== 'object') {
      return {
        title: "SIEG",
        remaining: 0,
      };
    }

    const currentGroup = useGroupStore.getState().currentGroup;
    const scoreSettings = currentGroup?.scoreSettings || useUIStore.getState().scoreSettings;

    const teamScore = scores[team] || 0;
    const oppositeTeam = team === "top" ? "bottom" : "top";
    const oppositeScore = scores[oppositeTeam] || 0;

    const siegScore = scoreSettings.values.sieg;
    const bergScore = scoreSettings.values.berg;
    const schneiderScore = scoreSettings.values.schneider;

    if (!scoreSettings.enabled.berg) {
      return {
        title: "SIEG",
        remaining: siegScore - teamScore,
      };
    }

    if (oppositeScore >= bergScore) {
      if (!scoreSettings.enabled.schneider || teamScore >= schneiderScore) {
        return {
          title: "SIEG",
          remaining: siegScore - teamScore,
        };
      }
      if (scoreSettings.enabled.schneider) {
        return {
          title: "SCHNEIDER",
          remaining: schneiderScore - teamScore,
        };
      }
    }

    if (teamScore >= bergScore) {
      return {
        title: "SIEG",
        remaining: siegScore - teamScore,
      };
    }

    if (scoreSettings.enabled.berg) {
      return {
        title: "BERG",
        remaining: bergScore - teamScore,
      };
    }

    return {
      title: "SIEG",
      remaining: siegScore - teamScore,
    };
  },
}));

type CommonMultiplierProps = {
  className?: string;
  numberSize?: string;
  scoreSettings?: ScoreSettings;
  scores: TeamScores;
  team: TeamPosition;
};

export type MultiplierCalculatorProps =
  | ({
      variant?: "default";
      mainTitle: string;
      subTitle: string;
      points: number;
    } & CommonMultiplierProps)
  | {
      variant: "multiplierOnly";
      className?: string;
      numberSize?: string;
      scoreSettings?: ScoreSettings;
      scores?: TeamScores;
    };

const MultiplierCalculator: React.FC<MultiplierCalculatorProps> = (props) => {
  const variant = props.variant ?? "default";
  const className = props.className ?? "";
  const numberSize = props.numberSize ?? "text-xl";
  const {currentMultiplier, setMultiplier, getDividedPoints, getRemainingPoints} = useMultiplierStore();
  const currentGroup = useGroupStore((state) => state.currentGroup);
  const uiFarbeSettings = useUIStore((state) => state.farbeSettings);
  const [pressedButton, setPressedButton] = useState(false);

  // Sichere Fallback-Struktur für scores
  const safeScores =
    variant === "multiplierOnly"
      ? (props.scores ?? { top: 0, bottom: 0 })
      : (props.scores || { top: 0, bottom: 0 });

  useEffect(() => {
    const settingsSource = currentGroup?.farbeSettings?.values ?? uiFarbeSettings.values;

    if (!settingsSource) {
      console.warn("[MultiplierCalculator] Keine Farbeinstellungen gefunden.");
      setMultiplier(1);
      return;
    }

    const validMultipliers = Object.values(settingsSource)
      .filter((v): v is number => typeof v === 'number' && v > 1)
      .sort((a, b) => b - a);

    const highestValidMultiplier = validMultipliers.length > 0 ? validMultipliers[0] : 1;

    setMultiplier(highestValidMultiplier);

  }, [setMultiplier]);

  const highestMultiplier = React.useMemo(() => {
    const settingsSource = currentGroup?.farbeSettings?.values ?? uiFarbeSettings.values;
    if (!settingsSource) return 1;

    const sortedMultipliers = Object.values(settingsSource)
        .filter((v): v is number => typeof v === 'number' && v > 1)
        .sort((a, b) => b - a);
    return sortedMultipliers.length > 0 ? sortedMultipliers[0] : 1;
  }, [currentGroup, uiFarbeSettings]);

  const buttonText = currentMultiplier > 0 ? `${currentMultiplier}x` : "-";

  const multiplierButton = (
    <button
      type="button"
      onClick={() => {
        const currentMultOnClick = useMultiplierStore.getState().currentMultiplier;
        let nextMultiplier: number;

        if (highestMultiplier <= 2) {
          return;
        }

        if (currentMultOnClick > 2) {
          nextMultiplier = currentMultOnClick - 1;
        } else {
          nextMultiplier = highestMultiplier;
        }

        setMultiplier(nextMultiplier);
      }}
      onMouseDown={() => setPressedButton(true)}
      onMouseUp={() => setPressedButton(false)}
      onMouseLeave={() => setPressedButton(false)}
      onTouchStart={() => setPressedButton(true)}
      onTouchEnd={() => setPressedButton(false)}
      className={`bg-orange-500 hover:bg-orange-600 text-white rounded-full w-14 h-14 flex items-center justify-center self-center mx-auto font-sans text-lg font-bold shadow-lg transition-all duration-100 ${pressedButton ? "bg-orange-700 scale-95 opacity-80" : "scale-100 opacity-100"}
        ${highestMultiplier <= 1 ? "opacity-50 cursor-not-allowed" : ""}
        ${variant === "multiplierOnly" ? "mt-2" : "mt-4"}
      `}
      disabled={highestMultiplier <= 1}
    >
      {buttonText}
    </button>
  );

  if (variant === "multiplierOnly") {
    return <div className={`flex justify-center ${className}`.trim()}>{multiplierButton}</div>;
  }

  const {mainTitle, subTitle, points, team} = props as CommonMultiplierProps & {
    mainTitle: string;
    subTitle: string;
    points: number;
    variant?: "default";
  };

  return (
    <div>
      <span className="text-gray-400">{mainTitle}</span>
      <div className={`grid grid-cols-3 gap-2 mt-0 ${className}`}>
        <div className="text-center">
          <span className="text-gray-400 text-xs">{subTitle}</span>
          <div className={`${numberSize} font-bold mt-0`}>
            {points}
          </div>
        </div>

        {multiplierButton}

        <div className="text-center">
          <span className="text-gray-400 text-xs">{currentMultiplier}-fach</span>
          <div className={`${numberSize} font-bold mt-0`}>
            {getDividedPoints(getRemainingPoints(team, safeScores).remaining)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiplierCalculator;
