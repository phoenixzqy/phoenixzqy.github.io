import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";

const legacyWorker = `
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    for (const name of ["noname-pwa-v1", "noname-static-v1", "noname-dynamic-v1", "noname-pwa-v0", "unrelated-app-v1"]) {
      const cache = await caches.open(name);
      await cache.put("/styles.css", new Response("/* cached legacy game CSS */"));
    }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  if (new URL(event.request.url).pathname === "/styles.css") {
    event.respondWith(caches.match("/styles.css"));
  }
});
`;

async function legacySite() {
  const retirementWorker = await readFile(new URL("../pwa-sw.js", import.meta.url));
  const homepage = await readFile(new URL("../index.html", import.meta.url));
  const assets = new Map([
    ["/pwa-retired.html", { type: "text/html", body: await readFile(new URL("../pwa-retired.html", import.meta.url)) }],
    ["/styles.css", { type: "text/css", body: await readFile(new URL("../styles.css", import.meta.url)) }],
    ["/script.js", { type: "text/javascript", body: await readFile(new URL("../script.js", import.meta.url)) }],
    ["/favicon.svg", { type: "image/svg+xml", body: await readFile(new URL("../favicon.svg", import.meta.url)) }],
  ]);
  let retired = false;
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (path === "/pwa-sw.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(retired ? retirementWorker : legacyWorker);
    } else if (assets.has(path)) {
      const asset = assets.get(path);
      response.setHeader("Content-Type", asset.type);
      response.end(asset.body);
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end(homepage);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    retire: () => { retired = true; },
    close: async () => {
      const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      server.closeAllConnections();
      await closed;
    },
  };
}

for (const initialPath of ["/nonamekill.html", "/apps/?view=collection#details", "/apps/?lang=zh-CN&view=collection"]) {
  test(`installed game worker retires safely from ${initialPath}`, async ({ page }) => {
    const site = await legacySite();
    try {
      await page.goto(`${site.origin}${initialPath}`);
      await page.evaluate(async () => {
        await navigator.serviceWorker.register("/pwa-sw.js", { scope: "/", type: "module" });
        await navigator.serviceWorker.ready;
      });
      await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toBe(`${site.origin}/pwa-sw.js`);
      expect(await page.evaluate(async () => (await fetch("/styles.css")).text())).toContain("cached legacy game CSS");
      expect(await page.evaluate(() => caches.keys())).toContain("unrelated-app-v1");
      await page.evaluate(() => { window.retirementMarker = "old-document"; });

      site.retire();
      const navigated = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame());
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration("/");
        await registration.update();
      });
      await navigated;
      await page.waitForLoadState("domcontentloaded");
      await expect(page).toHaveURL(`${site.origin}${initialPath === "/nonamekill.html" ? "/" : initialPath}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Qiyu Zhao.");
      await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
      await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
      expect(await page.evaluate(() => window.retirementMarker)).toBeUndefined();
      expect(await page.evaluate(() => caches.keys())).toEqual(["unrelated-app-v1"]);
      expect(await page.evaluate(async () => (await fetch("/styles.css")).text())).not.toContain("cached legacy game CSS");
    } finally {
      await page.close();
      await site.close();
    }
  });
}

test("retirement redirect rejects external, malformed, and looping destinations", async ({ page, baseURL }) => {
  for (const destination of ["https://example.invalid/", `${baseURL}/pwa-retired.html`, "%"]) {
    const hash = destination === "%" ? "%" : encodeURIComponent(destination);
    await page.goto(`/pwa-retired.html#${hash}`);
    await expect(page.getByRole("status")).toHaveText("The return address is invalid. Use the résumé link to continue.");
    await expect(page).toHaveURL(`${baseURL}/pwa-retired.html#${hash}`);
    await expect(page.getByRole("link", { name: "Open the résumé" })).toHaveAttribute("href", "/");
  }
});

test("current site does not install a PWA or expose old game assets", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  for (const path of ["/manifest.webmanifest", "/nonamekill.html", "/pwa-icons/icon-192x192.png"]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  expect((await request.get("/pwa-sw.js")).status()).toBe(200);
});
