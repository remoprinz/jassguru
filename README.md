# JassGuru

Die digitale Infrastruktur fuer den Schweizer Jass. Was als Kreidetafel begann, ist heute eine vollstaendige Plattform: Elo-Ratings, Spielerprofile, Gruppenranglisten, Turniere, Statistiken — alles offline-faehig, alles in Echtzeit.

**[jassguru.ch](https://jassguru.ch)**

## Was JassGuru kann

- **Digitale Kreidetafel** — Schieber-Punkteerfassung mit Z-Linie, Kreide-Textur und automatischer Strich-Berechnung nach Schweizer Regeln
- **Jass-Elo Rating** — eigenes Bewertungssystem mit K-Ramping, Tier-System (Bronze bis Grandmaster) und gruppenuebergreifendem Skill-Level
- **Spielerprofile** — persoenliche Statistiken, Elo-Verlauf, Spielhistorie
- **Gruppen & Ranglisten** — Gruppen erstellen, Mitspieler einladen, Elo-basierte Ranglisten
- **Turniere** — Turnierplanung und -durchfuehrung
- **Offline-First** — IndexedDB Sync Queue, funktioniert ohne Internet, synchronisiert bei Reconnect
- **PWA** — installierbar auf iOS, Android und Desktop

## Jass-Elo Rating System

Das Elo-System basiert auf dem klassischen Algorithmus mit Jass-spezifischen Anpassungen:

- **Performance-Metric:** Striche (wie Punkte im Tischtennis)
- **K-Rampe:** Neue Spieler starten mit 10% Volatilitaet, steigend auf 100% nach 50 Spielen
- **Zero-Sum:** Jedes Spiel verschiebt Rating-Punkte von Verlierern zu Gewinnern
- **Gruppenuebergreifend:** Ein globaler Skill-Level ueber alle Spielgruppen

| Rating | Tier | 
|--------|------|
| 2000+  | Grandmaster |
| 1800+  | Master |
| 1600+  | Diamond |
| 1400+  | Platin |
| 1300+  | Gold |
| 1200+  | Silber |
| <1200  | Bronze |

Details: [SPECIFICATION.md](SPECIFICATION.md)

## Tech Stack

- **Framework:** Next.js 16, React 19, TypeScript 5.9
- **Styling:** Tailwind CSS 3.4 + Custom Chalk Theme
- **State:** Zustand 5
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions)
- **Charts:** Chart.js 4 + chartjs-plugin-datalabels
- **UI:** Radix UI + Framer Motion
- **Export:** Static Export, PWA mit Custom Service Worker

## Development

```bash
npm install
npm run dev       # localhost:3000
npm run build     # Production Build
npm run lint      # ESLint
```

## Das JassGuru-Oekosystem

JassGuru ist das Herzstück eines groesseren Oekosystems fuer den Schweizer Jass:

| Projekt | Beschreibung |
|---------|-------------|
| **[JassGuru](https://jassguru.ch)** | Digitale Kreidetafel + Elo-System (dieses Repo) |
| [JassWiki](https://jasswiki.ch) | 520+ Artikel Jass-Enzyklopaedie, maschinenlesbar (Schema.org, Wikidata) |
| [Jassmeister](https://jassmeister.ch) | Turnierplattform |
| [JassAI](https://github.com/remoprinz/jassai) | Hybrid-KI: Convention Engine + PPO Self-Play |
| [Jasskalkulator](https://jasskalkulator.vercel.app) | Wahrscheinlichkeitsrechner (hypergeometrische Verteilung) |
| [Jassverband Schweiz](https://jassverband.ch) | Der Verband hinter dem Oekosystem |

## Lizenz

Alle Rechte vorbehalten. (c) 2025 Remo Prinz.
