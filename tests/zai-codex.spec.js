import { test, expect } from "@playwright/test";

test("zai-codex intro offers copyable install commands and honest first-release status", async ({ page }) => {
  await page.goto("/apps/app/?id=zai-codex");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("zai-codex");
  await expect(page.getByRole("heading", { name: "GitHub Copilot subscriptions", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Remote telemetry and diagnostics disabled", exact: true })).toBeVisible();
  await expect(page.getByText("curl -fsSL https://phoenixzqy.github.io/install/zai-codex.sh | sh", { exact: true })).toBeVisible();
  await expect(page.getByText("irm https://phoenixzqy.github.io/install/zai-codex.ps1 | iex", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View releases & downloads" }).click();
  await expect(page.getByRole("heading", { name: "Not released here. Yet.", exact: true })).toBeVisible();
  await expect(page.locator(".download-link")).toHaveCount(0);
});
