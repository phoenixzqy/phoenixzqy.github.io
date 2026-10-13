import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);
const template = (name) => readFile(new URL(`../install/templates/${name}.in`, import.meta.url), "utf8");
const messages = await template("messages.py");
const runner = (await template("run-installer.py")).replace("@MESSAGES_PYTHON@", () => messages.trimEnd());

test("Python and POSIX diagnostics use terminal colours and honour NO_COLOR and TERM=dumb", { skip: process.platform === "win32" }, async () => {
  const shell = await template("messages.sh");
  // Real pseudo-terminals verify stderr detection, with stdout still redirected.
  const driver = `import json, os, pty, subprocess, sys
payload = json.loads(sys.argv[1])
master, slave = pty.openpty()
try:
    result = subprocess.run(payload, stderr=slave, stdout=subprocess.PIPE)
finally:
    os.close(slave)
output = b""
while True:
    try:
        chunk = os.read(master, 4096)
    except OSError:
        break
    if not chunk:
        break
    output += chunk
os.close(master)
sys.stdout.buffer.write(output)
raise SystemExit(result.returncode)
`;
  for (const command of [["python3", "-B", "-c", messages + '\nzai_message("ERROR", "reason")\nzai_message("NEXT", "fix")'],
    ["sh", "-c", shell + '\nmessage ERROR reason\nmessage NEXT fix']]) {
    for (const setting of ["colour", "no-colour", "dumb"]) {
      const env = { ...process.env, TERM: setting === "dumb" ? "dumb" : "xterm-256color" };
      delete env.NO_COLOR;
      if (setting === "no-colour") env.NO_COLOR = "";
      const { stdout } = await run("python3", ["-B", "-c", driver, JSON.stringify(command)], { env });
      assert.match(stdout, /\[ERROR\].*reason/);
      assert.match(stdout, /\[NEXT\].*fix/);
      if (setting === "colour") assert.match(stdout, /\x1b\[1;31m/);
      else assert.doesNotMatch(stdout, /\x1b/);
    }
  }
});

test("bundled diagnostics remain live for prompts and preserve stdin and stdout", { timeout: 10000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "zai-message-test-"));
  let child;
  try {
    const script = join(directory, "install.py");
    await writeFile(script, 'import sys\nsys.stderr.write("Confirm? ")\nsys.stderr.flush()\nanswer = input()\nprint("answer:" + answer)\nsys.stderr.write("done\\n")\n');
    child = spawn("python3", ["-B", "-c", runner, "fixture installer", "file", script]);
    let stdout = "", stderr = "", answered = false;
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!answered && stderr.includes("Confirm? ")) {
        answered = true;
        child.stdin.end("yes\n");
      }
    });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    assert.equal(code, 0, stderr);
    assert.equal(stdout, "answer:yes\n");
    assert.equal(stderr, "[DETAIL] Confirm? done\n");
  } finally {
    if (child && child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
});

test("uncaught package exceptions retain the traceback and fail without claiming success", { timeout: 10000 }, async () => {
  const program = 'raise RuntimeError("fixture exception")';
  // Feed source through a real stdin pipe, as the codex wrappers do.
  const child = spawn("python3", ["-B", "-c", runner, "fixture installer", "stdin"]);
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end(program);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  assert.equal(code, 1);
  assert.match(stderr, /\[DETAIL\] Traceback/);
  assert.match(stderr, /\[ERROR\] fixture exception/);
  assert.match(stderr, /\[FAIL\].*exit 1/);
  assert.match(stderr, /\[NEXT\]/);
});

async function runBundled(program, mode = "stdin") {
  const directory = await mkdtemp(join(tmpdir(), "zai-message-exit-test-"));
  let child;
  try {
    const args = ["-B", "-c", runner, "fixture installer", mode];
    if (mode === "file") {
      const script = join(directory, "install.py");
      await writeFile(script, program);
      args.push(script);
    }
    child = spawn("python3", args);
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end(mode === "stdin" ? program : undefined);
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    return { code, stdout, stderr };
  } finally {
    if (child && child.exitCode === null) child.kill();
    await rm(directory, { recursive: true, force: true });
  }
}

