import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("About me page contains real resume content and working navigation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/about/");
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

test("layouts fit small and large viewports without horizontal overflow", async ({ page, isMobile }) => {
  const widths = isMobile ? [320, 390, 760] : [768, 1024, 1440, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/about/");
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("Blueprint navigation stays reachable in short windows and compact headers", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 400 });
  await page.goto("/about/?design=blueprint");
  const header = page.locator(".site-header");
  await header.getByRole("link", { name: "Qiyu Zhao, home" }).focus();
  for (const name of ["Work", "Experience", "Apps", "About me"]) {
    await page.keyboard.press("Tab");
    const link = header.getByRole("link", { name, exact: true });
    await expect(link).toBeFocused();
    await expect(link).toBeInViewport({ ratio: 1 });
  }
  await page.keyboard.press("Tab");
  const quickNavigation = header.getByRole("button", { name: "Open quick navigation" });
  await expect(quickNavigation).toBeFocused();
  await expect(quickNavigation).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quickNavigation).toBeFocused();
  await page.keyboard.press("Tab");
  const contact = header.getByRole("link", { name: "Let's talk" });
  await expect(contact).toBeFocused();
  await expect(contact).toBeInViewport({ ratio: 1 });

  await page.setViewportSize({ width: 960, height: 400 });
  await page.locator("#work").scrollIntoViewIfNeeded();
  await expect(header).toBeInViewport({ ratio: 1 });
  for (const link of await header.locator("nav a").all()) {
    await expect(link).toBeInViewport({ ratio: 1 });
  }
  await page.emulateMedia({ media: "print" });
  await expect(header).not.toBeVisible();
});

test("motion respects system preference and can be paused manually", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about/");
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
  await page.goto("/about/");
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
  await page.goto("/about/");
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

test("printing from About includes the full resume and restores collapsed details", async ({ page }) => {
  await page.goto("/about/#about");
  await page.evaluate(() => {
    window.print = () => {
      window.dispatchEvent(new Event("beforeprint"));
      document.body.dataset.printRequested = "true";
    };
  });
  await page.locator(".about-resume-actions").getByRole("button", { name: "Print résumé", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-requested", "true");
  await expect(page.locator("details")).toHaveAttribute("open", "");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".neural-scene")).not.toBeVisible();
  await expect(page.locator("#theme-panel")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Selected engineering work", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Epi & Panda Harness", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lecture Assistant", exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("details")).not.toHaveAttribute("open", "");
});

test("print keeps company names and dates inside their column at paper widths", async ({ page }) => {
  await page.emulateMedia({ media: "print" });
  await page.goto("/about/");
  await page.evaluate(() => document.fonts.ready);
  // Printable widths for A4 and Letter with the stylesheet's 16mm margins.
  for (const width of [673, 695, 1024]) {
    await page.setViewportSize({ width, height: 1056 });
    const entries = await page.locator(".experience-entry").evaluateAll((elements) =>
      elements.map((entry) => {
        const bounds = (selector) => {
          const { top, bottom, left, right } = entry.querySelector(selector).getBoundingClientRect();
          return { top, bottom, left, right };
        };
        return {
          meta: bounds(".experience-meta"),
          company: bounds(".company-name"),
          date: bounds(".experience-meta > .mono"),
          body: bounds(".experience-body"),
        };
      }));
    for (const { meta, company, date, body } of entries) {
      expect(company.top).toBeLessThanOrEqual(body.top + 4);
      expect(date.top).toBeGreaterThanOrEqual(company.bottom);
      expect(date.left).toBeGreaterThanOrEqual(meta.left);
      expect(date.right).toBeLessThanOrEqual(meta.right + 1);
      expect(date.right).toBeLessThan(body.left);
    }
  }
});

test("content and static artwork remain usable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/about/`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".neural-fallback")).toBeVisible();
  await expect(page.locator(".hero-actions [data-print]")).not.toBeVisible();
  await expect(page.locator("#theme-panel")).not.toBeVisible();
  await page.locator("summary").click();
  await expect(page.getByRole("heading", { name: "Lecture Assistant", exact: true })).toBeVisible();
  await context.close();
});

test("page and command dialog pass accessibility checks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about/");
  await page.locator("summary").click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press("Control+k");
  const dialogResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(dialogResults.violations).toEqual([]);
});

