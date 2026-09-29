#!/usr/bin/env node
// Mirrors user-facing documentation from the private app repositories into
// apps/docs/<app-id>/ so it can be read on the public Pages site.
//
// The allowlist lives in apps/docs/sources.json. Nothing outside it is ever
// copied, and everything already in the mirror that is no longer allowlisted is
// removed, so the result is a deterministic function of the allowlist and the
// source commits.
//
// Usage:
//   node scripts/sync-app-docs.mjs --repo zai-editor=../zai-editor
//   node scripts/sync-app-docs.mjs --repo zai-cli=../zai-cli --ref zai-cli=origin/main
//   node scripts/sync-app-docs.mjs --repo zai-gitter=../zai-gitter --worktree
//   node scripts/sync-app-docs.mjs --check --repo ...
//
// --repo       required once per app that should be synced; apps without a
//              --repo entry are left untouched.
// --ref        overrides the git ref recorded in sources.json for one app.
// --worktree   reads the checkout's working tree instead of a git ref.
// --check      reports what would change and exits non-zero instead of writing.
//
// Node standard library only: this repository ships no runtime dependencies.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_ROOT = path.join(ROOT, "apps", "docs");
const SOURCES_FILE = path.join(DOCS_ROOT, "sources.json");
const MARKDOWN = /\.md$/i;
const IMAGE = /\.(png|jpe?g|gif|svg|webp|avif)$/i;
const PRIVACY_PATTERNS = [
  /shared-internal-tools/i,
  /epi-platform/i,
  /\bghp_[A-Za-z0-9]{16,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /https?:\/\/[^\s)"']*\.visualstudio\.com/i,
];

function fail(message) {
  console.error(`sync-app-docs: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const repos = new Map();
  const refs = new Map();
  let check = false;
  let worktree = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") {
      check = true;
    } else if (arg === "--worktree") {
      worktree = true;
    } else if (arg === "--repo" || arg === "--ref") {
      const value = argv[i + 1];
      i += 1;
      if (!value || !value.includes("=")) {
        fail(`${arg} expects <app-id>=<value>`);
      }
      const separator = value.indexOf("=");
      const target = arg === "--repo" ? repos : refs;
      target.set(value.slice(0, separator), value.slice(separator + 1));
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }
  return { repos, refs, check, worktree };
}

// Git hooks export GIT_DIR, GIT_INDEX_FILE, and friends; inherited they would
// point every child command back at this repository instead of the source one.
function gitEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
}

function git(repoDir, args) {
  return execFileSync("git", ["-C", repoDir, ...args], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
    env: gitEnv(),
  });
}

function readSource(repoDir, ref, filePath, useWorktree) {
  if (useWorktree) {
    return fs.readFileSync(path.join(repoDir, filePath));
  }
  return git(repoDir, ["show", `${ref}:${filePath}`]);
}

function listTree(repoDir, ref, useWorktree) {
  const args = useWorktree
    ? ["ls-files", "-z"]
    : ["ls-tree", "-r", "-z", "--name-only", ref];
  return new Set(
    git(repoDir, args)
      .toString("utf8")
      .split("\0")
      .filter(Boolean),
  );
}

function resolveCommit(repoDir, ref, useWorktree) {
  const target = useWorktree ? "HEAD" : ref;
  return git(repoDir, ["rev-parse", target]).toString("utf8").trim();
}

// Documents are flattened onto a stable slug so the mirror never depends on the
// source repository's directory layout and the viewer can address every page
// with a single query parameter.
function docSlug(filePath) {
  return filePath
    .replace(/^\.\//, "")
    .replace(MARKDOWN, "")
    .replace(/[^A-Za-z0-9/_-]/g, "-")
    .replace(/\//g, "--")
    .toLowerCase();
}

function docTitle(markdown, filePath) {
  const match = markdown.match(/^\s*#\s+(.+?)\s*$/m);
  if (match) {
    return match[1].replace(/`/g, "").trim().slice(0, 120);
  }
  return path.basename(filePath, path.extname(filePath));
}

function posixJoin(from, relative) {
  const base = path.posix.dirname(from);
  return path.posix.normalize(path.posix.join(base, relative));
}

function splitTarget(target) {
  const hashIndex = target.indexOf("#");
  if (hashIndex < 0) return [target, ""];
  return [target.slice(0, hashIndex), target.slice(hashIndex)];
}

