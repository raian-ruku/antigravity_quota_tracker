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
exports.discoverAntigravitySession = discoverAntigravitySession;
exports.fetchLocalUserStatus = fetchLocalUserStatus;
exports.fetchLocalUserQuotaSummary = fetchLocalUserQuotaSummary;
const child_process_1 = require("child_process");
const util_1 = require("util");
const https = __importStar(require("https"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Scans the macOS process tree to locate Antigravity's active language server
 * and extracts its dynamic port and CSRF token.
 */
async function discoverAntigravitySession() {
    try {
        const { stdout } = await execAsync("ps -ax -o pid,command");
        const lines = stdout.split("\n");
        // Match language_server or antigravity process with csrf token
        // We prioritize the main daemon (without --enable_lsp or with cloud_code_endpoint)
        let candidateLines = lines.filter((line) => (line.includes("language_server") || line.includes("antigravity")) &&
            (line.includes("--csrf_token") || line.includes("--csrf-token")));
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
            if (!pidMatch)
                continue;
            const pid = parseInt(pidMatch[1], 10);
            // Support --csrf_token <val>, --csrf_token=<val>, --csrf-token <val>, --csrf-token=<val>
            const tokenMatch = trimmed.match(/--csrf[_-]token(?:=|\s+)([A-Za-z0-9_\-]+)/);
            if (!tokenMatch)
                continue;
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
            }
            catch (lsofErr) {
                // Continue to next candidate if lsof fails
                continue;
            }
        }
        return null;
    }
    catch (error) {
        console.error("[QuotaTracker] Failed to query process tree:", error);
        return null;
    }
}
/**
 * Quick probe to verify the port & token speak Connect RPC
 */
async function testConnectEndpoint(port, csrfToken) {
    return new Promise((resolve) => {
        const payload = JSON.stringify({
            metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" },
        });
        const req = https.request({
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
        }, (res) => {
            if (res.statusCode === 200) {
                resolve(true);
            }
            else {
                resolve(false);
            }
            res.resume(); // drain
        });
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
async function fetchLocalUserStatus(session) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            metadata: { ideName: "antigravity", extensionName: "antigravity", locale: "en" },
        });
        const req = https.request({
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
        }, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
                if (res.statusCode === 200) {
                    try {
                        const data = JSON.parse(body);
                        resolve(data);
                    }
                    catch (e) {
                        reject(new Error(`Failed to parse JSON: ${e}`));
                    }
                }
                else {
                    reject(new Error(`Server returned HTTP ${res.statusCode}: ${body}`));
                }
            });
        });
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
async function fetchLocalUserQuotaSummary(session) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            forceRefresh: true,
        });
        const req = https.request({
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
        }, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
                if (res.statusCode === 200) {
                    try {
                        const data = JSON.parse(body);
                        resolve(data);
                    }
                    catch (e) {
                        reject(new Error(`Failed to parse JSON: ${e}`));
                    }
                }
                else {
                    reject(new Error(`Server returned HTTP ${res.statusCode}: ${body}`));
                }
            });
        });
        req.on("error", (err) => reject(err));
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("Request timed out"));
        });
        req.write(payload);
        req.end();
    });
}
//# sourceMappingURL=antigravityProcessService.js.map