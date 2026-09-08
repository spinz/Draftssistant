# 🏈 Draftssistant // AI Fantasy Football War Room

An intelligent, real-time AI draft assistant and live war room engineered specifically to eliminate anxiety, decision fatigue, and timing panic during fast-paced fantasy football snake drafts.

![Draftssistant Banner](https://img.shields.io/badge/Fantasy_Football-2026_AI_Active-10b981?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16.1.6-000000?style=for-the-badge&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19.2.3-61dafb?style=for-the-badge&logo=react)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=for-the-badge&logo=tailwindcss)
![ESPN API](https://img.shields.io/badge/ESPN-Live_Sync-red?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-Passing-brightgreen?style=for-the-badge)

---

## 📖 Overview

Draftssistant is a purpose-built draft war room for fantasy managers who want mathematical rigor without cognitive overload. During a 60-second pick clock, scanning massive spreadsheets or generic cheat sheets leads to panic reaching and tier cliff traps. 

Draftssistant solves this by pairing an **offline calibrated dataset** (VORP projections, replacement levels, ADP, bye weeks) with **live ESPN fantasy synchronization** and a **historical opponent scouting engine**.

---

## ⚡ Core Engine & Architecture

```
Draftssistant/
├── src/
│   ├── app/
│   │   ├── page.tsx               # Main War Room UI (Client Component)
│   │   ├── layout.tsx             # Root application shell & metadata
│   │   ├── globals.css            # Tailwind v4 configuration & styles
│   │   └── api/
│   │       ├── draft/route.ts     # Serves offline dataset & optional Sleeper sync
│   │       └── espn/route.ts      # ESPN LM API bridge (scoring, slots, live picks)
│   └── data/
│       ├── fantasy_players.json   # 380+ calibrated player pool with VORP & ADP
│       ├── espn_id_to_name.json   # ESPN player ID to canonical name map (incl. D/ST)
│       ├── espn_config.example.json# Credentials template (ignored in git)
│       └── build_fantasy_dataset.py# Scrapes & calibrates player projections
├── scripts/
│   └── analyze_espn_history.py    # 10-season historical league scouting engine
├── reports/
│   ├── historical_draft_analysis.json       # Full structured historical analysis
│   └── historical_draft_scouting_report.md  # Executive markdown scouting report
├── tests/
│   └── espn_dst_fixture.test.mjs  # Automated fixture test suite for edge cases
└── package.json                   # Dependencies, scripts, and build targets
```

---

## 🧠 The "Rule of 3" Recommendation System

Rather than presenting endless rows of players, the war room highlights your top 3 decisions at every turn:

1. **The Brain (Optimal VORP King):**  
   Calculates Value-Over-Replacement-Player calibrated specifically to your league's scoring rules (e.g. 1.0 Full PPR, 6.0-point passing TDs). Represents the mathematically highest value on the board.
2. **The Sentry (Tier Cliff Warning):**  
   Forecasts the pick gap until your *next* snake turn. If only 1–2 players remain in an elite positional tier and a lengthy turn wrap (e.g. 15–22 picks) is coming, it triggers an urgent alert before the position falls off a cliff.
3. **The Architect (Roster Fit & Need):**  
   Actively tracks starting lineup slots (QB, RB1/2, WR1/2/3, TE, FLEX) and bench depth, surfacing immediate positional needs while preventing multi-starter bye-week clashes.

---

## 🔄 ESPN Live Sync & Reliability Architecture

The app interacts with ESPN's League Manager API (`lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/`):

### 1. Authoritative Snapshot Reconciliation
* **Dynamic Team & Slot Detection:** League size (`totalTeams`) is parsed dynamically on connect. The slot selector renders `numTeams` options rather than a hardcoded 12.
* **Friendly Slot Mapping:** Maps internal ESPN database IDs to friendly team names and physical draft slot numbers (e.g., `Dawg Pound (Slot #10)`).
* **Unmatched Player Fallback:** If an ESPN pick returns a player ID not present in the offline dataset, a resilient fallback record is generated (`id: espn-<id>`) rather than dropping the pick, guaranteeing round and pick math never lag behind.

### 2. ESPN Data Quirks Solved
* **Negative D/ST IDs (`-16001` through `-16034`):** ESPN represents defense/special teams with negative IDs (e.g., Falcons D/ST is `-16001`, Rams D/ST is `-16014`). The sync engine deliberately allows negative IDs while filtering out only unpicked future slot sentinels (`playerId: -1`).
* **Compound Lineup Keys:** Bench slots render using compound keys (`${bp.id}-${index}`) preventing React reconciliation duplicate-key warnings if sentinel states occur.
* **LocalStorage Sanitization:** On boot, the app auto-sanitizes legacy cached picks to purge obsolete sentinel placeholders.

---

## 🕵️ Historical League Scouting Engine

A standalone intelligence engine ([`scripts/analyze_espn_history.py`](file:///home/robbie/Draftssistant/scripts/analyze_espn_history.py)) that analyzes up to 10 years of your league's draft history (2015–2025):

* **Conservative Owner Matching:** Matches historical teams strictly by ESPN Owner SWID. If a team's ownership changed or is unconfirmed, it is categorized as unknown rather than guessing from team names.
* **Weighted Tendencies:** Recent 3 seasons (2023–2025) are weighted **2.5x** more heavily than older drafts.
* **Manager Profiles Include:**
  * Number of usable drafts & confidence rating.
  * Weighted average & median round/pick for first QB, RB, WR, TE, K, and D/ST.
  * RB vs WR preference in Rounds 1–6 (with 1st-round opener probabilities).
  * Frequencies of early QB, early TE, early K, and early D/ST.
  * Consensus ADP reach/discount bias.
  * Position runs started vs joined (for QB, TE, RB, WR).
  * NFL franchise loyalty and repeat player targets.
  * Concise draft persona labels (`early-QB`, `zero-RB-ish`, `RB-heavy`, `early-TE`, `late-QB`, `balanced-value`, or `insufficient evidence`).
  * Strict rule: Every claim includes raw counts beside it (e.g. `(7/10 drafts, 70.0%)`).

Run the analysis anytime:
```bash
npm run analyze-history
# or directly:
python3 scripts/analyze_espn_history.py
```
Output files are written to:
* [`reports/historical_draft_analysis.json`](file:///home/robbie/Draftssistant/reports/historical_draft_analysis.json)
* [`reports/historical_draft_scouting_report.md`](file:///home/robbie/Draftssistant/reports/historical_draft_scouting_report.md)

---

## 🧪 Testing & Verification

The repository includes an automated test suite verifying ESPN pick filtering, D/ST negative ID parsing, player reconciliation, and local storage sanitization:

```bash
npm test
```

### Test Coverage (`tests/espn_dst_fixture.test.mjs`):
* ✓ Rejection of unpicked slot sentinels (`playerId: -1`, `0`, `null`)
* ✓ Preservation of positive player IDs (`4241474` Brian Robinson Jr.)
* ✓ Preservation of negative D/ST IDs (`-16001` Falcons D/ST, `-16014` Rams D/ST)
* ✓ Deep unmatched D/ST fallback classification (`-16099` mapped to `pos: DEF`)
* ✓ LocalStorage sanitization with negative defense IDs preserved

---

## 🚀 Quick Start

### 1. Requirements
* Node.js 18+ (tested on Node.js 22)
* Python 3.9+ (for dataset updates & historical scouting)

### 2. Setup
```bash
git clone https://github.com/spinz/Draftssistant.git
cd Draftssistant
npm install
```

### 3. ESPN Authentication Setup
Copy the configuration template:
```bash
cp src/data/espn_config.example.json src/data/espn_config.json
```
Edit `src/data/espn_config.json` with your credentials:
```json
{
  "leagueId": "456615",
  "espn_s2": "<YOUR_ESPN_S2_COOKIE>",
  "swid": "{<YOUR_SWID_COOKIE>}"
}
```
*(You can also connect interactively via the in-app modal in the top navigation bar).*

> **Security Note:** `espn_config.json` is strictly ignored in [`.gitignore`](file:///home/robbie/Draftssistant/.gitignore). Never commit cookies or SWIDs to version control.

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Production Build
```bash
npm run build
npm run start
```

---

## 📋 Available NPM Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Next.js Turbopack development server |
| `npm run build` | Compiles optimized Next.js production bundle with TypeScript validation |
| `npm run start` | Runs Next.js production server |
| `npm run lint` | Runs ESLint flat config check |
| `npm test` | Runs the automated ESPN fixture test suite |
| `npm run analyze-history` | Executes the 10-season historical league draft scouting engine |

---

## 🛠️ Technology Stack

* **Frontend:** Next.js 16.1.6 (App Router), React 19.2.3, Lucide React Icons
* **Styling:** Tailwind CSS v4
* **Backend:** Next.js Server Route Handlers (`/api/draft`, `/api/espn`)
* **Analytics Engine:** Python 3 (statistics, urllib, collections)
* **Dataset:** Sleeper NFL API + ESPN LM API
