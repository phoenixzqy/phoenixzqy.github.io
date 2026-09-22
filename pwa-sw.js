// Keep the former worker URL available so installed game workers can retire.
// The current website never registers this worker, and it handles no fetches.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(retireLegacyGame().catch((error) => {
    console.error("Could not retire the legacy game service worker:", error);
    throw error;
  }));
});

async function retireLegacyGame() {
  await self.clients.claim();
  const cacheNames = await caches.keys();
  const gameCachePrefixes = ["noname-pwa-", "noname-static-", "noname-dynamic-"];
  await Promise.all(cacheNames
    .filter((name) => gameCachePrefixes.some((prefix) => name.startsWith(prefix)))
    .map((name) => caches.delete(name)));

  const windows = await self.clients.matchAll({ type: "window" });
  await self.registration.unregister();
  await Promise.all(windows.map((client) => {
    const url = new URL(client.url);
    const destination = url.pathname === "/nonamekill.html"
      ? new URL("/", self.location.origin).href
      : client.url;
    return client.navigate(destination);
  }));
}
