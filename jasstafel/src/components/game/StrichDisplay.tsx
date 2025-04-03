import React from "react";
import styled from "styled-components";
import {animated, useSpring} from "react-spring";
import type {TeamPosition} from "../../types/jass";

// 1. Erweiterte Interfaces
interface StrichStyle {
  baseStrich: {
    length: number;
    width: number;
    color: string;
    opacity: number;
  };
  diagonalStrich: {
    length: number;
    width: number;
    angle: number;
    offset: { x: number; y: number };
  };
  container: {
    spacing: number;
    groupSpacing: number;
    scale: number;
    stackSpacing: number;
  };
}

interface StrichDisplayProps {
  type: "horizontal" | "vertikal";
  count: number;
  position: TeamPosition;
  style?: StrichStyle;
}

// 2. Optimierte Style-Definitionen
const defaultStyle: StrichStyle = {
  baseStrich: {
    length: 38,
    width: 3,
    color: "#FFFFFF",
    opacity: 1,
  },
  diagonalStrich: {
    length: 54,
    width: 3.5,
    angle: -45,
    offset: {x: 0, y: 10},
  },
  container: {
    spacing: 10,
    groupSpacing: 12,
    scale: 1,
    stackSpacing: 0,
  },
};

const StrichContainer = styled.div<{ type: "horizontal" | "vertikal" }>`
  position: relative;
  display: flex;
  align-items: center;
  
  /* Basis-Styles */
  min-height: ${(props) => props.type === "horizontal" ? "16px" : "50px"};
  
  /* Container-spezifische Positionierung */
  ${(props) => props.type === "horizontal" ? `
    transform: rotate(-90deg);
    transform-origin: left center;
    margin: 1px 0px;
    padding-left: 0px; // Horizontale Gruppe kann nach rechts verschoben werden
  ` : `
    margin: -14px 0 -6px -30px; // Negativer margin-left für vertikale Gruppe
  `}
`;

const StrichElement = styled(animated.div)<{
  $type: "horizontal" | "vertikal";
  $position: TeamPosition;
  $isDiagonal?: boolean;
}>`
  position: absolute;
  background-color: ${defaultStyle.baseStrich.color};
  opacity: ${defaultStyle.baseStrich.opacity};
  transition: all 0.2s ease;

  ${({$type, $isDiagonal}) => {
    if ($isDiagonal) {
      return `
        width: ${defaultStyle.diagonalStrich.length}px;
        height: ${defaultStyle.diagonalStrich.width}px;
        transform: rotate(${defaultStyle.diagonalStrich.angle}deg);
        transform-origin: left center;
        z-index: 2;
      `;
    }
    return `
      width: ${defaultStyle.baseStrich.width}px;
      height: ${defaultStyle.baseStrich.length}px;
    `;
  }}
`;

// StrichGroup Interface hinzufügen
interface StrichGroupProps {
  $type: "horizontal" | "vertikal";
}

const StrichGroup = styled(animated.div)<StrichGroupProps>`
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-right: ${(props) => props.$type === "horizontal" ? "8px" : "12px"};
`;

// Separate Styles für diagonale Striche je nach Typ
const getDiagonalStyles = (type: "horizontal" | "vertikal") => {
  if (type === "horizontal") {
    return {
      left: `${-0.2 * defaultStyle.container.spacing}px`,
      top: "18px",
      transform: "rotate(-50deg)",
    };
  }
  return {
    left: `${3 * defaultStyle.container.spacing - 32}px`, // Feintuning für vertikale Gruppe
    top: "18px",
    transform: "rotate(-45deg)",
  };
};

const StrichDisplay: React.FC<StrichDisplayProps> = ({type, count, position, style}) => {
  // Ein einzelner Spring für die ganze Animation
  const spring = useSpring({
    from: {progress: 0},
    to: {progress: count},
    config: {tension: 400, friction: 15},
  });

  const renderStriche = () => {
    const elements: JSX.Element[] = [];
    const fullGroups = Math.floor(count / 5);
    const remainder = count % 5;

    // 1. Normale 5er-Gruppen
    for (let i = 0; i < fullGroups; i++) {
      elements.push(
        <StrichGroup key={`group-${i}`} $type={type}>
          {[...Array(4)].map((_, idx) => (
            <StrichElement
              key={`strich-${i}-${idx}`}
              $type={type}
              $position={position}
              style={{
                opacity: spring.progress.to((p) => p > i * 5 + idx ? 1 : 0),
                transform: spring.progress.to((p) =>
                  p > i * 5 + idx ? "scale(1)" : "scale(0)"
                ),
                left: `${idx * defaultStyle.container.spacing}px`,
              }}
            />
          ))}
          <StrichElement
            key={`diagonal-${i}`}
            $type={type}
            $position={position}
            $isDiagonal
            style={{
              opacity: spring.progress.to((p) => p > i * 5 + 4 ? 1 : 0),
              transform: spring.progress.to((p) =>
                p > i * 5 + 4 ? getDiagonalStyles(type).transform : "scale(0)"
              ),
              left: getDiagonalStyles(type).left,
              top: getDiagonalStyles(type).top,
            }}
          />
        </StrichGroup>
      );
    }

    // 2. Restliche Striche
    if (remainder > 0) {
      elements.push(
        <StrichGroup key="remainder" $type={type}>
          {[...Array(remainder)].map((_, idx) => (
            <StrichElement
              key={`rest-${idx}`}
              $type={type}
              $position={position}
              style={{
                opacity: spring.progress.to((p) =>
                  p > fullGroups * 5 + idx ? 1 : 0
                ),
                transform: spring.progress.to((p) =>
                  p > fullGroups * 5 + idx ? "scale(1)" : "scale(0)"
                ),
                left: `${idx * defaultStyle.container.spacing}px`,
              }}
            />
          ))}
        </StrichGroup>
      );
    }

    return elements;
  };

  return (
    <StrichContainer type={type}>
      {renderStriche()}
    </StrichContainer>
  );
};

export default StrichDisplay;
