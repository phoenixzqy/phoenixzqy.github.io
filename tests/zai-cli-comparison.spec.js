import { test, expect } from "@playwright/test";

test("zai-cli distinguishes agent dependencies and cross-platform baselines", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "zai detail pages include videos that headless WebKit cannot instantiate");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/apps/app/?id=zai-cli&lang=${locale}`);
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    const comparison = page.locator(".app-comparison");
    const titles = locale === "en"
      ? ["Workspace capabilities", "The separately installed coding-agent layer", "Linux workspace baselines", "GitHub Copilot app: native Windows first-run"]
      : ["工作空间能力", "另行安装的编码代理层", "Linux 工作空间基线", "GitHub Copilot 应用：原生 Windows 首次启动观测"];
    const capabilities = comparison.getByRole("region", { name: titles[0], exact: true });
    await expect(capabilities.getByRole("columnheader", { name: "GitHub Copilot app", exact: true })).toBeVisible();
    await expect(capabilities.getByRole("row", { name: /Built-in code editor/ })).toContainText("Not evaluated");

    const agents = comparison.getByRole("region", { name: titles[1], exact: true });
    for (const agent of ["GitHub Copilot CLI", "Codex", "Pi", "Claude Code", "OpenCode"]) {
      await expect(agents.getByRole("rowheader", { name: agent, exact: true })).toBeVisible();
    }
    await expect(agents.getByRole("row", { name: /^Codex / })).toContainText("codex-evo");
    await expect(agents.getByRole("row", { name: /^Pi / })).toContainText("Node.js");
    await expect(agents.getByRole("row", { name: /^Claude Code / })).toContainText("2.1.281+");

    const linux = comparison.getByRole("region", { name: titles[2], exact: true });
    await expect(linux.getByRole("columnheader", { name: "GitHub Copilot app", exact: true })).toHaveCount(0);
    await expect(linux.getByRole("row", { name: /^Idle memory/ })).toContainText("≈ 40 MiB");

    const windows = comparison.getByRole("region", { name: titles[3], exact: true });
    await expect(windows.getByRole("columnheader")).toHaveCount(3);
    await expect(windows.getByRole("row", { name: /^Private memory/ })).toContainText("687.6–959.5 MiB");
    await expect(windows.getByRole("row", { name: /^Observed processes/ })).toContainText("11–13");
    await expect(comparison.locator(".comparison-intro")).toContainText(locale === "en" ? "separately installed" : "另行安装");
    await expect(comparison.locator(".comparison-source a")).toHaveAttribute("href", "https://github.com/phoenixzqy/zai-cli#how-zai-compares");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
