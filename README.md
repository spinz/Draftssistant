# 🏈 Draftssistant // AI Fantasy Football War Room

An intelligent, real-time AI draft assistant and war room engineered specifically to eliminate anxiety, decision fatigue, and timing panic during fast-paced fantasy football snake drafts.

![Draftssistant Banner](https://img.shields.io/badge/Fantasy_Football-2026_AI_Active-10b981?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16.1.6-000000?style=for-the-badge&logo=nextdotjs)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=for-the-badge&logo=tailwindcss)
![ESPN API](https://img.shields.io/badge/ESPN-Live_Sync-red?style=for-the-badge)

---

## ⚡ Key Features

### 1. The "Rule of 3" Decision Engine
Never get paralyzed searching through 300+ players during a 60-second clock. The War Room continuously surfaces your top 3 decisions at every turn:
* **Option 1: The Brain (Optimal VORP King):** The mathematically highest Value-Over-Replacement-Player on the board, adjusted for your league's scoring system.
* **Option 2: The Sentry (Tier Cliff Warning):** Evaluates the pick gap until your *next* snake turn. If only 1–2 players remain in an elite positional tier and a 15–22 pick wait is coming, it triggers an urgent alert before the position drops off a cliff.
* **Option 3: The Architect (Roster Fit & Need):** Fills starting lineup vacancies (WR2/3, RB2, TE, FLEX) while actively preventing multi-starter bye-week clashes.

### 2. Live ESPN Fantasy League Integration
* **Auto-Scoring Calibration:** Connects to ESPN's League Manager API to pull your exact scoring rules (e.g. Full PPR vs Half-PPR, 6-point vs 4-point passing TDs, yardage points).
* **Auto-Slot Detection:** Detects when the commissioner or ESPN randomizes the draft order and immediately locks in your snake draft slot.
* **Live Pick Polling:** Monitors live picks every 3.5 seconds. As league-mates make picks in the ESPN draft room, players are automatically crossed off your board.

### 3. High-Speed War Room Interface
* **1-Click Actions:** `[Draft for Me]` (green) and `[Taken]` (gray) buttons on every row for zero-typing draft logging.
* **Instant Search & Multi-Filters:** Filter by position (QB, RB, WR, TE, K, DEF), tier (T1–T6), or sort by VORP, ADP, and Projected Points.
* **Turn Audio Chime:** Pleasant auditory alert sounds the second you are on the clock.
* **Local Persistence:** Everything auto-saves to `localStorage`—switching tabs or refreshing will never wipe your draft state.

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/spinz/Draftssistant.git
cd Draftssistant
npm install
```

### 2. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔗 Connecting Your ESPN League

1. In the top navigation bar, click the **ESPN Connect League** button.
2. Enter your **League ID**, along with your **`espn_s2`** and **`SWID`** cookie values (found via browser DevTools $\rightarrow$ Application $\rightarrow$ Cookies $\rightarrow$ `espn.com`).
3. Click **Connect & Calibrate**.

> **Note on Security:** Credentials are kept locally on your machine and are never committed to version control. They are strictly used to authenticate read requests to ESPN's private LM API.

---

## 📊 Updating Player Projections & Data

Draftssistant includes an automated python pipeline to pull the latest active NFL player pool, injury designations, and 2026 season projections:

```bash
python3 src/data/build_fantasy_dataset.py
```

---

## 🛠️ Tech Stack
* **Framework:** Next.js 16 (App Router) & React 19
* **Styling:** Tailwind CSS v4 & Lucide Icons
* **Data Pipelines:** Python 3 (Sleeper NFL API + ESPN Fantasy API)
