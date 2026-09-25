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
exports.StatusBarController = void 0;
const vscode = __importStar(require("vscode"));
// ─────────────────────────────────────────────────────────────
//  StatusBarController  —  minimal, colorful, 3-mode
//
//  MINI     →  ◉ 98%  ↺5h           (single dot + reset)
//  SHORT    →  ◉ 3.8H·98  ◉ Sn4·∞  (top N chips)
//  DETAILED →  rich tooltip only, bar shows chip row + all info
// ─────────────────────────────────────────────────────────────
const MODES = ['compact', 'expanded', 'detailed'];
// ── Helpers ──────────────────────────────────────────────────
function usedPct(model) {
    const { used, limit } = model.requests;
    return limit > 0 ? Math.round((used / limit) * 100) : 0;
}
function remPct(model) {
    const rem = model.requests.limit > 0
        ? ((model.requests.limit - model.requests.used) / model.requests.limit) * 100
        : 100;
    return Math.round(Math.max(0, Math.min(100, rem)));
}
function remFraction(model) {
    const { used, limit } = model.requests;
    return limit > 0 ? Math.max(0, Math.min(1, (limit - used) / limit)) : 1;
}
/** Format time until reset — compact style */
function countdown(resetMs) {
    const diff = resetMs - Date.now();
    if (diff <= 0) {
        return 'now';
    }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h >= 24) {
        return `${Math.floor(h / 24)}d`;
    }
    if (h > 0) {
        return `${h}h${m > 0 ? `${m}m` : ''}`;
    }
    return `${m}m`;
}
/** Colorful dot based on remaining quota */
function dot(frac) {
    if (frac <= 0.05) {
        return '🔴';
    }
    if (frac <= 0.25) {
        return '🟡';
    }
    if (frac <= 0.60) {
        return '🟢';
    }
    return '🟢';
}
/** ThemeColor for status bar background */
function bgColor(usedPctVal) {
    if (usedPctVal >= 95) {
        return new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    if (usedPctVal >= 80) {
        return new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    return undefined; // default — no tint
}
/** Mini 5-block sparkline bar  e.g. ▰▰▰▱▱ */
function miniBar(frac, w = 5) {
    const filled = Math.round(frac * w);
    return '▰'.repeat(filled) + '▱'.repeat(w - filled);
}
/**
 * Shorten a model label to ≤6 chars for the chip display.
 * Examples:
 *   "Gemini 3.8 Flash (High)"  → "3.8H"
 *   "Claude Sonnet 4.6 (Thinking)" → "Sn4T"
 *   "GPT-OSS 120B (Medium)"    → "G120M"
 */
function shortChip(label) {
    // Gemini X.Y Flash/Pro (Tier) → X.YF/P-tier-initial
    const geminiM = label.match(/Gemini\s+([\d.]+)\s+(Flash|Pro)(?:\s+\((\w))?/i);
    if (geminiM) {
        const ver = geminiM[1];
        const kind = geminiM[2][0].toUpperCase(); // F or P
        const tier = geminiM[3] ? geminiM[3].toUpperCase() : ''; // H, M, L
        return `${ver}${kind}${tier}`;
    }
    // Claude Model (Thinking) → Cl-initial+num
    const claudeM = label.match(/Claude\s+(\w+)\s+([\d.]+)(?:\s+\((\w))?/i);
    if (claudeM) {
        const name = claudeM[1].slice(0, 2).toUpperCase(); // So / Op
        const ver = claudeM[2].split('.')[0]; // major version
        const tier = claudeM[3] ? claudeM[3].toUpperCase() : '';
        return `${name}${ver}${tier}`;
    }
    // GPT / other
    const gptM = label.match(/GPT[- ]?(?:OSS\s+)?(\d+)/i);
    if (gptM) {
        return `G${gptM[1]}`;
    }
    // Generic fallback: first 5 chars
    return label.replace(/[^A-Za-z0-9]/g, '').slice(0, 5);
}
/** Find the lowest weekly quota pool across groups or models */
function lowestWeeklyInfo(state) {
    if (state.groups && state.groups.length > 0) {
        const weeklyBuckets = [];
        for (const g of state.groups) {
            const wb = g.buckets.find(b => b.window === 'weekly' || b.bucketId.toLowerCase().includes('weekly') || b.displayName.toLowerCase().includes('weekly'));
            if (wb) {
                weeklyBuckets.push({
                    fraction: wb.remainingFraction,
                    resetMs: wb.resetTimestamp,
                    name: g.displayName.replace(' Models', '').replace(' and ', '/'),
                });
            }
        }
        if (weeklyBuckets.length > 0) {
            weeklyBuckets.sort((a, b) => a.fraction - b.fraction);
            return weeklyBuckets[0];
        }
    }
    // Fallback to models
    const modelsWithWeekly = state.models.filter(m => m.weeklyRemainingFraction !== undefined);
    if (modelsWithWeekly.length > 0) {
        modelsWithWeekly.sort((a, b) => (a.weeklyRemainingFraction ?? 1) - (b.weeklyRemainingFraction ?? 1));
        const lowest = modelsWithWeekly[0];
        return {
            fraction: lowest.weeklyRemainingFraction ?? 1,
            resetMs: lowest.weeklyResetTimestamp ?? Date.now(),
            name: lowest.groupName || 'Weekly',
        };
    }
    return null;
}
/** Build rich markdown tooltip shared by all modes */
function buildTooltip(state, mode) {
    const now = Date.now();
    const lastSeen = state.lastFetched
        ? new Date(state.lastFetched).toLocaleTimeString()
        : 'never';
    const modeLabel = mode === 'compact' ? 'mini' : mode === 'expanded' ? 'short' : 'detailed';
    const lines = [
        `## $(pulse) Antigravity Quota Tracker`,
        `*Mode: **${modeLabel}** — click status bar to cycle*`,
        '',
    ];
    // 1. Weekly Quotas (Shared Pools) section
    if (state.groups && state.groups.length > 0) {
        lines.push(`### 📅 Weekly Limits (Shared Pools)`);
        lines.push(`| Shared Pool | Weekly Remaining | 5-Hour Window | Weekly Reset |`);
        lines.push(`|---|:---:|:---:|:---:|`);
        for (const g of state.groups) {
            const weeklyBucket = g.buckets.find(b => b.window === 'weekly' || b.bucketId.toLowerCase().includes('weekly') || b.displayName.toLowerCase().includes('weekly'));
            const fiveHBucket = g.buckets.find(b => b.window === '5h' || b.bucketId.toLowerCase().includes('5h') || b.displayName.toLowerCase().includes('5-hour'));
            const wFrac = weeklyBucket ? weeklyBucket.remainingFraction : 1;
            const wPct = Math.round(wFrac * 100);
            const wBar = miniBar(wFrac, 5);
            const wDot = dot(wFrac);
            const wReset = weeklyBucket ? countdown(weeklyBucket.resetTimestamp) : '—';
            const fPct = fiveHBucket ? `${Math.round(fiveHBucket.remainingFraction * 100)}%` : '—';
            lines.push(`| ${wDot} **${g.displayName}** | ${wBar} ${wPct}% | ${fPct} | ↺ in ${wReset} |`);
        }
        lines.push('');
    }
    // 2. Individual Model table
    lines.push(`### 🤖 Model Quotas`);
    const hasWeekly = state.models.some(m => m.weeklyRemainingFraction !== undefined);
    if (hasWeekly) {
        lines.push(`| Model | 5h Left | Weekly Left | 5h Reset |`);
        lines.push(`|---|:---:|:---:|:---:|`);
    }
    else {
        lines.push(`| Model | Remaining | Reset in |`);
        lines.push(`|---|:---:|:---:|`);
    }
    for (const m of state.models) {
        const rem = remPct(m);
        const frac = remFraction(m);
        const d = dot(frac);
        const bar = miniBar(frac, 5);
        const reset = countdown(m.resetTimestamp);
        const remStr = rem <= 5 ? `**${rem}%**` : `${rem}%`;
        if (hasWeekly) {
            const wFrac = m.weeklyRemainingFraction ?? 1;
            const wPct = Math.round(wFrac * 100);
            const wStr = wPct <= 10 ? `**${wPct}%**` : `${wPct}%`;
            lines.push(`| ${d} ${m.displayName} | ${bar} ${remStr} | 📅 ${wStr} | ${reset} |`);
        }
        else {
            lines.push(`| ${d} ${m.displayName} | ${bar} ${remStr} | ${reset} |`);
        }
    }
    lines.push('');
    lines.push(`*Last updated: ${lastSeen}*`);
    const md = new vscode.MarkdownString(lines.join('\n'));
    md.isTrusted = true;
    md.supportHtml = false;
    return md;
}
// ── Controller ───────────────────────────────────────────────
/** Read alignment setting → VS Code enum */
function readAlignment(cfg) {
    return cfg.get('statusBarAlignment', 'Left') === 'Right'
        ? vscode.StatusBarAlignment.Right
        : vscode.StatusBarAlignment.Left;
}
/** Read numeric priority from settings */
function readPriority(cfg) {
    return cfg.get('statusBarPriority', 100);
}
class StatusBarController {
    constructor(_service) {
        this._service = _service;
        this._lastState = null;
        this._mode = _service.settings.statusBarMode;
        this._visible = _service.settings.statusBarVisible;
        const cfg = vscode.workspace.getConfiguration('quotaTracker');
        this._item = this._createItem(readAlignment(cfg), readPriority(cfg));
        this._lastState = this._service.state;
        this._render(this._lastState);
        if (this._visible) {
            this._item.show();
        }
    }
    /** Recreate the status bar item with new alignment + priority (cannot be mutated after creation). */
    recreate() {
        const wasVisible = this._visible;
        const cfg = vscode.workspace.getConfiguration('quotaTracker');
        this._item.dispose();
        this._item = this._createItem(readAlignment(cfg), readPriority(cfg));
        if (this._lastState) {
            this._render(this._lastState);
        }
        if (wasVisible) {
            this._item.show();
        }
    }
    _createItem(alignment, priority) {
        const item = vscode.window.createStatusBarItem(alignment, priority);
        item.command = 'quotaTracker.cycleMode';
        return item;
    }
    update(state) {
        this._lastState = state;
        this._render(state);
    }
    cycleMode() {
        const idx = MODES.indexOf(this._mode);
        this._mode = MODES[(idx + 1) % MODES.length];
        vscode.workspace.getConfiguration('quotaTracker').update('statusBarMode', this._mode, vscode.ConfigurationTarget.Global);
        if (this._lastState) {
            this._render(this._lastState);
        }
        const label = this._mode === 'compact' ? 'mini' : this._mode === 'expanded' ? 'short' : 'detailed';
        vscode.window.setStatusBarMessage(`$(pulse) Quota: ${label} mode`, 1800);
    }
    setMode(mode) {
        this._mode = mode;
        if (this._lastState) {
            this._render(this._lastState);
        }
    }
    toggle() {
        this._visible = !this._visible;
        vscode.workspace.getConfiguration('quotaTracker').update('statusBarVisible', this._visible, vscode.ConfigurationTarget.Global);
        if (this._visible) {
            this._item.show();
            vscode.window.setStatusBarMessage('$(eye) Quota bar shown', 1500);
        }
        else {
            this._item.hide();
            vscode.window.setStatusBarMessage('$(eye-closed) Quota bar hidden', 1500);
        }
    }
    dispose() {
        this._item.dispose();
    }
    // ── Rendering ─────────────────────────────────────────────
    _render(state) {
        if (state.isLoading) {
            this._item.text = '$(loading~spin) AGY…';
            this._item.backgroundColor = undefined;
            this._item.tooltip = 'Fetching quota data…';
            return;
        }
        if (state.error) {
            this._item.text = '$(error) AGY quota error';
            this._item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            this._item.tooltip = `Quota error: ${state.error}\nClick to retry`;
            return;
        }
        if (!state.models.length) {
            this._item.text = '$(pulse) AGY —';
            this._item.backgroundColor = undefined;
            return;
        }
        switch (this._mode) {
            case 'compact':
                this._renderMini(state);
                break;
            case 'expanded':
                this._renderShort(state);
                break;
            case 'detailed':
                this._renderDetailed(state);
                break;
        }
    }
    // ── MINI  →  🟢 98% · 📅55% ↺5h ────────────────────────
    // Single dot, best-remaining 5h model %, weekly pool %, time to reset
    _renderMini(state) {
        const worst = [...state.models].sort((a, b) => remFraction(a) - remFraction(b))[0];
        const frac = remFraction(worst);
        const rem = Math.round(frac * 100);
        const d = dot(frac);
        const reset = countdown(worst.resetTimestamp);
        const used = usedPct(worst);
        const wInfo = lowestWeeklyInfo(state);
        if (wInfo) {
            const wPct = Math.round(wInfo.fraction * 100);
            const wUsed = Math.round((1 - wInfo.fraction) * 100);
            this._item.text = `${d} ${rem}% · 📅${wPct}% ↺${reset}`;
            this._item.backgroundColor = bgColor(Math.max(used, wUsed));
        }
        else {
            this._item.text = `${d} ${rem}% ↺${reset}`;
            this._item.backgroundColor = bgColor(used);
        }
        this._item.tooltip = buildTooltip(state, 'compact');
    }
    // ── SHORT  →  🟢 3.8FH·98  🟢 Sn4T·65  📅W:55% ↺5h ────────
    // Top 3 chips + weekly pool status + reset
    _renderShort(state) {
        const top = [...state.models]
            .sort((a, b) => remFraction(a) - remFraction(b))
            .slice(0, 3);
        const chips = top.map(m => {
            const frac = remFraction(m);
            const rem = Math.round(frac * 100);
            const d = dot(frac);
            const chip = shortChip(m.displayName);
            const remStr = rem >= 100 ? '∞' : `${rem}%`;
            return `${d}${chip}·${remStr}`;
        });
        const reset = countdown(state.models[0].resetTimestamp);
        const worstUsed = usedPct([...state.models].sort((a, b) => remFraction(a) - remFraction(b))[0]);
        const wInfo = lowestWeeklyInfo(state);
        if (wInfo) {
            const wPct = Math.round(wInfo.fraction * 100);
            const wUsed = Math.round((1 - wInfo.fraction) * 100);
            this._item.text = `${chips.join('  ')}  📅W:${wPct}%  ↺${reset}`;
            this._item.backgroundColor = bgColor(Math.max(worstUsed, wUsed));
        }
        else {
            this._item.text = `${chips.join('  ')}  ↺${reset}`;
            this._item.backgroundColor = bgColor(worstUsed);
        }
        this._item.tooltip = buildTooltip(state, 'expanded');
    }
    // ── DETAILED  →  dots row + weekly groups + rich tooltip ──
    _renderDetailed(state) {
        const dots = state.models.map(m => dot(remFraction(m))).join('');
        const reset = countdown(state.models[0].resetTimestamp);
        const total = state.models.length;
        const exhausted = state.models.filter(m => remFraction(m) <= 0.05).length;
        const exhaustedStr = exhausted > 0 ? ` ⚡${exhausted}` : '';
        let weeklyTag = '';
        if (state.groups && state.groups.length > 0) {
            const parts = state.groups.map(g => {
                const wb = g.buckets.find(b => b.window === 'weekly' || b.bucketId.toLowerCase().includes('weekly') || b.displayName.toLowerCase().includes('weekly'));
                const label = g.displayName.toLowerCase().includes('gemini') ? 'Gem' : '3P';
                return wb ? `${label}:${Math.round(wb.remainingFraction * 100)}%` : '';
            }).filter(Boolean);
            if (parts.length > 0) {
                weeklyTag = ` | 📅 ${parts.join(' ')}`;
            }
        }
        else {
            const wInfo = lowestWeeklyInfo(state);
            if (wInfo) {
                weeklyTag = ` | 📅 W:${Math.round(wInfo.fraction * 100)}%`;
            }
        }
        this._item.text = `$(pulse) ${dots} ${total}M${exhaustedStr}${weeklyTag} ↺${reset}`;
        this._item.backgroundColor = undefined;
        this._item.tooltip = buildTooltip(state, 'detailed');
    }
}
exports.StatusBarController = StatusBarController;
//# sourceMappingURL=statusBarController.js.map