// src/store/tutorialStore.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { isDev, FORCE_TUTORIAL } from '../utils/devUtils';
import { 
  type TutorialStore,
  TutorialCategory,
  type TutorialStepId,
  type TutorialEventName
} from '../types/tutorial';
import { TUTORIAL_CONTENT } from '../constants/tutorialContent';
import { isPWA } from '../utils/browserDetection';

export const useTutorialStore = create<TutorialStore>()(
  persist(
    (set, get) => ({
      // Initial State
      isActive: false,
      currentStepIndex: 0,
      hasCompletedTutorial: false,
      steps: TUTORIAL_CONTENT,
      tutorialUIBlocking: {
        settingsClose: false,
        calculatorClose: false,
        gameInfoClose: false,
        resultatKreidetafelClose: false
      },
      completedCategories: [],

      // Neuer State
      isHelpMode: false,
      activeEvents: new Set<TutorialEventName>(),

      // Actions
      setActive: (active: boolean) => set({ 
        isActive: active,
        currentStepIndex: active ? get().currentStepIndex : 0
      }),

      startTutorial: (stepId?: TutorialStepId, options?: { isHelpMode?: boolean }) => {
        if (!isDev && !isPWA()) return;
        
        const state = get();
        if (state.hasCompletedTutorial && !FORCE_TUTORIAL && !stepId) return;
        
        // Cleanup vorheriger Events
        state.cleanupStepEvents();

        set({
          isActive: true,
          isHelpMode: options?.isHelpMode ?? false,
          currentStepIndex: stepId 
            ? state.steps.findIndex(step => step.id === stepId)
            : 0
        });
      },

      endTutorial: (neverShowAgain: boolean) => {
        const state = get();
        state.cleanupStepEvents();
        set({
          isActive: false,
          isHelpMode: false,
          currentStepIndex: 0,
          hasCompletedTutorial: neverShowAgain
        });
      },

      nextStep: () => {
        const { steps, currentStepIndex } = get();
        const currentStep = steps[currentStepIndex];
        
        console.log('🎯 Tutorial nextStep:', {
          from: currentStep?.id,
          currentIndex: currentStepIndex,
          nextIndex: currentStepIndex + 1,
          nextStep: steps[currentStepIndex + 1]?.id
        });
        
        // 1. Erst onExit
        currentStep?.onExit?.();
        
        // 2. Navigation prüfen (mit Type Guard)
        if (currentStep?.navigation && 'next' in currentStep.navigation) {
          const nextNavigation = currentStep.navigation.next;
          if (nextNavigation?.targetStep) {
            const targetIndex = steps.findIndex(
              step => step.id === nextNavigation.targetStep
            );
            if (targetIndex !== -1) {
              set({ currentStepIndex: targetIndex });
              // 3. Dann onEnter des Ziel-Steps
              steps[targetIndex]?.onEnter?.();
              return;
            }
          }
        }
        
        // Standard-Navigation
        const nextIndex = currentStepIndex + 1;
        if (nextIndex < steps.length) {
          set({ currentStepIndex: nextIndex });
          steps[nextIndex]?.onEnter?.();
        }
      },

      previousStep: () => {
        const { steps, currentStepIndex } = get();
        const currentStep = steps[currentStepIndex];

        // Erst UI-Updates durchführen
        if (currentStep?.navigation?.back) {
          const targetStep = steps.find(
            step => step.id === currentStep.navigation?.back?.targetStep
          );
          if (targetStep?.onEnter) {
            targetStep.onEnter(); // UI-Updates VOR dem Step-Wechsel
          }
          
          // Dann erst den Step wechseln
          const targetIndex = steps.findIndex(
            step => step.id === currentStep.navigation?.back?.targetStep
          );
          if (targetIndex !== -1) {
            set({ currentStepIndex: targetIndex });
            return;
          }
        }

        // Fallback zur normalen Navigation
        if (currentStepIndex > 0) {
          const prevStep = steps[currentStepIndex - 1];
          if (prevStep.onEnter) {
            prevStep.onEnter();
          }
          set({ currentStepIndex: currentStepIndex - 1 });
        }
      },

      skipTutorial: () => set({ 
        isActive: false, 
        hasCompletedTutorial: true 
      }),

      getCurrentStep: () => {
        const { steps, currentStepIndex, isActive } = get();
        if (!isActive || !steps) return null;
        return steps[currentStepIndex];
      },

      resetTutorial: () => set({
        isActive: false,
        currentStepIndex: 0,
        hasCompletedTutorial: false
      }),

      setTutorialUIBlocking: (blocking: { [key: string]: boolean }) => 
        set((state): Partial<TutorialStore> => ({
          tutorialUIBlocking: {
            ...state.tutorialUIBlocking,
            ...blocking
          }
        })),

      markCategoryAsCompleted: (category: TutorialCategory) => 
        set(state => ({
          completedCategories: [...state.completedCategories, category]
        })),

      isCategoryCompleted: (category) => 
        get().completedCategories.includes(category),

      // Neue Actions
      exitHelpStep: () => {
        const state = get();
        if (state.isHelpMode) {
          state.cleanupStepEvents();
          set({
            isActive: false,
            isHelpMode: false,
            currentStepIndex: 0
          });
        }
      },

      cleanupStepEvents: () => {
        const state = get();
        
        // Cleanup alle registrierten Events
        state.activeEvents.forEach(eventName => {
          document.removeEventListener(eventName, () => {});
        });

        // UI-Blocking zurücksetzen
        set(state => ({
          activeEvents: new Set(),
          tutorialUIBlocking: {
            calculatorClose: false,
            gameInfoClose: false,
            settingsClose: false,
            resultatKreidetafelClose: false
          }
        }));
      },

      // Helper für Event-Registrierung
      registerEvent: (eventName: TutorialEventName) => {
        set(state => ({
          activeEvents: new Set([...state.activeEvents, eventName])
        }));
      }
    }),
    {
      name: isDev ? 'dev-tutorial-storage' : 'jass-tutorial-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        hasCompletedTutorial: state.hasCompletedTutorial,
        completedCategories: state.completedCategories
      })
    }
  )
);