import { validateCatalog, validateManifest, validAppId, assetHref } from "./schema.js";

const content = document.querySelector("#app-content");
const pageType = document.body.dataset.page;
const detailHref = (id) => `/apps/app/?id=${encodeURIComponent(id)}`;
const releasesHref = (id) => `/apps/releases/?id=${encodeURIComponent(id)}`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function link(text, href, className = "text-link") {
  const node = element("a", className, text);
  node.href = href;
  return node;
}
function paragraph(text, className = "") {
  return element("p", className, text);
}
function heading(kicker, title, description) {
  const section = element("div", "app-heading");
  section.append(paragraph(kicker, "eyebrow section-index"), element("h1", "", title), paragraph(description, "app-lead"));
  return section;
}
function tags(app) {
  const group = element("div", "tags");
  app.platforms.forEach((platform) => group.append(element("span", "", platform.name)));
  return group;
}
function appArt(app, large = false) {
  const art = element("div", `app-art${large ? " app-art-large" : ""}`);
  art.setAttribute("aria-hidden", "true");
  const symbol = element("div", "app-symbol", app.name.slice(0, 1));
  const bars = element("div", "audio-bars");
  for (let i = 0; i < 21; i++) {
    const bar = element("i");
    bar.style.setProperty("--bar-height", `${20 + ((i * 37 + 19) % 75)}%`);
    bars.append(bar);
  }
  art.append(symbol, bars, paragraph("PURPOSE-BUILT / INDEPENDENT SOFTWARE", "mono"));
  return art;
}
function notice(title, text) {
  const block = element("aside", "notice");
  block.append(element("h2", "", title), paragraph(text));
  return block;
}
async function fetchJSON(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${url} (HTTP ${response.status}).`);
  return response.json();
}
function showError(error) {
  console.error("App page could not be loaded:", error);
  const block = element("section", "app-error");
  block.setAttribute("role", "alert");
  block.append(element("h1", "", "This page couldn't be loaded."), paragraph(error.message));
  const actions = element("div", "app-actions");
  const retry = element("button", "button button-primary", "Try again");
  retry.type = "button";
  retry.addEventListener("click", () => window.location.reload());
  actions.append(retry, link("All apps", "/apps/", "button button-secondary"));
  block.append(actions);
  content.replaceChildren(block);
}
function renderCatalog(catalog) {
  const hero = heading("THE APP COLLECTION", "Small ideas. Real software.", "Tools made for the way we listen, create, and work. Get to know each app, then find its published builds.");
  const count = paragraph(`${String(catalog.apps.length).padStart(2, "0")} APP${catalog.apps.length === 1 ? "" : "S"} / EXPLORE THE COLLECTION`, "collection-count mono");
  const grid = element("div", "app-catalog");
  for (const app of catalog.apps) {
    const card = element("article", "catalog-card");
    const top = element("div", "card-topline mono");
    top.append(element("span", "", app.category), element("span", "", app.stage));
    const body = element("div", "catalog-card-body");
    const title = element("h2");
    title.append(link(app.name, detailHref(app.id), "app-title-link"));
    body.append(title, paragraph(app.tagline, "app-tagline"), paragraph(app.summary, "catalog-summary"), tags(app));
    const actions = element("div", "app-actions");
    actions.append(link("Explore app ↗", detailHref(app.id), "button button-primary"), link("Releases ↓", releasesHref(app.id)));
    body.append(actions);
    card.append(top, appArt(app), body);
    grid.append(card);
  }
  content.replaceChildren(hero, count, grid, notice("About these releases", "This collection shares app introductions and approved build packages. Platform support and installation requirements vary by release; read the package notes before downloading."));
}
function renderDetail(app) {
  document.title = `${app.name} | Apps by Qiyu Zhao`;
  document.querySelector('meta[name="description"]').content = app.summary;
  document.querySelector("#breadcrumb-current").textContent = app.name.toUpperCase();
  const hero = element("section", "app-detail-hero");
  const intro = heading(`${app.category} / ${app.stage.toUpperCase()}`, app.name, app.tagline);
  intro.append(paragraph(app.summary, "app-summary"), tags(app));
  const actions = element("div", "app-actions");
  actions.append(link("View releases & downloads ↓", releasesHref(app.id), "button button-primary"), link("All apps", "/apps/"));
  intro.append(actions);
  hero.append(intro, appArt(app, true));
  const story = element("section", "app-story");
  story.append(element("h2", "", "A closer look."));
  app.description.forEach((text) => story.append(paragraph(text)));
  const gallery = screenshotSection(app);
  const featureSection = element("section", "app-section");
  featureSection.append(paragraph("WHAT'S INSIDE", "eyebrow section-index"), element("h2", "", "Thoughtful by design."));
  const features = element("div", "feature-grid");
  app.features.forEach((feature, index) => {
    const card = element("article", "feature-card");
    card.append(paragraph(String(index + 1).padStart(2, "0"), "mono feature-number"), element("h3", "", feature.title), paragraph(feature.description));
    features.append(card);
  });
  featureSection.append(features);
  const platforms = platformSection(app);
  const install = element("section", "app-section");
  install.append(paragraph("BEFORE YOU START", "eyebrow section-index"), element("h2", "", "A little context."));
  const steps = element("ol", "installation-list");
  app.installation.forEach((text) => steps.append(element("li", "", text)));
  install.append(steps);
  content.replaceChildren(hero, story);
  if (gallery) content.append(gallery);
  content.append(featureSection, platforms, install, notice("Use responsibly", app.notice));
}
function screenshotSection(app) {
  if (!app.screenshots?.length) return null;
  const section = element("section", "app-section app-gallery");
  section.append(paragraph("IN THE APP", "eyebrow section-index"), element("h2", "", "One library, shaped to the screen."));
  const intro = paragraph("The same listening context adapts from a focused compact window to a persistent desktop player—without hiding the queue, chapters, or primary playback controls.", "gallery-intro");
  const grid = element("div", "screenshot-grid");
  app.screenshots.forEach((screenshot, index) => {
    const figure = element("figure", `screenshot-card${index === 0 ? " screenshot-wide" : ""}`);
    const image = element("img");
    image.src = screenshot.src;
    image.alt = screenshot.alt;
    image.width = screenshot.width;
    image.height = screenshot.height;
    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";
    figure.append(image, element("figcaption", "mono", screenshot.caption));
    grid.append(figure);
  });
  section.append(intro, grid);
  return section;
}
function platformSection(app) {
  const section = element("section", "app-section");
  section.append(paragraph("PLATFORMS", "eyebrow section-index"), element("h2", "", "Know your build."));
  const grid = element("div", "platform-grid");
  app.platforms.forEach((platform) => {
    const card = element("article", "platform-card");
    card.append(element("h3", "", platform.name), paragraph(platform.status));
    grid.append(card);
  });
  section.append(grid);
  return section;
}
function formatBytes(bytes) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KiB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
function packageCard(app, asset) {
  const card = element("article", "package-card");
  const platform = app.platforms.find(({ id }) => id === asset.platform);
  const info = element("div", "package-info");
  info.append(paragraph(`${platform.name.toUpperCase()} / ${asset.architecture}`, "mono package-platform"), element("h3", "", asset.name));
  const meta = element("div", "tags");
  meta.append(element("span", "", formatBytes(asset.bytes)), element("span", "", asset.file.split(".").at(-1).toUpperCase()), element("span", `signing signing-${asset.signing}`, asset.signing === "signed" ? "Signed (publisher-reported)" : asset.signing === "self-signed" ? "Self-signed development build" : "Unsigned development build"));
  info.append(meta, paragraph(asset.installNotes, "package-notes"), paragraph(asset.file, "package-filename mono"));
  const download = link("Download package ↓", assetHref(app.id, asset), "button button-primary download-link");
  if (!asset.url) download.download = asset.file;
  const checksum = element("details", "checksum");
  checksum.append(element("summary", "", "SHA-256 checksum"));
  checksum.append(element("code", "", asset.sha256), paragraph("Compare this value with a locally computed SHA-256 hash. A matching checksum detects file changes; it does not establish publisher identity or replace signature verification."));
  card.append(info, download, checksum);
  return card;
}
function renderReleases(app, manifest) {
  document.title = `${app.name} downloads | Qiyu Zhao`;
  const crumb = document.querySelector("#breadcrumb-app");
  crumb.textContent = app.name.toUpperCase();
  crumb.href = detailHref(app.id);
  const hero = heading("RELEASE CHANNEL", `${app.name} downloads`, "The latest published build, with the details you need before you install.");
  hero.append(link(`About ${app.name} ↗`, detailHref(app.id)));
  content.replaceChildren(hero);
  const release = manifest.release;
  if (release === null) {
    const empty = element("section", "release-empty");
    empty.append(paragraph("AWAITING FIRST PUBLIC BUILD", "mono"), element("h2", "", "Not released here. Yet."), paragraph("No public release has been uploaded for this app. Download links will appear when a build is published. A development version is not a downloadable release."));
    content.append(empty, platformSection(app), notice("Use responsibly", app.notice));
    return;
  }
  const summary = element("section", "release-summary");
  summary.append(paragraph(release.channel.toUpperCase(), "eyebrow section-index"), element("h2", "", `Version ${release.version}`));
  const published = element("time", "mono", `PUBLISHED ${release.publishedAt.slice(0, 10)} UTC`);
  published.dateTime = release.publishedAt;
  summary.append(published);
  const notes = element("ul", "release-notes");
  release.notes.forEach((note) => notes.append(element("li", "", note)));
  summary.append(notes);
  content.append(summary, notice("Before installing", "Signing status is supplied by the publisher. Unsigned and self-signed packages are development builds, not publicly trusted software. Follow your device and organization policies; do not disable security protections to install an app."));
  const downloads = element("section", "app-section");
  downloads.append(element("h2", "", "Choose your package."));
  const filters = element("div", "platform-filter");
  const label = element("label", "mono", "PLATFORM");
  label.htmlFor = "platform-filter";
  const select = element("select");
  select.id = "platform-filter";
  const all = element("option", "", "All platforms");
  all.value = "all";
  select.append(all);
  app.platforms.filter((platform) => release.assets.some((asset) => asset.platform === platform.id)).forEach((platform) => {
    const option = element("option", "", platform.name);
    option.value = platform.id;
    select.append(option);
  });
  const count = paragraph("", "package-count mono");
  count.setAttribute("role", "status");
  filters.append(label, select, count);
  const packages = element("div", "packages");
  function renderPackages() {
    const assets = release.assets.filter((asset) => select.value === "all" || select.value === asset.platform);
    packages.replaceChildren(...assets.map((asset) => packageCard(app, asset)));
    count.textContent = `${assets.length} PACKAGE${assets.length === 1 ? "" : "S"}`;
  }
  select.addEventListener("change", renderPackages);
  renderPackages();
  downloads.append(filters, packages);
  content.append(downloads, notice("Use responsibly", app.notice));
}

async function load() {
  try {
    const catalog = validateCatalog(await fetchJSON("/apps/catalog.json"));
    if (pageType === "catalog") {
      renderCatalog(catalog);
      return;
    }
    const id = new URLSearchParams(window.location.search).get("id");
    if (!validAppId(id)) throw new Error("Choose an app from the collection. This address has a missing or invalid app id.");
    const app = catalog.apps.find((candidate) => candidate.id === id);
    if (!app) throw new Error(`App "${id}" was not found in the collection.`);
    if (pageType === "detail") renderDetail(app);
    else {
      const manifest = validateManifest(await fetchJSON(`/releases/${app.id}/latest/manifest.json`), app);
      renderReleases(app, manifest);
    }
  } catch (error) {
    showError(error);
  } finally {
    content.setAttribute("aria-busy", "false");
  }
}

load();
