# JassGuru

The digital infrastructure for Swiss Jass. What started as a chalk scoreboard is now a full platform: Elo ratings, player profiles, group leaderboards, tournaments, statistics — all offline-capable, all in real-time.

**[jassguru.ch](https://jassguru.ch)**

## Features

- **Digital Scoreboard** — Schieber score tracking with Z-line, chalk texture, and automatic score calculation following Swiss rules
- **Jass-Elo Rating** — custom rating system with K-ramping, tier system (Bronze to Grandmaster), and cross-group skill levels
- **Player Profiles** — personal statistics, Elo history, game archive
- **Groups & Leaderboards** — create groups, invite players, Elo-based rankings
- **Tournaments** — tournament planning and execution
- **Offline-First** — IndexedDB sync queue, works without internet, syncs on reconnect
- **PWA** — installable on iOS, Android, and desktop

## Jass-Elo Rating System

Custom Elo algorithm with Jass-specific adaptations:

- **Performance metric:** Striche (lines) — like points in table tennis
- **K-ramp:** New players start at 10% volatility, rising to 100% after 50 games
- **Zero-sum:** Every game shifts rating points from losers to winners
- **Cross-group:** One global skill level across all play groups

| Rating | Tier |
|--------|------|
| 2000+ | Grandmaster |
| 1800+ | Master |
| 1600+ | Diamond |
| 1400+ | Platinum |
| 1300+ | Gold |
| 1200+ | Silver |
| <1200 | Bronze |

Details: [SPECIFICATION.md](SPECIFICATION.md)

## Tech Stack

- **Framework:** Next.js 16, React 19, TypeScript 5.9
- **Styling:** Tailwind CSS 3.4 + custom chalk theme
- **State:** Zustand 5
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions)
- **Charts:** Chart.js 4 + chartjs-plugin-datalabels
- **UI:** Radix UI + Framer Motion
- **Export:** Static export, PWA with custom service worker

## Development

```bash
npm install
npm run dev       # localhost:3000
npm run build     # Production build
npm run lint      # ESLint
```

## The JassGuru Ecosystem

JassGuru is the centerpiece of a broader ecosystem for Swiss Jass:

| Project | Description |
|---------|-------------|
| **[JassGuru](https://jassguru.ch)** | Digital scoreboard + Elo system (this repo) |
| [JassWiki](https://jasswiki.ch) | 520+ article Jass encyclopedia, machine-readable (Schema.org, Wikidata) |
| [Jassmeister](https://jassmeister.ch) | Tournament platform |
| [JassAI](https://github.com/remoprinz/jassai) | Hybrid AI: convention engine + PPO self-play |
| [Jasskalkulator](https://jasskalkulator.vercel.app) | Probability calculator (hypergeometric distribution) |
| [Swiss Jass Federation](https://jassverband.ch) | The federation behind the ecosystem |

## License

All rights reserved. (c) 2025 Remo Prinz.
