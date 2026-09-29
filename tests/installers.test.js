import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildInstallers, INSTALLERS } from "../scripts/build-installers.mjs";
import { createZip } from "./zip-fixture.js";

const run = promisify(execFile);
const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installerPath = (name) => join(siteRoot, "install", name);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function manifest(appId, assets) {
  return { schemaVersion: 1, appId, release: {
    version: "0.1.0",
    channel: "preview",
    publishedAt: "2026-09-22T12:00:00Z",
    notes: ["Test-only release metadata."],
    assets,
  } };
}

function asset(platform, architecture, file, bytes) {
  return {
    name: `Test package for ${platform}`,
    platform,
    architecture,
    file,
    bytes: bytes.length,
    sha256: sha256(bytes),
    signing: "unsigned",
    installNotes: "Test fixture only.",
  };
}

// Serves a manifest and its packages the way GitHub Pages does, so the shell
// installers exercise real HTTP downloads rather than a mocked transport.
async function withServer(files, body) {
  const server = createServer((request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    const content = files.get(path);
    if (!content) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "content-length": content.length }).end(content);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    return await body(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((done) => server.close(done));
  }
}

async function withHome(body) {
  const home = await mkdtemp(join(tmpdir(), "zai-installer-home-"));
  try {
    return await body(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

async function runInstaller(script, { manifestUrl, home, installDir, args = [] }) {
  try {
    const { stdout, stderr } = await run("sh", [installerPath(script), ...args], {
      env: {
        PATH: process.env.PATH,
        HOME: home,
        SHELL: "/bin/bash",
        ZAI_RELEASE_MANIFEST_URL: manifestUrl,
        ...(installDir ? { ZAI_INSTALL_DIR: installDir } : {}),
      },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

test("every published installer is generated from the shared templates", async () => {
  for (const [path, content] of await buildInstallers()) {
    assert.equal(await readFile(join(siteRoot, path), "utf8"), content,
      `${path} is stale. Run "npm run build:installers".`);
  }
});

test("shell installers are self-contained, fail-safe, and honour the documented overrides", async () => {
  for (const { appId } of INSTALLERS) {
    const script = await readFile(installerPath(`${appId}.sh`), "utf8");
    const label = `${appId}.sh`;
    assert.match(script, /^#!\/bin\/sh\n/, label);
    assert.match(script, /\nset -eu\n/, label);
    assert.match(script, /trap cleanup EXIT HUP INT TERM/, label);
    assert.match(script, /ZAI_INSTALL_DIR/, label);
    assert.match(script, /ZAI_RELEASE_MANIFEST_URL/, label);
    assert.match(script, /sha256sum[\s\S]*shasum -a 256/, label);
    assert.match(script, /unzip[\s\S]*bsdtar[\s\S]*python3 -m zipfile/, label);
    assert.match(script, /x86_64 \| amd64[\s\S]*aarch64 \| arm64/, label);
    // A piped installer cannot read sibling files, and bash-only syntax breaks dash.
    assert.doesNotMatch(script, /^\s*(?:\.|source)\s+\S*templates/m, label);
    const shellOnly = script.replace(/awk -v[\s\S]*?\n' "\$MANIFEST"\)"/, "");
    assert.doesNotMatch(shellOnly, /\[\[\s|\bdeclare\s+-|\becho\s+-e\b|\$\{[A-Za-z_]+\[|\$'/, label);
    // dash is the strictest POSIX shell commonly used as /bin/sh.
    await run("dash", ["-n", installerPath(`${appId}.sh`)]).catch(() =>
      run("sh", ["-n", installerPath(`${appId}.sh`)]));
  }
});

test("PowerShell installers stay compatible with Windows PowerShell 5.1", async () => {
  for (const { appId, executable } of INSTALLERS) {
    const script = await readFile(installerPath(`${appId}.ps1`), "utf8");
    const label = `${appId}.ps1`;
    assert.match(script, /#Requires -Version 5\.1/, label);
    assert.match(script, /SecurityProtocolType\]::Tls12/, label);
    assert.match(script, /Get-FileHash -Path \$archive -Algorithm SHA256/, label);
    assert.match(script, /Expand-Archive/, label);
    // The user PATH is edited through the registry so REG_EXPAND_SZ entries
    // such as %USERPROFILE%\bin keep their unexpanded form and value kind.
    assert.match(script, /Registry\]::CurrentUser\.OpenSubKey\('Environment', \$true\)/, label);
    assert.match(script, /DoNotExpandEnvironmentNames/, label);
    assert.match(script, /\$key\.SetValue\('Path', \$updated, \$kind\)/, label);
    assert.doesNotMatch(script, /SetEnvironmentVariable\('Path'/, label);
    assert.match(script, /RuntimeInformation\]::OSArchitecture/, label);
    assert.match(script, /PROCESSOR_ARCHITECTURE/, label);
    assert.match(script, /ZAI_INSTALL_DIR/, label);
    assert.match(script, /ZAI_RELEASE_MANIFEST_URL/, label);
    assert.match(script, new RegExp(`\\$executable = '${executable}\\.exe'`), label);
    // PowerShell 7 dropped these Windows PowerShell-only aliases and switches.
    assert.doesNotMatch(script, /\bwget\b|\bcurl\b|Invoke-WebRequest[^\n]*-UseDefaultCredentials/, label);
    assert.equal((script.match(/\{/g) ?? []).length, (script.match(/\}/g) ?? []).length, `${label} braces`);
  }
});

test("the shell installer verifies, extracts, and installs a published package", async () => {
  const bytes = createZip({
    "zai-editor-0.1.0-linux-x64/zai-editor": "#!/bin/sh\necho test-only fixture\n",
    "zai-editor-0.1.0-linux-x64/LICENSE": "Apache License 2.0 (test fixture)\n",
  });
  const file = "zai-editor-0.1.0-linux-x64.zip";
  const files = new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-editor", [
      asset("linux", "x64", file, bytes),
      asset("linux", "arm64", "zai-editor-0.1.0-linux-arm64.zip", Buffer.from("other")),
    ]), null, 2))],
    [`/${file}`, bytes],
  ]);
  await withServer(files, (origin) => withHome(async (home) => {
    const installDir = join(home, "installed");
    const first = await runInstaller("zai-editor.sh", { manifestUrl: `${origin}/manifest.json`, home, installDir });
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /Verified SHA-256/);
    const installed = join(installDir, "zai-editor");
    assert.equal((await stat(installed)).mode & 0o111, 0o111);
    assert.match(await readFile(installed, "utf8"), /test-only fixture/);
    assert.match(await readFile(join(installDir, "licenses/zai-editor/LICENSE"), "utf8"), /Apache License/);

    const profile = join(home, ".profile");
    const line = `export PATH="${installDir}:$PATH"  # Added by zai installer`;
    assert.equal((await readFile(profile, "utf8")).split("\n").filter((entry) => entry === line).length, 1);
    const second = await runInstaller("zai-editor.sh", { manifestUrl: `${origin}/manifest.json`, home, installDir });
    assert.equal(second.code, 0, second.stderr);
    assert.equal((await readFile(profile, "utf8")).split("\n").filter((entry) => entry === line).length, 1,
      "the PATH update must be idempotent");
  }));
});

test("a checksum mismatch is rejected and nothing is installed", async () => {
  const bytes = createZip({ "zai-gitter": "#!/bin/sh\nexit 0\n" });
  const file = "zai-gitter-0.1.0-linux-x64.zip";
  const tampered = manifest("zai-gitter", [asset("linux", "x64", file, bytes)]);
  tampered.release.assets[0].sha256 = "0".repeat(64);
  const files = new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(tampered, null, 2))],
    [`/${file}`, bytes],
  ]);
  await withServer(files, (origin) => withHome(async (home) => {
    const installDir = join(home, "installed");
    const result = await runInstaller("zai-gitter.sh", { manifestUrl: `${origin}/manifest.json`, home, installDir });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /SHA-256 verification failed/);
    assert.match(result.stderr, /nothing was installed/i);
    await assert.rejects(stat(join(installDir, "zai-gitter")), /ENOENT/);
  }));
});

