"use client";

import React, { useEffect } from 'react';

interface AvatarPreloaderProps {
  photoURLs: (string | null | undefined)[];
}

/**
 * AvatarPreloader lädt und dekodiert Profilbilder unsichtbar im Hintergrund.
 * 
 * Dadurch werden die Bilder im Browser-Memory dekodiert und erscheinen
 * instant bei Tab-Wechseln, auch wenn die Container vorher hidden waren.
 */
export const AvatarPreloader: React.FC<AvatarPreloaderProps> = ({ photoURLs }) => {
  useEffect(() => {
    // Nur eindeutige, gültige URLs preloaden
    const validURLs = [...new Set(photoURLs.filter(url => url && url.trim() !== ''))];
    
    if (validURLs.length === 0) return;

    // Preload-Logik: Erstelle Image-Objekte für jede URL
    const imagePromises = validURLs.map(url => {
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
          // Bild erfolgreich geladen und dekodiert
          resolve();
        };
        
        img.onerror = () => {
          // Fehler beim Laden - nicht blockieren
          resolve();
        };
        
        // Starte das Laden
        img.src = url!;
      });
    });

    // Alle Bilder parallel laden
    Promise.allSettled(imagePromises).then(() => {
      console.log(`[AvatarPreloader] ${validURLs.length} Avatare preloaded`);
    });

  }, [photoURLs]);

  // Komponente ist komplett unsichtbar und nimmt keinen Platz ein
  return null;
};

export default AvatarPreloader;
