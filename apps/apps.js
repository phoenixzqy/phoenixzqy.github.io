import { validateCatalog, validateManifest, validAppId, assetHref } from "./schema.js";
import { chooseLocale, localizeData, translate } from "./locales.js";

const content = document.querySelector("#app-content");
const pageType = document.body.dataset.page;
const localeSelect = document.querySelector("#locale-select");
const preferenceKey = "apps.locale";
let savedLocale;
try {
  savedLocale = localStorage.getItem(preferenceKey);
} catch (error) {
  console.warn("Language preference storage is unavailable; using the URL or browser language.", error);
}
let locale = chooseLocale({ search: location.search, saved: savedLocale, languages: navigator.languages });
const state = { catalog: null, app: null, manifest: undefined, error: null };
let selectedPlatform = "all";
const t = (key, values) => translate(locale, key, values);
function appsHref(path = "/apps/", id) {
  const params = new URLSearchParams();
  if (id) params.set("id", id);
  params.set("lang", locale);
  return `${path}?${params}`;
}
const detailHref = (id) => appsHref("/apps/app/", id);
const releasesHref = (id) => appsHref("/apps/releases/", id);

class PageError extends Error {
  constructor(key, values = {}, cause) {
    super(key, { cause });
    this.key = key;
    this.values = values;
  }
}

