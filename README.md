# Jass Kreidetafel

Dieses Projekt ist eine digitale Jass-Kreidetafel, entwickelt mit Next.js, TypeScript und Tailwind CSS.

## Repository

Dieses Projekt ist auf GitHub gehostet: [https://github.com/remo/jassguru.ch/tree/main/Jassguru/jasstafel]

## Produktive App

Die produktive Version der App ist unter [https://jassguru.web.app/](https://jassguru.web.app/) gehostet.

## Technische Spezifikation

Eine detaillierte technische Spezifikation der App finden Sie in der [SPECIFICATION.md](./SPECIFICATION.md) Datei.

## Lokale Entwicklung

Um das Projekt lokal zu starten, folgen Sie diesen Schritten:

1. Klonen Sie das Repository:
   ```
   git clone https://github.com/remo/jassguru.ch.git
   cd jassguru.ch/Jassguru/jasstafel
   ```

2. Installieren Sie die Abhängigkeiten:
   ```
   npm install
   ```

3. Starten Sie den Entwicklungsserver:
   ```
   npm run dev
   ```

   Die Anwendung ist nun unter [http://localhost:3000](http://localhost:3000) verfügbar.

## Jass-Elo Rating System

Die Jasstafel App verwendet ein eigenes **Jass-Elo Rating System** zur Bewertung der Spielerfertigkeiten. Das System basiert auf dem klassischen Elo-Algorithmus (siehe [Wikipedia: Elo-Zahl](https://de.wikipedia.org/wiki/Elo-Zahl)) mit Jass-spezifischen Anpassungen.

### Kernprinzipien

- **Wikipedia-konform**: Verwendet nur Striche als Performance-Metric (wie Punkte im Tischtennis)
- **K-Rampe**: Neue Spieler haben weniger Volatilität (10% Wirkung → 100% nach 50 Spielen)
- **Gruppenübergreifend**: Globaler Skill-Level unabhängig von der Spielgruppe
- **Zero-sum**: Jedes Spiel verschiebt Rating-Punkte von Verlierern zu Gewinnern

### Algorithmus

```typescript
// Erwartungswert (klassisches Elo)
E_A = 1 / (1 + 10^((Rating_B - Rating_A) / 400))

// Performance-Score (Striche-Anteil)
S = Striche_A / (Striche_A + Striche_B)

// K-Rampe für Stabilität
f(n) = 0.1 + 0.9 * min(1, n/50)
K_eff = 20 * f(Spiele_gespielt)

// Rating-Update
Δ_Rating = K_eff * (S - E)
```

### Tier-System

| Rating | Tier | Beschreibung |
|--------|------|--------------|
| 2000+ | Grandmaster | Elite-Spieler |
| 1800+ | Master | Hervorragende Spieler |
| 1600+ | Diamond | Sehr gute Spieler |
| 1400+ | Platin | Gute Spieler |
| 1300+ | Gold | Solide Spieler |
| 1200+ | Silber | Durchschnittliche Spieler |
| <1200 | Bronze | Anfänger |

### Rating-Berechnung

```bash
# Alle Gruppen neu berechnen
npm run calculate-ratings:games

# Spezifische Gruppe
npm run calculate-ratings:games:group [groupId]

# Reset & Neuberechnung
node scripts/resetAndRecalculate.cjs [groupId]
```

## Verfügbare Skripte

Im Projektverzeichnis können Sie folgende Befehle ausführen:

### Entwicklung

#### `npm run dev`

Startet den Entwicklungsserver. Öffnen Sie [http://localhost:3000](http://localhost:3000), um die Anwendung im Browser zu sehen.

#### `npm run build`

Erstellt eine optimierte Produktionsversion der Anwendung.

### `npm run lint`

Führt den Linter aus, um Codequalität und Stilkonsistenz zu überprüfen.

## Deployment

Das Projekt wird auf Firebase gehostet. Für das Deployment auf Firebase, stellen Sie sicher, dass Sie die Firebase CLI installiert haben und korrekt konfiguriert sind. Dann können Sie folgenden Befehl ausführen:

```
npm run deploy
```

## Projektstruktur

Die Projektstruktur folgt einem gut organisierten Muster:

```
/jasstafel
├── public/             # Statische Dateien, PWA-Manifest, Icons
├── src/
│   ├── assets/         # Bilder, Fonts und andere Assets
│   │   ├── auth/       # Authentifizierungskomponenten
│   │   ├── game/       # Spielbezogene Komponenten
│   │   ├── layout/     # Layoutkomponenten (z.B. JassKreidetafel)
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
│   ├── providers/      # Contextprovider
│   ├── pwa/            # PWA-spezifischer Code
│   ├── services/       # Externe Dienste (Firebase etc.)
│   ├── statistics/     # Statistikfunktionen
│   ├── store/          # Zustand-Stores
│   ├── styles/         # Globale Styles
│   ├── types/          # TypeScript-Typdefinitionen
│   └── utils/          # Hilfsfunktionen
└── ...
```

## Technologien

- Next.js 14+ mit App Router und Server Components
- React 18+ mit TypeScript
- Zustand für State Management
- Tailwind CSS für Styling
- Shadcn/UI & Radix UI für Komponenten
- React Hook Form mit Zod für Formulare
- Firebase (Authentication, Firestore, Hosting)

## PWA-Funktionalität

Die Anwendung ist als Progressive Web App (PWA) konfiguriert, was folgende Vorteile bietet:
- Offline-Nutzung
- Installierbarkeit auf mobilen Geräten
- Schnelleres Laden durch Caching
- Push-Benachrichtigungen (geplant)

## Hauptfunktionalitäten

- Digitale Jass-Kreidetafel für Punktetracking
- Automatische Berechnung von Strichen nach Schweizer Regeln
- Spielhistorie und Statistiken
- Benutzerprofile und Authentifizierung
- Offline-Funktionalität
- Einfache und intuitive Benutzeroberfläche

## Lizenz

Alle Rechte vorbehalten. Das geistige Eigentum an diesem Projekt gehört Remo Prinz. Jede Verwendung, Vervielfältigung oder Verbreitung der Software ohne ausdrückliche Genehmigung ist strengstens untersagt.

© 2025 Remo Prinz. Alle Rechte vorbehalten. 