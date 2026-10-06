import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";

/**
 * The share page ships to GitHub Pages and runs in a stranger's browser, where
 * no Tauri runtime exists. That constraint is currently only documented, and
 * nothing enforces it: adding `import { api } from "@/lib/tauri"` to
 * SharePage.tsx leaves `vite build` green, `pnpm test` green (lib/tauri.ts swaps
 * in stubApi when MODE === "test"), and `pnpm e2e` green (the share specs never
 * trigger an invoke). It would break only in a recipient's browser, in
 * production, with a blank page.
 *
 * So this walks the real import graph from src/share/main.tsx and fails on any
 * @tauri-apps specifier. Reading files is enough — no build required.
 */
const SRC = resolve(__dirname, "..");
const ENTRY = resolve(__dirname, "main.tsx");
const CODE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

/** Comments are stripped so prose mentioning @tauri-apps cannot trip the scan. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function importsIn(src: string): string[] {
  const code = stripComments(src);
  const specs: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g, // import x from "y" / export { x } from "y"
    /\bimport\s*["']([^"']+)["']/g, // side-effect import
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // dynamic import
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of code.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

/** Mirrors the `@/*` -> `src/*` alias from vite.config.ts and tsconfig.json. */
function toPath(spec: string, fromFile: string): string | null {
  if (spec.startsWith("@/")) return resolve(SRC, spec.slice(2));
  if (spec.startsWith("./") || spec.startsWith("../")) return resolve(dirname(fromFile), spec);
  return null; // bare specifier: a package, not a file to follow
}

function resolveFile(base: string): string | null {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of CODE_EXT) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of CODE_EXT) {
    const idx = resolve(base, `index${ext}`);
    if (existsSync(idx)) return idx;
  }
  return null;
}

interface Violation {
  file: string;
  spec: string;
  chain: string[];
}

function scan(): { visited: string[]; violations: Violation[] } {
  const violations: Violation[] = [];
  const visited = new Set<string>();
  // Each queue entry carries how it was reached, so a failure can print the
  // chain rather than just the leaf.
  const queue: { file: string; chain: string[] }[] = [
    { file: ENTRY, chain: [relative(SRC, ENTRY)] },
  ];

  while (queue.length > 0) {
    const { file, chain } = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);

    for (const spec of importsIn(readFileSync(file, "utf8"))) {
      if (spec === "@tauri-apps" || spec.startsWith("@tauri-apps/")) {
        violations.push({ file: relative(SRC, file), spec, chain });
        continue;
      }
      const target = toPath(spec, file);
      if (target === null) continue;
      // Non-code assets (globals.css) have nothing to follow.
      if (/\.(css|svg|png|jpe?g|json)$/.test(target)) continue;
      const resolved = resolveFile(target);
      if (resolved === null) {
        throw new Error(
          `Could not resolve "${spec}" from ${relative(SRC, file)}. ` +
            `This guard walks imports by hand, so a new path convention needs ` +
            `teaching to toPath()/resolveFile() in this file.`
        );
      }
      queue.push({ file: resolved, chain: [...chain, relative(SRC, resolved)] });
    }
  }

  return { visited: [...visited].map((f) => relative(SRC, f)), violations };
}

describe("the share bundle stays free of Tauri", () => {
  it("reaches SharePage and its real dependencies", () => {
    // Without this, a broken walker that resolved nothing would make the guard
    // below pass vacuously.
    const { visited } = scan();
    expect(visited).toContain("share/main.tsx");
    expect(visited).toContain("share/SharePage.tsx");
    expect(visited).toContain("lib/sharePayload.ts");
    expect(visited).toContain("lib/splitMath.ts");
    expect(visited).toContain("components/SplitTotalsTable.tsx");
    expect(visited.length).toBeGreaterThan(6);
  });

  it("imports no @tauri-apps module anywhere in main.tsx's import graph", () => {
    const { violations } = scan();
    const detail = violations
      .map((v) => `  ${v.file} imports "${v.spec}"\n    reached via: ${v.chain.join(" -> ")}`)
      .join("\n");
    expect(
      violations,
      violations.length === 0
        ? ""
        : `The share page is deployed to GitHub Pages and runs in a browser with no\n` +
            `Tauri runtime, so importing @tauri-apps there produces a blank page for\n` +
            `whoever opens the link — and every test suite stays green.\n\n` +
            `${detail}\n\n` +
            `Move whatever is needed into a module that does not touch @tauri-apps,\n` +
            `or pass the value in as a prop from the desktop side.`
    ).toEqual([]);
  });

  it("would catch a Tauri import if one were added", () => {
    // Proves the scan is actually looking, not just returning empty. Uses the
    // same importsIn() the walk uses, on a synthetic source.
    const specs = importsIn(`import { api } from "@tauri-apps/api/core";\n`);
    expect(specs).toContain("@tauri-apps/api/core");
    expect(specs.some((s) => s.startsWith("@tauri-apps/"))).toBe(true);
  });

  it("ignores @tauri-apps mentioned in a comment", () => {
    // main.tsx's own header comment names the package it is avoiding; a scan
    // that flagged prose would be unusable.
    const specs = importsIn(
      `// avoid @tauri-apps/plugin-updater here\n/* also @tauri-apps/api */\nimport x from "./y";\n`
    );
    expect(specs).toEqual(["./y"]);
  });
});
