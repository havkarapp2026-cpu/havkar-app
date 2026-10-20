const assert = require("assert");
const fs = require("fs");
const path = require("path");

function response() {
    return {
        statusCode: 0,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

async function main() {
    const root = path.join(__dirname, "..");
    const apiFiles = fs.readdirSync(path.join(root, "api")).filter((name) => name.endsWith(".js"));
    assert.deepStrictEqual(apiFiles.slice().sort(), [
        "accommodation-review.js",
        "business-application-notify.js",
        "create-event-checkout.js",
        "eur-usd-quote.js",
        "flight-order.js",
        "flights.js",
        "pi-a2u-testnet.js",
        "pi-approve.js",
        "stellar-ticket.js",
        "stripe-webhook.js",
        "trade-crypto.js",
        "translate.js"
    ]);

    const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    const rewriteSources = vercel.rewrites.map((rule) => rule.source);
    assert.deepStrictEqual(rewriteSources, [
        "/api/pi-complete",
        "/api/flight-offer",
        "/api/stellar-ticket-intent",
        "/api/stellar-ticket-prepare",
        "/api/stellar-ticket-submit",
        "/api/stellar-ticket-status"
    ]);
    assert.strictEqual(JSON.stringify(vercel).includes("/api/:path*"), false);

    const events = fs.readFileSync(path.join(root, "events.html"), "utf8");
    assert.ok(events.includes('"/api/create-event-checkout"'));
    assert.ok(events.includes('"/api/stellar-ticket-intent"'));
    assert.ok(events.includes('"/api/stellar-ticket-prepare"'));
    assert.ok(events.includes('"/api/stellar-ticket-submit"'));

    const stripeWebhook = fs.readFileSync(path.join(root, "api/stripe-webhook.js"), "utf8");
    assert.ok(stripeWebhook.includes("bodyParser: false"));
    assert.ok(stripeWebhook.includes("STRIPE_WEBHOOK_SECRET"));

    const checkout = fs.readFileSync(path.join(root, "api/create-event-checkout.js"), "utf8");
    assert.ok(checkout.includes("new Stripe"));
    assert.equal(checkout.includes("stellar-ticket"), false);
    assert.equal(checkout.includes("flightOfferHandler"), false);

    const { default: flights, } = await import("../api/flights.js");
    const { default: stellar, stellarRoute } = await import("../api/stellar-ticket.js");

    assert.strictEqual(stellarRoute({ url: "/api/stellar-ticket-submit?stellarAction=intent", query: { stellarAction: "intent" } }), "submit");
    assert.strictEqual(stellarRoute({ url: "/api/stellar-ticket?stellarAction=prepare", query: { stellarAction: "prepare" } }), "prepare");
    assert.strictEqual(stellarRoute({ url: "/api/stellar-ticket", query: {}, body: { stellarAction: "submit" } }), "");

    const missing = response();
    await stellar({ method: "POST", url: "/api/stellar-ticket", query: {}, headers: {} }, missing);
    assert.strictEqual(missing.statusCode, 404);

    const statusOnPost = response();
    await stellar({ method: "POST", url: "/api/stellar-ticket-status", query: { stellarAction: "intent" }, headers: {} }, statusOnPost);
    assert.strictEqual(statusOnPost.statusCode, 405);

    const intentOnGet = response();
    await stellar({ method: "GET", url: "/api/stellar-ticket?stellarAction=intent", query: { stellarAction: "intent" }, headers: {} }, intentOnGet);
    assert.strictEqual(intentOnGet.statusCode, 405);

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const statusRead = response();
    await stellar({ method: "GET", url: "/api/stellar-ticket-status", query: {}, headers: {} }, statusRead);
    assert.strictEqual(statusRead.statusCode, 500);
    assert.strictEqual(statusRead.body.error, "Server configuration error");

    const searchGet = response();
    await flights({ method: "GET", url: "/api/flights", query: {}, headers: {} }, searchGet);
    assert.strictEqual(searchGet.statusCode, 405);

    const offerGet = response();
    await flights({ method: "GET", url: "/api/flight-offer", query: {}, headers: {} }, offerGet);
    assert.strictEqual(offerGet.statusCode, 401);

    const offerRewrite = response();
    await flights({ method: "GET", url: "/api/flights?flightAction=offer", query: { flightAction: "offer" }, headers: {} }, offerRewrite);
    assert.strictEqual(offerRewrite.statusCode, 401);

    const searchPost = response();
    await flights({ method: "POST", url: "/api/flights", query: {}, headers: {}, body: {} }, searchPost);
    assert.strictEqual(searchPost.statusCode, 401);

    const unknownFlight = response();
    await flights({ method: "POST", url: "/api/flights?flightAction=order", query: { flightAction: "order" }, headers: {} }, unknownFlight);
    assert.strictEqual(unknownFlight.statusCode, 404);

    const offerPost = response();
    await flights({ method: "POST", url: "/api/flights?flightAction=offer", query: { flightAction: "offer" }, headers: {}, body: {} }, offerPost);
    assert.strictEqual(offerPost.statusCode, 401);

    console.log("SERVERLESS_ROUTING_TEST_OK");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
