export const MAX_LOCAL_BYTES = 100 * 1024 * 1024;
const RELEASE_PREFIX = "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._+-]*\.(?:zip|apk|aab|ipa|exe|msix|dmg|pkg|deb|rpm|AppImage)$/;
const SCREENSHOT = /^\/apps\/media\/([a-z0-9]+(?:-[a-z0-9]+)*)\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|webp|avif)$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value, label) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}
function text(value, label, max = 4000) {
  requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= max, `${label} must be non-empty text (up to ${max} characters).`);
}
function list(value, label, min = 1, max = 100) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= max, `${label} must contain ${min}–${max} items.`);
}
function unique(values, label) {
  requireValue(new Set(values).size === values.length, `${label} must be unique.`);
}
export function validAppId(id) {
  return typeof id === "string" && id.length <= 64 && SLUG.test(id);
}
export function validateCatalog(catalog) {
  object(catalog, "Catalog");
  requireValue(catalog.schemaVersion === 1, "Unsupported catalog schemaVersion.");
  list(catalog.apps, "Catalog apps");
  for (const app of catalog.apps) {
    object(app, "App");
    requireValue(validAppId(app.id), "App id must be a lowercase URL-safe slug.");
    for (const key of ["name", "category", "tagline", "summary", "stage", "notice"]) text(app[key], `${app.id}.${key}`);
    for (const key of ["description", "installation"]) {
      list(app[key], `${app.id}.${key}`);
      app[key].forEach((item) => text(item, `${app.id}.${key} item`));
    }
    if (app.screenshots !== undefined) {
      list(app.screenshots, `${app.id}.screenshots`, 1, 6);
      for (const screenshot of app.screenshots) {
        object(screenshot, "Screenshot");
        const match = typeof screenshot.src === "string" && screenshot.src.match(SCREENSHOT);
        requireValue(match && match[1] === app.id && !screenshot.src.includes(".."),
          "Screenshot src must be an app-owned image under /apps/media/<app-id>/.");
        text(screenshot.alt, "Screenshot alt text", 240);
        text(screenshot.caption, "Screenshot caption", 160);
        requireValue(Number.isSafeInteger(screenshot.width) && screenshot.width > 0 &&
          Number.isSafeInteger(screenshot.height) && screenshot.height > 0,
        "Screenshot dimensions must be positive integers.");
      }
      unique(app.screenshots.map(({ src }) => src), "Screenshot sources");
    }
    list(app.platforms, `${app.id}.platforms`);
    for (const platform of app.platforms) {
      object(platform, "Platform");
      requireValue(validAppId(platform.id), "Platform id must be a lowercase slug.");
      text(platform.name, "Platform name", 80);
      text(platform.status, "Platform status");
    }
    unique(app.platforms.map(({ id }) => id), "Platform ids");
    list(app.features, `${app.id}.features`);
    for (const feature of app.features) {
      object(feature, "Feature");
      text(feature.title, "Feature title", 120);
      text(feature.description, "Feature description");
    }
  }
  unique(catalog.apps.map(({ id }) => id), "App ids");
  return catalog;
}

export function validateManifest(manifest, app) {
  object(manifest, "Release manifest");
  requireValue(manifest.schemaVersion === 1, "Unsupported release schemaVersion.");
  requireValue(manifest.appId === app.id, "Release appId does not match the selected app.");
  if (manifest.release === null) return manifest;
  const release = manifest.release;
  object(release, "Release");
  text(release.version, "Release version", 80);
  requireValue(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(release.version), "Release version must use major.minor.patch with optional prerelease/build metadata.");
  requireValue(["preview", "stable"].includes(release.channel), "Release channel must be preview or stable.");
  requireValue(typeof release.publishedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(release.publishedAt) &&
    Number.isFinite(Date.parse(release.publishedAt)) &&
    new Date(release.publishedAt).toISOString().replace(".000Z", "Z") === release.publishedAt,
  "Release publishedAt must be a valid UTC timestamp, such as 2026-09-22T12:00:00Z.");
  list(release.notes, "Release notes");
  release.notes.forEach((note) => text(note, "Release note"));
  list(release.assets, "Release assets");
  for (const asset of release.assets) {
    object(asset, "Asset");
    text(asset.name, "Asset name", 120);
    requireValue(app.platforms.some(({ id }) => id === asset.platform), "Asset platform must be listed in the app catalog.");
    text(asset.architecture, "Asset architecture", 80);
    requireValue(typeof asset.file === "string" && asset.file.length <= 200 && PACKAGE.test(asset.file) && !asset.file.includes(".."), "Asset file must be a package basename, not a path.");
    requireValue(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, "Asset bytes must be a positive safe integer.");
    requireValue(typeof asset.sha256 === "string" && /^[a-f0-9]{64}$/.test(asset.sha256), "Asset sha256 must be 64 lowercase hexadecimal characters.");
    requireValue(["unsigned", "ad-hoc", "self-signed", "signed"].includes(asset.signing), "Asset signing must be unsigned, ad-hoc, self-signed, or signed.");
    text(asset.installNotes, "Asset installation notes");
    if (asset.url !== undefined) {
      text(asset.url, "Asset URL", 2048);
      const url = new URL(asset.url);
      requireValue(asset.url.startsWith(RELEASE_PREFIX) && url.origin === "https://github.com" &&
        !url.username && !url.password && !url.search && !url.hash &&
        url.href === asset.url &&
        url.pathname.startsWith("/phoenixzqy/phoenixzqy.github.io/releases/download/"),
      "External assets must use public GitHub Release download URLs in this website repository.");
      const path = url.pathname.slice("/phoenixzqy/phoenixzqy.github.io/releases/download/".length).split("/");
      requireValue(path.length === 2 && /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(path[0]) &&
        decodeURIComponent(path[1]) === asset.file, "Release URL must contain a simple tag and the matching package filename.");
    } else {
      requireValue(asset.bytes <= MAX_LOCAL_BYTES, "Packages larger than 100 MiB must use a public GitHub Release URL.");
    }
  }
  unique(release.assets.map(({ file }) => file), "Asset filenames");
  return manifest;
}

export function assetHref(appId, asset) {
  requireValue(validAppId(appId), "Invalid app id.");
  return asset.url ?? `/releases/${appId}/latest/${encodeURIComponent(asset.file)}`;
}
