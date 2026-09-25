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
exports.QuotaDataService = void 0;
const vscode = __importStar(require("vscode"));
const antigravityProcessService_1 = require("./antigravityProcessService");
// ─────────────────────────────────────────────────────────────
//  QuotaDataService
//  Responsible for: discovering local Antigravity Language Server,
//  bypassing CSRF using x-codeium-csrf-token, caching, and
//  broadcasting quota data to panel + status bar.
// ─────────────────────────────────────────────────────────────
const HISTORY_KEY = "quotaTracker.history";
const STATE_CACHE_KEY = "quotaTracker.stateCache";
const MAX_HISTORY_PER_MODEL = 48; // 48 × 30min = 24h
class QuotaDataService {
    constructor(context) {
        this._session = null;
        this._onChangeEmitter = new vscode.EventEmitter();
        this.onChange = this._onChangeEmitter.event;
        this._context = context;
        this._state = this._loadCachedState();
        this._scheduleRefresh();
    }
    get state() {
        return this._state;
    }
    get settings() {
        const cfg = vscode.workspace.getConfiguration("quotaTracker");
        return {
            apiKey: cfg.get("apiKey", ""),
            refreshInterval: cfg.get("refreshInterval", 60),
            statusBarMode: cfg.get("statusBarMode", "compact"),
            statusBarVisible: cfg.get("statusBarVisible", true),
        };
    }
    async refresh() {
        this._setState({ ...this._state, isLoading: true, error: null });
        try {
            let models = null;
            let groups = undefined;
            let userTierName = undefined;
            // 1. Primary: Query the local Antigravity Language Server daemon
            try {
                const localResult = await this._fetchLocalProcessQuotas();
                models = localResult.models;
                groups = localResult.groups;
                userTierName = localResult.userTierName;
            }
            catch (localErr) {
                console.warn("[QuotaTracker] Local process fetch failed:", localErr.message);
            }
            // 2. Secondary fallback: Cloud API if user provided an API key
            if (!models && this.settings.apiKey) {
                try {
                    models = await this._fetchFromApi(this.settings.apiKey);
                }
                catch (apiErr) {
                    console.warn("[QuotaTracker] API fallback failed:", apiErr.message);
                }
            }
            // 3. Fallback: Demo data if neither is available
            if (!models || models.length === 0) {
                const demo = this._generateDemoData();
                models = demo.models;
                groups = demo.groups;
            }
            const now = Date.now();
            const history = this._loadHistory();
            // Append snapshot for each model
            for (const m of models) {
                const snap = {
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
            const newState = {
                models,
                groups,
                history,
                totalCostUsd: totalCost,
                isLoading: false,
                error: null,
                lastFetched: now,
                userTierName,
            };
            this._setState(newState);
            this._cacheState(newState);
        }
        catch (err) {
            this._setState({
                ...this._state,
                isLoading: false,
                error: err.message ?? "Unknown error",
            });
        }
    }
    scheduleRefreshWithInterval(seconds) {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = undefined;
        }
        if (seconds > 0) {
            this._scheduleRefresh(seconds * 1000);
        }
    }
    dispose() {
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
        }
        this._onChangeEmitter.dispose();
    }
    // ── Private ─────────────────────────────────────────────
    _setState(state) {
        this._state = state;
        this._onChangeEmitter.fire(state);
    }
    _scheduleRefresh(ms) {
        const interval = ms ?? this.settings.refreshInterval * 1000;
        if (interval <= 0) {
            return;
        }
        this._refreshTimer = setTimeout(async () => {
            await this.refresh();
            this._scheduleRefresh(); // reschedule
        }, interval);
    }
    _loadCachedState() {
        const cached = this._context.globalState.get(STATE_CACHE_KEY);
        if (cached) {
            return cached;
        }
        const demo = this._generateDemoData();
        return {
            models: demo.models,
            groups: demo.groups,
            history: {},
            totalCostUsd: 0,
            isLoading: false,
            error: null,
            lastFetched: null,
        };
    }
    _cacheState(state) {
        this._context.globalState.update(STATE_CACHE_KEY, state);
    }
    _loadHistory() {
        return this._context.globalState.get(HISTORY_KEY, {});
    }
    _saveHistory(history) {
        this._context.globalState.update(HISTORY_KEY, history);
    }
    // ── Local Process Fetch ──────────────────────────────────
    // Queries the local Antigravity Language Server process via Connect RPC
    // using x-codeium-csrf-token authentication.
    async _fetchLocalProcessQuotas() {
        if (!this._session) {
            this._session = await (0, antigravityProcessService_1.discoverAntigravitySession)();
        }
        if (!this._session) {
            throw new Error("Antigravity language server process not found");
        }
        let statusResponse = null;
        let summaryResponse = null;
        try {
            const results = await Promise.allSettled([
                (0, antigravityProcessService_1.fetchLocalUserStatus)(this._session),
                (0, antigravityProcessService_1.fetchLocalUserQuotaSummary)(this._session),
            ]);
            if (results[0].status === "fulfilled") {
                statusResponse = results[0].value;
            }
            if (results[1].status === "fulfilled") {
                summaryResponse = results[1].value;
            }
        }
        catch (err) {
            // Re-discover if port or token changed (e.g. IDE restart)
            this._session = await (0, antigravityProcessService_1.discoverAntigravitySession)();
            if (this._session) {
                const results = await Promise.allSettled([
                    (0, antigravityProcessService_1.fetchLocalUserStatus)(this._session),
                    (0, antigravityProcessService_1.fetchLocalUserQuotaSummary)(this._session),
                ]);
                if (results[0].status === "fulfilled") {
                    statusResponse = results[0].value;
                }
                if (results[1].status === "fulfilled") {
                    summaryResponse = results[1].value;
                }
            }
            else {
                throw err;
            }
        }
        if (!statusResponse || !statusResponse.userStatus) {
            throw new Error("Invalid response from Antigravity language server");
        }
        const groups = this._mapQuotaGroups(summaryResponse);
        const userTierName = statusResponse.userStatus?.userTier?.name;
        const models = this._mapConnectResponse(statusResponse, groups);
        return { models, groups, userTierName };
    }
    _mapQuotaGroups(data) {
        const rawGroups = data?.response?.groups;
        if (!rawGroups || !Array.isArray(rawGroups) || rawGroups.length === 0) {
            return this._generateDemoGroups(Date.now());
        }
        const now = Date.now();
        return rawGroups.map((g) => {
            const buckets = (g.buckets || []).map((b) => {
                const remainingFraction = typeof b.remainingFraction === "number"
                    ? b.remainingFraction
                    : b.remaining?.value ?? b.remaining_fraction ?? 1.0;
                const usedFraction = Math.max(0, Math.min(1, 1 - remainingFraction));
                const usedPercent = Math.round(usedFraction * 100);
                const resetMs = b.resetTime
                    ? new Date(b.resetTime).getTime()
                    : b.reset_time
                        ? new Date(b.reset_time).getTime()
                        : now + 7 * 24 * 3600000;
                const window = b.window ||
                    (b.bucketId?.toLowerCase().includes("weekly")
                        ? "weekly"
                        : b.bucketId?.toLowerCase().includes("5h")
                            ? "5h"
                            : "weekly");
                return {
                    bucketId: b.bucketId || "bucket-" + Math.random().toString(36).slice(2),
                    displayName: b.displayName ||
                        (window === "weekly" ? "Weekly Limit Remaining" : "5-Hour Limit Remaining"),
                    description: b.description,
                    window,
                    remainingFraction,
                    usedPercent,
                    resetTimestamp: resetMs,
                };
            });
            return {
                displayName: g.displayName || "Model Group",
                description: g.description,
                buckets,
            };
        });
    }
    _findGroupForModel(modelLabel, groups) {
        const lower = modelLabel.toLowerCase();
        // Check Gemini
        if (lower.includes("gemini")) {
            const match = groups.find((g) => g.displayName.toLowerCase().includes("gemini") ||
                (g.description || "").toLowerCase().includes("gemini"));
            if (match)
                return match;
        }
        // Check Claude or GPT
        if (lower.includes("claude") ||
            lower.includes("gpt") ||
            lower.includes("sonnet") ||
            lower.includes("opus") ||
            lower.includes("oss")) {
            const match = groups.find((g) => g.displayName.toLowerCase().includes("claude") ||
                g.displayName.toLowerCase().includes("gpt") ||
                (g.description || "").toLowerCase().includes("claude") ||
                (g.description || "").toLowerCase().includes("gpt"));
            if (match)
                return match;
        }
        // Generic match
        return groups.find((g) => {
            const desc = (g.description || "").toLowerCase();
            const name = g.displayName.toLowerCase();
            const words = lower.split(/[\s\-()]+/);
            return words.some((w) => w.length > 2 && (name.includes(w) || desc.includes(w)));
        });
    }
    _mapConnectResponse(data, groups = []) {
        const userStatus = data.userStatus;
        const configs = userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
        const userTierName = userStatus?.userTier?.name?.toLowerCase() || "";
        const defaultTier = userTierName.includes("ultra")
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
            let tier = defaultTier;
            if (c.label.toLowerCase().includes("ultra")) {
                tier = "enterprise";
            }
            else if (c.label.toLowerCase().includes("pro")) {
                tier = "pro";
            }
            // Map group and weekly bucket
            const matchedGroup = this._findGroupForModel(c.label, groups);
            const weeklyBucket = matchedGroup?.buckets.find((b) => b.window === "weekly" ||
                b.bucketId.toLowerCase().includes("weekly") ||
                b.displayName.toLowerCase().includes("weekly"));
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
                weeklyRemainingFraction: weeklyBucket ? weeklyBucket.remainingFraction : undefined,
                weeklyResetTimestamp: weeklyBucket ? weeklyBucket.resetTimestamp : undefined,
                groupName: matchedGroup ? matchedGroup.displayName : undefined,
            };
        });
    }
    // ── API Fetch ────────────────────────────────────────────
    // Attempts to fetch from Antigravity quota endpoint.
    // If the API structure changes, update response parsing here.
    async _fetchFromApi(apiKey) {
        const url = "https://generativelanguage.googleapis.com/v1/quota";
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "x-goog-api-key": apiKey,
                "Content-Type": "application/json",
            },
        });
        if (!response.ok) {
            console.warn(`[QuotaTracker] API returned ${response.status}, using demo data`);
            return this._generateDemoData().models;
        }
        const json = (await response.json());
        return this._parseApiResponse(json);
    }
    _parseApiResponse(json) {
        if (Array.isArray(json?.quotas)) {
            return json.quotas.map((q) => this._mapQuota(q));
        }
        return this._generateDemoData().models;
    }
    _mapQuota(q) {
        const now = Date.now();
        const resetMs = q.resetTime
            ? new Date(q.resetTime).getTime()
            : now + 3600000;
        return {
            modelId: q.model ?? "gemini-2.5-flash",
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
    _generateDemoGroups(now) {
        const weeklyResetGemini = now + (6 * 24 + 10) * 3600 * 1000;
        const weeklyResetClaude = now + (6 * 24 + 8) * 3600 * 1000;
        const fiveHResetGemini = now + 4 * 3600 * 1000 + 46 * 60 * 1000;
        const fiveHResetClaude = now + 1 * 3600 * 1000 + 9 * 60 * 1000;
        return [
            {
                displayName: "Gemini Models",
                description: "Models within this group: Gemini Flash, Gemini Pro",
                buckets: [
                    {
                        bucketId: "gemini-weekly",
                        displayName: "Weekly Limit Remaining",
                        description: "You have used some of your weekly limit, it will fully refresh in 6 days, 10 hours.",
                        window: "weekly",
                        remainingFraction: 0.991,
                        usedPercent: 1,
                        resetTimestamp: weeklyResetGemini,
                    },
                    {
                        bucketId: "gemini-5h",
                        displayName: "Five Hour Limit Remaining",
                        description: "You have used some of your 5-hour limit, it will fully refresh in 4 hours, 46 minutes.",
                        window: "5h",
                        remainingFraction: 0.984,
                        usedPercent: 2,
                        resetTimestamp: fiveHResetGemini,
                    },
                ],
            },
            {
                displayName: "Claude and GPT models",
                description: "Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",
                buckets: [
                    {
                        bucketId: "3p-weekly",
                        displayName: "Weekly Limit Remaining",
                        description: "You have used some of your weekly limit, it will fully refresh in 6 days, 8 hours.",
                        window: "weekly",
                        remainingFraction: 0.549,
                        usedPercent: 45,
                        resetTimestamp: weeklyResetClaude,
                    },
                    {
                        bucketId: "3p-5h",
                        displayName: "Five Hour Limit Remaining",
                        description: "You have used some of your 5-hour limit, it will fully refresh in 1 hour, 9 minutes.",
                        window: "5h",
                        remainingFraction: 0.652,
                        usedPercent: 35,
                        resetTimestamp: fiveHResetClaude,
                    },
                ],
            },
        ];
    }
    _generateDemoData() {
        const now = Date.now();
        const groups = this._generateDemoGroups(now);
        const geminiWeekly = groups[0].buckets[0];
        const claudeWeekly = groups[1].buckets[0];
        const models = [
            {
                modelId: "gemini-3.8-flash-high",
                displayName: "Gemini 3.8 Flash (High)",
                tier: "pro",
                requests: { used: 1, limit: 100 },
                tokensIn: { used: 12000, limit: 1000000 },
                tokensOut: { used: 4000, limit: 200000 },
                estimatedCostUsd: 0,
                resetTimestamp: groups[0].buckets[1].resetTimestamp,
                lastUpdated: now,
                weeklyRemainingFraction: geminiWeekly.remainingFraction,
                weeklyResetTimestamp: geminiWeekly.resetTimestamp,
                groupName: "Gemini Models",
            },
            {
                modelId: "claude-sonnet-4-6",
                displayName: "Claude Sonnet 4.6 (Thinking)",
                tier: "pro",
                requests: { used: 35, limit: 100 },
                tokensIn: { used: 348000, limit: 1000000 },
                tokensOut: { used: 69600, limit: 200000 },
                estimatedCostUsd: 2.45,
                resetTimestamp: groups[1].buckets[1].resetTimestamp,
                lastUpdated: now,
                weeklyRemainingFraction: claudeWeekly.remainingFraction,
                weeklyResetTimestamp: claudeWeekly.resetTimestamp,
                groupName: "Claude and GPT models",
            },
            {
                modelId: "gemini-3.1-pro-high",
                displayName: "Gemini 3.1 Pro (High)",
                tier: "pro",
                requests: { used: 2, limit: 100 },
                tokensIn: { used: 16000, limit: 1000000 },
                tokensOut: { used: 5200, limit: 200000 },
                estimatedCostUsd: 0,
                resetTimestamp: groups[0].buckets[1].resetTimestamp,
                lastUpdated: now,
                weeklyRemainingFraction: geminiWeekly.remainingFraction,
                weeklyResetTimestamp: geminiWeekly.resetTimestamp,
                groupName: "Gemini Models",
            },
            {
                modelId: "gpt-oss-120b-medium",
                displayName: "GPT-OSS 120B (Medium)",
                tier: "pro",
                requests: { used: 35, limit: 100 },
                tokensIn: { used: 348000, limit: 1000000 },
                tokensOut: { used: 69600, limit: 200000 },
                estimatedCostUsd: 1.1,
                resetTimestamp: groups[1].buckets[1].resetTimestamp,
                lastUpdated: now,
                weeklyRemainingFraction: claudeWeekly.remainingFraction,
                weeklyResetTimestamp: claudeWeekly.resetTimestamp,
                groupName: "Claude and GPT models",
            },
            {
                modelId: "claude-opus-4-6-thinking",
                displayName: "Claude Opus 4.6 (Thinking)",
                tier: "enterprise",
                requests: { used: 35, limit: 100 },
                tokensIn: { used: 348000, limit: 1000000 },
                tokensOut: { used: 69600, limit: 200000 },
                estimatedCostUsd: 6.8,
                resetTimestamp: groups[1].buckets[1].resetTimestamp,
                lastUpdated: now,
                weeklyRemainingFraction: claudeWeekly.remainingFraction,
                weeklyResetTimestamp: claudeWeekly.resetTimestamp,
                groupName: "Claude and GPT models",
            },
            {
                modelId: "gemini-3.6-flash-medium",
                displayName: "Gemini 3.6 Flash (Medium)",
                tier: "pro",
                requests: { used: 1, limit: 100 },
                tokensIn: { used: 10000, limit: 1000000 },
                tokensOut: { used: 3000, limit: 200000 },
                estimatedCostUsd: 0,
                resetTimestamp: groups[0].buckets[1].resetTimestamp,
                lastUpdated: now,
                weeklyRemainingFraction: geminiWeekly.remainingFraction,
                weeklyResetTimestamp: geminiWeekly.resetTimestamp,
                groupName: "Gemini Models",
            },
        ];
        return { models, groups };
    }
}
exports.QuotaDataService = QuotaDataService;
//# sourceMappingURL=quotaDataService.js.map