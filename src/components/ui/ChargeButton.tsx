import React, {useState, useRef} from "react";
import type {
  ChargeLevel,
  TeamPosition,
  ChargeButtonActionProps,
  EffectType,
} from "@/types/jass";
import {CHARGE_THRESHOLDS} from "@/types/jass";
import {
  triggerBergConfetti,
  triggerBedankenFireworks,
} from "@/components/effects/effects";
import {useUIStore} from "@/store/uiStore";

interface ChargeButtonProps {
  onAction: (props: ChargeButtonActionProps) => void;
  isButtonActive: boolean;
  isActiveGlobal: boolean;
  color: "yellow" | "green" | "red";
  disabled?: boolean;
  children: React.ReactNode;
  type: "berg" | "sieg";
  team: TeamPosition;
}

const getChargeLevelStyles = (chargeLevel: ChargeLevel, color: ChargeButtonProps["color"], isPressed: boolean) => {
  const baseColor = {
    yellow: "bg-yellow-600",
    green: "bg-green-600",
    red: "bg-red-600",
  }[color];

  const borderColor = {
    yellow: "border-yellow-900",
    green: "border-green-900",
    red: "border-red-900",
  }[color];

  const glowColor = {
    yellow: "shadow-yellow-400",
    green: "shadow-green-400",
    red: "shadow-red-400",
  }[color];

  // Charge-Level spezifische Styles ohne Hover-Effekte
  switch (chargeLevel) {
  case "extreme":
    return `${baseColor} ${borderColor} shadow-[0_0_30px_5px] ${glowColor} animate-pulse`;
  case "super":
    return `${baseColor} ${borderColor} shadow-[0_0_20px_3px] ${glowColor}`;
  case "high":
    return `${baseColor} ${borderColor} shadow-[0_0_15px_2px] ${glowColor}`;
  case "medium":
    return `${baseColor} ${borderColor} shadow-[0_0_10px_1px] ${glowColor}`;
  case "low":
    return `${baseColor} ${borderColor} shadow-[0_0_5px_0px] ${glowColor}`;
  default:
    return `${baseColor} ${borderColor}`;
  }
};

// Mapping von Button-Typ zu Effekt-Typ
const EFFECT_TYPE_MAP: Record<"berg" | "sieg", EffectType> = {
  berg: "rain",
  sieg: "firework",
} as const;

export const ChargeButton: React.FC<ChargeButtonProps> = ({
  onAction,
  isButtonActive,
  isActiveGlobal,
  color,
  disabled = false,
  children,
  type,
  team,
}) => {
  const {calculator: {isFlipped}} = useUIStore();
  const [isPressed, setIsPressed] = useState(false);
  const [chargeLevel, setChargeLevel] = useState<ChargeLevel>("none");
  const chargeInterval = useRef<NodeJS.Timeout | null>(null);
  const pressStartTime = useRef<number | null>(null);
  const touchStarted = useRef(false);

  const calculateChargeLevel = (duration: number): ChargeLevel => {
    // Berechnung des Charge-Levels basierend auf der Dauer
    if (duration >= CHARGE_THRESHOLDS.extreme) {
      return "extreme";
    } else if (duration >= CHARGE_THRESHOLDS.super) {
      return "super";
    } else if (duration >= CHARGE_THRESHOLDS.high) {
      return "high";
    } else if (duration >= CHARGE_THRESHOLDS.medium) {
      return "medium";
    } else if (duration >= CHARGE_THRESHOLDS.low) {
      return "low";
    }
    return "none";
  };

  const startCharging = () => {
    if (disabled) return;
    setIsPressed(true);
    pressStartTime.current = Date.now();

    chargeInterval.current = setInterval(() => {
      const duration = Date.now() - (pressStartTime.current || 0);
      const level = calculateChargeLevel(duration);
      setChargeLevel(level);
    }, 100);
  };

  const stopCharging = () => {
    if (disabled) return;
    setIsPressed(false);
    if (chargeInterval.current) {
      clearInterval(chargeInterval.current);
      chargeInterval.current = null;
    }

    const duration = pressStartTime.current ?
      Date.now() - pressStartTime.current :
      0;

    const level = calculateChargeLevel(duration);

    onAction({
      chargeDuration: {duration, level},
      type,
      team,
      isActivating: !isButtonActive,
    });

    if (!isActiveGlobal) {
      if (type === "berg") {
        triggerBergConfetti({
          chargeLevel: level,
          team,
          effectType: EFFECT_TYPE_MAP[type],
          isFlipped,
        });
      } else if (type === "sieg") {
        triggerBedankenFireworks({
          chargeLevel: level,
          team,
          effectType: EFFECT_TYPE_MAP[type],
          isFlipped,
        });
      }
    }

    setTimeout(() => {
      setChargeLevel("none");
      pressStartTime.current = null;
      touchStarted.current = false;
    }, 300);
  };

  return (
    <div className="relative">
      <button
        onMouseDown={() => {
          if (!touchStarted.current) startCharging();
        }}
        onMouseUp={() => {
          if (!touchStarted.current) stopCharging();
        }}
        onMouseLeave={() => {
          if (!touchStarted.current && isPressed) stopCharging();
        }}
        onTouchStart={() => {
          touchStarted.current = true;
          startCharging();
        }}
        onTouchEnd={() => {
          stopCharging();
        }}
        onTouchCancel={() => {
          stopCharging();
        }}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        className={`
          w-full py-4 text-white rounded-xl font-bold
          transition-all duration-150
          ${isButtonActive ? getChargeLevelStyles(chargeLevel, color, isPressed) : "bg-gray-600 border-gray-500"}
          border-b-4 border-t border-l border-r
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${isPressed ? "translate-y-1 shadow-inner opacity-80" : "shadow-lg"}
          select-none touch-manipulation
          -webkit-touch-callout: none
          -webkit-user-select: none
          user-select: none
        `}
      >
        <div className="relative">
          {children}
        </div>
      </button>
    </div>
  );
};
