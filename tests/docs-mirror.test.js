import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDocsIndex } from "../apps/schema.js";
import { validateSite } from "../scripts/validate-apps.mjs";
import { catalog } from "./apps-fixtures.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sources = JSON.parse(readFileSync(join(root, "apps/docs/sources.json"), "utf8"));
const app = { id: "zai-gitter" };

function index(overrides = {}) {
  return {
    schemaVersion: 1,
    appId: "zai-gitter",
    repository: "phoenixzqy/zai-gitter",
    ref: "origin/main",
    commit: "f".repeat(40),
    documents: [{ slug: "docs--user-guide", file: "docs--user-guide.md", title: "User guide", source: "docs/user-guide.md", bytes: 10 }],
    assets: [],
    ...overrides,
  };
}

test("a documentation index only addresses files inside its own mirror", () => {
  assert.equal(validateDocsIndex(index(), app).documents.length, 1);
  const cases = [
    ["another app", { appId: "zai-cli" }, /appId/],
    ["a parent path", { documents: [{ ...index().documents[0], file: "../../secret.md" }] }, /Markdown file/],
    ["an absolute path", { documents: [{ ...index().documents[0], file: "/etc/passwd" }] }, /Markdown file/],
    ["a non-Markdown file", { documents: [{ ...index().documents[0], file: "payload.js" }] }, /Markdown file/],
    ["an escaping asset", { assets: ["assets/../../secret.png"] }, /assets\//],
    ["a short commit", { commit: "abc1234" }, /commit hash/],
    ["a foreign repository url", { repository: "https://example.invalid/x" }, /owner\/name/],
    ["no documents", { documents: [] }, /1–200 items/],
  ];
  for (const [label, overrides, pattern] of cases) {
    assert.throws(() => validateDocsIndex(index(overrides), app), pattern, label);
  }
});

test("every mirrored app is allowlisted and records the commit it came from", () => {
  const documented = catalog.apps.filter((entry) => entry.documentation).map((entry) => entry.id);
  assert.deepEqual(documented, sources.apps.map((entry) => entry.appId));
  for (const source of sources.apps) {
    assert.match(source.commit, /^[0-9a-f]{40}$/, `${source.appId} records a source commit`);
    assert.match(source.repository, /^phoenixzqy\/[a-z-]+$/);
    assert.ok(source.include.length > 0, `${source.appId} mirrors at least one document`);
    for (const path of source.include) {
      assert.match(path, /\.md$/, `${source.appId}: ${path}`);
      assert.doesNotMatch(path, /^(\.github|AGENTS|CONTRIBUTING|CLAUDE|GEMINI)/, `${source.appId}: ${path} is contributor material`);
    }
    for (const excluded of source.excluded) {
      assert.ok(excluded.reason.length > 10, `${source.appId}: ${excluded.path} explains why it stays private`);
    }
  }
});

test("mirrored documents carry no private infrastructure references", () => {
  const forbidden = [/shared-internal-tools/i, /epi-platform/i, /ghp_[A-Za-z0-9]{16,}/, /https?:\/\/[^\s)"']*\.visualstudio\.com/i];
  for (const source of sources.apps) {
    const mirror = JSON.parse(readFileSync(join(root, "apps/docs", source.appId, "index.json"), "utf8"));
    for (const document_ of mirror.documents) {
      const text = readFileSync(join(root, "apps/docs", source.appId, document_.file), "utf8");
      for (const pattern of forbidden) {
        assert.doesNotMatch(text, pattern, `${source.appId}/${document_.file}`);
      }
    }
  }
});

test("mirrored links point at the viewer or lose their link entirely", () => {
  for (const source of sources.apps) {
    const mirror = JSON.parse(readFileSync(join(root, "apps/docs", source.appId, "index.json"), "utf8"));
    const slugs = new Set(mirror.documents.map((document_) => document_.slug));
    for (const document_ of mirror.documents) {
      const text = readFileSync(join(root, "apps/docs", source.appId, document_.file), "utf8");
      for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const target = match[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        assert.match(target, /^\?id=/, `${source.appId}/${document_.file} links to ${target}`);
        const params = new URLSearchParams(target.slice(1).split("#")[0]);
        assert.equal(params.get("id"), source.appId);
        assert.ok(slugs.has(params.get("doc")), `${target} resolves to a mirrored document`);
      }
    }
  }
});

// Only runs where the private checkout is available; the mirror itself is
// committed, so other environments still validate it through validateSite.
const gitterCheckout = join(process.env.HOME ?? "", "workspace/zai-gitter");
test("the committed mirror matches what the sync script produces", { skip: existsSync(join(gitterCheckout, ".git")) ? false : "zai-gitter checkout is not available" }, () => {
  const output = execFileSync(process.execPath, [
    join(root, "scripts/sync-app-docs.mjs"),
    "--check",
    "--repo", `zai-gitter=${gitterCheckout}`,
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  assert.match(output, /already up to date/);
});

test("validation rejects a half-finished or stale documentation mirror", async () => {
  const site = await mkdtemp(join(tmpdir(), "docs-mirror-test-"));
  try {
    const entry = catalog.apps.find((candidate) => candidate.documentation);
    const mirror = JSON.parse(readFileSync(join(root, "apps/docs", entry.id, "index.json"), "utf8"));
    const single = { schemaVersion: 1, apps: [{ ...structuredClone(entry), screenshots: undefined, videos: undefined, artwork: undefined }] };
    await mkdir(join(site, "releases", entry.id, "latest"), { recursive: true });
    await mkdir(join(site, "apps/docs", entry.id), { recursive: true });
    await writeFile(join(site, "apps/catalog.json"), JSON.stringify(single));
    await writeFile(join(site, "releases", entry.id, "latest/manifest.json"), JSON.stringify({ schemaVersion: 1, appId: entry.id, release: null }));
    await writeFile(join(site, "apps/docs/sources.json"), JSON.stringify({ schemaVersion: 1, apps: [{ appId: entry.id, repository: mirror.repository, ref: mirror.ref, commit: mirror.commit, include: [], excluded: [] }] }));
    await writeFile(join(site, "apps/docs", entry.id, "index.json"), JSON.stringify(mirror));
    await assert.rejects(validateSite(site), /documentation files are missing/);
    for (const document_ of mirror.documents) {
      await writeFile(join(site, "apps/docs", entry.id, document_.file), "# Test fixture\n");
    }
    assert.equal((await validateSite(site)).documents, mirror.documents.length);
    await writeFile(join(site, "apps/docs", entry.id, "stale.md"), "# Removed upstream\n");
    await assert.rejects(validateSite(site), /unlisted files/);
    await rm(join(site, "apps/docs", entry.id, "stale.md"));
    await writeFile(join(site, "apps/docs/sources.json"), JSON.stringify({ schemaVersion: 1, apps: [{ appId: entry.id, repository: mirror.repository, ref: mirror.ref, commit: "0".repeat(40), include: [], excluded: [] }] }));
    await assert.rejects(validateSite(site), /Re-run scripts\/sync-app-docs\.mjs/);
  } finally {
    await rm(site, { recursive: true });
  }
});
