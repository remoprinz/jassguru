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
      // Setze eine CSS-Variable für --vh, die von anderen Komponenten genutzt werden kann
      // WICHTIG: Berechne vh-Wert basierend auf tatsächlichem Viewport (berücksichtigt mobile Browser-UI)
      document.documentElement.style.setProperty("--vh", `${(newHeight / window.innerHeight) * 100}vh`);
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
