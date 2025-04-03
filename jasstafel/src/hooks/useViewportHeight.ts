import {useState, useEffect} from "react";

const useViewportHeight = () => {
  const [height, setHeight] = useState(() => {
    if (typeof window !== "undefined") {
      const vh = window.innerHeight;
      return vh;
    }
    return 0;
  });

  useEffect(() => {
    const updateHeight = () => {
      const vh = window.innerHeight;
      setHeight(vh);
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    // Initial update
    updateHeight();

    // Delayed update
    const delayedUpdate = setTimeout(updateHeight, 100);

    window.addEventListener("resize", updateHeight);
    window.addEventListener("orientationchange", updateHeight);

    return () => {
      clearTimeout(delayedUpdate);
      window.removeEventListener("resize", updateHeight);
      window.removeEventListener("orientationchange", updateHeight);
    };
  }, []);

  return height;
};

export default useViewportHeight;
