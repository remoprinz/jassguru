// Globales Theme-System für die Jasstafel App
// Hier können Sie die Hauptfarben zentral verwalten

export type ThemeColor = 'green' | 'blue' | 'purple' | 'red' | 'yellow' | 'indigo' | 'pink' | 'teal';

export interface ProfileThemeConfig {
  primary: string;        // Haupt-Tab-Navigation, Settings-Button
  primaryHover: string;   // Hover-Zustände
  accent: string;         // Balken und Akzente
  profileImage: string;   // ProfileImage-Hintergründe
}

// Verfügbare Farbthemen
export const THEME_COLORS: Record<ThemeColor, ProfileThemeConfig> = {
  green: {
    primary: 'bg-green-600',
    primaryHover: 'bg-green-700/80',
    accent: 'bg-green-500',
    profileImage: 'bg-green-600/20',
  },
  blue: {
    primary: 'bg-blue-600',
    primaryHover: 'bg-blue-700/80',
    accent: 'bg-blue-500',
    profileImage: 'bg-blue-600/20',
  },
  purple: {
    primary: 'bg-purple-600',
    primaryHover: 'bg-purple-700/80',
    accent: 'bg-purple-500',
    profileImage: 'bg-purple-600/20',
  },
  red: {
    primary: 'bg-red-600',
    primaryHover: 'bg-red-700/80',
    accent: 'bg-red-500',
    profileImage: 'bg-red-600/20',
  },
  yellow: {
    primary: 'bg-yellow-600',
    primaryHover: 'bg-yellow-700/80',
    accent: 'bg-yellow-500',
    profileImage: 'bg-yellow-600/20',
  },
  indigo: {
    primary: 'bg-indigo-600',
    primaryHover: 'bg-indigo-700/80',
    accent: 'bg-indigo-500',
    profileImage: 'bg-indigo-600/20',
  },
  pink: {
    primary: 'bg-pink-600',
    primaryHover: 'bg-pink-700/80',
    accent: 'bg-pink-500',
    profileImage: 'bg-pink-600/20',
  },
  teal: {
    primary: 'bg-teal-600',
    primaryHover: 'bg-teal-700/80',
    accent: 'bg-teal-500',
    profileImage: 'bg-teal-600/20',
  },
};

// Aktuelle Theme-Farbe (Standard)
export const CURRENT_PROFILE_THEME: ThemeColor = 'indigo';

// Dynamische Theme-Funktion, die localStorage berücksichtigt
export const getCurrentProfileTheme = (): ThemeColor => {
  if (typeof window !== 'undefined') {
    const savedTheme = localStorage.getItem('jasstafel-profile-theme') as ThemeColor;
    if (savedTheme && THEME_COLORS[savedTheme]) {
      return savedTheme;
    }
  }
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
   - 'indigo'  (tiefblau)
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