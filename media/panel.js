// ══════════════════════════════════════════════════════════════
//  Antigravity Quota Tracker — Panel Webview Script
//  Handles: state rendering, donut chart, sparkline, countdown
// ══════════════════════════════════════════════════════════════

/* global acquireVsCodeApi */
const vscode = acquireVsCodeApi();

// ── State ───────────────────────────────────────────────────
let state = null;
let settings = null;
let activeModelIdx = 0;
let countdownInterval = null;

// ── Palette for model bars ───────────────────────────────────
const MODEL_COLORS = [
  ['#7B8CFF', '#00D4FF'],
  ['#00D4FF', '#00FF94'],
  ['#FF6B9D', '#FFB347'],
  ['#00FF94', '#7B8CFF'],
  ['#FFB347', '#FF6B9D'],
];

// ── DOM refs ─────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const liveIndicator = $('liveIndicator');
const refreshBtn    = $('refreshBtn');
const lastUpdated   = $('lastUpdated');
const modelTabs     = $('modelTabs');
const demoBanner    = $('demoBanner');
const ringPct       = $('ringPct');
const ringLabel     = $('ringLabel');
const ringModel     = $('ringModel');
const reqUsed       = $('reqUsed');
const reqLimit      = $('reqLimit');
const reqReset      = $('reqReset');
const tokensInVal   = $('tokensInVal');
const tokensInBar   = $('tokensInBar');
const tokensOutVal  = $('tokensOutVal');
const tokensOutBar  = $('tokensOutBar');
const costVal       = $('costVal');
const tierBadge     = $('tierBadge');
const resetCountdown = $('resetCountdown');
const totalCost     = $('totalCost');
const modelsList    = $('modelsList');
const sparklineCanvas = $('sparkline');
const donutCanvas   = $('donutChart');
const resetRingCanvas = $('resetRing');
const saveKeyBtn    = $('saveKeyBtn');
const apiKeyInput   = $('apiKeyInput');
const setKeyBtn     = $('setKeyBtn');
const refreshSelect = $('refreshSelect');

// ── VS Code API communication ────────────────────────────────
window.addEventListener('message', ({ data: msg }) => {
  switch (msg.type) {
    case 'stateUpdate':
      state = msg.state;
      render();
      break;
    case 'settingsUpdate':
      settings = msg.settings;
      applySettings();
      break;
    case 'loading':
      setLoading(true);
      break;
    case 'error':
      showError(msg.message);
      break;
  }
});

// ── Send messages to extension ───────────────────────────────
function post(msg) { vscode.postMessage(msg); }

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  post({ type: 'ready' });
  setupListeners();
  startCountdownLoop();
});

function setupListeners() {
  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('spinning');
    liveIndicator.classList.add('loading');
    post({ type: 'refresh' });
    setTimeout(() => refreshBtn.classList.remove('spinning'), 1500);
  });

  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      post({ type: 'setApiKey', key });
      apiKeyInput.value = '';
    }
  });

  setKeyBtn?.addEventListener('click', () => {
    apiKeyInput.focus();
    apiKeyInput.scrollIntoView({ behavior: 'smooth' });
  });

  refreshSelect.addEventListener('change', () => {
    post({ type: 'setRefreshInterval', seconds: Number(refreshSelect.value) });
  });

  apiKeyInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveKeyBtn.click();
  });
}

// ── Main render ──────────────────────────────────────────────
function render() {
  if (!state) { return; }

  liveIndicator.classList.remove('loading');

  if (state.lastFetched) {
    const t = new Date(state.lastFetched);
    lastUpdated.textContent = `Last updated: ${t.toLocaleTimeString()}`;
  }

  if (state.error) {
    showError(state.error);
  }

  if (!state.models?.length) { return; }

  // Clamp active index
  if (activeModelIdx >= state.models.length) { activeModelIdx = 0; }

  renderModelTabs();
  renderPrimaryModel();
  renderModelsList();
  renderSparkline();
  renderTotalCost();
  renderDemoBanner();
}

function renderDemoBanner() {
  const hasKey = settings?.apiKey;
  demoBanner.style.display = hasKey ? 'none' : 'flex';
}

