import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, readlink, rm, stat, symlink, writeFile } from "node:fs/promises";
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
    if (content.redirect) {
      response.writeHead(302, { Location: content.redirect }).end();
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

const shellPath = (await run("sh", ["-c", "command -v sh"])).stdout.trim();
const zshAvailable = await run(shellPath, ["-c", "command -v zsh"]).then(() => true).catch(() => false);
const fishAvailable = await run(shellPath, ["-c", "command -v fish"]).then(() => true).catch(() => false);

async function runInstaller(script, { manifestUrl, home, installDir, path = process.env.PATH, args = [], shell = "/bin/bash", parentShell, envOverrides = {} }) {
  try {
    const { stdout, stderr } = await run(parentShell ?? shellPath,
      parentShell ? ["-c", 'sh "$1"; result=$?; exit "$result"', parentShell, installerPath(script)] : [installerPath(script), ...args], {
      env: {
        PATH: path,
        HOME: home,
        SHELL: shell,
        ZAI_RELEASE_MANIFEST_URL: manifestUrl,
        ...(installDir ? { ZAI_INSTALL_DIR: installDir } : {}),
        ...envOverrides,
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
  for (const { appId } of INSTALLERS.filter(({ mode }) => mode !== "codex")) {
    const script = await readFile(installerPath(`${appId}.sh`), "utf8");
    const label = `${appId}.sh`;
    assert.match(script, /^#!\/bin\/sh\n/, label);
    assert.match(script, /\nset -eu\n/, label);
    assert.match(script, /trap cleanup EXIT HUP INT TERM/, label);
    assert.match(script, /ZAI_INSTALL_DIR/, label);
    assert.match(script, /ZAI_RELEASE_MANIFEST_URL/, label);
    assert.match(script, /sha256sum[\s\S]*shasum -a 256/, label);
    assert.match(script, /unzip[\s\S]*bsdtar[\s\S]*\"\$PYTHON\" -m zipfile/, label);
    assert.match(script, /\"\$PYTHON\" - "\$MANIFEST"[\s\S]*json\.load\(manifest_file\)/, label);
    assert.match(script, /x86_64 \| amd64[\s\S]*aarch64 \| arm64/, label);
    // macOS /bin/sh (Bash 3.2) includes adjacent UTF-8 bytes in unbraced
    // variable names, so punctuation can trigger an unbound-variable error.
    assert.doesNotMatch(script, /\$[A-Za-z_][A-Za-z_0-9]*[^\x00-\x7f]/, label);
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
  for (const { appId, executable } of INSTALLERS.filter(({ mode }) => mode !== "codex")) {
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
    const line = `export PATH='${installDir}':"$PATH"  # Added by zai installer`;
    assert.equal((await readFile(profile, "utf8")).split("\n").filter((entry) => entry === line).length, 1);
    const second = await runInstaller("zai-editor.sh", { manifestUrl: `${origin}/manifest.json`, home, installDir });
    assert.equal(second.code, 0, second.stderr);
    assert.equal((await readFile(profile, "utf8")).split("\n").filter((entry) => entry === line).length, 1,
      "the PATH update must be idempotent");
  }));
});

test("standalone installers replace only their own app in a family installation", async () => {
  for (const appId of ["zai-editor", "zai-gitter"]) {
    const bytes = createZip(Object.fromEntries(["zai", "zai-editor", "zai-gitter"].map((app) =>
      [app, `#!/bin/sh\necho package-${app}\n`])));
    const file = `${appId}-0.1.0-linux-x64.zip`;
    await withServer(new Map([
      ["/manifest.json", Buffer.from(JSON.stringify(manifest(appId, [asset("linux", "x64", file, bytes)])))],
      [`/${file}`, bytes],
    ]), (origin) => withHome(async (home) => {
      const installDir = join(home, "installed");
      await mkdir(installDir);
      for (const app of ["zai", "zai-editor", "zai-gitter"]) {
        await writeFile(join(installDir, app), `existing-${app}`, { mode: 0o755 });
      }
      const result = await runInstaller(`${appId}.sh`, { manifestUrl: `${origin}/manifest.json`, home, installDir });
      assert.equal(result.code, 0, result.stderr);
      for (const app of ["zai", "zai-editor", "zai-gitter"]) {
        const actual = await readFile(join(installDir, app), "utf8");
        assert.equal(actual, app === appId ? `#!/bin/sh\necho package-${app}\n` : `existing-${app}`);
      }
    }));
  }
});

test("the shell installer parses minified manifests with localized asset text", async () => {
  const bytes = createZip({ "zai-editor": "#!/bin/sh\necho localized fixture\n" });
  const file = "zai-editor-0.1.0-linux-x64.zip";
  const localized = manifest("zai-editor", [
    {
      ...asset("linux", "arm64", "zai-editor-0.1.0-linux-arm64.zip", Buffer.from("other")),
      name: { en: "Linux application", "zh-CN": "Linux 应用程序" },
      installNotes: { en: "Extract the archive.", "zh-CN": "请解压缩归档。" },
    },
    {
      ...asset("linux", "x64", file, bytes),
      name: { en: "Linux application", "zh-CN": "Linux 应用程序" },
      installNotes: { en: "Extract the archive.", "zh-CN": "请解压缩归档。" },
      metadata: {
        assets: [{ file: "not-the-release-asset.zip" }],
        release: null,
        escaped: "quote: \" slash: \\ unicode: \u2603",
      },
    },
  ]);
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(localized))],
    [`/${file}`, bytes],
  ]), (origin) => withHome(async (home) => {
    const installDir = join(home, "installed");
    const result = await runInstaller("zai-editor.sh", {
      manifestUrl: `${origin}/manifest.json`, home, installDir,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(await readFile(join(installDir, "zai-editor"), "utf8"), /localized fixture/);
  }));
});

test("the shell installer rejects malformed JSON rather than partially parsing it", async () => {
  const malformed = Buffer.from(
    '{"schemaVersion":1,"appId":"zai-editor","release":{"assets":[' +
    '{"platform":"linux","architecture":"x64","file":"package.zip",' +
    '"sha256":"' + "0".repeat(64) + '"}',
  );
  await withServer(new Map([["/manifest.json", malformed]]), (origin) => withHome(async (home) => {
    const result = await runInstaller("zai-editor.sh", {
      manifestUrl: `${origin}/manifest.json`, home, installDir: join(home, "installed"),
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /could not be read as valid JSON/);
  }));
});

test("the shell installer quotes metacharacters before updating startup PATH", async () => {
  const bytes = createZip({ "zai-editor": "#!/bin/sh\nexit 0\n" });
  const file = "zai-editor-0.1.0-linux-x64.zip";
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-editor", [
      asset("linux", "x64", file, bytes),
    ])))],
    [`/${file}`, bytes],
  ]), (origin) => withHome(async (home) => {
    const installDir = join(home, "installed-$(touch${IFS}pwned)-'quoted'");
    const result = await runInstaller("zai-editor.sh", {
      manifestUrl: `${origin}/manifest.json`, home, installDir,
    });
    assert.equal(result.code, 0, result.stderr);

    const profile = join(home, ".profile");
    const { stdout: updatedPath } = await run("sh", ["-c", '. "$1"; printf %s "$PATH"', "sh", profile], {
      cwd: home,
      env: { PATH: process.env.PATH, HOME: home },
    });
    assert.equal(updatedPath.split(":")[0], installDir);
    await assert.rejects(stat(join(home, "pwned")), /ENOENT/,
      "sourcing the generated profile must not execute install-path metacharacters");
  }));
});