test("a declared byte count that does not match the download is rejected", async () => {
  const bytes = createZip({ "zai-gitter": "#!/bin/sh\nexit 0\n" });
  const file = "zai-gitter-0.1.0-linux-x64.zip";
  const wrong = manifest("zai-gitter", [asset("linux", "x64", file, bytes)]);
  wrong.release.assets[0].bytes = bytes.length + 10;
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(wrong, null, 2))],
    [`/${file}`, bytes],
  ]), (origin) => withHome(async (home) => {
    const result = await runInstaller("zai-gitter.sh", { manifestUrl: `${origin}/manifest.json`, home, installDir: join(home, "installed") });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /bytes but the manifest declares/);
  }));
});

test("an unpublished release explains itself and exits non-zero", async () => {
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify({ schemaVersion: 1, appId: "zai-gitter", release: null }, null, 2))],
  ]), (origin) => withHome(async (home) => {
    const result = await runInstaller("zai-gitter.sh", { manifestUrl: `${origin}/manifest.json`, home, installDir: join(home, "installed") });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /No public release of zai-gitter has been published yet/);
    assert.equal(result.stdout, "");
  }));
});

test("a release without a package for this machine names the pages that list what exists", async () => {
  const bytes = createZip({ "zai-gitter": "#!/bin/sh\nexit 0\n" });
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(
      manifest("zai-gitter", [asset("windows", "arm64", "zai-gitter-0.1.0-windows-arm64.zip", bytes)]), null, 2))],
  ]), (origin) => withHome(async (home) => {
    const result = await runInstaller("zai-gitter.sh", { manifestUrl: `${origin}/manifest.json`, home, installDir: join(home, "installed") });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /no package for linux\/x64/);
  }));
});

