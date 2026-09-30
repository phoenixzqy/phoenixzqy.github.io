import { test, expect } from "@playwright/test";

test("zai-cli integrates Copilot with Orca/herdr while distinguishing measurement scopes", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "zai detail pages include videos that headless WebKit cannot instantiate");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/apps/app/?id=zai-cli&lang=${locale}`);
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    const comparison = page.locator(".app-comparison");
    const titles = locale === "en"
      ? ["Workspace capabilities", "The separately installed coding-agent layer", "Workspace footprint observations (Linux / Windows)"]
      : ["工作空间能力", "另行安装的编码代理层", "工作空间资源观测（Linux / Windows）"];
    await expect(comparison.locator(".comparison-group")).toHaveCount(3);
    await expect(comparison.getByRole("heading", { name: /^GitHub Copilot/ })).toHaveCount(0);
    const capabilities = comparison.getByRole("region", { name: titles[0], exact: true });
    const footprint = comparison.getByRole("region", { name: titles[2], exact: true });
    for (const table of [capabilities, footprint]) {
      for (const product of ["zai-cli (+ agent)", "VS Code", "GitHub Copilot app", "Orca (+ agent)", "herdr (+ agent)"]) {
        if (product.includes("+ agent")) {
          const header = table.getByRole("columnheader").filter({ hasText: product });
          await expect(header).toBeVisible();
          await expect(header.getByRole("link")).toHaveAttribute("href", "#comparison-zai-cli-note-13");
          continue;
        }
        await expect(table.getByRole("columnheader", { name: product, exact: true })).toBeVisible();
      }
      await expect(table.getByRole("columnheader")).toHaveCount(6);
    }
    await expect(capabilities.getByRole("row", { name: /^Built-in code editor/ }).getByRole("cell").nth(2)).toContainText("✓");
    await expect(capabilities.getByRole("row", { name: /^Language servers/ }).getByRole("cell").nth(2)).toContainText("Not documented in editor");
    await expect(capabilities.getByRole("row", { name: /^Services that take/ }).getByRole("cell").nth(2)).toContainText("GitHub agent merge; Azure DevOps lifecycle unverified");

    const agents = comparison.getByRole("region", { name: titles[1], exact: true });
    for (const agent of ["GitHub Copilot CLI", "Codex", "Pi", "Claude Code", "OpenCode"]) {
      await expect(agents.getByRole("rowheader", { name: agent, exact: true })).toBeVisible();
    }
    await expect(agents.getByRole("row", { name: /^Codex / })).toContainText("codex-evo");
    await expect(agents.getByRole("row", { name: /^Pi / })).toContainText("Node.js");
    await expect(agents.getByRole("row", { name: /^Claude Code / })).toContainText("2.1.281+");

    const linuxMemory = footprint.getByRole("row", { name: /^Linux idle memory/ });
    await expect(linuxMemory).toContainText("≈ 40 MiB");
    await expect(linuxMemory.getByRole("cell").nth(2)).toHaveText("Not measured on Linux");
    const windowsMemory = footprint.getByRole("row", { name: /^Windows first-run private memory/ });
    await expect(windowsMemory.getByRole("cell").nth(2)).toContainText("687.6–959.5 MiB");
    await expect(windowsMemory.getByRole("cell").nth(0)).toHaveText("Not measured on Windows");
    await expect(footprint.getByRole("row", { name: /^Windows first-run working set/ })).toContainText("2,073.0–2,615.3 MiB");
    await expect(footprint.getByRole("row", { name: /^Observed processes/ })).toContainText("11–13 (Windows first-run)");
    await expect(comparison.locator("#comparison-zai-cli-note-11")).toContainText("not a like-for-like ranking");
    const scopeNote = comparison.locator("#comparison-zai-cli-note-13");
    await expect(scopeNote).toContainText("none includes a built-in coding agent");
    await expect(scopeNote).toContainText("workspace baselines exclude the chosen agent CLI/runtime");
    const headerReference = capabilities.getByRole("columnheader").filter({ hasText: "Orca (+ agent)" }).getByRole("link");
    await headerReference.focus();
    await expect(headerReference).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#comparison-zai-cli-note-13$/);
    await expect(scopeNote).toBeInViewport();
    for (const link of await comparison.locator(".comparison-note-reference a").all()) {
      await expect(comparison.locator(await link.getAttribute("href"))).toHaveCount(1);
    }
    await expect(footprint).toHaveAttribute("tabindex", "0");
    await footprint.focus();
    await expect(footprint).toBeFocused();
    await expect(comparison.locator(".comparison-intro")).toContainText(locale === "en" ? "separately installed" : "另行安装");
    await expect(comparison.locator(".comparison-source a")).toHaveAttribute("href", "https://github.com/phoenixzqy/zai-cli#how-zai-compares");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
