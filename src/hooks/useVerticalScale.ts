import {useState, useLayoutEffect, RefObject} from "react";
import { useUIStore } from "@/store/uiStore";

const PADDING_VERTICAL = 8; // Minimal padding (e.g., 8px top, 8px bottom)

/**
 * A hook that calculates a scale factor for an element to ensure it fits
 * within the viewport's height, including a specified vertical padding.
 * It only scales down when necessary.
 *
 * @param elementRef Ref to the element that needs to be scaled.
 * @returns The calculated scale factor (between 0 and 1).
 */
export const useVerticalScale = (elementRef: RefObject<HTMLElement>): number => {
  const [scale, setScale] = useState(1);
  const isMenuOpen = useUIStore((state) => state.menu.isOpen);

  useLayoutEffect(() => {
    const updateScale = () => {
      if (elementRef.current) {
        const viewportHeight = window.innerHeight;
        const elementHeight = elementRef.current.offsetHeight;

        if (elementHeight === 0) return;

        const availableHeight = viewportHeight - PADDING_VERTICAL;
        
        if (elementHeight > availableHeight) {
          const newScale = availableHeight / elementHeight;
          setScale(newScale);
        } else {
          setScale(1);
        }
      }
    };

    updateScale();

    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);

    // Der unzuverlässige Interval wird entfernt.
    // const intervalId = setInterval(updateScale, 500);

    return () => {
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
      // clearInterval(intervalId);
    };
  }, [elementRef, isMenuOpen]); // NEU: isMenuOpen als Abhängigkeit hinzufügen

  return scale;
}; 