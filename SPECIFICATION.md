# JASSGURU KREIDETAFEL - TECHNISCHE SPEZIFIKATION

## 1. ÜBERSICHT UND ZWECK

Die "Jassguru Kreidetafel" ist eine Progressive Web Application (PWA), die als digitale Kreidetafel für das traditionelle Schweizer Jass-Kartenspiel dient. Die App ermöglicht es Spielern, den Spielstand zu verfolgen, Punkte zu berechnen und die Spielstatistiken zu speichern - ohne Papier und Bleistift.

### Primäre Funktionen:
- Digitale Erfassung und Anzeige von Jass-Punkten
- Automatische Berechnung von Strichen
- Spielerverwaltung mit Profilen
- Speichern und Fortsetzen von Spielen
- Offline-Nutzung als installierbare PWA
- Interaktive Tutorials und Onboarding

## 2. TECHNOLOGIE-STACK

### Frontend
- **Basis-Framework**: React 18+ mit Next.js 14+ (App Router)
- **State Management**: Zustand
- **UI-Bibliotheken**: 
  - Tailwind CSS für Styling
  - Shadcn/UI & Radix UI für Komponenten
  - Framer Motion für Animationen
- **Formular-Handling**: React Hook Form mit Zod-Validierung
- **Icons**: React Icons (FaIcons)
- **Screenshot/Sharing**: HTML2Canvas
- **Animation**: React Spring

### Backend/Dienste
- **Authentifizierung**: Firebase Authentication
- **Datenbank**: Firebase Firestore
- **Hosting**: Firebase Hosting
- **PWA-Funktionalität**: Service Worker mit Workbox

### Build und Entwicklung
- **Sprache**: TypeScript
- **Linting/Formatting**: ESLint, Prettier
- **Paketmanagement**: npm

## 3. ARCHITEKTUR

### Verzeichnisstruktur
```
/jasstafel
├── public/             # Statische Dateien, PWA-Manifest, Icons
├── src/
│   ├── assets/         # Bilder, Fonts und andere Assets
│   │   ├── auth/       # Authentifizierungskomponenten
│   │   ├── game/       # Spielbezogene Komponenten
│   │   ├── layout/     # Layoutkomponenten (z.B. JassKreidetafel)
│   │   ├── notifications/ # Benachrichtigungskomponenten
│   │   ├── onboarding/ # Onboarding-Komponenten
│   │   ├── statistics/ # Statistik-Komponenten
│   │   ├── tutorial/   # Tutorial-Komponenten
│   │   ├── ui/         # Basis-UI-Komponenten
│   │   └── ...
│   ├── config/         # Konfigurationsdateien
│   ├── constants/      # Konstanten und Enumerationen
│   ├── contexts/       # React Contexts
│   ├── game/           # Spiellogik
│   ├── hooks/          # Benutzerdefinierte React Hooks
│   ├── lib/            # Bibliotheken und Utilities
│   ├── notifications/  # Benachrichtigungssystem
│   ├── onboarding/     # Onboarding-Flows
│   ├── pages/          # Next.js-Seitenkomponenten
│   │   ├── jass/       # Jass-Hauptseite
│   │   ├── game/       # Spielseiten (neu, fortsetzen)
│   │   ├── profile/    # Profilseiten
│   │   └── ...
│   ├── providers/      # Contextprovider
│   ├── pwa/            # PWA-spezifischer Code
│   ├── services/       # Externe Dienste
│   │   ├── firebaseInit.ts  # Firebase-Initialisierung
│   │   ├── authService.ts   # Authentifizierungsdienste
│   │   └── ...
│   ├── statistics/     # Statistikfunktionen
│   ├── store/          # Zustand-Stores
│   │   ├── authStore.ts    # Authentifizierungszustand
│   │   ├── gameStore.ts    # Spielzustand
│   │   ├── jassStore.ts    # Übergeordneter Jass-Zustand
│   │   ├── uiStore.ts      # UI-Zustände
│   │   ├── timerStore.ts   # Zeiterfassung
│   │   ├── tutorialStore.ts # Tutorial-Zustand
│   │   └── ...
│   ├── styles/         # Globale Styles
│   ├── types/          # TypeScript-Typdefinitionen
│   │   ├── jass.ts        # Jass-spezifische Typen
│   │   ├── auth.ts        # Authentifizierungstypen
│   │   ├── notification.ts # Benachrichtigungstypen
│   │   ├── tutorial.ts    # Tutorial-Typen
│   │   └── ...
│   └── utils/          # Hilfsfunktionen
│       ├── browserDetection.ts # Browser-Erkennung
│       ├── devUtils.ts     # Entwicklungshilfsmittel
│       ├── jasssprueche.ts # Jass-bezogene Sprüche
│       ├── stricheCalculations.ts # Strich-Berechnungen
│       ├── teamCalculations.ts # Team-Berechnungen
│       └── ...
└── ...
```