test("PowerShell installers select only an unambiguous ZIP package", async () => {
  const fixture = manifest("zai-editor", [
    asset("windows", "x64", "zai-editor-setup.exe", Buffer.from("exe")),
    asset("windows", "x64", "zai-editor.msix", Buffer.from("msix")),
    asset("windows", "x64", "zai-editor.zip", Buffer.from("zip")),
  ]);
  const selected = fixture.release.assets.find((entry) =>
    entry.platform === "windows" && entry.architecture === "x64" && /\.zip$/i.test(entry.file));
  assert.equal(selected.file, "zai-editor.zip");
  const ambiguous = [
    ...fixture.release.assets,
    asset("windows", "x64", "zai-editor-portable.zip", Buffer.from("portable")),
  ].filter((entry) =>
    entry.platform === "windows" && entry.architecture === "x64" && /\.zip$/i.test(entry.file));
  assert.equal(ambiguous.length, 2);

  const script = await readFile(installerPath("zai-editor.ps1"), "utf8");
  assert.match(script,
    /\$_\.platform -eq 'windows'[\s\S]*\$_\.architecture -eq \$architecture[\s\S]*\(\[string\] \$_\.file\) -match '\\\.zip\$'/);
  assert.match(script, /\$assets\.Count -gt 1[\s\S]*multiple ZIP packages/);
  const selection = script.slice(script.indexOf("$assets ="), script.indexOf("$asset = $assets[0]"));
  assert.doesNotMatch(selection, /Select-Object -First 1/);
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
    "zai": "fixture",
    "zai-editor": "fixture",
    "zai-gitter": "fixture",
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
      manifestUrl: `${origin}/manifest.json`, home, args: [receipt, "--on-conflict", "keep"],
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /installed: fixture/);
    assert.equal(await readFile(receipt, "utf8"), "--on-conflict keep");
  }));
});

