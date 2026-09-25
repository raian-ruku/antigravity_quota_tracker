import * as vscode from 'vscode';
import { QuotaDataService } from './quotaDataService';
import { ModelQuota, QuotaState, StatusBarMode } from './types';

// ─────────────────────────────────────────────────────────────
//  StatusBarController  —  minimal, colorful, 3-mode
//
//  MINI     →  ◉ 98%  ↺5h           (single dot + reset)
//  SHORT    →  ◉ 3.8H·98  ◉ Sn4·∞  (top N chips)
//  DETAILED →  rich tooltip only, bar shows chip row + all info
// ─────────────────────────────────────────────────────────────

const MODES: StatusBarMode[] = ['compact', 'expanded', 'detailed'];

// ── Helpers ──────────────────────────────────────────────────

function usedPct(model: ModelQuota): number {
  const { used, limit } = model.requests;
  return limit > 0 ? Math.round((used / limit) * 100) : 0;
}

function remPct(model: ModelQuota): number {
  const rem = model.requests.limit > 0
    ? ((model.requests.limit - model.requests.used) / model.requests.limit) * 100
    : 100;
  return Math.round(Math.max(0, Math.min(100, rem)));
}

function remFraction(model: ModelQuota): number {
  const { used, limit } = model.requests;
  return limit > 0 ? Math.max(0, Math.min(1, (limit - used) / limit)) : 1;
}

/** Format time until reset — compact style */
function countdown(resetMs: number): string {
  const diff = resetMs - Date.now();
  if (diff <= 0) { return 'now'; }
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) { return `${Math.floor(h / 24)}d`; }
  if (h > 0) { return `${h}h${m > 0 ? `${m}m` : ''}`; }
  return `${m}m`;
}

/** Colorful dot based on remaining quota */
function dot(frac: number): string {
  if (frac <= 0.05) { return '🔴'; }
  if (frac <= 0.25) { return '🟡'; }
  if (frac <= 0.60) { return '🟢'; }
  return '🟢';
}

/** ThemeColor for status bar background */
function bgColor(usedPctVal: number): vscode.ThemeColor | undefined {
  if (usedPctVal >= 95) { return new vscode.ThemeColor('statusBarItem.errorBackground'); }
  if (usedPctVal >= 80) { return new vscode.ThemeColor('statusBarItem.warningBackground'); }
  return undefined; // default — no tint
}

