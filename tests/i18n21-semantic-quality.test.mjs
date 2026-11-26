/**
 * Semantic quality gate (Owner 2026-11-26):
 * not only "no visible keys" — also meaning, naturalness, and no EN leftovers
 * for critical account / Stellar / currency chrome across all 21 languages.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const CRITICAL = [
  "Personal Account",
  "Business Account",
  "Company / Factory",
  "Independent crypto rail · not a banking / Stripe fiat currency",
  "XLM — Stellar Lumens",
  "View all 133 currencies",
  "Display",
  "Settlement",
  "Stellar · non-custodial",
  "Connect your own Stellar wallet. HAVKAR prepares a reviewable payment; only your wallet holds the secret and must approve every signature. HAVKAR never asks for a recovery phrase and cannot move your XLM alone."
];

const RTL = new Set(["fa", "ar", "ur", "ckb"]);
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const LATIN = /[A-Za-z]{4,}/;
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

function loadPacks() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync("havkar-ui-i18n21.js", "utf8"), ctx);
  vm.runInContext(
    fs.readFileSync("havkar-ui-i18n21-generated.js", "utf8"),
    ctx
  );
  return ctx.HAVKAR_UI_I18N21;
}

function looksLanguageMix(lang, text) {
  const s = String(text || "");
  if (!s) return true;
  if (RTL.has(lang)) {
    // Must contain Arabic-script letters for these phrases (except brand tokens)
    if (!ARABIC_SCRIPT.test(s) && !/XLM|Stellar|HAVKAR|Stripe|ISO/.test(s)) {
      return true;
    }
    // Dense Latin sentence mixed into RTL chrome (allow brands / ISO)
    const latinWords = s.match(/[A-Za-z]{5,}/g) || [];
    const nonBrand = latinWords.filter(
      (w) =>
        !/^(stellar|havkar|stripe|xlm|iso|eur|revolut|mainnet|testnet|freighter|albedo|lobstr)$/i.test(
          w
        )
    );
    if (nonBrand.length >= 4 && ARABIC_SCRIPT.test(s)) return true;
  }
  if (lang === "zh" || lang === "ja" || lang === "ko") {
    if (!CJK.test(s) && s !== "XLM — Stellar Lumens" && !s.startsWith("XLM")) {
      // some titles intentionally keep English brand form
      if (CRITICAL.includes(s)) return true;
    }
  }
  return false;
}

test("SV Personal Account and Stellar crypto note are natural Swedish not English", () => {
  const api = loadPacks();
  const sv = api.pack("sv");
  assert.equal(sv["Personal Account"], "Personligt konto");
  assert.notEqual(sv["Personal Account"], "Personal Account");
  const note =
    sv["Independent crypto rail · not a banking / Stripe fiat currency"];
  assert.ok(note);
  assert.notEqual(
    note,
    "Independent crypto rail · not a banking / Stripe fiat currency"
  );
  assert.match(note, /krypto/i);
  assert.match(note, /Stripe/i);
  // Must NOT claim XLM is a banking fiat
  assert.equal(/är en bank|banking fiat currency$/i.test(note), false);
  const desc =
    sv[
      "Connect your own Stellar wallet. HAVKAR prepares a reviewable payment; only your wallet holds the secret and must approve every signature. HAVKAR never asks for a recovery phrase and cannot move your XLM alone."
    ];
  assert.ok(desc);
  assert.match(desc, /Stellar/i);
  assert.match(desc, /plånbok/i);
  assert.notEqual(desc.slice(0, 20), "Connect your own Ste");
});

test("all 21 languages translate critical account/currency/Stellar chrome", () => {
  const api = loadPacks();
  const failures = [];
  for (const lang of api.selectable) {
    const pack = api.pack(lang) || {};
    for (const en of CRITICAL) {
      const out = String(pack[en] || "").trim();
      if (!out) {
        failures.push(`${lang}|missing|${en}`);
        continue;
      }
      if (lang !== "en" && out === en && en !== "XLM — Stellar Lumens") {
        // Brand-like short labels may stay; long instructional chrome must not.
        if (en.length > 24 || en.includes("Personal Account") || en.includes("Independent crypto")) {
          failures.push(`${lang}|english-leftover|${en}`);
        }
      }
      if (looksLanguageMix(lang, out)) {
        failures.push(`${lang}|language-mix|${en}|${out.slice(0, 80)}`);
      }
    }
  }
  assert.equal(
    failures.length,
    0,
    `semantic failures:\n${failures.slice(0, 40).join("\n")}`
  );
});

test("ckb and kmr account labels stay distinct", () => {
  const api = loadPacks();
  const ckb = api.pack("ckb")["Personal Account"];
  const kmr = api.pack("kmr")["Personal Account"];
  assert.notEqual(ckb, kmr);
  assert.notEqual(ckb, "Personal Account");
  assert.notEqual(kmr, "Personal Account");
});

test("profile getAccountTypeLabel and currency select use phrase/i18n hooks", () => {
  const profile = fs.readFileSync("profile.html", "utf8");
  assert.match(profile, /HAVKAR_I18N\.phrase/);
  assert.match(profile, /getAccountTypeLabel/);
  const cur = fs.readFileSync("havkar-currency-select.js", "utf8");
  assert.match(cur, /data-hcs-i18n/);
  assert.match(
    cur,
    /Independent crypto rail · not a banking \/ Stripe fiat currency/
  );
  assert.match(cur, /HAVKAR_I18N\.phrase/);
  const wallet = fs.readFileSync("wallet.html", "utf8");
  assert.match(
    wallet,
    /data-i18n="Connect your own Stellar wallet\. HAVKAR prepares a reviewable payment/
  );
});

test("currency select no longer hard-paints English-only XLM note without t()", () => {
  const cur = fs.readFileSync("havkar-currency-select.js", "utf8");
  // After build, data-hcs-i18n nodes must be rewritten via t()
  assert.match(cur, /querySelectorAll\("\[data-hcs-i18n\]"\)/);
  assert.match(cur, /el\.textContent = t\(key\)/);
});
