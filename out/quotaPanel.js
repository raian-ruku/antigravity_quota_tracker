"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotaPanel = void 0;
const vscode = __importStar(require("vscode"));
// ─────────────────────────────────────────────────────────────
//  QuotaPanel  — VS Code Webview View Provider
//  Renders the Liquid Glass quota dashboard in the sidebar.
// ─────────────────────────────────────────────────────────────
class QuotaPanel {
    constructor(_extensionUri, _service) {
        this._extensionUri = _extensionUri;
        this._service = _service;
        this._disposables = [];
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
            ],
        };
        webviewView.webview.html = this._buildHtml(webviewView.webview);
        // Listen for messages from the webview
        this._disposables.push(webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'ready':
                    // Send current state immediately on load
                    this._postMessage({ type: 'stateUpdate', state: this._service.state });
                    this._postMessage({ type: 'settingsUpdate', settings: this._service.settings });
                    break;
                case 'refresh':
                    await this._service.refresh();
                    break;
                case 'setApiKey':
                    await vscode.workspace.getConfiguration('quotaTracker')
                        .update('apiKey', msg.key, vscode.ConfigurationTarget.Global);
                    await this._service.refresh();
                    break;
                case 'setRefreshInterval':
                    await vscode.workspace.getConfiguration('quotaTracker')
                        .update('refreshInterval', msg.seconds, vscode.ConfigurationTarget.Global);
                    this._service.scheduleRefreshWithInterval(msg.seconds);
                    break;
            }
        }));
        // Push state updates to webview
        this._disposables.push(this._service.onChange(state => {
            this._postMessage({ type: 'stateUpdate', state });
        }));
        // Trigger first fetch
        this._service.refresh();
    }
    sendState(state) {
        this._postMessage({ type: 'stateUpdate', state });
    }
    dispose() {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
    // ── Private ────────────────────────────────────────────────
    _postMessage(msg) {
        this._view?.webview.postMessage(msg);
    }
    _uri(...segments) {
        return this._view.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, ...segments));
    }
    _buildHtml(webview) {
        const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'panel.css'));
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'panel.js'));
        const nonce = this._nonce();
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src ${webview.cspSource} https://fonts.gstatic.com;
             img-src ${webview.cspSource} data:;
             script-src 'nonce-${nonce}';">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="${cssUri}" rel="stylesheet"/>
  <title>Antigravity Quota Tracker</title>
</head>
<body>

