import { test, expect } from "@playwright/test";

test("each zai app exposes localized uninstall commands and cleanup boundaries", async ({ page }) => {
  for (const id of ["zai-cli", "zai-editor", "zai-gitter"]) {
    for (const lang of ["en", "zh-CN"]) {
      await page.goto(`/apps/app/?id=${id}&lang=${lang}`);
      await expect(page.getByRole("heading", { name: lang === "en" ? "Uninstall and remove app data" : "卸载并清理应用数据" })).toBeVisible();
      await expect(page.locator("code").filter({ hasText: `/uninstall/${id}.sh` })).toContainText("https://phoenixzqy.github.io/");
      await expect(page.locator("code").filter({ hasText: `/uninstall/${id}.ps1` })).toContainText("| iex");
      await expect(page.getByText(lang === "en" ? /For a preview without deleting anything/ : /仅预览、不删除/)).toBeVisible();
    }
  }
});
