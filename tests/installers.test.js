import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scratchRoot = join(root, ".test-scratch");
const shellInstaller = join(root, "install", "zai-cli.sh");
const powershellInstaller = join(root, "install", "zai-cli.ps1");
const APP_ID = "zai-cli";
const VERSION = "1.2.3";

function which(command) {
  return (process.env.PATH ?? "").split(":").some((entry) => entry && existsSync(join(entry, command)));
}

const shellTools = ["curl", "unzip", "python3"].filter((tool) => !which(tool));
const powershellMissing = which("pwsh") ? false : "pwsh is required to run the Windows installer";

async function scratch(prefix) {
  await mkdir(scratchRoot, { recursive: true });
  return mkdtemp(join(scratchRoot, `${prefix}-`));
}

// The published archive holds the package contents at its root, including the
// install.py entry point the installer runs. The stand-in records how it was
// invoked so the test can assert the forwarded arguments and working directory.
async function buildArchive(directory, file, { exitCode = 0 } = {}) {
  const source = join(directory, "package");
  await mkdir(source, { recursive: true });
  await writeFile(
    join(source, "install.py"),
    [
      "import json, os, sys",
      "record = {'arguments': sys.argv[1:], 'cwd': os.getcwd(), 'installDir': os.environ.get('ZAI_INSTALL_DIR', '')}",
      "open(os.environ['INSTALL_RECORD'], 'w').write(json.dumps(record))",
      `sys.exit(${exitCode})`,
    ].join("\n"),
    "utf8",
  );
  const archive = join(directory, file);
  await run("python3", [
    "-c",
    "import shutil,sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2])",
    archive.replace(/\.zip$/, ""),
    source,
  ]);
  const bytes = await readFile(archive);
  return { archive, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function manifestFor(file, sha256, overrides = {}) {
  const asset = {
    name: "zai CLI Linux x64",
    platform: "linux",
    architecture: "x64",
    file,
    bytes: 1,
    sha256,
    signing: "unsigned",
    installNotes: "Test fixture only.",
    ...overrides.asset,
  };
  return {
    schemaVersion: 1,
    appId: APP_ID,
    release: { version: VERSION, channel: "preview", publishedAt: "2026-09-22T12:00:00Z", notes: ["Test fixture."], assets: [asset] },
    ...overrides.manifest,
  };
}

async function serve(routes) {
  const server = createServer((request, response) => {
    const body = routes[request.url.split("?")[0]];
    if (!body) {
      response.writeHead(404).end("not found");
      return;
    }
    if (typeof body === "object" && !Buffer.isBuffer(body)) {
      response.writeHead(body.status, { Location: body.location }).end();
    } else {
      response.writeHead(200).end(body);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

// The installer asks the operating system which package it needs, so the tests
// drive that answer instead of depending on the machine they run on.
async function unameShim(directory, system, machine) {
  const bin = join(directory, "bin");
  await mkdir(bin, { recursive: true });
  const shim = join(bin, "uname");
  await writeFile(shim, `#!/bin/sh\ncase "$1" in\n-s) echo "${system}" ;;\n-m) echo "${machine}" ;;\nesac\n`, "utf8");
  await chmod(shim, 0o700);
  return bin;
}

// PowerShell decorates and gutter-wraps error output, so read the message back
// as one plain line.
function plain(text) {
  return text
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/\n\s*\|\s*/g, " ")
    .replace(/[ \t]+/g, " ");
}

async function installWith({ manifest, archive, archiveExit = 0, system = "Linux", machine = "x86_64", args = [], env = {}, shell = "sh", configureRoutes }) {
  const directory = await scratch("install");
  try {
    const built = await buildArchive(directory, archive ?? `${APP_ID}-${VERSION}-linux-amd64.zip`, { exitCode: archiveExit });
    const body = manifest(built);
    const routes = {
      "/releases/zai-cli/latest/manifest.json": JSON.stringify(body),
      [`/releases/zai-cli/latest/${built.archive.split("/").pop()}`]: built.bytes,
      "/downloads/package.zip": built.bytes,
    };
    const site = await serve(routes);
    configureRoutes?.(routes, site);
    const staging = join(directory, "staging");
    const cwd = join(directory, "cwd");
    const record = join(directory, "record.json");
    await mkdir(staging, { recursive: true });
    await mkdir(cwd, { recursive: true });
    try {
      const bin = await unameShim(directory, system, machine);
      const command = await invocation(shell, directory, args);
      const result = await run(command[0], command.slice(1), {
        cwd,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          TMPDIR: staging,
          TMP: staging,
          TEMP: staging,
          PROCESSOR_ARCHITECTURE: machine === "arm64" ? "ARM64" : "AMD64",
          PROCESSOR_ARCHITEW6432: "",
          INSTALL_RECORD: record,
          ZAI_RELEASE_METADATA_URL: `${site.base}/releases/zai-cli/latest/manifest.json`,
          ZAI_INSTALL_DIR: "",
          ...env,
        },
      }).then(
        (ok) => ({ code: 0, ...ok }),
        (error) => ({ code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? String(error) }),
      );
      return {
        ...result,
        stderr: plain(result.stderr),
        staging: await readdir(staging),
        workingDirectory: await readdir(cwd),
        record: existsSync(record) ? JSON.parse(await readFile(record, "utf8")) : null,
        siteBase: site.base,
      };
    } finally {
      await site.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// Windows users run the installer both ways: piped into the shell from the web
// and as a downloaded file, as an updater does.
async function invocation(shell, directory, args) {
  if (shell === "sh") return ["sh", shellInstaller, ...args];
  if (shell === "pwsh") return ["pwsh", "-NoProfile", "-File", powershellInstaller, ...args];
  const driver = join(directory, "driver.ps1");
  await writeFile(
    driver,
    [
      "$ErrorActionPreference = 'Continue'",
      "$installer = 'caller variable'",
      `Get-Content -LiteralPath ${JSON.stringify(powershellInstaller)} -Raw | Invoke-Expression`,
      "if ($installer -ne 'caller variable' -or $ErrorActionPreference -ne 'Continue') {",
      "    throw 'The installer changed the caller''s variables or preferences.'",
      "}",
    ].join("\n"),
    "utf8",
  );
  return ["pwsh", "-NoProfile", "-File", driver];
}

test("the shell installer is inert until its final line invokes the installer", async () => {
  const script = await readFile(shellInstaller, "utf8");
  const lines = script.trimEnd().split("\n");
  assert.equal(lines.at(-1), 'zai_cli_install "$@"');
  assert.equal(script.split("\n").filter((line) => line === 'zai_cli_install "$@"').length, 1);
  const directory = await scratch("truncated");
  try {
    // A piped shell cannot observe a failed or truncated transfer, so every
    // prefix of the published script must do nothing at all.
    const marker = join(directory, "executed");
    const truncated = script.slice(0, script.lastIndexOf("zai_cli_install \"$@\""));
    await run("sh", ["-c", truncated], { cwd: directory, env: { ...process.env, MARKER: marker } });
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the shell installer verifies, installs, and cleans up", { skip: shellTools.length ? `missing ${shellTools}` : false }, async () => {
  const result = await installWith({
    manifest: ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256),
    args: ["--on-conflict", "keep"],
  });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.record.arguments, ["--on-conflict", "keep"]);
  assert.deepEqual(result.staging, []);
  assert.deepEqual(result.workingDirectory, []);
});

test("the shell installer refuses a package whose bytes changed", { skip: shellTools.length ? `missing ${shellTools}` : false }, async () => {
  const result = await installWith({
    manifest: ({ archive }) => manifestFor(archive.split("/").pop(), "b".repeat(64)),
  });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Checksum mismatch/);
  assert.equal(result.record, null);
  assert.deepEqual(result.staging, []);
});

test("the shell installer rejects non-loopback HTTP metadata overrides", { skip: shellTools.length ? `missing ${shellTools}` : false }, async () => {
  const result = await installWith({
    manifest: ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256),
    env: { ZAI_RELEASE_METADATA_URL: "http://example.com/releases/zai-cli/latest/manifest.json" },
  });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /downloads must use HTTPS/);
  assert.equal(result.record, null);
  assert.deepEqual(result.staging, []);
});

test("the shell installer reports an unpublished app instead of installing nothing quietly", { skip: shellTools.length ? `missing ${shellTools}` : false }, async () => {
  const result = await installWith({
    manifest: () => ({ schemaVersion: 1, appId: APP_ID, release: null }),
  });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /no public release has been published yet/i);
  assert.equal(result.record, null);
});

test("the shell installer rejects metadata that points somewhere else", { skip: shellTools.length ? `missing ${shellTools}` : false }, async (t) => {
  const cases = [
    ["another host", ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256, { asset: { url: "https://example.com/zai.zip" } })],
    ["a private repository", ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256, { asset: { url: "https://github.com/example/private/releases/download/v1/zai.zip" } })],
    ["a mismatched filename", ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256, { asset: { url: "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/zai-cli-v1.2.3/other.zip" } })],
    ["another application", ({ archive, sha256 }) => ({ ...manifestFor(archive.split("/").pop(), sha256), appId: "bplayer" })],
  ];
  for (const [name, manifest] of cases) {
    await t.test(name, async () => {
      const result = await installWith({ manifest });
      assert.notEqual(result.code, 0);
      assert.equal(result.record, null);
      assert.deepEqual(result.staging, []);
    });
  }
});

