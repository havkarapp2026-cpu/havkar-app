#!/usr/bin/env node
/**
 * Honest 21-language audit helper: reports configured languages and samples
 * whether key UI pages load i18n scripts. Does NOT claim full translation coverage.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const i18n = fs.readFileSync(path.join(root, "havkar-ui-i18n21.js"), "utf8");

const selectableMatch = i18n.match(/SELECTABLE\s*=\s*\[([^\]]+)\]/);
const codes = selectableMatch
  ? [...selectableMatch[1].matchAll(/["']([a-z]{2,3})["']/gi)].map((m) =>
      m[1].toLowerCase()
    )
  : [];
const unique = [...new Set(codes)];
const hasCkb = unique.includes("ckb");
const hasKmr = unique.includes("kmr");

const pages = fs
  .readdirSync(root)
  .filter((f) => f.endsWith(".html"))
  .sort();

const rows = pages.map((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  const hasBody = /<\/body>/i.test(html);
  return {
    file,
    hasBody,
    hasI18n21: /havkar-ui-i18n21\.js/.test(html),
    hasGenerated: /havkar-ui-i18n21-generated\.js/.test(html),
    hasI18nCore: /havkar-i18n\.js/.test(html)
  };
});

const bodyPages = rows.filter((r) => r.hasBody);
const unwired = bodyPages.filter(
  (r) => !r.hasI18n21 || !r.hasI18nCore || !r.hasGenerated
);

const report = {
  configuredLanguageCodes: unique.sort(),
  configuredCount: unique.length,
  soraniSeparate: hasCkb,
  kurmanjiSeparate: hasKmr,
  pages: rows,
  unwiredBodyPages: unwired.map((r) => r.file),
  fullCoverageClaim: unwired.length === 0,
  note:
    unwired.length === 0
      ? "All HTML body pages load UI21 + generated offline glossaries + Core. Runtime live UI translate remains opt-in."
      : "Some body pages are still missing i18n script wiring."
};

const outPath = "/opt/cursor/artifacts/i18n21-audit.json";
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (unique.length < 21) {
  console.error("Configured language count below 21:", unique.length);
  process.exit(2);
}
if (!hasCkb) {
  console.error("Sorani (ckb) missing");
  process.exit(2);
}
console.log("i18n21 wiring audit wrote", outPath);
