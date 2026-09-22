import { test } from "node:test";
import assert from "node:assert/strict";
import { messages, translate, chooseLocale, localizeData } from "../apps/locales.js";
import { validateCatalog, validateManifest } from "../apps/schema.js";
import { catalog, releaseFixture } from "./apps-fixtures.js";

test("both UI dictionaries cover identical keys and interpolation parameters", () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages["zh-CN"]).sort());
  const parameters = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const key of Object.keys(messages.en)) {
    assert.ok(messages["zh-CN"][key].trim(), key);
    // Chinese count phrases do not need a separate grammatical unit.
    const english = parameters(messages.en[key]).filter((name) => name !== "unit");
    assert.deepEqual(parameters(messages["zh-CN"][key]).filter((name) => name !== "unit"), english, key);
  }
  assert.equal(translate("zh-CN", "titleAppReleases", { name: "BPlayer" }), "BPlayer 下载 | Qiyu Zhao");
  assert.throws(() => translate("zh-CN", "missing"), /Missing UI translation/);
  assert.throws(() => translate("en", "titleApp", {}), /Missing translation parameter/);
});

test("locale priority is explicit URL, saved choice, supported browser language, then English", () => {
  assert.equal(chooseLocale({ search: "?lang=en", saved: "zh-CN", languages: ["zh-CN"] }), "en");
  assert.equal(chooseLocale({ saved: "zh-CN", languages: ["en-US"] }), "zh-CN");
  assert.equal(chooseLocale({ languages: ["zh-TW"] }), "zh-CN");
  assert.equal(chooseLocale({ languages: ["fr-FR", "zh-CN"] }), "zh-CN");
  assert.equal(chooseLocale({ languages: ["en-GB", "zh-CN"] }), "en");
  assert.equal(chooseLocale({ search: "?lang=invalid", saved: "invalid", languages: ["fr"] }), "en");
});

test("localized publisher text is validated without translating package identities", () => {
  assert.equal(localizeData(validateCatalog(catalog), "zh-CN").apps[0].tagline, "你的媒体库，你的节奏。");
  const manifest = releaseFixture();
  manifest.release.notes = [{ en: "Release note", "zh-CN": "更新说明" }];
  manifest.release.assets[0].name = { en: "Windows package", "zh-CN": "Windows 安装包" };
  manifest.release.assets[0].installNotes = { en: "Keep the bundle together.", "zh-CN": "请保留完整的应用程序包。" };
  validateManifest(manifest, catalog.apps[0]);
  const localized = localizeData(manifest, "zh-CN");
  assert.equal(localized.release.notes[0], "更新说明");
  assert.equal(localized.release.assets[0].name, "Windows 安装包");
  for (const key of ["file", "bytes", "sha256", "signing", "platform", "architecture"]) {
    assert.equal(localized.release.assets[0][key], manifest.release.assets[0][key]);
  }
  assert.equal(localized.release.assets[1].url, manifest.release.assets[1].url);
  assert.equal(localizeData({ en: "English fallback" }, "zh-CN"), "English fallback");
  assert.equal(localizeData("Existing pipeline text", "zh-CN"), "Existing pipeline text");
});

test("malformed translations fail validation instead of silently using defaults", () => {
  for (const translation of [{ "zh-CN": "缺少英文" }, { en: "Name", "zh-CN": "" }, { en: "Name", fr: "Nom" }, { en: "Name", "zh-CN": { html: "<b>bad</b>" } }]) {
    const fixture = structuredClone(catalog);
    fixture.apps[0].tagline = translation;
    assert.throws(() => validateCatalog(fixture));
  }
  const manifest = releaseFixture();
  manifest.release.assets[0].file = { en: "package.zip", "zh-CN": "安装包.zip" };
  assert.throws(() => validateManifest(manifest, catalog.apps[0]), /basename/);
});
