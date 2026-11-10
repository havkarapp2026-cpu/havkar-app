import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const {
  CONFIRM_PHRASE,
  AMOUNT_CENTS,
  isOwnerIdentity,
  isOwnerEur1Request
} = require("../lib/owner-eur1-checkout.cjs");

assert.equal(CONFIRM_PHRASE, "PREPARE_EUR_1_00_LIVE_CHECKOUT");
assert.equal(AMOUNT_CENTS, 100);

assert.equal(
  isOwnerIdentity({
    id: "9b34b0bb-271a-49ee-aeb7-a9d28be06a06",
    email: "other@example.com"
  }),
  true
);
assert.equal(
  isOwnerIdentity({ id: "x", email: "havkarapp2026@gmail.com" }),
  true
);
assert.equal(
  isOwnerIdentity({ id: "x", email: "someone@example.com" }),
  false
);

assert.equal(
  isOwnerEur1Request({
    query: { havkarAction: "ownerEur1" },
    body: { action: "owner_eur1_prepare" },
    url: "/api/create-event-checkout"
  }),
  true
);
assert.equal(
  isOwnerEur1Request({
    query: {},
    body: { action: "owner_eur1_status" },
    url: "/api/owner-eur1-checkout"
  }),
  true
);
assert.equal(
  isOwnerEur1Request({
    query: { havkarAction: "paymentStatus" },
    body: {},
    url: "/api/payment-activation-status"
  }),
  false
);

const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
assert.match(checkout, /owner-eur1-checkout\.cjs/);
assert.match(checkout, /public_collection:\s*"paused"/);
assert.match(checkout, /Intentionally bypasses public HAVKAR_REAL_PAYMENTS_ENABLED gate/);

const vercel = fs.readFileSync("vercel.json", "utf8");
assert.match(vercel, /\/api\/owner-eur1-checkout/);

const page = fs.readFileSync("owner-eur1-checkout.html", "utf8");
assert.match(page, /PREPARE_EUR_1_00_LIVE_CHECKOUT/);
assert.match(page, /noindex/);
assert.match(page, /src="\/havkar-supabase-config\.js"/);
assert.match(page, /window\.HAVKAR_SUPABASE_CONFIG/);
assert.match(page, /config\.publishableKey/);
assert.doesNotMatch(page, /anonKey/);
assert.doesNotMatch(page, /service_role/);

const config = fs.readFileSync("havkar-supabase-config.js", "utf8");
assert.match(config, /publishableKey:/);
assert.match(config, /gispovnciifgikvgpzck\.supabase\.co/);
assert.doesNotMatch(config, /service_role/);
assert.doesNotMatch(config, /anonKey:/);

const realPayments = fs.readFileSync("lib/real-payments.cjs", "utf8");
assert.match(realPayments, /HAVKAR_REAL_PAYMENTS_ENABLED/);

console.log("OWNER_EUR1_CHECKOUT_TEST_OK");
