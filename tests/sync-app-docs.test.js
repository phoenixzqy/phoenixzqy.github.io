import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function fixture() {
  const fixtureRoot = join(root, `.test-sync-app-docs-${process.pid}-${Date.now()}`);
  const site = join(fixtureRoot, "site");
  const source = join(fixtureRoot, "source");
  mkdirSync(join(site, "scripts"), { recursive: true });
  mkdirSync(join(site, "apps/docs"), { recursive: true });
  mkdirSync(join(source, "docs"), { recursive: true });
  copyFileSync(join(root, "scripts/sync-app-docs.mjs"), join(site, "scripts/sync-app-docs.mjs"));
  writeFileSync(join(source, "docs/guide_(v2).md"), "# Guide\n");
  writeFileSync(join(source, "docs/index.md"), [
    "# Index",
    "",
    "[Parenthesized](guide_(v2).md)",
    "[Reference][guide]",
    "[guide]",
    "[Unavailable][private]",
    "",
    "[guide]: guide_(v2).md \"Guide\"",
    "[private]: private-notes.md",
    "",
    "`[Inline code](guide_(v2).md)`",
    "",
    "```md",
    "[Fenced code][guide]",
    "```",
    "",
  ].join("\n"));
  git(source, "init", "--quiet");
  git(source, "config", "user.name", "Test");
  git(source, "config", "user.email", "test@example.invalid");
  git(source, "add", ".");
  git(source, "commit", "--quiet", "-m", "fixture");
  const commit = git(source, "rev-parse", "HEAD");
  writeFileSync(join(site, "apps/docs/sources.json"), `${JSON.stringify({
    schemaVersion: 1,
    apps: [{
      appId: "sample",
      repository: "example/sample",
      ref: "HEAD",
      commit: "0".repeat(40),
      syncedAt: "2000-01-01T00:00:00Z",
      include: ["docs/index.md", "docs/guide_(v2).md"],
      excluded: [],
    }],
  }, null, 2)}\n`);
  return { fixtureRoot, site, source, commit };
}

function sync(site, source, ...args) {
  return execFileSync(process.execPath, [
    join(site, "scripts/sync-app-docs.mjs"),
    ...args,
    "--repo", `sample=${source}`,
  ], { cwd: site, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

test("documentation sync rewrites Markdown links but leaves code untouched", () => {
  const { fixtureRoot, site, source } = fixture();
  try {
    sync(site, source);
    const mirrored = readFileSync(join(site, "apps/docs/sample/docs--index.md"), "utf8");
    const viewer = "?id=sample&doc=docs--guide_-v2-";
    assert.match(mirrored, new RegExp(`\\[Parenthesized\\]\\(${viewer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
    assert.match(mirrored, /\[Reference\]\[guide\]/);
    assert.match(mirrored, /\[guide\]/);
    assert.match(mirrored, new RegExp(`^\\[guide\\]: ${viewer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} "Guide"$`, "m"));
    assert.match(mirrored, /^Unavailable$/m);
    assert.doesNotMatch(mirrored, /private-notes|^\[private\]:/m);
    assert.match(mirrored, /`\[Inline code\]\(guide_\(v2\)\.md\)`/);
    assert.match(mirrored, /```md\n\[Fenced code\]\[guide\]\n```/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("--check compares source metadata and repeated syncs preserve syncedAt", () => {
  const { fixtureRoot, site, source, commit } = fixture();
  try {
    sync(site, source);
    const first = readFileSync(join(site, "apps/docs/sources.json"), "utf8");
    const metadata = JSON.parse(first);
    assert.equal(metadata.apps[0].commit, commit);
    assert.notEqual(metadata.apps[0].syncedAt, "2000-01-01T00:00:00Z");
    assert.match(sync(site, source, "--check"), /already up to date/);
    sync(site, source);
    assert.equal(readFileSync(join(site, "apps/docs/sources.json"), "utf8"), first);

    metadata.apps[0].commit = "0".repeat(40);
    writeFileSync(join(site, "apps/docs/sources.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    assert.throws(
      () => sync(site, source, "--check"),
      (error) => error.status === 1 && /update apps\/docs\/sources\.json/.test(error.stdout),
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
