# SumoBot Tournament Bracket

A zero-dependency, dual-window classroom tournament bracket web app for running **Period 2 (P2)** and **Period 3 (P3)** SumoBot robotics tournaments and crowning an **All-School Champion**.

Designed with a **Material You (Material Design 3)** interface featuring 5 live-synced dynamic color palettes, adaptive Dark and Light themes, and zero external runtime dependencies — it works both hosted on **GitHub Pages** and offline directly from disk (`file://`).

## Features
- **True Double Elimination with Bracket Reset:** Independent double-elimination brackets for **Period 2 (P2)** and **Period 3 (P3)** supporting any roster size ≥ 2 with automatic top-seed Round 1 byes and anti-rematch Losers drop-downs.
- **Best-of-3 & Best-of-5 Formats:** Best-of-3 across all Winners and Losers rounds; **Best-of-5** for Grand Finals, automatic **Bracket Reset** (when the Losers champion wins Grand Finals #1), and the **All-School Final** (P2 Champion vs. P3 Champion).
- **Teacher Control Panel (`index.html`):** Individual & bulk-paste roster entry, 10-bot sample loader, random seed shuffle, drag-and-drop / arrow seed reordering, mid-tournament bot renaming, live match bout scoring, **2:00 round countdown timer** with 5-second warning pips and buzzer, per-bout + 40-step global Undo, and downstream-aware editing of completed matches.
- **Synced Projector Display (`projector.html`):** Read-only spectator display synced via `window.open` + `postMessage` + `BroadcastChannel` + `localStorage`. Smart auto-switches between the Bracket + "Up Next" bar, Live Match Broadcast Scoreboard + giant timer, All-School Final, and Champion Celebration with confetti (plus manual `Auto`, `Bracket`, `Live`, and `Finals` overrides).
- **Material You Dynamic Themes & Audio:** Switch live between 5 dynamic tonal palettes (`Indigo`, `Teal`, `Terracotta`, `Violet`, `Sage`) and Dark/Light modes, plus synthesized Web Audio API sound effects (with Mute toggle) and `localStorage` auto-save + JSON Export/Import backups.

## How to Run
- **GitHub Pages (recommended):** Open your published GitHub Pages URL in Chrome or Edge.
- **Offline / Local:** Double-click `index.html` directly (or serve locally with `python -m http.server`).
1. Click **📺 Projector** in the top bar to open `projector.html`, drag it onto your classroom projector or second monitor, and press **F11** (or click **⛶ Fullscreen**).
2. Add bots in the Roster panel, adjust seeds, and click **🚀 Generate Bracket**.
3. Click any ready match in the queue or bracket tree to run the 2:00 timer and score bouts.

## Testing
- **Browser Test Runner:** Open `tests/test-runner.html` in Chrome or Edge to run the full assertion suite (`1581 assertions` covering bracket sizes 2–20 with and without Bracket Reset, All-School Final, undo, downstream reset, rendering, timer formatting, and audio).
- **Node.js CLI Suite:**
  ```sh
  node tests/bracket-engine.test.mjs
  ```

## Deploying to GitHub Pages
This repository is ready for **GitHub Pages** with `.nojekyll`, strictly relative asset paths, and [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml):
1. Push the `main` branch to a public GitHub repository.
2. Open **Settings → Pages** in your GitHub repository and set **Source** to **GitHub Actions** (recommended — automatically runs `node tests/bracket-engine.test.mjs` before deploying), or set **Source** to **Deploy from a branch** (`main` / `/ (root)`).
3. Access the Teacher Control Panel at `https://<your-username>.github.io/<repo-name>/` and launch the synced Projector view from the top bar.
