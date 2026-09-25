import * as vscode from "vscode";
import {
  ModelId,
  ModelQuota,
  QuotaSnapshot,
  QuotaState,
  Tier,
  ExtensionSettings,
} from "./types";
import {
  discoverAntigravitySession,
  fetchLocalUserStatus,
  AntigravitySession,
  ConnectUserStatusResponse,
} from "./antigravityProcessService";

// ─────────────────────────────────────────────────────────────
//  QuotaDataService
//  Responsible for: discovering local Antigravity Language Server,
//  bypassing CSRF using x-codeium-csrf-token, caching, and
//  broadcasting quota data to panel + status bar.
// ─────────────────────────────────────────────────────────────

const HISTORY_KEY = "quotaTracker.history";
const STATE_CACHE_KEY = "quotaTracker.stateCache";
const MAX_HISTORY_PER_MODEL = 48; // 48 × 30min = 24h

export class QuotaDataService {
  private _state: QuotaState;
  private _context: vscode.ExtensionContext;
  private _refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private _session: AntigravitySession | null = null;
  private _onChangeEmitter = new vscode.EventEmitter<QuotaState>();
  public readonly onChange = this._onChangeEmitter.event;

  constructor(context: vscode.ExtensionContext) {
    this._context = context;
    this._state = this._loadCachedState();
    this._scheduleRefresh();
  }

  get state(): QuotaState {
    return this._state;
  }

  get settings(): ExtensionSettings {
    const cfg = vscode.workspace.getConfiguration("quotaTracker");
    return {
      apiKey: cfg.get<string>("apiKey", ""),
      refreshInterval: cfg.get<number>("refreshInterval", 60),
      statusBarMode: cfg.get<any>("statusBarMode", "compact"),
      statusBarVisible: cfg.get<boolean>("statusBarVisible", true),
    };
  }

  async refresh(): Promise<void> {
    this._setState({ ...this._state, isLoading: true, error: null });

    try {
      let models: ModelQuota[] | null = null;

      // 1. Primary: Query the local Antigravity Language Server daemon
      try {
        models = await this._fetchLocalProcessQuotas();
      } catch (localErr: any) {
        console.warn("[QuotaTracker] Local process fetch failed:", localErr.message);
      }

      // 2. Secondary fallback: Cloud API if user provided an API key
      if (!models && this.settings.apiKey) {
        try {
          models = await this._fetchFromApi(this.settings.apiKey);
        } catch (apiErr: any) {
          console.warn("[QuotaTracker] API fallback failed:", apiErr.message);
        }
      }

      // 3. Fallback: Demo data if neither is available
      if (!models || models.length === 0) {
        models = this._generateDemoData();
      }

      const now = Date.now();
      const history = this._loadHistory();

      // Append snapshot for each model
      for (const m of models) {
        const snap: QuotaSnapshot = {
          timestamp: now,
          requestsUsed: m.requests.used,
          tokensIn: m.tokensIn.used,
          tokensOut: m.tokensOut.used,
        };
        if (!history[m.modelId]) {
          history[m.modelId] = [];
        }
        history[m.modelId].push(snap);
        // Trim to max
        if (history[m.modelId].length > MAX_HISTORY_PER_MODEL) {
          history[m.modelId] = history[m.modelId].slice(-MAX_HISTORY_PER_MODEL);
        }
      }

      this._saveHistory(history);

      const totalCost = models.reduce((sum, m) => sum + m.estimatedCostUsd, 0);

      const newState: QuotaState = {
        models,
        history,
        totalCostUsd: totalCost,
        isLoading: false,
        error: null,
        lastFetched: now,
      };

      this._setState(newState);
      this._cacheState(newState);
    } catch (err: any) {
      this._setState({
        ...this._state,
        isLoading: false,
        error: err.message ?? "Unknown error",
      });
    }
  }

