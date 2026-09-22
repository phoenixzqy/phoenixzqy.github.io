import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { releaseFixture } from "./apps-fixtures.js";

const localizedManifest = releaseFixture();
localizedManifest.release.notes = [{ en: "Test-only release metadata.", "zh-CN": "仅供测试的版本说明。" }];
localizedManifest.release.assets[0].name = { en: "Windows preview", "zh-CN": "Windows 预览版" };
localizedManifest.release.assets[0].installNotes = { en: "Test fixture only.", "zh-CN": "仅供测试，请保留完整的应用程序包。" };
localizedManifest.release.assets[1].name = { en: "Android preview", "zh-CN": "Android 预览版" };
localizedManifest.release.assets[1].installNotes = { en: "Test fixture only.", "zh-CN": "仅供测试，请遵守设备的安全策略。" };

async function mockLocalizedRelease(page) {
  await page.route("**/releases/bplayer/latest/manifest.json", (route) => route.fulfill({ json: localizedManifest }));
}

test("Chinese catalog, details, gallery, and downloads have correct localized titles", async ({ page }) => {
  await mockLocalizedRelease(page);
  await page.goto("/apps/?lang=zh-CN");
  await expect(page).toHaveTitle("应用 | Qiyu Zhao");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("小小灵感，实用软件。");
  await page.getByRole("link", { name: "了解应用" }).click();
  await expect(page).toHaveURL(/id=bplayer&lang=zh-CN$/);
  await expect(page).toHaveTitle("BPlayer | Qiyu Zhao 的应用");
  await expect(page.getByRole("heading", { name: "英语与简体中文", exact: true })).toBeVisible();
  await expect(page.locator(".screenshot-card img").first()).toHaveAttribute("alt", /BPlayer 桌面展开布局/);
  await expect(page.locator(".screenshot-card img").first()).toHaveJSProperty("naturalWidth", 2560);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /本地优先的有声书播放器/);
  await page.getByRole("link", { name: "查看版本与下载" }).click();
  await expect(page).toHaveTitle("BPlayer 下载 | Qiyu Zhao");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "BPlayer 下载 | Qiyu Zhao");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /下载 BPlayer/);
  await expect(page.locator(".release-notes")).toContainText("仅供测试的版本说明。");
  await expect(page.locator(".package-card")).toHaveCount(localizedManifest.release.assets.length);
  await page.getByLabel("平台", { exact: true }).selectOption("android");
  await expect(page.locator(".package-card")).toHaveCount(1);
  await expect(page.getByText("仅供测试，请遵守设备的安全策略。", { exact: true })).toBeVisible();
  await expect(page.locator(".download-link").first()).toHaveAttribute("href", localizedManifest.release.assets[1].url);
  await page.getByText("SHA-256 校验值", { exact: true }).first().click();
  await expect(page.locator(".checksum code").first()).toHaveText(localizedManifest.release.assets[1].sha256);
  await page.goBack();
  await expect(page).toHaveTitle("BPlayer | Qiyu Zhao 的应用");
  await page.goForward();
  await expect(page).toHaveTitle("BPlayer 下载 | Qiyu Zhao");
});