// ── Model Tabs ───────────────────────────────────────────────
function renderModelTabs() {
  modelTabs.innerHTML = '';
  state.models.forEach((m, i) => {
    const btn = document.createElement('button');
    btn.className = 'model-tab' + (i === activeModelIdx ? ' active' : '');
    btn.textContent = m.displayName.replace('Gemini ', '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(i === activeModelIdx));
    btn.setAttribute('id', `tab-${m.modelId}`);
    btn.addEventListener('click', () => {
      activeModelIdx = i;
      renderModelTabs();
      renderPrimaryModel();
      renderSparkline();
    });
    modelTabs.appendChild(btn);
  });
}

// ── Primary Model Detail ─────────────────────────────────────
function renderPrimaryModel() {
  const m = state.models[activeModelIdx];
  if (!m) { return; }

  const pct = Math.round((m.requests.used / m.requests.limit) * 100);
  const pctClass = pct >= 90 ? 'critical' : pct >= 75 ? 'warning' : '';

  // Ring
  ringPct.textContent = pct + '%';
  ringPct.className = 'ring-pct' + (pctClass ? ' ' + pctClass : '');
  ringModel.textContent = m.displayName;
  reqUsed.textContent  = formatNum(m.requests.used);
  reqLimit.textContent = formatNum(m.requests.limit);

  // Tokens In
  const tokInPct = pctOf(m.tokensIn);
  tokensInVal.textContent = formatNum(m.tokensIn.used);
  tokensInBar.style.setProperty('--pct', tokInPct + '%');

  // Tokens Out
  const tokOutPct = pctOf(m.tokensOut);
  tokensOutVal.textContent = formatNum(m.tokensOut.used);
  tokensOutBar.style.setProperty('--pct', tokOutPct + '%');

  // Cost
  costVal.textContent = m.estimatedCostUsd < 0.01 ? 'Free' : `$${m.estimatedCostUsd.toFixed(2)}`;
  tierBadge.textContent = m.tier;
  tierBadge.className = `metric-tier ${m.tier}`;

  // Draw donut
  drawDonut(donutCanvas, pct, pctClass, MODEL_COLORS[activeModelIdx % MODEL_COLORS.length]);

  // Reset ring
  drawResetRing(resetRingCanvas, m.resetTimestamp);
  updateCountdown(m.resetTimestamp);
}

// ── Countdown loop ───────────────────────────────────────────
function startCountdownLoop() {
  if (countdownInterval) { clearInterval(countdownInterval); }
  countdownInterval = setInterval(() => {
    if (!state?.models?.length) { return; }
    const m = state.models[activeModelIdx];
    if (!m) { return; }
    updateCountdown(m.resetTimestamp);
    drawResetRing(resetRingCanvas, m.resetTimestamp);
  }, 1000);
}

function updateCountdown(resetMs) {
  const diff = resetMs - Date.now();
  reqReset.textContent      = formatCountdown(diff);
  resetCountdown.textContent = formatCountdown(diff);
}

function formatCountdown(diffMs) {
  if (diffMs <= 0) { return 'Now'; }
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  if (h > 0) { return `${h}h ${m}m`; }
  if (m > 0) { return `${m}m ${s}s`; }
  return `${s}s`;
}

// ── All Models List ──────────────────────────────────────────
function renderModelsList() {
  modelsList.innerHTML = '';
  state.models.forEach((m, i) => {
    const pct = Math.round(pctOf(m.requests));
    const [c1, c2] = MODEL_COLORS[i % MODEL_COLORS.length];
    const row = document.createElement('div');
    row.className = 'model-row';
    row.innerHTML = `
      <div class="model-row-name">${m.displayName.replace('Gemini ', '')}</div>
      <div class="model-row-bar-wrap">
        <div class="model-row-bar"
             style="width:${pct}%; background: linear-gradient(90deg, ${c1}, ${c2});">
        </div>
      </div>
      <div class="model-row-pct">${pct}%</div>
      <div class="model-row-cost">${m.estimatedCostUsd < 0.01 ? '' : '$' + m.estimatedCostUsd.toFixed(2)}</div>
    `;
    modelsList.appendChild(row);
  });
}

// ── Total Cost ───────────────────────────────────────────────
function renderTotalCost() {
  const cost = state.totalCostUsd;
  totalCost.textContent = cost < 0.01 ? 'All free tier' : `Total: $${cost.toFixed(2)}`;
}

// ── Settings ─────────────────────────────────────────────────
function applySettings() {
  if (!settings) { return; }
  if (settings.refreshInterval !== undefined) {
    refreshSelect.value = String(settings.refreshInterval);
  }
}

function setLoading(on) {
  if (on) {
    liveIndicator.classList.add('loading');
    refreshBtn.classList.add('spinning');
  } else {
    liveIndicator.classList.remove('loading');
    refreshBtn.classList.remove('spinning');
  }
}

function showError(msg) {
  // Could show a banner — for now log it
  console.error('[QuotaTracker Panel]', msg);
}

// ══════════════════════════════════════════════════════════════
//  Canvas: Donut Chart
// ══════════════════════════════════════════════════════════════

function drawDonut(canvas, pct, state, [c1, c2]) {
  const dpr = window.devicePixelRatio || 1;
  const size = 180;
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const cx = size / 2;
  const cy = size / 2;
  const r  = 70;
  const thick = 14;
  const start = -Math.PI / 2;
  const filled = (pct / 100) * 2 * Math.PI;

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = thick;
  ctx.stroke();

  // Glow shadow pass
  const shadow = stateColor(state, c1, c2);
  ctx.shadowBlur = 20;
  ctx.shadowColor = shadow;

  // Value arc — gradient
  const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  grad.addColorStop(0, c1);
  grad.addColorStop(1, c2);

  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + filled);
  ctx.strokeStyle = grad;
  ctx.lineWidth = thick;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.shadowBlur = 0;

  // Inner ring subtle
  ctx.beginPath();
  ctx.arc(cx, cy, r - thick / 2 - 6, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tick marks at 25%, 50%, 75%
  [0.25, 0.5, 0.75].forEach(t => {
    const angle = start + t * 2 * Math.PI;
    const ix = cx + (r - thick / 2 - 2) * Math.cos(angle);
    const iy = cy + (r - thick / 2 - 2) * Math.sin(angle);
    const ox = cx + (r + thick / 2 + 2) * Math.cos(angle);
    const oy = cy + (r + thick / 2 + 2) * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(ix, iy);
    ctx.lineTo(ox, oy);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    ctx.stroke();
  });
}

function stateColor(state, c1, _c2) {
  if (state === 'critical') { return '#FF6B9D'; }
  if (state === 'warning')  { return '#FFB347'; }
  return c1;
}

// ══════════════════════════════════════════════════════════════
//  Canvas: Reset Ring (small clock-style arc)
// ══════════════════════════════════════════════════════════════

function drawResetRing(canvas, resetMs) {
  const dpr  = window.devicePixelRatio || 1;
  const size = 36;
  canvas.width  = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width  = size + 'px';
  canvas.style.height = size + 'px';

  const ctx  = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const diff    = Math.max(0, resetMs - Date.now());
  const totalMs = 3600000; // assume 1h cycle for display
  const ratio   = Math.min(1, diff / totalMs);
  const cx = size / 2, cy = size / 2, r = 13;

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Arc
  const start = -Math.PI / 2;
  const end   = start + ratio * 2 * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, end);
  ctx.strokeStyle = ratio < 0.2 ? '#FF6B9D' : ratio < 0.5 ? '#FFB347' : '#00FF94';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowBlur = 6;
  ctx.shadowColor = ratio < 0.2 ? '#FF6B9D' : ratio < 0.5 ? '#FFB347' : '#00FF94';
  ctx.stroke();
}

