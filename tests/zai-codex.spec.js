import { test, expect } from "@playwright/test";

test("zai-codex intro offers copyable install commands and published platform previews", async ({ page }) => {
  await page.goto("/apps/app/?id=zai-codex");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("zai-codex");
  await expect(page.getByRole("heading", { name: "GitHub Copilot subscriptions", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Remote telemetry and diagnostics disabled", exact: true })).toBeVisible();
  await expect(page.getByText("curl -fsSL https://phoenixzqy.github.io/install/zai-codex.sh | sh", { exact: true })).toBeVisible();
  await expect(page.getByText("irm https://phoenixzqy.github.io/install/zai-codex.ps1 | iex", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View releases & downloads" }).click();
  await expect(page.locator(".release-summary h2")).toContainText("0.1.0");
  await expect(page.locator(".download-link")).toHaveCount(3);
  await page.getByLabel("PLATFORM", { exact: true }).selectOption("linux");
  await expect(page.locator(".download-link")).toHaveCount(1);
  await expect(page.locator(".download-link")).toHaveAttribute("href", /zai-codex-v0\.1\.0\/zai-codex-0\.1\.0-x86_64-unknown-linux-gnu\.zip$/);
  await page.getByLabel("PLATFORM", { exact: true }).selectOption("macos");
  await expect(page.locator(".download-link")).toHaveCount(1);
  await expect(page.locator(".download-link")).toHaveAttribute("href", /zai-codex-v0\.1\.0\/zai-codex-0\.1\.0-aarch64-apple-darwin\.zip$/);
  await expect(page.getByText(/native macOS execution has not been tested/)).toBeVisible();
  await page.getByLabel("PLATFORM", { exact: true }).selectOption("windows");
  await expect(page.locator(".download-link")).toHaveCount(1);
  await expect(page.locator(".download-link")).toHaveAttribute("href", /zai-codex-v0\.1\.0\/zai-codex-0\.1\.0-x86_64-pc-windows-msvc\.zip$/);
});
