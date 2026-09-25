"use strict";var ee=Object.create;var $=Object.defineProperty;var te=Object.getOwnPropertyDescriptor;var se=Object.getOwnPropertyNames;var ie=Object.getPrototypeOf,oe=Object.prototype.hasOwnProperty;var ae=(a,e)=>{for(var t in e)$(a,t,{get:e[t],enumerable:!0})},O=(a,e,t,o)=>{if(e&&typeof e=="object"||typeof e=="function")for(let s of se(e))!oe.call(a,s)&&s!==t&&$(a,s,{get:()=>e[s],enumerable:!(o=te(e,s))||o.enumerable});return a};var C=(a,e,t)=>(t=a!=null?ee(ie(a)):{},O(e||!a||!a.__esModule?$(t,"default",{value:a,enumerable:!0}):t,a)),ne=a=>O($({},"__esModule",{value:!0}),a);var ue={};ae(ue,{activate:()=>le,deactivate:()=>ce});module.exports=ne(ue);var m=C(require("vscode"));var x=C(require("vscode"));var E=require("child_process"),H=require("util"),N=C(require("https")),W=(0,H.promisify)(E.exec);async function L(){try{let{stdout:a}=await W("ps -ax -o pid,command"),t=a.split(`
`).filter(o=>(o.includes("language_server")||o.includes("antigravity"))&&(o.includes("--csrf_token")||o.includes("--csrf-token")));if(t.length===0)return console.warn("[QuotaTracker] Antigravity language server process not found."),null;t.sort((o,s)=>{let i=o.includes("--enable_lsp")?1:0,n=s.includes("--enable_lsp")?1:0;return i-n});for(let o of t){let s=o.trim(),i=s.match(/^(\d+)\s+/);if(!i)continue;let n=parseInt(i[1],10),d=s.match(/--csrf[_-]token(?:=|\s+)([A-Za-z0-9_\-]+)/);if(!d)continue;let l=d[1];try{let{stdout:c}=await W(`lsof -Pan -p ${n} -i -sTCP:LISTEN`),u=Array.from(c.matchAll(/127\.0\.0\.1:(\d+)\s+\(LISTEN\)/g)).map(p=>parseInt(p[1],10));for(let p of u)if(await re(p,l))return{pid:n,port:p,csrfToken:l,isHttps:!0}}catch{continue}}return null}catch(a){return console.error("[QuotaTracker] Failed to query process tree:",a),null}}async function re(a,e){return new Promise(t=>{let o=JSON.stringify({metadata:{ideName:"antigravity",extensionName:"antigravity",locale:"en"}}),s=N.request({hostname:"127.0.0.1",port:a,path:"/exa.language_server_pb.LanguageServerService/GetUserStatus",method:"POST",rejectUnauthorized:!1,timeout:1500,headers:{"Content-Type":"application/json","Connect-Protocol-Version":"1","x-codeium-csrf-token":e,"X-CSRF-Token":e,"Content-Length":Buffer.byteLength(o)}},i=>{i.statusCode===200?t(!0):t(!1),i.resume()});s.on("error",()=>t(!1)),s.on("timeout",()=>{s.destroy(),t(!1)}),s.write(o),s.end()})}async function R(a){return new Promise((e,t)=>{let o=JSON.stringify({metadata:{ideName:"antigravity",extensionName:"antigravity",locale:"en"}}),s=N.request({hostname:"127.0.0.1",port:a.port,path:"/exa.language_server_pb.LanguageServerService/GetUserStatus",method:"POST",rejectUnauthorized:!1,timeout:5e3,headers:{"Content-Type":"application/json","Connect-Protocol-Version":"1","x-codeium-csrf-token":a.csrfToken,"X-CSRF-Token":a.csrfToken,"Content-Length":Buffer.byteLength(o)}},i=>{let n="";i.on("data",d=>n+=d),i.on("end",()=>{if(i.statusCode===200)try{let d=JSON.parse(n);e(d)}catch(d){t(new Error(`Failed to parse JSON: ${d}`))}else t(new Error(`Server returned HTTP ${i.statusCode}: ${n}`))})});s.on("error",i=>t(i)),s.on("timeout",()=>{s.destroy(),t(new Error("Request timed out"))}),s.write(o),s.end()})}async function B(a){return new Promise((e,t)=>{let o=JSON.stringify({forceRefresh:!0}),s=N.request({hostname:"127.0.0.1",port:a.port,path:"/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary",method:"POST",rejectUnauthorized:!1,timeout:5e3,headers:{"Content-Type":"application/json","Connect-Protocol-Version":"1","x-codeium-csrf-token":a.csrfToken,"X-CSRF-Token":a.csrfToken,"Content-Length":Buffer.byteLength(o)}},i=>{let n="";i.on("data",d=>n+=d),i.on("end",()=>{if(i.statusCode===200)try{let d=JSON.parse(n);e(d)}catch(d){t(new Error(`Failed to parse JSON: ${d}`))}else t(new Error(`Server returned HTTP ${i.statusCode}: ${n}`))})});s.on("error",i=>t(i)),s.on("timeout",()=>{s.destroy(),t(new Error("Request timed out"))}),s.write(o),s.end()})}var K="quotaTracker.history",j="quotaTracker.stateCache",V=48,Q=class{constructor(e){this._manualActiveModelId=null;this._session=null;this._onChangeEmitter=new x.EventEmitter;this.onChange=this._onChangeEmitter.event;this._context=e,this._state=this._loadCachedState(),this._scheduleRefresh(),this._activeModelCheckTimer=setInterval(()=>{this.checkActiveModel()},8e3)}get state(){return this._state}get settings(){let e=x.workspace.getConfiguration("quotaTracker");return{apiKey:e.get("apiKey",""),refreshInterval:e.get("refreshInterval",60),statusBarMode:e.get("statusBarMode","compact"),statusBarVisible:e.get("statusBarVisible",!0),focusModel:e.get("focusModel","auto")}}async refresh(){this._setState({...this._state,isLoading:!0,error:null});try{let e=null,t,o,s,i;try{let r=await this._fetchLocalProcessQuotas();e=r.models,t=r.groups,o=r.userTierName,s=r.activeModelId,i=r.activeModelName}catch(r){console.warn("[QuotaTracker] Local process fetch failed:",r.message)}if(!e&&this.settings.apiKey)try{e=await this._fetchFromApi(this.settings.apiKey)}catch(r){console.warn("[QuotaTracker] API fallback failed:",r.message)}if(!e||e.length===0){let r=this._generateDemoData();e=r.models,t=r.groups,s=s||r.models[0]?.modelId,i=i||r.models[0]?.displayName}let n=Date.now(),d=this._loadHistory();for(let r of e){let u={timestamp:n,requestsUsed:r.requests.used,tokensIn:r.tokensIn.used,tokensOut:r.tokensOut.used};d[r.modelId]||(d[r.modelId]=[]),d[r.modelId].push(u),d[r.modelId].length>V&&(d[r.modelId]=d[r.modelId].slice(-V))}this._saveHistory(d);let l=e.reduce((r,u)=>r+u.estimatedCostUsd,0),c={models:e,groups:t,activeModelId:s,activeModelName:i,history:d,totalCostUsd:l,isLoading:!1,error:null,lastFetched:n,userTierName:o};this._setState(c),this._cacheState(c)}catch(e){this._setState({...this._state,isLoading:!1,error:e.message??"Unknown error"})}}setActiveModel(e){if(this._manualActiveModelId=e,e){let t=this._state.models.find(o=>o.modelId===e);t&&this._setState({...this._state,activeModelId:t.modelId,activeModelName:t.displayName})}else this.checkActiveModel()}async checkActiveModel(){if(this._session||(this._session=await L()),!!this._session)try{let t=(await R(this._session))?.userStatus?.cascadeModelConfigData;if(!t)return;let o=t.clientModelConfigs||[],s=t.defaultOverrideModelConfig,i=this._resolveActiveModel(o,s);i.activeModelId&&i.activeModelId!==this._state.activeModelId&&this._setState({...this._state,activeModelId:i.activeModelId,activeModelName:i.activeModelName})}catch{}}scheduleRefreshWithInterval(e){this._refreshTimer&&(clearTimeout(this._refreshTimer),this._refreshTimer=void 0),e>0&&this._scheduleRefresh(e*1e3)}dispose(){this._refreshTimer&&clearTimeout(this._refreshTimer),this._activeModelCheckTimer&&clearInterval(this._activeModelCheckTimer),this._onChangeEmitter.dispose()}_setState(e){this._state=e,this._onChangeEmitter.fire(e)}_scheduleRefresh(e){let t=e??this.settings.refreshInterval*1e3;t<=0||(this._refreshTimer=setTimeout(async()=>{await this.refresh(),this._scheduleRefresh()},t))}_loadCachedState(){let e=this._context.globalState.get(j);if(e)return e;let t=this._generateDemoData();return{models:t.models,groups:t.groups,history:{},totalCostUsd:0,isLoading:!1,error:null,lastFetched:null}}_cacheState(e){this._context.globalState.update(j,e)}_loadHistory(){return this._context.globalState.get(K,{})}_saveHistory(e){this._context.globalState.update(K,e)}async _fetchLocalProcessQuotas(){if(this._session||(this._session=await L()),!this._session)throw new Error("Antigravity language server process not found");let e=null,t=null;try{let l=await Promise.allSettled([R(this._session),B(this._session)]);l[0].status==="fulfilled"&&(e=l[0].value),l[1].status==="fulfilled"&&(t=l[1].value)}catch(l){if(this._session=await L(),this._session){let c=await Promise.allSettled([R(this._session),B(this._session)]);c[0].status==="fulfilled"&&(e=c[0].value),c[1].status==="fulfilled"&&(t=c[1].value)}else throw l}if(!e||!e.userStatus)throw new Error("Invalid response from Antigravity language server");let o=this._mapQuotaGroups(t),s=e.userStatus?.userTier?.name,i=this._mapConnectResponse(e,o),n=e.userStatus?.cascadeModelConfigData,d=this._resolveActiveModel(n?.clientModelConfigs||[],n?.defaultOverrideModelConfig);return{models:i,groups:o,userTierName:s,activeModelId:d.activeModelId,activeModelName:d.activeModelName}}_resolveActiveModel(e,t){if(this._manualActiveModelId){let n=this._state?.models?.find(d=>d.modelId===this._manualActiveModelId);if(n)return{activeModelId:n.modelId,activeModelName:n.displayName}}let o=this.settings.focusModel;if(o&&o!=="auto"){let n=this._state?.models?.find(d=>d.modelId===o||d.displayName.toLowerCase().includes(o.toLowerCase()));if(n)return{activeModelId:n.modelId,activeModelName:n.displayName}}if(!t)return{};let s=t.modelOrAlias?.model||t.modelId||t.model,i=t.modelOrAlias?.alias||t.alias;if(s){let n=e.find(d=>d.modelOrAlias?.model===s||d.modelId===s||d.modelOrAlias?.alias===s);if(n)return{activeModelId:n.modelId||n.label.toLowerCase().replace(/[^a-z0-9]+/g,"-"),activeModelName:n.label}}if(i){let n=e.find(d=>d.modelOrAlias?.alias===i||d.modelId===i||d.label.toLowerCase().includes(i.toLowerCase()));if(n)return{activeModelId:n.modelId||n.label.toLowerCase().replace(/[^a-z0-9]+/g,"-"),activeModelName:n.label}}return{}}_mapQuotaGroups(e){let t=e?.response?.groups;if(!t||!Array.isArray(t)||t.length===0)return this._generateDemoGroups(Date.now());let o=Date.now();return t.map(s=>{let i=(s.buckets||[]).map(n=>{let d=typeof n.remainingFraction=="number"?n.remainingFraction:n.remaining?.value??n.remaining_fraction??1,l=Math.max(0,Math.min(1,1-d)),c=Math.round(l*100),r=n.resetTime?new Date(n.resetTime).getTime():n.reset_time?new Date(n.reset_time).getTime():o+168*36e5,u=n.window||(n.bucketId?.toLowerCase().includes("weekly")?"weekly":n.bucketId?.toLowerCase().includes("5h")?"5h":"weekly");return{bucketId:n.bucketId||"bucket-"+Math.random().toString(36).slice(2),displayName:n.displayName||(u==="weekly"?"Weekly Limit Remaining":"5-Hour Limit Remaining"),description:n.description,window:u,remainingFraction:d,usedPercent:c,resetTimestamp:r}});return{displayName:s.displayName||"Model Group",description:s.description,buckets:i}})}_findGroupForModel(e,t){let o=e.toLowerCase();if(o.includes("gemini")){let s=t.find(i=>i.displayName.toLowerCase().includes("gemini")||(i.description||"").toLowerCase().includes("gemini"));if(s)return s}if(o.includes("claude")||o.includes("gpt")||o.includes("sonnet")||o.includes("opus")||o.includes("oss")){let s=t.find(i=>i.displayName.toLowerCase().includes("claude")||i.displayName.toLowerCase().includes("gpt")||(i.description||"").toLowerCase().includes("claude")||(i.description||"").toLowerCase().includes("gpt"));if(s)return s}return t.find(s=>{let i=(s.description||"").toLowerCase(),n=s.displayName.toLowerCase();return o.split(/[\s\-()]+/).some(l=>l.length>2&&(n.includes(l)||i.includes(l)))})}_mapConnectResponse(e,t=[]){let o=e.userStatus,s=o?.cascadeModelConfigData?.clientModelConfigs||[],i=o?.userTier?.name?.toLowerCase()||"",n=i.includes("ultra")?"enterprise":i.includes("pro")?"pro":"free",d=Date.now();return s.map(l=>{let c=l.quotaInfo?.remainingFraction??1,r=Math.max(0,Math.min(1,1-c)),u=Math.round(r*100),p=l.quotaInfo?.resetTime?new Date(l.quotaInfo.resetTime).getTime():d+4*36e5,g=n;l.label.toLowerCase().includes("ultra")?g="enterprise":l.label.toLowerCase().includes("pro")&&(g="pro");let v=this._findGroupForModel(l.label,t),f=v?.buckets.find(b=>b.window==="weekly"||b.bucketId.toLowerCase().includes("weekly")||b.displayName.toLowerCase().includes("weekly"));return{modelId:l.modelId||l.label.toLowerCase().replace(/[^a-z0-9]+/g,"-"),displayName:l.label,tier:g,requests:{used:u,limit:100},tokensIn:{used:Math.round(r*1e6),limit:1e6},tokensOut:{used:Math.round(r*2e5),limit:2e5},estimatedCostUsd:0,resetTimestamp:p,lastUpdated:d,weeklyRemainingFraction:f?f.remainingFraction:void 0,weeklyResetTimestamp:f?f.resetTimestamp:void 0,groupName:v?v.displayName:void 0}})}async _fetchFromApi(e){let o=await fetch("https://generativelanguage.googleapis.com/v1/quota",{headers:{Authorization:`Bearer ${e}`,"x-goog-api-key":e,"Content-Type":"application/json"}});if(!o.ok)return console.warn(`[QuotaTracker] API returned ${o.status}, using demo data`),this._generateDemoData().models;let s=await o.json();return this._parseApiResponse(s)}_parseApiResponse(e){return Array.isArray(e?.quotas)?e.quotas.map(t=>this._mapQuota(t)):this._generateDemoData().models}_mapQuota(e){let t=Date.now(),o=e.resetTime?new Date(e.resetTime).getTime():t+36e5;return{modelId:e.model??"gemini-2.5-flash",displayName:e.displayName??e.model??"Unknown",tier:e.tier??"free",requests:{used:e.requestsUsed??0,limit:e.requestsLimit??1500},tokensIn:{used:e.tokensInputUsed??0,limit:e.tokensInputLimit??1e6},tokensOut:{used:e.tokensOutputUsed??0,limit:e.tokensOutputLimit??5e5},estimatedCostUsd:e.estimatedCost??0,resetTimestamp:o,lastUpdated:t}}_generateDemoGroups(e){let t=e+5544e5,o=e+152*3600*1e3,s=e+4*3600*1e3+2760*1e3,i=e+1*3600*1e3+540*1e3;return[{displayName:"Gemini Models",description:"Models within this group: Gemini Flash, Gemini Pro",buckets:[{bucketId:"gemini-weekly",displayName:"Weekly Limit Remaining",description:"You have used some of your weekly limit, it will fully refresh in 6 days, 10 hours.",window:"weekly",remainingFraction:.991,usedPercent:1,resetTimestamp:t},{bucketId:"gemini-5h",displayName:"Five Hour Limit Remaining",description:"You have used some of your 5-hour limit, it will fully refresh in 4 hours, 46 minutes.",window:"5h",remainingFraction:.984,usedPercent:2,resetTimestamp:s}]},{displayName:"Claude and GPT models",description:"Models within this group: Claude Opus, Claude Sonnet, GPT-OSS",buckets:[{bucketId:"3p-weekly",displayName:"Weekly Limit Remaining",description:"You have used some of your weekly limit, it will fully refresh in 6 days, 8 hours.",window:"weekly",remainingFraction:.549,usedPercent:45,resetTimestamp:o},{bucketId:"3p-5h",displayName:"Five Hour Limit Remaining",description:"You have used some of your 5-hour limit, it will fully refresh in 1 hour, 9 minutes.",window:"5h",remainingFraction:.652,usedPercent:35,resetTimestamp:i}]}]}_generateDemoData(){let e=Date.now(),t=this._generateDemoGroups(e),o=t[0].buckets[0],s=t[1].buckets[0];return{models:[{modelId:"gemini-3.8-flash-high",displayName:"Gemini 3.8 Flash (High)",tier:"pro",requests:{used:1,limit:100},tokensIn:{used:12e3,limit:1e6},tokensOut:{used:4e3,limit:2e5},estimatedCostUsd:0,resetTimestamp:t[0].buckets[1].resetTimestamp,lastUpdated:e,weeklyRemainingFraction:o.remainingFraction,weeklyResetTimestamp:o.resetTimestamp,groupName:"Gemini Models"},{modelId:"claude-sonnet-4-6",displayName:"Claude Sonnet 4.6 (Thinking)",tier:"pro",requests:{used:35,limit:100},tokensIn:{used:348e3,limit:1e6},tokensOut:{used:69600,limit:2e5},estimatedCostUsd:2.45,resetTimestamp:t[1].buckets[1].resetTimestamp,lastUpdated:e,weeklyRemainingFraction:s.remainingFraction,weeklyResetTimestamp:s.resetTimestamp,groupName:"Claude and GPT models"},{modelId:"gemini-3.1-pro-high",displayName:"Gemini 3.1 Pro (High)",tier:"pro",requests:{used:2,limit:100},tokensIn:{used:16e3,limit:1e6},tokensOut:{used:5200,limit:2e5},estimatedCostUsd:0,resetTimestamp:t[0].buckets[1].resetTimestamp,lastUpdated:e,weeklyRemainingFraction:o.remainingFraction,weeklyResetTimestamp:o.resetTimestamp,groupName:"Gemini Models"},{modelId:"gpt-oss-120b-medium",displayName:"GPT-OSS 120B (Medium)",tier:"pro",requests:{used:35,limit:100},tokensIn:{used:348e3,limit:1e6},tokensOut:{used:69600,limit:2e5},estimatedCostUsd:1.1,resetTimestamp:t[1].buckets[1].resetTimestamp,lastUpdated:e,weeklyRemainingFraction:s.remainingFraction,weeklyResetTimestamp:s.resetTimestamp,groupName:"Claude and GPT models"},{modelId:"claude-opus-4-6-thinking",displayName:"Claude Opus 4.6 (Thinking)",tier:"enterprise",requests:{used:35,limit:100},tokensIn:{used:348e3,limit:1e6},tokensOut:{used:69600,limit:2e5},estimatedCostUsd:6.8,resetTimestamp:t[1].buckets[1].resetTimestamp,lastUpdated:e,weeklyRemainingFraction:s.remainingFraction,weeklyResetTimestamp:s.resetTimestamp,groupName:"Claude and GPT models"},{modelId:"gemini-3.6-flash-medium",displayName:"Gemini 3.6 Flash (Medium)",tier:"pro",requests:{used:1,limit:100},tokensIn:{used:1e4,limit:1e6},tokensOut:{used:3e3,limit:2e5},estimatedCostUsd:0,resetTimestamp:t[0].buckets[1].resetTimestamp,lastUpdated:e,weeklyRemainingFraction:o.remainingFraction,weeklyResetTimestamp:o.resetTimestamp,groupName:"Gemini Models"}],groups:t}}};var w=C(require("vscode")),S=class{constructor(e,t){this._extensionUri=e;this._service=t;this._disposables=[]}static{this.viewType="quotaTracker.panel"}resolveWebviewView(e,t,o){this._view=e,e.webview.options={enableScripts:!0,localResourceRoots:[w.Uri.joinPath(this._extensionUri,"media")]},e.webview.html=this._buildHtml(e.webview),this._disposables.push(e.webview.onDidReceiveMessage(async s=>{switch(s.type){case"ready":this._postMessage({type:"stateUpdate",state:this._service.state}),this._postMessage({type:"settingsUpdate",settings:this._service.settings});break;case"refresh":await this._service.refresh();break;case"setApiKey":await w.workspace.getConfiguration("quotaTracker").update("apiKey",s.key,w.ConfigurationTarget.Global),await this._service.refresh();break;case"setRefreshInterval":await w.workspace.getConfiguration("quotaTracker").update("refreshInterval",s.seconds,w.ConfigurationTarget.Global),this._service.scheduleRefreshWithInterval(s.seconds);break;case"selectModel":this._service.setActiveModel(s.modelId);break}})),this._disposables.push(this._service.onChange(s=>{this._postMessage({type:"stateUpdate",state:s})})),this._service.refresh()}sendState(e){this._postMessage({type:"stateUpdate",state:e})}dispose(){this._disposables.forEach(e=>e.dispose()),this._disposables=[]}_postMessage(e){this._view?.webview.postMessage(e)}_uri(...e){return this._view.webview.asWebviewUri(w.Uri.joinPath(this._extensionUri,...e))}_buildHtml(e){let t=e.asWebviewUri(w.Uri.joinPath(this._extensionUri,"media","panel.css")),o=e.asWebviewUri(w.Uri.joinPath(this._extensionUri,"media","panel.js")),s=this._nonce();return`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${e.cspSource} 'unsafe-inline' https://fonts.googleapis.com;
             font-src ${e.cspSource} https://fonts.gstatic.com;
             img-src ${e.cspSource} data:;
             script-src 'nonce-${s}';">
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
      <span class="ring-stat-lbl">5h reset</span>
    </div>
    <div class="ring-stat-sep" id="weeklyRingSep"></div>
    <div class="ring-stat" id="weeklyRingStat">
      <span class="ring-stat-val" id="weeklyRingReset">\u2014</span>
      <span class="ring-stat-lbl">weekly reset</span>
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

  <div class="metric-card glass-card" id="cardWeekly">
    <div class="metric-icon" style="--c:#FFB347">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    </div>
    <div class="metric-content">
      <div class="metric-val" id="weeklyVal">\u2014</div>
      <div class="metric-lbl">Weekly Limit</div>
      <div class="metric-bar-wrap"><div class="metric-bar" id="weeklyBar" style="--pct:0%;--c:#FFB347"></div></div>
    </div>
  </div>

  <div class="metric-card glass-card full-span" id="cardReset">
    <div class="metric-icon" style="--c:#FF6B9D">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    </div>
    <div class="metric-content reset-horizontal">
      <div>
        <div class="metric-val" id="resetCountdown">\u2014</div>
        <div class="metric-lbl">5h Window Resets In</div>
      </div>
      <canvas id="resetRing" width="36" height="36" class="reset-ring-canvas"></canvas>
    </div>
  </div>
</section>

<!-- \u2500\u2500 Weekly Quotas (Shared Pools) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 -->
<section class="weekly-section glass-card" id="weeklySection">
  <div class="section-header">
    <div class="section-title-wrap">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-5)" stroke-width="2.2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span class="section-title">Weekly Quotas</span>
    </div>
    <span class="section-sub" id="weeklyPoolSub">Shared model pools</span>
  </div>
  <div class="weekly-pools-list" id="weeklyPoolsList"></div>
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

<script nonce="${s}" src="${o}"></script>
</body>
</html>`}_nonce(){let e="",t="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";for(let o=0;o<32;o++)e+=t.charAt(Math.floor(Math.random()*t.length));return e}};var h=C(require("vscode")),U=["compact","expanded","detailed"];function Y(a){let{used:e,limit:t}=a.requests;return t>0?Math.round(e/t*100):0}function z(a){let e=a.requests.limit>0?(a.requests.limit-a.requests.used)/a.requests.limit*100:100;return Math.round(Math.max(0,Math.min(100,e)))}function y(a){let{used:e,limit:t}=a.requests;return t>0?Math.max(0,Math.min(1,(t-e)/t)):1}function _(a){let e=a-Date.now();if(e<=0)return"now";let t=Math.floor(e/36e5),o=Math.floor(e%36e5/6e4);return t>=24?`${Math.floor(t/24)}d`:t>0?`${t}h${o>0?`${o}m`:""}`:`${o}m`}function T(a){return a<=.05?"\u{1F534}":a<=.25?"\u{1F7E1}":(a<=.6,"\u{1F7E2}")}function A(a){if(a>=95)return new h.ThemeColor("statusBarItem.errorBackground");if(a>=80)return new h.ThemeColor("statusBarItem.warningBackground")}function J(a,e=5){let t=Math.round(a*e);return"\u25B0".repeat(t)+"\u25B1".repeat(e-t)}function G(a){let e=a.match(/Gemini\s+([\d.]+)\s+(Flash|Pro)(?:\s+\((\w))?/i);if(e){let s=e[1],i=e[2][0].toUpperCase(),n=e[3]?e[3].toUpperCase():"";return`${s}${i}${n}`}let t=a.match(/Claude\s+(\w+)\s+([\d.]+)(?:\s+\((\w))?/i);if(t){let s=t[1].slice(0,2).toUpperCase(),i=t[2].split(".")[0],n=t[3]?t[3].toUpperCase():"";return`${s}${i}${n}`}let o=a.match(/GPT[- ]?(?:OSS\s+)?(\d+)/i);return o?`G${o[1]}`:a.replace(/[^A-Za-z0-9]/g,"").slice(0,5)}function de(a){if(a.groups&&a.groups.length>0){let t=[];for(let o of a.groups){let s=o.buckets.find(i=>i.window==="weekly"||i.bucketId.toLowerCase().includes("weekly")||i.displayName.toLowerCase().includes("weekly"));s&&t.push({fraction:s.remainingFraction,resetMs:s.resetTimestamp,name:o.displayName.replace(" Models","").replace(" and ","/")})}if(t.length>0)return t.sort((o,s)=>o.fraction-s.fraction),t[0]}let e=a.models.filter(t=>t.weeklyRemainingFraction!==void 0);if(e.length>0){e.sort((o,s)=>(o.weeklyRemainingFraction??1)-(s.weeklyRemainingFraction??1));let t=e[0];return{fraction:t.weeklyRemainingFraction??1,resetMs:t.weeklyResetTimestamp??Date.now(),name:t.groupName||"Weekly"}}return null}function P(a,e){if(e&&e.weeklyRemainingFraction!==void 0)return{fraction:e.weeklyRemainingFraction,resetMs:e.weeklyResetTimestamp??Date.now(),name:e.groupName||"Weekly"};if(e&&a.groups){let t=e.displayName.toLowerCase(),o=a.groups.find(s=>{let i=s.displayName.toLowerCase();return!!(t.includes("gemini")&&i.includes("gemini")||(t.includes("claude")||t.includes("gpt")||t.includes("sonnet")||t.includes("opus"))&&(i.includes("claude")||i.includes("gpt")||i.includes("other")))});if(o){let s=o.buckets.find(i=>i.window==="weekly"||i.bucketId.toLowerCase().includes("weekly")||i.displayName.toLowerCase().includes("weekly"));if(s)return{fraction:s.remainingFraction,resetMs:s.resetTimestamp,name:o.displayName.replace(" Models","").replace(" and ","/")}}}return de(a)}function q(a,e){let t=Date.now(),o=a.lastFetched?new Date(a.lastFetched).toLocaleTimeString():"never",i=["## $(pulse) Antigravity Quota Tracker",`*Mode: **${e==="compact"?"mini":e==="expanded"?"short":"detailed"}** \u2014 click status bar to cycle*`,""],n=a.activeModelId?a.models.find(c=>c.modelId===a.activeModelId||c.displayName===a.activeModelName):null;if(n){let c=z(n),r=_(n.resetTimestamp),u=P(a,n),p=u?` \xB7 \u{1F4C5} Weekly: **${Math.round(u.fraction*100)}%** (${u.name})`:"";i.push(`> \u26A1 **Active Agent Model:** **${n.displayName}**`),i.push(`> 5-Hour Quota: **${c}%** remaining (\u21BA in ${r})${p}`),i.push("")}if(a.groups&&a.groups.length>0){i.push("### \u{1F4C5} Weekly Limits (Shared Pools)"),i.push("| Shared Pool | Weekly Remaining | 5-Hour Window | Weekly Reset |"),i.push("|---|:---:|:---:|:---:|");for(let c of a.groups){let r=c.buckets.find(k=>k.window==="weekly"||k.bucketId.toLowerCase().includes("weekly")||k.displayName.toLowerCase().includes("weekly")),u=c.buckets.find(k=>k.window==="5h"||k.bucketId.toLowerCase().includes("5h")||k.displayName.toLowerCase().includes("5-hour")),p=r?r.remainingFraction:1,g=Math.round(p*100),v=J(p,5),f=T(p),b=r?_(r.resetTimestamp):"\u2014",I=u?`${Math.round(u.remainingFraction*100)}%`:"\u2014",M=n&&(n.displayName.toLowerCase().includes("gemini")&&c.displayName.toLowerCase().includes("gemini")||!n.displayName.toLowerCase().includes("gemini")&&!c.displayName.toLowerCase().includes("gemini"))?`**${c.displayName}** \u2605`:c.displayName;i.push(`| ${f} ${M} | ${v} ${g}% | ${I} | \u21BA in ${b} |`)}i.push("")}i.push("### \u{1F916} Model Quotas");let d=a.models.some(c=>c.weeklyRemainingFraction!==void 0);d?(i.push("| Model | 5h Left | Weekly Left | 5h Reset |"),i.push("|---|:---:|:---:|:---:|")):(i.push("| Model | Remaining | Reset in |"),i.push("|---|:---:|:---:|"));for(let c of a.models){let r=n&&c.modelId===n.modelId,u=z(c),p=y(c),g=T(p),v=J(p,5),f=_(c.resetTimestamp),b=u<=5?`**${u}%**`:`${u}%`,I=r?`**${c.displayName}** \u26A1`:c.displayName;if(d){let D=c.weeklyRemainingFraction??1,M=Math.round(D*100),k=M<=10?`**${M}%**`:`${M}%`;i.push(`| ${g} ${I} | ${v} ${b} | \u{1F4C5} ${k} | ${f} |`)}else i.push(`| ${g} ${I} | ${v} ${b} | ${f} |`)}i.push(""),i.push(`*Last updated: ${o}*`);let l=new h.MarkdownString(i.join(`
`));return l.isTrusted=!0,l.supportHtml=!1,l}function X(a){return a.get("statusBarAlignment","Left")==="Right"?h.StatusBarAlignment.Right:h.StatusBarAlignment.Left}function Z(a){return a.get("statusBarPriority",100)}var F=class{constructor(e){this._service=e;this._lastState=null;this._mode=e.settings.statusBarMode,this._visible=e.settings.statusBarVisible;let t=h.workspace.getConfiguration("quotaTracker");this._item=this._createItem(X(t),Z(t)),this._lastState=this._service.state,this._render(this._lastState),this._visible&&this._item.show()}recreate(){let e=this._visible,t=h.workspace.getConfiguration("quotaTracker");this._item.dispose(),this._item=this._createItem(X(t),Z(t)),this._lastState&&this._render(this._lastState),e&&this._item.show()}_createItem(e,t){let o=h.window.createStatusBarItem(e,t);return o.command="quotaTracker.cycleMode",o}update(e){this._lastState=e,this._render(e)}cycleMode(){let e=U.indexOf(this._mode);this._mode=U[(e+1)%U.length],h.workspace.getConfiguration("quotaTracker").update("statusBarMode",this._mode,h.ConfigurationTarget.Global),this._lastState&&this._render(this._lastState);let t=this._mode==="compact"?"mini":this._mode==="expanded"?"short":"detailed";h.window.setStatusBarMessage(`$(pulse) Quota: ${t} mode`,1800)}setMode(e){this._mode=e,this._lastState&&this._render(this._lastState)}toggle(){this._visible=!this._visible,h.workspace.getConfiguration("quotaTracker").update("statusBarVisible",this._visible,h.ConfigurationTarget.Global),this._visible?(this._item.show(),h.window.setStatusBarMessage("$(eye) Quota bar shown",1500)):(this._item.hide(),h.window.setStatusBarMessage("$(eye-closed) Quota bar hidden",1500))}dispose(){this._item.dispose()}_render(e){if(e.isLoading){this._item.text="$(loading~spin) AGY\u2026",this._item.backgroundColor=void 0,this._item.tooltip="Fetching quota data\u2026";return}if(e.error){this._item.text="$(error) AGY quota error",this._item.backgroundColor=new h.ThemeColor("statusBarItem.errorBackground"),this._item.tooltip=`Quota error: ${e.error}
Click to retry`;return}if(!e.models.length){this._item.text="$(pulse) AGY \u2014",this._item.backgroundColor=void 0;return}switch(this._mode){case"compact":this._renderMini(e);break;case"expanded":this._renderShort(e);break;case"detailed":this._renderDetailed(e);break}}_renderMini(e){let t=[...e.models].sort((p,g)=>y(p)-y(g))[0],s=(e.activeModelId?e.models.find(p=>p.modelId===e.activeModelId||p.displayName===e.activeModelName):null)||t;if(!s)return;let i=y(s),n=Math.round(i*100),d=T(i),l=_(s.resetTimestamp),c=Y(s),r=G(s.displayName),u=P(e,s);if(u){let p=Math.round(u.fraction*100),g=Math.round((1-u.fraction)*100);this._item.text=`${d} ${r}\xB7${n}% \xB7 \u{1F4C5}${p}% \u21BA${l}`,this._item.backgroundColor=A(Math.max(c,g))}else this._item.text=`${d} ${r}\xB7${n}% \u21BA${l}`,this._item.backgroundColor=A(c);this._item.tooltip=q(e,"compact")}_renderShort(e){let t=e.activeModelId?e.models.find(r=>r.modelId===e.activeModelId||r.displayName===e.activeModelName):null,o=[...e.models].filter(r=>!t||r.modelId!==t.modelId).sort((r,u)=>y(r)-y(u)),s=t?[t,...o.slice(0,2)]:o.slice(0,3),i=s.map(r=>{let u=y(r),p=Math.round(u*100),g=T(u),v=G(r.displayName),f=p>=100?"\u221E":`${p}%`;return`${g}${v}\xB7${f}`}),n=t||s[0],d=_(n?n.resetTimestamp:e.models[0].resetTimestamp),l=Y([...e.models].sort((r,u)=>y(r)-y(u))[0]),c=P(e,n);if(c){let r=Math.round(c.fraction*100),u=Math.round((1-c.fraction)*100);this._item.text=`${i.join("  ")}  \u{1F4C5}${r}%  \u21BA${d}`,this._item.backgroundColor=A(Math.max(l,u))}else this._item.text=`${i.join("  ")}  \u21BA${d}`,this._item.backgroundColor=A(l);this._item.tooltip=q(e,"expanded")}_renderDetailed(e){let t=e.activeModelId?e.models.find(r=>r.modelId===e.activeModelId||r.displayName===e.activeModelName):null,o=t?`[${G(t.displayName)}] `:"",s=e.models.map(r=>T(y(r))).join(""),i=_(t?t.resetTimestamp:e.models[0].resetTimestamp),n=e.models.length,d=e.models.filter(r=>y(r)<=.05).length,l=d>0?` \u26A1${d}`:"",c="";if(e.groups&&e.groups.length>0){let r=e.groups.map(u=>{let p=u.buckets.find(v=>v.window==="weekly"||v.bucketId.toLowerCase().includes("weekly")||v.displayName.toLowerCase().includes("weekly")),g=u.displayName.toLowerCase().includes("gemini")?"Gem":"3P";return p?`${g}:${Math.round(p.remainingFraction*100)}%`:""}).filter(Boolean);r.length>0&&(c=` | \u{1F4C5} ${r.join(" ")}`)}else{let r=P(e,t||void 0);r&&(c=` | \u{1F4C5} W:${Math.round(r.fraction*100)}%`)}this._item.text=`$(pulse) ${o}${s} ${n}M${l}${c} \u21BA${i}`,this._item.backgroundColor=void 0,this._item.tooltip=q(e,"detailed")}};function le(a){console.log("[QuotaTracker] Activating\u2026");let e=new Q(a),t=new F(e),o=new S(a.extensionUri,e);a.subscriptions.push(m.window.registerWebviewViewProvider(S.viewType,o,{webviewOptions:{retainContextWhenHidden:!0}})),a.subscriptions.push(e.onChange(s=>t.update(s))),a.subscriptions.push(m.commands.registerCommand("quotaTracker.openPanel",()=>{m.commands.executeCommand("quotaTracker.panel.focus")})),a.subscriptions.push(m.commands.registerCommand("quotaTracker.refresh",async()=>{await e.refresh(),m.window.setStatusBarMessage("$(check) Quota data refreshed",2e3)})),a.subscriptions.push(m.commands.registerCommand("quotaTracker.cycleMode",()=>{t.cycleMode()})),a.subscriptions.push(m.commands.registerCommand("quotaTracker.toggleStatusBar",()=>{t.toggle()})),a.subscriptions.push(m.commands.registerCommand("quotaTracker.setApiKey",async()=>{let s=await m.window.showInputBox({prompt:"Enter your Antigravity / Google AI API key",placeHolder:"AIza\u2026",password:!0,ignoreFocusOut:!0});s!==void 0&&(await m.workspace.getConfiguration("quotaTracker").update("apiKey",s,m.ConfigurationTarget.Global),await e.refresh(),m.window.showInformationMessage("$(check) API key saved. Quota data refreshed."))})),a.subscriptions.push(m.commands.registerCommand("quotaTracker.configurePosition",async()=>{let s=await m.window.showQuickPick([{label:"$(arrow-left)  Left side",description:"Activity bar side (default)",value:"Left"},{label:"$(arrow-right) Right side",description:"Notifications / clock side",value:"Right"}],{title:"Quota Tracker \u2014 Status Bar Side",placeHolder:"Choose which side of the status bar"});if(!s)return;let i=m.workspace.getConfiguration("quotaTracker"),n=i.get("statusBarPriority",100),d=await m.window.showInputBox({title:"Quota Tracker \u2014 Position (priority)",prompt:s.value==="Left"?"Higher number = further LEFT  (e.g. 200 = very left, 1 = near center)":"Higher number = further RIGHT (e.g. 200 = very right, 1 = near center)",value:String(n),validateInput:c=>{let r=parseInt(c);return isNaN(r)||r<0?"Enter a positive number (e.g. 100)":void 0}});if(d===void 0)return;let l=parseInt(d);await i.update("statusBarAlignment",s.value,m.ConfigurationTarget.Global),await i.update("statusBarPriority",l,m.ConfigurationTarget.Global),m.window.setStatusBarMessage(`$(pulse) Quota bar moved \u2192 ${s.value} side, priority ${l}`,2500)})),a.subscriptions.push(m.commands.registerCommand("quotaTracker.selectFocusModel",async()=>{let s=e.state.models||[],i=e.state.activeModelId,n=[{label:"$(sparkle) Auto-Detect (Follow Active Agent Model)",description:"Automatically switches to whatever model the agent is currently using",detail:"Recommended"},...s.map(l=>({label:`$(robot) ${l.displayName}`,description:`${Math.round((1-l.requests.used/l.requests.limit)*100)}% remaining${l.modelId===i?" (active)":""}`,detail:l.groupName?`Shared Pool: ${l.groupName}`:void 0}))],d=await m.window.showQuickPick(n,{title:"Quota Tracker \u2014 Select Model Focus",placeHolder:"Select a model to pin, or choose Auto-Detect"});if(d)if(d.label.includes("Auto-Detect"))await m.workspace.getConfiguration("quotaTracker").update("focusModel","auto",m.ConfigurationTarget.Global),e.setActiveModel(null),m.window.setStatusBarMessage("$(sparkle) Quota tracker set to Auto-Detect model",2e3);else{let l=s.find(c=>d.label.includes(c.displayName));l&&(await m.workspace.getConfiguration("quotaTracker").update("focusModel",l.modelId,m.ConfigurationTarget.Global),e.setActiveModel(l.modelId),m.window.setStatusBarMessage(`$(pin) Quota tracker focused on ${l.displayName}`,2e3))}})),a.subscriptions.push(m.workspace.onDidChangeConfiguration(s=>{if(s.affectsConfiguration("quotaTracker")){let i=e.settings;t.setMode(i.statusBarMode),e.scheduleRefreshWithInterval(i.refreshInterval),(s.affectsConfiguration("quotaTracker.statusBarAlignment")||s.affectsConfiguration("quotaTracker.statusBarPriority"))&&t.recreate()}})),a.subscriptions.push(m.workspace.onDidSaveTextDocument(()=>{let s=e.settings;s.refreshInterval>0&&s.refreshInterval<300&&e.refresh()})),a.subscriptions.push(m.window.onDidChangeWindowState(s=>{s.focused&&e.checkActiveModel()})),a.subscriptions.push(new m.Disposable(()=>{e.dispose(),t.dispose(),o.dispose()})),console.log("[QuotaTracker] Activated \u2713")}function ce(){console.log("[QuotaTracker] Deactivated")}0&&(module.exports={activate,deactivate});
//# sourceMappingURL=extension.js.map
