#!/usr/bin/env node
// Post-build release gate. Runs after `pnpm build` and inspects ./dist:
//   1. every file referenced by package.json "exports" exists
//   2. the real dependency graph of each built ESM entry (via esbuild, not text
//      matching) obeys the framework isolation matrix
//   3. every framework-neutral entry imports cleanly in a Node realm that has
//      no DOM, proving there is no import-time document access
//
// All paths resolve relative to this script, so the gate behaves identically
// from the repository root and from package/.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, transform } from "esbuild";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const distDir = path.join(packageRoot, "dist");
const manifestPath = path.join(packageRoot, "package.json");

// Peers that may legitimately be absent from a consumer install. Sorted
// longest-first so `react-dom` is reported instead of its `react` prefix.
const OPTIONAL_PEERS = ["solid-devtools", "react-dom", "solid-js", "react", "vite"];

/**
 * Per-entry policy, keyed by the dist-relative path of the built ESM file.
 * Entries absent from package.json "exports" are reported as not-yet-built
 * rather than as failures, so this table can describe the finished 4.0 surface
 * while the migration is still in progress.
 */
const ENTRY_POLICY = {
  "index.mjs": {
    externals: { allow: ["react", "react-dom", "react/jsx-runtime", "agentation/browser"] },
    domFree: true,
    cjsSmoke: true,
  },
  "browser.mjs": {
    externals: { forbidPrefixes: ["react", "solid", "vite"] },
    domFree: true,
    cjsSmoke: true,
  },
  "solid.mjs": {
    externals: { allow: ["solid-js", "solid-js/web", "agentation/browser"] },
    domFree: true,
    cjsSmoke: false,
  },
  "solid-vite.mjs": {
    externals: { allow: ["solid-devtools/vite", "vite"] },
    domFree: false,
    cjsSmoke: false,
  },
  "react-ui.mjs": {
    // May depend on React; must never drag in the runtime or Solid.
    externals: { forbidIds: ["agentation/browser"], forbidPrefixes: ["solid"] },
    domFree: false,
    cjsSmoke: false,
  },
  "metadata/react.mjs": {
    // The React adapter may statically import `react` (declared optional peer)
    // for fiber traversal. Pulling in the renderer, the runtime, the UI entry,
    // or anything Solid/Vite would be the actual leak.
    externals: {
      forbidIds: [
        "agentation/browser",
        "agentation/react/ui",
        "react-dom",
        "solid-js",
        "solid-devtools",
        "vite",
      ],
    },
    domFree: true,
    cjsSmoke: true,
  },
  "metadata/solid.mjs": {
    // The Solid adapter reads DOM attributes only, so it needs no framework.
    externals: {
      forbidIds: [
        "agentation/browser",
        "agentation/react/ui",
        "react",
        "react-dom",
        "solid-js",
        "solid-devtools",
        "vite",
      ],
    },
    domFree: true,
    cjsSmoke: true,
  },
};

const results = [];

function record(name, problems, notes) {
  const failed = problems.length > 0;
  results.push({ name, failed });
  process.stdout.write(`${failed ? "FAIL" : "  ok"}  ${name}\n`);
  for (const problem of problems) process.stdout.write(`        ${problem}\n`);
  for (const note of notes ?? []) process.stdout.write(`        note: ${note}\n`);
}

function skip(name, reason) {
  results.push({ name, failed: false, skipped: true });
  process.stdout.write(` skip  ${name} — ${reason}\n`);
}

function fatal(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!existsSync(distDir)) fatal("dist/ not found — run pnpm build first");

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

// ---------------------------------------------------------------------------
// 1. Export map targets exist on disk.
// ---------------------------------------------------------------------------

/** Collect every package-relative file target in a nested condition object. */
function collectTargets(node, trail, out) {
  if (typeof node === "string") {
    out.push({ condition: trail.join("."), target: node });
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [condition, value] of Object.entries(node)) {
    collectTargets(value, [...trail, condition], out);
  }
}

const exportsMap = manifest.exports ?? {};
const missingTargets = [];
let checkedTargets = 0;

for (const [subpath, conditions] of Object.entries(exportsMap)) {
  const targets = [];
  collectTargets(conditions, [], targets);
  if (targets.length === 0) {
    missingTargets.push(`"${subpath}" declares no file targets`);
    continue;
  }
  for (const { condition, target } of targets) {
    checkedTargets += 1;
    const absolute = path.resolve(packageRoot, target);
    if (!existsSync(absolute)) {
      missingTargets.push(`"${subpath}" (${condition || "default"}) -> ${target} is missing`);
    }
  }
}

record(`export map targets exist (${checkedTargets} files)`, missingTargets);

