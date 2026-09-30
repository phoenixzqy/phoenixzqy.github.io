import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { catalog } from "./apps-fixtures.js";

const app = catalog.apps.find((entry) => entry.videos && entry.documentation);
const index = JSON.parse(readFileSync(new URL(`../apps/docs/${app.id}/index.json`, import.meta.url), "utf8"));

// Headless WebKit on Linux has no media backend here: attaching a <source> to a
// <video> crashes the browser process before anything renders. The media markup
// is therefore asserted in Chromium, and WebKit still covers every page that
// does not embed a demo.
const mediaCapable = ({ browserName }) => browserName !== "webkit";

test("a detail page plays its demos, offers copyable installers, and links to the docs", async ({ page, browserName }) => {
  test.skip(!mediaCapable({ browserName }), "headless WebKit cannot instantiate media elements in this environment");
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/apps/app/?id=${app.id}&lang=en`);
  await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");

  const videos = page.locator(".video-player");
  await expect(videos).toHaveCount(app.videos.length);
  const first = videos.first();
  await expect(first).toHaveAttribute("preload", "none");
  await expect(first).toHaveAttribute("poster", app.videos[0].poster);
  await expect(first).toHaveJSProperty("controls", true);
  await expect(first).toHaveJSProperty("autoplay", false);
  await expect(first).toHaveJSProperty("loop", false);
  await expect(first).toHaveJSProperty("playsInline", true);
  await expect(page.locator(".video-card").first().locator(".video-caption")).not.toBeEmpty();

  const command = app.installCommands[0].command;
  await expect(page.locator(".command-text").first()).toHaveText(command);
  await expect(page.locator(".app-artwork")).toHaveJSProperty("naturalWidth", app.artwork.width);

  await page.getByRole("link", { name: "Documentation ↗", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/docs/\\?id=${app.id}&lang=en$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(index.documents[0].title);
  expect(errors).toEqual([]);
});

test("the documentation viewer renders mirrored Markdown and navigates between documents", async ({ page, browserName }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/apps/docs/?id=${app.id}&lang=en`);
  await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".docs-nav-list li")).toHaveCount(index.documents.length);
  await expect(page.locator(".docs-nav-link[aria-current='page']")).toHaveText(index.documents[0].title);
  await expect(page.locator(".docs-body h2").first()).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(index.documents[0].title);
  await expect(page.locator(".docs-source")).toContainText(index.commit.slice(0, 12));

  if (index.documents.length > 1) {
    await page.locator(".docs-nav-link").nth(1).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(index.documents[1].title);
    await expect(page.locator(".docs-nav-link[aria-current='page']")).toHaveText(index.documents[1].title);
  }
  const back = page.getByRole("link", { name: `Back to ${app.name}`, exact: true });
  await expect(back).toHaveAttribute("href", new RegExp(`/apps/app/\\?id=${app.id}&lang=en$`));
  if (mediaCapable({ browserName })) {
    // The detail page embeds demo videos, so only follow the link where media
    // elements can be instantiated.
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/apps/app/\\?id=${app.id}&lang=en$`));
  }
  expect(errors).toEqual([]);
});

test("OpenCode documentation renders setup and the native parity boundary", async ({ page }) => {
  await page.goto("/apps/docs/?id=zai-cli&doc=docs--opencode&lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("OpenCode integration");
  await expect(page.locator(".docs-body")).toContainText("choose OpenCode from the app picker");
  await expect(page.locator(".docs-body code").filter({ hasText: /^\/connect$/ })).toBeVisible();
  await expect(page.locator(".docs-body table")).toContainText("No blocking agent-stop/subagent-stop equivalent");
  await expect(page.locator(".docs-nav-link[aria-current='page']")).toHaveText("OpenCode integration");
  await expect(page.locator(".docs-body")).toContainText("OpenCode 1.18.33+");
});

test("an unknown document is refused instead of fetching an arbitrary file", async ({ page }) => {
  await page.goto(`/apps/docs/?id=${app.id}&doc=../../../secrets`);
  await expect(page.getByRole("alert")).toContainText("not part of the published documentation");
  await page.goto("/apps/docs/?id=bplayer");
  await expect(page.getByRole("alert")).toBeVisible();
});

test("mirrored Markdown cannot execute scripts or smuggle unsafe urls", async ({ page }) => {
  await page.goto(`/apps/docs/?id=${app.id}&lang=en`);
  const result = await page.evaluate(async () => {
    const { renderMarkdown } = await import("/apps/markdown.js");
    const markdown = [
      "# Title",
      "",
      "<script>window.injected = true;<\/script>",
      "",
      "<img src=x onerror=\"window.injected = true\">",
      "",
      "[click](javascript:window.injected=true)",
      "",
      "[data](data:text/html,<script>window.injected=1<\/script>)",
      "",
      "<iframe src=\"https://example.invalid\"></iframe>",
      "",
      "<div style=\"position:fixed\" onclick=\"window.injected = true\">text in a div</div>",
      "",
      "[docs](?id=demo&doc=intro)",
    ].join("\n");
    const { fragment } = renderMarkdown(markdown, { resolve: (url) => url });
    const host = document.createElement("div");
    host.append(fragment);
    document.body.append(host);
    const anchors = [...host.querySelectorAll("a")].map((node) => node.getAttribute("href"));
    const snapshot = {
      injected: window.injected,
      scripts: host.querySelectorAll("script, iframe, style, object, embed").length,
      images: host.querySelectorAll("img").length,
      eventHandlers: [...host.querySelectorAll("*")].some((node) => [...node.attributes].some((attribute) => attribute.name.startsWith("on"))),
      styles: [...host.querySelectorAll("*")].some((node) => node.hasAttribute("style")),
      anchors,
      text: host.textContent,
      headingId: host.querySelector("h1")?.id,
    };
    host.remove();
    return snapshot;
  });
  expect(result.injected).toBeUndefined();
  expect(result.scripts).toBe(0);
  expect(result.images).toBe(0);
  expect(result.eventHandlers).toBe(false);
  expect(result.styles).toBe(false);
  expect(result.anchors).toEqual(["?id=demo&doc=intro"]);
  expect(result.text).toContain("<script>");
  expect(result.text).toContain("text in a div");
  expect(result.headingId).toBe("title");
});

test("documentation pages fit narrow viewports and pass accessibility", async ({ page, isMobile, browserName }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: isMobile ? 320 : 1440, height: 900 });
  const paths = [`/apps/docs/?id=${app.id}`, `/apps/docs/?id=${app.id}&doc=${index.documents.at(-1).slug}`];
  if (mediaCapable({ browserName })) paths.unshift(`/apps/app/?id=${app.id}`);
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
  }
});
