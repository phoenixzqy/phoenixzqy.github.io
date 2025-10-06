(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))r(n);new MutationObserver(n=>{for(const o of n)if(o.type==="childList")for(const i of o.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&r(i)}).observe(document,{childList:!0,subtree:!0});function t(n){const o={};return n.integrity&&(o.integrity=n.integrity),n.referrerPolicy&&(o.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?o.credentials="include":n.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function r(n){if(n.ep)return;n.ep=!0;const o=t(n);fetch(n.href,o)}})();const a="1.0.0";function l(){return window.self!==window.parent}function c(){return window.location.hostname==="localhost"}function d(){return!l()&&!c()}const g=new Set(["html"]);function h(s){return s?g.has(s.toLowerCase()):!0}function u(){return"production"}class p{config;callbacks;constructor(e,t={}){this.config=e,this.callbacks=t,this.init()}init(){window.addEventListener("message",this.handleIncomingMessage.bind(this)),this.sendInitEvent()}sendInitEvent(){const e={status:"ready",version:this.getVersion(),capabilities:["updateScript","logging"],environment:u()};this.sendToParent({type:"sandbox-init",payload:e,timestamp:Date.now()}),this.log("info","Bridge initialized and init event sent")}handleIncomingMessage(e){if(!this.isValidOrigin(e.origin)){this.log("error","Invalid origin received",{received:e.origin,expected:this.config.allowedOrigins});return}const t=e.data;switch(this.log("debug","Received message from parent",{type:t.type,requestId:t.requestId}),t.type){case"updateScript":this.handleUpdateScript(t.payload,t.requestId);break;default:this.log("error","Unknown message type received",{type:t.type})}}handleUpdateScript(e,t){try{if(this.log("info","Processing updateScript request",{hasSourceScript:!!e.sourceScript,metadata:e.metadata}),!e.sourceScript||typeof e.sourceScript!="string")throw new Error("Invalid source script content provided");if(!h(e.metadata?.language))throw new Error("Unsupported language provided");this.callbacks.onUpdateScript?(this.callbacks.onUpdateScript?.(e),this.log("debug",`Script update requested: ${e.sourceScript.length} chars`)):this.log("error","No onUpdateScript callback provided to handle script update"),this.sendArtifactLoaded({status:"loaded",metadata:{loadTime:Date.now(),size:e.sourceScript.length}},t),this.log("info","Script updated successfully",{size:e.sourceScript.length})}catch(r){const n=r instanceof Error?r.message:"Unknown error";this.log("error","Failed to update script",{error:n}),this.sendError({error:n,code:"SCRIPT_UPDATE_FAILED",context:{requestId:t}},t)}}log(e,t,r){if((e==="error"?console.error:e==="debug"?console.debug:console.log)({message:`[Bridge:${e.toUpperCase()}] ${t}`,data:r}),this.shouldSendLog(e)){const o={level:e,message:t,data:r,source:"userContentSandbox-bridge"};this.sendToParent({type:"log",payload:o,timestamp:Date.now()})}}sendArtifactLoaded(e,t){this.sendToParent({type:"artifact-loaded",payload:e,timestamp:Date.now(),requestId:t}),this.callbacks.onArtifactLoaded&&this.callbacks.onArtifactLoaded(e)}sendError(e,t){this.sendToParent({type:"error",payload:e,timestamp:Date.now(),requestId:t}),this.callbacks.onError&&this.callbacks.onError(e)}sendToParent(e){const t=this.getParentOrigin();if(window.parent&&t)try{window.parent.postMessage(e,t)}catch(r){console.error("Failed to send message to parent:",r)}else console.warn("Cannot send message: no parent window or origin")}getParentOrigin(){if(window.location.ancestorOrigins&&window.location.ancestorOrigins.length>0)return window.location.ancestorOrigins[0];if(document.referrer)try{return new URL(document.referrer).origin}catch(e){return console.error("Error parsing referrer:",e),null}return null}isValidOrigin(e){return this.config.allowedOrigins.includes(e)}shouldSendLog(e){if(!this.config.logLevel)return!0;const t=["debug","info","error"],r=t.indexOf(this.config.logLevel);return t.indexOf(e)>=r}getVersion(){return a}}class f{state;config;callbacks;container=null;floatingButton=null;drawer=null;resizeHandle=null;isResizing=!1;resizeStartY=0;resizeStartHeight=0;constructor(e={},t={}){this.config={maxLogs:1e3,enabledLevels:["log","info","warn","error","debug"],drawerMinHeight:200,drawerMaxHeight:.8,buttonPosition:{bottom:"20px",right:"20px"},...e},this.callbacks=t,this.state={logs:[],counts:{info:0,error:0,warn:0,debug:0,log:0},isDrawerOpen:!1,drawerHeight:this.config.drawerMinHeight||200,maxLogs:this.config.maxLogs||1e3},this.init()}init(){this.createDOM(),this.setupMessageListener(),this.setupEventListeners(),this.updateFloatingButton()}createDOM(){this.container=document.createElement("div"),this.container.className="console-logger",this.container.innerHTML=`
      <div class="console-logger-button" id="console-logger-button">
        <div class="log-counts">
          <div class="info-count-container">
            <svg class="info-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M12.0016 1.99902C17.5253 1.99902 22.0031 6.47687 22.0031 12.0006C22.0031 17.5243 17.5253 22.0021 12.0016 22.0021C6.47785 22.0021 2 17.5243 2 12.0006C2 6.47687 6.47785 1.99902 12.0016 1.99902ZM12.0016 3.49902C7.30627 3.49902 3.5 7.3053 3.5 12.0006C3.5 16.6959 7.30627 20.5021 12.0016 20.5021C16.6968 20.5021 20.5031 16.6959 20.5031 12.0006C20.5031 7.3053 16.6968 3.49902 12.0016 3.49902ZM12 10.5C12.4142 10.5 12.75 10.8358 12.75 11.25V16.25C12.75 16.6642 12.4142 17 12 17C11.5858 17 11.25 16.6642 11.25 16.25V11.25C11.25 10.8358 11.5858 10.5 12 10.5ZM12 9C12.5523 9 13 8.55229 13 8C13 7.44772 12.5523 7 12 7C11.4477 7 11 7.44772 11 8C11 8.55229 11.4477 9 12 9Z" />
            </svg>
            <span class="info-count">0</span>
          </div>
          <div class="error-count-container">
            <svg class="error-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12">
              <path d="M6,12c3.3,0,6-2.7,6-6S9.3,0,6,0S0,2.7,0,6S2.7,12,6,12z M5,3c0-0.6,0.4-1,1-1s1,0.4,1,1v3c0,0.6-0.4,1-1,1  S5,6.6,5,6V3z M5.2,8.2C5.4,8,5.7,7.9,6,7.9S6.6,8,6.8,8.2C7,8.4,7.1,8.7,7.1,9c0,0.3-0.1,0.6-0.3,0.8C6.6,10,6.3,10.1,6,10.1  S5.4,10,5.2,9.8C5,9.6,4.9,9.3,4.9,9C4.9,8.7,5,8.4,5.2,8.2z" fill="currentColor" />
              <rect fill="none" />
            </svg>
            <span class="error-count">0</span>
          </div>
        </div>
      </div>
      <div class="console-logger-drawer" id="console-logger-drawer">
        <div class="drawer-header">
          <h3>Console Logs</h3>
          <div class="drawer-controls">
            <button class="close-drawer-btn" id="close-drawer-btn">×</button>
          </div>
        </div>
        <div class="drawer-resize-handle" id="drawer-resize-handle"></div>
        <div class="logs-container" id="logs-container">
          <div class="no-logs">No console logs yet</div>
        </div>
      </div>
    `,this.floatingButton=this.container.querySelector("#console-logger-button"),this.drawer=this.container.querySelector("#console-logger-drawer"),this.resizeHandle=this.container.querySelector("#drawer-resize-handle"),document.body.appendChild(this.container)}setupMessageListener(){window.addEventListener("message",e=>{if(e.data&&e.data.type==="iframe-console-log"){const t=e.data;this.addLogEntry(t.payload)}})}setupEventListeners(){this.floatingButton?.addEventListener("click",()=>{this.toggleDrawer()}),this.container?.querySelector("#close-drawer-btn")?.addEventListener("click",()=>{this.closeDrawer()}),this.setupResizeHandlers()}setupResizeHandlers(){this.resizeHandle?.addEventListener("mousedown",e=>{this.isResizing=!0,this.resizeStartY=e.clientY,this.resizeStartHeight=this.state.drawerHeight,document.addEventListener("mousemove",this.handleResize),document.addEventListener("mouseup",this.handleResizeEnd),e.preventDefault()})}handleResize=e=>{if(!this.isResizing||!this.drawer)return;const t=this.resizeStartY-e.clientY,r=this.resizeStartHeight+t,n=this.config.drawerMinHeight||200,o=typeof this.config.drawerMaxHeight=="number"?this.config.drawerMaxHeight>1?this.config.drawerMaxHeight:window.innerHeight*this.config.drawerMaxHeight:window.innerHeight*.8,i=Math.max(n,Math.min(r,o));this.state.drawerHeight=i,this.drawer.style.height=`${i}px`};handleResizeEnd=()=>{this.isResizing=!1,document.removeEventListener("mousemove",this.handleResize),document.removeEventListener("mouseup",this.handleResizeEnd)};addLogEntry(e){const t={id:`log-${Date.now()}-${Math.random().toString(36).substr(2,9)}`,level:e.level,message:e.message,args:e.args,timestamp:e.timestamp,stackTrace:e.stackTrace};if(this.state.logs.push(t),this.state.counts[t.level]++,this.state.logs.length>this.state.maxLogs){const r=this.state.logs.shift();r&&this.state.counts[r.level]--}this.updateFloatingButton(),this.updateLogsDisplay(),this.callbacks.onLogReceived?.(t)}updateFloatingButton(){if(!this.floatingButton)return;if(this.state.logs.length===0){this.floatingButton.style.display="none";return}this.floatingButton.style.display="flex";const t=this.floatingButton.querySelector(".info-count"),r=this.floatingButton.querySelector(".error-count");if(t){const n=this.state.counts.info+this.state.counts.log+this.state.counts.debug;t.textContent=n.toString()}if(r){const n=this.state.counts.error+this.state.counts.warn;r.textContent=n.toString()}}updateLogsDisplay(){const e=this.container?.querySelector("#logs-container");if(!e)return;if(this.state.logs.length===0){e.innerHTML='<div class="no-logs">No console logs yet</div>';return}const t=this.state.logs.slice(-100).map(r=>this.formatLogEntry(r)).join("");e.innerHTML=t,e.scrollTop=e.scrollHeight}formatLogEntry(e){const t=new Date(e.timestamp).toLocaleTimeString(),r=`log-level-${e.level}`,n=e.args.length>0?JSON.stringify(e.args,null,2):"";return`
      <div class="log-entry ${r}">
        <div class="log-header">
          <span class="log-level">${e.level.toUpperCase()}</span>
          <span class="log-timestamp">${t}</span>
        </div>
        <div class="log-message">${this.escapeHtml(e.message)}</div>
        ${n?`<div class="log-args"><pre>${this.escapeHtml(n)}</pre></div>`:""}
        ${e.stackTrace?`<div class="log-stack"><pre>${this.escapeHtml(e.stackTrace)}</pre></div>`:""}
      </div>
    `}escapeHtml(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}toggleDrawer(){this.state.isDrawerOpen?this.closeDrawer():this.openDrawer()}openDrawer(){this.drawer&&(this.state.isDrawerOpen=!0,this.drawer.classList.add("open"),this.drawer.style.height=`${this.state.drawerHeight}px`,this.updateLogsDisplay(),this.callbacks.onDrawerToggle?.(!0))}closeDrawer(){this.drawer&&(this.state.isDrawerOpen=!1,this.drawer.classList.remove("open"),this.callbacks.onDrawerToggle?.(!1))}getLogCounts(){return{...this.state.counts}}getLogs(){return[...this.state.logs]}clearLogs(){this.state.logs=[],this.state.counts={info:0,error:0,warn:0,debug:0,log:0},this.updateFloatingButton(),this.updateLogsDisplay(),this.closeDrawer()}destroy(){this.container?.remove(),window.removeEventListener("message",this.setupMessageListener),document.removeEventListener("mousemove",this.handleResize),document.removeEventListener("mouseup",this.handleResizeEnd)}}class m{parentOrigin=null;innerFrame=null;isInitialized=!1;bridge;constructor(){new f({maxLogs:1e3,drawerMinHeight:200,buttonPosition:{bottom:"20px",right:"20px"}},{onLogReceived:e=>{this.bridge?.log("debug",`Console log received: ${e.level}`,{message:e.message,timestamp:e.timestamp})}}),this.init()}init(){if(d()){this.handleDirectAccess();return}const e={allowedOrigins:["https://localhost:3000","https://copilot.microsoft.com","https://copilot.com","https://copilot-stg.com","null"],logLevel:"info"};this.bridge=new p(e,{onUpdateScript:this.handleUpdateScript.bind(this),onLog:t=>console.log("Bridge log:",t),onError:t=>console.error("Bridge error:",t)}),this.parentOrigin=this.bridge.getParentOrigin(),this.isInitialized=!0,this.updateLoadingState(!0),console.log("✅ User Content Sandbox ready, parent origin:",this.parentOrigin)}handleUpdateScript(e){this.bridge.log("info","Handling updateScript via bridge contract"),this.loadArtifact(e.sourceScript)}loadArtifact(e,t){try{if(!e)throw new Error("No source script content provided");this.bridge.log("info","Loading artifact",{size:e.length}),this.createInnerFrame(e),this.bridge.sendArtifactLoaded({status:"loaded",metadata:{loadTime:Date.now(),size:e.length}},t),this.updateLoadingState(!1)}catch(r){const n=r instanceof Error?r.message:"Unknown error";this.bridge.log("error","Failed to load artifact",{error:n}),this.bridge.sendError({error:n,code:"ARTIFACT_LOAD_FAILED",context:{requestId:t}},t)}}createInnerFrame(e){this.innerFrame&&this.innerFrame.remove(),this.bridge.log("debug","Creating sandboxed inner frame",{sourceScriptSize:e.length});const t=`
      <script>
        (function() {
          // Store original console methods
          const originalConsole = {
            log: console.log,
            info: console.info,
            warn: console.warn,
            error: console.error,
            debug: console.debug
          };

          // Function to send logs to parent
          function sendLogToParent(level, message, args) {
            try {
              const logData = {
                type: 'iframe-console-log',
                payload: {
                  level: level,
                  message: String(message),
                  args: args.map(arg => {
                    try {
                      return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
                    } catch (e) {
                      return '[Circular or Non-serializable]';
                    }
                  }),
                  timestamp: Date.now(),
                  stackTrace: level === 'error' ? new Error().stack : undefined
                }
              };

              window.parent.postMessage(logData, '*');
            } catch (e) {
              // Fallback to original console if postMessage fails
              originalConsole[level].apply(console, [message, ...args]);
            }
          }

          // Override console methods
          console.log = function(...args) {
            originalConsole.log.apply(console, args);
            sendLogToParent('log', args[0] || '', args.slice(1));
          };

          console.info = function(...args) {
            originalConsole.info.apply(console, args);
            sendLogToParent('info', args[0] || '', args.slice(1));
          };

          console.warn = function(...args) {
            originalConsole.warn.apply(console, args);
            sendLogToParent('warn', args[0] || '', args.slice(1));
          };

          console.error = function(...args) {
            originalConsole.error.apply(console, args);
            sendLogToParent('error', args[0] || '', args.slice(1));
          };

          console.debug = function(...args) {
            originalConsole.debug.apply(console, args);
            sendLogToParent('debug', args[0] || '', args.slice(1));
          };

          // Catch unhandled errors
          window.addEventListener('error', function(event) {
            sendLogToParent('error', event.message, [
              'Error in ' + event.filename + ':' + event.lineno + ':' + event.colno,
              event.error ? event.error.stack : ''
            ]);
          });

          // Catch unhandled promise rejections
          window.addEventListener('unhandledrejection', function(event) {
            sendLogToParent('error', 'Unhandled Promise Rejection', [
              event.reason ? String(event.reason) : 'Unknown reason'
            ]);
          });
        })();
      <\/script>
    `,r=e.replace(/<head>/i,`<head>${t}`)||e.replace(/<html>/i,`<html><head>${t}</head>`)||`<html><head>${t}</head><body>${e}</body></html>`;this.innerFrame=document.createElement("iframe"),this.innerFrame.sandbox.add("allow-scripts"),this.innerFrame.srcdoc=r,this.innerFrame.style.cssText="width: 100%; height: 100%; border: none;",this.innerFrame.onload=()=>{this.bridge.log("info","Inner frame loaded successfully"),console.log("📦 Inner frame loaded with console logging")};const n=document.getElementById("userContentSandbox-container");n?(n.appendChild(this.innerFrame),this.bridge.log("debug","Inner frame appended to container")):this.bridge.log("error","User Content Sandbox container not found")}updateLoadingState(e){const t=document.getElementById("loading");t&&(t.style.display=e?"flex":"none")}showError(e){console.error("❌ User Content Sandbox Error:",e);const t=document.getElementById("userContentSandbox-container");t&&(t.innerHTML=`
        <div style="padding: 20px; color: red; font-family: monospace;">
          <h3>User Content Sandbox Error</h3>
          <p>${e}</p>
        </div>
      `)}handleDirectAccess(){const e="https://www.copilot.com/";window.location.href=e}getInitializationStatus(){return{isInitialized:this.isInitialized,parentOrigin:this.parentOrigin}}}document.addEventListener("DOMContentLoaded",()=>{new m});console.log("🌍 Environment:",{dev:!1,staging:!1,prod:!0});
