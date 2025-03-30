import { FaInfoCircle } from 'react-icons/fa';
import type { IconType } from 'react-icons';
import { IoIosDownload } from 'react-icons/io';

// 1. Definiere die Steps
export type BrowserOnboardingStep = 
  | 'WELCOME_SCREEN'
  | 'INSTALL_WELCOME'
  | 'INSTALL_SHARE'
  | 'INSTALL_HOME'
  | 'INSTALL_FINAL'
  | 'INSTALL_DONE'
  | 'FINAL_HINTS';

// OS-spezifische Steps
export type iOSBrowserStep = Extract<BrowserOnboardingStep, 
  | 'WELCOME_SCREEN'
  | 'INSTALL_WELCOME'
  | 'INSTALL_SHARE'
  | 'INSTALL_HOME'
  | 'INSTALL_FINAL'
  | 'INSTALL_DONE'
  | 'FINAL_HINTS'
>;

export type AndroidBrowserStep = Extract<BrowserOnboardingStep,
  | 'WELCOME_SCREEN'
  | 'INSTALL_WELCOME'
  | 'INSTALL_SHARE'
  | 'INSTALL_HOME'
  | 'INSTALL_FINAL'
  | 'FINAL_HINTS'
>;

// Step-Konstanten
export const IOS_BROWSER_STEPS = {
  WELCOME_SCREEN: 'WELCOME_SCREEN',
  INSTALL_WELCOME: 'INSTALL_WELCOME',
  INSTALL_SHARE: 'INSTALL_SHARE',
  INSTALL_HOME: 'INSTALL_HOME',
  INSTALL_FINAL: 'INSTALL_FINAL',
  INSTALL_DONE: 'INSTALL_DONE',
  FINAL_HINTS: 'FINAL_HINTS'
} as const;

export const ANDROID_BROWSER_STEPS = {
  WELCOME_SCREEN: 'WELCOME_SCREEN',
  INSTALL_WELCOME: 'INSTALL_WELCOME',
  INSTALL_SHARE: 'INSTALL_SHARE',
  INSTALL_HOME: 'INSTALL_HOME',
  INSTALL_FINAL: 'INSTALL_FINAL',
  FINAL_HINTS: 'FINAL_HINTS'
} as const;

// App Onboarding Steps hinzufügen (minimal)
export enum AppOnboardingStep {
  INTRODUCTION = 'INTRODUCTION'
}

// 2. Definiere die Content-Struktur
export interface OnboardingContent {
  title: string;
  message: string;
  icon?: IconType;
  image?: string;
  secondaryMessage?: string;
  finalMessage?: string;
  // Neue Desktop-spezifische Eigenschaften
  desktopTitle?: string;
  desktopMessage?: string;
  desktopSecondaryMessage?: string;
}

// 3. Der Content
// ... vorherige Types und Interfaces bleiben ...

export const BROWSER_ONBOARDING = {
  iOS: {
    WELCOME_SCREEN: {
      title: "Willkommen bei Jassguru",
      message: "Keine Diskussionen ums Zählen, keine Zeitverschwendung für Rechnereien, keine zerknitterten Zettel – hier kommt die digitale Jasstafel, die sich alles merkt und alles kann!",
      secondaryMessage: "Ihr macht die Stiche, ich schreib die Striche.",
      image: "/welcome-guru.png",
    },
    INSTALL_WELCOME: {
      title: "Jassguru in 3 Schritten",
      message: "Die moderne Jassguru-App funktioniert ganz ohne App Store. In drei einfachen Schritten bist du startklar:",
      image: "/welcome-guru.png",
      desktopTitle: "Mobile App installieren",
      desktopMessage: "Jassguru ist eine Mobile App. Scanne einfach diesen QR-Code mit der Kamera deines Telefons.",
      desktopSecondaryMessage: "Die App wird direkt in Deinem Browser geöffnet, wo Du sie mit wenigen Klicks installieren kannst.",
    },
    INSTALL_SHARE: {
      title: "Schritt 1",
      message: "Tippe auf das Teilen-Symbol.",
      image: "/onboarding_pics/pfeilchenbox.png"
    },
    INSTALL_HOME: {
      title: "Schritt 2",
      message: "Scrolle hinunter und wähle \"Zum Home-Bildschirm\".",
      image: "/onboarding_pics/zumhomebildschirm.png"
    },
    INSTALL_FINAL: {
      title: "Schritt 3",
      message: "Tippe auf \"Hinzufügen\".",
      image: "/onboarding_pics/hinzufuegen.png"
    },
    INSTALL_DONE: {
      title: "Fertig",
      message: "App öffnen und Jassen.",
      image: "/onboarding_pics/homescreen.png"
    },
    FINAL_HINTS: {
      title: "Letzte Hinweise",
      message: "",
      icon: FaInfoCircle as IconType
    }
  },
  Android: {
    WELCOME_SCREEN: {
      title: "Willkommen bei Jassguru",
      message: "Keine Diskussionen ums Zählen, keine Zeitverschwendung für Rechnereien, keine zerknitterten Zettel – hier kommt die digitale Jasstafel, die sich alles merkt und alles kann!",
      secondaryMessage: "Ihr macht die Stiche – ich schreib die Striche.",
      image: "/welcome-guru.png",
    },
    INSTALL_WELCOME: {
      title: "Jassguru in 3 Schritten",
      message: "Die moderne Jassguru-App funktioniert ganz ohne App Store. In drei einfachen Schritten bist du startklar:",
      icon: IoIosDownload,
      image: "/welcome-guru.png",
      desktopTitle: "Mobile App installieren",
      desktopMessage: "Jassguru funktioniert am besten als App auf Deinem Smartphone. Scanne einfach diesen QR-Code mit der Kamera Deines Telefons.",
      desktopSecondaryMessage: "Die App wird direkt in Deinem Browser geöffnet, wo Du sie mit wenigen Klicks installieren kannst.",
    },
    INSTALL_SHARE: {
      title: "Schritt 1",
      message: "Klicke auf die drei Punkte.",
      image: "/onboarding_pics/android_menu.png"
    },
    INSTALL_HOME: {
      title: "Schritt 2",
      message: "Wähle \"Zum Startbildschirm hin...\"",
      image: "/onboarding_pics/android_hinzufuegen.png"
    },
    INSTALL_FINAL: {
      title: "Schritt 3",
      message: "App öffnen und Jassen!",
      image: "/onboarding_pics/homescreen.png"
    },
    FINAL_HINTS: {
      title: "Abschliessende\nHinweise",
      message: "Vermeide es, die App mehrfach zu installieren. Das kann zu unerwünschtem Verhalten führen.",
      secondaryMessage: "Beim ersten Öffnen der App wirst du durch alle wichtigen Funktionen geführt.",
      finalMessage: "Viel Spass beim Jassen!",
      image: "/welcome-guru.png"
    }
  }
};
// 4. Hilfsfunktionen
export const hasImage = (content: OnboardingContent): content is OnboardingContent & { image: string } => {
  return 'image' in content;
}; 