test("piped shell installers download and install macOS packages under POSIX Bash", async () => {
  for (const { appId, executable, mode } of INSTALLERS.filter(({ mode }) => mode !== "codex")) {
    for (const [machine, architecture] of [["arm64", "arm64"], ["x86_64", "x64"]]) {
      const bytes = createZip({
        [executable]: "#!/bin/sh\necho macOS fixture\n",
        ...(mode === "python" ? {
          "install.py": "import os, pathlib\npathlib.Path(os.environ['HOME'], 'receipt').write_text('installed')\n",
        } : {}),
      });
      const file = `${appId}-0.1.0-macos-${architecture}.zip`;
      await withServer(new Map([
        ["/manifest.json", Buffer.from(JSON.stringify(manifest(appId, [asset("macos", architecture, file, bytes)])))],
        [`/${file}`, bytes],
      ]), (origin) => withHome(async (home) => {
        const bin = await installerToolPath(home, ["bash"]);
        await writeFile(join(bin, "uname"),
          `#!/bin/sh\ncase "$1" in -s) echo Darwin ;; -m) echo ${machine} ;; esac\n`, { mode: 0o755 });
        const installDir = join(home, "installed");
        const { stdout } = await run("bash", ["--posix", "-c", 'cat "$1" | bash --posix', "bash", installerPath(`${appId}.sh`)], {
          env: {
            PATH: bin,
            HOME: home,
            SHELL: "/bin/zsh",
            ZAI_INSTALL_DIR: installDir,
            ZAI_RELEASE_MANIFEST_URL: `${origin}/manifest.json`,
          },
        });
        assert.ok(stdout.includes(`for macos/${architecture}…`), stdout);
        assert.match(stdout, /Verified SHA-256/);
        if (mode === "python") {
          assert.match(stdout, /Running the bundled package installer with python3…/);
          assert.equal(await readFile(join(home, "receipt"), "utf8"), "installed");
        } else {
          assert.match(await readFile(join(installDir, executable), "utf8"), /macOS fixture/);
          const shortcut = appId === "zai-editor" ? "ze" : "zg";
          assert.equal(await readlink(join(installDir, shortcut)), executable);
          assert.match((await run(join(installDir, shortcut))).stdout, /macOS fixture/);
        }
      }));
    }
  }
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

test("installer metadata overrides reject non-loopback HTTP and plaintext redirects", async () => {
  await withServer(new Map([
    ["/redirect", { redirect: "/manifest.json" }],
    ["/manifest.json", Buffer.from("{}")],
  ]), (origin) => withHome(async (home) => {
    for (const manifestUrl of [
      origin.replace("127.0.0.1", "localhost") + "/manifest.json",
      origin.replace("127.0.0.1", "127.0.0.1@127.0.0.1") + "/manifest.json",
    ]) {
      const result = await runInstaller("zai-editor.sh", { manifestUrl, home });
      assert.equal(result.code, 1);
      assert.match(result.stderr, /refusing to download over a non-HTTPS URL/);
    }
    const result = await runInstaller("zai-editor.sh", { manifestUrl: `${origin}/redirect`, home });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /download failed/);
  }));
  for (const { appId } of INSTALLERS.filter(({ mode }) => mode !== "codex")) {
    const shell = await readFile(installerPath(`${appId}.sh`), "utf8");
    const ps = await readFile(installerPath(`${appId}.ps1`), "utf8");
    assert.match(shell, /--proto '=https' --proto-redir '=https'/);
    assert.match(shell, /wget -q --https-only/);
    assert.match(ps, /-MaximumRedirection 0 -PassThru/);
    assert.match(ps, /127\\\.0\\\.0\\\.1/);
    assert.match(ps, /refusing to follow a plaintext redirect/);
  }
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

function codexPackage(version = "0.1.0") {
  const target = process.arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
  const file = `zai-codex-${version}-${target}.zip`;
  const bytes = createZip({
    "bin/codex": `#!/bin/sh\necho codex-cli 0.0.0\n`,
    "bin/codex-code-mode-host": "#!/bin/sh\nexit 0\n",
    "codex-path/rg": "#!/bin/sh\nexit 0\n",
    "codex-resources/bwrap": "#!/bin/sh\nexit 0\n",
    "LICENSE": "Apache test fixture", "NOTICE": "Test notice",
    "MODIFICATIONS.txt": "Test modifications", "third-party-notices/dependency.txt": "Test notice",
    "codex-package.json": JSON.stringify({ layoutVersion: 1, target, variant: "codex",
      version: "0.0.0", entrypoint: "bin/codex" }),
    "zai-release.json": JSON.stringify({ repository: "phoenixzqy/zai-codex", branch: "zai-codex",
      commit: "a".repeat(40), version, tag: `zai-codex-v${version}` }),
  });
  return { file, bytes, architecture: process.arch === "arm64" ? "arm64" : "x64" };
}

test("zai-codex installs and upgrades complete bundles as codex", { skip: process.platform !== "linux" }, async () => {
  const { file, bytes, architecture } = codexPackage();
  const files = new Map([["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-codex", [
    asset("linux", architecture, file, bytes),
  ])))], [`/${file}`, bytes]]);
  await withServer(files, (origin) => withHome(async (home) => {
    const installDir = join(home, "installed");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(installDir));
    await writeFile(join(installDir, "codex-upstream"), "preserve upstream");
    for (let i = 0; i < 2; i++) {
      const result = await runInstaller("zai-codex.sh", { manifestUrl: `${origin}/manifest.json`, home, installDir });
      assert.equal(result.code, 0, result.stderr);
    }
    assert.equal(await readFile(join(installDir, "codex-upstream"), "utf8"), "preserve upstream");
    const { readdir, realpath } = await import("node:fs/promises");
    assert.equal((await readdir(join(installDir, "releases/zai-codex"))).length, 2);
    const binary = await realpath(join(installDir, "codex"));
    assert.match(binary, /releases\/zai-codex\/.*\/bin\/codex$/);
    assert.equal(await readFile(join(dirname(binary), "../third-party-notices/dependency.txt"), "utf8"), "Test notice");
    assert.match((await run(join(installDir, "codex"), ["--version"])).stdout, /codex-cli 0\.0\.0/);
  }));
});

