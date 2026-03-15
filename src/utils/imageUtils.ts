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
      maxSizeMB: 0.2, // 200KB – ausreichend für Avatare bis 400px
      maxWidthOrHeight: Math.min(maxWidthOrHeight, 600),
      useWebWorker: true,
      initialQuality: quality,
      fileType: 'image/jpeg',
    };

    const compressedFile = await imageCompression(imageFile, options);
    
    // Sicherheitsnetz: Falls noch über 200KB, zweiter Durchgang aggressiver
    if (compressedFile.size > 200000) {
      const secondPassOptions = {
        ...options,
        maxSizeMB: 0.15,
        initialQuality: 0.65,
      };
      return await imageCompression(compressedFile as File, secondPassOptions);
    }
    
    return compressedFile;
  } catch (error) {
    console.error("Fehler bei der Bildkompression:", error);
    return null;
  }
} 