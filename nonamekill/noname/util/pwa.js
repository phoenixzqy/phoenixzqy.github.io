async function registerPWAServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.log("[PWA] Service workers are not supported");
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register("/pwa-sw.js", {
      scope: "/",
      type: "module"
    });
    console.log("[PWA] Service Worker registered with scope:", registration.scope);
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        console.log("[PWA] New Service Worker installing...");
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            console.log("[PWA] New content available, please refresh");
            showUpdateNotification(registration);
          }
        });
      }
    });
    return registration;
  } catch (error) {
    console.error("[PWA] Service Worker registration failed:", error);
    return null;
  }
}
function showUpdateNotification(registration) {
  const notification = document.createElement("div");
  notification.id = "pwa-update-notification";
  notification.style.cssText = `
		position: fixed;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		padding: 16px 24px;
		border-radius: 12px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		z-index: 10000;
		display: flex;
		align-items: center;
		gap: 16px;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		font-size: 14px;
		animation: slideUp 0.3s ease-out;
	`;
  notification.innerHTML = `
		<span>有新版本可用!</span>
		<button id="pwa-update-btn" style="
			background: white;
			color: #667eea;
			border: none;
			padding: 8px 16px;
			border-radius: 6px;
			cursor: pointer;
			font-weight: bold;
			transition: transform 0.2s;
		">立即更新</button>
		<button id="pwa-dismiss-btn" style="
			background: transparent;
			color: white;
			border: 1px solid rgba(255,255,255,0.5);
			padding: 8px 16px;
			border-radius: 6px;
			cursor: pointer;
			transition: background 0.2s;
		">稍后</button>
	`;
  const style = document.createElement("style");
  style.textContent = `
		@keyframes slideUp {
			from {
				opacity: 0;
				transform: translateX(-50%) translateY(20px);
			}
			to {
				opacity: 1;
				transform: translateX(-50%) translateY(0);
			}
		}
	`;
  document.head.appendChild(style);
  document.body.appendChild(notification);
  const updateBtn = document.getElementById("pwa-update-btn");
  if (updateBtn) {
    updateBtn.addEventListener("click", () => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      window.location.reload();
    });
  }
  const dismissBtn = document.getElementById("pwa-dismiss-btn");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      notification.remove();
      style.remove();
    });
  }
}
function isPWAInstalled() {
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }
  if (navigator.standalone === true) {
    return true;
  }
  if (document.referrer.includes("android-app://")) {
    return true;
  }
  return false;
}
async function clearPWACache() {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "CLEAR_CACHE" });
  }
  if ("caches" in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    console.log("[PWA] All caches cleared");
  }
}
let deferredPrompt = null;
function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log("[PWA] Install prompt available");
    showInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    console.log("[PWA] App was installed");
    deferredPrompt = null;
    hideInstallButton();
  });
}
function showInstallButton() {
  console.log("[PWA] Install button can be shown");
}
function hideInstallButton() {
  const installBtn = document.getElementById("pwa-install-btn");
  if (installBtn) {
    installBtn.remove();
  }
}
async function triggerInstallPrompt() {
  if (!deferredPrompt) {
    console.log("[PWA] No install prompt available");
    return false;
  }
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log("[PWA] User response to install prompt:", outcome);
  deferredPrompt = null;
  return outcome === "accepted";
}
let wakeLockSentinel = null;
let wakeLockEnabled = false;
function isWakeLockSupported() {
  return "wakeLock" in navigator;
}
async function requestWakeLock() {
  if (!isWakeLockSupported()) {
    console.log("[PWA] Screen Wake Lock API is not supported");
    startNoSleepFallback();
    return false;
  }
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockEnabled = true;
    console.log("[PWA] Screen Wake Lock acquired");
    wakeLockSentinel.addEventListener("release", () => {
      console.log("[PWA] Screen Wake Lock was released");
      wakeLockEnabled = false;
      wakeLockSentinel = null;
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return true;
  } catch (err) {
    console.error("[PWA] Failed to acquire Screen Wake Lock:", err);
    startNoSleepFallback();
    return false;
  }
}
async function releaseWakeLock() {
  stopNoSleepFallback();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
      console.log("[PWA] Screen Wake Lock released");
    } catch (err) {
      console.error("[PWA] Failed to release Screen Wake Lock:", err);
    }
    wakeLockSentinel = null;
    wakeLockEnabled = false;
  }
}
async function handleVisibilityChange() {
  if (document.visibilityState === "visible" && wakeLockEnabled && !wakeLockSentinel) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request("screen");
      console.log("[PWA] Screen Wake Lock re-acquired after visibility change");
      wakeLockSentinel.addEventListener("release", () => {
        console.log("[PWA] Screen Wake Lock was released");
        wakeLockSentinel = null;
      });
    } catch (err) {
      console.error("[PWA] Failed to re-acquire Screen Wake Lock:", err);
    }
  }
}
function isWakeLockActive() {
  return wakeLockSentinel !== null && !wakeLockSentinel.released;
}
let noSleepVideo = null;
let noSleepEnabled = false;
function startNoSleepFallback() {
  if (noSleepEnabled) return;
  const SILENT_VIDEO_BASE64 = "data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhmcmVlAAAASm1kYXQAAAAaAAABoBhAQ//oACAAAAwgAAAAAAAAAAAAAAAAAAAAACgAH//4AAAAFgIQC//OEAAAAAAAAAAAAAAAAAAAATgAAAA5tZGF0AAACoAYQEP/6AAgAAAMIAAAAAAAAAAAAAAAAAAAAA";
  try {
    noSleepVideo = document.createElement("video");
    noSleepVideo.setAttribute("playsinline", "");
    noSleepVideo.setAttribute("muted", "");
    noSleepVideo.setAttribute("loop", "");
    noSleepVideo.style.cssText = `
			position: fixed;
			top: -9999px;
			left: -9999px;
			width: 1px;
			height: 1px;
			opacity: 0;
			pointer-events: none;
		`;
    noSleepVideo.src = SILENT_VIDEO_BASE64;
    noSleepVideo.muted = true;
    document.body.appendChild(noSleepVideo);
    const playPromise = noSleepVideo.play();
    if (playPromise !== void 0) {
      playPromise.then(() => {
        console.log("[PWA] NoSleep fallback video started");
        noSleepEnabled = true;
      }).catch((err) => {
        console.log("[PWA] NoSleep fallback failed (requires user interaction):", err);
        document.addEventListener("click", tryStartNoSleep, { once: true });
        document.addEventListener("touchstart", tryStartNoSleep, { once: true });
      });
    }
  } catch (err) {
    console.error("[PWA] Failed to create NoSleep fallback:", err);
  }
}
function tryStartNoSleep() {
  if (noSleepVideo && !noSleepEnabled) {
    noSleepVideo.play().then(() => {
      console.log("[PWA] NoSleep fallback started after user interaction");
      noSleepEnabled = true;
    }).catch((err) => {
      console.error("[PWA] NoSleep fallback failed:", err);
    });
  }
}
function stopNoSleepFallback() {
  if (noSleepVideo) {
    noSleepVideo.pause();
    noSleepVideo.remove();
    noSleepVideo = null;
    noSleepEnabled = false;
    console.log("[PWA] NoSleep fallback stopped");
  }
}
export {
  clearPWACache,
  isPWAInstalled,
  isWakeLockActive,
  isWakeLockSupported,
  registerPWAServiceWorker,
  releaseWakeLock,
  requestWakeLock,
  setupInstallPrompt,
  triggerInstallPrompt
};