test("the shell installer only installs a package built for this machine", { skip: shellTools.length ? `missing ${shellTools}` : false }, async (t) => {
  const manifest = ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256);
  await t.test("macOS asks for the macos package", async () => {
    const result = await installWith({ manifest, system: "Darwin", machine: "arm64" });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /no published package for macos arm64/i);
  });
  await t.test("an unknown system is refused", async () => {
    const result = await installWith({ manifest, system: "SunOS", machine: "x86_64" });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /operating system/i);
  });
  await t.test("an unknown architecture is refused", async () => {
    const result = await installWith({ manifest, system: "Linux", machine: "mips" });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /architecture/i);
  });
});

test("the shell installer forwards the requested install directory", { skip: shellTools.length ? `missing ${shellTools}` : false }, async (t) => {
  const manifest = ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256);
  await t.test("from the environment", async () => {
    const result = await installWith({ manifest, env: { ZAI_INSTALL_DIR: "/opt/zai" } });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.record.arguments, ["--install-dir", "/opt/zai"]);
  });
  await t.test("without overriding an explicit argument", async () => {
    const result = await installWith({ manifest, env: { ZAI_INSTALL_DIR: "/opt/zai" }, args: ["--install-dir=/opt/chosen"] });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.record.arguments, ["--install-dir=/opt/chosen"]);
  });
});

