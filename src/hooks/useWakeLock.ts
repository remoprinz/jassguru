import {useState, useEffect} from "react";

type WakeLockType = "screen";

export function useWakeLock(type: WakeLockType = "screen") {
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        const lock = await navigator.wakeLock.request(type);
        setWakeLock(lock);
        setIsLocked(true);
        // Wake Lock erfolgreich aktiviert (nur in Development-Modus loggen)
        if (type === "screen" && process.env.NODE_ENV === 'development') {
          console.log("✅ Wake Lock aktiviert - Bildschirm bleibt aktiv", {type, timestamp: new Date().toISOString()});
        }
      } else if (process.env.NODE_ENV === 'development') {
        console.warn("Wake Lock API wird nicht unterstützt", {timestamp: new Date().toISOString()});
      }
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Konnte ${type} Wake Lock nicht aktivieren:`, err.name, err.message);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLock) {
      wakeLock.release()
        .then(() => {
          setWakeLock(null);
          setIsLocked(false);
          if (process.env.NODE_ENV === 'development') {
            console.log("Wake Lock deaktiviert", {timestamp: new Date().toISOString()});
          }
        })
        .catch((err) => {
          if (process.env.NODE_ENV === 'development') {
            console.error("Wake Lock konnte nicht deaktiviert werden:", err, {timestamp: new Date().toISOString()});
          }
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
