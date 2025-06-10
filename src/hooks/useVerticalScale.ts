import {useState, useLayoutEffect, RefObject} from "react";

const PADDING_VERTICAL =8; // Minimal padding (e.g., 8px top, 8px bottom)

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

  useLayoutEffect(() => {
    const updateScale = () => {
      if (elementRef.current) {
        const viewportHeight = window.innerHeight;
        const elementHeight = elementRef.current.offsetHeight;

        if (elementHeight === 0) return; // Avoid division by zero if element not rendered yet

        const availableHeight = viewportHeight - PADDING_VERTICAL;
        
        if (elementHeight > availableHeight) {
          const newScale = availableHeight / elementHeight;
          setScale(newScale);
        } else {
          setScale(1);
        }
      }
    };

    updateScale(); // Initial calculation
    
    window.addEventListener("resize", updateScale);
    window.addEventListener("orientationchange", updateScale);

    // Recalculate on a timer as a fallback for dynamic content changes
    const intervalId = setInterval(updateScale, 500);

    return () => {
      window.removeEventListener("resize", updateScale);
      window.removeEventListener("orientationchange", updateScale);
      clearInterval(intervalId);
    };
  }, [elementRef]);

  return scale;
}; 