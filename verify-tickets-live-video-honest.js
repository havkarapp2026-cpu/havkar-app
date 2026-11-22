/**
 * Local + optional prod smoke for tickets partner redirects + live video API.
 * Usage: node verify-tickets-live-video-honest.js [https://havkar.online]
 */
const BASE = process.argv[2] || "";

async function localChecks() {
  const omio = require("./lib/omio-adapter.cjs");
  const link = omio.buildOmioAffiliateSearchUrl({
    from: "Crotone",
    to: "Milan",
    date: "2026-04-15",
    mode: "train"
  });
  if (!link.ok || !/^https:\/\/www\.omio\.com\/search\?/.test(link.url)) {
    throw new Error("Omio public search URL failed");
  }
  const blocked = await omio.searchOmioJourneys(
    { from: "Crotone", to: "Milan", date: "2026-04-15", mode: "train" },
    { OMIO_API_KEY: "" }
  );
  if (blocked.ok || !blocked.partner_redirect || !blocked.partner_redirect.url) {
    throw new Error("Blocked Omio search must return partner_redirect");
  }
  const fs = require("fs");
  const tickets = fs.readFileSync("tickets.html", "utf8");
  const layers = fs.readFileSync("havkar-map-live-layers.js", "utf8");
  const vercel = fs.readFileSync("vercel.json", "utf8");
  const must = [
    [tickets.includes("Open Google Flights"), "Google Flights CTA"],
    [tickets.includes("omio_affiliate_link"), "Omio affiliate action"],
    [tickets.includes("Booking.com"), "Booking.com hotel redirect"],
    [tickets.includes("Google Maps directions"), "Taxi Maps CTA"],
    [layers.includes("/api/map-live-videos"), "live videos endpoint in layers"],
    [layers.includes("youtube-nocookie.com/embed/"), "YouTube embed player"],
    [layers.includes('data-cam="fullscreen"'), "fullscreen control"],
    [vercel.includes("map-live-videos"), "vercel rewrite"]
  ];
  must.forEach(function (pair) {
    if (!pair[0]) throw new Error("Missing: " + pair[1]);
  });
  console.log("LOCAL_OK crotone_milan_omio=" + link.url);
}

async function prodChecks(base) {
  const root = base.replace(/\/$/, "");
  const live = await fetch(root + "/api/map-live-videos");
  const liveBody = await live.json();
  if (!live.ok || !liveBody.ok || !(liveBody.cameras || []).length) {
    throw new Error("prod map-live-videos failed: " + live.status);
  }
  const cam = liveBody.cameras[0];
  if (!cam.live_stream || !cam.youtube_id) {
    throw new Error("prod live cam missing youtube/live_stream");
  }
  const rain = await fetch(root + "/api/map-rain-radar");
  const rainBody = await rain.json();
  if (!rain.ok || !rainBody.ok) {
    throw new Error("prod rain radar failed");
  }
  const aff = await fetch(root + "/api/currency-matrix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "omio_affiliate_link",
      mode: "train",
      from: "Crotone",
      to: "Milan",
      date: "2026-04-15"
    })
  });
  const affBody = await aff.json();
  if (!affBody.ok || !affBody.url) {
    throw new Error("prod omio_affiliate_link failed");
  }
  const home = await fetch(root + "/");
  const homeHtml = await home.text();
  const tileCount = (homeHtml.match(/class="[^"]*tile[^"]*"/g) || []).length;
  console.log(
    "PROD_OK live_cams=" +
      liveBody.count +
      " first=" +
      cam.name +
      " rain_ok=" +
      rainBody.ok +
      " omio=" +
      affBody.url +
      " home_tiles_approx=" +
      tileCount
  );
}

(async function () {
  await localChecks();
  if (BASE) await prodChecks(BASE);
  else console.log("Skip prod (pass base URL to test production)");
})().catch(function (err) {
  console.error("FAIL", err && err.message ? err.message : err);
  process.exit(1);
});