function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
}

// Rewrites links and images inside a mirrored document. Links to other mirrored
// documents become viewer links, links to files that were deliberately not
// mirrored lose their link (the text survives), and images are pointed at the
// copies that live beside the document.
function rewriteReferences(markdown, context) {
  const { filePath, appId, slugByPath, assetByPath, unresolved } = context;
  return markdown.replace(
    /(!?)\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)((?:\s+(?:"[^"]*"|'[^']*'))?)\s*\)/g,
    (match, bang, text, rawTarget, title) => {
      const target = rawTarget.startsWith("<") ? rawTarget.slice(1, -1) : rawTarget;
      if (!target || isExternal(target) || target.startsWith("#")) {
        return match;
      }
      const [pathPart, hash] = splitTarget(target);
      if (!pathPart) return match;
      const resolved = posixJoin(filePath, pathPart);
      if (bang === "!") {
        const asset = assetByPath.get(resolved);
        if (asset) return `![${text}](${asset})`;
        unresolved.push({ filePath, target, kind: "image" });
        return text ? `*${text}*` : "";
      }
      const slug = slugByPath.get(resolved);
      if (slug) {
        return `[${text}](?id=${encodeURIComponent(appId)}&doc=${encodeURIComponent(slug)}${hash})`;
      }
      unresolved.push({ filePath, target, kind: "link" });
      return text;
    },
  );
}

function collectImages(markdown) {
  const targets = [];
  const pattern = /!\[[^\]]*\]\(\s*(<[^>]*>|[^\s)]+)/g;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    const raw = match[1].startsWith("<") ? match[1].slice(1, -1) : match[1];
    const [pathPart] = splitTarget(raw);
    if (pathPart && !isExternal(pathPart) && IMAGE.test(pathPart)) {
      targets.push(pathPart);
    }
  }
  return targets;
}

function scanPrivacy(appId, filePath, text) {
  const findings = [];
  for (const pattern of PRIVACY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      findings.push(`${appId}: ${filePath} matches ${pattern} ("${match[0].slice(0, 60)}")`);
    }
  }
  return findings;
}

function listMirrored(dir) {
  const files = [];
  const walk = (current, prefix) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, relative);
      else if (entry.isFile()) files.push(relative);
    }
  };
  if (fs.existsSync(dir)) walk(dir, "");
  return files;
}

function syncApp(app, options) {
  const repoDir = path.resolve(options.repos.get(app.appId));
  if (!fs.existsSync(path.join(repoDir, ".git"))) {
    fail(`${app.appId}: ${repoDir} is not a git checkout`);
  }
  const ref = options.refs.get(app.appId) ?? app.ref;
  const commit = resolveCommit(repoDir, ref, options.worktree);
  const tree = listTree(repoDir, ref, options.worktree);

  const slugByPath = new Map();
  const assetByPath = new Map();
  const documents = [];
  const unresolved = [];
  const privacy = [];
  const outputs = new Map();

  for (const filePath of app.include) {
    if (!MARKDOWN.test(filePath)) {
      fail(`${app.appId}: only Markdown documents can be mirrored (${filePath})`);
    }
    if (!tree.has(filePath)) {
      fail(`${app.appId}: ${filePath} does not exist at ${ref}`);
    }
    const slug = docSlug(filePath);
    if ([...slugByPath.values()].includes(slug)) {
      fail(`${app.appId}: two documents collapse onto the slug ${slug}`);
    }
    slugByPath.set(filePath, slug);
  }

  for (const filePath of app.include) {
    const markdown = readSource(repoDir, ref, filePath, options.worktree).toString("utf8");
    for (const target of collectImages(markdown)) {
      const resolved = posixJoin(filePath, target);
      if (!tree.has(resolved) || assetByPath.has(resolved)) continue;
      const assetName = `assets/${docSlug(resolved).replace(/-(png|jpe?g|gif|svg|webp|avif)$/i, "")}${path.extname(resolved)}`;
      assetByPath.set(resolved, assetName);
      outputs.set(assetName, readSource(repoDir, ref, resolved, options.worktree));
    }
  }

  for (const filePath of app.include) {
    const raw = readSource(repoDir, ref, filePath, options.worktree).toString("utf8");
    privacy.push(...scanPrivacy(app.appId, filePath, raw));
    const slug = slugByPath.get(filePath);
    const rewritten = rewriteReferences(raw, {
      filePath,
      appId: app.appId,
      slugByPath,
      assetByPath,
      unresolved,
    });
    outputs.set(`${slug}.md`, Buffer.from(rewritten.endsWith("\n") ? rewritten : `${rewritten}\n`, "utf8"));
    documents.push({
      slug,
      title: docTitle(raw, filePath),
      source: filePath,
      file: `${slug}.md`,
      bytes: Buffer.byteLength(rewritten, "utf8"),
    });
  }

  const index = {
    schemaVersion: 1,
    appId: app.appId,
    repository: app.repository,
    ref,
    commit,
    documents,
    assets: [...assetByPath.values()].sort(),
  };
  outputs.set(
    "index.json",
    Buffer.from(`${JSON.stringify(index, null, 2)}\n`, "utf8"),
  );

  return { commit, outputs, unresolved, privacy, documents };
}

