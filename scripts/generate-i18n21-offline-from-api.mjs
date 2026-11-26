#!/usr/bin/env node
/**
 * One-time offline glossary generator via existing /api/translate.
 * Does NOT enable runtime auto-spend. Output merges into UI21 packs.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = process.env.HAVKAR_TRANSLATE_API || "https://havkar.online/api/translate";
const OUT = path.join(root, "havkar-ui-i18n21-generated.js");
const CACHE = "/tmp/i18n21-gen-cache.json";
const TARGETS = [
  "it","de","fr","es","pt","nl","sv","pl","id","zh","ja","ko","hi","ru","ckb","kmr","tr","ar","fa","ur"
];
const BATCH = 40;
const SLEEP_MS = 1200;

const LANGUAGE_NAMES = new Set([
  "English","Italiano","Deutsch","Français","Español","Português","Nederlands","Svenska",
  "Polski","Bahasa Indonesia","中文","日本語","한국어","हिन्दी","Русский","Türkçe","العربية",
  "فارسی","اردو","Italian","German","French","Spanish","Swedish","Turkish","Persian","Arabic",
  "Kurdî","Sorani","Kurmanji","Indonesian","Chinese","Japanese","Korean","Hindi","Russian","Dutch","Polish","Portuguese"
]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadKnown() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "havkar-ui-i18n21.js"), "utf8"), ctx);
  if (fs.existsSync(OUT)) {
    try { vm.runInContext(fs.readFileSync(OUT, "utf8"), ctx); } catch {}
  }
  return new Set(Object.keys(ctx.HAVKAR_UI_I18N21.pack("it") || {}));
}

function extract(html) {
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const out = new Set();
  for (const m of h.matchAll(/\b(?:placeholder|aria-label|title|alt)=["']([^"']{2,120})["']/gi)) {
    out.add(m[1].trim());
  }
  for (const m of h.matchAll(/data-i18n(?:-placeholder|-aria)?=["']([^"']+)["']/gi)) {
    out.add(m[1].replace(/&amp;/g, "&").trim());
  }
  for (const m of h.matchAll(/>([^<]{2,120})</g)) {
    const t = m[1]
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (t) out.add(t);
  }
  return [...out];
}

function isUiChrome(s) {
  if (!s || s.length < 2 || s.length > 100) return false;
  if (!/[A-Za-z]/.test(s)) return false;
  if (LANGUAGE_NAMES.has(s)) return false;
  if (/^[\d\s.,:%€$+\-_/\\|]+$/.test(s)) return false;
  if (/[{}<>;=]|https?:|www\.|function |const |var |let |=>/.test(s)) return false;
  if (/@/.test(s)) return false; // emails
  if (/^(IT|OK|ID|UI|API|XLM|EUR|USD|GBP|JPY)$/i.test(s)) return false;
  if (/^(and|or|not|the|a|an|to|of|in|on|for)$/i.test(s)) return false;
  if (/^[a-z0-9_-]+\.(png|jpg|svg|js|css|html)$/i.test(s)) return false;
  return true;
}

function collectMissing(known) {
  const missing = new Set();
  for (const f of fs.readdirSync(root).filter((x) => x.endsWith(".html"))) {
    // skip pure pi testnet junk? still include UI pages
    const html = fs.readFileSync(path.join(root, f), "utf8");
    for (const s of extract(html)) {
      if (!isUiChrome(s)) continue;
      if (known.has(s)) continue;
      missing.add(s);
    }
  }
  return [...missing].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE, JSON.stringify(cache));
}

async function translateBatch(texts, targetLanguage) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://havkar.online"
    },
    body: JSON.stringify({
      texts,
      sourceLanguage: "en",
      targetLanguage
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok || !Array.isArray(data.translations)) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data.translations.map((t, i) => {
    const translated =
      (t && (t.translatedText || t.text)) || texts[i];
    return String(translated || texts[i]).trim() || texts[i];
  });
}

function writeOutput(glossaryByLang) {
  const payload = JSON.stringify(glossaryByLang);
  const src = `/**
 * AUTO-GENERATED offline UI glossaries (do not edit by hand).
 * Generated via existing /api/translate to avoid runtime auto-spend.
 */
(function (root) {
  "use strict";
  var GENERATED = ${payload};
  var api = root.HAVKAR_UI_I18N21;
  if (!api || !api.pack) return;
  var orig = api.pack.bind(api);
  api.pack = function (lang) {
    var base = orig(lang) || {};
    var code = String(lang || "en");
    var row = GENERATED[code];
    if (row) {
      Object.keys(row).forEach(function (en) {
        if (row[en]) base[en] = row[en];
      });
    }
    return base;
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
`;
  fs.writeFileSync(OUT, src);
}

async function main() {
  const known = loadKnown();
  let missing = collectMissing(known);
  const limit = Number(process.env.I18N_GEN_LIMIT || "0");
  if (limit > 0) missing = missing.slice(0, limit);
  console.log(JSON.stringify({ known: known.size, missing: missing.length, targets: TARGETS.length, api: API }));

  const cache = loadCache();
  // glossaryByLang[lang][en] = translated
  const glossaryByLang = {};
  for (const lang of TARGETS) glossaryByLang[lang] = {};

  // hydrate from cache
  for (const [key, row] of Object.entries(cache)) {
    for (const lang of TARGETS) {
      if (row[lang]) glossaryByLang[lang][key] = row[lang];
    }
  }

  let apiCalls = 0;
  let translatedPairs = 0;

  for (const lang of TARGETS) {
    const need = missing.filter((s) => !(cache[s] && cache[s][lang]));
    console.log(`lang=${lang} need=${need.length}`);
    for (let i = 0; i < need.length; i += BATCH) {
      const batch = need.slice(i, i + BATCH);
      let attempt = 0;
      for (;;) {
        try {
          const outs = await translateBatch(batch, lang);
          apiCalls += 1;
          batch.forEach((en, idx) => {
            const tr = outs[idx];
            if (!cache[en]) cache[en] = {};
            cache[en][lang] = tr;
            glossaryByLang[lang][en] = tr;
            translatedPairs += 1;
          });
          saveCache(cache);
          writeOutput(glossaryByLang);
          process.stdout.write(`  ${lang} ${Math.min(i + BATCH, need.length)}/${need.length} calls=${apiCalls}\r`);
          break;
        } catch (e) {
          attempt += 1;
          const status = e.status || 0;
          console.error(`\nbatch fail lang=${lang} status=${status} attempt=${attempt}:`, e.message);
          if (status === 429 || status === 503) {
            await sleep(8000 * attempt);
            if (attempt <= 6) continue;
          }
          if (attempt <= 3) {
            await sleep(2000 * attempt);
            continue;
          }
          throw e;
        }
      }
      await sleep(SLEEP_MS);
    }
    console.log(`\ndone ${lang}`);
  }

  writeOutput(glossaryByLang);
  console.log(JSON.stringify({ ok: true, apiCalls, translatedPairs, out: OUT }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
