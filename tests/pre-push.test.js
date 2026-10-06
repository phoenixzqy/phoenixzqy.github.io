import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { classify, pathScope, runGate } from "../scripts/pre-push.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "site-push-"));
  t.after(() => rmSync(root, { recursive: true }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && key !== "NODE_TEST_CONTEXT"));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  const commit = (name, content) => {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
    git("add", "--", name);
    git("commit", "-qm", "fixture");
  };
  commit("script.js", "const value = 1;");
  const base = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", base);
  const updates = (remote = base) => `refs/heads/test ${git("rev-parse", "HEAD")} refs/heads/test ${remote}\n`;
  return { root, git, commit, base, updates };
}

test("only contributor prose and mirrored docs have reduced validation", () => {
  for (const path of ["README.md", "AGENTS.md", ".github/skills/example/SKILL.md",
    "releases/README.md", "releases/zai-codex/README.md", "scripts/app-release/README.md"]) {
    assert.equal(pathScope(path), "documentation", path);
  }
  for (const path of ["apps/docs/zai-cli/guide.md", "apps/docs/sources.json", "apps/docs/zai-cli/assets/demo.png"]) {
    assert.equal(pathScope(path), "mirror", path);
  }
  for (const path of ["script.js", "styles.css", "index.html", "apps/catalog.json", "apps/schema.js",
    "apps/vendor/marked/LICENSE.md", "apps/docs/page.html", ".githooks/pre-push",
    "scripts/pre-push.mjs", "package.json", "package-lock.json", "tests/example.test.js"]) {
    assert.equal(pathScope(path), "full", path);
  }
});

test("existing and new docs-only branches run reduced checks", (t) => {
  const f = fixture(t);
  f.commit("README.md", "# Readme");
  assert.equal(classify(f.root, f.updates()).scope, "documentation");
  assert.equal(classify(f.root, f.updates("0".repeat(40))).scope, "documentation");
  const calls = [];
  runGate(f.root, f.updates(), (args) => calls.push(args));
  assert.deepEqual(calls, [["node", "--test", "tests/pre-push.test.js"]]);
});

test("mirrored documentation retains integrity and privacy tests", (t) => {
  const f = fixture(t);
  f.commit("apps/docs/zai-cli/guide.md", "# Guide");
  const calls = [];
  runGate(f.root, f.updates(), (args) => calls.push(args));
  assert.deepEqual(calls, [
    ["node", "--test", "tests/pre-push.test.js"],
    ["npm", "run", "validate:apps"],
    ["node", "--test", "tests/docs-mirror.test.js"],
  ]);
});

test("an earlier code commit and reverted code still run the full suite", (t) => {
  const f = fixture(t);
  f.commit("script.js", "const value = 2;");
  f.commit("README.md", "# Readme");
  assert.equal(classify(f.root, f.updates()).scope, "full");
  f.commit("script.js", "const value = 1;");
  const calls = [];
  runGate(f.root, f.updates(), (args) => calls.push(args));
  assert.deepEqual(calls, [["npm", "test"]]);
});

test("all ref updates participate in classification", (t) => {
  const f = fixture(t);
  f.commit("script.js", "const value = 2;");
  const code = f.git("rev-parse", "HEAD");
  f.commit("README.md", "# Readme");
  assert.equal(classify(f.root, f.updates(code) + f.updates()).scope, "full");
});

test("missing history and empty commits default to full validation", (t) => {
  const f = fixture(t);
  f.commit("README.md", "# Readme");
  assert.equal(classify(f.root, f.updates("f".repeat(40))).scope, "full");
  f.git("update-ref", "-d", "refs/remotes/origin/main");
  assert.equal(classify(f.root, f.updates("0".repeat(40))).scope, "full");
  const before = f.git("rev-parse", "HEAD");
  f.git("commit", "--allow-empty", "-qm", "empty");
  assert.equal(classify(f.root, f.updates(before)).scope, "full");
});