test("themes support keyboard selection, saved preferences, and shareable previews", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/about/?design=constellation&theme=moss#about");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  const themes = page.getByRole("group", { name: "Color theme" });
  const canvas = page.locator("#neural-canvas");
  const originalFrame = await canvas.evaluate((element) => element.toDataURL());
  await themes.getByRole("radio", { name: "Moss", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(themes.getByRole("radio", { name: "Paper", exact: true })).toBeChecked();
  await expect(page).toHaveURL(/theme=paper#about$/);
  expect(await canvas.evaluate((element) => element.toDataURL())).not.toBe(originalFrame);
  for (const url of ["/about/", "/about/?theme=unknown"]) {
    await page.goto(url);
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await expect(themes.getByRole("radio", { name: "Paper", exact: true })).toBeChecked();
  }
  await page.goto("/about/?theme=original");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await expect(themes.getByRole("radio", { name: "Moss", exact: true })).toBeChecked();
});

test("theme controls work when browser storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage unavailable"); } });
  });
  await page.goto("/about/?theme=paper");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("radio", { name: "Paper", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Linen", exact: true })).toBeChecked();
  await expect(page).toHaveURL(/\?theme=linen$/);
  await page.getByRole("group", { name: "Visual design" }).getByRole("radio", { name: "Studio", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-design", "studio");
});

for (const theme of ["paper", "linen", "slate"]) {
  test(`${theme} theme is accessible and fits desktop and narrow screens`, async ({ page, isMobile }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/about/?theme=${theme}`);
    await page.locator("summary").click();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press("Control+k");
    const dialogResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(dialogResults.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    for (const width of isMobile ? [320, 390] : [768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const bounds = await page.getByRole("group", { name: "Color theme" }).boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    expect(errors).toEqual([]);
  });
}


test("design and color can be selected independently and retained in preview links", async ({ page }) => {
  await page.goto("/about/?theme=linen#about");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  const designs = page.getByRole("group", { name: "Visual design" });
  const colors = page.getByRole("group", { name: "Color theme" });
  await expect(designs.getByRole("radio", { name: "Blueprint", exact: true })).toBeChecked();
  await designs.getByRole("radio", { name: "Constellation", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(designs.getByRole("radio", { name: "Editorial", exact: true })).toBeChecked();
  await expect(colors.getByRole("radio", { name: "Linen", exact: true })).toBeChecked();
  await expect(page).toHaveURL(/\?theme=linen&design=editorial#about$/);
  await colors.getByRole("radio", { name: "Paper", exact: true }).check();
  for (const url of ["/about/", "/about/?design=unknown"]) {
    await page.goto(url);
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await expect(designs.getByRole("radio", { name: "Editorial", exact: true })).toBeChecked();
    await expect(colors.getByRole("radio", { name: "Paper", exact: true })).toBeChecked();
  }
  await page.goto("/about/?design=original");
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await expect(designs.getByRole("radio", { name: "Constellation", exact: true })).toBeChecked();
});

for (const design of ["editorial", "blueprint", "studio"]) {
  for (const theme of ["moss", "paper", "linen", "slate"]) {
    test(`${design} design with ${theme} palette preserves content and layout`, async ({ page, isMobile }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/about/?design=original&theme=original");
      const content = await page.locator("main > section").allTextContents();
      await page.goto(`/about/?design=${design}&theme=${theme}`);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.locator("main > section").allTextContents()).toEqual(content);
      await page.locator("summary").click();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(results.violations).toEqual([]);
      await page.getByRole("button", { name: "Theme", exact: true }).click();
      const panelResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(panelResults.violations).toEqual([]);
      for (const width of isMobile ? [320, 390, 760] : [768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const controls = await page.locator("#theme-panel").boundingBox();
        expect(controls.x).toBeGreaterThanOrEqual(0);
        expect(controls.x + controls.width).toBeLessThanOrEqual(width);
      }
      if (!isMobile) {
        await page.setViewportSize({ width: 1440, height: 1000 });
        // Opening the earlier roles scrolled down; compare the initial composition at the top.
        await page.evaluate(() => window.scrollTo(0, 0));
        const hero = await page.locator(".hero").boundingBox();
        const work = await page.locator("#work").boundingBox();
        if (design === "studio") {
          expect(hero.x + hero.width).toBeLessThan(work.x);
          expect(Math.abs(hero.y - work.y)).toBeLessThan(5);
        } else {
          expect(hero.y + hero.height).toBeLessThan(work.y);
        }
        if (design === "blueprint") {
          const header = await page.locator(".site-header").boundingBox();
          expect(header.x + header.width).toBeLessThan(hero.x);
          const first = await page.locator(".work-card").nth(1).boundingBox();
          const second = await page.locator(".work-card").nth(2).boundingBox();
          expect(first.x + first.width).toBeLessThan(second.x);
        } else {
          await expect(page.locator(".project-art").first()).not.toBeVisible();
        }
      }
      await page.keyboard.press("Control+k");
      const dialog = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(dialog.violations).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
