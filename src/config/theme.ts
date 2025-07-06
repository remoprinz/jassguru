// Globales Theme-System für die Jasstafel App
// Hier können Sie die Hauptfarben zentral verwalten

import { getAuth } from "firebase/auth";

export type ThemeColor = 'green' | 'blue' | 'purple' | 'pink' | 'yellow' | 'teal' | 'orange' | 'cyan';

export interface ProfileThemeConfig {
  primary: string;        // Haupt-Tab-Navigation, Settings-Button
  primaryHover: string;   // Hover-Zustände
  accent: string;         // Balken und Akzente
  profileImage: string;   // ProfileImage-Hintergründe
  accentHex: string;      // NEU: Hex-Wert für Inline-Styles
}

// Verfügbare Farbthemen
export const THEME_COLORS: Record<ThemeColor, ProfileThemeConfig> = {
  green: {
    primary: 'bg-green-600',
    primaryHover: 'bg-green-700/80',
    accent: 'bg-green-500',
    profileImage: 'bg-green-600/20',
    accentHex: '#22c55e', // green-500
  },
  blue: {
    primary: 'bg-blue-600',
    primaryHover: 'bg-blue-700/80',
    accent: 'bg-blue-500',
    profileImage: 'bg-blue-600/20',
    accentHex: '#3b82f6', // blue-500
  },
  purple: {
    primary: 'bg-purple-600',
    primaryHover: 'bg-purple-700/80',
    accent: 'bg-purple-500',
    profileImage: 'bg-purple-600/20',
    accentHex: '#a855f7', // purple-500
  },
  pink: {
    primary: 'bg-pink-600',
    primaryHover: 'bg-pink-700/80',
    accent: 'bg-pink-500',
    profileImage: 'bg-pink-600/20',
    accentHex: '#ec4899', // pink-500
  },
  yellow: {
    primary: 'bg-yellow-600',
    primaryHover: 'bg-yellow-700/80',
    accent: 'bg-yellow-500',
    profileImage: 'bg-yellow-600/20',
    accentHex: '#eab308', // yellow-500
  },
  teal: {
    primary: 'bg-teal-600',
    primaryHover: 'bg-teal-700/80',
    accent: 'bg-teal-500',
    profileImage: 'bg-teal-600/20',
    accentHex: '#14b8a6', // teal-500
  },
  orange: {
    primary: 'bg-orange-600',
    primaryHover: 'bg-orange-700/80',
    accent: 'bg-orange-500',
    profileImage: 'bg-orange-600/20',
    accentHex: '#f97316', // orange-500
  },
  cyan: {
    primary: 'bg-cyan-600',
    primaryHover: 'bg-cyan-700/80',
    accent: 'bg-cyan-500',
    profileImage: 'bg-cyan-600/20',
    accentHex: '#06b6d4', // cyan-500
  },
};

// Aktuelle Theme-Farbe (Standard)
export const CURRENT_PROFILE_THEME: ThemeColor = 'blue';

// Dynamische Theme-Funktion, die Firebase UND localStorage berücksichtigt
export const getCurrentProfileTheme = (userProfileTheme?: string | null): ThemeColor => {
  // PRIORITÄT 1: User-spezifisches Theme aus Firebase (höchste Priorität)
  if (userProfileTheme && THEME_COLORS[userProfileTheme as ThemeColor]) {
    return userProfileTheme as ThemeColor;
  }
  
  // PRIORITÄT 2: Lokales Theme aus localStorage (Fallback für nicht-angemeldete)
  if (typeof window !== 'undefined') {
    const savedTheme = localStorage.getItem('jasstafel-profile-theme') as ThemeColor;
    if (savedTheme && THEME_COLORS[savedTheme]) {
      return savedTheme;
    }
  }
  
  // PRIORITÄT 3: Standard-Theme (finaler Fallback)
  return CURRENT_PROFILE_THEME;
};

// ✅ NEU: Dedizierte Funktion für ÖFFENTLICHE Profile - KEINE localStorage-Fallbacks!
export const getPublicProfileTheme = (playerProfileTheme?: string | null): ThemeColor => {
  // PRIORITÄT 1: AUSSCHLIESSLICH das Firebase-Theme des Spielers verwenden
  if (playerProfileTheme && THEME_COLORS[playerProfileTheme as ThemeColor]) {
    return playerProfileTheme as ThemeColor;
  }
  
  // PRIORITÄT 2: Nur bei fehlendem/ungültigem Theme → Default-Theme
  return CURRENT_PROFILE_THEME;
};