// ══════════════════════════════════════════════════════════════
//  Canvas: Sparkline
// ══════════════════════════════════════════════════════════════

function renderSparkline() {
  const m = state.models[activeModelIdx];
  if (!m) { return; }

  const modelId   = m.modelId;
  const snapshots = state.history?.[modelId] ?? [];

  const canvas = sparklineCanvas;
  const dpr    = window.devicePixelRatio || 1;
  const W      = canvas.offsetWidth  || 260;
  const H      = 60;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  if (snapshots.length < 2) {
    // Draw placeholder / flat line
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Collecting history…', W / 2, H / 2 - 6);
    return;
  }

  const values = snapshots.map(s => s.requestsUsed);
  const minV   = Math.min(...values);
  const maxV   = Math.max(...values);
  const range  = maxV - minV || 1;

  const pad = { top: 6, bottom: 6, left: 4, right: 4 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const pts = snapshots.map((s, i) => ({
    x: pad.left + (i / (snapshots.length - 1)) * plotW,
    y: pad.top  + plotH - ((s.requestsUsed - minV) / range) * plotH,
  }));

  const [c1, c2] = MODEL_COLORS[activeModelIdx % MODEL_COLORS.length];

  // Fill gradient
  const fillGrad = ctx.createLinearGradient(0, pad.top, 0, H);
  fillGrad.addColorStop(0, hexAlpha(c1, 0.25));
  fillGrad.addColorStop(1, hexAlpha(c1, 0));

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx  = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.lineTo(pts[pts.length - 1].x, H);
  ctx.lineTo(pts[0].x, H);
  ctx.closePath();
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Line
  const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
  lineGrad.addColorStop(0, c1);
  lineGrad.addColorStop(1, c2);

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx  = (prev.x + curr.x) / 2;
    ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
  }
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth   = 1.5;
  ctx.shadowBlur  = 8;
  ctx.shadowColor = c1;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // End dot
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3, 0, 2 * Math.PI);
  ctx.fillStyle = c2;
  ctx.shadowBlur  = 8;
  ctx.shadowColor = c2;
  ctx.fill();
  ctx.shadowBlur  = 0;
}

// ══════════════════════════════════════════════════════════════
//  Helpers
// ══════════════════════════════════════════════════════════════

function pctOf({ used, limit }) {
  return limit > 0 ? (used / limit) * 100 : 0;
}

function formatNum(n) {
  if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
  if (n >= 1_000)     { return (n / 1_000).toFixed(1) + 'k'; }
  return String(n);
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
