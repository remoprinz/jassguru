import { FaDownload, FaInfoCircle, FaClock } from 'react-icons/fa';
import type { IconType } from 'react-icons';

// Exakt gleicher Content wie vorher
export const BROWSER_ONBOARDING = {
  iOS: {
    INSTALL_WELCOME: {
      title: "Installiere die Jassapp",
      message: "Füge sie jetzt deinem Homebildschirm hinzu. Die moderne Webapp funktioniert ganz ohne App Store!",
      icon: FaDownload as IconType
    },
    INSTALL_SHARE: {
      title: "Schritt 1",
      message: "Tippe auf das Teilen-Symbol.",
      icon: FaDownload as IconType,
      image: "/onboarding_pics/pfeilchenbox.png"
    },
    INSTALL_HOME: {
      title: "Schritt 2",
      message: "Scrolle hinunter und wähle \"Zum Home-Bildschirm\".",
      icon: FaDownload as IconType,
      image: "/onboarding_pics/zumhomebildschirm.png"
    },
    INSTALL_FINAL: {
      title: "Schritt 3",
      message: "Tippe auf \"Hinzufügen\".",
      icon: FaDownload as IconType,
      image: "/onboarding_pics/hinzufuegen.png"
    },
    INSTALL_DONE: {
      title: "Schritt 4",
      message: "Fertig! App öffnen und Jassen.",
      icon: FaDownload as IconType,
      image: "/onboarding_pics/homescreen.png"
    },
    FINAL_HINTS: {
      title: "Letzte Hinweise",
      message: "",
      icon: FaInfoCircle as IconType
    }
  },
  Android: {
    INSTALL_WELCOME: {
      title: "Installiere die Jassapp",
      message: "Füge sie jetzt deinem Homebildschirm hinzu. Die moderne Webapp funktioniert ganz ohne App Store!",
      icon: FaDownload as IconType
    },
    INSTALL_SHARE: {
      title: "Schritt 1",
      message: "Klicke auf die drei Punkte.",
      icon: FaDownload as IconType,
      image: "/onboarding_pics/android_menu.png"
    },
    INSTALL_HOME: {
      title: "Schritt 2",
      message: "Wähle \"Zum Startbildschirm hin...\"",
      icon: FaDownload as IconType,
      image: "/onboarding_pics/android_hinzufuegen.png"
    },
    INSTALL_FINAL: {
      title: "Schritt 3",
      message: "App öffnen und Jassen!",
      icon: FaDownload as IconType,
      image: "/onboarding_pics/homescreen.png"
    },
    FINAL_HINTS: {
      title: "Abschliessende\nHinweise",
      message: "Vermeide es, die App mehrfach zu installieren. Das kann zu unerwünschtem Verhalten führen.",
      secondaryMessage: "Beim ersten Öffnen der App wirst du durch alle wichtigen Funktionen geführt.",
      finalMessage: "Viel Spass beim Jassen!",
      icon: FaInfoCircle as IconType,
      image: "/welcome-guru.png"
    }
  }
};

export const APP_ONBOARDING = {
  INTRODUCTION: {
    title: "Willkommen zu Jassguru",
    message: "So bedienst du die Jasstafel:",
    icon: FaInfoCircle as IconType,
    list: [
      "Swipe nach unten/oben für das Menü. Dort kannst du die Einstellungen vornehmen",
      "Mit dem grünen Knopf im Menü öffnest du die Resultattafel und startest ein neues Spiel",
      "Halte die Seite des zählenden Spielers lange gedrückt, um die Punkte einzutragen",
      "Doppelklicke auf deine Seite für Spiel-Informationen, Berg und Bedanken",
      "Schreibe Weise durch Klicken auf die Z-Linie",
      "Navigiere durch die Spiel-Historie durch links/rechts Swipen und korrigiere Ergebnisse"
    ]
  },
  SCREEN_TIME: {
    title: "Bildschirmzeit einstellen",
    message: "Stelle die Bildschirmzeit auf mindestens 5 Minuten ein, damit die App während dem Jassen nicht ausgeht.",
    icon: FaClock as IconType
  }
}; 