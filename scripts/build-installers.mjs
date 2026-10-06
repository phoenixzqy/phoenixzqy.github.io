// Generates the self-contained one-line installers served from /install/.
//
// Every installer must work as a single `curl … | sh` or `irm … | iex` fetch,
// so shared logic lives in install/templates/ and is expanded into one
// standalone file per app rather than being fetched at run time.
//
//   node scripts/build-installers.mjs          write install/<app-id>.{sh,ps1}
//   node scripts/build-installers.mjs --check  fail if a committed file is stale
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templates = join(siteRoot, "install/templates");

export const INSTALLERS = [
  { appId: "zai-cli", executable: "zai", displayName: "zai", mode: "python" },
  { appId: "zai-editor", executable: "zai-editor", displayName: "zai-editor", mode: "binary" },
  { appId: "zai-gitter", executable: "zai-gitter", displayName: "zai-gitter", mode: "binary" },
  { appId: "zai-codex", executable: "zai-codex", displayName: "zai-codex", mode: "codex" },
];

const PLACEHOLDER = /@([A-Z_]+)@/g;

function expand(template, values, label) {
  return template.replace(PLACEHOLDER, (match, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`${label}: unknown placeholder ${match}.`);
    return values[name];
  });
}

// Keeps the generated shell and PowerShell blocks at their surrounding indent.
function indentLike(block, marker, shell) {
  const indent = shell.split("\n").find((line) => line.includes(marker))?.match(/^\s*/)[0] ?? "";
  return block.replace(/\n+$/, "").split("\n").map((line, index) =>
    index === 0 || line === "" ? line : indent + line.replace(new RegExp(`^${indent}`), "")).join("\n");
}

export async function buildInstallers() {
  const files = new Map();
  for (const installer of INSTALLERS) {
    if (installer.mode === "codex") {
      const python = await readFile(join(templates, "zai-codex.py.in"), "utf8");
      const source = JSON.parse(await readFile(join(siteRoot, "install/zai-codex-source.json"), "utf8"));
      if (source.repository !== "phoenixzqy/zai-codex" || source.branch !== "zai-codex" ||
          !/^[0-9a-f]{40}$/.test(source.commit) ||
          createHash("sha256").update(python).digest("hex") !== source.sha256) {
        throw new Error("zai-codex installer drifted; sync its reviewed source before generating.");
      }
      for (const extension of ["sh", "ps1"]) {
        const activation = await readFile(join(templates, `activate-shell.${extension}.in`), "utf8");
        const wrapper = await readFile(join(templates, `zai-codex.${extension}.in`), "utf8");
        files.set(`install/zai-codex.${extension}`, wrapper.replace("@ACTIVATION_HELPER@", () => activation.trimEnd()).replace("@SOURCE_COMMIT@", source.commit)
          .replace("@PYTHON@", () => python.trimEnd()));
      }
      continue;
    }
    const values = {
      APP_ID: installer.appId,
      EXECUTABLE: installer.executable,
      DISPLAY_NAME: installer.displayName,
      SHORTCUT: installer.appId === "zai-editor" ? "ze" : installer.appId === "zai-gitter" ? "zg" : "",
      PYTHON_MIN_MINOR: installer.mode === "python" ? "10" : "0",
      PYTHON_VERSION: installer.mode === "python" ? "3.10" : "3",
    };
    for (const [extension, indented] of [["sh", false], ["ps1", true]]) {
      const activation = await readFile(join(templates, `activate-shell.${extension}.in`), "utf8");
      const shortcuts = await readFile(join(templates, `shortcuts.${extension}.in`), "utf8");
      const shell = await readFile(join(templates, `installer.${extension}.in`), "utf8");
      const step = await readFile(join(templates, `install-${installer.mode}.${extension}.in`), "utf8");
      const label = `${installer.appId}.${extension}`;
      const prerequisite = extension === "ps1" && installer.mode === "python"
        ? await readFile(join(templates, "prerequisites-python.ps1.in"), "utf8") : "";
      const body = expand(step, values, label).replace(/\n+$/, "");
      const content = expand(
        // A function replacer keeps `$$`, `$&`, and friends literal: the shell
        // step uses `$$` for a per-process staging name.
        shell.replace("@ACTIVATION_HELPER@", () => activation.trimEnd()).replace("@SHORTCUT_HELPER@", () => shortcuts.trimEnd()).replace("@PREREQUISITE_STEP@\n", () => prerequisite ? prerequisite.trimEnd() + "\n" : "").replace("@INSTALL_STEP@", () => (indented ? indentLike(body, "@INSTALL_STEP@", shell) : body)),
        values,
        label,
      );
      if (PLACEHOLDER.test(content.replace(PLACEHOLDER, ""))) throw new Error(`${label}: unexpanded placeholder.`);
      files.set(`install/${installer.appId}.${extension}`, content);
      const python = expand(await readFile(join(templates, "uninstaller.py.in"), "utf8"), values, label);
      files.set(`uninstall/${installer.appId}.py`, python);
      const uninstall = await readFile(join(templates, `uninstaller.${extension}.in`), "utf8");
      files.set(`uninstall/${installer.appId}.${extension}`, uninstall.replace("@PYTHON@", () => python.trimEnd()));
    }
  }
  return files;
}

async function main() {
  const check = process.argv.includes("--check");
  const files = await buildInstallers();
  const stale = [];
  for (const [path, content] of files) {
    const file = join(siteRoot, path);
    const existing = await readFile(file, "utf8").catch(() => null);
    if (existing === content) continue;
    if (check) stale.push(path);
    else {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
    }
  }
  if (stale.length) {
    console.error(`Installers are out of date: ${stale.join(", ")}. Run "npm run build:installers".`);
    process.exitCode = 1;
    return;
  }
  console.log(check ? `Checked ${files.size} installer file(s).` : `Wrote ${files.size} installer file(s).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
