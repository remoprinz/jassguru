import imageCompression from 'browser-image-compression';

/**
 * Komprimiert ein Bild für den Upload.
 * 
 * @param imageFile - Die Bild-Datei die komprimiert werden soll
 * @param maxWidthOrHeight - Maximale Breite oder Höhe in Pixeln (Standard: 800)
 * @param quality - Qualität der Kompression zwischen 0 und 1 (Standard: 0.8)
 * @returns Ein Promise mit dem komprimierten Bild-Blob oder null bei Fehler
 */
export async function compressImage(
  imageFile: File,
  maxWidthOrHeight: number = 800,
  quality: number = 0.8
): Promise<Blob | null> {
  try {
    // 🔥 OPTIMIERT: Aggressivere Kompression für schnellere Ladezeiten
    const options = {
      maxSizeMB: 0.5, // Reduziert von 1MB auf 0.5MB
      maxWidthOrHeight: Math.min(maxWidthOrHeight, 600), // Max 600px für Profilbilder
      useWebWorker: true,
      initialQuality: quality,
      fileType: 'image/jpeg', // JPEG für bessere Kompression
    };

    const compressedFile = await imageCompression(imageFile, options);
    
    // Zusätzliche Größenprüfung
    if (compressedFile.size > 500000) { // Wenn immer noch > 500KB
      // Zweiter Durchgang mit noch stärkerer Kompression
      const secondPassOptions = {
        ...options,
        maxSizeMB: 0.3,
        initialQuality: 0.6,
      };
      return await imageCompression(compressedFile as File, secondPassOptions);
    }
    
    return compressedFile;
  } catch (error) {
    console.error("Fehler bei der Bildkompression:", error);
    return null;
  }
} 