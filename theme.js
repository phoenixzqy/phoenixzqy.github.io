// Run before styles to restore the site palette without a flash of another theme.
(() => {
  const root = document.documentElement;
  const options = {
    design: ["constellation", "editorial", "blueprint", "studio"],
    theme: ["moss", "paper", "linen", "slate"],
  };
  const defaults = { design: "blueprint", theme: "linen" };
  const keys = { design: "qiyu-resume-design", theme: "qiyu-site-theme" };
  const normalize = (kind, value) => value === "original"
    ? (kind === "design" ? "constellation" : "moss") : value;
  const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  let panel, trigger;

  function restore() {
    const query = new URLSearchParams(location.search);
    for (const kind of Object.keys(options)) {
      const requested = normalize(kind, query.get(kind));
      const saved = normalize(kind, read(keys[kind]) ?? (kind === "theme" ? read("qiyu-resume-theme") : null));
      root.dataset[kind] = options[kind].includes(requested) ? requested
        : options[kind].includes(saved) ? saved : defaults[kind];
    }
    sync();
  }

  function sync() {
    panel?.querySelectorAll("input").forEach((input) => {
      input.checked = root.dataset[input.name] === input.value;
      input.autofocus = input.name === "design" && input.checked;
    });
    const background = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", background);
    window.dispatchEvent(new Event("site-theme-change"));
  }

  const copy = {
    en: { theme: "Theme", title: "Choose your theme", close: "Close theme settings", design: "Design", color: "Color", designs: "Visual design", colors: "Color theme", help: "Color applies across the site. Design applies to About me.", constellation: "Constellation", editorial: "Editorial", blueprint: "Blueprint", studio: "Studio", moss: "Moss", paper: "Paper", linen: "Linen", slate: "Slate" },
    "zh-CN": { theme: "主题", title: "选择主题", close: "关闭主题设置", design: "设计", color: "配色", designs: "页面设计", colors: "颜色主题", help: "配色适用于整个网站，设计适用于“关于我”页面。", constellation: "星群", editorial: "杂志", blueprint: "蓝图", studio: "工作室", moss: "苔绿", paper: "纸白", linen: "亚麻", slate: "岩蓝" },
  };
  function localize() {
    const labels = copy[root.lang] ?? copy.en;
    document.querySelectorAll("[data-theme-text]").forEach((el) => { el.textContent = labels[el.dataset.themeText]; });
    panel.querySelector(".theme-close").setAttribute("aria-label", labels.close);
  }

  function mount() {
    trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "theme-trigger";
    trigger.setAttribute("popovertarget", "theme-panel");
    trigger.setAttribute("aria-controls", "theme-panel");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="theme-trigger-dot" aria-hidden="true"></span><span data-theme-text="theme">Theme</span>';
    panel = document.createElement("section");
    panel.id = "theme-panel";
    panel.className = "theme-panel";
    panel.setAttribute("popover", "auto");
    panel.setAttribute("aria-labelledby", "theme-title");
    panel.setAttribute("aria-describedby", "theme-help");
    panel.innerHTML = '<div class="theme-panel-heading"><h2 id="theme-title" data-theme-text="title">Choose your theme</h2><button class="theme-close" type="button" popovertarget="theme-panel" popovertargetaction="hide" aria-label="Close theme settings">×</button></div>';
    for (const [kind, values] of Object.entries(options)) {
      const row = document.createElement("div");
      row.className = "theme-row";
      const label = kind === "design" ? "design" : "color";
      const legend = kind === "design" ? "designs" : "colors";
      row.innerHTML = `<span class="theme-row-label" aria-hidden="true" data-theme-text="${label}"></span><fieldset><legend class="sr-only" data-theme-text="${legend}"></legend>${values.map((value) => `<label><input type="radio" name="${kind}" value="${value}"><span>${kind === "theme" ? `<i class="theme-swatch swatch-${value}" aria-hidden="true"></i>` : ""}<span data-theme-text="${value}"></span></span></label>`).join("")}</fieldset>`;
      panel.append(row);
    }
    const help = document.createElement("p");
    help.id = "theme-help";
    help.dataset.themeText = "help";
    panel.append(help);
    document.body.append(trigger, panel);
    panel.addEventListener("toggle", () => {
      const open = panel.matches(":popover-open");
      trigger.setAttribute("aria-expanded", String(open));
    });
    panel.addEventListener("change", (event) => {
      const input = event.target;
      if (!input.matches('input[type="radio"]') || !input.checked) return;
      root.dataset[input.name] = input.value;
      try { localStorage.setItem(keys[input.name], input.value); } catch {}
      const url = new URL(location.href);
      url.searchParams.set(input.name, input.value);
      history.replaceState(null, "", url);
      sync();
    });
    localize();
    new MutationObserver(localize).observe(root, { attributes: true, attributeFilter: ["lang"] });
    sync();
  }

  restore();
  document.addEventListener("DOMContentLoaded", mount, { once: true });
  window.addEventListener("load", sync, { once: true });
  window.addEventListener("pageshow", restore);
  window.addEventListener("storage", (event) => {
    if (event.key === null || Object.values(keys).includes(event.key) || event.key === "qiyu-resume-theme") restore();
  });
})();
