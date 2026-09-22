import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("root homepage contains real resume content and working navigation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("Qiyu Zhao | Engineering the agentic future");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Qiyu Zhao.");
  await expect(page.getByRole("heading", { name: "Microsoft Copilot Tasks", exact: true })).toBeVisible();
  await expect(page.locator("#neural-canvas")).toBeVisible();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Experience", exact: true }).click();
  await expect(page).toHaveURL(/#experience$/);
  await expect(page.getByRole("heading", { name: "Member of Technical Staff", exact: true })).toBeVisible();
  await page.getByText("Earlier chapters", { exact: false }).click();
  await expect(page.getByRole("heading", { name: "Lecture Assistant", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Software Developer", exact: true })).toBeVisible();
  const brokenAnchors = await page.locator('a[href^="#"]').evaluateAll((links) =>
    links.filter((link) => !document.getElementById(link.hash.slice(1))).map((link) => link.hash));
  expect(brokenAnchors).toEqual([]);
  expect(errors).toEqual([]);
});

test("layouts fit small and large viewports without horizontal overflow", async ({ page }, testInfo) => {
  const widths = testInfo.project.name === "mobile" ? [320, 390, 760] : [768, 1024, 1440, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("motion respects system preference and can be paused manually", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.getByRole("button", { name: "Reduced motion", exact: true })).toBeDisabled();
  const canvas = page.locator("#neural-canvas");
  const stillFrame = await canvas.evaluate((element) => element.toDataURL());
  await page.waitForTimeout(150);
  expect(await canvas.evaluate((element) => element.toDataURL())).toBe(stillFrame);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  await page.getByRole("button", { name: "Motion on", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
  await expect(page.getByRole("button", { name: "Motion off", exact: true })).toHaveAttribute("aria-pressed", "true");
  const animationStates = await page.locator(".harness-orbit, .node-label").evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).animationName));
  expect(animationStates.every((name) => name === "none")).toBe(true);
});

test("neural artwork animates on screen and pauses outside the viewport", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const canvas = page.locator("#neural-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const firstFrame = await canvas.evaluate((element) => element.toDataURL());
  await expect.poll(() => canvas.evaluate((element) => element.toDataURL())).not.toBe(firstFrame);
  await page.locator("#contact").scrollIntoViewIfNeeded();
  await expect(canvas).not.toBeInViewport();
  await page.waitForTimeout(150);
  const pausedFrame = await canvas.evaluate((element) => element.toDataURL());
  await page.waitForTimeout(150);
  expect(await canvas.evaluate((element) => element.toDataURL())).toBe(pausedFrame);
});

test("keyboard command navigation opens, closes, and transfers focus", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "About & skills" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page).toHaveURL(/#about$/);
  await expect(page.locator("#about")).toBeFocused();
  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("print includes all earlier roles and restores collapsed details", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.print = () => {
      window.dispatchEvent(new Event("beforeprint"));
      document.body.dataset.printRequested = "true";
    };
  });
  await page.getByRole("button", { name: "Print résumé", exact: true }).first().click();
  await expect(page.locator("body")).toHaveAttribute("data-print-requested", "true");
  await expect(page.locator("details")).toHaveAttribute("open", "");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".neural-scene")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Lecture Assistant", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("details")).not.toHaveAttribute("open", "");
});

test("content and static artwork remain usable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".neural-fallback")).toBeVisible();
  await expect(page.locator(".hero-actions [data-print]")).not.toBeVisible();
  await page.locator("summary").click();
  await expect(page.getByRole("heading", { name: "Lecture Assistant", exact: true })).toBeVisible();
  await context.close();
});

test("page and command dialog pass accessibility checks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("summary").click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Control+k");
  const dialogResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(dialogResults.violations).toEqual([]);
});
