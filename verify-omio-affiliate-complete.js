/**
 * Verify Omio Impact affiliate tracking + preserved global redirects.
 * Usage: node verify-omio-affiliate-complete.js [https://havkar.online]
 */
const BASE = process.argv[2] || "";
const omio = require("./lib/omio-adapter.cjs");

function assert(c, m) {
  if (!c) throw new Error(m);
}

function local() {
  assert(omio.HAVKAR_IMPACT_MEDIA_PARTNER_ID === "7763968", "media partner constant");
  const tracked = omio.buildOmioAffiliateSearchUrl(
    { from: "Berlin", to: "Paris", mode: "train", date: "2026-07-01" },
    { OMIO_AFFILIATE_ID: "7763968" }
  );
  assert(tracked.tracked && /partner=7763968/.test(tracked.url), "tracked partner param");
  assert(/utm_medium=affiliate/.test(tracked.url), "affiliate utm");
  const forged = omio.buildOmioAffiliateSearchUrl(
    { from: "Berlin", to: "Paris" },
    { OMIO_AFFILIATE_ID: "463493" }
  );
  assert(!forged.tracked && !/partner=463493/.test(forged.url || ""), "reject advertiser id");
  const forgedProg = omio.buildOmioAffiliateSearchUrl(
    { from: "Berlin", to: "Paris" },
    { OMIO_AFFILIATE_ID: "7385" }
  );
  assert(!forgedProg.tracked, "reject program id");
  const st = omio.omioConfigured({ OMIO_AFFILIATE_ID: "7763968" });
  assert(st.affiliate_tracked && st.impact_partner_program.media_partner_match, "match");
  assert(st.live_search === false, "affiliate ≠ API sales");
  console.log("LOCAL_OK tracked_url=" + tracked.url);
}

async function prod(base) {
  const root = base.replace(/\/$/, "");
  const body = await fetch(root + "/api/currency-matrix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "omio_affiliate_link",
      from: "Crotone",
      to: "New York",
      mode: "all",
      date: "2026-07-01"
    })
  }).then((r) => r.json());
  assert(body.ok && body.url, "prod link");
  console.log(
    "PROD_AFFILIATE tracked=" +
      body.tracked +
      " partner=" +
      body.partner +
      " url=" +
      body.url
  );
  assert(body.tracked === true, "prod must be tracked after OMIO_AFFILIATE_ID deploy");
  assert(String(body.partner) === "7763968", "partner must be Impact media 7763968");
  assert(/partner=7763968/.test(body.url), "url partner param");

  const live = await fetch(root + "/api/map-live-videos").then((r) => r.json());
  assert(live.ok && live.count >= 8, "live cams");
  const rain = await fetch(root + "/api/map-rain-radar").then((r) => r.json());
  assert(rain.ok, "rain");
  const traf = await fetch(root + "/api/map-traffic").then((r) => r.json());
  assert(traf.ok, "traffic status ok");
  if (traf.available) {
    assert(traf.tile_url_template, "traffic tiles when available");
    assert(!/key=/.test(String(traf.tile_url_template || "")), "no key in tile url");
  } else {
    assert(
      String(traf.requires_owner_secret || "").includes("TOMTOM"),
      "traffic honestly gated when off"
    );
  }
  const home = await fetch(root + "/").then((r) => r.text());
  const tiles = (home.match(/class="tile-label"/g) || []).length;
  assert(tiles === 15, "15 tiles got " + tiles);
  console.log("PROD_OK live_cams=" + live.count + " tiles=" + tiles);
}

(async function () {
  local();
  if (BASE) await prod(BASE);
  else console.log("Skip prod");
})().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