### Datenfluss und State Management
Die Anwendung verwendet Zustand mit einer klaren Store-Struktur:

1. **authStore**: Authentifizierung und Benutzerprofil
   - Login-, Registrierungs- und Logout-Funktionen
   - Benutzerstatusinformationen (isAuthenticated, isGuest)
   - Nutzerprofildaten

2. **gameStore**: Spielablauf und aktuelle Spielpunkte
   - Verwaltung des aktiven Spiels
   - Spielstand (Punkte, Striche)
   - Rundenverwaltung

3. **jassStore**: Übergreifendes Jass-Session-Management
   - Spiele-Historie
   - Gesamtstand
   - Navigation zwischen Spielen

4. **uiStore**: UI-Zustände wie Menüs und Overlays
   - Menüzustände (isOpen, swipePosition)
   - Overlay-Positionen
   - Notification-Management
   - Resultatanzeige

5. **timerStore**: Zeiterfassung für Spielanalyse
   - Spielzeit
   - Rundenzeit
   - Spielanalyse

6. **tutorialStore**: Tutorial-Management
   - Tutorial-Fortschritt
   - Tutorial-Schritte
   - Aktivierungszustand

## 4. KERNFUNKTIONALITÄT: JASS-SPIELLOGIK

### Spielmodell
- **JassSession**: Übergeordnete Sitzung mit mehreren Spielen
- **GameEntry**: Individuelles Spiel mit Teams, Spielern und Spielstand
- **Teams**: Oben (top) und unten (bottom) mit jeweils zwei Spielern
- **Punkte und Striche**:
  - Jasspunkte (0-157 pro Runde)
  - Weispunkte (zusätzliche Punkte für besondere Kombinationen)
  - Striche-System:
    - Berg: Punkte 1-49
    - Strich: Punkte 50-99
    - Doppelstrich: Punkte 100+
    - Match: Alle Punkte einer Runde
    - Schneider: Gegner unter 21 Punkten

### Spielablauf
1. **Spielstart**: Eingabe von Spielernamen, Startspieler auswählen
2. **Punkteeingabe**: Über Calculator-Komponente
3. **Weis-Punkte**: Zusätzliche Punkte für besondere Kartenkombinationen
4. **Automatische Strichberechnung**: Basierend auf Schweizer Jass-Regeln
5. **Rundenabschluss**: Anzeige des Ergebnisses in ResultatKreidetafel
6. **Spielhistorie und Navigation**: Zwischen verschiedenen Runden/Spielen

## 5. BENUTZEROBERFLÄCHE UND INTERAKTIONSKONZEPT

### Haupt-UI-Komponenten
- **JassKreidetafel**: Hauptansicht der App, zeigt die Kreidetafel
  - Split-Container für oberes und unteres Team
  - Z-Shape für traditionelles Kreidetafel-Design
  - Strich-Anzeige für die Punkte

- **Calculator**: Eingabe von Punkten
  - Numerische Tastatur
  - Weis-Punkteeingabe
  - Bestätigungs- und Abbruchfunktionen

- **ResultatKreidetafel**: Ergebnisanzeige
  - Statistiken (Striche, Jasspunkte)
  - Spielerverwaltung
  - Navigation zwischen Spielen
  - Sharing-Funktionalität

- **Menü- und Benachrichtigungssystem**:
  - MenuOverlay für Navigation
  - GlobalNotificationContainer für Benachrichtigungen
  - JassFinishNotification für Spielabschluss
  - NewGameWarning für Neustartbestätigung

### Benutzerinteraktionen
- **Touchgesten**:
  - Swipe: Navigation zwischen Ansichten
  - Long-Press: Öffnen des Calculators
  - Double-Tap: Spezialfunktionen

- **Animationen und Übergänge**:
  - React Spring für flüssige Animationen
  - Framer Motion für Menü- und Notification-Animationen
  - CSS-Transitionen für UI-Feedback

### Responsive Design
- Mobile-First-Ansatz
- Anpassungsfähigkeit an verschiedene Bildschirmgrößen
- PWA-Optimierung für mobile Geräte

## 6. TUTORIAL UND ONBOARDING

### Tutorial-System
- Schrittweises interaktives Tutorial
- Kontextbezogene Hilfestellungen
- Fortschrittserfassung im tutorialStore

### Onboarding
- Ersterlebnis-Optimierung
- Browser-spezifisches Onboarding
- PWA-Installation-Anleitung

## 7. STATISTIK UND ANALYSE

