import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateCatalog, validateManifest, assetHref, MAX_LOCAL_BYTES } from "../apps/schema.js";
import { validateSite } from "../scripts/validate-apps.mjs";
import { catalog, releaseFixture, packageBytes } from "./apps-fixtures.js";

const app = catalog.apps[0];

test("catalog supports additional apps without new page implementations", () => {
  const otherApp = { ...structuredClone(app), id: "second-app", name: "Second app", screenshots: undefined };
  assert.equal(validateCatalog({ schemaVersion: 1, apps: [app, otherApp] }).apps.length, 2);
  assert.throws(() => validateCatalog({ schemaVersion: 1, apps: [app, app] }), /unique/);
  assert.throws(() => validateCatalog({ schemaVersion: 2, apps: [app] }), /schemaVersion/);
});

test("catalog accepts app-owned screenshots and rejects unsafe media paths", () => {
  const fixture = structuredClone(catalog);
  assert.equal(validateCatalog(fixture).apps[0].screenshots.length, 2);
  fixture.apps[0].screenshots[0].src = "/apps/media/another-app/private.png";
  assert.throws(() => validateCatalog(fixture), /app-owned image/);
});

test("unpublished releases are explicit, not missing metadata", () => {
  assert.equal(validateManifest({ schemaVersion: 1, appId: "bplayer", release: null }, app).release, null);
  assert.throws(() => validateManifest({ schemaVersion: 1, appId: "bplayer" }, app), /Release must be an object/);
  assert.throws(() => validateManifest({ schemaVersion: 1, appId: "other", release: null }, app), /appId/);
});

test("release contract accepts local packages and large public release assets", () => {
  const manifest = validateManifest(releaseFixture(), app);
  assert.equal(assetHref(app.id, manifest.release.assets[0]), "/releases/bplayer/latest/BPlayer-1.2.3-windows-x64.zip");
  assert.equal(assetHref(app.id, manifest.release.assets[1]), manifest.release.assets[1].url);
});

test("release contract rejects unsafe or unusable package metadata", async (t) => {
  const cases = [
    ["parent path", (asset) => { asset.file = "../secret.zip"; }],
    ["encoded path", (asset) => { asset.file = "%2e%2e%2fsecret.zip"; }],
    ["source file", (asset) => { asset.file = "source.dart"; }],
    ["HTML file", (asset) => { asset.file = "page.html"; }],
    ["bad checksum", (asset) => { asset.sha256 = "not-a-hash"; }],
    ["empty package", (asset) => { asset.bytes = 0; }],
    ["oversized local package", (asset) => { asset.bytes = MAX_LOCAL_BYTES + 1; }],
    ["unknown platform", (asset) => { asset.platform = "unknown"; }],
    ["unknown signing", (asset) => { asset.signing = "trusted"; }],
    ["missing installation notes", (asset) => { asset.installNotes = ""; }],
    ["script URL", (asset) => { asset.url = "javascript:alert(1)"; }],
    ["other host", (asset) => { asset.url = "https://example.com/package.zip"; }],
    ["private repository link", (asset) => { asset.url = "https://github.com/example/private/releases/download/v1/package.zip"; }],
    ["token in URL", (asset) => { asset.url = "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/v1/BPlayer-1.2.3-windows-x64.zip?token=secret"; }],
    ["mismatched remote file", (asset) => { asset.url = "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/v1/other.zip"; }],
    ["normalized remote traversal", (asset) => { asset.url = "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/v1/../v2/BPlayer-1.2.3-windows-x64.zip"; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const fixture = releaseFixture();
      mutate(fixture.release.assets[0]);
      assert.throws(() => validateManifest(fixture, app));
    });
  }
});

test("release contract accepts explicit ad-hoc signing", () => {
  const fixture = releaseFixture();
  fixture.release.assets[0].signing = "ad-hoc";
  assert.equal(validateManifest(fixture, app).release.assets[0].signing, "ad-hoc");
});

test("release contract validates dates, versions, and duplicate filenames", () => {
  for (const value of ["2026-02-30T00:00:00Z", "not-a-date", "2026-09-22"]) {
    const fixture = releaseFixture();
    fixture.release.publishedAt = value;
    assert.throws(() => validateManifest(fixture, app), /timestamp/);
  }
  const fixture = releaseFixture();
  fixture.release.version = "latest";
  assert.throws(() => validateManifest(fixture, app), /version/);
  fixture.release.version = "1.2.3";
  fixture.release.assets.push({ ...fixture.release.assets[0] });
  assert.throws(() => validateManifest(fixture, app), /unique/);
});

async function withSite(run) {
  const root = await mkdtemp(join(tmpdir(), "resume-release-test-"));
  try {
    const folder = join(root, "releases/bplayer/latest");
    await mkdir(join(root, "apps"), { recursive: true });
    await mkdir(folder, { recursive: true });
    const manifest = releaseFixture();
    await writeFile(join(root, "apps/catalog.json"), JSON.stringify(catalog));
    await writeFile(join(folder, "manifest.json"), JSON.stringify(manifest));
    await writeFile(join(folder, manifest.release.assets[0].file), packageBytes);
    await run(root, folder, manifest);
  } finally {
    await rm(root, { recursive: true });
  }
}

test("pipeline validator verifies real local bytes and checksums", async () => {
  await withSite(async (root, folder, manifest) => {
    assert.deepEqual(await validateSite(root), { apps: 1, localBytes: packageBytes.length });
    await writeFile(join(folder, manifest.release.assets[0].file), Buffer.alloc(packageBytes.length));
    await assert.rejects(validateSite(root), /SHA-256/);
    await writeFile(join(folder, manifest.release.assets[0].file), "short");
    await assert.rejects(validateSite(root), /byte count/);
  });
});

test("pipeline validator rejects missing, unlisted, and symlinked files", async () => {
  await withSite(async (root, folder, manifest) => {
    const packagePath = join(folder, manifest.release.assets[0].file);
    await writeFile(join(folder, "private-source.txt"), "test-only unlisted fixture");
    await assert.rejects(validateSite(root), /unlisted files/);
    await rm(join(folder, "private-source.txt"));
    await rm(packagePath);
    await assert.rejects(validateSite(root), /ENOENT/);
    await symlink(join(root, "apps/catalog.json"), packagePath);
    await assert.rejects(validateSite(root), /regular file/);
  });
});

test("unpublished folders cannot silently publish stray packages", async () => {
  await withSite(async (root, folder) => {
    await writeFile(join(folder, "manifest.json"), JSON.stringify({ schemaVersion: 1, appId: "bplayer", release: null }));
    await assert.rejects(validateSite(root), /unlisted files/);
  });
});
