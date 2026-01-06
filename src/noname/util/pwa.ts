// PWA Service Worker Registration
// This file handles the registration and updates of the PWA service worker

export async function registerPWAServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!('serviceWorker' in navigator)) {
		console.log('[PWA] Service workers are not supported');
		return null;
	}

	try {
		const registration = await navigator.serviceWorker.register('/pwa-sw.js', {
			scope: '/',
			type: 'module'
		});

		console.log('[PWA] Service Worker registered with scope:', registration.scope);

		// Check for updates
		registration.addEventListener('updatefound', () => {
			const newWorker = registration.installing;
			if (newWorker) {
				console.log('[PWA] New Service Worker installing...');
				newWorker.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						// New content is available, notify user
						console.log('[PWA] New content available, please refresh');
						showUpdateNotification(registration);
					}
				});
			}
		});

		return registration;
	} catch (error) {
		console.error('[PWA] Service Worker registration failed:', error);
		return null;
	}
}

// Show update notification to user
function showUpdateNotification(registration: ServiceWorkerRegistration): void {
	// Create a simple notification UI
	const notification = document.createElement('div');
	notification.id = 'pwa-update-notification';
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

	// Add animation keyframes
	const style = document.createElement('style');
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

	// Update button handler
	const updateBtn = document.getElementById('pwa-update-btn');
	if (updateBtn) {
		updateBtn.addEventListener('click', () => {
			// Tell the new service worker to take over
			if (registration.waiting) {
				registration.waiting.postMessage({ type: 'SKIP_WAITING' });
			}
			// Reload the page
			window.location.reload();
		});
	}

	// Dismiss button handler
	const dismissBtn = document.getElementById('pwa-dismiss-btn');
	if (dismissBtn) {
		dismissBtn.addEventListener('click', () => {
			notification.remove();
			style.remove();
		});
	}
}

// Check if app is running as installed PWA
export function isPWAInstalled(): boolean {
	// Check display-mode
	if (window.matchMedia('(display-mode: standalone)').matches) {
		return true;
	}
	// Check iOS standalone mode
	if ((navigator as any).standalone === true) {
		return true;
	}
	// Check if launched from home screen on Android
	if (document.referrer.includes('android-app://')) {
		return true;
	}
	return false;
}

// Request to clear all caches
export async function clearPWACache(): Promise<void> {
	if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
		navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
	}
	// Also clear caches directly
	if ('caches' in window) {
		const cacheNames = await caches.keys();
		await Promise.all(cacheNames.map(name => caches.delete(name)));
		console.log('[PWA] All caches cleared');
	}
}

// Show install prompt for browsers that support it
let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function setupInstallPrompt(): void {
	window.addEventListener('beforeinstallprompt', (e: Event) => {
		// Prevent the mini-infobar from appearing on mobile
		e.preventDefault();
		// Stash the event so it can be triggered later
		deferredPrompt = e as BeforeInstallPromptEvent;
		console.log('[PWA] Install prompt available');
		// Optionally show your own install button
		showInstallButton();
	});

	window.addEventListener('appinstalled', () => {
		console.log('[PWA] App was installed');
		deferredPrompt = null;
		hideInstallButton();
	});
}

function showInstallButton(): void {
	// You can implement a custom install button here
	// This is just a placeholder - integrate with your UI
	console.log('[PWA] Install button can be shown');
}

function hideInstallButton(): void {
	const installBtn = document.getElementById('pwa-install-btn');
	if (installBtn) {
		installBtn.remove();
	}
}

export async function triggerInstallPrompt(): Promise<boolean> {
	if (!deferredPrompt) {
		console.log('[PWA] No install prompt available');
		return false;
	}

	// Show the install prompt
	await deferredPrompt.prompt();
	
	// Wait for the user to respond
	const { outcome } = await deferredPrompt.userChoice;
	console.log('[PWA] User response to install prompt:', outcome);
	
	// Clear the deferred prompt
	deferredPrompt = null;
	
	return outcome === 'accepted';
}

// ========== Screen Wake Lock API ==========
// Prevents the screen from turning off during gameplay
// Especially important for PWA on iOS/Safari

interface WakeLockSentinel extends EventTarget {
	released: boolean;
	type: 'screen';
	release(): Promise<void>;
}

interface NavigatorWakeLock {
	request(type: 'screen'): Promise<WakeLockSentinel>;
}

declare global {
	interface Navigator {
		wakeLock?: NavigatorWakeLock;
	}
}

let wakeLockSentinel: WakeLockSentinel | null = null;
let wakeLockEnabled = false;

/**
 * Check if Screen Wake Lock API is supported
 */
export function isWakeLockSupported(): boolean {
	return 'wakeLock' in navigator;
}

/**
 * Request a screen wake lock to keep the screen on
 * This should be called when gameplay starts
 */
