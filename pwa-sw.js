// PWA Service Worker for 无名杀
// This service worker handles caching for offline support

const CACHE_NAME = 'noname-pwa-v1';
const STATIC_CACHE_NAME = 'noname-static-v1';
const DYNAMIC_CACHE_NAME = 'noname-dynamic-v1';

// Get the base path from the service worker's location
// This allows the PWA to work in subdirectories (e.g., /nonamekill/ on GitHub Pages)
function getBasePath() {
	const swPath = self.location.pathname;
	const lastSlash = swPath.lastIndexOf('/');
	return lastSlash > 0 ? swPath.substring(0, lastSlash + 1) : '/';
}

// Core files to cache immediately on install (relative to base path)
const CORE_ASSETS = [
	'',
	'index.html',
	'noname.js',
	'manifest.webmanifest',
	'game/config.js',
	'game/asset.js',
	'game/package.js',
	'noname/entry.js'
];

// Static assets patterns to cache
const STATIC_EXTENSIONS = [
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico',
	'.mp3', '.ogg', '.wav',
	'.woff', '.woff2', '.ttf', '.eot',
	'.css'
];

// Dynamic content patterns (JS files that may change)
const DYNAMIC_EXTENSIONS = ['.js', '.ts', '.mjs'];

// Install event - precache essential files
self.addEventListener('install', (event) => {
	console.log('[PWA SW] Installing...');
	const basePath = getBasePath();
	const PRECACHE_ASSETS = CORE_ASSETS.map(asset => basePath + asset);
	
	event.waitUntil(
		caches.open(CACHE_NAME)
			.then(cache => {
				console.log('[PWA SW] Pre-caching core assets');
				return cache.addAll(PRECACHE_ASSETS);
			})
			.then(() => {
				console.log('[PWA SW] Installation complete');
				return self.skipWaiting();
			})
			.catch(err => {
				console.error('[PWA SW] Pre-cache failed:', err);
			})
	);
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
	console.log('[PWA SW] Activating...');
	event.waitUntil(
		caches.keys()
			.then(cacheNames => {
				return Promise.all(
					cacheNames
						.filter(cacheName => {
							// Delete old versioned caches
							return cacheName.startsWith('noname-') &&
								cacheName !== CACHE_NAME &&
								cacheName !== STATIC_CACHE_NAME &&
								cacheName !== DYNAMIC_CACHE_NAME;
						})
						.map(cacheName => {
							console.log('[PWA SW] Deleting old cache:', cacheName);
							return caches.delete(cacheName);
						})
				);
			})
			.then(() => {
				console.log('[PWA SW] Claiming clients');
				return self.clients.claim();
			})
	);
});

// Helper function to determine cache strategy
function getCacheStrategy(url) {
	const pathname = url.pathname;

	// WebSocket connections should never be cached
	if (url.protocol === 'ws:' || url.protocol === 'wss:') {
		return 'network-only';
	}

	// API calls and dynamic data - network first
	if (pathname.includes('/api/') || pathname.includes('/server/')) {
		return 'network-only';
	}

	// Static assets (images, audio, fonts) - cache first
	if (STATIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
		return 'cache-first';
	}

	// JavaScript files - network first with cache fallback
	if (DYNAMIC_EXTENSIONS.some(ext => pathname.endsWith(ext))) {
		return 'network-first';
	}

	// HTML files - network first
	if (pathname.endsWith('.html') || pathname === '/') {
		return 'network-first';
	}

	// Default to network first
	return 'network-first';
}

// Cache-first strategy
async function cacheFirst(request, cacheName) {
	const cachedResponse = await caches.match(request);
	if (cachedResponse) {
		return cachedResponse;
	}

	try {
		const networkResponse = await fetch(request);
		if (networkResponse.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, networkResponse.clone());
		}
		return networkResponse;
	} catch (error) {
		console.error('[PWA SW] Cache-first fetch failed:', error);
		throw error;
	}
}

// Network-first strategy
async function networkFirst(request, cacheName) {
	try {
		const networkResponse = await fetch(request);
		if (networkResponse.ok) {
			const cache = await caches.open(cacheName);
			cache.put(request, networkResponse.clone());
		}
		return networkResponse;
	} catch (error) {
		console.log('[PWA SW] Network failed, trying cache:', request.url);
		const cachedResponse = await caches.match(request);
		if (cachedResponse) {
			return cachedResponse;
		}
		throw error;
	}
}

// Fetch event - intercept and handle requests
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip non-http(s) requests
	if (!url.protocol.startsWith('http')) {
		return;
	}

	// Skip cross-origin requests (except for CDN resources)
	if (url.origin !== self.location.origin) {
		// Allow caching for known CDN resources
		const allowedOrigins = [
			'fonts.googleapis.com',
			'fonts.gstatic.com',
			'cdn.jsdelivr.net'
		];
		if (!allowedOrigins.some(origin => url.hostname.includes(origin))) {
			return;
		}
	}

	const strategy = getCacheStrategy(url);

	if (strategy === 'network-only') {
		return; // Let the browser handle it normally
	}

	event.respondWith(
		(async () => {
			try {
				if (strategy === 'cache-first') {
					return await cacheFirst(event.request, STATIC_CACHE_NAME);
				} else {
					return await networkFirst(event.request, DYNAMIC_CACHE_NAME);
				}
			} catch (error) {
				console.error('[PWA SW] Fetch handler error:', error);
				// Return offline page or error response
				const offlineResponse = await caches.match('/');
				if (offlineResponse) {
					return offlineResponse;
				}
				return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
			}
		})()
	);
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}

	if (event.data && event.data.type === 'CLEAR_CACHE') {
		event.waitUntil(
			caches.keys().then(cacheNames => {
				return Promise.all(
					cacheNames.map(cacheName => caches.delete(cacheName))
				);
			}).then(() => {
				console.log('[PWA SW] All caches cleared');
			})
		);
	}
});
