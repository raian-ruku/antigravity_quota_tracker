// ─────────────────────────────────────────────
//  Shared Types for Antigravity Quota Tracker
// ─────────────────────────────────────────────

export type ModelId =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-2.0-flash'
  | 'gemini-ultra'
  | 'gemini-nano'
  | (string & {});

export type Tier = 'free' | 'pro' | 'enterprise';

export interface TokenMetrics {
  used: number;
  limit: number;
}

export interface QuotaBucket {
  bucketId: string;
  displayName: string;
  description?: string;
  window?: 'weekly' | '5h' | string;
  remainingFraction: number; // 0.0 to 1.0
  usedPercent: number;        // 0 to 100
  resetTimestamp: number;     // Unix ms
}

export interface QuotaGroup {
  displayName: string;
  description?: string;
  buckets: QuotaBucket[];
}

export interface ModelQuota {
  modelId: ModelId;
  displayName: string;
  tier: Tier;
  requests: TokenMetrics;
  tokensIn: TokenMetrics;
  tokensOut: TokenMetrics;
  estimatedCostUsd: number;
  resetTimestamp: number; // Unix ms (5h window)
  lastUpdated: number;    // Unix ms
  // Weekly quota & group info:
  weeklyRemainingFraction?: number;
  weeklyResetTimestamp?: number;
  groupName?: string;
}

export interface QuotaSnapshot {
  timestamp: number;
  requestsUsed: number;
  tokensIn: number;
  tokensOut: number;
}

export interface QuotaState {
  models: ModelQuota[];
  groups?: QuotaGroup[];
  activeModelId?: string;
  activeModelName?: string;
  history: Record<string, QuotaSnapshot[]>; // last 24h snapshots
  totalCostUsd: number;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
  userTierName?: string;
}

export type StatusBarMode = 'compact' | 'expanded' | 'detailed';

export interface ExtensionSettings {
  apiKey: string;
  refreshInterval: number; // seconds, 0 = manual
  statusBarMode: StatusBarMode;
  statusBarVisible: boolean;
  focusModel: string; // 'auto' or modelId
}

// Messages from extension → webview
export type ExtensionMessage =
  | { type: 'stateUpdate'; state: QuotaState }
  | { type: 'settingsUpdate'; settings: ExtensionSettings }
  | { type: 'loading' }
  | { type: 'error'; message: string };

// Messages from webview → extension
export type WebviewMessage =
  | { type: 'refresh' }
  | { type: 'setApiKey'; key: string }
  | { type: 'setRefreshInterval'; seconds: number }
  | { type: 'selectModel'; modelId: string }
  | { type: 'ready' };
