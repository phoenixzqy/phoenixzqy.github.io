import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { catalog, releaseFixture, packageBytes } from "./apps-fixtures.js";

async function mockRelease(page, manifest = releaseFixture()) {
  await page.route("**/releases/bplayer/latest/manifest.json", (route) =>
    route.fulfill({ json: manifest }));
}

test("homepage is the catalog and links to BPlayer details and unpublished downloads", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockRelease(page, { schemaVersion: 1, appId: "bplayer", release: null });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Small ideas. Real software.");
  await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Apps", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "About me", exact: true }).click();
  await expect(page).toHaveURL(/\/about\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Qiyu Zhao.");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Apps", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Small ideas. Real software.");
  const bplayerCard = page.locator(".catalog-card").filter({ hasText: "BPlayer" });
  const catalogLogo = bplayerCard.getByRole("img", { name: "BPlayer logo" });
  await expect(catalogLogo).toHaveJSProperty("naturalWidth", 413);
  await expect(catalogLogo).toHaveJSProperty("naturalHeight", 180);
  await bplayerCard.getByRole("link", { name: "Explore app" }).click();
  await expect(page).toHaveURL(/\/apps\/app\/\?id=bplayer&lang=en$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BPlayer");
  const detailLogo = page.getByRole("img", { name: "BPlayer logo" });
  await expect(detailLogo).toHaveJSProperty("naturalWidth", 413);
  await expect(detailLogo).toHaveJSProperty("naturalHeight", 180);
  await expect(page.getByText("English & Simplified Chinese", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A look inside." })).toBeVisible();
  await expect(page.locator(".screenshot-card img")).toHaveCount(2);
  await expect(page.locator(".screenshot-card img").first()).toHaveJSProperty("naturalWidth", 2560);
  await expect(page.locator(".screenshot-card img").last()).toHaveJSProperty("naturalWidth", 780);
  await page.getByRole("link", { name: "View releases & downloads" }).click();
  await expect(page.getByRole("heading", { name: "Not released here. Yet.", exact: true })).toBeVisible();
  await expect(page.locator(".download-link")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "About BPlayer" })).toHaveAttribute("href", "/apps/app/?id=bplayer&lang=en");
  expect(errors).toEqual([]);
});

test("published releases filter platforms, expose checksums, and download exact bytes", async ({ page }) => {
  const manifest = releaseFixture();
  const filename = `test-only-${randomUUID()}.zip`;
  manifest.release.assets[0].file = filename;
  const path = new URL(`../releases/bplayer/latest/${filename}`, import.meta.url);
  // Browser-managed downloads bypass page routing, so exercise the real static server.
  await writeFile(path, packageBytes, { flag: "wx" });
  try {
    await mockRelease(page, manifest);
    await page.goto("/apps/releases/?id=bplayer");
    await expect(page.getByRole("heading", { name: "Version 1.2.3+4" })).toBeVisible();
    await expect(page.locator(".package-card")).toHaveCount(2);
    await page.getByLabel("PLATFORM", { exact: true }).selectOption("windows");
    await expect(page.locator(".package-card")).toHaveCount(1);
    await page.getByText("SHA-256 checksum", { exact: true }).click();
    await expect(page.locator(".checksum code")).toHaveText(manifest.release.assets[0].sha256);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download package" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(filename);
    expect(await readFile(await download.path())).toEqual(packageBytes);
    await page.getByLabel("PLATFORM", { exact: true }).selectOption("android");
    await expect(page.locator(".download-link")).toHaveAttribute("href", manifest.release.assets[1].url);
    await expect(page.getByText("Self-signed development build", { exact: true })).toBeVisible();
  } finally {
    await rm(path);
  }
});

test("release pages distinguish ad-hoc signatures from unsigned packages", async ({ page }) => {
  const manifest = releaseFixture();
  manifest.release.assets[0].signing = "ad-hoc";
  await mockRelease(page, manifest);
  await page.goto("/apps/releases/?id=bplayer");
  await expect(page.getByText("Ad-hoc signed development build", { exact: true })).toBeVisible();
});

test("multiple apps reuse detail and download pages without mixing release metadata", async ({ page }) => {
  const second = {
    ...structuredClone(catalog.apps[0]),
    id: "another-player",
    name: "Another Player",
    tagline: "A second test app.",
    screenshots: undefined,
    artwork: undefined,
  };
  await page.route("**/apps/catalog.json", (route) => route.fulfill({ json: { schemaVersion: 1, apps: [...catalog.apps, second] } }));
  await page.route("**/releases/another-player/latest/manifest.json", (route) =>
    route.fulfill({ json: { schemaVersion: 1, appId: "another-player", release: null } }));
  await page.goto("/apps/");
  await expect(page.locator(".catalog-card")).toHaveCount(catalog.apps.length + 1);
  await page.getByRole("link", { name: "Another Player", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Another Player");
  await page.getByRole("link", { name: "View releases & downloads" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Another Player downloads");
  await expect(page.getByRole("heading", { name: "Not released here. Yet.", exact: true })).toBeVisible();
});

test("long app names remain within the catalog, detail, and release layouts", async ({ page }) => {
  const app = { ...structuredClone(catalog.apps[0]), name: "AccessibilityToolkit" };
  await page.route("**/apps/catalog.json", (route) =>
    route.fulfill({ json: { schemaVersion: 1, apps: [app] } }));
  await mockRelease(page);
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of ["/apps/", "/apps/app/?id=bplayer", "/apps/releases/?id=bplayer"]) {
    await page.goto(path);
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    const bounds = await page.locator(".app-main").evaluate((main) => {
      const rect = main.getBoundingClientRect();
      return { width: rect.width, scrollWidth: main.scrollWidth, right: rect.right };
    });
    expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.right).toBeLessThanOrEqual(320);
    const headingsFit = await page.locator(".catalog-card h2, .app-heading h1").evaluateAll((headings) =>
      headings.every((heading) => heading.scrollWidth <= heading.clientWidth + 1));
    expect(headingsFit).toBe(true);
  }
});

test("missing, invalid, and unknown app ids show errors instead of fabricated content", async ({ page }) => {
  for (const url of ["/apps/app/", "/apps/app/?id=../private", "/apps/releases/?id=unknown-app"]) {
    await page.goto(url);
    await expect(page.getByRole("alert")).toContainText("This page couldn't be loaded.");
    await expect(page.locator(".download-link")).toHaveCount(0);
  }
});

test("zai app comparisons render early with every catalog table", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "zai detail pages include videos that headless WebKit cannot instantiate");
  for (const app of catalog.apps.filter((entry) => entry.id.startsWith("zai-"))) {
    await page.goto(`/apps/app/?id=${app.id}&lang=en`);
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    const comparison = page.locator(".app-comparison");
    await expect(comparison).toBeVisible();
    await expect(comparison.locator(".comparison-group")).toHaveCount(app.comparison.groups.length);
    await expect(comparison.locator(".comparison-table")).toHaveCount(app.comparison.groups.length);
    await expect(comparison.locator("tbody tr")).toHaveCount(
      app.comparison.groups.reduce((total, group) => total + group.rows.length, 0));
    await expect(comparison.locator(".comparison-source a")).toHaveAttribute("href", app.comparison.source.url);
    const notes = app.comparison.groups.flatMap((group) => group.notes ?? []);
    await expect(comparison.locator(".comparison-notes li")).toHaveCount(notes.length);
    for (let number = 1; number <= notes.length; number += 1) {
      await expect(comparison.locator(`#comparison-${app.id}-note-${number}`)).toHaveText(notes[number - 1]);
    }
    const references = app.comparison.groups.flatMap((group) => group.rows)
      .flatMap((row) => row.values)
      .flatMap((value) => [...value.matchAll(/\[(\d+)\]/g)].map((match) => match[1]));
    await expect(comparison.locator(".comparison-note-reference a")).toHaveCount(references.length);
    for (const number of new Set(references)) {
      expect(await comparison.locator(
        `.comparison-note-reference a[href="#comparison-${app.id}-note-${number}"]`,
      ).count()).toBeGreaterThan(0);
    }
    const isEarly = await page.locator(".app-comparison").evaluate((node) => {
      const feature = document.querySelector(".feature-grid");
      const media = document.querySelector(".app-gallery, .app-videos");
      return (!media || Boolean(node.compareDocumentPosition(media) & Node.DOCUMENT_POSITION_FOLLOWING)) &&
        Boolean(node.compareDocumentPosition(feature) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(isEarly).toBe(true);
  }
});

test("zai-cli detail page presents its supplied screenshots and demos", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "headless WebKit cannot instantiate media elements in this environment");
  await page.goto("/apps/app/?id=zai-cli&lang=en");

  const screenshots = page.locator(".screenshot-card img");
  await expect(screenshots).toHaveCount(3);
  await expect(page.locator(".screenshot-card.screenshot-row")).toHaveCount(3);
  await expect(page.locator(".screenshot-card").nth(2)).toHaveClass(/screenshot-compact/);
  await screenshots.first().scrollIntoViewIfNeeded();
  await expect(screenshots.first()).toHaveJSProperty("naturalWidth", 2560);
  await expect(screenshots.first()).toHaveAttribute("alt", "The zai console Welcome screen with the new-tab app picker open.");
  await expect(page.locator(".video-player")).toHaveCount(2);
  await expect(page.getByText("General features, recorded while running 7 LLM coding sessions", { exact: true })).toBeVisible();
  await expect(page.getByText("Themes", { exact: true })).toBeVisible();

  await page.goto("/apps/app/?id=zai-cli&lang=zh-CN");
  await expect(page.locator(".screenshot-card img").first()).toHaveAttribute("alt", "zai 控制台欢迎页，已打开新标签页应用选择器。");
});

test("metadata failures and unsafe URLs never become successful or downloadable releases", async ({ page }) => {
  await page.route("**/releases/bplayer/latest/manifest.json", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.goto("/apps/releases/?id=bplayer");
  await expect(page.getByRole("alert")).toContainText("HTTP 404");
  await expect(page.getByText("Not released here. Yet.", { exact: true })).toHaveCount(0);
  await page.unroute("**/releases/bplayer/latest/manifest.json");
  const bad = releaseFixture();
  bad.release.assets[0].url = "javascript:alert('unsafe')";
  await mockRelease(page, bad);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("External assets must use public GitHub Release");
  await expect(page.locator(".download-link")).toHaveCount(0);
});

test("metadata strings render as text, not executable markup", async ({ page }) => {
  const fixture = releaseFixture();
  fixture.release.notes = ['<img src=x onerror="window.injected=true">'];
  await mockRelease(page, fixture);
  await page.goto("/apps/releases/?id=bplayer");
  await expect(page.locator(".release-notes")).toContainText("<img src=x");
  await expect(page.locator(".release-notes img")).toHaveCount(0);
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
});

test("catalog, details, and populated downloads fit narrow viewports and pass accessibility", async ({ page, isMobile }) => {
  await mockRelease(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const width = isMobile ? 320 : 1440;
  await page.setViewportSize({ width, height: 900 });
  for (const path of ["/apps/", "/apps/app/?id=bplayer", "/apps/releases/?id=bplayer"]) {
    await page.goto(path);
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
  }
});

test("homepage explains the JavaScript requirement without hiding fallback navigation", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.getByRole("heading", { name: "Apps by Qiyu Zhao" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read About me." })).toHaveAttribute("href", "/about/");
  await context.close();
});
