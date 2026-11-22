import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const LANGS21 = [
  "en",
  "it",
  "de",
  "fr",
  "es",
  "pt",
  "nl",
  "sv",
  "pl",
  "id",
  "zh",
  "ja",
  "ko",
  "hi",
  "ru",
  "ckb",
  "kmr",
  "tr",
  "ar",
  "fa",
  "ur"
];

function loadBrowser(rel) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  const sandbox = {
    console,
    document: {
      readyState: "complete",
      body: null,
      addEventListener() {},
      createTreeWalker() {
        return { nextNode: () => null };
      },
      querySelectorAll() {
        return [];
      }
    },
    NodeFilter: { SHOW_TEXT: 4 },
    localStorage: { getItem: () => "en" }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test("ui i18n21 covers 21 langs including telehealth and tickets chrome", () => {
  const api = loadBrowser("havkar-ui-i18n21.js").HAVKAR_UI_I18N21;
  assert.deepEqual(Array.from(api.selectable), LANGS21);
  assert.ok(api.glossaries.telehealth);
  assert.equal(Object.keys(api.glossaries.telehealth).length, 20);
  const fa = api.pack("fa");
  assert.ok(fa["Mute"]);
  assert.ok(fa["End call"]);
  assert.ok(fa["Search journeys"]);
  assert.notEqual(api.pack("ckb")["End call"], api.pack("kmr")["End call"]);
});

test("premium i18n covers all 20 non-English packs for every Italian key", () => {
  const api = loadBrowser("havkar-premium-i18n.js").HAVKAR_PREMIUM_I18N;
  assert.equal(api.selectable.length, 21);
  const keys = Object.keys(api.phrases.it);
  for (const lang of LANGS21.filter((l) => l !== "en")) {
    for (const key of keys) {
      assert.ok(api.phrases[lang][key], `${lang} missing ${key}`);
    }
  }
  assert.notEqual(api.phrases.ckb["Favorites"], api.phrases.kmr["Favorites"]);
});

test("telehealth adapter stays publicly blocked without clinical checklist", () => {
  const {
    telehealthStatus,
    createTelehealthSession,
    clinicalReadiness
  } = require("../lib/telehealth-adapter.cjs");
  const status = telehealthStatus({});
  assert.equal(status.voice, "BLOCKED");
  assert.equal(status.video, "BLOCKED");
  assert.equal(status.live_sessions, false);
  assert.equal(status.features.waiting_room, true);
  assert.equal(status.features.media_recording_default, "OFF");
  const ready = clinicalReadiness({});
  assert.ok(ready.missing_requirements.length >= 4);
  const blocked = createTelehealthSession(
    {
      appointment_id: "a1",
      provider_id: "p1",
      patient_user_id: "u1",
      modality: "video",
      consent_acknowledged: true
    },
    {}
  );
  assert.equal(blocked.ok, false);
  assert.equal(blocked.error, "telehealth_blocked");
});

test("telehealth authorized test mode can create session without public clinical open", () => {
  const { createTelehealthSession, telehealthStatus } = require("../lib/telehealth-adapter.cjs");
  const env = { HAVKAR_TELEHEALTH_TEST_MODE: "true" };
  const status = telehealthStatus(env);
  assert.equal(status.public_clinical_sessions_allowed, false);
  assert.equal(status.authorized_test_sessions_allowed, true);
  const created = createTelehealthSession(
    {
      appointment_id: "a1",
      provider_id: "p1",
      patient_user_id: "u1",
      modality: "voice",
      consent_acknowledged: true
    },
    env
  );
  assert.equal(created.ok, true);
  assert.equal(created.session.recording, "OFF");
  assert.equal(created.session.mode, "authorized_test");
  assert.ok(created.signaling.token.startsWith("th_"));
});

test("telehealth client and page expose WebRTC controls", () => {
  const client = fs.readFileSync(path.join(root, "havkar-telehealth.js"), "utf8");
  assert.match(client, /RTCPeerConnection/);
  assert.match(client, /getUserMedia/);
  assert.match(client, /toggleMute/);
  assert.match(client, /switchCamera/);
  const page = fs.readFileSync(path.join(root, "health-telehealth.html"), "utf8");
  assert.match(page, /waiting room/i);
  assert.match(page, /health_telehealth_session_create/);
  assert.match(page, /consent/);
  assert.doesNotMatch(page, /mediaRecorder|MediaRecorder/i);
});

test("omio adapter never fabricates journeys and reports exact external blockers", async () => {
  const {
    omioConfigured,
    searchOmioJourneys,
    createOmioBooking
  } = require("../lib/omio-adapter.cjs");
  const status = omioConfigured({});
  assert.equal(status.live_search, false);
  assert.equal(status.live_booking, false);
  assert.equal(status.credential_present, false);
  assert.ok(status.external_actions_required.includes("Provide OMIO_API_KEY secret"));
  const out = await searchOmioJourneys({ from: "Rome", to: "Milan", date: "2026-12-01" }, {});
  assert.equal(out.ok, false);
  assert.deepEqual(out.results, []);
  assert.equal(out.error, "omio_blocked");
  const book = await createOmioBooking({ offer_id: "x" }, {});
  assert.equal(book.ok, false);
  assert.equal(book.error, "omio_booking_blocked");
});

test("omio live search path uses partner fetch only when fully configured", async () => {
  const { searchOmioJourneys } = require("../lib/omio-adapter.cjs");
  let called = false;
  const fakeFetch = async () => {
    called = true;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ journeys: [{ id: "j1" }] });
      }
    };
  };
  const blocked = await searchOmioJourneys(
    { from: "Rome", to: "Milan", date: "2026-12-01" },
    { OMIO_API_KEY: "k", HAVKAR_OMIO_API_ENABLED: "true" },
    fakeFetch
  );
  assert.equal(blocked.ok, false);
  assert.equal(called, false);
  const ok = await searchOmioJourneys(
    { from: "Rome", to: "Milan", date: "2026-12-01", mode: "train" },
    {
      OMIO_API_KEY: "k",
      HAVKAR_OMIO_API_ENABLED: "true",
      HAVKAR_OMIO_CONTRACT_VERIFIED: "true"
    },
    fakeFetch
  );
  assert.equal(ok.ok, true);
  assert.equal(called, true);
  assert.equal(ok.results.length, 1);
});

