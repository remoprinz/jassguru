import {TUTORIAL_STEPS} from "../types/tutorial";

export type TutorialComponent = "settings" | "calculator" | "gameInfo" | "splitContainer";

// Mapping von Steps zu Komponenten
export const TUTORIAL_COMPONENT_MAPPING: Record<string, TutorialComponent> = {
  // Settings Modal Steps
  [TUTORIAL_STEPS.SETTINGS]: "settings",
  [TUTORIAL_STEPS.SETTINGS_INTRO]: "settings",
  [TUTORIAL_STEPS.SETTINGS_CARDS]: "settings",
  [TUTORIAL_STEPS.SETTINGS_PICTOGRAMS]: "settings",
  [TUTORIAL_STEPS.SETTINGS_MULTIPLIER]: "settings",
  [TUTORIAL_STEPS.SETTINGS_CONFIGURE]: "settings",
  [TUTORIAL_STEPS.SETTINGS_NAVIGATE]: "settings",

  // Calculator Steps
  [TUTORIAL_STEPS.CALCULATOR]: "calculator",

  // Game Info Steps
  [TUTORIAL_STEPS.GAME_INFO]: "gameInfo",

  // Split Container Steps
  [TUTORIAL_STEPS.NEW_GAME]: "splitContainer",
  [TUTORIAL_STEPS.RESULTAT_INFO]: "splitContainer",
} as const;
