import React from "react";
import {styled} from "@mui/material/styles";
import RoemischeZahlen from "../game/RoemischeZahlen";
import {useGameStore} from "../../store/gameStore";
import {useUIStore} from "../../store/uiStore";
import type {TeamPosition, StrichValue} from "../../types/jass";

interface StrichContainerProps {
  position: TeamPosition;
  onBlendEffect: (position: TeamPosition) => void;
  top100erOffset?: string;
  bottom100erOffset?: string;
  top20erOffset?: string;
  bottom20erOffset?: string;
}

interface BoxConfig {
  height: string;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  width?: string;
  transform?: string;
  transformOrigin?: string;
}

const Container = styled("div")({
  position: "absolute",
  width: "75%",
  maxWidth: "320px",
  height: "80%",
  top: "10%",
  left: "50%",
  transform: "translateX(-50%)",
  pointerEvents: "none",
});

const StrichBox = styled("div")<{ customStyle: React.CSSProperties }>(({customStyle}) => ({
  position: "absolute",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  padding: "0 10px",
  boxSizing: "border-box",
  pointerEvents: "auto",
  cursor: "pointer",
  ...(customStyle as React.CSSProperties),
}));

const BoxLabel = styled("span")<{ position: TeamPosition }>(({position}) => ({
  position: "absolute",
  [position === "top" ? "left" : "right"]: "10px",
  top: "50%",
  transform: position === "top" ? "translateY(-50%) rotate(180deg)" : "translateY(-50%)",
  color: "rgba(255, 255, 255, 0.8)",
  fontSize: "16px",
  fontWeight: "bold",
}));

const calculateBoxConfigs = (
  position: TeamPosition,
  diagonalAngle: number = -43,
  top100erOffset: string = "0%",
  bottom100erOffset: string = "0%",
  top20erOffset: string = "0%",
  bottom20erOffset: string = "0%"
): Record<string, BoxConfig> => {
  if (position === "bottom") {
    return {
      "100er": {
        height: "20%",
        top: `calc(-3.5% + ${bottom100erOffset})`,
        left: "-4%",
        width: "105%",
      },
      "50er": {
        height: "20%",
        top: "70%",
        left: "9%",
        width: "95%",
        transform: `rotate(${diagonalAngle}deg)`,
        transformOrigin: "top left",
      },
      "20er": {
        height: "20%",
        bottom: `calc(-4.5% + ${bottom20erOffset})`,
        left: "2%",
        width: "80%",
      },
      "restzahl": {
        height: "20%",
        top: "76%",
        right: "-2%",
        width: "16%",
      },
    };
  } else {
    return {
      "20er": {
        height: "20%",
        top: `calc(-4.5% + ${top20erOffset})`,
        right: "2%",
        width: "80%",
      },
      "50er": {
        height: "20%",
        bottom: "14%",
        left: "22%",
        width: "95%",
        transform: `rotate(${diagonalAngle}deg)`,
        transformOrigin: "bottom left",
      },
      "100er": {
        height: "20%",
        bottom: `calc(-3.5% + ${top100erOffset})`,
        right: "-4%",
        width: "105%",
      },
      "restzahl": {
        height: "20%",
        bottom: "76%",
        left: "-2%",
        width: "16%",
      },
    };
  }
};

const StrichContainerStyled = styled("div")<{ isRotated?: boolean }>(({isRotated}) => ({
  position: "absolute",
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "row",
  alignItems: "flex-end",
  justifyContent: "flex-start",
  transform: isRotated ? "rotateX(180deg) rotateY(180deg) rotateZ(180deg)" : "none",
  transformOrigin: "center center",
}));

const getBoxValue = (boxType: string): StrichValue | "restzahl" => {
  if (boxType === "restzahl") return "restzahl";
  const value = parseInt(boxType);
  if (value === 20 || value === 50 || value === 100) return value;
  return 20; // Fallback
};

const getClickValue = (boxType: string): number => {
  if (boxType === "restzahl") return 1;
  const value = parseInt(boxType);
  if (value === 20 || value === 50 || value === 100) return value;
  return 20; // Fallback
};

const StrichContainer: React.FC<StrichContainerProps> = ({
  position,
  onBlendEffect,
  top100erOffset = "2%",
  bottom100erOffset = "2%",
  top20erOffset = "2%",
  bottom20erOffset = "2%",
}) => {
  const {
    updateScoreByStrich,
    addWeisPoints,
    currentHistoryIndex,
    roundHistory,
    showHistoryWarning,
    getVisualStriche,
    jumpToLatest,
  } = useGameStore();

  const {
    setGameInfoOpen,
    setLastDoubleClickPosition,
    closeHistoryWarning,
  } = useUIStore();

  const visualStriche = getVisualStriche(position);

  const boxConfigs = calculateBoxConfigs(
    position,
    -43,
    top100erOffset,
    bottom100erOffset,
    top20erOffset,
    bottom20erOffset
  );

  return (
    <Container>
      <StrichContainerStyled isRotated={position === "top"}>
        {Object.entries(boxConfigs).map(([boxType, config]) => {
          const boxValue = getBoxValue(boxType);
          const stricheCount = boxValue === "restzahl" ?
            visualStriche.restZahl :
            (visualStriche.stricheCounts[boxValue] || 0);

          return (
            <StrichBox
              key={boxType}
              customStyle={config}
              data-strich-box="true"
              data-position={position}
              data-box-type={boxType}
            >
              {boxValue === "restzahl" ? (
                <BoxLabel position={position}>
                  {visualStriche.restZahl}
                </BoxLabel>
              ) : (
                <RoemischeZahlen
                  stricheCount={stricheCount}
                  stricheCounts={visualStriche.stricheCounts}
                  einheitWert={boxValue}
                  strichColor="rgb(255, 255, 255)"
                  animationDuration={100}
                  isActive={true}
                  direction={position === "top" ? "rtl" : "ltr"}
                  edgeOffset={0}
                  isXMode={boxValue === 50}
                  xAngle={18}
                  xAlignment={position === "top" ? "right" : "left"}
                  isDiagonal={true}
                  diagonalAngle={position === "top" ? -43 : 43}
                  diagonalStrichHeight={position === "top" ? "116%" : "116%"}
                  diagonalStrichWidth={position === "top" ? "2px" : "2px"}
                  diagonalStrichOffset={{
                    vertical: position === "top" ? "0%" : "0%",
                    horizontal: position === "top" ? "0%" : "0%",
                  }}
                  diagonalStrichAngle={position === "top" ? -25 : 25}
                  topDiagonalStrichOffset={{
                    vertical: "0%",
                    horizontal: "0%",
                  }}
                  bottomDiagonalStrichOffset={{
                    vertical: "0%",
                    horizontal: "0%",
                  }}
                  topDiagonalStrichAngle={position === "top" ? 30 : 30}
                  bottomDiagonalStrichAngle={position === "top" ? 30 : 30}
                  position={position}
                  diagonalStrichOffset100er={{
                    vertical: position === "top" ? "-18%" : "3%",
                    horizontal: position === "top" ? "10%" : "-5%",
                  }}
                  diagonalStrichOffset20er={{
                    vertical: position === "top" ? "-20%" : "3.5%",
                    horizontal: position === "top" ? "5.5%" : "-1.5%",
                  }}
                  diagonalStrichAngle100er={position === "top" ? 35 : 35}
                  diagonalStrichAngle20er={position === "top" ? 35 : 35}
                />
              )}
            </StrichBox>
          );
        })}
      </StrichContainerStyled>
    </Container>
  );
};

export default StrichContainer;
