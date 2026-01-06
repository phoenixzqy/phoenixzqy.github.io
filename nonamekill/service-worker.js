import { RawResourceStrategy, WorkerResourceStrategy, UrlResourceStrategy, JSONStrategy, TSStrategy, CSSStrategy, VueSFCStrategy } from "./jit/compile-strategy.js";
const worker = globalThis;
worker.addEventListener("install", (event) => {
  console.log("[JIT SW] Installing...");
  worker.skipWaiting();
});
worker.addEventListener("activate", (event) => {
  console.log("[JIT SW] Activating...");
  event.waitUntil(
    worker.clients.claim().then(() => {
      console.log("[JIT SW] Service worker加载完成，重启页面");
      sendReload();
    })
  );
});
worker.addEventListener("message", (event) => {
  console.log(event.data);
  const { action } = event.data;
  switch (action) {
    case "reload":
      sendReload();
      break;
    // case "allowJs": {
    // 	const tsStrategy = strategies.find(i => i instanceof CompileStrategy.TSStrategy);
    // 	if (tsStrategy) tsStrategy.allowJs = event.data.enabled || false;
    // 	break;
    // }
    default:
      console.log("Unknown action");
  }
});
function sendReload() {
  worker.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: "reload" });
    });
  });
}
const strategies = [new RawResourceStrategy(), new WorkerResourceStrategy(), new UrlResourceStrategy(), new JSONStrategy(), new TSStrategy({ allowJs: false }), new CSSStrategy(), new VueSFCStrategy()];
const proxyedPath = ["/extension", "/jit"];
worker.addEventListener("fetch", (event) => {
  const request = event.request;
  if (typeof request.url !== "string") return;
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname)) return;
  if (!proxyedPath.some((i) => url.pathname.startsWith(i))) return;
  console.log("[JIT SW] Handling request:", url.pathname);
  const strategy = strategies.find((s) => s.match({ event, request, url }));
  if (strategy) {
    try {
      console.log("[JIT SW] Using strategy:", strategy.constructor.name);
      event.respondWith(strategy.process({ event, request, url }));
    } catch (e) {
      console.error("[JIT SW] Strategy processing failed for", request.url, e);
      event.respondWith(Response.error());
    }
  }
});
