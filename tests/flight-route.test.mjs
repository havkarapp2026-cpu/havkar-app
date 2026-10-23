import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "../api/flights.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(directory) {
  const found = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...walk(fullPath));
      continue;
    }

    found.push(path.relative(root, fullPath).split(path.sep).join("/"));
  }

  return found;
}

const functions = walk(path.join(root, "api")).filter((name) =>
  /\.(js|mjs|ts|tsx)$/.test(name)
);
assert.deepEqual(functions.sort(), [
  "api/accommodation-review.js",
  "api/business-application-notify.js",
  "api/create-event-checkout.js",
  "api/eur-usd-quote.js",
  "api/flights.js",
  "api/pi-a2u-testnet.js",
  "api/pi-approve.js",
  "api/stellar-payment.mjs",
  "api/stripe-webhook.js",
  "api/trade-crypto.js",
  "api/translate.js"
]);
assert.ok(functions.length <= 12);
assert.equal(fs.existsSync(path.join(root, "api/payment-isolation.cjs")), true);
assert.equal(fs.existsSync(path.join(root, "api/preview-isolation.cjs")), true);

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
assert.deepEqual(
  vercel.rewrites.filter((item) => String(item.source).includes("flight")),
  [
    {
      source: "/api/flight-offer",
      destination: "/api/flights?havkarFlightRoute=offer"
    },
    {
      source: "/api/flight-order",
      destination: "/api/flights?havkarFlightRoute=order"
    }
  ]
);

const savedEnv = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF
};

function useEnv(env, ref) {
  if (env === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = env;
  }

  if (ref === undefined) {
    delete process.env.VERCEL_GIT_COMMIT_REF;
  } else {
    process.env.VERCEL_GIT_COMMIT_REF = ref;
  }
}

function invoke(req) {
  const result = { headers: {} };

  return handler(req, {
    status(code) {
      result.status = code;
      return this;
    },
    setHeader(name, value) {
      result.headers[name] = value;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    }
  }).then(() => result);
}

useEnv("production", "main");

const offer = await invoke({
  method: "GET",
  url: "/api/flights?havkarFlightRoute=offer",
  query: { havkarFlightRoute: "offer" },
  headers: {}
});
assert.equal(offer.status, 401);
assert.equal(offer.body.error, "Authentication required");

const order = await invoke({
  method: "GET",
  url: "/api/flights?havkarFlightRoute=order",
  query: { havkarFlightRoute: "order" },
  headers: {}
});
assert.equal(order.status, 405);
assert.equal(order.body.error, "Method not allowed. Use POST.");
assert.equal(order.headers.Allow, "POST");

const directOffer = await invoke({
  method: "GET",
  url: "/api/flight-offer?offer_id=off_test",
  query: { offer_id: "off_test" },
  headers: {}
});
assert.equal(directOffer.status, 401);
assert.equal(directOffer.body.error, "Authentication required");

const search = await invoke({
  method: "GET",
  url: "/api/flights",
  query: {},
  headers: {}
});
assert.equal(search.status, 405);
assert.equal(search.body.error, "Method not allowed");
assert.equal(search.headers.Allow, "POST");

useEnv("preview", "cursor/message-receipts-6a44");
for (const route of ["offer", "order", "search"]) {
  const blocked = await invoke({
    method: "POST",
    url: "/api/flights",
    query: route === "search" ? {} : { havkarFlightRoute: route },
    headers: { authorization: "Bearer customer-token" }
  });
  assert.equal(blocked.status, 503, route);
  assert.equal(blocked.body.ok, false);
  assert.equal(blocked.body.error.includes("customer-token"), false);
}

const { default: middleware } = await import("../middleware.js");
useEnv("preview", "cursor/stellar-xlm-payments-6a44");
for (const pathname of ["/api/flights", "/api/flight-offer", "/api/flight-order"]) {
  const response = await middleware(new Request(`https://preview.example${pathname}`));
  assert.equal(response.status, 503, pathname);
  const body = await response.json();
  assert.equal(body.ok, false);
}
assert.equal(
  await middleware(new Request("https://preview.example/api/stellar-payment")),
  undefined
);
useEnv("production", "main");
assert.equal(
  await middleware(new Request("https://preview.example/api/flight-offer")),
  undefined
);

if (savedEnv.VERCEL_ENV === undefined) {
  delete process.env.VERCEL_ENV;
} else {
  process.env.VERCEL_ENV = savedEnv.VERCEL_ENV;
}
if (savedEnv.VERCEL_GIT_COMMIT_REF === undefined) {
  delete process.env.VERCEL_GIT_COMMIT_REF;
} else {
  process.env.VERCEL_GIT_COMMIT_REF = savedEnv.VERCEL_GIT_COMMIT_REF;
}

const stellar = fs.readFileSync(path.join(root, "stellar-wallet-source.js"), "utf8");
assert.match(stellar, /STELLAR_MAINNET_PAYMENTS_ENABLED\s*=\s*false/);
assert.equal(stellar.includes("horizon.stellar.org"), true);
assert.match(stellar, /horizon-testnet\.stellar\.org/);

console.log(`FLIGHT_ROUTE_OK functions=${functions.length}`);
