/**
 * Background Image Optimizer
 * Optimiert automatisch große Bilder im Hintergrund ohne User-Interaktion
 */

import { compressImage } from './imageUtils';
import { uploadProfilePicture } from '@/services/authService';
import { uploadGroupLogo } from '@/services/groupService';
import { uploadTournamentLogoFirebase } from '@/services/tournamentService';

interface OptimizationTask {
  url: string;
  type: 'profile' | 'group' | 'tournament';
  userId?: string;
  groupId?: string;
  tournamentId?: string;
  priority: number; // 1 = high, 5 = low
}

class BackgroundImageOptimizer {
  private queue: OptimizationTask[] = [];
  private isProcessing = false;
  private optimizedUrls = new Set<string>();
  private maxFileSize = 300 * 1024; // 300KB threshold

  /**
   * Prüft ob ein Bild optimiert werden sollte und fügt es zur Queue hinzu
   */
  async checkAndQueue(
    imageUrl: string,
    type: 'profile' | 'group' | 'tournament',
    metadata: { userId?: string; groupId?: string; tournamentId?: string },
    priority: number = 3
  ): Promise<void> {
    if (!imageUrl || this.optimizedUrls.has(imageUrl)) return;
    try {
      const url = new URL(imageUrl);
      if (url.hostname !== 'firebasestorage.googleapis.com') return;
    } catch {
      return;
    }

    try {
      // Schnelle Größenprüfung via HEAD Request
      const response = await fetch(imageUrl, { 
        method: 'HEAD',
        // Timeout nach 3 Sekunden
        signal: AbortSignal.timeout(3000)
      });
      
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.maxFileSize) {
        const sizeKB = parseInt(contentLength) / 1024;
        console.log(`[BackgroundOptimizer] Queuing ${type} image for optimization: ${sizeKB.toFixed(1)}KB`);
        
        this.queue.push({
          url: imageUrl,
          type,
          ...metadata,
          priority
        });

        // Sortiere Queue nach Priorität
        this.queue.sort((a, b) => a.priority - b.priority);
        
        // Starte Verarbeitung wenn nicht bereits aktiv
        if (!this.isProcessing) {
          this.processQueue();
        }
      } else {
        // Bild ist bereits klein genug
        this.optimizedUrls.add(imageUrl);
      }
    } catch (error) {
      // Fehler ignorieren - Optimization ist optional
      console.debug(`[BackgroundOptimizer] Skipping ${imageUrl}:`, error);
    }
  }

  /**
   * Verarbeitet die Optimization-Queue im Hintergrund
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    console.log(`[BackgroundOptimizer] Processing ${this.queue.length} images...`);

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      
      try {
        await this.optimizeImage(task);
        this.optimizedUrls.add(task.url);
        
        // Pause zwischen Optimierungen (2 Sekunden)
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.warn(`[BackgroundOptimizer] Failed to optimize ${task.url}:`, error);
        this.optimizedUrls.add(task.url); // Nicht nochmal versuchen
      }
    }

    this.isProcessing = false;
    console.log(`[BackgroundOptimizer] Queue processed.`);
  }

  /**
   * Optimiert ein einzelnes Bild
   */
  private async optimizeImage(task: OptimizationTask): Promise<void> {
    console.log(`[BackgroundOptimizer] Optimizing ${task.type}: ${task.url}`);

    // Bild herunterladen
    const response = await fetch(task.url);
    const blob = await response.blob();
    const originalSize = blob.size;
    
    // Als File behandeln
    const file = new File([blob], 'optimized.jpg', { type: 'image/jpeg' });
    
    // Komprimieren (aggressiver für Background-Optimization)
    const compressedBlob = await compressImage(file, 400, 0.7);
    if (!compressedBlob) {
      throw new Error('Compression failed');
    }

    const compressedFile = new File([compressedBlob], 'optimized.jpg', { type: 'image/jpeg' });
    const newSize = compressedFile.size;
    const savings = ((originalSize - newSize) / originalSize) * 100;
    
    console.log(`[BackgroundOptimizer] Compressed: ${originalSize} → ${newSize} bytes (${savings.toFixed(1)}% saved)`);

    // Upload je nach Typ
    let newUrl: string;
    switch (task.type) {
      case 'profile':
        if (!task.userId) throw new Error('userId required for profile');
        await uploadProfilePicture(compressedFile, task.userId);
        newUrl = 'uploaded'; // uploadProfilePicture aktualisiert automatisch
        break;
        
      case 'group':
        if (!task.groupId) throw new Error('groupId required for group');
        newUrl = await uploadGroupLogo(task.groupId, compressedFile);
        break;
        
      case 'tournament':
        if (!task.tournamentId || !task.userId) throw new Error('tournamentId and userId required');
        newUrl = await uploadTournamentLogoFirebase(task.tournamentId, compressedFile, task.userId);
        break;
        
      default:
        throw new Error(`Unknown type: ${task.type}`);
    }

    console.log(`[BackgroundOptimizer] ✅ ${task.type} optimized successfully`);
  }

  /**
   * Fügt mehrere Bilder zur Optimization hinzu (für Batch-Processing)
   */
  async queueMultiple(images: {
    url: string;
    type: 'profile' | 'group' | 'tournament';
    metadata: { userId?: string; groupId?: string; tournamentId?: string };
  }[]): Promise<void> {
    for (const image of images) {
      await this.checkAndQueue(image.url, image.type, image.metadata, 4); // Niedrige Priorität für Batch
    }
  }

  /**
   * Gibt Queue-Status zurück
   */
  getStatus(): { queueLength: number; isProcessing: boolean; optimizedCount: number } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      optimizedCount: this.optimizedUrls.size
    };
  }

  /**
   * 🚀 NEU: Force Optimization für spezifische Bilder (ohne Größenprüfung)
   * Nützlich für manuell hochgeladene Bilder, die nicht automatisch optimiert wurden
   */
  async forceOptimize(
    imageUrl: string,
    type: 'profile' | 'group' | 'tournament',
    metadata: { userId?: string; groupId?: string; tournamentId?: string },
    priority: number = 1
  ): Promise<void> {
    if (!imageUrl || this.optimizedUrls.has(imageUrl)) {
      return;
    }

    console.log(`[BackgroundOptimizer] Force optimizing ${type} image: ${imageUrl}`);

    const task: OptimizationTask = {
      url: imageUrl,
      type,
      userId: metadata.userId,
      groupId: metadata.groupId,
      tournamentId: metadata.tournamentId,
      priority
    };

    // Füge mit hoher Priorität zur Queue hinzu
    this.queue.unshift(task);
    this.queue.sort((a, b) => a.priority - b.priority);

    // Starte Processing falls nicht bereits aktiv
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Pausiert Optimization (z.B. bei schwacher Verbindung)
   */
  pause(): void {
    this.queue.length = 0; // Leere Queue
    console.log('[BackgroundOptimizer] Paused');
  }
}