export async function requestWakeLock(): Promise<boolean> {
	if (!isWakeLockSupported()) {
		console.log('[PWA] Screen Wake Lock API is not supported');
		// Fallback: try to keep screen on using video element (works on some iOS versions)
		startNoSleepFallback();
		return false;
	}

	try {
		wakeLockSentinel = await navigator.wakeLock!.request('screen');
		wakeLockEnabled = true;
		console.log('[PWA] Screen Wake Lock acquired');

		// Listen for release event (e.g., when tab becomes hidden)
		wakeLockSentinel.addEventListener('release', () => {
			console.log('[PWA] Screen Wake Lock was released');
			wakeLockEnabled = false;
			wakeLockSentinel = null;
		});

		// Re-acquire wake lock when page becomes visible again
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return true;
	} catch (err) {
		console.error('[PWA] Failed to acquire Screen Wake Lock:', err);
		// Fallback for older browsers
		startNoSleepFallback();
		return false;
	}
}

/**
 * Release the screen wake lock
 * This should be called when gameplay ends or app is closed
 */
export async function releaseWakeLock(): Promise<void> {
	stopNoSleepFallback();
	document.removeEventListener('visibilitychange', handleVisibilityChange);

	if (wakeLockSentinel) {
		try {
			await wakeLockSentinel.release();
			console.log('[PWA] Screen Wake Lock released');
		} catch (err) {
			console.error('[PWA] Failed to release Screen Wake Lock:', err);
		}
		wakeLockSentinel = null;
		wakeLockEnabled = false;
	}
}

/**
 * Handle visibility change to re-acquire wake lock when page becomes visible
 * This is important because wake lock is automatically released when page is hidden
 */
async function handleVisibilityChange(): Promise<void> {
	if (document.visibilityState === 'visible' && wakeLockEnabled && !wakeLockSentinel) {
		// Re-acquire wake lock when page becomes visible
		try {
			wakeLockSentinel = await navigator.wakeLock!.request('screen');
			console.log('[PWA] Screen Wake Lock re-acquired after visibility change');
			
			wakeLockSentinel.addEventListener('release', () => {
				console.log('[PWA] Screen Wake Lock was released');
				wakeLockSentinel = null;
			});
		} catch (err) {
			console.error('[PWA] Failed to re-acquire Screen Wake Lock:', err);
		}
	}
}

/**
 * Check if wake lock is currently active
 */
export function isWakeLockActive(): boolean {
	return wakeLockSentinel !== null && !wakeLockSentinel.released;
}

// ========== NoSleep Fallback for older browsers ==========
// Uses a hidden video element to prevent screen from sleeping
// This is a workaround for browsers that don't support Wake Lock API

let noSleepVideo: HTMLVideoElement | null = null;
let noSleepEnabled = false;

/**
 * Create a silent video that loops to prevent screen sleep
 * This works on iOS Safari and some older browsers
 */
function startNoSleepFallback(): void {
	if (noSleepEnabled) return;

	// Create a small, silent video element
	// The video needs to be a valid video file to work on iOS
	// Using a data URI of a minimal MP4 file
	const SILENT_VIDEO_BASE64 = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhmcmVlAAAASm1kYXQAAAAaAAABoBhAQ//oACAAAAwgAAAAAAAAAAAAAAAAAAAAACgAH//4AAAAFgIQC//OEAAAAAAAAAAAAAAAAAAAATgAAAA5tZGF0AAACoAYQEP/6AAgAAAMIAAAAAAAAAAAAAAAAAAAAA';
	
	try {
		noSleepVideo = document.createElement('video');
		noSleepVideo.setAttribute('playsinline', '');
		noSleepVideo.setAttribute('muted', '');
		noSleepVideo.setAttribute('loop', '');
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
		
		// Play the video (must be triggered by user interaction on iOS)
		const playPromise = noSleepVideo.play();
		if (playPromise !== undefined) {
			playPromise
				.then(() => {
					console.log('[PWA] NoSleep fallback video started');
					noSleepEnabled = true;
				})
				.catch((err) => {
					console.log('[PWA] NoSleep fallback failed (requires user interaction):', err);
					// Will try again on user interaction
					document.addEventListener('click', tryStartNoSleep, { once: true });
					document.addEventListener('touchstart', tryStartNoSleep, { once: true });
				});
		}
	} catch (err) {
		console.error('[PWA] Failed to create NoSleep fallback:', err);
	}
}

function tryStartNoSleep(): void {
	if (noSleepVideo && !noSleepEnabled) {
		noSleepVideo.play()
			.then(() => {
				console.log('[PWA] NoSleep fallback started after user interaction');
				noSleepEnabled = true;
			})
			.catch((err) => {
				console.error('[PWA] NoSleep fallback failed:', err);
			});
	}
}

function stopNoSleepFallback(): void {
	if (noSleepVideo) {
		noSleepVideo.pause();
		noSleepVideo.remove();
		noSleepVideo = null;
		noSleepEnabled = false;
		console.log('[PWA] NoSleep fallback stopped');
	}
}