function applyOutputs(appDir, outputs, check) {
  const changes = [];
  const existing = new Set(listMirrored(appDir));
  for (const [relative, contents] of [...outputs].sort(([a], [b]) => a.localeCompare(b))) {
    const target = path.join(appDir, relative);
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (current && current.equals(contents)) {
      existing.delete(relative);
      continue;
    }
    changes.push(`${current ? "update" : "add"} ${path.relative(ROOT, target)}`);
    existing.delete(relative);
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
  }
  for (const stale of [...existing].sort()) {
    changes.push(`remove ${path.relative(ROOT, path.join(appDir, stale))}`);
    if (!check) fs.rmSync(path.join(appDir, stale));
  }
  if (!check) {
    // Drop directories the removals emptied so the mirror has no leftovers.
    const prune = (dir) => {
      if (!fs.existsSync(dir) || dir === appDir) return;
      if (fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        prune(path.dirname(dir));
      }
    };
    for (const stale of existing) prune(path.dirname(path.join(appDir, stale)));
  }
  return changes;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sources = JSON.parse(fs.readFileSync(SOURCES_FILE, "utf8"));
  if (options.repos.size === 0) {
    console.error("sync-app-docs: pass --repo <app-id>=<path> for each app to sync.");
    console.error(`sync-app-docs: known apps: ${sources.apps.map((app) => app.appId).join(", ")}`);
    process.exit(1);
  }
  for (const appId of options.repos.keys()) {
    if (!sources.apps.some((app) => app.appId === appId)) {
      fail(`${appId} is not listed in apps/docs/sources.json`);
    }
  }

  // Everything is prepared in memory first: a privacy finding in any app must
  // stop the run before a single byte of it reaches the working tree.
  const prepared = [];
  const warnings = [];
  const privacy = [];
  for (const app of sources.apps) {
    if (!options.repos.has(app.appId)) continue;
    const result = syncApp(app, options);
    privacy.push(...result.privacy);
    for (const item of result.unresolved) {
      warnings.push(`${app.appId}: ${item.filePath} ${item.kind} to ${item.target} is not mirrored; it was flattened to plain text.`);
    }
    prepared.push({ app, result });
  }

  for (const warning of warnings) console.warn(`warning: ${warning}`);
  if (privacy.length > 0) {
    console.error("\nPrivacy scan found references that must not be published; nothing was written:");
    for (const finding of privacy) console.error(`  - ${finding}`);
    console.error("Remove the document from the allowlist or fix it upstream, then sync again.");
    process.exit(1);
  }

  const changes = [];
  for (const { app, result } of prepared) {
    changes.push(...applyOutputs(path.join(DOCS_ROOT, app.appId), result.outputs, options.check));
    app.commit = result.commit;
    app.syncedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    console.log(`${app.appId}: ${result.documents.length} document(s) at ${result.commit.slice(0, 12)}`);
  }

  if (!options.check) {
    fs.writeFileSync(SOURCES_FILE, `${JSON.stringify(sources, null, 2)}\n`);
  }

  if (changes.length === 0) {
    console.log("The documentation mirror is already up to date.");
    return;
  }
  for (const change of changes) console.log(change);
  if (options.check) {
    console.error(`\n${changes.length} change(s) pending. Run without --check to apply them.`);
    process.exit(1);
  }
  console.log(`\nApplied ${changes.length} change(s). Review the diff before committing.`);
}

main();