test("zai-codex rejects corrupt archives on a fresh installation", { skip: process.platform !== "linux" }, async () => {
  const { file, bytes, architecture } = codexPackage();
  const entry = asset("linux", architecture, file, bytes);
  entry.sha256 = "0".repeat(64);
  await withServer(new Map([["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-codex", [entry])))],
    [`/${file}`, bytes]]), (origin) => withHome(async (home) => {
    const result = await runInstaller("zai-codex.sh", { manifestUrl: `${origin}/manifest.json`, home });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /SHA-256 mismatch/);
    await assert.rejects(stat(join(home, ".local/bin/codex")), { code: "ENOENT" });
  }));
});

test("zai-codex rejects corrupt upgrades and preserves the installed launcher", { skip: process.platform !== "linux" }, async () => {
  const initial = codexPackage();
  const upgrade = codexPackage("0.2.0");
  const corrupt = manifest("zai-codex", [
    { ...asset("linux", upgrade.architecture, upgrade.file, upgrade.bytes), sha256: "0".repeat(64) },
  ]);
  corrupt.release.version = "0.2.0";
  const files = new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-codex", [
      asset("linux", initial.architecture, initial.file, initial.bytes),
    ])))],
    [`/${initial.file}`, initial.bytes],
    [`/${upgrade.file}`, upgrade.bytes],
  ]);
  await withServer(files, (origin) => withHome(async (home) => {
    const installDir = join(home, "installed");
    const options = { manifestUrl: `${origin}/manifest.json`, home, installDir };
    const installed = await runInstaller("zai-codex.sh", options);
    assert.equal(installed.code, 0, installed.stderr);
    const launcher = join(installDir, "codex");
    const releases = join(installDir, "releases/zai-codex");
    const target = await readlink(launcher);
    const previousReleases = await readdir(releases);
    const previousOutput = (await run(launcher, ["--version"])).stdout;
    assert.equal(previousOutput, "codex-cli 0.0.0\n");

    files.set("/manifest.json", Buffer.from(JSON.stringify(corrupt)));
    const result = await runInstaller("zai-codex.sh", options);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /SHA-256 mismatch/);
    assert.equal(await readlink(launcher), target);
    assert.deepEqual(await readdir(releases), previousReleases);
    assert.equal((await run(launcher, ["--version"])).stdout, previousOutput);
  }));
});

test("zai-codex standalone installers embed the reviewed source with no sibling fetch", async () => {
  const source = await readFile(join(siteRoot, "install/templates/zai-codex.py.in"), "utf8");
  for (const extension of ["sh", "ps1"]) {
    const script = await readFile(installerPath(`zai-codex.${extension}`), "utf8");
    assert.ok(script.includes(source.trimEnd()));
    assert.match(script, /ZAI_INSTALL_DIR/);
    assert.match(script, /ZAI_RELEASE_MANIFEST_URL/);
  }
  await run("sh", ["-n", installerPath("zai-codex.sh")]);
});

async function withToolPath(home, names) {
  const bin = join(home, "bin");
  await mkdir(bin);
  for (const name of names) {
    const target = (await run(shellPath, ["-c", `command -v ${name}`])).stdout.trim();
    await symlink(target, join(bin, name));
  }
  return bin;
}

async function installerToolPath(home, extra = []) {
  const checksumTool = (await run(shellPath, ["-c", "command -v sha256sum || command -v shasum"])).stdout.trim().split("/").at(-1);
  return withToolPath(home, ["python3", "curl", "mktemp", "rm", "sed", "cut", "wc", "tr", "mkdir",
    "find", "cp", "chmod", "mv", "grep", "unzip", "ps", "sh", "tail", "cat", checksumTool, ...extra]);
}

test("Python preflight rejects missing, old, and broken interpreters before downloads", async () => {
  for (const kind of ["missing", "old", "broken"]) {
    await withHome(async (home) => {
      const bin = await withToolPath(home, ["uname", "sha256sum"]);
      const interpreter = (await run("python3", ["-c", "import sys; print(sys.executable)"])).stdout.trim();
      const touched = join(home, "downloaded");
      await writeFile(join(bin, "curl"), `#!/bin/sh\n: > '${touched}'\nexit 99\n`, { mode: 0o755 });
      if (kind !== "missing") {
        await writeFile(join(bin, "python3"), kind === "old"
          ? `#!/bin/sh\nexec '${interpreter}' -c 'import sys; sys.version_info = (3, 9, 0); exec(sys.argv[1])' "$2"\n`
          : "#!/bin/sh\nexit 127\n", { mode: 0o755 });
      }
      const result = await runInstaller("zai-cli.sh", { home, path: bin });
      assert.equal(result.code, 1, kind);
      assert.match(result.stderr, /working Python 3\.10 or newer.*PATH/);
      assert.match(result.stderr, /python\.org.*new terminal.*Nothing was installed/s);
      assert.equal(await stat(touched).catch(() => null), null);
      assert.equal(await stat(join(home, ".zai")).catch(() => null), null);
      assert.deepEqual(await readdir(home), ["bin"]);
    });
  }
});

