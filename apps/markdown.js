// Renders mirrored Markdown into a sanitized DOM fragment.
//
// Two independent defences keep the docs viewer safe with untrusted-looking
// input: the Markdown parser is configured to escape raw HTML instead of
// passing it through, and every node the parser produces is then rebuilt
// against an element and attribute allowlist. Nothing is ever assigned through
// innerHTML on the live document, and no attribute that can execute script
// (event handlers, javascript: URLs, srcdoc, style) survives.
import { Marked } from "/apps/vendor/marked/marked.esm.js";

const ALLOWED_ELEMENTS = new Map([
  ["p", []],
  ["br", []],
  ["hr", []],
  ["h1", ["id"]],
  ["h2", ["id"]],
  ["h3", ["id"]],
  ["h4", ["id"]],
  ["h5", ["id"]],
  ["h6", ["id"]],
  ["ul", []],
  ["ol", ["start"]],
  ["li", []],
  ["dl", []],
  ["dt", []],
  ["dd", []],
  ["strong", []],
  ["em", []],
  ["del", []],
  ["sup", []],
  ["sub", []],
  ["code", ["class"]],
  ["pre", []],
  ["blockquote", []],
  ["a", ["href", "title"]],
  ["img", ["src", "alt", "title"]],
  ["table", []],
  ["thead", []],
  ["tbody", []],
  ["tr", []],
  ["th", ["align"]],
  ["td", ["align"]],
]);

// Elements whose contents are dropped along with the element itself. Anything
// else that is not allowed keeps its text but loses the tag.
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "template", "noscript",
  "form", "input", "button", "select", "textarea", "svg", "math", "link", "meta",
]);

const SAFE_ALIGN = new Set(["left", "center", "right"]);
const LANGUAGE_CLASS = /^language-[\w.+#-]{1,32}$/;

function safeUrl(value, { allowRelative = true } = {}) {
  const candidate = String(value ?? "").trim();
  if (!candidate) return null;
  // Strip control characters that can hide a scheme, e.g. "java\nscript:".
  const flattened = candidate.replace(/[\u0000-\u0020]/g, "");
  if (flattened.startsWith("#") || flattened.startsWith("?")) return candidate;
  const scheme = flattened.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) {
    return ["http", "https", "mailto"].includes(scheme[1].toLowerCase()) ? candidate : null;
  }
  if (flattened.startsWith("//")) return null;
  return allowRelative ? candidate : null;
}

function slugify(text, used) {
  const base = text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80) || "section";
  let slug = base;
  let counter = 1;
  while (used.has(slug)) {
    counter += 1;
    slug = `${base}-${counter}`;
  }
  used.add(slug);
  return slug;
}

function sanitizeAttributes(source, target, context) {
  const allowed = ALLOWED_ELEMENTS.get(target.localName) ?? [];
  for (const name of allowed) {
    if (!source.hasAttribute(name)) continue;
    const value = source.getAttribute(name);
    if (name === "href") {
      const url = safeUrl(value);
      if (url) target.setAttribute("href", context.resolve(url, "link"));
      if (url && /^[a-z][a-z0-9+.-]*:/i.test(url.trim())) {
        target.setAttribute("rel", "noopener noreferrer");
      }
    } else if (name === "src") {
      const url = safeUrl(value);
      if (url) {
        target.setAttribute("src", context.resolve(url, "image"));
        target.setAttribute("loading", "lazy");
        target.setAttribute("decoding", "async");
      }
    } else if (name === "class") {
      if (LANGUAGE_CLASS.test(value)) target.setAttribute("class", value);
    } else if (name === "align") {
      if (SAFE_ALIGN.has(value)) target.setAttribute("align", value);
    } else if (name === "start") {
      if (/^-?\d{1,6}$/.test(value)) target.setAttribute("start", value);
    } else if (name === "id") {
      // Heading ids are generated below, never copied from the source.
      continue;
    } else {
      target.setAttribute(name, value);
    }
  }
  if (/^h[1-6]$/.test(target.localName)) {
    target.id = slugify(source.textContent ?? "", context.slugs);
  }
}

function sanitizeInto(sourceParent, targetParent, doc, context) {
  for (const node of sourceParent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      targetParent.append(doc.createTextNode(node.nodeValue));
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const name = node.localName;
    if (DROP_WITH_CONTENT.has(name)) continue;
    if (!ALLOWED_ELEMENTS.has(name)) {
      sanitizeInto(node, targetParent, doc, context);
      continue;
    }
    const clean = doc.createElement(name);
    sanitizeAttributes(node, clean, context);
    // A link whose target was rejected keeps its words but stops being a link,
    // and an image with a rejected source disappears rather than showing a
    // broken placeholder.
    if (name === "a" && !clean.hasAttribute("href")) {
      sanitizeInto(node, targetParent, doc, context);
      continue;
    }
    if (name === "img" && !clean.hasAttribute("src")) continue;
    sanitizeInto(node, clean, doc, context);
    targetParent.append(clean);
  }
}

function createParser() {
  const marked = new Marked({ gfm: true, breaks: false, async: false });
  // Raw HTML in a mirrored document is shown as text rather than executed.
  marked.use({
    renderer: {
      html({ text }) {
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      },
    },
  });
  return marked;
}

let parser;

// `resolve(url, kind)` maps an already-validated URL onto its final form, which
// the viewer uses to point relative image paths at the mirrored copies and to
// carry the active language across viewer links.
// Returns { fragment, headings } where headings describes the h2/h3 outline of
// the document so the viewer can build an on-page table of contents.
export function renderMarkdown(markdown, { resolve = (url) => url } = {}) {
  parser ??= createParser();
  const html = parser.parse(String(markdown ?? ""));
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const context = { slugs: new Set(), resolve };
  const fragment = document.createDocumentFragment();
  sanitizeInto(parsed.body, fragment, document, context);
  const headings = [];
  for (const heading of fragment.querySelectorAll("h2, h3")) {
    headings.push({ id: heading.id, level: Number(heading.localName.slice(1)), text: heading.textContent });
  }
  return { fragment, headings };
}

export const testing = { safeUrl, slugify };
