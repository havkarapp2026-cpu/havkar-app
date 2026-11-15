import assert from "node:assert/strict";
import fs from "node:fs";

// Tickets restored from verified stack — not the 20KB partner-await stub.
const tickets = fs.readFileSync("tickets.html", "utf8");
assert.ok(tickets.length > 50000, "tickets.html should be the restored full experience");
assert.match(tickets, /data-ticket-type="events"/);
assert.match(tickets, /flightSearchForm/);
assert.match(tickets, /data-omio-widget="true"/);
assert.match(tickets, /flightOriginQuery/);

// Hotels guest + owner must remain intact.
const accommodation = fs.readFileSync("accommodation.html", "utf8");
assert.match(accommodation, /Guest hotels search|cityInput/);
assert.match(accommodation, /payStripeCard/);
assert.match(accommodation, /payXlmCard/);
assert.match(fs.readFileSync("accommodation-manage.html", "utf8"), /Owner payout rails|Owner/);

// Jobs / Services / hotels API wiring must remain.
const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /\/api\/hotels/);
assert.match(vercel, /\/api\/jobs/);
assert.match(vercel, /\/api\/services/);
assert.match(vercel, /havkarAction=hotels/);

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(checkout, /havkar-hotels-api/);
assert.match(checkout, /handleHotelsRequest|isHotelsRequest/);

assert.match(fs.readFileSync("jobs.html", "utf8"), /Apply|job/i);
assert.match(fs.readFileSync("services.html", "utf8"), /service/i);

console.log("TICKETS_REGRESSION_GUARD_TEST_OK");
