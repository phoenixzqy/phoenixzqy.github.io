import { test, expect } from '@playwright/test';

for (const [lang, label] of [['en', 'Licenses and third-party notices'], ['zh-CN', '许可证与第三方声明']]) {
  test(`Codex notices load on keyboard expansion in ${lang}`, async ({ page }) => {
    let requests = 0;
    page.on('request', request => { if (request.url().endsWith('/apps/notices/zai-codex.txt')) requests++; });
    const manifest = await (await page.request.get('/releases/zai-codex/latest/manifest.json')).json();
    await page.goto(`/apps/app/?id=zai-codex&lang=${lang}`);
    const summary = page.locator('.license-notices summary');
    await expect(summary).toHaveText(label);
    expect(requests).toBe(0);
    await summary.focus();
    await summary.press('Enter');
    await expect(page.locator('.license-notice-text')).toContainText('third-party-notices/');
    await expect(page.locator('.license-notice-text')).toContainText(`zai-codex ${manifest.release.version}`);
    await expect(page.locator('.license-notices a')).toHaveAttribute('href', '/apps/notices/zai-codex.txt');
    expect(requests).toBe(1);
  });
}

test('a notice download failure keeps the direct file link available', async ({ page }) => {
  await page.route('**/apps/notices/zai-codex.txt', route => route.fulfill({ status: 503, body: '' }));
  await page.goto('/apps/app/?id=zai-codex&lang=en');
  await page.locator('.license-notices summary').click();
  await expect(page.locator('.license-notices').getByRole('status')).toContainText('Could not load the notices');
  await expect(page.getByRole('link', { name: 'Open the notice file' })).toBeVisible();
});
