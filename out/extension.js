"use strict";var N=Object.create;var _=Object.defineProperty;var G=Object.getOwnPropertyDescriptor;var H=Object.getOwnPropertyNames;var W=Object.getPrototypeOf,K=Object.prototype.hasOwnProperty;var j=(s,e)=>{for(var t in e)_(s,t,{get:e[t],enumerable:!0})},Q=(s,e,t,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let i of H(e))!K.call(s,i)&&i!==t&&_(s,i,{get:()=>e[i],enumerable:!(o=G(e,i))||o.enumerable});return s};var f=(s,e,t)=>(t=s!=null?N(W(s)):{},Q(e||!s||!s.__esModule?_(t,"default",{value:s,enumerable:!0}):t,s)),V=s=>Q(_({},"__esModule",{value:!0}),s);var te={};j(te,{activate:()=>Z,deactivate:()=>ee});module.exports=V(te);var d=f(require("vscode"));var b=f(require("vscode"));var A=require("child_process"),L=require("util"),T=f(require("https")),$=(0,L.promisify)(A.exec);async function M(){try{let{stdout:s}=await $("ps -ax -o pid,command"),t=s.split(`
`).filter(o=>(o.includes("language_server")||o.includes("antigravity"))&&(o.includes("--csrf_token")||o.includes("--csrf-token")));if(t.length===0)return console.warn("[QuotaTracker] Antigravity language server process not found."),null;t.sort((o,i)=>{let r=o.includes("--enable_lsp")?1:0,a=i.includes("--enable_lsp")?1:0;return r-a});for(let o of t){let i=o.trim(),r=i.match(/^(\d+)\s+/);if(!r)continue;let a=parseInt(r[1],10),n=i.match(/--csrf[_-]token(?:=|\s+)([A-Za-z0-9_\-]+)/);if(!n)continue;let l=n[1];try{let{stdout:u}=await $(`lsof -Pan -p ${a} -i -sTCP:LISTEN`),g=Array.from(u.matchAll(/127\.0\.0\.1:(\d+)\s+\(LISTEN\)/g)).map(h=>parseInt(h[1],10));for(let h of g)if(await Y(h,l))return{pid:a,port:h,csrfToken:l,isHttps:!0}}catch{continue}}return null}catch(s){return console.error("[QuotaTracker] Failed to query process tree:",s),null}}async function Y(s,e){return new Promise(t=>{let o=JSON.stringify({metadata:{ideName:"antigravity",extensionName:"antigravity",locale:"en"}}),i=T.request({hostname:"127.0.0.1",port:s,path:"/exa.language_server_pb.LanguageServerService/GetUserStatus",method:"POST",rejectUnauthorized:!1,timeout:1500,headers:{"Content-Type":"application/json","Connect-Protocol-Version":"1","x-codeium-csrf-token":e,"X-CSRF-Token":e,"Content-Length":Buffer.byteLength(o)}},r=>{r.statusCode===200?t(!0):t(!1),r.resume()});i.on("error",()=>t(!1)),i.on("timeout",()=>{i.destroy(),t(!1)}),i.write(o),i.end()})}async function I(s){return new Promise((e,t)=>{let o=JSON.stringify({metadata:{ideName:"antigravity",extensionName:"antigravity",locale:"en"}}),i=T.request({hostname:"127.0.0.1",port:s.port,path:"/exa.language_server_pb.LanguageServerService/GetUserStatus",method:"POST",rejectUnauthorized:!1,timeout:5e3,headers:{"Content-Type":"application/json","Connect-Protocol-Version":"1","x-codeium-csrf-token":s.csrfToken,"X-CSRF-Token":s.csrfToken,"Content-Length":Buffer.byteLength(o)}},r=>{let a="";r.on("data",n=>a+=n),r.on("end",()=>{if(r.statusCode===200)try{let n=JSON.parse(a);e(n)}catch(n){t(new Error(`Failed to parse JSON: ${n}`))}else t(new Error(`Server returned HTTP ${r.statusCode}: ${a}`))})});i.on("error",r=>t(r)),i.on("timeout",()=>{i.destroy(),t(new Error("Request timed out"))}),i.write(o),i.end()})}var P="quotaTracker.history",q="quotaTracker.stateCache",R=48,y=class{constructor(e){this._session=null;this._onChangeEmitter=new b.EventEmitter;this.onChange=this._onChangeEmitter.event;this._context=e,this._state=this._loadCachedState(),this._scheduleRefresh()}get state(){return this._state}get settings(){let e=b.workspace.getConfiguration("quotaTracker");return{apiKey:e.get("apiKey",""),refreshInterval:e.get("refreshInterval",60),statusBarMode:e.get("statusBarMode","compact"),statusBarVisible:e.get("statusBarVisible",!0)}}async refresh(){this._setState({...this._state,isLoading:!0,error:null});try{let e=null;try{e=await this._fetchLocalProcessQuotas()}catch(a){console.warn("[QuotaTracker] Local process fetch failed:",a.message)}if(!e&&this.settings.apiKey)try{e=await this._fetchFromApi(this.settings.apiKey)}catch(a){console.warn("[QuotaTracker] API fallback failed:",a.message)}(!e||e.length===0)&&(e=this._generateDemoData());let t=Date.now(),o=this._loadHistory();for(let a of e){let n={timestamp:t,requestsUsed:a.requests.used,tokensIn:a.tokensIn.used,tokensOut:a.tokensOut.used};o[a.modelId]||(o[a.modelId]=[]),o[a.modelId].push(n),o[a.modelId].length>R&&(o[a.modelId]=o[a.modelId].slice(-R))}this._saveHistory(o);let i=e.reduce((a,n)=>a+n.estimatedCostUsd,0),r={models:e,history:o,totalCostUsd:i,isLoading:!1,error:null,lastFetched:t};this._setState(r),this._cacheState(r)}catch(e){this._setState({...this._state,isLoading:!1,error:e.message??"Unknown error"})}}scheduleRefreshWithInterval(e){this._refreshTimer&&(clearTimeout(this._refreshTimer),this._refreshTimer=void 0),e>0&&this._scheduleRefresh(e*1e3)}dispose(){this._refreshTimer&&clearTimeout(this._refreshTimer),this._onChangeEmitter.dispose()}_setState(e){this._state=e,this._onChangeEmitter.fire(e)}_scheduleRefresh(e){let t=e??this.settings.refreshInterval*1e3;t<=0||(this._refreshTimer=setTimeout(async()=>{await this.refresh(),this._scheduleRefresh()},t))}_loadCachedState(){let e=this._context.globalState.get(q);return e||{models:this._generateDemoData(),history:{},totalCostUsd:0,isLoading:!1,error:null,lastFetched:null}}_cacheState(e){this._context.globalState.update(q,e)}_loadHistory(){return this._context.globalState.get(P,{})}_saveHistory(e){this._context.globalState.update(P,e)}async _fetchLocalProcessQuotas(){if(this._session||(this._session=await M()),!this._session)throw new Error("Antigravity language server process not found");let e=null;try{e=await I(this._session)}catch(t){if(this._session=await M(),this._session)e=await I(this._session);else throw t}if(!e||!e.userStatus)throw new Error("Invalid response from Antigravity language server");return this._mapConnectResponse(e)}_mapConnectResponse(e){let t=e.userStatus,o=t?.cascadeModelConfigData?.clientModelConfigs||[],i=t?.userTier?.name?.toLowerCase()||"",r=i.includes("ultra")?"enterprise":i.includes("pro")?"pro":"free",a=Date.now();return o.map(n=>{let l=n.quotaInfo?.remainingFraction??1,u=Math.max(0,Math.min(1,1-l)),v=Math.round(u*100),g=n.quotaInfo?.resetTime?new Date(n.quotaInfo.resetTime).getTime():a+4*36e5,h=r;return n.label.toLowerCase().includes("ultra")?h="enterprise":n.label.toLowerCase().includes("pro")&&(h="pro"),{modelId:n.modelId||n.label.toLowerCase().replace(/[^a-z0-9]+/g,"-"),displayName:n.label,tier:h,requests:{used:v,limit:100},tokensIn:{used:Math.round(u*1e6),limit:1e6},tokensOut:{used:Math.round(u*2e5),limit:2e5},estimatedCostUsd:0,resetTimestamp:g,lastUpdated:a}})}async _fetchFromApi(e){let o=await fetch("https://generativelanguage.googleapis.com/v1/quota",{headers:{Authorization:`Bearer ${e}`,"x-goog-api-key":e,"Content-Type":"application/json"}});if(!o.ok)return console.warn(`[QuotaTracker] API returned ${o.status}, using demo data`),this._generateDemoData();let i=await o.json();return this._parseApiResponse(i)}_parseApiResponse(e){return Array.isArray(e?.quotas)?e.quotas.map(t=>this._mapQuota(t)):this._generateDemoData()}_mapQuota(e){let t=Date.now(),o=e.resetTime?new Date(e.resetTime).getTime():t+36e5;return{modelId:e.model??"gemini-2.5-flash",displayName:e.displayName??e.model??"Unknown",tier:e.tier??"free",requests:{used:e.requestsUsed??0,limit:e.requestsLimit??1500},tokensIn:{used:e.tokensInputUsed??0,limit:e.tokensInputLimit??1e6},tokensOut:{used:e.tokensOutputUsed??0,limit:e.tokensOutputLimit??5e5},estimatedCostUsd:e.estimatedCost??0,resetTimestamp:o,lastUpdated:t}}_generateDemoData(){let e=Date.now(),t=e+7200*1e3,o=e+360*60*1e3,i=e+1440*60*1e3;return[{modelId:"gemini-2.5-flash",displayName:"Gemini 2.5 Flash",tier:"free",requests:{used:1248,limit:1500},tokensIn:{used:824300,limit:1e6},tokensOut:{used:312100,limit:5e5},estimatedCostUsd:0,resetTimestamp:t,lastUpdated:e},{modelId:"gemini-2.5-pro",displayName:"Gemini 2.5 Pro",tier:"pro",requests:{used:342,limit:2e3},tokensIn:{used:182e4,limit:5e6},tokensOut:{used:49e4,limit:2e6},estimatedCostUsd:4.27,resetTimestamp:o,lastUpdated:e},{modelId:"gemini-2.0-flash",displayName:"Gemini 2.0 Flash",tier:"free",requests:{used:89,limit:500},tokensIn:{used:45200,limit:25e4},tokensOut:{used:12800,limit:1e5},estimatedCostUsd:0,resetTimestamp:i,lastUpdated:e},{modelId:"gemini-ultra",displayName:"Gemini Ultra",tier:"enterprise",requests:{used:28,limit:100},tokensIn:{used:21e4,limit:1e6},tokensOut:{used:78e3,limit:4e5},estimatedCostUsd:18.9,resetTimestamp:o,lastUpdated:e},{modelId:"gemini-nano",displayName:"Gemini Nano",tier:"free",requests:{used:512,limit:5e3},tokensIn:{used:92e3,limit:2e6},tokensOut:{used:31e3,limit:8e5},estimatedCostUsd:0,resetTimestamp:i,lastUpdated:e}]}};var p=f(require("vscode")),w=class{constructor(e,t){this._extensionUri=e;this._service=t;this._disposables=[]}static{this.viewType="quotaTracker.panel"}resolveWebviewView(e,t,o){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[p.Uri.joinPath(this._extensionUri,"media")]},e.webview.html=this._buildHtml(e.webview),this._disposables.push(e.webview.onDidReceiveMessage(async i=>{switch(i.type){case"ready":this._postMessage({type:"stateUpdate",state:this._service.state}),this._postMessage({type:"settingsUpdate",settings:this._service.settings});break;case"refresh":await this._service.refresh();break;case"setApiKey":await p.workspace.getConfiguration("quotaTracker").update("apiKey",i.key,p.ConfigurationTarget.Global),await this._service.refresh();break;case"setRefreshInterval":await p.workspace.getConfiguration("quotaTracker").update("refreshInterval",i.seconds,p.ConfigurationTarget.Global),this._service.scheduleRefreshWithInterval(i.seconds);break}})),this._disposables.push(this._service.onChange(i=>{this._postMessage({type:"stateUpdate",state:i})})),this._service.refresh()}sendState(e){this._postMessage({type:"stateUpdate",state:e})}dispose(){this._disposables.forEach(e=>e.dispose()),this._disposables=[]}_postMessage(e){this._view?.webview.postMessage(e)}_uri(...e){return this._view.webview.asWebviewUri(p.Uri.joinPath(this._extensionUri,...e))}_buildHtml(e){let t=e.asWebviewUri(p.Uri.joinPath(this._extensionUri,"media","panel.css")),o=e.asWebviewUri(p.Uri.joinPath(this._extensionUri,"media","panel.js")),i=this._nonce();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${e.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src ${e.cspSource} https://fonts.gstatic.com;
             img-src ${e.cspSource} data:;
             script-src 'nonce-${i}';">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link href="${t}" rel="stylesheet"/>
  <title>Antigravity Quota Tracker</title>
</head>
<body>

<!-- \u2500\u2500 Header \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<header class="panel-header">
  <div class="header-brand">
    <div class="brand-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          fill="url(#brandGrad)" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
        <defs>
          <linearGradient id="brandGrad" x1="2" y1="2" x2="22" y2="22">
            <stop offset="0%" stop-color="#7B8CFF"/>
            <stop offset="100%" stop-color="#00D4FF"/>
          </linearGradient>
        </defs>
      </svg>
    </div>
    <div>
      <h1 class="brand-title">Quota Tracker</h1>
      <span class="brand-sub">Antigravity Usage</span>
    </div>
  </div>
  <div class="header-actions">
    <div class="live-indicator" id="liveIndicator">
      <div class="live-dot"></div>
      <span>Live</span>
    </div>
    <button class="icon-btn" id="refreshBtn" title="Refresh now">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
      </svg>
    </button>
  </div>
</header>

<div class="last-updated" id="lastUpdated">Last updated: never</div>

<!-- \u2500\u2500 Model Selector \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<nav class="model-tabs" id="modelTabs" role="tablist" aria-label="Model selector"></nav>

<!-- \u2500\u2500 No API Key Banner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<div class="demo-banner" id="demoBanner" style="display:none">
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
  Showing demo data \u2014 <button class="link-btn" id="setKeyBtn">set API key</button> for live data
</div>

<!-- \u2500\u2500 Primary Quota Ring \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<section class="quota-ring-section glass-card">
  <canvas id="donutChart" width="180" height="180" aria-label="Quota usage donut chart"></canvas>
  <div class="ring-center">
    <div class="ring-pct" id="ringPct">\u2014</div>
    <div class="ring-label" id="ringLabel">used</div>
    <div class="ring-model" id="ringModel">\u2014</div>
  </div>
  <div class="ring-meta">
    <div class="ring-stat">
      <span class="ring-stat-val" id="reqUsed">\u2014</span>
      <span class="ring-stat-lbl">requests</span>
    </div>
    <div class="ring-stat-sep"></div>
    <div class="ring-stat">
      <span class="ring-stat-val" id="reqLimit">\u2014</span>
      <span class="ring-stat-lbl">limit</span>
    </div>
    <div class="ring-stat-sep"></div>
    <div class="ring-stat">
      <span class="ring-stat-val" id="reqReset">\u2014</span>
      <span class="ring-stat-lbl">reset in</span>
    </div>
  </div>
</section>

<!-- \u2500\u2500 Metric Cards \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<section class="metric-cards" id="metricCards">
  <div class="metric-card glass-card" id="cardTokensIn">
    <div class="metric-icon" style="--c:#7B8CFF">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="tokensInVal">\u2014</div>
      <div class="metric-lbl">Tokens In</div>
      <div class="metric-bar-wrap"><div class="metric-bar" id="tokensInBar" style="--pct:0%;--c:#7B8CFF"></div></div>
    </div>
  </div>

  <div class="metric-card glass-card" id="cardTokensOut">
    <div class="metric-icon" style="--c:#00D4FF">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="tokensOutVal">\u2014</div>
      <div class="metric-lbl">Tokens Out</div>
      <div class="metric-bar-wrap"><div class="metric-bar" id="tokensOutBar" style="--pct:0%;--c:#00D4FF"></div></div>
    </div>
  </div>

  <div class="metric-card glass-card" id="cardCost">
    <div class="metric-icon" style="--c:#00FF94">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="costVal">\u2014</div>
      <div class="metric-lbl">Est. Cost</div>
      <div class="metric-tier" id="tierBadge">\u2014</div>
    </div>
  </div>

  <div class="metric-card glass-card" id="cardReset">
    <div class="metric-icon" style="--c:#FF6B9D">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="resetCountdown">\u2014</div>
      <div class="metric-lbl">Resets In</div>
      <canvas id="resetRing" width="36" height="36" class="reset-ring-canvas"></canvas>
    </div>
  </div>
</section>

<!-- \u2500\u2500 Usage Timeline \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<section class="timeline-section glass-card">
  <div class="section-header">
    <span class="section-title">24h Usage</span>
    <span class="section-sub" id="sparklineLabel">Requests over time</span>
  </div>
  <canvas id="sparkline" width="260" height="60" aria-label="24 hour usage sparkline"></canvas>
</section>

<!-- \u2500\u2500 All Models Summary \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<section class="models-section glass-card">
  <div class="section-header">
    <span class="section-title">All Models</span>
    <span class="section-sub" id="totalCost">\u2014</span>
  </div>
  <div class="models-list" id="modelsList"></div>
</section>

<!-- \u2500\u2500 Settings \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<section class="settings-section glass-card">
  <div class="section-header">
    <span class="section-title">Settings</span>
  </div>
  <div class="settings-row">
    <label class="settings-label" for="apiKeyInput">API Key</label>
    <div class="settings-input-wrap">
      <input type="password" id="apiKeyInput" class="settings-input" placeholder="Enter API key\u2026" autocomplete="off"/>
      <button class="settings-btn" id="saveKeyBtn">Save</button>
    </div>
  </div>
  <div class="settings-row">
    <label class="settings-label" for="refreshSelect">Auto Refresh</label>
    <select id="refreshSelect" class="settings-select">
      <option value="30">30 seconds</option>
      <option value="60" selected>1 minute</option>
      <option value="300">5 minutes</option>
      <option value="0">Manual only</option>
    </select>
  </div>
</section>

<script nonce="${i}" src="${o}"></script>
</body>
</html>`}_nonce(){let e="",t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let o=0;o<32;o++)e+=t.charAt(Math.floor(Math.random()*t.length));return e}};var c=f(require("vscode")),x=["compact","expanded","detailed"];function D(s){let{used:e,limit:t}=s.requests;return t>0?Math.round(e/t*100):0}function z(s){let e=s.requests.limit>0?(s.requests.limit-s.requests.used)/s.requests.limit*100:100;return Math.round(Math.max(0,Math.min(100,e)))}function m(s){let{used:e,limit:t}=s.requests;return t>0?Math.max(0,Math.min(1,(t-e)/t)):1}function k(s){let e=s-Date.now();if(e<=0)return"now";let t=Math.floor(e/36e5),o=Math.floor(e%36e5/6e4);return t>=24?`${Math.floor(t/24)}d`:t>0?`${t}h${o>0?`${o}m`:""}`:`${o}m`}function S(s){return s<=.05?"\u{1F534}":s<=.25?"\u{1F7E1}":(s<=.6,"\u{1F7E2}")}function E(s){if(s>=95)return new c.ThemeColor("statusBarItem.errorBackground");if(s>=80)return new c.ThemeColor("statusBarItem.warningBackground")}function J(s,e=5){let t=Math.round(s*e);return"\u25B0".repeat(t)+"\u25B1".repeat(e-t)}function X(s){let e=s.match(/Gemini\s+([\d.]+)\s+(Flash|Pro)(?:\s+\((\w))?/i);if(e){let i=e[1],r=e[2][0].toUpperCase(),a=e[3]?e[3].toUpperCase():"";return`${i}${r}${a}`}let t=s.match(/Claude\s+(\w+)\s+([\d.]+)(?:\s+\((\w))?/i);if(t){let i=t[1].slice(0,2).toUpperCase(),r=t[2].split(".")[0],a=t[3]?t[3].toUpperCase():"";return`${i}${r}${a}`}let o=s.match(/GPT[- ]?(?:OSS\s+)?(\d+)/i);return o?`G${o[1]}`:s.replace(/[^A-Za-z0-9]/g,"").slice(0,5)}function U(s,e){let t=Date.now(),o=s.lastFetched?new Date(s.lastFetched).toLocaleTimeString():"never",r=["## $(pulse) Antigravity Quota Tracker",`*Mode: **${e==="compact"?"mini":e==="expanded"?"short":"detailed"}** \u2014 click status bar to cycle*`,"","| Model | Remaining | Reset in |","|---|:---:|:---:|"];for(let n of s.models){let l=z(n),u=m(n),v=S(u),g=J(u,6),h=k(n.resetTimestamp),B=l<=5?`**${l}%**`:`${l}%`;r.push(`| ${v} ${n.displayName} | ${g} ${B} | ${h} |`)}r.push(""),r.push(`*Last updated: ${o}*`);let a=new c.MarkdownString(r.join(`
`));return a.isTrusted=!0,a.supportHtml=!1,a}function F(s){return s.get("statusBarAlignment","Left")==="Right"?c.StatusBarAlignment.Right:c.StatusBarAlignment.Left}function O(s){return s.get("statusBarPriority",100)}var C=class{constructor(e){this._service=e;this._lastState=null;this._mode=e.settings.statusBarMode,this._visible=e.settings.statusBarVisible;let t=c.workspace.getConfiguration("quotaTracker");this._item=this._createItem(F(t),O(t)),this._render(this._service.state),this._visible&&this._item.show()}recreate(){let e=this._visible,t=c.workspace.getConfiguration("quotaTracker");this._item.dispose(),this._item=this._createItem(F(t),O(t)),this._lastState&&this._render(this._lastState),e&&this._item.show()}_createItem(e,t){let o=c.window.createStatusBarItem(e,t);return o.command="quotaTracker.cycleMode",o}update(e){this._lastState=e,this._render(e)}cycleMode(){let e=x.indexOf(this._mode);this._mode=x[(e+1)%x.length],c.workspace.getConfiguration("quotaTracker").update("statusBarMode",this._mode,c.ConfigurationTarget.Global),this._lastState&&this._render(this._lastState);let t=this._mode==="compact"?"mini":this._mode==="expanded"?"short":"detailed";c.window.setStatusBarMessage(`$(pulse) Quota: ${t} mode`,1800)}setMode(e){this._mode=e,this._lastState&&this._render(this._lastState)}toggle(){this._visible=!this._visible,c.workspace.getConfiguration("quotaTracker").update("statusBarVisible",this._visible,c.ConfigurationTarget.Global),this._visible?(this._item.show(),c.window.setStatusBarMessage("$(eye) Quota bar shown",1500)):(this._item.hide(),c.window.setStatusBarMessage("$(eye-closed) Quota bar hidden",1500))}dispose(){this._item.dispose()}_render(e){if(e.isLoading){this._item.text="$(loading~spin) AGY\u2026",this._item.backgroundColor=void 0,this._item.tooltip="Fetching quota data\u2026";return}if(e.error){this._item.text="$(error) AGY quota error",this._item.backgroundColor=new c.ThemeColor("statusBarItem.errorBackground"),this._item.tooltip=`Quota error: ${e.error}
Click to retry`;return}if(!e.models.length){this._item.text="$(pulse) AGY \u2014",this._item.backgroundColor=void 0;return}switch(this._mode){case"compact":this._renderMini(e);break;case"expanded":this._renderShort(e);break;case"detailed":this._renderDetailed(e);break}}_renderMini(e){let t=[...e.models].sort((l,u)=>m(l)-m(u))[0],o=m(t),i=Math.round(o*100),r=S(o),a=k(t.resetTimestamp),n=D(t);this._item.text=`${r} ${i}% \u21BA${a}`,this._item.backgroundColor=E(n),this._item.tooltip=U(e,"compact")}_renderShort(e){let o=[...e.models].sort((a,n)=>m(a)-m(n)).slice(0,3).map(a=>{let n=m(a),l=Math.round(n*100),u=S(n),v=X(a.displayName),g=l>=100?"\u221E":`${l}%`;return`${u}${v}\xB7${g}`}),i=k(e.models[0].resetTimestamp),r=D([...e.models].sort((a,n)=>m(a)-m(n))[0]);this._item.text=`${o.join("  ")}  \u21BA${i}`,this._item.backgroundColor=E(r),this._item.tooltip=U(e,"expanded")}_renderDetailed(e){let t=e.models.map(n=>S(m(n))).join(""),o=k(e.models[0].resetTimestamp),i=e.models.length,r=e.models.filter(n=>m(n)<=.05).length,a=r>0?` \u26A1${r}`:"";this._item.text=`$(pulse) ${t} ${i}M${a} \u21BA${o}`,this._item.backgroundColor=void 0,this._item.tooltip=U(e,"detailed")}};function Z(s){console.log("[QuotaTracker] Activating\u2026");let e=new y(s),t=new C(e),o=new w(s.extensionUri,e);s.subscriptions.push(d.window.registerWebviewViewProvider(w.viewType,o,{webviewOptions:{retainContextWhenHidden:!0}})),s.subscriptions.push(e.onChange(i=>t.update(i))),s.subscriptions.push(d.commands.registerCommand("quotaTracker.openPanel",()=>{d.commands.executeCommand("quotaTracker.panel.focus")})),s.subscriptions.push(d.commands.registerCommand("quotaTracker.refresh",async()=>{await e.refresh(),d.window.setStatusBarMessage("$(check) Quota data refreshed",2e3)})),s.subscriptions.push(d.commands.registerCommand("quotaTracker.cycleMode",()=>{t.cycleMode()})),s.subscriptions.push(d.commands.registerCommand("quotaTracker.toggleStatusBar",()=>{t.toggle()})),s.subscriptions.push(d.commands.registerCommand("quotaTracker.setApiKey",async()=>{let i=await d.window.showInputBox({prompt:"Enter your Antigravity / Google AI API key",placeHolder:"AIza\u2026",password:!0,ignoreFocusOut:!0});i!==void 0&&(await d.workspace.getConfiguration("quotaTracker").update("apiKey",i,d.ConfigurationTarget.Global),await e.refresh(),d.window.showInformationMessage("$(check) API key saved. Quota data refreshed."))})),s.subscriptions.push(d.commands.registerCommand("quotaTracker.configurePosition",async()=>{let i=await d.window.showQuickPick([{label:"$(arrow-left)  Left side",description:"Activity bar side (default)",value:"Left"},{label:"$(arrow-right) Right side",description:"Notifications / clock side",value:"Right"}],{title:"Quota Tracker \u2014 Status Bar Side",placeHolder:"Choose which side of the status bar"});if(!i)return;let r=d.workspace.getConfiguration("quotaTracker"),a=r.get("statusBarPriority",100),n=await d.window.showInputBox({title:"Quota Tracker \u2014 Position (priority)",prompt:i.value==="Left"?"Higher number = further LEFT  (e.g. 200 = very left, 1 = near center)":"Higher number = further RIGHT (e.g. 200 = very right, 1 = near center)",value:String(a),validateInput:u=>{let v=parseInt(u);return isNaN(v)||v<0?"Enter a positive number (e.g. 100)":void 0}});if(n===void 0)return;let l=parseInt(n);await r.update("statusBarAlignment",i.value,d.ConfigurationTarget.Global),await r.update("statusBarPriority",l,d.ConfigurationTarget.Global),d.window.setStatusBarMessage(`$(pulse) Quota bar moved \u2192 ${i.value} side, priority ${l}`,2500)})),s.subscriptions.push(d.workspace.onDidChangeConfiguration(i=>{if(i.affectsConfiguration("quotaTracker")){let r=e.settings;t.setMode(r.statusBarMode),e.scheduleRefreshWithInterval(r.refreshInterval),(i.affectsConfiguration("quotaTracker.statusBarAlignment")||i.affectsConfiguration("quotaTracker.statusBarPriority"))&&t.recreate()}})),s.subscriptions.push(d.workspace.onDidSaveTextDocument(()=>{let i=e.settings;i.refreshInterval>0&&i.refreshInterval<300&&e.refresh()})),s.subscriptions.push(new d.Disposable(()=>{e.dispose(),t.dispose(),o.dispose()})),console.log("[QuotaTracker] Activated \u2713")}function ee(){console.log("[QuotaTracker] Deactivated")}0&&(module.exports={activate,deactivate});
//# sourceMappingURL=extension.js.map
