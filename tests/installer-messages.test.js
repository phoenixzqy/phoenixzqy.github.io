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


test("PowerShell wrappers restore strict error handling and check native program status", async () => {
  for (const name of ["install-python.ps1", "uninstaller.ps1", "zai-codex.ps1"]) {
    const source = await template(name);
    assert.match(source, /\$ErrorActionPreference = 'Continue'[\s\S]*\$LASTEXITCODE[\s\S]*finally \{\s*\$ErrorActionPreference = 'Stop'/);
    assert.match(source, /if \(\$(?:installer|uninstaller)ExitCode -ne 0\) \{\s*exit \$(?:installer|uninstaller)ExitCode/);
  }
});