test("an unreachable manifest fails instead of installing a stale or partial build", async () => {
  await withServer(new Map(), (origin) => withHome(async (home) => {
    const result = await runInstaller("zai-editor.sh", { manifestUrl: `${origin}/missing.json`, home, installDir: join(home, "installed") });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /download failed/);
  }));
});

test("the zai installer runs install.py from the archive root and forwards arguments", async () => {
  const bytes = createZip({
    // The published archive keeps its entry point at the root, beside the
    // library it imports, and ships other Python files that must not be run.
    "install.py":
      "import sys, pathlib\n" +
      "pathlib.Path(sys.argv[1]).write_text(' '.join(sys.argv[2:]))\n" +
      "print('installed: fixture')\n",
    "_installer.py": "# bundled library\n",
    "install_path.py": "raise SystemExit('the wrong script ran')\n",
    ".copilot/scripts/install.py": "raise SystemExit('the wrong script ran')\n",
  });
  const file = "zai-0.1.0-linux-x64.zip";
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-cli", [asset("linux", "x64", file, bytes)]), null, 2))],
    [`/${file}`, bytes],
  ]), (origin) => withHome(async (home) => {
    const receipt = join(home, "receipt.txt");
    const result = await runInstaller("zai-cli.sh", {
      manifestUrl: `${origin}/manifest.json`, home, args: [receipt, "--install-copilot", "no"],
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /installed: fixture/);
    assert.equal(await readFile(receipt, "utf8"), "--install-copilot no");
  }));
});

test("the zai installer refuses an archive without install.py at its root", async () => {
  const bytes = createZip({ "zai-0.1.0-linux-x64/install.py": "print('nested')\n" });
  const file = "zai-0.1.0-linux-x64.zip";
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-cli", [asset("linux", "x64", file, bytes)]), null, 2))],
    [`/${file}`, bytes],
  ]), (origin) => withHome(async (home) => {
    const result = await runInstaller("zai-cli.sh", { manifestUrl: `${origin}/manifest.json`, home });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /did not contain 'install\.py' at its root/);
  }));
});

test("installers refuse insecure URLs unless a manifest override is in effect", async () => {
  await withHome(async (home) => {
    const result = await runInstaller("zai-editor.sh", { manifestUrl: "", home, installDir: join(home, "installed") });
    assert.equal(result.code, 1);
    // With no override the script falls back to its own HTTPS site URL, so the
    // insecure-URL guard only has to hold for values it is given.
    assert.match(result.stderr, /download failed|non-HTTPS/);
  });
  const script = await readFile(installerPath("zai-editor.sh"), "utf8");
  assert.match(script, /refusing to download over a non-HTTPS URL/);
});

test("fixture archives round-trip through the extraction tools the installer uses", async () => {
  const bytes = createZip({ "a.txt": "alpha", "nested/b.txt": "beta" });
  const directory = await mkdtemp(join(tmpdir(), "zai-zip-"));
  try {
    const archive = join(directory, "fixture.zip");
    await writeFile(archive, bytes);
    await run("python3", ["-m", "zipfile", "-e", archive, join(directory, "out")]);
    assert.equal(await readFile(join(directory, "out/nested/b.txt"), "utf8"), "beta");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