function updateShell() {
  document.documentElement.lang = locale;
  localeSelect.value = locale;
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll("[data-i18n-label]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nLabel)); });
  document.querySelectorAll("[data-apps-link]").forEach((node) => { node.href = appsHref(); });
}

function updateMetadata(app) {
  const titles = { catalog: "titleCatalog", detail: "titleDetail", releases: "titleReleases" };
  const descriptions = { catalog: "descriptionCatalog", detail: "descriptionDetail", releases: "descriptionReleases" };
  let title = t(titles[pageType]);
  let description = t(descriptions[pageType]);
  if (app) {
    title = t(pageType === "detail" ? "titleApp" : "titleAppReleases", { name: app.name });
    description = pageType === "detail" ? app.summary : t("descriptionAppReleases", { name: app.name });
    const crumb = document.querySelector("#breadcrumb-current, #breadcrumb-app");
    if (crumb) {
      crumb.textContent = app.name.toLocaleUpperCase(locale);
      if (crumb.tagName === "A") crumb.href = detailHref(app.id);
    }
  }
  document.title = state.error ? t("titleError", { title }) : title;
  document.querySelector('meta[name="description"]').content = state.error ? t("errorHeading") : description;
  for (const [property, value] of [["og:title", document.title], ["og:description", document.querySelector('meta[name="description"]').content]]) {
    let meta = document.querySelector(`meta[property="${property}"]`);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("property", property);
      document.head.append(meta);
    }
    meta.content = value;
  }
}

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
  art.append(symbol, bars, paragraph(t("artwork"), "mono"));
  return art;
}
function notice(title, text) {
  const block = element("aside", "notice");
  block.append(element("h2", "", title), paragraph(text));
  return block;
}
async function fetchJSON(url) {
  let response;
  try {
    response = await fetch(url, { cache: "no-cache" });
  } catch (error) {
    throw new PageError("networkError", {}, error);
  }
  if (!response.ok) throw new PageError("httpError", { path: url, status: response.status });
  return response.json();
}
function showError(error) {
  const block = element("section", "app-error");
  block.setAttribute("role", "alert");
  block.append(element("h1", "", t("errorHeading")), paragraph(error instanceof PageError ? t(error.key, error.values) : t("metadataError")));
  if (!(error instanceof PageError)) {
    const details = element("details", "error-details");
    const diagnostic = paragraph(error.message);
    diagnostic.lang = "en";
    details.append(element("summary", "", t("technicalDetails")), diagnostic);
    block.append(details);
  }
  const actions = element("div", "app-actions");
  const retry = element("button", "button button-primary", t("retry"));
  retry.type = "button";
  retry.addEventListener("click", () => window.location.reload());
  actions.append(retry, link(t("allApps"), appsHref(), "button button-secondary"));
  block.append(actions);
  content.replaceChildren(block);
}
function renderCatalog(catalog) {
  const hero = heading(t("collection"), t("catalogHeading"), t("catalogLead"));
  const count = paragraph(t("collectionCount", { count: String(catalog.apps.length).padStart(2, "0"), unit: t(catalog.apps.length === 1 ? "appUnit" : "appsUnit") }), "collection-count mono");
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
    actions.append(link(t("explore"), detailHref(app.id), "button button-primary"), link(t("releases"), releasesHref(app.id)));
    body.append(actions);
    card.append(top, appArt(app), body);
    grid.append(card);
  }
  content.replaceChildren(hero, count, grid, notice(t("aboutReleases"), t("aboutReleasesText")));
}
function renderDetail(app) {
  const hero = element("section", "app-detail-hero");
  const intro = heading(`${app.category} / ${app.stage.toUpperCase()}`, app.name, app.tagline);
  intro.append(paragraph(app.summary, "app-summary"), tags(app));
  const actions = element("div", "app-actions");
  actions.append(link(t("viewReleases"), releasesHref(app.id), "button button-primary"), link(t("allApps"), appsHref()));
  intro.append(actions);
  hero.append(intro, appArt(app, true));
  const story = element("section", "app-story");
  story.append(element("h2", "", t("closerLook")));
  app.description.forEach((text) => story.append(paragraph(text)));
  const gallery = screenshotSection(app);
  const featureSection = element("section", "app-section");
  featureSection.append(paragraph(t("inside"), "eyebrow section-index"), element("h2", "", t("featuresHeading")));
  const features = element("div", "feature-grid");
  app.features.forEach((feature, index) => {
    const card = element("article", "feature-card");
    card.append(paragraph(String(index + 1).padStart(2, "0"), "mono feature-number"), element("h3", "", feature.title), paragraph(feature.description));
    features.append(card);
  });
  featureSection.append(features);
  const platforms = platformSection(app);
  const install = element("section", "app-section");
  install.append(paragraph(t("beforeStart"), "eyebrow section-index"), element("h2", "", t("context")));
  const steps = element("ol", "installation-list");
  app.installation.forEach((text) => steps.append(element("li", "", text)));
  install.append(steps);
  content.replaceChildren(hero, story);
  if (gallery) content.append(gallery);
  content.append(featureSection, platforms, install, notice(t("responsible"), app.notice));
}
function screenshotSection(app) {
  if (!app.screenshots?.length) return null;
  const section = element("section", "app-section app-gallery");
  section.append(paragraph(t("inApp"), "eyebrow section-index"), element("h2", "", t("galleryHeading")));
  const intro = paragraph(t("galleryIntro"), "gallery-intro");
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
  section.append(paragraph(t("platforms"), "eyebrow section-index"), element("h2", "", t("platformHeading")));
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
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return bytes < 1024 * 1024
    ? `${number.format(bytes / 1024)} KiB`
    : `${number.format(bytes / (1024 * 1024))} MiB`;
}
function packageCard(app, asset) {
  const card = element("article", "package-card");
  const platform = app.platforms.find(({ id }) => id === asset.platform);
  const info = element("div", "package-info");
  info.append(paragraph(`${platform.name.toUpperCase()} / ${asset.architecture}`, "mono package-platform"), element("h3", "", asset.name));
  const meta = element("div", "tags");
  const signingLabel = t({ signed: "signed", "self-signed": "selfSigned", "ad-hoc": "adHoc", unsigned: "unsigned" }[asset.signing]);
  meta.append(element("span", "", formatBytes(asset.bytes)), element("span", "", asset.file.split(".").at(-1).toUpperCase()), element("span", `signing signing-${asset.signing}`, signingLabel));
  info.append(meta, paragraph(asset.installNotes, "package-notes"), paragraph(asset.file, "package-filename mono"));
  const download = link(t("download"), assetHref(app.id, asset), "button button-primary download-link");
  if (!asset.url) download.download = asset.file;
  const checksum = element("details", "checksum");
  checksum.append(element("summary", "", t("checksum")));
  checksum.append(element("code", "", asset.sha256), paragraph(t("checksumHelp")));
  card.append(info, download, checksum);
  return card;
}
function renderReleases(app, manifest) {
  const hero = heading(t("releaseChannel"), t("downloadsHeading", { name: app.name }), t("downloadsLead"));
  hero.append(link(t("aboutApp", { name: app.name }), detailHref(app.id)));
  content.replaceChildren(hero);
  const release = manifest.release;
  if (release === null) {
    const empty = element("section", "release-empty");
    empty.append(paragraph(t("awaiting"), "mono"), element("h2", "", t("emptyHeading")), paragraph(t("emptyText")));
    content.append(empty, platformSection(app), notice(t("responsible"), app.notice));
    return;
  }
  const summary = element("section", "release-summary");
  summary.append(paragraph(t(release.channel), "eyebrow section-index"), element("h2", "", t("version", { version: release.version })));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(release.publishedAt));
  const published = element("time", "mono", t("published", { date }));
  published.dateTime = release.publishedAt;
  summary.append(published);
  const notes = element("ul", "release-notes");
  release.notes.forEach((note) => notes.append(element("li", "", note)));
  summary.append(notes);
  content.append(summary, notice(t("beforeInstall"), t("signingHelp")));
  const downloads = element("section", "app-section");
  downloads.append(element("h2", "", t("choosePackage")));
  const filters = element("div", "platform-filter");
  const label = element("label", "mono", t("platform"));
  label.htmlFor = "platform-filter";
  const select = element("select");
  select.id = "platform-filter";
  const all = element("option", "", t("allPlatforms"));
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
    count.textContent = t("packageCount", { count: assets.length, unit: t(assets.length === 1 ? "packageUnit" : "packagesUnit") });
  }
  if ([...select.options].some((option) => option.value === selectedPlatform)) select.value = selectedPlatform;
  select.addEventListener("change", () => {
    selectedPlatform = select.value;
    renderPackages();
  });
  renderPackages();
  downloads.append(filters, packages);
  content.append(downloads, notice(t("responsible"), app.notice));
}

