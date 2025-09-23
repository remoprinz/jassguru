<div align="center">

# jassguru.ch — Digital Jass Scoreboard (PWA)

[![CI](https://img.shields.io/github/actions/workflow/status/remoprinz/jassguru/ci.yml?branch=main&label=CI)](https://github.com/remoprinz/jassguru/actions)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/remoprinz/jassguru/codeql.yml?branch=main&label=CodeQL)](https://github.com/remoprinz/jassguru/actions)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A3FFF.svg)](https://jassguru.ch)

Live App • https://jassguru.ch  
Feature Tour • https://jassguru.ch/features/  
Demo Group • https://jassguru.ch/view/group/Tz0wgIHMTlhvTtFastiJ  
Example Profile • https://jassguru.ch/profile/b16c1120111b7d9e7d733837  
Chat • https://chat.jassguru.ch

</div>

jassguru.ch transforms the traditional Swiss Jass chalkboard into a modern, installable Progressive Web App. It offers offline‑first UX, real‑time sync with Firebase, and a clean, accessible UI.

## Highlights
- Installable PWA (offline support, update flow)
- Real‑time data via Firebase (Auth + Firestore with offline persistence)
- Modern stack: Next.js 14 (static export), React 18, TypeScript, Tailwind + shadcn/radix UI
- Robust state management with Zustand + Immer
- Player stats, groups, tournaments, and an Elo‑style rating system (Jass‑specific)

---

## Quickstart (Evaluation‑Only)
You may run the code locally for evaluation, learning, or review.

```bash
# Clone (evaluation only)
git clone https://github.com/remoprinz/jassguru.git
cd jassguru/jasstafel

# Install dependencies
npm install

# Start dev server
npm run dev
# open http://localhost:3000
```

Environment variable (for script usage only):
```bash
# Never commit secrets; use a domain‑restricted browser key
FIREBASE_API_KEY=your_restricted_browser_key
```

> Usage Terms (short): Viewing and local evaluation are allowed. Forks, deployments, derivative works, and any commercial use are prohibited without prior written consent from the author. See “Usage Terms” below.

---

## Architecture (Overview)
- Frontend: Next.js 14 (static export), React 18, TypeScript
- UI: Tailwind + shadcn/radix UI, accessible and responsive
- State: Modular Zustand stores with Immer (typed actions/selectors)
- Backend: Firebase Authentication + Firestore (offline persistence)
- PWA: Service Worker with safe update flow and caching strategy

```
┌───────────────┐   Auth / Firestore   ┌───────────────┐
│   Next.js     │ ───────────────────▶ │   Firebase    │
│   (PWA)       │ ◀─────────────────── │ (Auth / DB)   │
└──────┬────────┘   Zustand Stores      └──────┬────────┘
       │      Offline persistence / SW        │
       ▼                                      ▼
  Components (shadcn/radix)             Secure Rules
```

Technical specification: see `SPECIFICATION.md`.

---

## Project Structure (excerpt)
```
jasstafel/
├─ public/                 # static files, PWA manifest, icons
├─ src/
│  ├─ assets/              # images, fonts, and other assets
│  ├─ components/          # React components
│  │  ├─ auth/             # authentication components
│  │  ├─ game/             # game‑related components
│  │  ├─ layout/           # layout components (e.g., JassKreidetafel)
│  │  ├─ ui/               # base UI components
│  │  └─ ...
│  ├─ config/              # configuration files
│  ├─ constants/           # enums and constants
│  ├─ contexts/            # React contexts
│  ├─ game/                # core game logic
│  ├─ hooks/               # custom React hooks
│  ├─ lib/                 # libraries and utilities
│  ├─ notifications/       # notification system
│  ├─ onboarding/          # onboarding flows
│  ├─ pages/               # Next.js pages
│  ├─ providers/           # context providers
│  ├─ pwa/                 # PWA‑specific code
│  ├─ services/            # Firebase/external services
│  ├─ statistics/          # statistics functions
│  ├─ store/               # Zustand stores
│  ├─ styles/              # global styles
│  ├─ types/               # TypeScript type definitions
│  └─ utils/               # helper functions
├─ scripts/                # maintenance/migration utilities (env‑driven)
├─ functions/              # Firebase functions code
└─ docs/                   # documentation
```

---

## Scripts (safe usage)
Scripts require explicit environment variables and are intended for maintenance. Example:
```bash
FIREBASE_API_KEY=your_key node scripts/migrate-members-simple.js --execute
```

---

## Security
- No secrets in the repository; use environment variables only
- Firebase Web API keys are restricted to exact referrer domains
- Service account keys are server‑side only and must never be committed
- Firestore rules enforce read/write protections

---

## Usage Terms (Strict)
- Allowed: Reading the code, local evaluation, learning, screenshots with attribution
- Not allowed without prior written consent: 
  - Forks, redistributions, public or private deployments
  - Derivative products or “clones” of the app (especially Jass apps/scoreboards)
  - Commercial use of any kind
- For collaboration or licensing, contact: remo@jassguru.ch

These terms are in addition to the LICENSE below.

---

## Contributing
This is a private project maintained by a single developer. External contributions are not accepted at this time.

---

## License
All rights reserved. The intellectual property of this project belongs to Remo Prinz. Any use, reproduction, distribution, or derivative work without express written permission is strictly prohibited.

© 2025 Remo Prinz. See `LICENSE` for details. 