// Singleton Instance
export const backgroundOptimizer = new BackgroundImageOptimizer();

/**
 * Hook für React Components - prüft Bilder automatisch
 */
export const useBackgroundOptimization = () => {
  const optimizeProfileImage = async (imageUrl: string, userId: string) => {
    await backgroundOptimizer.checkAndQueue(imageUrl, 'profile', { userId }, 2);
  };

  const optimizeGroupLogo = async (imageUrl: string, groupId: string) => {
    await backgroundOptimizer.checkAndQueue(imageUrl, 'group', { groupId }, 2);
  };

  const optimizeTournamentLogo = async (imageUrl: string, tournamentId: string, userId: string) => {
    await backgroundOptimizer.checkAndQueue(imageUrl, 'tournament', { tournamentId, userId }, 2);
  };

  return {
    optimizeProfileImage,
    optimizeGroupLogo,
    optimizeTournamentLogo,
    getStatus: backgroundOptimizer.getStatus
  };
};

/**
 * Auto-Optimization für App-Start - optimiert wichtigste Bilder
 */
export const startAutoOptimization = async () => {
  // Nur bei guter Verbindung
  if ('connection' in navigator && (navigator as any).connection?.effectiveType === 'slow-2g') {
    console.log('[BackgroundOptimizer] Skipping on slow connection');
    return;
  }

  console.log('[BackgroundOptimizer] Starting auto-optimization...');
  
  // Hier könnten Sie die wichtigsten User-Bilder laden und zur Queue hinzufügen
  // Beispiel: aktuelle User-Gruppen, häufig angezeigte Profile, etc.
};

// 🧹 BEREINIGT: Spezifische Manual Image Fix entfernt - Problem gelöst!
// Das generische forceOptimize() System bleibt für zukünftige Nutzung verfügbar
