import { SUPPORTED_LOCALES } from "./locales.js";

export const MAX_LOCAL_BYTES = 100 * 1024 * 1024;
const RELEASE_PREFIX = "https://github.com/phoenixzqy/phoenixzqy.github.io/releases/download/";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PACKAGE = /^[A-Za-z0-9][A-Za-z0-9._+-]*\.(?:zip|apk|aab|ipa|exe|msix|dmg|pkg|deb|rpm|AppImage)$/;
const mediaPath = (extensions) =>
  new RegExp(`^/apps/media/([a-z0-9]+(?:-[a-z0-9]+)*)/[A-Za-z0-9][A-Za-z0-9._-]*\\.(?:${extensions})$`);
const SCREENSHOT = mediaPath("png|webp|avif");
const VIDEO = mediaPath("mp4|webm");
const VIDEO_TYPES = { mp4: "video/mp4", webm: "video/webm" };
const INSTALL_COMMAND = /^[\x20-\x7e]+$/;
const PUBLIC_HTTPS_URL = /^https:\/\/[^\s]+$/;
const COMPARISON_NOTE_REFERENCE = /\[(\d+)\]/g;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value, label) {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}
function text(value, label, max = 4000) {
  requireValue(typeof value === "string" && value.trim().length > 0 && value.length <= max, `${label} must be non-empty text (up to ${max} characters).`);
}
function localizedText(value, label, max = 4000) {
  if (typeof value === "string") return text(value, label, max);
  object(value, label);
  text(value.en, `${label}.en`, max);
  for (const [locale, translation] of Object.entries(value)) {
    requireValue(SUPPORTED_LOCALES.includes(locale), `${label} contains an unsupported locale: ${locale}.`);
    text(translation, `${label}.${locale}`, max);
  }
}
function localizedStrings(value) {
  return typeof value === "string" ? [value] : Object.values(value);
}
function list(value, label, min = 1, max = 100) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= max, `${label} must contain ${min}–${max} items.`);
}
function unique(values, label) {
  requireValue(new Set(values).size === values.length, `${label} must be unique.`);
}
function appMedia(source, pattern, appId, label) {
  const match = typeof source === "string" && source.match(pattern);
  requireValue(match && match[1] === appId && !source.includes(".."), label);
  return source;
}
function dimensions(value, label) {
  requireValue(Number.isSafeInteger(value.width) && value.width > 0 &&
    Number.isSafeInteger(value.height) && value.height > 0, `${label} dimensions must be positive integers.`);
}
export function videoType(src) {
  const type = VIDEO_TYPES[src.split(".").at(-1).toLowerCase()];
  requireValue(type, "Unsupported video format.");
  return type;
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
    for (const key of ["name", "category", "tagline", "summary", "stage", "notice"]) localizedText(app[key], `${app.id}.${key}`);
    for (const key of ["description", "installation"]) {
      list(app[key], `${app.id}.${key}`);
      app[key].forEach((item) => localizedText(item, `${app.id}.${key} item`));
    }
    if (app.artwork !== undefined) {
      object(app.artwork, `${app.id}.artwork`);
      appMedia(app.artwork.src, SCREENSHOT, app.id,
        "Artwork src must be an app-owned image under /apps/media/<app-id>/.");
      localizedText(app.artwork.alt, "Artwork alt text", 240);
      dimensions(app.artwork, "Artwork");
    }
    if (app.screenshots !== undefined) {
      list(app.screenshots, `${app.id}.screenshots`, 1, 6);
      for (const screenshot of app.screenshots) {
        object(screenshot, "Screenshot");
        appMedia(screenshot.src, SCREENSHOT, app.id,
          "Screenshot src must be an app-owned image under /apps/media/<app-id>/.");
        localizedText(screenshot.alt, "Screenshot alt text", 240);
        localizedText(screenshot.caption, "Screenshot caption", 160);
        dimensions(screenshot, "Screenshot");
      }
      unique(app.screenshots.map(({ src }) => src), "Screenshot sources");
    }
    if (app.videos !== undefined) {
      list(app.videos, `${app.id}.videos`, 1, 6);
      for (const video of app.videos) {
        object(video, "Video");
        appMedia(video.src, VIDEO, app.id,
          "Video src must be an app-owned mp4 or webm under /apps/media/<app-id>/.");
        videoType(video.src);
        appMedia(video.poster, SCREENSHOT, app.id,
          "Video poster must be an app-owned image under /apps/media/<app-id>/.");
        localizedText(video.title, "Video title", 120);
        localizedText(video.caption, "Video caption", 400);
        dimensions(video, "Video");
        if (video.muted !== undefined) requireValue(typeof video.muted === "boolean", "Video muted must be a boolean.");
      }
      unique(app.videos.map(({ src }) => src), "Video sources");
    }
    if (app.installCommands !== undefined) {
      list(app.installCommands, `${app.id}.installCommands`, 1, 6);
      for (const entry of app.installCommands) {
        object(entry, "Installation command");
        localizedText(entry.label, "Installation command label", 120);
        text(entry.command, "Installation command", 400);
        requireValue(INSTALL_COMMAND.test(entry.command),
          "Installation commands must be plain printable ASCII, so they stay copyable.");
      }
      unique(app.installCommands.map(({ command }) => command), "Installation commands");
    }
    if (app.documentation !== undefined) {
      requireValue(app.documentation === true, "Documentation must be true when present, or omitted.");
    }
    list(app.platforms, `${app.id}.platforms`);
    for (const platform of app.platforms) {
      object(platform, "Platform");
      requireValue(validAppId(platform.id), "Platform id must be a lowercase slug.");
      localizedText(platform.name, "Platform name", 80);
      localizedText(platform.status, "Platform status");
    }
    unique(app.platforms.map(({ id }) => id), "Platform ids");
    list(app.features, `${app.id}.features`);
    for (const feature of app.features) {
      object(feature, "Feature");
      localizedText(feature.title, "Feature title", 120);
      localizedText(feature.description, "Feature description");
    }
    if (app.comparison !== undefined) {
      object(app.comparison, `${app.id}.comparison`);
      localizedText(app.comparison.intro, "Comparison introduction", 600);
      list(app.comparison.groups, `${app.id}.comparison.groups`, 1, 4);
      const comparisonReferences = [];
      let comparisonNoteCount = 0;
      for (const group of app.comparison.groups) {
        object(group, "Comparison group");
        localizedText(group.title, "Comparison group title", 160);
        list(group.columns, "Comparison columns", 2, 8);
        group.columns.forEach((column) => localizedText(column, "Comparison column", 120));
        list(group.rows, "Comparison rows", 1, 20);
        for (const row of group.rows) {
          object(row, "Comparison row");
          localizedText(row.label, "Comparison row label", 240);
          list(row.values, "Comparison row values", group.columns.length, group.columns.length);
          row.values.forEach((value) => {
            localizedText(value, "Comparison cell", 240);
            for (const content of localizedStrings(value)) {
              for (const match of content.matchAll(COMPARISON_NOTE_REFERENCE)) {
                requireValue(/^[1-9]\d*$/.test(match[1]),
                  `Comparison note reference ${match[0]} must be a positive number without leading zeros.`);
                comparisonReferences.push(Number(match[1]));
              }
            }
          });
        }
        if (group.notes !== undefined) {
          list(group.notes, "Comparison notes", 1, 20);
          group.notes.forEach((note) => localizedText(note, "Comparison note", 1200));
          comparisonNoteCount += group.notes.length;
        }
      }
      comparisonReferences.forEach((reference) => requireValue(
        reference >= 1 && reference <= comparisonNoteCount,
        `Comparison note reference ${reference} does not identify an app comparison note.`,
      ));
      object(app.comparison.source, "Comparison source");
      localizedText(app.comparison.source.label, "Comparison source label", 160);
      text(app.comparison.source.url, "Comparison source URL", 500);
      requireValue(PUBLIC_HTTPS_URL.test(app.comparison.source.url),
        "Comparison source URL must be public HTTPS.");
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
  release.notes.forEach((note) => localizedText(note, "Release note"));
  list(release.assets, "Release assets");
  for (const asset of release.assets) {
    object(asset, "Asset");
    localizedText(asset.name, "Asset name", 120);
    requireValue(app.platforms.some(({ id }) => id === asset.platform), "Asset platform must be listed in the app catalog.");
    text(asset.architecture, "Asset architecture", 80);
    requireValue(typeof asset.file === "string" && asset.file.length <= 200 && PACKAGE.test(asset.file) && !asset.file.includes(".."), "Asset file must be a package basename, not a path.");
    requireValue(Number.isSafeInteger(asset.bytes) && asset.bytes > 0, "Asset bytes must be a positive safe integer.");
    requireValue(typeof asset.sha256 === "string" && /^[a-f0-9]{64}$/.test(asset.sha256), "Asset sha256 must be 64 lowercase hexadecimal characters.");
    requireValue(["unsigned", "ad-hoc", "self-signed", "signed"].includes(asset.signing), "Asset signing must be unsigned, ad-hoc, self-signed, or signed.");
    localizedText(asset.installNotes, "Asset installation notes");
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

const DOC_SLUG = /^[a-z0-9]+(?:[-_]+[a-z0-9]+)*$/;
const DOC_FILE = /^[a-z0-9][a-z0-9._-]*\.md$/;
const REPOSITORY = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;

// Validates the generated index of a documentation mirror. The viewer only
// fetches files this index names, so every entry has to stay a plain file name
// inside the app's own mirror directory.
export function validateDocsIndex(index, app) {
  object(index, "Documentation index");
  requireValue(index.schemaVersion === 1, "Unsupported documentation schemaVersion.");
  requireValue(index.appId === app.id, "Documentation appId does not match the selected app.");
  requireValue(typeof index.repository === "string" && REPOSITORY.test(index.repository), "Documentation repository must be owner/name.");
  text(index.ref, "Documentation ref", 200);
  requireValue(typeof index.commit === "string" && COMMIT.test(index.commit), "Documentation commit must be a full commit hash.");
  list(index.documents, "Documentation documents", 1, 200);
  for (const document_ of index.documents) {
    object(document_, "Documentation entry");
    requireValue(typeof document_.slug === "string" && DOC_SLUG.test(document_.slug), "Documentation slug must be a lowercase slug.");
    requireValue(typeof document_.file === "string" && DOC_FILE.test(document_.file) && !document_.file.includes(".."), "Documentation file must be a Markdown file inside the mirror.");
    text(document_.title, "Documentation title", 120);
    text(document_.source, "Documentation source path", 400);
  }
  requireValue(Array.isArray(index.assets), "Documentation assets must be an array.");
  for (const asset of index.assets) {
    requireValue(typeof asset === "string" && /^assets\/[a-z0-9][a-z0-9._-]*$/.test(asset) && !asset.includes(".."), "Documentation asset must be a file inside assets/.");
  }
  unique(index.assets, "Documentation assets");
  unique(index.documents.map((document_) => document_.slug), "Documentation slugs");
  unique(index.documents.map((document_) => document_.file), "Documentation files");
  return index;
}
