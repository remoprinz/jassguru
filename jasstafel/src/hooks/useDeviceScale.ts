import {useState, useEffect} from "react";
import {isIOS} from "./useBrowserDetection";

interface DeviceScaleInfo {
  scale: number;
  overlayScale: number;
  deviceType: "iphone_se" | "iphone_mini" | "default";
  urlBarPosition: "top" | "bottom";
}

const IPHONE_SE_HEIGHT = 667;
const IPHONE_MINI_HEIGHT = 812;
const DEFAULT_WIDTH = 375;

export const useDeviceScale = (): DeviceScaleInfo => {
  const [deviceScale, setDeviceScale] = useState<DeviceScaleInfo>({
    scale: 1,
    overlayScale: 1,
    deviceType: "default",
    urlBarPosition: "bottom",
  });

  useEffect(() => {
    const calculateScale = () => {
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const visualViewportHeight = window.visualViewport?.height || viewportHeight;

      const urlBarPosition = (visualViewportHeight < viewportHeight &&
        window.scrollY < 10) ? "top" as const : "bottom" as const;

      if (!isIOS() || viewportWidth !== DEFAULT_WIDTH) {
        return {
          scale: 1,
          overlayScale: 1,
          deviceType: "default" as const,
          urlBarPosition,
        };
      }

      if (viewportHeight <= IPHONE_SE_HEIGHT) {
        return {
          scale: 1,
          overlayScale: 0.78,
          deviceType: "iphone_se" as const,
          urlBarPosition,
        };
      } else if (viewportHeight <= IPHONE_MINI_HEIGHT) {
        return {
          scale: 1,
          overlayScale: 0.95,
          deviceType: "iphone_mini" as const,
          urlBarPosition,
        };
      }

      return {
        scale: 1,
        overlayScale: 1,
        deviceType: "default" as const,
        urlBarPosition,
      };
    };

    setDeviceScale(calculateScale());

    const handleResize = () => {
      setDeviceScale(calculateScale());
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize);
    window.addEventListener("orientationchange", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return deviceScale;
};