test("the PowerShell installer keeps the same contract for Windows", async () => {
  const script = await readFile(powershellInstaller, "utf8");
  assert.equal(script.trimEnd().split("\n").at(-1), "Install-ZaiCli @args");
  assert.equal(script.split("\n").filter((line) => line.startsWith("Install-ZaiCli ")).length, 1);
  assert.match(script, /https:\/\/phoenixzqy\.github\.io\/releases\/zai-cli\/latest\/manifest\.json/);
  assert.match(script, /https:\/\/github\.com\/phoenixzqy\/phoenixzqy\.github\.io\/releases\/download\//);
  // The download is verified before it is extracted, the bundled entry point is
  // required, and the staging directory is always removed.
  assert.match(script, /Get-FileHash .*-Algorithm SHA256/);
  assert.ok(script.indexOf("Get-FileHash") < script.indexOf("Expand-Archive"));
  assert.match(script, /install\.py/);
  assert.match(script, /finally \{\s*\n\s*Remove-Item/);
  assert.match(script, /downloads must use HTTPS/);
  assert.doesNotMatch(script, /\bexit\s+\$LASTEXITCODE\b/);
});

test("a truncated PowerShell installer does nothing", { skip: powershellMissing }, async () => {
  const script = await readFile(powershellInstaller, "utf8");
  const directory = await scratch("truncated-ps");
  try {
    const truncated = join(directory, "truncated.ps1");
    await writeFile(truncated, script.slice(0, script.lastIndexOf("Install-ZaiCli @args")), "utf8");
    const result = await run("pwsh", ["-NoProfile", "-File", truncated], { cwd: directory });
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "");
    assert.deepEqual(await readdir(directory), ["truncated.ps1"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const windowsManifest = ({ archive, sha256 }) =>
  manifestFor(archive.split("/").pop(), sha256, { asset: { platform: "windows", architecture: "x64", name: "zai CLI Windows x64" } });

test("the PowerShell installer verifies, installs, and cleans up", { skip: powershellMissing }, async (t) => {
  for (const shell of ["pwsh", "pwsh-iex"]) {
    await t.test(shell, async () => {
      const args = shell === "pwsh" ? ["--on-conflict", "keep"] : [];
      const result = await installWith({ manifest: windowsManifest, args, shell });
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(result.record.arguments, args);
      assert.deepEqual(result.staging, []);
      assert.deepEqual(result.workingDirectory, []);
    });
  }
});

test("the PowerShell installer stops on metadata and checksum problems", { skip: powershellMissing }, async (t) => {
  const cases = [
    ["a package whose bytes changed", ({ archive }) => manifestFor(archive.split("/").pop(), "b".repeat(64), { asset: { platform: "windows", architecture: "x64" } }), /checksum mismatch/i],
    ["an unpublished app", () => ({ schemaVersion: 1, appId: APP_ID, release: null }), /no public release has been published yet/i],
    ["another host", ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256, { asset: { platform: "windows", architecture: "x64", url: "https://example.com/zai.zip" } }), /public release downloads/i],
    ["a mismatched filename", ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256, { asset: { platform: "windows", architecture: "x64", url: "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/zai-cli-v1.2.3/other.zip" } }), /does not match this package/i],
    ["another application", ({ archive, sha256 }) => ({ ...manifestFor(archive.split("/").pop(), sha256, { asset: { platform: "windows", architecture: "x64" } }), appId: "bplayer" }), /another application/i],
    ["a package for another machine", ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256), /no published package for windows x64/i],
  ];
  for (const [name, manifest, message] of cases) {
    await t.test(name, async () => {
      const result = await installWith({ manifest, shell: "pwsh" });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, message);
      assert.equal(result.record, null);
      assert.deepEqual(result.staging, []);
      assert.deepEqual(result.workingDirectory, []);
    });
  }
});

test("the PowerShell installer rejects non-loopback HTTP metadata overrides", { skip: powershellMissing }, async () => {
  const result = await installWith({
    manifest: windowsManifest, shell: "pwsh",
    env: { ZAI_RELEASE_METADATA_URL: "http://example.com/releases/zai-cli/latest/manifest.json" },
  });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /downloads must use HTTPS/);
  assert.equal(result.record, null);
});

test("the PowerShell installer rejects unsafe redirects before requesting their target", { skip: powershellMissing }, async (t) => {
  for (const [name, route, location, message] of [
    ["manifest HTTP redirect", "/releases/zai-cli/latest/manifest.json", "http://127.0.0.1:1/manifest.json", /downloads must use HTTPS/],
    ["manifest foreign host", "/releases/zai-cli/latest/manifest.json", "https://example.com/manifest.json", /untrusted host/],
    ["archive HTTP redirect", "/releases/zai-cli/latest/zai-cli-1.2.3-linux-amd64.zip", "http://127.0.0.1:1/package.zip", /downloads must use HTTPS/],
    ["archive foreign host", "/releases/zai-cli/latest/zai-cli-1.2.3-linux-amd64.zip", "https://example.com/package.zip", /untrusted host/],
  ]) {
    await t.test(name, async () => {
      const result = await installWith({
        manifest: windowsManifest, shell: "pwsh",
        configureRoutes: (routes) => { routes[route] = { status: 302, location }; },
      });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, message);
      assert.equal(result.record, null);
      assert.deepEqual(result.staging, []);
    });
  }
});

