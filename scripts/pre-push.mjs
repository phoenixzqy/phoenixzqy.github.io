import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const full = { scope: "full", reason: "outgoing history is unavailable or includes site code" };

function git(root, args, input) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const result = spawnSync("git", ["-C", root, ...args], {
    input, env, timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("Cannot inspect Git push history.");
  return result.stdout;
}

function records(updates) {
  return updates.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || !shaPattern.test(fields[1]) || !shaPattern.test(fields[3])) {
      throw new Error("Malformed Git pre-push update record.");
    }
    return { local: fields[1], remote: fields[3] };
  });
}

export function pathScope(name) {
  if (["README.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md", "CONTRIBUTING.md", "LICENSE"].includes(name)
      || (name.startsWith(".github/") && name.endsWith(".md"))
      || /^releases\/(?:[a-z0-9-]+\/)?README\.md$/.test(name)
      || name === "scripts/app-release/README.md") return "documentation";
  if (name.startsWith("apps/docs/")
      && [".md", ".json", ".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(extname(name))) return "mirror";
  return "full";
}

export function classify(root, updates) {
  const paths = new Set(), bases = new Set();
  for (const record of records(updates)) {
    if (/^0+$/.test(record.local)) continue;
    try {
      const tip = git(root, ["rev-parse", "--verify", record.local + "^{commit}"]).toString().trim();
      let base;
      if (/^0+$/.test(record.remote)) {
        base = git(root, ["merge-base", tip, "refs/remotes/origin/main"]).toString().trim();
      } else {
        base = git(root, ["rev-parse", "--verify", record.remote + "^{commit}"]).toString().trim();
        git(root, ["merge-base", "--is-ancestor", base, tip]);
      }
      bases.add(base);
      const commits = git(root, ["rev-list", base + ".." + tip]).toString().trim().split("\n");
      if (!commits[0] || commits.length > 200) return full;
      const raw = git(root, ["diff-tree", "--stdin", "--root", "-r", "-m",
        "--no-commit-id", "--raw", "-z", "--no-renames"], commits.join("\n") + "\n").toString().split("\0");
      if (raw.at(-1) !== "" || (raw.length - 1) % 2) return full;
      for (let index = 0; index < raw.length - 1; index += 2) {
        const header = raw[index].split(" ");
        if (header.length !== 5 || ![":000000", ":100644"].includes(header[0])
            || !["000000", "100644"].includes(header[1])) return full;
        const name = raw[index + 1];
        paths.add(name);
        if (pathScope(name) === "full") return full;
      }
    } catch {
      return full;
    }
  }
  if (!paths.size) return full;
  const scope = [...paths].some((name) => pathScope(name) === "mirror") ? "mirror" : "documentation";
  return { scope, reason: "all outgoing changes are allowlisted documentation", paths: [...paths].sort(), bases: [...bases].sort() };
}

function requireClean(root, head) {
  if (git(root, ["rev-parse", "HEAD"]).toString().trim() !== head
      || git(root, ["status", "--porcelain", "--untracked-files=all"]).length) {
    throw new Error("Pre-push requires unchanged HEAD and a clean index/worktree, including untracked files.");
  }
}

export function runGate(root, updates, run) {
  const commits = records(updates).filter((record) => !/^0+$/.test(record.local));
  if (!commits.length) {
    console.log("pre-push: Deletion-only push; validation not required.");
    return;
  }
  const head = git(root, ["rev-parse", "HEAD"]).toString().trim();
  for (const record of commits) {
    if (git(root, ["rev-parse", "--verify", record.local + "^{commit}"]).toString().trim() !== head) {
      throw new Error("Push tips must resolve to the checked-out HEAD.");
    }
  }
  requireClean(root, head);
  const change = classify(root, updates);
  console.log(`pre-push: ${change.scope}: ${change.reason}. HEAD: ${head}`);
  const commands = [["node", "--test", "tests/pre-push.test.js"]];
  if (change.scope === "full") commands.splice(0, 1, ["npm", "test"]);
  if (change.scope === "mirror") commands.push(["npm", "run", "validate:apps"], ["node", "--test", "tests/docs-mirror.test.js"]);
  for (const args of commands) run(args);
  requireClean(root, head);
  console.log("pre-push: Passed; final HEAD and worktree checks passed.");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    runGate(process.cwd(), readFileSync(0, "utf8"), (args) => {
      // Arguments are fixed repository-owned commands; Windows needs npm.cmd's shell.
      const command = args[0] === "node" ? process.execPath : "npm";
      const result = spawnSync(command, args.slice(1), {
        stdio: ["ignore", "inherit", "inherit"], shell: args[0] === "npm" && process.platform === "win32",
      });
      if (result.error || result.status !== 0) throw new Error("Required npm validation failed.");
    });
  } catch (error) {
    console.error(`pre-push: ${error.message}`);
    process.exitCode = 1;
  }
}
