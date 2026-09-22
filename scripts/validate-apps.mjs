import { readFile, readdir, lstat, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog, validateManifest } from "../apps/schema.js";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function validateSite(root = siteRoot) {
  const catalog = validateCatalog(JSON.parse(await readFile(join(root, "apps/catalog.json"), "utf8")));
  let totalBytes = 0;
  for (const app of catalog.apps) {
    const folder = join(root, "releases", app.id, "latest");
    const manifestPath = join(folder, "manifest.json");
    if ((await lstat(manifestPath)).isSymbolicLink()) throw new Error(`${app.id}: manifest must not be a symlink.`);
    const manifest = validateManifest(JSON.parse(await readFile(manifestPath, "utf8")), app);
    const expected = new Set(["manifest.json"]);
    if (await realpath(folder) !== resolve(folder)) throw new Error(`${app.id}: release folder must not contain symlinks.`);
    for (const asset of manifest.release?.assets ?? []) {
      if (asset.url) continue;
      expected.add(asset.file);
      const file = join(folder, asset.file);
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${app.id}/${asset.file}: package must be a regular file, not a symlink.`);
      if (stat.size !== asset.bytes) throw new Error(`${app.id}/${asset.file}: byte count does not match the manifest.`);
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(file)) hash.update(chunk);
      if (hash.digest("hex") !== asset.sha256) throw new Error(`${app.id}/${asset.file}: SHA-256 does not match the manifest.`);
      totalBytes += stat.size;
    }
    const unexpected = (await readdir(folder)).filter((name) => !expected.has(name));
    if (unexpected.length) throw new Error(`${app.id}: unlisted files in latest/: ${unexpected.join(", ")}. Publish only approved packages and the manifest.`);
  }
  if (totalBytes >= 1024 ** 3) throw new Error("Local packages reach the 1 GiB Pages limit. Move packages to public GitHub Releases and leave room for the website.");
  return { apps: catalog.apps.length, localBytes: totalBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await validateSite();
    console.log(`Validated ${result.apps} app(s), release metadata, and ${result.localBytes} local package bytes.`);
  } catch (error) {
    console.error(`App release validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
