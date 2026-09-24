import { test, expect } from "@playwright/test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

for (const format of ["A4", "Letter"]) {
  test(`${format} PDF retains the complete resume in two unclipped pages`, async ({ page }, testInfo) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".earlier-experience")).not.toHaveAttribute("open", "");
    const path = testInfo.outputPath(`resume-${format}.pdf`);
    const bytes = await page.pdf({ path, format });
    await testInfo.attach(`resume-${format}`, { path, contentType: "application/pdf" });
    await expect(page.locator(".earlier-experience")).not.toHaveAttribute("open", "");

    const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
    try {
      const pdf = await loading.promise;
      expect(pdf.numPages).toBe(2);
      const pages = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const pdfPage = await pdf.getPage(number);
        const viewport = pdfPage.getViewport({ scale: 1 });
        const content = await pdfPage.getTextContent();
        const items = content.items.filter((item) => "str" in item && item.str.trim()).map((item) => ({
          text: item.str,
          left: item.transform[4],
          right: item.transform[4] + item.width,
          top: viewport.height - item.transform[5] - item.height,
          bottom: viewport.height - item.transform[5],
        }));
        const text = items.map((item) => item.text).join(" ").replace(/\s+/g, " ");
        // A third page containing only contact links must not replace full pages.
        expect(text.length).toBeGreaterThan(500);
        const margin = 16 * 72 / 25.4;
        for (const item of items) {
          expect(item.left, item.text).toBeGreaterThanOrEqual(margin - 1);
          expect(item.right, item.text).toBeLessThanOrEqual(viewport.width - margin + 1);
          expect(item.top, item.text).toBeGreaterThanOrEqual(margin - 1);
          expect(item.bottom, item.text).toBeLessThanOrEqual(viewport.height - margin + 1);
        }
        pages.push({ items, text });
      }

      const fullText = pages.map(({ text }) => text).join(" ");
      for (const text of [
        "Qiyu Zhao", "Always building. Always evolving.", "Member of Technical Staff",
        "Senior Software Engineer", "Fortinet", "Cozystay", "Intelli Management Group",
        "Lecture Assistant", "Langara College", "Yippon Marketing", "Shanghai High Wind",
        "Iowa State University", "LinkedIn", "GitHub",
      ]) {
        expect(fullText).toContain(text);
      }
      for (const [company, role, date] of [
        ["Microsoft", "Member of Technical Staff", "JUL 2021"],
        ["Fortinet", "Full Stack Web Developer 2", "APR 2018"],
        ["Cozystay", "Full Stack Web Developer", "OCT 2016"],
      ]) {
        const printedPage = pages.find(({ items }) => items.some(({ text }) => text === company));
        expect(printedPage, company).toBeDefined();
        const companyText = printedPage.items.find(({ text }) => text === company);
        const roleText = printedPage.items.find(({ text }) => text === role);
        const dateText = printedPage.items.find(({ text, left }) => text.startsWith(date) && left < roleText?.left);
        expect(roleText, role).toBeDefined();
        expect(dateText, date).toBeDefined();
        expect(Math.abs(companyText.top - roleText.top)).toBeLessThan(5);
        expect(dateText.top).toBeGreaterThanOrEqual(companyText.bottom);
        expect(dateText.right).toBeLessThan(roleText.left);
      }
    } finally {
      await loading.destroy();
    }
  });
}