test("codex staged rename permission failures retain recovery guidance through its real SystemExit boundary", { timeout: 10000 }, async () => {
  const codex = await template("zai-codex.py");
  const boundary = '\nif __name__ == "__main__":\n';
  const index = codex.lastIndexOf(boundary);
  assert.ok(index > 0, "Codex installer has its expected main exception boundary");
  // Exercise the real install() rename and the unchanged source catch/rethrow.
  // Package verification is outside this diagnostics regression's scope.
  const program = codex.slice(0, index) + `
from unittest.mock import patch

def main():
    with tempfile.TemporaryDirectory(prefix="zai-message-codex-") as temporary:
        root = Path(temporary)
        with patch.dict(globals(), {
            "verified_extract": lambda *args: None,
            "validate_package": lambda *args: None,
        }), patch.object(Path, "rename", side_effect=PermissionError("fixture staged rename denied")) as rename:
            try:
                install(root / "fixture.zip", "0" * 64, "zai-codex-v0.1.0",
                        "x86_64-pc-windows-msvc", root / "releases", root / "bin/codex.cmd")
            finally:
                assert rename.call_count == 1
` + codex.slice(index);
  const result = await runBundled(program);
  assert.equal(result.code, 1, result.stderr);
  assert.match(result.stderr, /\[ERROR\] fixture staged rename denied/);
  assert.match(result.stderr, /\[FAIL\].*exit 1/);
  assert.match(result.stderr, /\[WARN\].*Windows Defender/);
  assert.match(result.stderr, /\[NEXT\] Wait a minute and rerun/);
  assert.doesNotMatch(result.stderr, /\[DETAIL\] Traceback|\[OK\]/);
  assert.equal(result.stdout, "");
});

test("typed exception-chain diagnostics preserve other installer exit behavior", { timeout: 20000 }, async (t) => {
  const cases = [
    { name: "success", program: "raise SystemExit()", code: 0 },
    { name: "integer exit", program: "raise SystemExit(7)", code: 7 },
    { name: "string exit is not classified by wording", program: 'raise SystemExit("PermissionError: access denied")', code: 1, reason: "PermissionError: access denied" },
    { name: "other caught OSError", program: 'try:\n    raise FileNotFoundError("missing package")\nexcept OSError as error:\n    raise SystemExit(str(error))', code: 1, reason: "missing package" },
    { name: "interruption", program: "raise KeyboardInterrupt()", code: 130, reason: "Installation interrupted." },
    { name: "uncaught permission error", program: 'raise PermissionError("direct denial")', code: 1, permission: true, reason: "direct denial", traceback: true },
    { name: "explicit permission cause", program: 'raise SystemExit(9) from PermissionError("explicit denial")', code: 9, permission: true },
    { name: "wrapped permission context", program: 'try:\n    try:\n        raise PermissionError("wrapped denial")\n    except PermissionError:\n        raise RuntimeError("wrapper")\nexcept RuntimeError:\n    raise SystemExit("wrapped failure")', code: 1, permission: true, reason: "wrapped failure" },
    { name: "cyclic unrelated chain", program: 'error = RuntimeError("cyclic failure")\nerror.__context__ = error\nraise SystemExit(4) from error', code: 4 },
  ];
  for (const mode of ["stdin", "file"]) {
    for (const fixture of cases) {
      await t.test(`${mode}: ${fixture.name}`, async () => {
        const { code, stdout, stderr } = await runBundled(fixture.program, mode);
        assert.equal(code, fixture.code, stderr);
        assert.equal(stdout, "");
        assert.doesNotMatch(stderr, /\[OK\]/);
        if (code === 0) assert.equal(stderr, "");
        else assert.match(stderr, new RegExp(`\\[FAIL\\].*exit ${fixture.code}`));
        if (fixture.reason) assert.ok(stderr.includes(`[ERROR] ${fixture.reason}`), stderr);
        else assert.doesNotMatch(stderr, /\[ERROR\]/);
        if (fixture.permission) {
          assert.match(stderr, /\[WARN\].*Windows Defender/);
          assert.match(stderr, /\[NEXT\] Wait a minute and rerun/);
        } else assert.doesNotMatch(stderr, /Windows Defender|Wait a minute/);
        if (fixture.traceback) assert.match(stderr, /\[DETAIL\] Traceback/);
        else assert.doesNotMatch(stderr, /\[DETAIL\] Traceback/);
      });
    }
  }
});


test("PowerShell wrappers restore strict error handling and check native program status", async () => {
  for (const name of ["install-python.ps1", "uninstaller.ps1", "zai-codex.ps1"]) {
    const source = await template(name);
    assert.match(source, /\$ErrorActionPreference = 'Continue'[\s\S]*\$LASTEXITCODE[\s\S]*finally \{\s*\$ErrorActionPreference = 'Stop'/);
    assert.match(source, /if \(\$(?:installer|uninstaller)ExitCode -ne 0\) \{\s*exit \$(?:installer|uninstaller)ExitCode/);
  }
});
