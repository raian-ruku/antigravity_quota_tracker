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

/** Find the lowest weekly quota pool across groups or models */
function lowestWeeklyInfo(state: QuotaState): { fraction: number; resetMs: number; name: string } | null {
  if (state.groups && state.groups.length > 0) {
    const weeklyBuckets: { fraction: number; resetMs: number; name: string }[] = [];
    for (const g of state.groups) {
      const wb = g.buckets.find(
        b => b.window === 'weekly' || b.bucketId.toLowerCase().includes('weekly') || b.displayName.toLowerCase().includes('weekly')
      );
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

/** Find the weekly quota pool for the active model or lowest across groups */
function activeWeeklyInfo(state: QuotaState, targetModel?: ModelQuota): { fraction: number; resetMs: number; name: string } | null {
  if (targetModel && targetModel.weeklyRemainingFraction !== undefined) {
    return {
      fraction: targetModel.weeklyRemainingFraction,
      resetMs: targetModel.weeklyResetTimestamp ?? Date.now(),
      name: targetModel.groupName || 'Weekly',
    };
  }

  if (targetModel && state.groups) {
    const lower = targetModel.displayName.toLowerCase();
    const group = state.groups.find(g => {
      const gName = g.displayName.toLowerCase();
      if (lower.includes('gemini') && gName.includes('gemini')) { return true; }
      if ((lower.includes('claude') || lower.includes('gpt') || lower.includes('sonnet') || lower.includes('opus')) &&
          (gName.includes('claude') || gName.includes('gpt') || gName.includes('other'))) {
        return true;
      }
      return false;
    });
    if (group) {
      const wb = group.buckets.find(b => b.window === 'weekly' || b.bucketId.toLowerCase().includes('weekly') || b.displayName.toLowerCase().includes('weekly'));
      if (wb) {
        return {
          fraction: wb.remainingFraction,
          resetMs: wb.resetTimestamp,
          name: group.displayName.replace(' Models', '').replace(' and ', '/'),
        };
      }
    }
  }

  return lowestWeeklyInfo(state);
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
  ];

  // Active Agent Model callout
  const active = state.activeModelId
    ? state.models.find(m => m.modelId === state.activeModelId || m.displayName === state.activeModelName)
    : null;

  if (active) {
    const aRem = remPct(active);
    const aReset = countdown(active.resetTimestamp);
    const aWInfo = activeWeeklyInfo(state, active);
    const aWStr = aWInfo ? ` · 📅 Weekly: **${Math.round(aWInfo.fraction * 100)}%** (${aWInfo.name})` : '';
    lines.push(`> ⚡ **Active Agent Model:** **${active.displayName}**`);
    lines.push(`> 5-Hour Quota: **${aRem}%** remaining (↺ in ${aReset})${aWStr}`);
    lines.push('');
  }

  // 1. Weekly Quotas (Shared Pools) section
  if (state.groups && state.groups.length > 0) {
    lines.push(`### 📅 Weekly Limits (Shared Pools)`);
    lines.push(`| Shared Pool | Weekly Remaining | 5-Hour Window | Weekly Reset |`);
    lines.push(`|---|:---:|:---:|:---:|`);

    for (const g of state.groups) {
      const weeklyBucket = g.buckets.find(
        b => b.window === 'weekly' || b.bucketId.toLowerCase().includes('weekly') || b.displayName.toLowerCase().includes('weekly')
      );
      const fiveHBucket = g.buckets.find(
        b => b.window === '5h' || b.bucketId.toLowerCase().includes('5h') || b.displayName.toLowerCase().includes('5-hour')
      );

      const wFrac = weeklyBucket ? weeklyBucket.remainingFraction : 1;
      const wPct = Math.round(wFrac * 100);
      const wBar = miniBar(wFrac, 5);
      const wDot = dot(wFrac);
      const wReset = weeklyBucket ? countdown(weeklyBucket.resetTimestamp) : '—';

      const fPct = fiveHBucket ? `${Math.round(fiveHBucket.remainingFraction * 100)}%` : '—';
      const isPoolActive = active && (
        (active.displayName.toLowerCase().includes('gemini') && g.displayName.toLowerCase().includes('gemini')) ||
        (!active.displayName.toLowerCase().includes('gemini') && !g.displayName.toLowerCase().includes('gemini'))
      );
      const poolName = isPoolActive ? `**${g.displayName}** ★` : g.displayName;

      lines.push(`| ${wDot} ${poolName} | ${wBar} ${wPct}% | ${fPct} | ↺ in ${wReset} |`);
    }
    lines.push('');
  }

  // 2. Individual Model table
  lines.push(`### 🤖 Model Quotas`);
  const hasWeekly = state.models.some(m => m.weeklyRemainingFraction !== undefined);
  if (hasWeekly) {
    lines.push(`| Model | 5h Left | Weekly Left | 5h Reset |`);
    lines.push(`|---|:---:|:---:|:---:|`);
  } else {
    lines.push(`| Model | Remaining | Reset in |`);
    lines.push(`|---|:---:|:---:|`);
  }

  for (const m of state.models) {
    const isActive = active && m.modelId === active.modelId;
    const rem = remPct(m);
    const frac = remFraction(m);
    const d = dot(frac);
    const bar = miniBar(frac, 5);
    const reset = countdown(m.resetTimestamp);
    const remStr = rem <= 5 ? `**${rem}%**` : `${rem}%`;
    const nameLabel = isActive ? `**${m.displayName}** ⚡` : m.displayName;

    if (hasWeekly) {
      const wFrac = m.weeklyRemainingFraction ?? 1;
      const wPct = Math.round(wFrac * 100);
      const wStr = wPct <= 10 ? `**${wPct}%**` : `${wPct}%`;
      lines.push(`| ${d} ${nameLabel} | ${bar} ${remStr} | 📅 ${wStr} | ${reset} |`);
    } else {
      lines.push(`| ${d} ${nameLabel} | ${bar} ${remStr} | ${reset} |`);
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
    this._lastState = this._service.state;
    this._render(this._lastState);
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

  // ── MINI  →  🟢 3.8H·93% · 📅98% ↺4h36m ────────────────
  // Displays the active agent model chip, 5h remaining %, corresponding weekly pool %, and reset
  private _renderMini(state: QuotaState): void {
    const worst = [...state.models].sort((a, b) => remFraction(a) - remFraction(b))[0];
    const active = state.activeModelId
      ? state.models.find(m => m.modelId === state.activeModelId || m.displayName === state.activeModelName)
      : null;
    const target = active || worst;
    if (!target) { return; }

    const frac = remFraction(target);
    const rem = Math.round(frac * 100);
    const d = dot(frac);
    const reset = countdown(target.resetTimestamp);
    const used = usedPct(target);
    const chip = shortChip(target.displayName);

    const wInfo = activeWeeklyInfo(state, target);
    if (wInfo) {
      const wPct = Math.round(wInfo.fraction * 100);
      const wUsed = Math.round((1 - wInfo.fraction) * 100);
      this._item.text = `${d} ${chip}·${rem}% · 📅${wPct}% ↺${reset}`;
      this._item.backgroundColor = bgColor(Math.max(used, wUsed));
    } else {
      this._item.text = `${d} ${chip}·${rem}% ↺${reset}`;
      this._item.backgroundColor = bgColor(used);
    }

    this._item.tooltip = buildTooltip(state, 'compact');
  }

  // ── SHORT  →  🟢 3.8H·93%  🟢 Sn4T·65%  📅98% ↺4h36m ───
  // Active model first, followed by other models / watchdog, plus active weekly pool
  private _renderShort(state: QuotaState): void {
    const active = state.activeModelId
      ? state.models.find(m => m.modelId === state.activeModelId || m.displayName === state.activeModelName)
      : null;

    const others = [...state.models]
      .filter(m => !active || m.modelId !== active.modelId)
      .sort((a, b) => remFraction(a) - remFraction(b));

    const displayModels = active ? [active, ...others.slice(0, 2)] : others.slice(0, 3);

    const chips = displayModels.map(m => {
      const frac = remFraction(m);
      const rem = Math.round(frac * 100);
      const d = dot(frac);
      const chip = shortChip(m.displayName);
      const remStr = rem >= 100 ? '∞' : `${rem}%`;
      return `${d}${chip}·${remStr}`;
    });

    const target = active || displayModels[0];
    const reset = countdown(target ? target.resetTimestamp : state.models[0].resetTimestamp);
    const worstUsed = usedPct([...state.models].sort((a, b) => remFraction(a) - remFraction(b))[0]);
    const wInfo = activeWeeklyInfo(state, target);

    if (wInfo) {
      const wPct = Math.round(wInfo.fraction * 100);
      const wUsed = Math.round((1 - wInfo.fraction) * 100);
      this._item.text = `${chips.join('  ')}  📅${wPct}%  ↺${reset}`;
      this._item.backgroundColor = bgColor(Math.max(worstUsed, wUsed));
    } else {
      this._item.text = `${chips.join('  ')}  ↺${reset}`;
      this._item.backgroundColor = bgColor(worstUsed);
    }

    this._item.tooltip = buildTooltip(state, 'expanded');
  }

  // ── DETAILED  →  dots row + active model tag + weekly groups + rich tooltip ──
  private _renderDetailed(state: QuotaState): void {
    const active = state.activeModelId
      ? state.models.find(m => m.modelId === state.activeModelId || m.displayName === state.activeModelName)
      : null;
    const activeTag = active ? `[${shortChip(active.displayName)}] ` : '';

    const dots = state.models.map(m => dot(remFraction(m))).join('');
    const reset = countdown(active ? active.resetTimestamp : state.models[0].resetTimestamp);
    const total = state.models.length;
    const exhausted = state.models.filter(m => remFraction(m) <= 0.05).length;
    const exhaustedStr = exhausted > 0 ? ` ⚡${exhausted}` : '';

    let weeklyTag = '';
    if (state.groups && state.groups.length > 0) {
      const parts = state.groups.map(g => {
        const wb = g.buckets.find(
          b => b.window === 'weekly' || b.bucketId.toLowerCase().includes('weekly') || b.displayName.toLowerCase().includes('weekly')
        );
        const label = g.displayName.toLowerCase().includes('gemini') ? 'Gem' : '3P';
        return wb ? `${label}:${Math.round(wb.remainingFraction * 100)}%` : '';
      }).filter(Boolean);
      if (parts.length > 0) {
        weeklyTag = ` | 📅 ${parts.join(' ')}`;
      }
    } else {
      const wInfo = activeWeeklyInfo(state, active || undefined);
      if (wInfo) {
        weeklyTag = ` | 📅 W:${Math.round(wInfo.fraction * 100)}%`;
      }
    }

    this._item.text = `$(pulse) ${activeTag}${dots} ${total}M${exhaustedStr}${weeklyTag} ↺${reset}`;
    this._item.backgroundColor = undefined;
    this._item.tooltip = buildTooltip(state, 'detailed');
  }
}