  scheduleRefreshWithInterval(seconds: number): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = undefined;
    }
    if (seconds > 0) {
      this._scheduleRefresh(seconds * 1000);
    }
  }

  dispose(): void {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
    }
    this._onChangeEmitter.dispose();
  }

  // ── Private ─────────────────────────────────────────────

  private _setState(state: QuotaState): void {
    this._state = state;
    this._onChangeEmitter.fire(state);
  }

  private _scheduleRefresh(ms?: number): void {
    const interval = ms ?? this.settings.refreshInterval * 1000;
    if (interval <= 0) {
      return;
    }
    this._refreshTimer = setTimeout(async () => {
      await this.refresh();
      this._scheduleRefresh(); // reschedule
    }, interval);
  }

  private _loadCachedState(): QuotaState {
    const cached = this._context.globalState.get<QuotaState>(STATE_CACHE_KEY);
    if (cached) {
      return cached;
    }
    return {
      models: this._generateDemoData(),
      history: {},
      totalCostUsd: 0,
      isLoading: false,
      error: null,
      lastFetched: null,
    };
  }

  private _cacheState(state: QuotaState): void {
    this._context.globalState.update(STATE_CACHE_KEY, state);
  }

  private _loadHistory(): Record<ModelId, QuotaSnapshot[]> {
    return this._context.globalState.get<Record<ModelId, QuotaSnapshot[]>>(
      HISTORY_KEY,
      {} as any,
    );
  }

  private _saveHistory(history: Record<ModelId, QuotaSnapshot[]>): void {
    this._context.globalState.update(HISTORY_KEY, history);
  }

  // ── Local Process Fetch ──────────────────────────────────
  // Queries the local Antigravity Language Server process via Connect RPC
  // using x-codeium-csrf-token authentication.

  private async _fetchLocalProcessQuotas(): Promise<ModelQuota[]> {
    if (!this._session) {
      this._session = await discoverAntigravitySession();
    }
    if (!this._session) {
      throw new Error("Antigravity language server process not found");
    }

    let response: ConnectUserStatusResponse | null = null;
    try {
      response = await fetchLocalUserStatus(this._session);
    } catch (err) {
      // Re-discover if port or token changed (e.g. IDE restart)
      this._session = await discoverAntigravitySession();
      if (this._session) {
        response = await fetchLocalUserStatus(this._session);
      } else {
        throw err;
      }
    }

    if (!response || !response.userStatus) {
      throw new Error("Invalid response from Antigravity language server");
    }

    return this._mapConnectResponse(response);
  }

  private _mapConnectResponse(data: ConnectUserStatusResponse): ModelQuota[] {
    const userStatus = data.userStatus;
    const configs = userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
    const userTierName = userStatus?.userTier?.name?.toLowerCase() || "";
    const defaultTier: Tier = userTierName.includes("ultra")
      ? "enterprise"
      : userTierName.includes("pro")
      ? "pro"
      : "free";

    const now = Date.now();

    return configs.map((c) => {
      const remainingFraction = c.quotaInfo?.remainingFraction ?? 1.0;
      const usedFraction = Math.max(0, Math.min(1, 1 - remainingFraction));
      const usedPercent = Math.round(usedFraction * 100);

      const resetMs = c.quotaInfo?.resetTime
        ? new Date(c.quotaInfo.resetTime).getTime()
        : now + 4 * 3600000;

      let tier: Tier = defaultTier;
      if (c.label.toLowerCase().includes("ultra")) {
        tier = "enterprise";
      } else if (c.label.toLowerCase().includes("pro")) {
        tier = "pro";
      }

      return {
        modelId: c.modelId || c.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        displayName: c.label,
        tier,
        requests: {
          used: usedPercent,
          limit: 100, // Normalized to 100% capacity
        },
        tokensIn: {
          used: Math.round(usedFraction * 1000000),
          limit: 1000000,
        },
        tokensOut: {
          used: Math.round(usedFraction * 200000),
          limit: 200000,
        },
        estimatedCostUsd: 0,
        resetTimestamp: resetMs,
        lastUpdated: now,
      };
    });
  }

  // ── API Fetch ────────────────────────────────────────────
  // Attempts to fetch from Antigravity quota endpoint.
  // If the API structure changes, update response parsing here.


  private async _fetchFromApi(apiKey: string): Promise<ModelQuota[]> {
    const url = "https://generativelanguage.googleapis.com/v1/quota";
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // Fallback to demo data with an error note
      console.warn(
        `[QuotaTracker] API returned ${response.status}, using demo data`,
      );
      return this._generateDemoData();
    }

    const json = (await response.json()) as any;
    return this._parseApiResponse(json);
  }

  private _parseApiResponse(json: any): ModelQuota[] {
    // Adapt this to the actual Antigravity quota API response shape
    if (Array.isArray(json?.quotas)) {
      return json.quotas.map((q: any) => this._mapQuota(q));
    }
    // Fallback
    return this._generateDemoData();
  }

  private _mapQuota(q: any): ModelQuota {
    const now = Date.now();
    const resetMs = q.resetTime
      ? new Date(q.resetTime).getTime()
      : now + 3600000;
    return {
      modelId: (q.model as ModelId) ?? "gemini-2.5-flash",
      displayName: q.displayName ?? q.model ?? "Unknown",
      tier: q.tier ?? "free",
      requests: { used: q.requestsUsed ?? 0, limit: q.requestsLimit ?? 1500 },
      tokensIn: {
        used: q.tokensInputUsed ?? 0,
        limit: q.tokensInputLimit ?? 1000000,
      },
      tokensOut: {
        used: q.tokensOutputUsed ?? 0,
        limit: q.tokensOutputLimit ?? 500000,
      },
      estimatedCostUsd: q.estimatedCost ?? 0,
      resetTimestamp: resetMs,
      lastUpdated: now,
    };
  }

  // ── Demo / Mock Data ──────────────────────────────────────

  private _generateDemoData(): ModelQuota[] {
    const now = Date.now();
    const resetIn2h = now + 2 * 60 * 60 * 1000;
    const resetIn6h = now + 6 * 60 * 60 * 1000;
    const resetIn24h = now + 24 * 60 * 60 * 1000;

    return [
      {
        modelId: "gemini-2.5-flash",
        displayName: "Gemini 2.5 Flash",
        tier: "free",
        requests: { used: 1248, limit: 1500 },
        tokensIn: { used: 824300, limit: 1000000 },
        tokensOut: { used: 312100, limit: 500000 },
        estimatedCostUsd: 0,
        resetTimestamp: resetIn2h,
        lastUpdated: now,
      },
      {
        modelId: "gemini-2.5-pro",
        displayName: "Gemini 2.5 Pro",
        tier: "pro",
        requests: { used: 342, limit: 2000 },
        tokensIn: { used: 1820000, limit: 5000000 },
        tokensOut: { used: 490000, limit: 2000000 },
        estimatedCostUsd: 4.27,
        resetTimestamp: resetIn6h,
        lastUpdated: now,
      },
      {
        modelId: "gemini-2.0-flash",
        displayName: "Gemini 2.0 Flash",
        tier: "free",
        requests: { used: 89, limit: 500 },
        tokensIn: { used: 45200, limit: 250000 },
        tokensOut: { used: 12800, limit: 100000 },
        estimatedCostUsd: 0,
        resetTimestamp: resetIn24h,
        lastUpdated: now,
      },
      {
        modelId: "gemini-ultra",
        displayName: "Gemini Ultra",
        tier: "enterprise",
        requests: { used: 28, limit: 100 },
        tokensIn: { used: 210000, limit: 1000000 },
        tokensOut: { used: 78000, limit: 400000 },
        estimatedCostUsd: 18.9,
        resetTimestamp: resetIn6h,
        lastUpdated: now,
      },
      {
        modelId: "gemini-nano",
        displayName: "Gemini Nano",
        tier: "free",
        requests: { used: 512, limit: 5000 },
        tokensIn: { used: 92000, limit: 2000000 },
        tokensOut: { used: 31000, limit: 800000 },
        estimatedCostUsd: 0,
        resetTimestamp: resetIn24h,
        lastUpdated: now,
      },
    ];
  }
}
