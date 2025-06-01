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
    const options = {
      maxSizeMB: 1, // Maximum Dateigröße in MB
      maxWidthOrHeight,
      useWebWorker: true,
      initialQuality: quality,
    };

    const compressedFile = await imageCompression(imageFile, options);
    return compressedFile;
  } catch (error) {
    console.error("Fehler bei der Bildkompression:", error);
    return null;
  }
} 