// src/store/tutorialStore.ts

import {create} from "zustand";
import {persist, createJSONStorage} from "zustand/middleware";
import {isDev, FORCE_TUTORIAL} from "../utils/devUtils";
import {
  type TutorialStore,
  TutorialCategory,
  type TutorialStepId,
  type TutorialEventName,
} from "../types/tutorial";
import {TUTORIAL_CONTENT} from "../constants/tutorialContent";
import {isPWA} from "../utils/browserDetection";
// Name des Storage-Keys für die Persistenz
const TUTORIAL_STORAGE_KEY = isDev ? "dev-tutorial-storage" : "jass-tutorial-storage";

// Direct access functions for LocalStorage to bypass persist middleware
const directlyGetHasCompletedTutorial = (): boolean => {
  // Check if we're in the browser (localStorage is available)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    console.log("[TutorialStore] directlyGetHasCompletedTutorial: localStorage nicht verfügbar (SSR)");
    return false;
  }
  
  try {
    const storageData = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!storageData) {
      console.log("[TutorialStore] directlyGetHasCompletedTutorial: Kein Eintrag im LocalStorage");
      return false;
    }
    const data = JSON.parse(storageData);
    const hasCompleted = data?.state?.hasCompletedTutorial === true;
    console.log(`[TutorialStore] directlyGetHasCompletedTutorial: Wert aus LocalStorage = ${hasCompleted}`);
    return hasCompleted;
  } catch (error) {
    console.error("[TutorialStore] directlyGetHasCompletedTutorial: Fehler beim Lesen:", error);
    return false;
  }
};

// Hilfsfunktion zum direkten Speichern des hasCompletedTutorial-Status
const saveCompletedStatus = (completed: boolean): void => {
  // Check if we're in the browser (localStorage is available)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    console.log("[TutorialStore] saveCompletedStatus: localStorage nicht verfügbar (SSR)");
    return;
  }
  
  try {
    const storageData = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    const data = storageData ? JSON.parse(storageData) : {};
    
    // Aktualisiere nur den hasCompletedTutorial-Wert
    data.state = {
      ...data.state,
      hasCompletedTutorial: completed
    };
    
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(data));
    console.log(`[TutorialStore] hasCompletedTutorial gespeichert: ${completed}`, 2);
    
    // Überprüfe sofort nach dem Speichern, ob der Wert korrekt gesetzt wurde
    const verifyStorage = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    const verifyData = verifyStorage ? JSON.parse(verifyStorage) : {};
    const verifyValue = verifyData?.state?.hasCompletedTutorial === true;
    console.log(`[TutorialStore] VERIFY nach Speichern: hasCompletedTutorial = ${verifyValue}`);
  } catch (error) {
    console.error("[TutorialStore] Fehler beim Speichern des Tutorial-Status:", error);
  }
};

