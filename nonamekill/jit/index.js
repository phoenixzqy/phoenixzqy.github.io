import { allowServiceWorker } from "./canUse.js";
(async function() {
  const scope = new URL("./", location.href).toString();
  if (false) {
    if (allowServiceWorker()) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const jitWorker = registrations.find((registration) => {
        const scriptURL = registration?.active?.scriptURL;
        return scriptURL && scriptURL.includes("service-worker.js") && !scriptURL.includes("pwa-sw.js");
      });
      await jitWorker?.unregister();
    }
    return;
  }
  const globalText = {
    SERVICE_WORKER_NOT_SUPPORT: ["无法启用即时编译功能", "您使用的客户端或浏览器不支持启用serviceWorker"].join("\n"),
    SERVICE_WORKER_LOAD_FAILED: ["无法启用即时编译功能", "serviceWorker加载失败"].join("\n")
  };
  if (!allowServiceWorker()) {
    console.warn(globalText.SERVICE_WORKER_NOT_SUPPORT);
    return;
  }
  if (sessionStorage.getItem("isJITReloaded") !== "true") {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const jitWorker = registrations.find((registration) => {
      const scriptURL = registration?.active?.scriptURL;
      return scriptURL && scriptURL.includes("service-worker.js") && !scriptURL.includes("pwa-sw.js");
    });
    await jitWorker?.unregister();
    sessionStorage.setItem("isJITReloaded", "true");
    window.location.reload();
    return;
  }
  try {
    console.log("[JIT] Registering JIT service worker...");
    await navigator.serviceWorker.register(`${scope}service-worker.js`, {
      type: "module",
      updateViaCache: "all",
      scope
    });
    console.log("[JIT] Service worker registered successfully");
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data?.type === "reload") {
        console.log("[JIT] Reload message received, reloading page...");
        window.location.reload();
      }
    });
    if (sessionStorage.getItem("canUseTs") !== "true") {
      const path = "/jit/canUse.ts";
      console.log((await import(
        /* @vite-ignore */
        path
      )).text);
      sessionStorage.setItem("canUseTs", "true");
    }
  } catch (e) {
    if (sessionStorage.getItem("canUseTs") === "false") {
      console.log("serviceWorker加载失败: ", e);
      console.warn(globalText.SERVICE_WORKER_LOAD_FAILED);
    } else {
      sessionStorage.setItem("canUseTs", "false");
      window.location.reload();
    }
  }
})();
