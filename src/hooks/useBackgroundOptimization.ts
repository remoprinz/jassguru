"use client";

import { useEffect } from 'react';
import { backgroundOptimizer } from '@/utils/backgroundImageOptimizer';
import { useAuthStore } from '@/store/authStore';
import { useGroupStore } from '@/store/groupStore';

/**
 * Hook für automatische Background-Optimization beim App-Start
 * Optimiert die wichtigsten Bilder des aktuellen Users
 */
export const useBackgroundOptimization = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { userGroups, currentGroup } = useGroupStore();

  useEffect(() => {
    if (!isAuthenticated() || !user) {
      return;
    }

    // Verzögerung, damit die App vollständig geladen ist
    const timer = setTimeout(async () => {


      const optimizationTasks: Array<{
        url: string;
        type: 'profile' | 'group' | 'tournament';
        metadata: { userId?: string; groupId?: string; tournamentId?: string };
      }> = [];

      // 1. User Profilbild (höchste Priorität)
      if (user.photoURL) {
        optimizationTasks.push({
          url: user.photoURL,
          type: 'profile',
          metadata: { userId: user.uid }
        });
      }

      // 2. Aktuell ausgewählte Gruppe (hohe Priorität)
      if (currentGroup?.logoUrl) {
        optimizationTasks.push({
          url: currentGroup.logoUrl,
          type: 'group',
          metadata: { groupId: currentGroup.id }
        });
      }

      // 3. Andere Gruppen des Users (niedrige Priorität)
      userGroups?.forEach(group => {
        if (group.logoUrl && group.id !== currentGroup?.id) {
          optimizationTasks.push({
            url: group.logoUrl,
            type: 'group',
            metadata: { groupId: group.id }
          });
        }
      });

      // 4. Häufig angezeigte Gruppenmitglieder (sehr niedrige Priorität)
      // TODO: Hier könnten Sie die Profilbilder der häufigsten Mitspieler hinzufügen

      if (optimizationTasks.length > 0) {

        await backgroundOptimizer.queueMultiple(optimizationTasks);
      }

      // 🧹 BEREINIGT: Manual Image Fix entfernt - Problematische Bilder wurden bereits optimiert

    }, 3000); // 3 Sekunden Verzögerung

    return () => clearTimeout(timer);
  }, [user, currentGroup, userGroups, isAuthenticated]);

  // Status für Debugging
  useEffect(() => {
    const interval = setInterval(() => {
      const status = backgroundOptimizer.getStatus();
      if (status.queueLength > 0 || status.isProcessing) {
        console.log('[BackgroundOptimizer Status]', status);
      }
    }, 10000); // Alle 10 Sekunden

    return () => clearInterval(interval);
  }, []);
};

/**
 * Hook für manuelle Optimization (z.B. für Admin-Tools)
 */
export const useManualOptimization = () => {
  const optimizeUserImages = async (userId: string, imageUrls: string[]) => {
    const tasks = imageUrls.map(url => ({
      url,
      type: 'profile' as const,
      metadata: { userId }
    }));
    
    await backgroundOptimizer.queueMultiple(tasks);
  };

  const optimizeGroupImages = async (groupId: string, logoUrl: string) => {
    if (logoUrl) {
      await backgroundOptimizer.queueMultiple([{
        url: logoUrl,
        type: 'group',
        metadata: { groupId }
      }]);
    }
  };

  const getOptimizationStatus = () => {
    return backgroundOptimizer.getStatus();
  };

  const pauseOptimization = () => {
    backgroundOptimizer.pause();
  };

  return {
    optimizeUserImages,
    optimizeGroupImages,
    getOptimizationStatus,
    pauseOptimization
  };
};