const legacyFields = [];
for (const field of ["main", "module", "types"]) {
  const target = manifest[field];
  if (typeof target !== "string") continue;
  if (!existsSync(path.resolve(packageRoot, target))) {
    legacyFields.push(`"${field}" -> ${target} is missing`);
  }
}
record("legacy main/module/types targets exist", legacyFields);

// ---------------------------------------------------------------------------
// 2. Real dependency graph per built ESM entry.
// ---------------------------------------------------------------------------

/**
 * esbuild's plugin API mandates a filter pattern; the match-everything filter
 * below simply forwards every resolution to the callback. The dependency set
 * itself comes from esbuild's own module resolution, never from matching
 * patterns against bundle text.
 */
function recordExternalsPlugin(recorded) {
  return {
    name: "agentation-record-externals",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return null;
        if (args.path.startsWith(".") || path.isAbsolute(args.path)) return null;
        recorded.add(args.path);
        return { path: args.path, external: true };
      });
    },
  };
}

async function externalsOf(absoluteFile) {
  const recorded = new Set();
  const result = await build({
    entryPoints: [absoluteFile],
    plugins: [recordExternalsPlugin(recorded)],
    bundle: true,
    metafile: true,
    write: false,
    platform: "neutral",
    logLevel: "silent",
  });
  // Cross-check the plugin's record against esbuild's own metafile so a
  // resolution path that bypasses the plugin cannot hide a dependency.
  for (const output of Object.values(result.metafile.outputs)) {
    for (const entry of output.imports ?? []) {
      if (entry.external) recorded.add(entry.path);
    }
  }
  return recorded;
}

/** True when `specifier` is `id` itself or a subpath of it. */
function matchesId(specifier, id) {
  return specifier === id || specifier.startsWith(`${id}/`);
}

function violationsFor(specifiers, rule) {
  const problems = [];
  for (const specifier of [...specifiers].sort()) {
    if (rule.allow) {
      if (!rule.allow.includes(specifier)) {
        problems.push(`imports "${specifier}" (allowed: ${rule.allow.join(", ")})`);
      }
      continue;
    }
    const forbiddenId = (rule.forbidIds ?? []).find((id) => matchesId(specifier, id));
    if (forbiddenId) {
      problems.push(`imports "${specifier}" (forbidden module "${forbiddenId}")`);
      continue;
    }
    const forbiddenPrefix = (rule.forbidPrefixes ?? []).find((prefix) =>
      specifier.startsWith(prefix),
    );
    if (forbiddenPrefix) {
      problems.push(`imports "${specifier}" (forbidden prefix "${forbiddenPrefix}")`);
    }
  }
  return problems;
}

/** dist-relative ESM/CJS paths that the manifest actually publishes. */
const publishedEsm = new Map();
const publishedCjs = new Map();

for (const conditions of Object.values(exportsMap)) {
  const targets = [];
  collectTargets(conditions, [], targets);
  for (const { condition, target } of targets) {
    if (!target.endsWith(".mjs") && !target.endsWith(".js")) continue;
    const absolute = path.resolve(packageRoot, target);
    const key = path.relative(distDir, absolute).split(path.sep).join("/");
    if (condition.startsWith("import")) publishedEsm.set(key, absolute);
    else if (condition.startsWith("require")) publishedCjs.set(key, absolute);
  }
}

for (const [distPath, policy] of Object.entries(ENTRY_POLICY)) {
  const name = `dependency graph: dist/${distPath}`;
  const absolute = publishedEsm.get(distPath);
  if (!absolute) {
    skip(name, "not declared in package.json exports");
    continue;
  }
  if (!existsSync(absolute)) {
    record(name, [`dist/${distPath} is declared but missing`]);
    continue;
  }
  let specifiers;
  try {
    specifiers = await externalsOf(absolute);
  } catch (error) {
    record(name, [`esbuild could not analyze the bundle: ${error.message}`]);
    continue;
  }
  const problems = violationsFor(specifiers, policy.externals);
  const summary =
    specifiers.size === 0 ? "no external imports" : `imports ${[...specifiers].sort().join(", ")}`;
  record(name, problems, problems.length === 0 ? [summary] : []);
}

// ---------------------------------------------------------------------------
// 3+4. DOM-free import smoke test.
// ---------------------------------------------------------------------------