test("language switching persists, retains app/hash/filter, and updates metadata immediately", async ({ page }) => {
  await mockLocalizedRelease(page);
  await page.goto("/apps/releases/?id=bplayer&lang=en#packages");
  await expect(page).toHaveTitle("BPlayer downloads | Qiyu Zhao");
  await page.getByLabel("PLATFORM", { exact: true }).selectOption("windows");
  const packageURL = await page.locator(".download-link").getAttribute("href");
  await page.getByLabel("Language", { exact: true }).selectOption("zh-CN");
  await expect(page).toHaveURL(/id=bplayer&lang=zh-CN#packages$/);
  await expect(page).toHaveTitle("BPlayer 下载 | Qiyu Zhao");
  await expect(page.getByLabel("平台", { exact: true })).toHaveValue("windows");
  await expect(page.locator(".package-card")).toHaveCount(1);
  await expect(page.locator(".download-link")).toHaveAttribute("href", packageURL);
  await expect(page.locator(".package-info h3")).toHaveText("Windows 预览版");
  await page.goto("/apps/");
  await expect(page).toHaveTitle("应用 | Qiyu Zhao");
  await page.goto("/apps/?lang=en");
  await expect(page).toHaveTitle("Apps | Qiyu Zhao");
  await page.getByLabel("Language", { exact: true }).selectOption("en");
  expect(await page.evaluate(() => localStorage.getItem("apps.locale"))).toBe("en");
});

test("browser-language selection and denied storage still permit explicit switching", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ locale: "zh-CN" });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Disabled", "SecurityError"); } });
  });
  await page.goto(`${baseURL}/apps/`);
  await expect(page).toHaveTitle("应用 | Qiyu Zhao");
  await page.getByLabel("语言", { exact: true }).selectOption("en");
  await expect(page).toHaveTitle("Apps | Qiyu Zhao");
  await page.reload();
  await expect(page).toHaveTitle("Apps | Qiyu Zhao");
  await context.close();
});

test("release title is app-specific before metadata loads and localized when loading fails", async ({ page }) => {
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  await page.route("**/releases/bplayer/latest/manifest.json", async (route) => {
    await gate;
    await route.fulfill({ status: 503, body: "Unavailable" });
  });
  await page.goto("/apps/releases/?id=bplayer&lang=zh-CN");
  await expect(page).toHaveTitle("BPlayer 下载 | Qiyu Zhao");
  await expect(page.getByRole("status")).toHaveText("正在加载版本信息…");
  finish();
  await expect(page.getByRole("alert")).toContainText("HTTP 503");
  await expect(page).toHaveTitle("暂时无法访问 — BPlayer 下载 | Qiyu Zhao");
  await page.getByLabel("语言", { exact: true }).selectOption("en");
  await expect(page).toHaveTitle("Unavailable — BPlayer downloads | Qiyu Zhao");
  await expect(page.getByRole("alert")).toContainText("This page couldn't be loaded.");
});

test("unpublished, invalid-app, and untranslated publisher content remain explicit in Chinese", async ({ page }) => {
  await page.route("**/releases/bplayer/latest/manifest.json", (route) =>
    route.fulfill({ json: { schemaVersion: 1, appId: "bplayer", release: null } }));
  await page.goto("/apps/releases/?id=bplayer&lang=zh-CN");
  await expect(page).toHaveTitle("BPlayer 下载 | Qiyu Zhao");
  await expect(page.getByRole("heading", { name: "即将与你见面。" })).toBeVisible();
  await page.goto("/apps/app/?id=unknown-app&lang=zh-CN");
  await expect(page).toHaveTitle("暂时无法访问 — 应用详情 | Qiyu Zhao");
  await expect(page.getByRole("alert")).toContainText("应用列表中没有找到“unknown-app”");
  await page.unroute("**/releases/bplayer/latest/manifest.json");
  const fixture = releaseFixture();
  fixture.release.assets[0].signing = "ad-hoc";
  await page.route("**/releases/bplayer/latest/manifest.json", (route) => route.fulfill({ json: fixture }));
  await page.goto("/apps/releases/?id=bplayer&lang=zh-CN");
  await expect(page.getByText("临时签名开发版本", { exact: true })).toBeVisible();
  await expect(page.locator(".release-notes")).toContainText("Test-only release metadata.");
  await expect(page.locator(".translation-note")).toHaveText("发布者尚未提供翻译的内容将以英文显示。");
  await expect(page.locator(".download-link").first()).toHaveAttribute("href", "/releases/bplayer/latest/BPlayer-1.2.3-windows-x64.zip");
});

test("Chinese pages fit mobile and retain accessible controls", async ({ page }, testInfo) => {
  await mockLocalizedRelease(page);
  await page.setViewportSize({ width: testInfo.project.name === "mobile" ? 320 : 1440, height: 900 });
  for (const path of ["/apps/?lang=zh-CN", "/apps/app/?id=bplayer&lang=zh-CN", "/apps/releases/?id=bplayer&lang=zh-CN"]) {
    await page.goto(path);
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
  }
});