test("the selected Python fallback handles metadata, ZIP extraction, and package installation", async () => {
  const bytes = createZip({ "zai": "fixture", "zai-editor": "fixture", "zai-gitter": "fixture",
    "install.py": "import pathlib\npathlib.Path.home().joinpath('receipt').write_text('installed')\n" });
  const file = "zai-0.1.0-linux-x64.zip";
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-cli", [asset("linux", "x64", file, bytes)])))],
    [`/${file}`, bytes],
  ]), (origin) => withHome(async (home) => {
    const bin = await withToolPath(home, ["uname", "curl", "sha256sum", "mktemp", "rm", "sed", "cut", "wc", "tr", "mkdir"]);
    await writeFile(join(bin, "python3"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    const interpreter = (await run("python3", ["-c", "import sys; print(sys.executable)"])).stdout.trim();
    await symlink(interpreter, join(bin, "python"));
    const result = await runInstaller("zai-cli.sh", { manifestUrl: `${origin}/manifest.json`, home, path: bin });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /bundled package installer with python/);
    assert.equal(await readFile(join(home, "receipt"), "utf8"), "installed");
  }));
});

const powerShellPath = await run(shellPath, ["-c", "command -v pwsh"]).then((result) => result.stdout.trim()).catch(() => "");

test("PowerShell Python preflight skips broken launchers and accepts only Python 3.10+", {
  skip: !powerShellPath && "PowerShell is unavailable on this host",
}, async () => {
  const preflight = await readFile(join(siteRoot, "install/templates/prerequisites-python.ps1.in"), "utf8");
  const interpreter = (await run("python3", ["-c", "import sys; print(sys.executable)"])).stdout.trim();
  for (const kind of ["missing", "old", "broken", "fallback"]) {
    await withHome(async (home) => {
      const bin = await withToolPath(home, []);
      if (kind !== "missing") {
        const body = kind === "old"
          ? `#!/bin/sh\nexec '${interpreter}' -c 'import sys; sys.version_info = (3, 9, 0); exec(sys.argv[1])' "$3"\n`
          : "#!/bin/sh\nexit 127\n";
        await writeFile(join(bin, "py"), body, { mode: 0o755 });
      }
      if (kind === "fallback") await symlink(interpreter, join(bin, "python3"));
      const driver = join(home, "preflight.ps1");
      await writeFile(driver, "$ErrorActionPreference = 'Stop'\nfunction Stop-Install($message) { throw $message }\n" + preflight + '\nWrite-Output "selected:$python"\n');
      const result = await run(powerShellPath, ["-NoProfile", "-File", driver], {
        env: { ...process.env, PATH: bin },
      }).then((value) => ({ code: 0, ...value })).catch((error) => error);
      if (kind === "fallback") {
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout, /selected:.*python3/);
      } else {
        assert.notEqual(result.code, 0, kind);
        assert.match(result.stderr, /working Python 3\.10 or newer/);
      }
      assert.equal(await stat(join(home, ".zai")).catch(() => null), null);
    });
  }
});

test("all zai shell installers print activation commands that expose the installed app", async () => {
  for (const { appId, mode, executable } of INSTALLERS) {
    for (const shell of ["/bin/bash", "/bin/zsh", "/bin/sh"]) {
      const packageData = mode === "codex" ? codexPackage() : {
        file: `${appId}-0.1.0-linux-x64.zip`, architecture: "x64",
        bytes: createZip(mode === "python" ? {
          "zai": "fixture", "zai-editor": "fixture", "zai-gitter": "fixture",
          "install.py": [
            "import os, pathlib, sys",
            "home = pathlib.Path(os.environ['HOME'])",
            "directory = pathlib.Path(sys.argv[sys.argv.index('--install-dir') + 1])",
            "directory.mkdir(parents=True, exist_ok=True)",
            "for app in ('zai', 'zai-editor', 'zai-gitter'):",
            "    binary = directory / app",
            "    binary.write_text('#!/bin/sh\\necho activated-fixture\\n')",
            "    binary.chmod(0o755)",
            "for name in ('.profile', '.bashrc', '.zshrc'):",
            "    (home / name).write_text('export PATH=' + str(directory) + ':\"$PATH\"\\n')",
          ].join("\n"),
        } : { [executable]: "#!/bin/sh\necho activated-fixture\n",
          "zai": "sibling fixture", [appId === "zai-editor" ? "zai-gitter" : "zai-editor"]: "sibling fixture" }),
      };
      const { file, bytes, architecture } = packageData;
      await withServer(new Map([
        ["/manifest.json", Buffer.from(JSON.stringify(manifest(appId, [asset("linux", architecture, file, bytes)])))],
        [`/${file}`, bytes],
      ]), (origin) => withHome(async (home) => {
        const installDir = join(home, "installed");
        const result = await runInstaller(`${appId}.sh`, { manifestUrl: `${origin}/manifest.json`, home, installDir, shell });
        assert.equal(result.code, 0, `${appId}/${shell}: ${result.stderr}`);
        if (mode !== "codex") {
          const expected = mode === "python" ? ["zai", "zai-editor", "zai-gitter"] : [executable];
          assert.deepEqual(result.stdout.split("\n").filter((line) => line.startsWith("Installed command: ")),
            expected.map((app) => `Installed command: ${app}`));
          for (const app of ["zai", "zai-editor", "zai-gitter"]) {
            if (expected.includes(app)) {
              const launched = await run(app, ["--help"], { env: { PATH: installDir, HOME: home } });
              assert.match(launched.stdout, /activated-fixture/, `${appId}: ${app} unavailable on PATH`);
            } else await assert.rejects(stat(join(installDir, app)), /ENOENT/);
            await assert.rejects(stat(join(installDir, "." + app)), /ENOENT/);
          }
        }

        const commands = result.stdout.split("\n").filter((line) => line.startsWith("  ")).map((line) => line.slice(2));
        assert.equal(commands.length, mode === "codex" ? 2 : 3, result.stdout);
        if (mode === "codex") assert.equal(commands[0], `export PATH='${installDir}':"$PATH"`);
        else assert.match(commands[0], shell.endsWith("/sh") ? /^\. / : /^source /);
        assert.equal(commands.at(-2), `export PATH='${installDir}':"$PATH"`);
        // The installer is a child process: only running its printed command
        // in the calling shell makes the installed executable available.
        const actualShell = shell.endsWith("/zsh") && zshAvailable ? "zsh" : shell.endsWith("/sh") ? "sh" : "bash";
        const activated = await run(actualShell, ["-c", commands.join("\n")], { env: { HOME: home, PATH: process.env.PATH } });
        assert.match(activated.stdout, mode === "codex" ? /codex-cli 0\.0\.0/ : /activated-fixture/);
      }));
    }
  }
});

