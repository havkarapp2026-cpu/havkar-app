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

const pages = [
  "index.html",
  "buy-sell.html",
  "jobs.html",
  "services.html",
  "ads.html",
  "tickets.html",
  "accommodation.html",
  "delivery.html",
  "events.html",
  "chat.html",
  "wallet.html",
  "language.html",
  "health.html",
  "havkar-ai.html",
  "calls.html",
  "profile.html",
  "support.html",
  "about.html"
];

const rows = pages.map((file) => {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  return {
    file,
    hasI18n21: /havkar-ui-i18n21\.js/.test(html),
    hasI18nCore: /havkar-i18n\.js/.test(html)
  };
});

const report = {
  configuredLanguageCodes: unique.sort(),
  configuredCount: unique.length,
  soraniSeparate: hasCkb,
  kurmanjiSeparate: hasKmr,
  pages: rows,
  fullCoverageClaim: false,
  note:
    "Script verifies wiring and language separation only. Full page-by-page string coverage requires human/UI review per language."
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
