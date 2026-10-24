import assert from "node:assert/strict";
import fs from "node:fs";

const reviews = fs.readFileSync("reviews.html", "utf8");
const tickets = fs.readFileSync("tickets.html", "utf8");
const jobs = fs.readFileSync("jobs.html", "utf8");
const accommodation = fs.readFileSync("accommodation.html", "utf8");

assert.match(reviews, /linked to a completed service/);
assert.doesNotMatch(reviews, /from\("reviews"\)/);
assert.doesNotMatch(reviews, /user_id/);

assert.match(tickets, /Booking is completed on Omio/);
assert.match(tickets, /https:\/\/omio\.sjv\.io\/c\/7763968\/3963000\/7385\?u=/);
assert.match(tickets, /data-default-travel-mode="flight"/);
assert.match(tickets, /data-default-travel-mode="bus"/);
assert.match(tickets, /data-default-travel-mode="ferry"/);
assert.doesNotMatch(tickets, /Awaiting partner access/);
assert.doesNotMatch(tickets, /api\.omio\.com/);
assert.doesNotMatch(tickets, /Duffel/);

assert.match(jobs, /The payment gateway is not connected yet/);
assert.match(jobs, /has NOT been activated/);

assert.match(accommodation, /Published Italian listings only/);
assert.match(accommodation, /No verified accommodation is published/);
assert.doesNotMatch(accommodation, /worldwide booking/i);

console.log("SERVICE_HONESTY_TEST_OK");
