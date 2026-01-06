/// <reference types="vite/client" />
import { allowServiceWorker } from "./canUse.js";
export {};

(async function () {
	const scope = new URL("./", location.href).toString();
	if (import.meta.env.DEV) {
		if (allowServiceWorker()) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			// Only unregister the JIT service worker, not the PWA service worker
			const jitWorker = registrations.find(registration => {
				const scriptURL = registration?.active?.scriptURL;
				return scriptURL && scriptURL.includes('service-worker.js') && !scriptURL.includes('pwa-sw.js');
			});
			await jitWorker?.unregister();
		}
		return;
	}

	const globalText = {
		SERVICE_WORKER_NOT_SUPPORT: ["无法启用即时编译功能", "您使用的客户端或浏览器不支持启用serviceWorker"].join("\n"),
		SERVICE_WORKER_LOAD_FAILED: ["无法启用即时编译功能", "serviceWorker加载失败"].join("\n"),
	};

	if (!allowServiceWorker()) {
		console.warn(globalText.SERVICE_WORKER_NOT_SUPPORT);
		return;
	}

	// 初次加载worker，需要重新启动一次
	if (sessionStorage.getItem("isJITReloaded") !== "true") {
		const registrations = await navigator.serviceWorker.getRegistrations();
		// Only unregister the JIT service worker, not the PWA service worker
		const jitWorker = registrations.find(registration => {
			const scriptURL = registration?.active?.scriptURL;
			return scriptURL && scriptURL.includes('service-worker.js') && !scriptURL.includes('pwa-sw.js');
		});
		await jitWorker?.unregister();
		sessionStorage.setItem("isJITReloaded", "true");
		window.location.reload();
		return;
	}

	try {
		console.log('[JIT] Registering JIT service worker...');
		await navigator.serviceWorker.register(`${scope}service-worker.js`, {
			type: "module",
			updateViaCache: "all",
			scope,
		});
		console.log('[JIT] Service worker registered successfully');
		// 接收消息
		navigator.serviceWorker.addEventListener("message", e => {
			if (e.data?.type === "reload") {
				console.log('[JIT] Reload message received, reloading page...');
				window.location.reload();
			}
		});
		// 发送消息
		// navigator.serviceWorker.controller?.postMessage({ action: "reload" });
		// await registration.update().catch(e => console.error("worker update失败", e));
		if (sessionStorage.getItem("canUseTs") !== "true") {
			const path = new URL("jit/canUse.ts", scope).href;
			console.log((await import(/* @vite-ignore */ path)).text);
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
