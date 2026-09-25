import { exec } from "child_process";
import { promisify } from "util";
import * as https from "https";
import * as http from "http";

const execAsync = promisify(exec);

export interface AntigravitySession {
  pid: number;
  port: number;
  csrfToken: string;
  isHttps: boolean;
}

export interface ConnectUserQuotaSummaryBucket {
  bucketId?: string;
  displayName?: string;
  description?: string;
  window?: string;
  remainingFraction?: number;
  remaining?: { case?: string; value?: number };
  remaining_fraction?: number;
  resetTime?: string;
  reset_time?: string;
}

export interface ConnectUserQuotaSummaryGroup {
  displayName?: string;
  description?: string;
  buckets?: ConnectUserQuotaSummaryBucket[];
}

export interface ConnectUserQuotaSummaryResponse {
  response?: {
    groups?: ConnectUserQuotaSummaryGroup[];
    description?: string;
  };
}

export interface ConnectUserStatusResponse {
  userStatus?: {
    email?: string;
    name?: string;
    userTier?: {
      id?: string;
      name?: string;
      description?: string;
      upgradeSubscriptionUri?: string;
      upgradeSubscriptionText?: string;
    };
    planStatus?: {
      availablePromptCredits?: number;
      planInfo?: {
        monthlyPromptCredits?: number;
        planName?: string;
      };
    };
    cascadeModelConfigData?: {
      clientModelConfigs?: Array<{
        label: string;
        modelId: string;
        isRecommended?: boolean;
        modelOrAlias?: {
          model?: string;
          alias?: string;
        };
        quotaInfo?: {
          remainingFraction?: number;
          resetTime?: string;
        };
      }>;
      defaultOverrideModelConfig?: {
        modelOrAlias?: {
          model?: string;
          alias?: string;
        };
        modelId?: string;
        model?: string;
      };
    };
  };
}

/**
 * Scans the macOS process tree to locate Antigravity's active language server
 * and extracts its dynamic port and CSRF token.
 */
export async function discoverAntigravitySession(): Promise<AntigravitySession | null> {
  try {
    const { stdout } = await execAsync("ps -ax -o pid,command");
    const lines = stdout.split("\n");

    // Match language_server or antigravity process with csrf token
    // We prioritize the main daemon (without --enable_lsp or with cloud_code_endpoint)
    let candidateLines = lines.filter(
      (line) =>
        (line.includes("language_server") || line.includes("antigravity")) &&
        (line.includes("--csrf_token") || line.includes("--csrf-token"))
    );

    if (candidateLines.length === 0) {
      console.warn("[QuotaTracker] Antigravity language server process not found.");
      return null;
    }

    // Sort to prefer the root language server (often without --enable_lsp or earlier in list)
    candidateLines.sort((a, b) => {
      const aIsLsp = a.includes("--enable_lsp") ? 1 : 0;
      const bIsLsp = b.includes("--enable_lsp") ? 1 : 0;
      return aIsLsp - bIsLsp;
    });

    for (const line of candidateLines) {
      const trimmed = line.trim();
      const pidMatch = trimmed.match(/^(\d+)\s+/);
      if (!pidMatch) continue;

      const pid = parseInt(pidMatch[1], 10);

      // Support --csrf_token <val>, --csrf_token=<val>, --csrf-token <val>, --csrf-token=<val>
      const tokenMatch = trimmed.match(/--csrf[_-]token(?:=|\s+)([A-Za-z0-9_\-]+)/);
      if (!tokenMatch) continue;

      const csrfToken = tokenMatch[1];

      // Language server uses dynamic ports, so we query lsof for this PID's listening ports
      try {
        const { stdout: lsofOut } = await execAsync(`lsof -Pan -p ${pid} -i -sTCP:LISTEN`);
        const portMatches = Array.from(lsofOut.matchAll(/127\.0\.0\.1:(\d+)\s+\(LISTEN\)/g));
        const listeningPorts = portMatches.map((m) => parseInt(m[1], 10));

        // Test each listening port to find the Connect RPC endpoint
        for (const port of listeningPorts) {
          const works = await testConnectEndpoint(port, csrfToken);
          if (works) {
            return {
              pid,
              port,
              csrfToken,
              isHttps: true,
            };
          }
        }
      } catch (lsofErr) {
        // Continue to next candidate if lsof fails
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error("[QuotaTracker] Failed to query process tree:", error);
    return null;
  }
}

/**
 * Quick probe to verify the port & token speak Connect RPC
 */
async function testConnectEndpoint(port: number, csrfToken: string): Promise<boolean> {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" },
    });

    const req = https.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/exa.language_server_pb.LanguageServerService/GetUserStatus",
        method: "POST",
        rejectUnauthorized: false,
        timeout: 1500,
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
          // The critical headers:
          "x-codeium-csrf-token": csrfToken,
          "X-CSRF-Token": csrfToken,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          resolve(false);
        }
        res.resume(); // drain
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Fetches the user status and model quota data from local Antigravity Language Server
 */
export async function fetchLocalUserStatus(session: AntigravitySession): Promise<ConnectUserStatusResponse | null> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" },
    });

    const req = https.request(
      {
        hostname: "127.0.0.1",
        port: session.port,
        path: "/exa.language_server_pb.LanguageServerService/GetUserStatus",
        method: "POST",
        rejectUnauthorized: false,
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
          "x-codeium-csrf-token": session.csrfToken,
          "X-CSRF-Token": session.csrfToken,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body) as ConnectUserStatusResponse;
              resolve(data);
            } catch (e) {
              reject(new Error(`Failed to parse JSON: ${e}`));
            }
          } else {
            reject(new Error(`Server returned HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Fetches the user quota summary (weekly and window quotas grouped by model family)
 * from local Antigravity Language Server via Connect RPC.
 */
export async function fetchLocalUserQuotaSummary(
  session: AntigravitySession
): Promise<ConnectUserQuotaSummaryResponse | null> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      forceRefresh: true,
    });

    const req = https.request(
      {
        hostname: "127.0.0.1",
        port: session.port,
        path: "/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",
        method: "POST",
        rejectUnauthorized: false,
        timeout: 5000,
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
          "x-codeium-csrf-token": session.csrfToken,
          "X-CSRF-Token": session.csrfToken,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer | string) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body) as ConnectUserQuotaSummaryResponse;
              resolve(data);
            } catch (e) {
              reject(new Error(`Failed to parse JSON: ${e}`));
            }
          } else {
            reject(new Error(`Server returned HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.write(payload);
    req.end();
  });
}