/** Mini 5-block sparkline bar  e.g. ▰▰▰▱▱ */
function miniBar(frac: number, w = 5): string {
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
function shortChip(label: string): string {
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
  if (gptM) { return `G${gptM[1]}`; }

  // Generic fallback: first 5 chars
  return label.replace(/[^A-Za-z0-9]/g, '').slice(0, 5);
}

/** Build rich markdown tooltip shared by all modes */
function buildTooltip(state: QuotaState, mode: StatusBarMode): vscode.MarkdownString {
  const now = Date.now();
  const lastSeen = state.lastFetched
    ? new Date(state.lastFetched).toLocaleTimeString()
    : 'never';

  const modeLabel = mode === 'compact' ? 'mini' : mode === 'expanded' ? 'short' : 'detailed';
  const lines: string[] = [
    `## $(pulse) Antigravity Quota Tracker`,
    `*Mode: **${modeLabel}** — click status bar to cycle*`,
    '',
    `| Model | Remaining | Reset in |`,
    `|---|:---:|:---:|`,
  ];

  for (const m of state.models) {
    const rem = remPct(m);
    const frac = remFraction(m);
    const d = dot(frac);
    const bar = miniBar(frac, 6);
    const reset = countdown(m.resetTimestamp);
    // Highlight exhausted or nearly exhausted
    const remStr = rem <= 5 ? `**${rem}%**` : `${rem}%`;
    lines.push(`| ${d} ${m.displayName} | ${bar} ${remStr} | ${reset} |`);
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
function readAlignment(cfg: vscode.WorkspaceConfiguration): vscode.StatusBarAlignment {
  return cfg.get<string>('statusBarAlignment', 'Left') === 'Right'
    ? vscode.StatusBarAlignment.Right
    : vscode.StatusBarAlignment.Left;
}

/** Read numeric priority from settings */
function readPriority(cfg: vscode.WorkspaceConfiguration): number {
  return cfg.get<number>('statusBarPriority', 100);
}

export class StatusBarController {
  private _item: vscode.StatusBarItem;
  private _mode: StatusBarMode;
  private _visible: boolean;
  private _lastState: QuotaState | null = null;

  constructor(private _service: QuotaDataService) {
    this._mode = _service.settings.statusBarMode;
    this._visible = _service.settings.statusBarVisible;
    const cfg = vscode.workspace.getConfiguration('quotaTracker');
    this._item = this._createItem(readAlignment(cfg), readPriority(cfg));
    this._render(this._service.state);
    if (this._visible) { this._item.show(); }
  }

  /** Recreate the status bar item with new alignment + priority (cannot be mutated after creation). */
  recreate(): void {
    const wasVisible = this._visible;
    const cfg = vscode.workspace.getConfiguration('quotaTracker');
    this._item.dispose();
    this._item = this._createItem(readAlignment(cfg), readPriority(cfg));
    if (this._lastState) { this._render(this._lastState); }
    if (wasVisible) { this._item.show(); }
  }

  private _createItem(
    alignment: vscode.StatusBarAlignment,
    priority: number
  ): vscode.StatusBarItem {
    const item = vscode.window.createStatusBarItem(alignment, priority);
    item.command = 'quotaTracker.cycleMode';
    return item;
  }

  update(state: QuotaState): void {
    this._lastState = state;
    this._render(state);
  }

  cycleMode(): void {
    const idx = MODES.indexOf(this._mode);
    this._mode = MODES[(idx + 1) % MODES.length];
    vscode.workspace.getConfiguration('quotaTracker').update(
      'statusBarMode', this._mode, vscode.ConfigurationTarget.Global
    );
    if (this._lastState) { this._render(this._lastState); }
    const label = this._mode === 'compact' ? 'mini' : this._mode === 'expanded' ? 'short' : 'detailed';
    vscode.window.setStatusBarMessage(`$(pulse) Quota: ${label} mode`, 1800);
  }

  setMode(mode: StatusBarMode): void {
    this._mode = mode;
    if (this._lastState) { this._render(this._lastState); }
  }

  toggle(): void {
    this._visible = !this._visible;
    vscode.workspace.getConfiguration('quotaTracker').update(
      'statusBarVisible', this._visible, vscode.ConfigurationTarget.Global
    );
    if (this._visible) {
      this._item.show();
      vscode.window.setStatusBarMessage('$(eye) Quota bar shown', 1500);
    } else {
      this._item.hide();
      vscode.window.setStatusBarMessage('$(eye-closed) Quota bar hidden', 1500);
    }
  }

  dispose(): void {
    this._item.dispose();
  }

  // ── Rendering ─────────────────────────────────────────────

  private _render(state: QuotaState): void {
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
      case 'compact':   this._renderMini(state);     break;
      case 'expanded':  this._renderShort(state);    break;
      case 'detailed':  this._renderDetailed(state); break;
    }
  }

  // ── MINI  →  🟢 98% ↺5h ──────────────────────────────────
  // Single dot, best-remaining model %, time to reset
  private _renderMini(state: QuotaState): void {
    // Show the most-used (lowest remaining) model as the "watchdog"
    const worst = [...state.models].sort((a, b) => remFraction(a) - remFraction(b))[0];
    const frac = remFraction(worst);
    const rem = Math.round(frac * 100);
    const d = dot(frac);
    const reset = countdown(worst.resetTimestamp);
    const used = usedPct(worst);

    this._item.text = `${d} ${rem}% ↺${reset}`;
    this._item.backgroundColor = bgColor(used);
    this._item.tooltip = buildTooltip(state, 'compact');
  }

  // ── SHORT  →  🟢 3.8FH·98  🟢 Sn4T·∞ ────────────────────
  // Top 3 chips with dot + short name + remaining %
  private _renderShort(state: QuotaState): void {
    // Pick top 3 by lowest remaining (most interesting to watch)
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

    this._item.text = `${chips.join('  ')}  ↺${reset}`;
    this._item.backgroundColor = bgColor(worstUsed);
    this._item.tooltip = buildTooltip(state, 'expanded');
  }

  // ── DETAILED  →  full chip row + rich tooltip ─────────────
  // All models as tiny dots in the bar, full table in tooltip
  private _renderDetailed(state: QuotaState): void {
    // Spark row: one colored dot per model
    const dots = state.models.map(m => dot(remFraction(m))).join('');
    const reset = countdown(state.models[0].resetTimestamp);
    const total = state.models.length;
    const exhausted = state.models.filter(m => remFraction(m) <= 0.05).length;
    const exhaustedStr = exhausted > 0 ? ` ⚡${exhausted}` : '';

    this._item.text = `$(pulse) ${dots} ${total}M${exhaustedStr} ↺${reset}`;
    this._item.backgroundColor = undefined;
    this._item.tooltip = buildTooltip(state, 'detailed');
  }
}
