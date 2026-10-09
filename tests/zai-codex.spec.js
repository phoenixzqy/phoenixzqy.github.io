import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const { release } = JSON.parse(readFileSync(new URL("../releases/zai-codex/latest/manifest.json", import.meta.url), "utf8"));

test("zai-codex intro offers copyable install commands and published platform previews", async ({ page }) => {
  await page.goto("/apps/app/?id=zai-codex");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("zai-codex");
  await expect(page.getByRole("heading", { name: "GitHub Copilot subscriptions", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Remote telemetry and diagnostics disabled", exact: true })).toBeVisible();
  await expect(page.getByText("curl -fsSL https://phoenixzqy.github.io/install/zai-codex.sh | sh", { exact: true })).toBeVisible();
  await expect(page.getByText("irm https://phoenixzqy.github.io/install/zai-codex.ps1 | iex", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "View releases & downloads" }).click();
  await expect(page.locator(".release-summary h2")).toHaveText(`Version ${release.version}`);
  await expect(page.locator(".download-link")).toHaveCount(release.assets.length);
  const platforms = [...new Set(release.assets.map(({ platform }) => platform))];
  await expect(page.getByLabel("PLATFORM", { exact: true }).locator("option")).toHaveCount(platforms.length + 1);
  for (const platform of platforms) {
    const assets = release.assets.filter((asset) => asset.platform === platform);
    await page.getByLabel("PLATFORM", { exact: true }).selectOption(platform);
    await expect(page.locator(".download-link")).toHaveCount(assets.length);
    for (const [index, asset] of assets.entries()) {
      const card = page.locator(".package-card").nth(index);
      await expect(card.locator(".download-link")).toHaveAttribute("href", asset.url);
      await expect(card.locator(".package-notes")).toHaveText(asset.installNotes);
      await expect(card.locator(".checksum code")).toHaveText(asset.sha256);
    }
  }
});