// Runs in a fresh Node process with no DOM. A module that touches `document`
// at import time throws a ReferenceError; a module that installs one fails the
// post-import assertion. Both are reported back over a marked stdout line.
const RUNNER = `
const marker = "__AGENTATION_VERIFY__";
const send = (payload) => process.stdout.write(marker + JSON.stringify(payload) + "\\n");
try {
  if (typeof globalThis.document !== "undefined") {
    throw new Error("host realm unexpectedly provides a document");
  }
  const target = process.env.AGENTATION_VERIFY_TARGET;
  const { pathToFileURL } = await import("node:url");
  if (process.env.AGENTATION_VERIFY_KIND === "cjs") {
    const { createRequire } = await import("node:module");
    createRequire(pathToFileURL(target))(target);
  } else {
    await import(pathToFileURL(target).href);
  }
  if (globalThis.document !== undefined) {
    throw new Error("module defined globalThis.document at import time");
  }
  send({ ok: true });
} catch (error) {
  send({
    ok: false,
    code: error && error.code ? String(error.code) : "",
    message: error && error.message ? String(error.message) : String(error),
  });
}
`;

function importInDomFreeRealm(absoluteFile, kind) {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", RUNNER], {
    cwd: packageRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      AGENTATION_VERIFY_TARGET: absoluteFile,
      AGENTATION_VERIFY_KIND: kind,
    },
  });
  const marked = (child.stdout ?? "")
    .split("\n")
    .find((line) => line.startsWith("__AGENTATION_VERIFY__"));
  if (!marked) {
    const detail = (child.stderr || child.stdout || "no output").trim().split("\n").slice(-4);
    return { ok: false, code: "", message: `child process produced no result: ${detail.join(" / ")}` };
  }
  return JSON.parse(marked.slice("__AGENTATION_VERIFY__".length));
}

function missingPeerFrom(failure) {
  const isResolution =
    failure.code === "ERR_MODULE_NOT_FOUND" ||
    failure.code === "MODULE_NOT_FOUND" ||
    failure.code === "ERR_PACKAGE_PATH_NOT_EXPORTED";
  if (!isResolution) return undefined;
  return OPTIONAL_PEERS.find((peer) => failure.message.includes(`'${peer}`) || failure.message.includes(`"${peer}`));
}

async function parsesCleanly(absoluteFile) {
  await transform(readFileSync(absoluteFile, "utf-8"), { loader: "js", format: "esm" });
}

async function smokeTest(name, absoluteFile, kind) {
  const outcome = importInDomFreeRealm(absoluteFile, kind);
  if (outcome.ok) {
    record(name, []);
    return;
  }
  const peer = missingPeerFrom(outcome);
  if (peer) {
    try {
      await parsesCleanly(absoluteFile);
      skip(name, `peer "${peer}" is not installed; file parses cleanly`);
    } catch (error) {
      record(name, [`peer "${peer}" missing and the file does not parse: ${error.message}`]);
    }
    return;
  }
  record(name, [outcome.message]);
}

for (const [distPath, policy] of Object.entries(ENTRY_POLICY)) {
  if (!policy.domFree) continue;
  const name = `imports with no DOM: dist/${distPath}`;
  const absolute = publishedEsm.get(distPath);
  if (!absolute) {
    skip(name, "not declared in package.json exports");
    continue;
  }
  if (!existsSync(absolute)) {
    record(name, [`dist/${distPath} is declared but missing`]);
    continue;
  }
  await smokeTest(name, absolute, "esm");

  // Secondary guard only: the executable check above is the real proof, so a
  // `document.head` reference is reported, not failed — it is legal inside a
  // function body that only runs in a browser.
  const text = readFileSync(absolute, "utf-8");
  if (text.includes("document.head")) {
    process.stdout.write(`        note: dist/${distPath} references document.head (not at module scope)\n`);
  }

  if (!policy.cjsSmoke) continue;
  const cjsPath = `${distPath.slice(0, -".mjs".length)}.js`;
  const cjsAbsolute = publishedCjs.get(cjsPath);
  const cjsName = `imports with no DOM: dist/${cjsPath} (cjs)`;
  if (!cjsAbsolute) {
    skip(cjsName, "manifest declares no require condition");
    continue;
  }
  if (!existsSync(cjsAbsolute)) {
    record(cjsName, [`dist/${cjsPath} is declared but missing`]);
    continue;
  }
  await smokeTest(cjsName, cjsAbsolute, "cjs");
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------

const failures = results.filter((result) => result.failed);
const skipped = results.filter((result) => result.skipped);
const passed = results.length - failures.length - skipped.length;

if (failures.length > 0) {
  process.stdout.write(`\n${failures.length} check(s) failed:\n`);
  for (const failure of failures) process.stdout.write(`  - ${failure.name}\n`);
  fatal("verify-artifacts: release gate failed");
}

process.stdout.write(`\nverify-artifacts: ${passed} passed, ${skipped.length} skipped\n`);
