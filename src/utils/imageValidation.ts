/**
 * Zentrale Bildvalidierung mit Support für alle modernen Formate
 * Inkl. HEIC/HEIF für iOS-Geräte
 */

// Erlaubte MIME-Types für Bilder
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif', // Moderne Alternative zu HEIC
] as const;

// Erlaubte Dateiendungen
export const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
  '.avif',
] as const;

/**
 * Validiert ob eine Datei ein erlaubtes Bildformat ist
 */
export function isValidImageFile(file: File): boolean {
  // Prüfe MIME-Type
  const isValidMimeType = ALLOWED_IMAGE_TYPES.includes(file.type as any);
  
  // Prüfe Dateiendung als Fallback (für HEIC/HEIF die manchmal falsche MIME-Types haben)
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ALLOWED_IMAGE_EXTENSIONS.some(ext => 
    fileName.endsWith(ext)
  );
  
  return isValidMimeType || hasValidExtension;
}

/**
 * Validiert Bildgröße
 * Standard: 5MB für alle Bildtypen (Profile, Logos, etc.)
 */
export function isValidImageSize(file: File, maxSizeMB: number = 5): boolean {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}

/**
 * Vollständige Bildvalidierung
 */
export function validateImageFile(
  file: File, 
  maxSizeMB: number = 5
): { isValid: boolean; error?: string } {
  
  if (!isValidImageFile(file)) {
    return {
      isValid: false,
      error: 'Bitte wählen Sie eine gültige Bilddatei (JPEG, PNG, WebP, GIF, HEIC, HEIF).'
    };
  }
  
  if (!isValidImageSize(file, maxSizeMB)) {
    return {
      isValid: false,
      error: `Die Datei ist zu groß (max. ${maxSizeMB} MB).`
    };
  }
  
  return { isValid: true };
}

/**
 * Hilfsfunktion für File-Input Accept-Attribut
 */
export function getImageAcceptString(): string {
  return ALLOWED_IMAGE_TYPES.join(', ');
}

/**
 * Prüft ob ein MIME-Type HEIC/HEIF ist
 */
export function isHEICFormat(mimeType: string): boolean {
  return mimeType === 'image/heic' || mimeType === 'image/heif';
}

/**
 * Erweiterte Validierung für spezifische Anwendungsfälle
 */
export interface ImageValidationOptions {
  maxSizeMB?: number;
  allowAnimated?: boolean;
  allowHEIC?: boolean;
  preferredFormats?: string[];
}

export function validateImageFileAdvanced(
  file: File,
  options: ImageValidationOptions = {}
): { isValid: boolean; error?: string; warnings?: string[] } {
  
  const {
    maxSizeMB = 5,
    allowAnimated = true,
    allowHEIC = true,
    preferredFormats = []
  } = options;
  
  const warnings: string[] = [];
  
  // Basis-Validierung
  const basicValidation = validateImageFile(file, maxSizeMB);
  if (!basicValidation.isValid) {
    return basicValidation;
  }
  
  // HEIC-Prüfung
  if (!allowHEIC && isHEICFormat(file.type)) {
    return {
      isValid: false,
      error: 'HEIC/HEIF-Dateien sind in diesem Kontext nicht erlaubt.'
    };
  }
  
  // GIF-Prüfung für Animation
  if (!allowAnimated && file.type === 'image/gif') {
    warnings.push('GIF-Dateien können animiert sein. Statische Formate werden bevorzugt.');
  }
  
  // Format-Empfehlungen
  if (preferredFormats.length > 0 && !preferredFormats.includes(file.type)) {
    const preferredList = preferredFormats.join(', ');
    warnings.push(`Empfohlene Formate: ${preferredList}`);
  }
  
  // HEIC-Kompatibilitätswarnung
  if (isHEICFormat(file.type)) {
    warnings.push('HEIC/HEIF-Dateien werden möglicherweise nicht in allen Browsern angezeigt.');
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
} 