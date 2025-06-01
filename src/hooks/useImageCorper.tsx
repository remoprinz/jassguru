import { useState, useCallback } from 'react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/services/firebaseInit';
import { nanoid } from 'nanoid';

interface UseImageCorperOptions {
  aspectRatio?: number;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  outputFormat?: 'jpeg' | 'png' | 'webp';
}

interface UseImageCorperReturn {
  croppedImage: string | null;
  isProcessing: boolean;
  error: string | null;
  cropImage: (file: File) => Promise<string>;
  uploadCroppedImage: (path: string) => Promise<string>;
  resetImage: () => void;
}

/**
 * Hook für das Zuschneiden und Hochladen von Bildern
 * 
 * @param options Konfigurationsoptionen für das Bildcropping
 * @returns Funktionen und Status für die Bildverarbeitung
 */
export function useImageCorper(options: UseImageCorperOptions = {}): UseImageCorperReturn {
  const {
    aspectRatio = 1,
    quality = 0.8,
    maxWidth = 800,
    maxHeight = 800,
    outputFormat = 'jpeg'
  } = options;

  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bild zuschneiden und in lokalen State speichern
  const cropImage = useCallback(async (file: File): Promise<string> => {
    setIsProcessing(true);
    setError(null);

    try {
      // Bild in ein Image-Element laden
      const image = new Image();
      const imageUrl = URL.createObjectURL(file);
      
      return new Promise<string>((resolve, reject) => {
        image.onload = () => {
          // Dimensionen für den Zuschnitt berechnen
          let width = image.width;
          let height = image.height;
          
          // Größenanpassungen basierend auf maxWidth/maxHeight
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
          
          // Zuschnittgrößen basierend auf aspectRatio berechnen
          let cropWidth = width;
          let cropHeight = height;
          
          if (aspectRatio > 0) {
            if (width / height > aspectRatio) {
              cropWidth = height * aspectRatio;
            } else {
              cropHeight = width / aspectRatio;
            }
          }
          
          // Canvas für das Cropping erstellen
          const canvas = document.createElement('canvas');
          canvas.width = cropWidth;
          canvas.height = cropHeight;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas-Kontext konnte nicht erstellt werden'));
            return;
          }
          
          // Bild zentriert auf Canvas zeichnen
          const offsetX = (width - cropWidth) / 2;
          const offsetY = (height - cropHeight) / 2;
          
          ctx.drawImage(
            image,
            offsetX, offsetY, cropWidth, cropHeight, // Quellenausschnitt
            0, 0, cropWidth, cropHeight // Zielposition und -größe
          );
          
          // Canvas in ein Bild-URL umwandeln
          const croppedImageUrl = canvas.toDataURL(`image/${outputFormat}`, quality);
          setCroppedImage(croppedImageUrl);
          setIsProcessing(false);
          URL.revokeObjectURL(imageUrl); // Speicherleck vermeiden
          resolve(croppedImageUrl);
        };
        
        image.onerror = () => {
          URL.revokeObjectURL(imageUrl);
          setIsProcessing(false);
          const errorMsg = 'Bild konnte nicht geladen werden';
          setError(errorMsg);
          reject(new Error(errorMsg));
        };
        
        image.src = imageUrl;
      });
    } catch (err) {
      setIsProcessing(false);
      const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler beim Bildcropping';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [aspectRatio, maxWidth, maxHeight, quality, outputFormat]);

  // Zugeschnittenes Bild zu Firebase hochladen
  const uploadCroppedImage = useCallback(async (path: string): Promise<string> => {
    if (!croppedImage) {
      const errorMsg = 'Kein Bild zum Hochladen vorhanden';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
    
    setIsProcessing(true);
    
    try {
      // DataURL in Blob umwandeln
      const response = await fetch(croppedImage);
      const blob = await response.blob();
      
      // Eindeutigen Dateinamen generieren
      const fileExtension = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
      const filename = `${nanoid()}.${fileExtension}`;
      
      // Pfad in Firebase Storage
      const fullPath = `${path}/${filename}`;
      const storageRef = ref(storage, fullPath);
      
      // Bild hochladen
      await uploadBytes(storageRef, blob);
      
      // Download-URL abrufen
      const downloadUrl = await getDownloadURL(storageRef);
      setIsProcessing(false);
      
      return downloadUrl;
    } catch (err) {
      setIsProcessing(false);
      const errorMsg = err instanceof Error 
        ? `Fehler beim Hochladen: ${err.message}` 
        : 'Unbekannter Fehler beim Hochladen';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, [croppedImage, outputFormat]);

  // Zustand zurücksetzen
  const resetImage = useCallback(() => {
    setCroppedImage(null);
    setError(null);
  }, []);

  return {
    croppedImage,
    isProcessing,
    error,
    cropImage,
    uploadCroppedImage,
    resetImage
  };
}

export default useImageCorper; 