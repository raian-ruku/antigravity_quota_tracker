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

export interface ModelQuota {
  modelId: ModelId;
  displayName: string;
  tier: Tier;
  requests: TokenMetrics;
  tokensIn: TokenMetrics;
  tokensOut: TokenMetrics;
  estimatedCostUsd: number;
  resetTimestamp: number; // Unix ms
  lastUpdated: number;    // Unix ms
}

export interface QuotaSnapshot {
  timestamp: number;
  requestsUsed: number;
  tokensIn: number;
  tokensOut: number;
}

export interface QuotaState {
  models: ModelQuota[];
  history: Record<ModelId, QuotaSnapshot[]>; // last 24h snapshots
  totalCostUsd: number;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
}

export type StatusBarMode = 'compact' | 'expanded' | 'detailed';

export interface ExtensionSettings {
  apiKey: string;
  refreshInterval: number; // seconds, 0 = manual
  statusBarMode: StatusBarMode;
  statusBarVisible: boolean;
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
  | { type: 'ready' };