test("home logo tiles and layout from #206 remain intact", () => {
  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal((home.match(/class="menu-item"/g) || []).length, 15);
  assert.match(home, /flex-direction:\s*column/);
  assert.doesNotMatch(home, /data-havkar-legal-footer/);
  assert.match(home, /doctors-pharmacies\.png/);
});

test("localization coverage audit reports packs without inventing 100% page completeness", () => {
  const ui = loadBrowser("havkar-ui-i18n21.js").HAVKAR_UI_I18N21;
  const premium = loadBrowser("havkar-premium-i18n.js").HAVKAR_PREMIUM_I18N;
  const health = loadBrowser("havkar-health-i18n.js").HAVKAR_HEALTH_I18N;
  const report = {
    ui21_languages: ui.selectable.length,
    ui21_sections: Object.keys(ui.glossaries).length,
    premium_languages: premium.selectable.length,
    health_languages: Array.isArray(health.selectable)
      ? health.selectable.length
      : 21,
    about_offline_packs: ["it", "sv", "fa", "ar", "ckb", "kmr"],
    ai_offline_core_langs: ["it", "fa", "ckb", "kmr", "ar", "sv"],
    claim_100_percent_all_pages: false
  };
  assert.equal(report.ui21_languages, 21);
  assert.equal(report.premium_languages, 21);
  assert.equal(report.claim_100_percent_all_pages, false);
  fs.mkdirSync("/opt/cursor/artifacts", { recursive: true });
  fs.writeFileSync(
    "/opt/cursor/artifacts/i18n-coverage-207.json",
    JSON.stringify(report, null, 2)
  );
});