test("calling shell detection takes precedence over the login shell", async () => {
  const file = "zai-editor.zip";
  const bytes = createZip({ "zai-editor": "#!/bin/sh\nexit 0\n" });
  await withServer(new Map([
    ["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-editor", [asset("linux", "x64", file, bytes)])))],
    [`/${file}`, bytes],
  ]), (origin) => withHome(async (home) => {
    const result = await runInstaller("zai-editor.sh", {
      manifestUrl: `${origin}/manifest.json`, home, shell: "/bin/zsh", parentShell: "bash",
    });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes(`source '${home}/.bashrc'`), result.stdout);
  }));
});

test("activation fallback quotes custom paths and handles fish and unknown shells", async () => {
  const helper = await readFile(join(siteRoot, "install/templates/activate-shell.sh.in"), "utf8");
  await withHome(async (home) => {
    const directory = join(home, "space ' quote $(touch pwned)");
    await mkdir(directory);
    const binary = join(directory, "fixture");
    await writeFile(binary, "#!/bin/sh\necho activated-fixture\n", { mode: 0o755 });
    for (const shell of ["/bin/bash", "/bin/fish", "/bin/unknown"]) {
      const { stdout } = await run("sh", ["-c", helper + '\nshow_activation "$1" fixture', "sh", directory], {
        env: { HOME: home, PATH: process.env.PATH, SHELL: shell },
      });
      const commands = stdout.split("\n").filter((line) => line.startsWith("  ")).map((line) => line.slice(2));
      if (shell.endsWith("fish")) {
        assert.match(commands[0], /^set -gx PATH /);
      } else {
        const result = await run("sh", ["-c", commands.join("\n")], { cwd: home, env: { HOME: home, PATH: process.env.PATH } });
        assert.match(result.stdout, /activated-fixture/);
        await assert.rejects(stat(join(home, "pwned")), { code: "ENOENT" });
      }
    }
  });
});

test("activation prepends the launcher directory despite misleading profile contents", async () => {
  const helper = await readFile(join(siteRoot, "install/templates/activate-shell.sh.in"), "utf8");
  for (const [shell, profile] of [["bash", ".bashrc"], ["zsh", ".zshrc"], ["sh", ".profile"]]) {
    for (const misleading of ["prefix", "comment"]) {
      await withHome(async (home) => {
        const directory = join(home, "bin");
        await mkdir(directory);
        await writeFile(join(directory, "fixture"), "#!/bin/sh\necho activated-fixture\n", { mode: 0o755 });
        await writeFile(join(home, profile), misleading === "prefix"
          ? `export PATH='${directory}-old':"$PATH"\n`
          : `# export PATH='${directory}':"$PATH"\n`);
        const { stdout } = await run("sh", ["-c", helper + '\nshow_activation "$1" fixture', "sh", directory], {
          env: { HOME: home, PATH: process.env.PATH, SHELL: `/bin/${shell}` },
        });
        const commands = stdout.split("\n").filter((line) => line.startsWith("  ")).map((line) => line.slice(2));
        const actualShell = shell === "zsh" && !zshAvailable ? "bash" : shell;
        const activated = await run(actualShell, ["-c", commands.join("\n")], {
          env: { HOME: home, PATH: process.env.PATH },
        });
        assert.match(activated.stdout, /activated-fixture/, `${shell}/${misleading}`);
      });
    }
  }
});

test("fish activation escapes literal backslashes and apostrophes in paths and commands", async () => {
  const helper = await readFile(join(siteRoot, "install/templates/activate-shell.sh.in"), "utf8");
  await withHome(async (home) => {
    const directory = join(home, "two\\\\slashes ' $(touch pwned)");
    const executable = "fixture\\\\ ' $HOME";
    await mkdir(directory);
    await writeFile(join(directory, executable), "#!/bin/sh\necho activated-fixture\n", { mode: 0o755 });
    const { stdout } = await run("sh", ["-c", helper + '\nshow_activation "$1" "$2"', "sh", directory, executable], {
      env: { HOME: home, PATH: process.env.PATH, SHELL: "/bin/fish" },
    });
    const commands = stdout.split("\n").filter((line) => line.startsWith("  ")).map((line) => line.slice(2));
    const literal = (value) => "'" + value.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'";
    assert.deepEqual(commands, [`set -gx PATH ${literal(directory)} $PATH`, literal(executable)]);
    if (fishAvailable) {
      const activated = await run("fish", ["--no-config", "-c", commands.join("\n")], {
        cwd: home, env: { HOME: home, PATH: process.env.PATH },
      });
      assert.match(activated.stdout, /activated-fixture/);
      await assert.rejects(stat(join(home, "pwned")), { code: "ENOENT" });
    }
  });
});