test("force pushes default to full validation", (t) => {
  const f = fixture(t);
  f.commit("README.md", "# Readme");
  const current = f.git("rev-parse", "HEAD");
  f.git("checkout", "--orphan", "other");
  f.git("commit", "-qm", "other");
  const other = f.git("rev-parse", "HEAD");
  f.git("checkout", current);
  assert.equal(classify(f.root, f.updates(other)).scope, "full");
});

test("renaming site code to Markdown cannot hide the source change", (t) => {
  const f = fixture(t);
  f.git("mv", "script.js", "README.md");
  f.git("commit", "-qm", "rename");
  assert.equal(classify(f.root, f.updates()).scope, "full");
});

test("deleted prose, annotated tags, and unusual names are handled", (t) => {
  const f = fixture(t);
  f.commit("README.md", "# Readme");
  f.git("tag", "-a", "before", "-m", "before");
  const tag = f.git("rev-parse", "before");
  f.git("rm", "README.md");
  f.git("commit", "-qm", "delete");
  assert.equal(classify(f.root, f.updates(tag)).scope, "documentation");
  f.commit("apps/docs/example/a space.md", "# Guide");
  assert.equal(classify(f.root, f.updates(tag)).scope, "mirror");
});

test("executable documentation cannot take the reduced path", (t) => {
  const f = fixture(t);
  f.commit("README.md", "# Readme");
  f.git("update-index", "--chmod=+x", "README.md");
  f.git("commit", "-qm", "mode");
  assert.equal(classify(f.root, f.updates()).scope, "full");
});

test("dirty worktree and wrong push tips are rejected", (t) => {
  const f = fixture(t);
  f.commit("README.md", "# Readme");
  const updates = f.updates();
  writeFileSync(join(f.root, "README.md"), "# Dirty");
  assert.throws(() => runGate(f.root, updates, () => assert.fail("must not run")), /clean/);
  f.git("checkout", "--", "README.md");
  assert.throws(() => runGate(f.root, `refs/heads/test ${f.base} refs/heads/test ${"0".repeat(40)}\n`, () => {}), /HEAD/);
});

test("HEAD and cleanliness are checked after validation", (t) => {
  const f = fixture(t);
  f.commit("README.md", "# Readme");
  assert.throws(() => runGate(f.root, f.updates(), () => {
    writeFileSync(join(f.root, "untracked"), "dirty");
  }), /clean/);
});

test("failed validation blocks and deletions do not run commands", (t) => {
  const f = fixture(t);
  f.commit("README.md", "# Readme");
  assert.throws(() => runGate(f.root, f.updates(), () => { throw new Error("test failure"); }), /test failure/);
  runGate(f.root, `refs/heads/test ${"0".repeat(40)} refs/heads/test ${f.base}\n`, () => assert.fail("deletion"));
  assert.throws(() => classify(f.root, "malformed"), /Malformed/);
});

test("installed hook blocks a real docs-only push when its selected check fails", (t) => {
  const f = fixture(t);
  const remote = mkdtempSync(join(tmpdir(), "site-push-remote-"));
  t.after(() => rmSync(remote, { recursive: true }));
  f.git("init", "--bare", remote);
  const source = new URL("../scripts/pre-push.mjs", import.meta.url);
  f.commit("scripts/pre-push.mjs", readFileSync(source, "utf8"));
  f.commit(".githooks/pre-push", readFileSync(new URL("../.githooks/pre-push", import.meta.url), "utf8"));
  f.commit("tests/pre-push.test.js", "throw new Error('selected doc check failed');\n");
  f.git("update-index", "--chmod=+x", ".githooks/pre-push");
  f.git("commit", "-qm", "hook mode");
  // Establish the remote baseline before installing the fixture hook.
  f.git("push", remote, "HEAD:refs/heads/test");
  const before = f.git("rev-parse", "HEAD");
  f.git("config", "core.hooksPath", ".githooks");
  chmodSync(join(f.root, ".githooks/pre-push"), 0o755);
  f.commit("README.md", "# Readme");
  assert.throws(() => f.git("push", remote, "HEAD:refs/heads/test"), (error) => {
    assert.match(error.stderr.toString(), /selected doc check failed|Required npm validation failed/);
    return true;
  });
  assert.equal(f.git("--git-dir=" + remote, "rev-parse", "refs/heads/test"), before);
});
