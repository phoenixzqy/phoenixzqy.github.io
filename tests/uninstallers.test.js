import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { buildInstallers } from "../scripts/build-installers.mjs";

const run = promisify(execFile);
const root = new URL("../", import.meta.url);

test("published uninstallers match templates", async () => {
  const files = await buildInstallers();
  for (const [path, content] of files) {
    assert.equal(await readFile(new URL(path, root), "utf8"), content, path);
  }
});

test("uninstallers remove only app-owned files and PATH entries", async () => {
  await run("python3", ["-B", "tests/test_uninstall.py"], { cwd: root, timeout: 30000 });
});

test("POSIX uninstallers parse and support one-fetch piping", async () => {
  for (const id of ["zai-cli", "zai-editor", "zai-gitter"]) {
    await run("sh", ["-n", `uninstall/${id}.sh`], { cwd: root });
    const script = await readFile(new URL(`uninstall/${id}.sh`, root), "utf8");
    assert.ok(script.includes("python3 - \"$@\" <<'ZAI_UNINSTALL_PYTHON'"));
    const home = await mkdtemp(join(tmpdir(), "zai-uninstall-pipe-"));
    try {
      await mkdir(join(home, ".zai"));
      const executable = id === "zai-cli" ? "zai" : id;
      await writeFile(join(home, ".zai", executable), "fixture");
      const env = { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config") };
      for (const key of Object.keys(env)) if (key.startsWith("ZAI_")) delete env[key];
      const result = await run("sh", ["-c", 'cat "$1" | sh -s -- --dry-run', "uninstall-test", `uninstall/${id}.sh`], { cwd: root, env });
      assert.match(result.stdout, /Would remove/);
      assert.match(result.stderr, /\[OK\] Dry run complete/);
      assert.match(result.stderr, /\[NEXT\].*rerun without --dry-run/);
      assert.equal(await readFile(join(home, ".zai", executable), "utf8"), "fixture");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }
});

test("all uninstaller entrypoints label unsafe-path failures and offer safe recovery", async () => {
  const home = await mkdtemp(join(tmpdir(), "zai-uninstall-message-"));
  try {
    const env = { ...process.env, HOME: home, USERPROFILE: home, NO_COLOR: "1" };
    for (const key of Object.keys(env)) if (key.startsWith("ZAI_")) delete env[key];
    for (const id of ["zai-cli", "zai-editor", "zai-gitter"]) {
      for (const [command, path] of [["sh", `uninstall/${id}.sh`], ["python3", `uninstall/${id}.py`]]) {
        await assert.rejects(run(command, [path, "--install-dir", home], { cwd: root, env }), (error) => {
          assert.equal(error.code, 1);
          assert.match(error.stderr, /\[ERROR\] Refusing unsafe cleanup path:/);
          assert.match(error.stderr, /\[FAIL\].*uninstall failed/);
          assert.match(error.stderr, /\[NEXT\].*--dry-run.*do not bypass/);
          assert.doesNotMatch(error.stderr, /\x1b|\[OK\]/);
          return true;
        });
      }
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
