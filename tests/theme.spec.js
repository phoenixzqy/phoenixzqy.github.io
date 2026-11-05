import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const themeButton = (page) => page.getByRole("button", { name: "Theme", exact: true });

test("Blueprint and Linen are the defaults, with a dismissible keyboard theme panel", async ({ page }) => {
  await page.goto("/about/");
  await expect(page.locator("html")).toHaveAttribute("data-design", "blueprint");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "linen");
  await expect(page.locator("#theme-panel")).not.toBeVisible();
  await themeButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(themeButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("radio", { name: "Blueprint", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("html")).toHaveAttribute("data-design", "studio");
  await page.keyboard.press("Escape");
  await expect(page.locator("#theme-panel")).not.toBeVisible();
  await expect(themeButton(page)).toBeFocused();
  await themeButton(page).click();
  await page.getByRole("button", { name: "Close theme settings" }).click();
  await expect(themeButton(page)).toHaveAttribute("aria-expanded", "false");
  await themeButton(page).click();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.locator("#theme-panel")).not.toBeVisible();
});

test("theme preferences carry across About, catalog, details, downloads, and docs", async ({ page }) => {
  await page.goto("/about/");
  await themeButton(page).click();
  await page.getByRole("radio", { name: "Paper", exact: true }).check();
  await page.getByRole("radio", { name: "Editorial", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Apps", exact: true }).click();
  for (const path of ["/", "/apps/", "/apps/app/?id=zai-cli", "/apps/releases/?id=zai-cli", "/apps/docs/?id=zai-cli"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    await expect(themeButton(page)).toBeVisible();
    expect(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(247, 249, 252)");
  }
  await themeButton(page).click();
  await page.getByRole("radio", { name: "Slate", exact: true }).check();
  await expect(page).toHaveURL(/id=zai-cli&theme=slate$/);
  await page.goto("/about/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "slate");
  await expect(page.locator("html")).toHaveAttribute("data-design", "editorial");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "slate");
});

test("legacy preferences and original preview links retain their intended appearance", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("qiyu-resume-theme", "original");
    localStorage.setItem("qiyu-resume-design", "original");
  });
  await page.goto("/about/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "moss");
  await expect(page.locator("html")).toHaveAttribute("data-design", "constellation");
  await themeButton(page).click();
  await page.getByRole("radio", { name: "Paper", exact: true }).check();
  await page.goto("/?theme=original");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "moss");
  await page.goto("/about/?theme=invalid&design=invalid");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  await expect(page.locator("html")).toHaveAttribute("data-design", "constellation");
});

test("theme controls follow the app language and preserve app and locale query parameters", async ({ page }) => {
  await page.goto("/apps/app/?id=zai-cli&lang=zh-CN#main");
  await page.getByRole("button", { name: "主题", exact: true }).click();
  await page.getByRole("radio", { name: "岩蓝", exact: true }).check();
  await expect(page).toHaveURL(/id=zai-cli&lang=zh-CN&theme=slate#main$/);
  await page.keyboard.press("Escape");
  await page.locator("#locale-select").selectOption("en");
  await expect(themeButton(page)).toBeVisible();
  await themeButton(page).click();
  await expect(page.getByRole("radio", { name: "Slate", exact: true })).toBeChecked();
});

test("saved colors update other tabs and survive browser back navigation", async ({ page, context }) => {
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/about/");
  await themeButton(page).click();
  await page.getByRole("radio", { name: "Slate", exact: true }).check();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "slate");
  await other.goto("/apps/");
  await other.goBack();
  await expect(other.locator("html")).toHaveAttribute("data-theme", "slate");
  await other.close();
});

for (const theme of ["moss", "paper", "linen", "slate"]) {
  test(`${theme} colors cover app surfaces and the theme panel accessibly`, async ({ page, isMobile }) => {
    await page.setViewportSize({ width: isMobile ? 320 : 1440, height: 900 });
    for (const path of ["/", "/apps/app/?id=zai-cli", "/apps/releases/?id=zai-cli", "/apps/docs/?id=zai-cli"]) {
      await page.goto(`${path}${path.includes("?") ? "&" : "?"}theme=${theme}`);
      await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
      await themeButton(page).click();
      const bounds = await page.locator("#theme-panel").boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(isMobile ? 320 : 1440);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(results.violations).toEqual([]);
    }
  });
}
