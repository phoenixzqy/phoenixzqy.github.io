import { test, expect } from "@playwright/test";

test("zai-cli distinguishes agent dependencies and cross-platform baselines", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "zai detail pages include videos that headless WebKit cannot instantiate");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/apps/app/?id=zai-cli&lang=${locale}`);
    await expect(page.locator("#app-content")).toHaveAttribute("aria-busy", "false");
    const comparison = page.locator(".app-comparison");
    const titles = locale === "en"
      ? ["Workspace capabilities", "The separately installed coding-agent layer", "Workspace footprint baselines"]
      : ["工作空间能力", "另行安装的编码代理层", "工作空间资源基线"];
    const capabilities = comparison.getByRole("region", { name: titles[0], exact: true });
    await expect(capabilities.getByRole("columnheader", { name: "GitHub Copilot app", exact: true })).toBeVisible();
    const agentHeader = locale === "en" ? "zai-cli (your pick of coding agent) [6]" : "zai-cli（自选编码代理）[6]";
    for (const header of [agentHeader, "VS Code", "GitHub Copilot app", "Orca [6]", "herdr [6]"]) {
      await expect(capabilities.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    const editor = capabilities.getByRole("row", { name: /Built-in code editor/ });
    await expect(editor.getByRole("cell").nth(2)).toContainText("✓");
    const lsp = capabilities.getByRole("row", { name: /Language servers/ });
    await expect(lsp.getByRole("cell").nth(2)).toContainText(locale === "en" ? "Unverified" : "尚未核实");

    const agents = comparison.getByRole("region", { name: titles[1], exact: true });
    for (const agent of ["GitHub Copilot CLI", "Codex", "Pi", "Claude Code", "OpenCode"]) {
      await expect(agents.getByRole("rowheader", { name: agent, exact: true })).toBeVisible();
    }
    await expect(agents.getByRole("row", { name: /^Codex / })).toContainText("codex-evo");
    await expect(agents.getByRole("row", { name: /^Pi / })).toContainText("Node.js");
    await expect(agents.getByRole("row", { name: /^Claude Code / })).toContainText("2.1.281+");

    const footprint = comparison.getByRole("region", { name: titles[2], exact: true });
    await expect(footprint.getByRole("columnheader", { name: "GitHub Copilot app", exact: true })).toBeVisible();
    await expect(footprint.getByRole("columnheader", { name: agentHeader, exact: true })).toBeVisible();
    await expect(footprint.getByRole("columnheader")).toHaveCount(6);
    await expect(footprint.getByRole("row", { name: /^Idle memory/ })).toContainText("≈ 40 MiB");
    await expect(footprint.getByRole("row", { name: /^Idle memory/ }).getByRole("cell").nth(2)).toContainText("Not measured");
    await expect(footprint.getByRole("row", { name: /^Private memory/ })).toContainText("687.6–959.5 MiB");
    await expect(footprint.getByRole("row", { name: /^Observed processes/ })).toContainText("11–13");
    await expect(comparison.locator(".comparison-group")).toHaveCount(3);
    await expect(comparison.getByRole("heading", { name: /GitHub Copilot/ })).toHaveCount(0);
    await expect(comparison.locator(".comparison-intro")).toContainText(locale === "en" ? "separately installed" : "另行安装");
    await expect(comparison.locator(".comparison-source a")).toHaveAttribute("href", "https://github.com/phoenixzqy/zai-cli#how-zai-compares");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
