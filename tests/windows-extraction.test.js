import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { createZip } from "./zip-fixture.js";

const run = promisify(execFile);
const coreHome = await run("pwsh", ["-NoProfile", "-Command", "[Console]::Write($PSHOME)"])
  .then(({ stdout }) => stdout.trim()).catch(() => "");
const engines = process.platform === "win32" ? ["powershell.exe", "pwsh"] : ["pwsh"];

for (const engine of engines) {
  const available = await run(engine, ["-NoProfile", "-Command", "exit 0"])
    .then(() => true).catch(() => false);
  test(`ZIP extraction works in ${engine} with inherited PowerShell module paths`, {
    skip: !available && `${engine} is unavailable on this host`,
  }, async () => {
    const home = await mkdtemp(join(tmpdir(), "zai-extraction-"));
    try {
      const valid = createZip({
        "package/zai.exe": "test-only fixture",
        "package/LICENSE": "license fixture",
      });
      await writeFile(join(home, "valid.zip"), valid);
      await writeFile(join(home, "valid [literal].zip"), valid);
      await writeFile(join(home, "corrupt.zip"), "not a ZIP archive");
      await writeFile(join(home, "traversal.zip"), createZip({ "../escaped.txt": "must stay inside" }));

      for (const appId of ["zai-cli", "zai-editor", "zai-gitter"]) {
        const installer = await readFile(new URL(`../install/${appId}.ps1`, import.meta.url), "utf8");
        const extraction = installer.match(/New-Item -ItemType Directory -Path \$extract -Force \| Out-Null\r?\n    try \{\r?\n([\s\S]*?)\r?\n    \} catch \{\r?\n        Stop-Install "the downloaded archive/);
        assert.ok(extraction, `${appId}: published extraction block exists`);
        const driver = join(home, "extract.ps1");
        await writeFile(driver, `
$ErrorActionPreference = 'Stop'
foreach ($kind in @('valid', 'valid [literal]', 'corrupt', 'traversal')) {
    $archive = Join-Path $env:ZAI_TEST_HOME ($kind + '.zip')
    $extract = Join-Path $env:ZAI_TEST_HOME ($env:ZAI_TEST_APP + '-' + $kind)
    New-Item -ItemType Directory -Path $extract -Force | Out-Null
    try {
${extraction[1]}
        [Console]::WriteLine($kind + ':ok')
    } catch {
        [Console]::WriteLine($kind + ':rejected: ' + $_.Exception.Message)
    }
    # Extraction must close its input, even on failure.
    $stream = [IO.File]::Open($archive, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $stream.Dispose()
}
`);
        // execFile preserves PSModulePath like Go's exec.Command. A native
        // PowerShell-to-powershell.exe call can sanitize it and hide this bug.
        const modulePath = [coreHome && join(coreHome, "Modules"), process.env.PSModulePath]
          .filter(Boolean).join(delimiter);
        const { stdout } = await run(engine, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", driver], {
          env: { ...process.env, ...(modulePath ? { PSModulePath: modulePath } : {}),
            ZAI_TEST_HOME: home, ZAI_TEST_APP: appId },
        });
        assert.match(stdout, /valid:ok/, `${appId}: valid package extracted`);
        assert.match(stdout, /valid \[literal\]:ok/, `${appId}: literal archive path extracted`);
        assert.match(stdout, /corrupt:rejected/, `${appId}: invalid ZIP rejected`);
        assert.match(stdout, /traversal:rejected/, `${appId}: traversal rejected`);
        const extracted = join(home, `${appId}-valid [literal]`, "package");
        assert.equal(await readFile(join(extracted, "zai.exe"), "utf8"), "test-only fixture");
        assert.equal(await readFile(join(extracted, "LICENSE"), "utf8"), "license fixture");
        assert.equal(await stat(join(home, "escaped.txt")).catch(() => null), null);
      }
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
}