function render() {
  const app = state.app ? localizeData(state.app, locale) : null;
  updateMetadata(app);
  if (state.error) return showError(state.error);
  if (!state.catalog || (pageType === "releases" && state.manifest === undefined)) {
    content.replaceChildren(paragraph(t({ catalog: "loadingCatalog", detail: "loadingDetail", releases: "loadingReleases" }[pageType]), "load-status"));
    content.firstElementChild.setAttribute("role", "status");
    return;
  }
  if (pageType === "catalog") renderCatalog(localizeData(state.catalog, locale));
  else if (pageType === "detail") renderDetail(app);
  else renderReleases(app, localizeData(state.manifest, locale));
  if (locale !== "en") content.append(paragraph(t("translationNote"), "translation-note"));
}

async function load() {
  try {
    state.catalog = validateCatalog(await fetchJSON("/apps/catalog.json"));
    if (pageType !== "catalog") {
      const id = new URLSearchParams(window.location.search).get("id");
      if (!validAppId(id)) throw new PageError("invalidApp");
      state.app = state.catalog.apps.find((candidate) => candidate.id === id);
      if (!state.app) throw new PageError("unknownApp", { id });
      updateMetadata(localizeData(state.app, locale));
      if (pageType === "releases") {
        state.manifest = validateManifest(await fetchJSON(`/releases/${state.app.id}/latest/manifest.json`), state.app);
      }
    }
  } catch (error) {
    console.error("App page could not be loaded:", error);
    state.error = error;
  } finally {
    content.setAttribute("aria-busy", "false");
    render();
  }
}

localeSelect.addEventListener("change", () => {
  locale = localeSelect.value;
  try {
    localStorage.setItem(preferenceKey, locale);
  } catch (error) {
    console.warn("Language preference could not be saved; the URL still records your selection.", error);
  }
  const url = new URL(location.href);
  url.searchParams.set("lang", locale);
  history.replaceState(null, "", url);
  updateShell();
  render();
});
document.querySelector(".locale-control").hidden = false;
updateShell();
render();
load();
