export const SUPPORTED_LOCALES = ["en", "zh-CN"];

export const messages = {
  en: {
    skip: "Skip to content", homeLabel: "Qiyu Zhao, home", navigation: "Main navigation",
    aboutMe: "About me", apps: "Apps", contact: "Contact", language: "Language",
    breadcrumb: "Breadcrumb", home: "HOME", app: "APP", appDetails: "APP DETAILS", downloads: "DOWNLOADS",
    backAboutMe: "Back to About me", allApps: "All apps", footer: "Independent apps. Purpose-built.",
    releaseFooter: "Download thoughtfully. Verify your build.",
    titleCatalog: "Apps | Qiyu Zhao", titleDetail: "App details | Qiyu Zhao",
    titleReleases: "App downloads | Qiyu Zhao", titleApp: "{name} | Apps by Qiyu Zhao",
    titleAppReleases: "{name} downloads | Qiyu Zhao", titleError: "Unavailable — {title}",
    descriptionCatalog: "Apps by Qiyu Zhao. Explore independent software, learn what it does, and download published release packages.",
    descriptionDetail: "Explore app features, platform support, and installation information.",
    descriptionReleases: "Download published app builds with platform details, signing information, and SHA-256 checksums.",
    descriptionAppReleases: "Download {name} builds, read release notes, and check platform requirements, signing information, and SHA-256 checksums.",
    loadingCatalog: "Loading the app collection…", loadingDetail: "Loading app details…",
    loadingReleases: "Loading release information…", loadingDocs: "Loading documentation…",
    titleDocs: "App documentation | Qiyu Zhao", titleAppDocs: "{name} documentation | Qiyu Zhao",
    descriptionDocs: "Read the user documentation published for each app.",
    descriptionAppDocs: "Read the {name} user documentation: setup, everyday use, and configuration.",
    docsChannel: "DOCUMENTATION",
    docsHeading: "{name} documentation",
    docsLead: "The user documentation kept with {name}, mirrored here so you can read it before you install anything.",
    docsNav: "Documents", docsOnThisPage: "On this page",
    docsSource: "Mirrored from {repository} at {commit}.",
    docsMissing: "That document is not part of the published documentation.",
    docsEmpty: "No documentation has been published for this app yet.",
    backToApp: "Back to {name}",
    collection: "THE APP COLLECTION", catalogHeading: "Small ideas. Real software.",
    catalogLead: "Tools made for the way we listen, create, and work. Get to know each app, then find its published builds.",
    collectionCount: "{count} {unit} / EXPLORE THE COLLECTION", appUnit: "APP", appsUnit: "APPS",
    explore: "Explore app ↗", releases: "Releases ↓", artwork: "PURPOSE-BUILT / INDEPENDENT SOFTWARE",
    aboutReleases: "About these releases",
    aboutReleasesText: "This collection shares app introductions and approved build packages. Platform support and installation requirements vary by release; read the package notes before downloading.",
    viewReleases: "View releases & downloads ↓", closerLook: "A closer look.", inside: "WHAT'S INSIDE",
    comparison: "HOW IT COMPARES", comparisonHeading: "See the difference.",
    comparisonNote: "See comparison note", comparisonNotes: "Notes",
    featuresHeading: "Thoughtful by design.", beforeStart: "BEFORE YOU START", context: "A little context.",
    responsible: "Use responsibly", inApp: "IN THE APP", galleryHeading: "A look inside.",
    galleryIntro: "Screenshots of the app in use.",
    platforms: "PLATFORMS", platformHeading: "Know your build.", platform: "PLATFORM",
    inMotion: "IN MOTION", videoHeading: "See it running.",
    videoIntro: "Recorded demos. Playback starts only when you press play, and nothing autoplays or loops.",
    videoFallback: "Your browser cannot play this video.", videoDownload: "Download the video file ↓",
    copy: "Copy", copied: "Copied", copyFailed: "Copy failed",
    installCommandsIntro: "Install with one command. Read the script before running it if you prefer.",
    documentation: "Documentation ↗", readDocumentation: "Read the {name} documentation ↗",
    signed: "Signed (publisher-reported)", selfSigned: "Self-signed development build",
    adHoc: "Ad-hoc signed development build", unsigned: "Unsigned development build",
    download: "Download package ↓", checksum: "SHA-256 checksum",
    checksumHelp: "Compare this value with a locally computed SHA-256 hash. A matching checksum detects file changes; it does not establish publisher identity or replace signature verification.",
    releaseChannel: "RELEASE CHANNEL", downloadsHeading: "{name} downloads",
    downloadsLead: "The latest published build, with the details you need before you install.",
    aboutApp: "About {name} ↗", awaiting: "AWAITING FIRST PUBLIC BUILD",
    emptyHeading: "Not released here. Yet.",
    emptyText: "No public release has been uploaded for this app. Download links will appear when a build is published. A development version is not a downloadable release.",
    preview: "PREVIEW", stable: "STABLE", version: "Version {version}", published: "PUBLISHED {date} UTC",
    beforeInstall: "Before installing",
    signingHelp: "Signing status is supplied by the publisher. Unsigned, ad-hoc, and self-signed packages are development builds, not publicly trusted software. Follow your device and organization policies; do not disable security protections to install an app.",
    choosePackage: "Choose your package.", allPlatforms: "All platforms",
    packageCount: "{count} {unit}", packageUnit: "PACKAGE", packagesUnit: "PACKAGES",
    translationNote: "Publisher-provided text uses English when a translation is not available.",
    errorHeading: "This page couldn't be loaded.", retry: "Try again", technicalDetails: "Technical details",
    invalidApp: "Choose an app from the collection. This address has a missing or invalid app id.",
    unknownApp: 'App "{id}" was not found in the collection.',
    httpError: "Could not load {path} (HTTP {status}).",
    networkError: "The app information could not be downloaded. Check your connection and try again.",
    metadataError: "The app or release metadata is invalid. Please try again later.",
  },
  "zh-CN": {
    skip: "跳转到正文", homeLabel: "Qiyu Zhao 主页", navigation: "主导航",
    aboutMe: "关于我", apps: "应用", contact: "联系", language: "语言",
    breadcrumb: "面包屑导航", home: "首页", app: "应用", appDetails: "应用详情", downloads: "下载",
    backAboutMe: "返回关于我", allApps: "所有应用", footer: "独立应用，专注实用。",
    releaseFooter: "了解版本，安心下载。",
    titleCatalog: "应用 | Qiyu Zhao", titleDetail: "应用详情 | Qiyu Zhao",
    titleReleases: "应用下载 | Qiyu Zhao", titleApp: "{name} | Qiyu Zhao 的应用",
    titleAppReleases: "{name} 下载 | Qiyu Zhao", titleError: "暂时无法访问 — {title}",
    descriptionCatalog: "探索 Qiyu Zhao 的应用，了解功能、平台支持，并下载已发布的安装包。",
    descriptionDetail: "了解应用功能、平台支持情况与安装说明。",
    descriptionReleases: "下载已发布的应用版本，查看平台要求、签名信息和 SHA-256 校验值。",
    descriptionAppReleases: "下载 {name}，查看更新日志、平台要求、签名信息和 SHA-256 校验值。",
    loadingCatalog: "正在加载应用列表…", loadingDetail: "正在加载应用详情…",
    loadingDocs: "正在加载文档…",
    titleDocs: "应用文档 | Qiyu Zhao", titleAppDocs: "{name} 文档 | Qiyu Zhao",
    descriptionDocs: "阅读每个应用发布的用户文档。",
    descriptionAppDocs: "阅读 {name} 的用户文档：安装、日常使用与配置。",
    docsChannel: "文档",
    docsHeading: "{name} 文档",
    docsLead: "{name} 随附的用户文档，镜像发布于此，便于你在安装前先行阅读。",
    docsNav: "文档目录", docsOnThisPage: "本页目录",
    docsSource: "镜像自 {repository}，提交 {commit}。",
    docsMissing: "该文档不在已发布的文档范围内。",
    docsEmpty: "该应用尚未发布文档。",
    backToApp: "返回 {name}",
    loadingReleases: "正在加载版本信息…",
    collection: "应用集合", catalogHeading: "小小灵感，实用软件。",
    catalogLead: "为聆听、创作与工作打造的小工具。先了解应用，再选择适合你的已发布版本。",
    collectionCount: "{count} 款应用 / 探索应用集合", appUnit: "款应用", appsUnit: "款应用",
    explore: "了解应用 ↗", releases: "版本与下载 ↓", artwork: "独立开发 / 专注实用",
    aboutReleases: "关于这些版本",
    aboutReleasesText: "这里提供应用介绍和获准公开的安装包。不同版本的平台支持和安装要求可能不同，请先阅读对应说明。",
    viewReleases: "查看版本与下载 ↓", closerLook: "进一步了解。", inside: "主要功能",
    comparison: "横向对比", comparisonHeading: "看看差异。",
    comparisonNote: "查看对比注释", comparisonNotes: "注释",
    featuresHeading: "每个细节，都为体验。", beforeStart: "开始之前", context: "你需要了解的事。",
    responsible: "合理使用", inApp: "应用实景", galleryHeading: "一览应用界面。",
    galleryIntro: "应用运行界面的截图。",
    platforms: "支持平台", platformHeading: "了解你的版本。", platform: "平台",
    inMotion: "动态演示", videoHeading: "看它如何运行。",
    videoIntro: "录制的演示视频。仅在你点击播放后开始，不会自动播放，也不会循环。",
    videoFallback: "你的浏览器无法播放此视频。", videoDownload: "下载视频文件 ↓",
    copy: "复制", copied: "已复制", copyFailed: "复制失败",
    installCommandsIntro: "一条命令即可安装。如果你更放心，也可以先阅读脚本内容。",
    documentation: "使用文档 ↗", readDocumentation: "阅读 {name} 使用文档 ↗",
    signed: "已签名（发布者声明）", selfSigned: "自签名开发版本",
    adHoc: "临时签名开发版本", unsigned: "未签名开发版本",
    download: "下载安装包 ↓", checksum: "SHA-256 校验值",
    checksumHelp: "请与本地计算的 SHA-256 值比较。校验值一致可以确认文件内容未发生变化，但不能证明发布者身份，也不能代替签名验证。",
    releaseChannel: "发布渠道", downloadsHeading: "{name} 下载",
    downloadsLead: "获取最新发布版本，并在安装前了解相关信息。",
    aboutApp: "了解 {name} ↗", awaiting: "等待首次公开发布",
    emptyHeading: "即将与你见面。",
    emptyText: "此应用尚未上传公开版本。安装包发布后，这里会显示下载链接。开发中的版本不代表已有可下载的安装包。",
    preview: "预览版", stable: "稳定版", version: "版本 {version}", published: "发布时间：{date} UTC",
    beforeInstall: "安装前请注意",
    signingHelp: "签名状态由发布者提供。未签名、临时签名和自签名安装包属于开发版本，并非获得公开信任的软件。请遵守设备和组织的安全策略，不要为了安装应用而关闭安全防护。",
    choosePackage: "选择适合你的安装包。", allPlatforms: "所有平台",
    packageCount: "{count} 个安装包", packageUnit: "个安装包", packagesUnit: "个安装包",
    translationNote: "发布者尚未提供翻译的内容将以英文显示。",
    errorHeading: "暂时无法加载此页面。", retry: "重试", technicalDetails: "技术详情",
    invalidApp: "请从应用列表选择应用。当前地址缺少应用标识，或标识格式无效。",
    unknownApp: "应用列表中没有找到“{id}”。",
    httpError: "无法加载 {path}（HTTP {status}）。",
    networkError: "无法下载应用信息，请检查网络连接后重试。",
    metadataError: "应用或版本信息的格式无效，请稍后重试。",
  },
};

export function translate(locale, key, values = {}) {
  const message = messages[locale]?.[key];
  if (typeof message !== "string") throw new Error(`Missing UI translation: ${locale}.${key}`);
  return message.replace(/\{(\w+)\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Missing translation parameter: ${key}.${name}`);
    return String(values[name]);
  });
}

export function chooseLocale({ search = "", saved, languages = [] }) {
  const explicit = new URLSearchParams(search).get("lang");
  if (SUPPORTED_LOCALES.includes(explicit)) return explicit;
  if (SUPPORTED_LOCALES.includes(saved)) return saved;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return "zh-CN";
    if (/^en(?:-|$)/i.test(language)) return "en";
  }
  return "en";
}

export function localizeData(value, locale) {
  if (Array.isArray(value)) return value.map((item) => localizeData(item, locale));
  if (value !== null && typeof value === "object") {
    if (typeof value.en === "string") return value[locale] ?? value.en;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeData(item, locale)]));
  }
  return value;
}
