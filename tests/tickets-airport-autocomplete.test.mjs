import assert from "assert";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const ticketsHtml = fs.readFileSync(path.join(root, "tickets.html"), "utf8");
const flightsApi = fs.readFileSync(path.join(root, "api/flights.js"), "utf8");
const flightOrderApi = fs.readFileSync(path.join(root, "api/flight-order.js"), "utf8");
const placesLib = fs.readFileSync(path.join(root, "lib/duffel-places.cjs"), "utf8");

// UI: raw IATA text inputs replaced by searchable autocomplete
assert.ok(ticketsHtml.includes('id="flightOriginQuery"'));
assert.ok(ticketsHtml.includes('id="flightDestinationQuery"'));
assert.ok(ticketsHtml.includes('id="flightOriginSuggestions"'));
assert.ok(ticketsHtml.includes('id="flightDestinationSuggestions"'));
assert.ok(ticketsHtml.includes('id="flightOrigin"') && ticketsHtml.includes('type="hidden"'));
assert.ok(ticketsHtml.includes('fetch("/api/flights?"'));
assert.ok(!ticketsHtml.includes("/api/flight-places"));
assert.ok(!ticketsHtml.includes('placeholder="MXP"'));
assert.ok(!ticketsHtml.includes('placeholder="FCO"'));
assert.ok(ticketsHtml.includes("Select origin and destination from the airport suggestions"));
assert.ok(ticketsHtml.includes("Loading suggestions…"));
assert.ok(ticketsHtml.includes("No matching airports or cities"));
assert.ok(ticketsHtml.includes("You appear offline"));
assert.ok(ticketsHtml.includes("aria-autocomplete=\"list\""));
assert.ok(ticketsHtml.includes("role=\"listbox\""));

// Offer card uses verified Duffel fields (not fabricated fares)
assert.ok(ticketsHtml.includes("describeOfferRoute"));
assert.ok(ticketsHtml.includes("describeBaggage"));
assert.ok(ticketsHtml.includes("describeConditions"));
assert.ok(ticketsHtml.includes("Total "));
assert.ok(ticketsHtml.includes("TEST MODE") || ticketsHtml.includes("Duffel TEST"));
assert.ok(ticketsHtml.includes("test_mode: true"));
assert.ok(ticketsHtml.includes("Live booking blocked"));

// Eight categories present; taxi/transfer remain gated; hotels blocked copy
const typeOrder = [...ticketsHtml.matchAll(/data-ticket-type="([^"]+)"/g)].map((m) => m[1]);
assert.deepStrictEqual(typeOrder.slice(0, 8), [
  "events",
  "flight",
  "train",
  "bus",
  "ferry",
  "taxi",
  "transfer",
  "hotel"
]);
assert.ok(ticketsHtml.includes("Welcome Pickups does not allow this site to load its city list."));
assert.ok(!ticketsHtml.includes("welcomepickups.com/widget/bundle.js"));
assert.ok(ticketsHtml.includes("Hotel booking stays unavailable"));
assert.ok(
  ticketsHtml.includes("Omio has not connected API access") ||
    ticketsHtml.includes("Omio integration is being prepared")
);
assert.ok(ticketsHtml.includes("REAL_PAYMENTS_PAUSED"));

// Server wiring stays inside existing /api/flights (Hobby function limit)
assert.ok(!fs.existsSync(path.join(root, "api/flight-places.js")));
assert.ok(flightsApi.includes('req.method !== "POST" && req.method !== "GET"'));
assert.ok(flightsApi.includes("searchAirportSuggestions"));
assert.ok(flightsApi.includes("duffel-places.cjs"));
assert.ok(placesLib.includes("places/suggestions"));
assert.ok(placesLib.includes("expandSuggestions"));
assert.ok(placesLib.includes("normalizePlace"));
assert.ok(flightOrderApi.includes("test_mode") || flightOrderApi.includes("live_mode"));

const places = await import(pathToFileURL(path.join(root, "lib/duffel-places.cjs")).href);
const { normalizePlace, expandSuggestions } = places;

assert.equal(normalizePlace(null), null);
assert.equal(normalizePlace({ type: "airport", name: "X", iata_code: "AB" }), null);

const milanCity = normalizePlace({
  id: "cit_mil_it",
  type: "city",
  name: "Milan",
  iata_code: "MIL",
  iata_country_code: "IT",
  country_name: "Italy",
  airports: [
    {
      id: "arp_mxp_it",
      type: "airport",
      name: "Malpensa",
      iata_code: "MXP",
      city_name: "Milan",
      iata_country_code: "IT",
      country_name: "Italy"
    },
    {
      id: "arp_lin_it",
      type: "airport",
      name: "Linate",
      iata_code: "LIN",
      city_name: "Milan",
      iata_country_code: "IT",
      country_name: "Italy"
    }
  ]
});
assert.equal(milanCity.iata_code, "MIL");
assert.equal(milanCity.type, "city");
assert.ok(milanCity.label.includes("MIL"));
assert.equal(milanCity.airports.length, 2);

const expanded = expandSuggestions([
  {
    id: "cit_mil_it",
    type: "city",
    name: "Milan",
    iata_code: "MIL",
    iata_country_code: "IT",
    country_name: "Italy",
    airports: [
      {
        id: "arp_mxp_it",
        type: "airport",
        name: "Malpensa",
        iata_code: "MXP",
        city_name: "Milan",
        iata_country_code: "IT",
        country_name: "Italy"
      },
      {
        id: "arp_lin_it",
        type: "airport",
        name: "Linate",
        iata_code: "LIN",
        city_name: "Milan",
        iata_country_code: "IT",
        country_name: "Italy"
      }
    ]
  }
]);
assert.ok(expanded.some((row) => row.iata_code === "MIL"));
assert.ok(expanded.some((row) => row.iata_code === "MXP"));
assert.ok(expanded.some((row) => row.iata_code === "LIN"));
assert.ok(expanded.length <= 12);

console.log("TICKETS_AIRPORT_AUTOCOMPLETE_TEST_OK");