<!-- ── Header ───────────────────────────────── -->
<header class="panel-header">
  <div class="header-brand">
    <div class="brand-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          fill="url(#brandGrad)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
        <defs>
          <linearGradient id="brandGrad" x1="2" y1="2" x2="22" y2="22">
            <stop offset="0%" stop-color="#7B8CFF"/>
            <stop offset="100%" stop-color="#00D4FF"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
    <div>
      <h1 class="brand-title">Quota Tracker</h1>
      <span class="brand-sub">Antigravity Usage</span>
    </div>
  </div>
  <div class="header-actions">
    <div class="live-indicator" id="liveIndicator">
      <div class="live-dot"></div>
      <span>Live</span>
    </div>
    <button class="icon-btn" id="refreshBtn" title="Refresh now">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    </button>
  </div>
</header>

<div class="last-updated" id="lastUpdated">Last updated: never</div>

<!-- ── Model Selector ───────────────────────── -->
<nav class="model-tabs" id="modelTabs" role="tablist" aria-label="Model selector"></nav>

<!-- ── No API Key Banner ────────────────────── -->
<div class="demo-banner" id="demoBanner" style="display:none">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
  Showing demo data — <button class="link-btn" id="setKeyBtn">set API key</button> for live data
</div>

<!-- ── Primary Quota Ring ───────────────────── -->
<section class="quota-ring-section glass-card">
  <canvas id="donutChart" width="180" height="180" aria-label="Quota usage donut chart"></canvas>
  <div class="ring-center">
    <div class="ring-pct" id="ringPct">—</div>
    <div class="ring-label" id="ringLabel">used</div>
    <div class="ring-model" id="ringModel">—</div>
  </div>
  <div class="ring-meta">
    <div class="ring-stat">
      <span class="ring-stat-val" id="reqUsed">—</span>
      <span class="ring-stat-lbl">requests</span>
    </div>
    <div class="ring-stat-sep"></div>
    <div class="ring-stat">
      <span class="ring-stat-val" id="reqLimit">—</span>
      <span class="ring-stat-lbl">limit</span>
    </div>
    <div class="ring-stat-sep"></div>
    <div class="ring-stat">
      <span class="ring-stat-val" id="reqReset">—</span>
      <span class="ring-stat-lbl">5h reset</span>
    </div>
    <div class="ring-stat-sep" id="weeklyRingSep"></div>
    <div class="ring-stat" id="weeklyRingStat">
      <span class="ring-stat-val" id="weeklyRingReset">—</span>
      <span class="ring-stat-lbl">weekly reset</span>
    </div>
  </div>
</section>

<!-- ── Metric Cards ──────────────────────────── -->
<section class="metric-cards" id="metricCards">
  <div class="metric-card glass-card" id="cardTokensIn">
    <div class="metric-icon" style="--c:#7B8CFF">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="tokensInVal">—</div>
      <div class="metric-lbl">Tokens In</div>
      <div class="metric-bar-wrap"><div class="metric-bar" id="tokensInBar" style="--pct:0%;--c:#7B8CFF"></div></div>
    </div>
  </div>

  <div class="metric-card glass-card" id="cardTokensOut">
    <div class="metric-icon" style="--c:#00D4FF">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="tokensOutVal">—</div>
      <div class="metric-lbl">Tokens Out</div>
      <div class="metric-bar-wrap"><div class="metric-bar" id="tokensOutBar" style="--pct:0%;--c:#00D4FF"></div></div>
    </div>
  </div>

  <div class="metric-card glass-card" id="cardCost">
    <div class="metric-icon" style="--c:#00FF94">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="costVal">—</div>
      <div class="metric-lbl">Est. Cost</div>
      <div class="metric-tier" id="tierBadge">—</div>
    </div>
  </div>

  <div class="metric-card glass-card" id="cardWeekly">
    <div class="metric-icon" style="--c:#FFB347">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="weeklyVal">—</div>
      <div class="metric-lbl">Weekly Limit</div>
      <div class="metric-bar-wrap"><div class="metric-bar" id="weeklyBar" style="--pct:0%;--c:#FFB347"></div></div>
    </div>
  </div>

  <div class="metric-card glass-card full-span" id="cardReset">
    <div class="metric-icon" style="--c:#FF6B9D">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    </div>
    <div class="metric-content reset-horizontal">
      <div>
        <div class="metric-val" id="resetCountdown">—</div>
        <div class="metric-lbl">5h Window Resets In</div>
      </div>
      <canvas id="resetRing" width="36" height="36" class="reset-ring-canvas"></canvas>
    </div>
  </div>
</section>

<!-- ── Weekly Quotas (Shared Pools) ───────────── -->
<section class="weekly-section glass-card" id="weeklySection">
  <div class="section-header">
    <div class="section-title-wrap">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-5)" stroke-width="2.2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span class="section-title">Weekly Quotas</span>
    </div>
    <span class="section-sub" id="weeklyPoolSub">Shared model pools</span>
  </div>
  <div class="weekly-pools-list" id="weeklyPoolsList"></div>
</section>

<!-- ── Usage Timeline ────────────────────────── -->
<section class="timeline-section glass-card">
  <div class="section-header">
    <span class="section-title">24h Usage</span>
    <span class="section-sub" id="sparklineLabel">Requests over time</span>
  </div>
  <canvas id="sparkline" width="260" height="60" aria-label="24 hour usage sparkline"></canvas>
</section>

<!-- ── All Models Summary ───────────────────── -->
<section class="models-section glass-card">
  <div class="section-header">
    <span class="section-title">All Models</span>
    <span class="section-sub" id="totalCost">—</span>
  </div>
  <div class="models-list" id="modelsList"></div>
</section>

<!-- ── Settings ──────────────────────────────── -->
<section class="settings-section glass-card">
  <div class="section-header">
    <span class="section-title">Settings</span>
  </div>
  <div class="settings-row">
    <label class="settings-label" for="apiKeyInput">API Key</label>
    <div class="settings-input-wrap">
      <input type="password" id="apiKeyInput" class="settings-input" placeholder="Enter API key…" autocomplete="off"/>
      <button class="settings-btn" id="saveKeyBtn">Save</button>
    </div>
  </div>
  <div class="settings-row">
    <label class="settings-label" for="refreshSelect">Auto Refresh</label>
    <select id="refreshSelect" class="settings-select">
      <option value="30">30 seconds</option>
      <option value="60" selected>1 minute</option>
      <option value="300">5 minutes</option>
      <option value="0">Manual only</option>
    </select>
  </div>
</section>

<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
    }
    _nonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
exports.QuotaPanel = QuotaPanel;
QuotaPanel.viewType = 'quotaTracker.panel';
//# sourceMappingURL=quotaPanel.js.map