test("zai-codex activation uses the overridden launcher directory and filename", { skip: process.platform !== "linux" }, async () => {
  const { file, bytes, architecture } = codexPackage();
  for (const profile of ["missing", "prefix", "comment"]) {
    await withServer(new Map([
      ["/manifest.json", Buffer.from(JSON.stringify(manifest("zai-codex", [asset("linux", architecture, file, bytes)])))],
      [`/${file}`, bytes],
    ]), (origin) => withHome(async (home) => {
      const launcher = join(home, "custom ' bin", "custom codex");
      if (profile !== "missing") {
        await writeFile(join(home, ".bashrc"), profile === "prefix"
          ? `export PATH="${dirname(launcher)}-old:$PATH"\n`
          : `# export PATH="${dirname(launcher)}:$PATH"\n`);
      }
      const result = await runInstaller("zai-codex.sh", {
        manifestUrl: `${origin}/manifest.json`, home, installDir: join(home, "install"),
        envOverrides: { ZAI_CODEX_BIN_LINK: launcher },
      });
      assert.equal(result.code, 0, result.stderr);
      const commands = result.stdout.split("\n").filter((line) => line.startsWith("  ")).map((line) => line.slice(2));
      assert.equal(commands.at(-1), "'custom codex'");
      if (profile !== "missing") assert.match(commands[0], /^source /);
      const activated = await run("bash", ["-c", commands.join("\n")], { env: { HOME: home, PATH: process.env.PATH } });
      assert.match(activated.stdout, /codex-cli 0\.0\.0/, profile);
    }));
  }
});

test("PowerShell activation quotes paths without executing their contents", {
  skip: !powerShellPath && "PowerShell is unavailable on this host",
}, async () => {
  const helper = await readFile(join(siteRoot, "install/templates/activate-shell.ps1.in"), "utf8");
  await withHome(async (home) => {
    const directory = join(home, "space ' quote $HOME");
    await mkdir(directory);
    const script = join(home, "activate.ps1");
    await writeFile(script, helper + '\nShow-Activation $env:ZAI_TEST_BIN fixture');
    const { stdout } = await run(powerShellPath, ["-NoProfile", "-File", script], {
      env: { ...process.env, ZAI_TEST_BIN: directory },
    });
    const command = stdout.split("\n").find((line) => line.startsWith("  $env:Path"));
    assert.ok(command, stdout);
    await writeFile(script, command + '\n[Console]::Write($env:Path)');
    const activated = await run(powerShellPath, ["-NoProfile", "-File", script]);
    assert.ok(activated.stdout.startsWith(directory + (process.platform === "win32" ? ";" : ":")));
  });
});

test("PowerShell irm | iex activation exposes commands immediately and preserves PATH", {
  skip: !powerShellPath && "PowerShell is unavailable on this host",
}, async () => {
  const helper = await readFile(join(siteRoot, "install/templates/activate-shell.ps1.in"), "utf8");
  await withHome(async (home) => {
    const directory = join(home, "space ' quote $HOME");
    await mkdir(directory);
    for (const app of ["zai", "zai-editor", "zai-gitter"]) {
      await writeFile(join(directory, `${app}.ps1`), `Write-Output '${app} activated-fixture'`);
    }
    const bootstrap = join(home, "bootstrap.ps1");
    await writeFile(bootstrap, helper + "\nShow-Activation $env:ZAI_TEST_BIN zai");
    const driver = join(home, "driver.ps1");
    await writeFile(driver, `
$ErrorActionPreference = 'Stop'
$original = $env:PATH
$separator = [IO.Path]::PathSeparator
$expected = $env:ZAI_TEST_BIN + $separator + $original
# Invoke-Expression runs downloaded content in the calling PowerShell process.
Get-Content -LiteralPath $env:ZAI_TEST_BOOTSTRAP -Raw | Invoke-Expression
if ($env:PATH -cne $expected) { throw 'Current session PATH was not activated or original entries changed.' }
& zai
& zai-editor
& zai-gitter
Get-Content -LiteralPath $env:ZAI_TEST_BOOTSTRAP -Raw | Invoke-Expression
if ($env:PATH -cne $expected) { throw 'Repeat installation duplicated the PATH entry.' }
$env:PATH = $env:ZAI_TEST_BIN.ToUpperInvariant() + '/' + $separator + $original
$existing = $env:PATH
Get-Content -LiteralPath $env:ZAI_TEST_BOOTSTRAP -Raw | Invoke-Expression
if ($env:PATH -cne $existing) { throw 'An equivalent directory was duplicated.' }
$env:PATH = ''
Get-Content -LiteralPath $env:ZAI_TEST_BOOTSTRAP -Raw | Invoke-Expression
if ($env:PATH -cne $env:ZAI_TEST_BIN) { throw 'Empty PATH activation failed.' }
`);
    const { stdout } = await run(powerShellPath, ["-NoProfile", "-File", driver], {
      env: { ...process.env, ZAI_TEST_BIN: directory, ZAI_TEST_BOOTSTRAP: bootstrap },
    });
    for (const app of ["zai", "zai-editor", "zai-gitter"]) {
      assert.match(stdout, new RegExp(`${app} activated-fixture`));
    }
  });
});