// Hook-ähnliche Funktion für React-Komponenten
export const useProfileTheme = () => {
  const currentTheme = getCurrentProfileTheme();
  return THEME_COLORS[currentTheme];
};

// Aktuelle Theme-Konfiguration abrufen
export const getProfileTheme = (): ProfileThemeConfig => {
  return THEME_COLORS[getCurrentProfileTheme()];
};

// CSS-Klassen für verschiedene Komponenten
export const getProfileThemeClasses = () => {
  const theme = getProfileTheme();
  
  return {
    // Tab-Navigation (Haupt-Tabs: Statistik/Archiv)
    mainTabActive: `data-[state=active]:${theme.primary} data-[state=active]:text-white data-[state=active]:shadow-md`,
    mainTabHover: `hover:${theme.primaryHover} hover:text-white`,
    
    // Sub-Tab-Navigation (Individual/Partner/Gegner)
    subTabActive: `data-[state=active]:${theme.primary} data-[state=active]:text-white`,
    subTabHover: `hover:${theme.primaryHover} hover:text-white`,
    
    // Buttons (Settings, etc.)
    buttonPrimary: `${theme.primary} border-${theme.primary.replace('bg-', '').replace('-600', '-700')} hover:${theme.primary.replace('-600', '-500')}`,
    
    // Balken bei Titeln
    accentBar: `${theme.accent}`,
    
    // ProfileImage-Hintergründe
    profileImageBg: theme.profileImage,
    
    // Text-Akzente (Datum-Links, etc.)
    textAccent: `text-${theme.accent.replace('bg-', '').replace('-500', '-400')}`,
  };
};

// Utility-Funktion zum schnellen Farben-Wechsel
export const switchProfileTheme = (newTheme: ThemeColor): void => {
  console.log(`🎨 Profil-Theme gewechselt zu: ${newTheme}`);
  console.log(`Um das Theme dauerhaft zu ändern, setzen Sie CURRENT_PROFILE_THEME in src/config/theme.ts auf '${newTheme}'`);
  
  // Hier könnten Sie zusätzliche Logik hinzufügen, um das Theme persistent zu speichern
  // z.B. in localStorage, Zustand Store, oder User-Einstellungen
};

// Hilfsfunktion für Entwickler - alle verfügbaren Themes anzeigen
export const listAvailableThemes = (): void => {
  console.log('🎨 Verfügbare Profil-Themes:');
  Object.keys(THEME_COLORS).forEach(theme => {
    console.log(`  - ${theme}`);
  });
  console.log(`\nAktuell aktiv: ${getCurrentProfileTheme()}`);
  console.log('\nUm das Theme zu ändern, verwenden Sie:');
  console.log('switchProfileTheme("purple") // oder eine andere Farbe');
};

// ANLEITUNG: WIE SIE DAS FARBTHEMA ÄNDERN
/* 
🎨 EINFACHES FARBTHEMA-WECHSELN:

1. SOFORT-WECHSEL (Line 60):
   Ändern Sie die Zeile: export const CURRENT_PROFILE_THEME: ThemeColor = 'green';
   zu z.B.:             export const CURRENT_PROFILE_THEME: ThemeColor = 'purple';

2. VERFÜGBARE FARBEN:
   - 'green'   (Standard)
   - 'blue'    (klassisch)
   - 'purple'  (violett, schön für Premium-Look)
   - 'red'     (kräftig)
   - 'yellow'  (fröhlich)
   - 'orange'  (orange)
- 'cyan'    (cyan)
   - 'pink'    (rosa)
   - 'teal'    (blaugrün)

3. WAS WIRD GEÄNDERT:
   ✅ Alle Tab-Navigationen (Statistik/Archiv, Individual/Partner/Gegner)
   ✅ Settings-Button und andere Primary-Buttons
   ✅ Alle Titel-Balken bei Statistik-Karten
   ✅ ProfileImage-Hintergründe
   ✅ Datum-Links und Akzent-Texte

4. BEISPIEL:
   Für ein elegantes violettes Theme:
   export const CURRENT_PROFILE_THEME: ThemeColor = 'purple';

   Für ein klassisches blaues Theme:
   export const CURRENT_PROFILE_THEME: ThemeColor = 'blue';

5. SOFORT SICHTBAR:
   Nach dem Speichern wird das neue Theme sofort in der App angezeigt!
*/

export default {
  THEME_COLORS,
  getCurrentProfileTheme,
  getProfileTheme,
  getProfileThemeClasses,
  switchProfileTheme,
  listAvailableThemes,
}; 