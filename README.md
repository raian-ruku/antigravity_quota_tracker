# 🧊 Antigravity Quota Tracker

> Track Antigravity model usage quotas with an Apple-inspired Liquid Glass UI — right inside VS Code / Antigravity IDE.

## Features

- **Active Agent Model Auto-Detection** — automatically detects and displays whatever model the user is actively prompting in the Antigravity Agent (e.g. Gemini 3.8 Flash High vs Claude Sonnet), dynamically switching in real-time
- **Liquid Glass Side Panel** — frosted glass dashboard with donut chart, weekly quota pool cards, metric cards, sparkline timeline, and reset countdowns
- **Weekly & 5-Hour Limits** — tracks both the 5-hour demand smoothing window and overarching weekly quota pools for Gemini and Claude/GPT models
- **3-Mode Status Bar with Active Tracking** — Compact (`🟢 3.8H·78% · 📅98% ↺4h`), Expanded (`🟢 3.8H·78%  🟢 Sn4T·65%  📅98% ↺4h`), and Detailed modes
- **Rich Hover Tooltip** — active agent model callout with dual 5h & weekly pools, plus complete model quotas
- **Multi-model tracking** — Gemini Flash/Pro (Low/Medium/High), Claude Sonnet/Opus, GPT-OSS, and more
- **Auto-refresh** — configurable 30s / 1m / 5m, plus instant checks on window focus and file save
- **Persistent history** — 24h sparkline stored locally via VS Code globalState

## Getting Started

### 1. Install the extension

Open VS Code → Extensions → Install from VSIX, or press `F5` to run in development mode.

### 2. Auto-Discovery & Live Data

The extension automatically discovers the local Antigravity Language Server and queries both model statuses and weekly shared quota pools with zero manual configuration needed.

> If not running Antigravity locally, you can enter an API key or explore with realistic demo data.

### 3. Open the Dashboard

Click the **⬡ star icon** in the Activity Bar (left sidebar), or press `Cmd+Shift+Q`.

### 4. Status Bar Modes

Click the status bar item at the bottom to cycle through modes:
- **Compact**: `🟢 3.8H·78% · 📅98% ↺4h` (active model chip + 5h remaining % + corresponding weekly pool % + reset timer)
- **Expanded**: Active model chip first + watchdog chips + weekly badge (`🟢 3.8H·78%  🟢 Sn4T·65%  📅98% ↺4h`)
- **Detailed**: `$(pulse) [3.8H] 🟢🟢🟢... 14M | 📅 Gem:98% Cl:55% ↺4h`

Or use `Quota Tracker: Select Focused Model (or Auto-Detect)` to pin a specific model or leave on auto-detect.

## Commands

| Command | Description |
|---|---|
| `Quota Tracker: Open Quota Dashboard` | Opens the side panel |
| `Quota Tracker: Refresh Now` | Manually refresh quota data |
| `Quota Tracker: Select Focused Model (or Auto-Detect)` | Pin a model or set to follow the active agent |
| `Quota Tracker: Configure Status Bar Position` | Change Left/Right alignment and priority |
| `Quota Tracker: Set API Key` | Set your Antigravity API key |
| `Quota Tracker: Cycle Status Bar Mode` | Cycle through display modes |
| `Quota Tracker: Toggle Status Bar Item` | Show/hide the status bar item |

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+Q` | Open Quota Dashboard |

## Settings

| Setting | Default | Description |
|---|---|---|
| `quotaTracker.focusModel` | `"auto"` | Model to focus (`auto` tracks active agent) |
| `quotaTracker.apiKey` | `""` | Antigravity API key |
| `quotaTracker.refreshInterval` | `60` | Auto-refresh seconds (0 = manual) |
| `quotaTracker.statusBarMode` | `"compact"` | Status bar mode (`compact`, `expanded`, `detailed`) |
| `quotaTracker.statusBarVisible` | `true` | Show/hide status bar |
| `quotaTracker.statusBarAlignment` | `"Left"` | Left or Right status bar alignment |
| `quotaTracker.statusBarPriority` | `100` | Position priority |

## Development

```bash
npm install
npm run build        # one-shot build
npm run watch        # watch mode
```

Press `F5` in VS Code to launch Extension Development Host.
