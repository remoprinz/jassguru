"use client";

import React, { useEffect } from 'react';

interface AvatarPreloaderProps {
  photoURLs: (string | null | undefined)[];
}

/**
 * 🎯 GLOBALER IMAGE-CACHE: Speichert welche URLs bereits geladen wurden
 * Wird von AvatarPreloader geschrieben und von ProfileImage gelesen
 */
const imageCache = new Set<string>();
const imageCacheComplete = new Set<string>(); // ✅ Nur vollständig geladene Bilder

/**
 * Prüft ob ein Bild bereits vollständig im Cache ist (von AvatarPreloader geladen)
 * Zwei Checks:
 * 1. Unser Set (schnell) - nur vollständig geladene Bilder
 * 2. Browser-Cache-Check (für Bilder aus vorherigen Sessions)
 */
export const isImageCached = (url: string | null | undefined): boolean => {
  if (!url) return false;
  
  // ✅ Check 1: Schnelle Prüfung unseres Sets (vollständig geladene Bilder)
  if (imageCacheComplete.has(url)) {
    return true; // ✅ Garantiert geladen
  }
  
  // ✅ Check 2: Prüfe Browser-Cache (für Bilder aus vorherigen Sessions)
  // Wenn Bild bereits im Browser-HTTP-Cache ist, ist es sofort verfügbar
  try {
    const img = new Image();
    img.src = url;
    
    // ⚠️ WICHTIG: Wenn Bild schon im Browser-Cache war, ist img.complete SOFORT true
    // Wenn nicht, wird es asynchron geladen (aber das wollen wir nicht abwarten)
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      // ✅ Bild war bereits im Browser-Cache → zu unserem Cache hinzufügen
      imageCacheComplete.add(url);
      return true;
    }
  } catch {
    // Fehler beim Prüfen → nicht im Cache
  }
  
  return false; // Nicht im Cache
};

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
      // 🎯 Prüfe bereits im Cache?
      if (imageCache.has(url!)) {
        return Promise.resolve();
      }
      
      return new Promise<void>((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
          // ✅ Bild erfolgreich geladen UND vollständig dekodiert → in Cache speichern
          imageCache.add(url!);
          imageCacheComplete.add(url!); // ✅ Nur vollständig geladene Bilder
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
      // Avatare preloaded
    });

  }, [photoURLs]);

  // Komponente ist komplett unsichtbar und nimmt keinen Platz ein
  return null;
};

export default AvatarPreloader;
