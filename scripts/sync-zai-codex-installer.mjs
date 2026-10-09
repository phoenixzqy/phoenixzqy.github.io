// Copy only the reviewed public installer, never the source checkout or build outputs.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/sync-zai-codex-installer.mjs <claimed-zai-codex-worktree>");
const git = (...args) => execFileSync("git", ["-C", resolve(source), ...args], { encoding: "utf8" }).trim();
const origin = git("remote", "get-url", "origin");
if (!/^(?:https:\/\/github\.com\/|git@github\.com:)phoenixzqy\/zai-codex(?:\.git)?$/.test(origin)) {
  throw new Error("Expected the phoenixzqy/zai-codex source repository.");
}
const file = "scripts/install_zai_codex.py";
if (git("status", "--porcelain")) throw new Error("Sync from a clean, committed customization checkout.");
const commit = git("rev-parse", "HEAD");
// PR commits may be reviewed before merge; releases themselves must use origin/zai-codex.
if (process.argv[3] === "--release") {
  // Recovery may use an older, already merged customization revision.
  git("merge-base", "--is-ancestor", "HEAD", "origin/zai-codex");
} else {
  git("merge-base", "--is-ancestor", "origin/zai-codex", "HEAD");
}
const installer = await readFile(join(resolve(source), file), "utf8");
await writeFile(join(root, "install/templates/zai-codex.py.in"), installer);
await writeFile(join(root, "install/zai-codex-source.json"), JSON.stringify({
  repository: "phoenixzqy/zai-codex", branch: "zai-codex", commit, file,
  sha256: createHash("sha256").update(installer).digest("hex"),
}, null, 2) + "\n");
console.log(`Synced the public installer from zai-codex customization commit ${commit}. Review it, then run npm run build:installers.`);