test("tool installers add only their own available shortcuts, preserve collisions, and support upgrades", async () => {
  for (const { appId, mode, executable } of INSTALLERS.filter(({ mode }) => mode !== "codex")) {
    const file = `${appId}.zip`;
    const binary = "#!/bin/sh\nprintf '%s\\n' \"$0\" \"$@\"\nexit 7\n";
    const bytes = createZip(mode === "python" ? {
      "install.py": [
        "import pathlib, sys",
        "directory = pathlib.Path(sys.argv[sys.argv.index('--install-dir') + 1])",
        "directory.mkdir(parents=True, exist_ok=True)",
        "for name in ('zai', 'zai-editor', 'zai-gitter'):",
        `    (directory / name).write_text(${JSON.stringify(binary)})`,
        "    (directory / name).chmod(0o755)",
      ].join("\n"),
    } : { [executable]: binary });
    await withServer(new Map([
      ["/manifest.json", Buffer.from(JSON.stringify(manifest(appId, [asset("linux", "x64", file, bytes)])))],
      [`/${file}`, bytes],
    ]), (origin) => withHome(async (home) => {
      const installDir = join(home, "space ' quote $HOME");
      const toolPath = await installerToolPath(home, ["uname"]);
      const options = { manifestUrl: `${origin}/manifest.json`, home, installDir, path: toolPath };
      const pairs = [["ze", "zai-editor"], ["zg", "zai-gitter"]];
      const expected = pairs.filter(([, command]) => mode === "python" || command === executable);
      const result = await runInstaller(`${appId}.sh`, options);
      assert.equal(result.code, 0, result.stderr);
      for (const [name, command] of expected) {
        assert.equal(await readlink(join(installDir, name)), command);
        await assert.rejects(run(join(installDir, name), ["two words", "quote ' $HOME"]), (error) => {
          assert.equal(error.code, 7);
          assert.deepEqual(error.stdout.trimEnd().split("\n").slice(1), ["two words", "quote ' $HOME"]);
          return true;
        });
      }
      for (const [name] of pairs.filter((pair) => !expected.includes(pair))) {
        await assert.rejects(stat(join(installDir, name)), /ENOENT/);
      }
      await assert.rejects(stat(join(installDir, "z")), /ENOENT/);
      const repeat = await runInstaller(`${appId}.sh`, options);
      assert.equal(repeat.code, 0, repeat.stderr);
      assert.match(repeat.stdout, /Skipped shortcut .*already taken/);
      // Relative links continue to launch the canonical executable after an upgrade.
      for (const [name, command] of expected) {
        await writeFile(join(installDir, command), "#!/bin/sh\necho upgraded\n");
        assert.equal((await run(join(installDir, name))).stdout.trim(), "upgraded");
        await rm(join(installDir, name));
      }
      const occupied = join(home, "other-bin");
      await mkdir(occupied);
      for (const [name] of expected) await writeFile(join(occupied, name), "#!/bin/sh\necho unrelated\n", { mode: 0o755 });
      const conflict = await runInstaller(`${appId}.sh`, { ...options, path: `${occupied}:${toolPath}` });
      assert.equal(conflict.code, 0, conflict.stderr);
      for (const [name] of expected) {
        await assert.rejects(stat(join(installDir, name)), /ENOENT/);
        assert.match(await readFile(join(occupied, name), "utf8"), /unrelated/);
        await symlink("missing-user-target", join(installDir, name));
      }
      const dangling = await runInstaller(`${appId}.sh`, options);
      assert.equal(dangling.code, 0, dangling.stderr);
      for (const [name] of expected) assert.equal(await readlink(join(installDir, name)), "missing-user-target");
    }));
  }
});

test("shortcut helper respects functions and aliases visible to its shell", async () => {
  const helper = await readFile(join(siteRoot, "install/templates/shortcuts.sh.in"), "utf8");
  await withHome(async (home) => {
    for (const shell of ["sh", "bash", ...(zshAvailable ? ["zsh"] : [])]) {
      const installDir = join(home, shell);
      await mkdir(installDir);
      await writeFile(join(installDir, "zai-editor"), "fixture", { mode: 0o755 });
      await writeFile(join(installDir, "zai-gitter"), "fixture", { mode: 0o755 });
      const script = helper + '\ninfo() { printf "%s\\n" "$1"; }\n' +
        'ze() { :; }\nalias zg="echo existing"\nINSTALL_DIR=$1\n' +
        'install_shortcut ze zai-editor\ninstall_shortcut zg zai-gitter\n';
      const result = await run(shell, ["-c", script, shell, installDir]);
      assert.match(result.stdout, /Skipped shortcut ze: the name is already taken/);
      assert.match(result.stdout, /Skipped shortcut zg: the name is already taken/);
      await assert.rejects(stat(join(installDir, "ze")), /ENOENT/);
      await assert.rejects(stat(join(installDir, "zg")), /ENOENT/);
    }
  });
});
