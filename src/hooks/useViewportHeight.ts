import {useState, useEffect} from "react";

const useViewportHeight = () => {
  const [height, setHeight] = useState(() => {
    // Initialer Wert, wenn window verfügbar ist
    if (typeof window !== "undefined") {
      // Bevorzuge visualViewport, falle zurück auf innerHeight
      return window.visualViewport ? window.visualViewport.height : window.innerHeight;
    }
    return 0;
  });

  useEffect(() => {
    const updateHeight = () => {
      // Verwende visualViewport für präzise Höhe, falle zurück auf innerHeight
      const newHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      setHeight(newHeight);
      // Hinweis: Das frühere Setzen von --vh ist entfernt — die Viewport-Höhe
      // kommt jetzt via 100dvh direkt aus CSS, --vh wird nirgends mehr gelesen.
    };

    // Überprüfe, ob visualViewport unterstützt wird
    if (window.visualViewport) {
      // Der 'resize'-Event auf visualViewport ist der Schlüssel. Er feuert,
      // wenn Browser-UI (Tastatur, Adressleiste) erscheint oder verschwindet.
      window.visualViewport.addEventListener('resize', updateHeight);
    } else {
      // Fallback für ältere Browser
      window.addEventListener("resize", updateHeight);
    }
    
    // Event für Orientierungsänderung bleibt wichtig
    window.addEventListener("orientationchange", updateHeight);

    // Führe eine initiale Messung durch
    updateHeight();

    // Cleanup-Funktion
    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateHeight);
      } else {
        window.removeEventListener("resize", updateHeight);
      }
      window.removeEventListener("orientationchange", updateHeight);
    };
  }, []); // Der Effekt soll nur einmal beim Mounten laufen

  return height;
};

export default useViewportHeight;
