import {useState, useEffect} from "react";

type WakeLockType = "screen";

export function useWakeLock(type: WakeLockType = "screen") {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        const lock = await navigator.wakeLock.request(type);
        setWakeLock(lock);
        console.log("Wake Lock aktiviert", {type, timestamp: new Date().toISOString()});
      } else {
        console.warn("Wake Lock API wird nicht unterstützt", {timestamp: new Date().toISOString()});
      }
    } catch (err) {
      console.error("Wake Lock konnte nicht aktiviert werden:", err, {timestamp: new Date().toISOString()});
    }
  };

  const releaseWakeLock = () => {
    if (wakeLock) {
      wakeLock.release()
        .then(() => {
          setWakeLock(null);
          console.log("Wake Lock deaktiviert", {timestamp: new Date().toISOString()});
        })
        .catch((err) => {
          console.error("Wake Lock konnte nicht deaktiviert werden:", err, {timestamp: new Date().toISOString()});
        });
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      } else {
        releaseWakeLock();
      }
    };

    handleVisibilityChange(); // Initial call
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }, []);

  return {wakeLock, requestWakeLock, releaseWakeLock};
}
