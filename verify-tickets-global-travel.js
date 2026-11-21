/**
 * Verify worldwide travel partner links (no invented fares).
 * Usage: node verify-tickets-global-travel.js [https://havkar.online]
 */
const BASE = process.argv[2] || "";
const omio = require("./lib/omio-adapter.cjs");

const ROUTES = [
  { from: "Berlin", to: "Paris", mode: "train", kind: "international_eu" },
  { from: "Tokyo", to: "Osaka", mode: "train", kind: "domestic_jp" },
  { from: "Cairo", to: "Alexandria", mode: "bus", kind: "domestic_eg" },
  { from: "Helsinki", to: "Tallinn", mode: "ferry", kind: "international_ferry" },
  { from: "Crotone", to: "New York", mode: "all", kind: "intercontinental" },
  { from: "São Paulo", to: "Buenos Aires", mode: "all", kind: "international_sa" },
  { from: "Lagos", to: "Accra", mode: "bus", kind: "international_africa" }
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function local() {
  const coverage = omio.travelCoverageReport({});
  assert(coverage.in_app_ticket_sales === false, "in-app sales must be false");
  assert(coverage.surface_redirect.status === "active_redirect", "omio redirect");
  assert(coverage.multimodal_redirect.status === "active_redirect", "r2r redirect");
  assert(
    coverage.flights.status.indexOf("awaiting_partnership") !== -1,
    "flights awaiting partnership"
  );

  const results = [];
  for (const route of ROUTES) {
    const bundle = omio.buildGlobalTravelPartnerLinks(route, {});
    assert(bundle.ok, "bundle ok " + route.kind);
    assert(bundle.links.length >= 2, "need Omio+Rome2Rio for " + route.kind);
    const om = bundle.links.find((l) => l.id === "omio");
    const r2 = bundle.links.find((l) => l.id === "rome2rio");
    assert(om && /^https:\/\/www\.omio\.com\/search\?/.test(om.url), "omio url " + route.kind);
    assert(
      r2 && /^https:\/\/www\.rome2rio\.com\/map\//.test(r2.url),
      "rome2rio url " + route.kind
    );
    assert(om.url.indexOf(encodeURIComponent(route.from).replace(/%20/g, "+")) !== -1 ||
      om.url.indexOf("departure=" + encodeURIComponent(route.from)) !== -1 ||
      decodeURIComponent(om.url).indexOf(route.from) !== -1,
      "omio contains from");
    results.push({
      kind: route.kind,
      mode: route.mode,
      omio: om.url,
      rome2rio: r2.url
    });
  }

  /* Flights module still present in tickets.html */
  const fs = require("fs");
  const tickets = fs.readFileSync("tickets.html", "utf8");
  assert(tickets.indexOf("Awaiting partnership response") !== -1, "flight partnership note");
  assert(tickets.indexOf("flightSearchForm") !== -1, "flight form preserved");
  assert(tickets.indexOf("Open Google Flights") !== -1, "google flights preserved");
  assert(tickets.indexOf('data-ticket-type="combined"') !== -1, "combined tab");
  assert(tickets.indexOf("Tokyo, Japan") !== -1, "global placeholders");

  console.log("LOCAL_OK routes=" + results.length);
  results.forEach((r) => {
    console.log(
      " - " + r.kind + " [" + r.mode + "]\n   omio=" + r.omio + "\n   r2r=" + r.rome2rio
    );
  });
  return results;
}

async function prod(base) {
  const root = base.replace(/\/$/, "");
  const samples = [
    { from: "Crotone", to: "New York", mode: "all" },
    { from: "Berlin", to: "Paris", mode: "train" },
    { from: "Tokyo", to: "Osaka", mode: "train" }
  ];
  for (const s of samples) {
    const res = await fetch(root + "/api/currency-matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "travel_partner_links", ...s })
    });
    const body = await res.json();
    assert(body.ok && body.links && body.links.length >= 2, "prod links " + s.from);
    console.log("PROD_OK", s.from, "→", s.to, "links", body.links.map((l) => l.id).join(","));
  }
  const cov = await fetch(root + "/api/currency-matrix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "travel_coverage_report" })
  }).then((r) => r.json());
  assert(cov.ok && cov.coverage, "coverage report");
  console.log(
    "PROD_COVERAGE in_app_sales=",
    cov.coverage.in_app_ticket_sales,
    "omio=",
    cov.coverage.surface_redirect.status,
    "flights=",
    cov.coverage.flights.status
  );
}

(async function () {
  local();
  if (BASE) await prod(BASE);
  else console.log("Skip prod (pass base URL)");
})().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
