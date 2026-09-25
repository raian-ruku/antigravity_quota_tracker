# 🧊 Antigravity Quota Tracker

> Track Antigravity model usage quotas with an Apple-inspired Liquid Glass UI — right inside VS Code / Antigravity IDE.

## Features

- **Liquid Glass Side Panel** — frosted glass dashboard with donut chart, metric cards, sparkline timeline, and reset countdown
- **3-Mode Status Bar** — click to cycle between Compact / Expanded / Detailed
- **Multi-model tracking** — Gemini 2.5 Flash, Pro, Ultra, 2.0 Flash, Nano
- **Auto-refresh** — configurable 30s / 1m / 5m, with smart refresh on file save
- **Persistent history** — 24h sparkline stored locally via VS Code globalState

## Getting Started

### 1. Install the extension

Open VS Code → Extensions → Install from VSIX, or press `F5` to run in development mode.

### 2. Set your API key

Open the Command Palette (`Cmd+Shift+P`) and run:
```
Quota Tracker: Set API Key
```

Or click **"set API key"** in the demo banner inside the panel.

> Without an API key, the extension shows realistic **demo data** so you can explore the UI immediately.

### 3. Open the Dashboard

Click the **⬡ star icon** in the Activity Bar (left sidebar), or press `Cmd+Shift+Q`.

### 4. Toggle the Status Bar

Click the status bar item at the bottom to cycle through modes:
- **Compact**: `⬡ AGY  82% · 4.2k req`
- **Expanded**: Full bar with token counts and reset timer
- **Detailed**: Multi-model summary on one line

Or use `Quota Tracker: Toggle Status Bar Item` from the Command Palette to hide/show it.

## Commands

| Command | Description |
|---|---|
| `Quota Tracker: Open Quota Dashboard` | Opens the side panel |
| `Quota Tracker: Refresh Now` | Manually refresh quota data |
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
| `quotaTracker.apiKey` | `""` | Antigravity API key |
| `quotaTracker.refreshInterval` | `60` | Auto-refresh seconds (0 = manual) |
| `quotaTracker.statusBarMode` | `"compact"` | Status bar mode |
| `quotaTracker.statusBarVisible` | `true` | Show/hide status bar |

## Development

```bash
npm install
npm run build        # one-shot build
npm run watch        # watch mode
```

Press `F5` in VS Code to launch Extension Development Host.
