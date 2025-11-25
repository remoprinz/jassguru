/**
 * Lazy Migration für bereits hochgeladene Bilder
 * Komprimiert alte, große Bilder automatisch beim nächsten Upload
 */

import { compressImage } from './imageUtils';
import { isImageCached } from './imagePerformance';

/**
 * Prüft ob ein Bild zu groß ist und re-komprimiert werden sollte
 * Heuristik: Datei > 300KB oder sehr alte Firebase URLs
 */
export const shouldRecompressImage = async (
  imageUrl: string,
  maxSizeKB: number = 300
): Promise<boolean> => {
  if (!imageUrl) return false;
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== 'firebasestorage.googleapis.com') return false;
  } catch {
    return false;
  }

  try {
    // Prüfe Cache zuerst - wenn nicht im Cache, laden und Größe prüfen
    const isCached = await isImageCached(imageUrl);
    if (!isCached) {
      // Lade das Bild um die Größe zu prüfen
      const response = await fetch(imageUrl, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      
      if (contentLength) {
        const sizeKB = parseInt(contentLength) / 1024;
        console.log(`[imageMigration] Bildgröße: ${sizeKB.toFixed(1)}KB`);
        return sizeKB > maxSizeKB;
      }
    }

    return false; // Im Zweifel nicht re-komprimieren
  } catch (error) {
    console.warn('[imageMigration] Fehler beim Prüfen der Bildgröße:', error);
    return false;
  }
};

/**
 * Lädt ein Bild herunter und komprimiert es neu
 * Verwendet für Lazy Migration großer Bilder
 */
export const downloadAndRecompressImage = async (
  imageUrl: string,
  maxWidth: number = 512,
  quality: number = 0.8
): Promise<File | null> => {
  try {
    console.log(`[imageMigration] Lade Bild für Re-Komprimierung: ${imageUrl}`);
    
    // Bild herunterladen
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const originalSize = blob.size;
    
    // Als File-Objekt behandeln für compressImage
    const file = new File([blob], 'image.jpg', { type: blob.type });
    
    // Re-komprimieren
    const compressedBlob = await compressImage(file, maxWidth, quality);
    if (!compressedBlob) {
      throw new Error('Komprimierung fehlgeschlagen');
    }

    const newSize = compressedBlob.size;
    const savings = ((originalSize - newSize) / originalSize) * 100;
    
    console.log(`[imageMigration] Re-komprimiert: ${originalSize} → ${newSize} bytes (${savings.toFixed(1)}% gespart)`);
    
    // Als File zurückgeben
    return new File([compressedBlob], 'recompressed.jpg', { type: 'image/jpeg' });
  } catch (error) {
    console.error('[imageMigration] Fehler beim Re-komprimieren:', error);
    return null;
  }
};

/**
 * Migrationshelfer für Profile/Gruppe die automatisch beim nächsten Update
 * prüft ob das aktuelle Bild re-komprimiert werden sollte
 */
export class ImageMigrationHelper {
  private recompressedUrls = new Set<string>();
  
  /**
   * Prüft beim Upload ob das aktuelle Bild migriert werden sollte
   */
  async checkAndMigrateOnUpload(
    currentImageUrl: string | null,
    newFile: File,
    uploadCallback: (file: File) => Promise<string>
  ): Promise<string> {
    // Normaler Upload für neue Datei (bereits komprimiert durch Services)
    const newUrl = await uploadCallback(newFile);
    
    // Optional: Altes Bild zur Migration markieren (für spätere Batch-Verarbeitung)
    if (currentImageUrl && !this.recompressedUrls.has(currentImageUrl)) {
      const shouldMigrate = await shouldRecompressImage(currentImageUrl);
      if (shouldMigrate) {
        console.log(`[imageMigration] Altes Bild markiert für eventuelle Migration: ${currentImageUrl}`);
        // Könnte in eine Queue für Batch-Migration eingereiht werden
      }
    }
    
    this.recompressedUrls.add(newUrl);
    return newUrl;
  }

  /**
   * Batch-Migration für eine Liste von Bild-URLs
   * Nützlich für Admin-Tools oder Maintenance Scripts
   */
  async batchMigrate(
    imageUrls: string[],
    uploadCallback: (file: File, originalUrl: string) => Promise<string>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ success: string[], failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] };
    
    for (let i = 0; i < imageUrls.length; i++) {
      const url = imageUrls[i];
      
      try {
        const shouldMigrate = await shouldRecompressImage(url);
        if (shouldMigrate) {
          const recompressedFile = await downloadAndRecompressImage(url);
          if (recompressedFile) {
            await uploadCallback(recompressedFile, url);
            results.success.push(url);
          } else {
            results.failed.push(url);
          }
        } else {
          // Bild ist bereits optimiert
          results.success.push(url);
        }
      } catch (error) {
        console.error(`[imageMigration] Fehler bei ${url}:`, error);
        results.failed.push(url);
      }
      
      onProgress?.(i + 1, imageUrls.length);
    }
    
    return results;
  }
}

// Singleton Instance
export const imageMigration = new ImageMigrationHelper();

/**
 * Utility zum Analysieren der Bildqualität einer Gruppe/User
 * Für Monitoring und Optimierungsreports
 */
export const analyzeImageSizes = async (imageUrls: string[]): Promise<{
  totalCount: number;
  oversizedCount: number;
  totalSizeKB: number;
  potentialSavingsKB: number;
}> => {
  let totalCount = 0;
  let oversizedCount = 0;
  let totalSizeKB = 0;
  let potentialSavingsKB = 0;

  for (const url of imageUrls) {
    if (!url) continue;
    
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      
      if (contentLength) {
        const sizeKB = parseInt(contentLength) / 1024;
        totalSizeKB += sizeKB;
        totalCount++;
        
        if (sizeKB > 300) { // 300KB Threshold
          oversizedCount++;
          potentialSavingsKB += sizeKB * 0.6; // Geschätzte 60% Einsparung
        }
      }
    } catch (error) {
      // Ignoriere Fehler, zähle nicht mit
    }
  }

  return {
    totalCount,
    oversizedCount,
    totalSizeKB: Math.round(totalSizeKB),
    potentialSavingsKB: Math.round(potentialSavingsKB)
  };
};