test("the PowerShell installer forwards the requested install directory", { skip: powershellMissing }, async (t) => {
  await t.test("from the environment", async () => {
    const result = await installWith({ manifest: windowsManifest, env: { ZAI_INSTALL_DIR: "C:\\zai" }, shell: "pwsh" });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.record.arguments, ["--install-dir", "C:\\zai"]);
  });
  await t.test("without overriding an explicit argument", async () => {
    const result = await installWith({ manifest: windowsManifest, env: { ZAI_INSTALL_DIR: "C:\\zai" }, args: ["--install-dir", "C:\\chosen"], shell: "pwsh" });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.record.arguments, ["--install-dir", "C:\\chosen"]);
  });
  await t.test("splitting a joined option so PowerShell cannot swallow it", async () => {
    const result = await installWith({ manifest: windowsManifest, args: ["--on-conflict=keep"], shell: "pwsh" });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(result.record.arguments, ["--on-conflict", "keep"]);
  });
});

test("a failing package installer is reported, not swallowed", { skip: shellTools.length ? `missing ${shellTools}` : false }, async (t) => {
  await t.test("sh", async () => {
    const result = await installWith({ manifest: ({ archive, sha256 }) => manifestFor(archive.split("/").pop(), sha256), archiveExit: 42 });
    assert.equal(result.code, 42);
    assert.deepEqual(result.staging, []);
  });
  await t.test("pwsh", { skip: powershellMissing }, async () => {
    const result = await installWith({ manifest: windowsManifest, archiveExit: 42, shell: "pwsh" });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /exited with code 42/);
    assert.deepEqual(result.staging, []);
  });
});
