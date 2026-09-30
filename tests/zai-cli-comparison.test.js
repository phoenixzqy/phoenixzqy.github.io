import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog } from "./apps-fixtures.js";

const comparison = catalog.apps.find(({ id }) => id === "zai-cli").comparison;
const [capabilities, agents, footprint] = comparison.groups;
const products = ["zai-cli (+ agent) [13]", "VS Code", "GitHub Copilot app", "Orca (+ agent) [13]", "herdr (+ agent) [13]"];
const cells = (group, label) => group.rows.find((row) => row.label === label).values;

test("Copilot is a peer column, not a standalone comparison", () => {
  assert.equal(comparison.groups.length, 3);
  assert.deepEqual(capabilities.columns, products);
  assert.deepEqual(footprint.columns, products);
  assert.deepEqual(agents.rows.map(({ label }) => label),
    ["GitHub Copilot CLI", "Codex", "Pi", "Claude Code", "OpenCode"]);
  for (const group of comparison.groups) {
    assert.doesNotMatch(group.title.en, /^GitHub Copilot/);
    assert.doesNotMatch(group.title["zh-CN"], /^GitHub Copilot/);
  }
});

test("workspace headers distinguish separately installed agents from measured baselines", () => {
  const scope = footprint.notes[6];
  assert.equal(comparison.groups.flatMap(({ notes }) => notes).indexOf(scope), 12);
  for (const phrase of [
    "your choice of separately installed coding-agent CLI",
    "none includes a built-in coding agent",
    "workspace baselines exclude the chosen agent CLI/runtime",
    "VS Code's fresh-profile baseline has no agent extension",
    "GitHub Copilot app's first-run tree already includes SDK CLI helpers",
    "matched complete-setup measurements are not available",
  ]) {
    assert.ok(scope.includes(phrase), `scope note: ${phrase}`);
  }
  assert.match(comparison.intro.en, /not built-in coding agents/);
  assert.match(comparison.intro["zh-CN"], /并不内置编码代理/);
});

test("Copilot capability answers distinguish verified documentation from uncertainty", () => {
  assert.equal(cells(capabilities, "Built-in code editor")[2], "✓ [5]");
  assert.match(cells(capabilities, "Runtime")[2], /stack unverified/);
  assert.match(cells(capabilities, "Language servers in the editor")[2], /Not documented in editor/);
  assert.match(cells(capabilities, "Reusable claimed/released worktree pool with stale-session recovery")[2], /Not documented/);
  assert.match(cells(capabilities, "Services that take GitHub and Azure DevOps work items to merged pull requests")[2],
    /GitHub agent merge; Azure DevOps lifecycle unverified/);
  assert.match(capabilities.notes[4], /2026-09-30/);
  assert.match(capabilities.notes[4], /https:\/\/github.com\/github\/app\/blob\/main\/changelog.md/);
  assert.match(capabilities.notes[4], /unknown does not mean absent/);
  assert.doesNotMatch(JSON.stringify(capabilities), /Not evaluated/);
});

test("integrated footprint retains every Linux observation in product order", () => {
  const expected = {
    "Download": ["30.0 MB", "341.8 MB", "264.6 MB", "216.7 MB", "26.2 MB"],
    "On disk": ["72.7 MB", "1,007.7 MB", "640.2 MB", "610.3 MB", "26.2 MB"],
    "Linux idle memory (PSS)": ["≈ 40 MiB", "745.9 MiB", "Not measured on Linux", "≈ 543 MiB", "≈ 23 MiB"],
    "Linux idle CPU (one core)": ["0.07–0.15%", "≥ 7.1%", "Not measured on Linux", "0.3%", "0.5–0.6%"],
    "Observed processes (Linux idle / Windows first-run)": ["1 (Linux idle)", "13 (Linux idle)", "11–13 (Windows first-run)", "8 (Linux idle)", "3 (Linux idle)"],
  };
  for (const [label, values] of Object.entries(expected)) {
    cells(footprint, label).forEach((value, index) => {
      assert.ok(value.startsWith(values[index]), `${label}, ${products[index]}: ${value}`);
    });
  }
});

test("Windows observations do not masquerade as matched Linux memory or CPU", () => {
  const expected = {
    "Windows first-run private memory (USS, tree endpoints)": "687.6–959.5 MiB",
    "Windows first-run working set (summed RSS, tree endpoints)": "2,073.0–2,615.3 MiB",
    "Windows first-run app root CPU (one core)": "0.34–0.39%",
    "Windows first-run descendant CPU (one core, lower bound)": "0.03–0.60%",
  };
  for (const [label, value] of Object.entries(expected)) {
    cells(footprint, label).forEach((cell, index) => {
      if (index === 2) assert.ok(cell.startsWith(value), label);
      else assert.equal(cell, "Not measured on Windows", `${label}, ${products[index]}`);
    });
  }
  const notes = footprint.notes.join(" ");
  for (const scope of [
    "0.1.127", "1.1.24", "Windows 11 Enterprise x64", "three consecutive 60-second",
    "No sign-in", "1.0.90-0", "488.3 MB", "151.9 MB", "shared WebView2/runtime",
    "surviving observed descendants", "double-count shared pages", "not Linux PSS",
    "not a like-for-like ranking", "Two descendant processes exited", "lower bound",
  ]) {
    assert.ok(notes.includes(scope), `preserved scope: ${scope}`);
  }
});