### Statistikmodule
- StricheStatistik: Analyse der Striche pro Team
- JasspunkteStatistik: Analyse der erzielten Punkte

### Analysen
- Spielverlauf-Tracking
- Team-Performance-Auswertung
- Match-Statistiken
- Zeiterfassung für Spielanalyse

## 8. NOTIFICATION UND FEEDBACK

### Benachrichtigungssystem
- Verschiedene Notification-Typen (Warnung, Erfolg, Info)
- JassFinishNotification für Spielabschluss
- NewGameWarning für Spielneustarts
- GlobalNotificationContainer als zentraler Manager

### Feedback und Sharing
- Screenshot-Funktion mit html2canvas
- Teilen über Web Share API
- Jass-spezifische Sprüche und Feedback

## 9. PWA-FUNKTIONALITÄT

### Bereits implementierte Features
- Installierbarkeit auf Startbildschirm
- Offline-Funktionsfähigkeit
- Angepasste App-Icons
- Touch-optimierte Oberfläche

### Geplante Erweiterungen
- Push-Benachrichtigungen
- Verbesserte Offline-Synchronisation
- Background-Sync für Daten

## 10. SICHERHEIT UND DATEN

### Authentifizierung
- Firebase Authentication
- Gastlogin für schnellen Zugang
- Benutzerprofilverwaltung

### Datenspeicherung
- Firebase Firestore für Spielstände
- Lokale Speicherung für Offline-Funktionalität
- Synchronisation zwischen Geräten (geplant)

## 11. PERFORMANCE-OPTIMIERUNG

### Performance-Strategien
- Lazy-Loading von Komponenten
- Memoization für wiederholte Berechnungen
- Optimierte Re-Rendering-Strategien
- Effiziente State-Updates mit Zustand

### PWA-Optimierungen
- Caching-Strategien
- Minimierung der Bundle-Größe
- Bild-Optimierung

## 12. ZUKUNFTSENTWICKLUNG UND ERWEITERUNGSMÖGLICHKEITEN

### Geplante Features
- Erweiterte Statistiken und Analysen
- Verbesserte Offline-Funktionalität
- Multiplayer-Modus für Remote-Spiele
- Turniermodus
- Integration mit anderen Jass-Plattformen
- KI-basierte Analyse und Vorschläge

## 13. ARCHITEKTURELLE ÜBERLEGUNGEN

### Coding-Standards
- Funktionale Komponenten mit Hooks
- Strikte TypeScript-Typisierung
- Immutable State-Updates
- Komponentenisolation und Wiederverwendbarkeit

### Performance-Prinzipien
- Minimierung von Side-Effects
- Optimierte Rendering-Zyklen
- Effiziente Datenflusskontrolle
- Caching und Memoization

## 14. ENTWICKLERRICHTLINIEN

### Best Practices
- Komponentenorientierte Entwicklung
- TypeScript für alle Komponenten und Funktionen
- Sorgfältige Verwaltung von State und Props
- Konsistente Fehlerbehandlung
- Dokumentation durch JSDoc-Kommentare

### Coding-Konventionen
- **Namenskonventionen**:
  - Komponenten: PascalCase
  - Funktionen: camelCase
  - Types/Interfaces: PascalCase
  - Konstanten: UPPERCASE oder PascalCase
- **Dateistruktur**: Eine Komponente pro Datei
- **Importe**: Sortierung nach externen und internen Importen

## 15. TESTING UND QUALITÄTSSICHERUNG

### Testing-Strategien
- Komponententests mit Jest und React Testing Library
- Manuelle UI-Tests
- Typsicherheit durch TypeScript

### Qualitätssicherung
- Linting mit ESLint
- Formatierung mit Prettier
- TypeScript-Überprüfung
- Code-Reviews

## 16. ABSCHLIESSENDE BEMERKUNGEN

Die Jassguru Kreidetafel kombiniert moderne Webtechnologien mit dem traditionellen Schweizer Jass-Spiel und bietet eine intuitive, benutzerfreundliche digitale Alternative zu Papier und Stift. Die App ist darauf ausgelegt, sowohl Gelegenheitsspielern als auch erfahrenen Jassern ein optimales Erlebnis zu bieten.

Die durchdachte Architektur ermöglicht zukünftige Erweiterungen und Verbesserungen, während die PWA-Funktionalität sicherstellt, dass die App auf verschiedenen Geräten und unter verschiedenen Netzwerkbedingungen zuverlässig funktioniert.

Durch die Verwendung moderner Frameworks und Libraries wird eine hohe Performance und Wartbarkeit gewährleistet, während die benutzerfreundliche Oberfläche ein angenehmes Spielerlebnis garantiert.

© 2023-2024 Remo Prinz. Alle Rechte vorbehalten. 