export const useTutorialStore = create<TutorialStore>()(
  persist(
    (set, get) => ({
      // Initial State
      isActive: false,
      currentStepIndex: 0,
      hasCompletedTutorial: false,
      hasSeenTutorialThisSession: false,
      steps: TUTORIAL_CONTENT,
      tutorialUIBlocking: {
        settingsClose: false,
        calculatorClose: false,
        gameInfoClose: false,
        resultatKreidetafelClose: false,
      },
      completedCategories: [],

      // Neuer State
      isHelpMode: false,
      activeEvents: new Set<TutorialEventName>(),
      lastNextStepTime: undefined,

      // Actions
      setActive: (active: boolean) => set({
        isActive: active,
        currentStepIndex: active ? get().currentStepIndex : 0,
      }),

      startTutorial: (stepId?: TutorialStepId, options?: { isHelpMode?: boolean }) => {
        // Get fresh state *immediately* for the decision
        const currentState = get();
        
        // Zusätzlich eine direkte Prüfung im LocalStorage
        const directCheck = directlyGetHasCompletedTutorial();
        
        console.log(`[TutorialStore] startTutorial: Prüfung - store.hasCompleted=${currentState.hasCompletedTutorial}, direkter Check=${directCheck}, sessionSeen=${currentState.hasSeenTutorialThisSession}, FORCE=${FORCE_TUTORIAL}, options.isHelpMode=${options?.isHelpMode}, stepId=${stepId || 'none'}`);

        // 🔧 KRITISCHER FIX: Session-Check IMMER machen (auch bei FORCE_TUTORIAL)
        if (!options?.isHelpMode && !stepId && currentState.hasSeenTutorialThisSession) {
          console.log("[TutorialStore] startTutorial: Verhindert durch hasSeenTutorialThisSession=true (bereits in dieser Session beendet).");
          return;
        }

        // 🔧 KRITISCHER FIX: Completed-Check nur wenn NICHT FORCE_TUTORIAL
        if (!options?.isHelpMode && !stepId && !FORCE_TUTORIAL) {
          // Permanent abgeschlossen (Checkbox war mal aktiviert)
          if (currentState.hasCompletedTutorial || directCheck) {
            console.log("[TutorialStore] startTutorial: Verhindert durch hasCompletedTutorial=true (Checkbox war aktiviert).");
            return;
          }
        }

        // 🔧 KRITISCH: Tutorial nur in PWAs zeigen (oder im Dev-Mode mit FORCE_TUTORIAL)
        if (!isDev && !isPWA()) {
          console.log("[TutorialStore] startTutorial: Verhindert durch !isDev && !isPWA() - Tutorial nur in PWAs erlaubt.");
          return;
        }
        
        // Cleanup previous events - ensure this is called only if we proceed
        currentState.cleanupStepEvents();

        let startStepIndex = 0;
        
        if (stepId) {
          // Wenn eine spezifische Step-ID angegeben ist (Help-Mode)
          startStepIndex = currentState.steps.findIndex((step) => step.id === stepId);
        }

        set({
          isActive: true,
          isHelpMode: options?.isHelpMode ?? false,
          currentStepIndex: Math.max(0, startStepIndex),
          hasSeenTutorialThisSession: true, // 🔧 KRITISCH: Immer setzen wenn Tutorial gestartet wird
        });
      },

      endTutorial: (neverShowAgain: boolean) => {
        const state = get();
        state.cleanupStepEvents();
        
        // Speichere den Status sofort im LocalStorage
        if (neverShowAgain) {
          saveCompletedStatus(true);
        }
        
        console.log(`[TutorialStore] endTutorial: neverShowAgain=${neverShowAgain}, hasCompletedTutorial wird auf ${neverShowAgain} gesetzt, hasSeenTutorialThisSession bleibt true (außer bei Help-Mode)`);
        
        set({
          isActive: false,
          isHelpMode: false,
          currentStepIndex: 0,
          hasCompletedTutorial: neverShowAgain,
          // hasSeenTutorialThisSession bleibt true - Tutorial soll in aktueller Session nicht mehr erscheinen
        });
      },


      
      // Neue Methode zum direkten Setzen des hasCompletedTutorial-Status
      setHasCompletedTutorial: (completed: boolean) => {
        console.log(`[TutorialStore] setHasCompletedTutorial aufgerufen mit: ${completed}`);
        saveCompletedStatus(completed);
        set({ hasCompletedTutorial: completed });
      },

      nextStep: () => {
        const {steps, currentStepIndex} = get();
        const currentStep = steps[currentStepIndex];

        // 🚨 NOTFALL-DEBOUNCING: Verhindere mehrfache nextStep-Aufrufe
        const now = Date.now();
        const lastTime = get().lastNextStepTime;
        if (lastTime && now - lastTime < 100) {
          console.log("🚨 [nextStep] BLOCKED - zu schneller Aufruf!");
          return;
        }
        
        // Debug-Logging für Tutorial-Navigation
        console.log("🎯 Tutorial nextStep:", {
          from: currentStep?.id,
          fromOrder: currentStep?.order,
          currentIndex: currentStepIndex,
          nextIndex: currentStepIndex + 1,
          nextStep: steps[currentStepIndex + 1]?.id,
          nextStepOrder: steps[currentStepIndex + 1]?.order,
          category: currentStep?.category,
        });
        
        // Setze Timestamp für diesen nextStep-Aufruf
        set({ lastNextStepTime: now });

        // 1. Erst onExit
        currentStep?.onExit?.();

        // 2. Navigation prüfen (mit Type Guard)
        if (currentStep?.navigation && "next" in currentStep.navigation) {
          const nextNavigation = currentStep.navigation.next;
          if (nextNavigation?.targetStep) {
            const targetIndex = steps.findIndex(
              (step) => step.id === nextNavigation.targetStep
            );
            if (targetIndex !== -1) {
              set({currentStepIndex: targetIndex});
              // 3. Dann onEnter des Ziel-Steps
              steps[targetIndex]?.onEnter?.();
              return;
            }
          }
        }

        // Standard-Navigation
        const nextIndex = currentStepIndex + 1;
        if (nextIndex < steps.length) {
          set({currentStepIndex: nextIndex});
          steps[nextIndex]?.onEnter?.();
        }
      },

      previousStep: () => {
        const {steps, currentStepIndex} = get();
        const currentStep = steps[currentStepIndex];

        // Erst UI-Updates durchführen
        if (currentStep?.navigation?.back) {
          const targetStep = steps.find(
            (step) => step.id === currentStep.navigation?.back?.targetStep
          );
          if (targetStep?.onEnter) {
            targetStep.onEnter(); // UI-Updates VOR dem Step-Wechsel
          }

          // Dann erst den Step wechseln
          const targetIndex = steps.findIndex(
            (step) => step.id === currentStep.navigation?.back?.targetStep
          );
          if (targetIndex !== -1) {
            set({currentStepIndex: targetIndex});
            return;
          }
        }

        // Fallback zur normalen Navigation
        if (currentStepIndex > 0) {
          const prevStep = steps[currentStepIndex - 1];
          if (prevStep.onEnter) {
            prevStep.onEnter();
          }
          set({currentStepIndex: currentStepIndex - 1});
        }
      },

      skipTutorial: () => set({
        isActive: false,
        hasCompletedTutorial: true,
      }),

      getCurrentStep: () => {
        const {steps, currentStepIndex, isActive} = get();
        if (!isActive || !steps) return null;
        return steps[currentStepIndex];
      },

      resetTutorial: () => set({
        isActive: false,
        currentStepIndex: 0,
        hasCompletedTutorial: false,
        hasSeenTutorialThisSession: false,
      }),

      setTutorialUIBlocking: (blocking: { [key: string]: boolean }) =>
        set((state): Partial<TutorialStore> => ({
          tutorialUIBlocking: {
            ...state.tutorialUIBlocking,
            ...blocking,
          },
        })),

      markCategoryAsCompleted: (category: TutorialCategory) =>
        set((state) => ({
          completedCategories: [...state.completedCategories, category],
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
            currentStepIndex: 0,
            // 🔧 WICHTIG: hasSeenTutorialThisSession NICHT setzen bei Help-Mode!
            // Help-Mode soll das normale Tutorial nicht blockieren
          });
        }
      },

      cleanupStepEvents: () => {
        const state = get();

        // Cleanup alle registrierten Events
        state.activeEvents.forEach((eventName) => {
          document.removeEventListener(eventName, () => {});
        });

        // UI-Blocking zurücksetzen
        set((state) => ({
          activeEvents: new Set(),
          tutorialUIBlocking: {
            calculatorClose: false,
            gameInfoClose: false,
            settingsClose: false,
            resultatKreidetafelClose: false,
          },
        }));
      },

      // Helper für Event-Registrierung
      registerEvent: (eventName: TutorialEventName) => {
        set((state) => ({
          activeEvents: new Set([...state.activeEvents, eventName]),
        }));
      },
    }),
    {
      name: isDev ? "dev-tutorial-storage" : "jass-tutorial-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        hasCompletedTutorial: state.hasCompletedTutorial,
        completedCategories: state.completedCategories,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          console.log(`[TutorialStore] Rehydrate: hasCompletedTutorial = ${state.hasCompletedTutorial}`);
        } else {
          console.log(`[TutorialStore] Rehydrate: State nicht verfügbar`);
        }
      }
    }
  )
);

// Beim Import des Moduls Direkten Check ausführen
console.log(`[TutorialStore] Modul-Initialisierung, direkter LocalStorage-Check: hasCompletedTutorial = ${directlyGetHasCompletedTutorial()}`);
