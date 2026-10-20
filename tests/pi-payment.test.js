const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function mockRes() {
    return {
        statusCode: 0,
        body: null,
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

async function callPi(handler, { url, query, method = "POST", body = {} }) {
    const res = mockRes();
    await handler({ url, query, method, body }, res);
    return res;
}

async function main() {
    const previousFlag = process.env.HAVKAR_PI_PAYMENTS_ENABLED;
    const previousKey = process.env.PI_API_KEY;
    const previousFetch = global.fetch;
    const calls = [];

    global.fetch = async (url, options) => {
        calls.push({ url, options });
        return {
            status: 200,
            async text() {
                return JSON.stringify({ identifier: "payment-1", status: "ok" });
            }
        };
    };

    try {
        const { default: handler } = await import("../api/pi-approve.js");
        const fakeKey = "test-pi-key-not-a-secret";

        delete process.env.HAVKAR_PI_PAYMENTS_ENABLED;
        delete process.env.PI_API_KEY;

        for (const route of [
            { url: "/api/pi-approve", query: {} },
            { url: "/api/pi-complete", query: { piAction: "complete" } }
        ]) {
            const closed = await callPi(handler, {
                ...route,
                body: { paymentId: "pay_1", txid: "tx_1" }
            });
            assert.strictEqual(closed.statusCode, 404);
            assert.deepStrictEqual(closed.body, { error: "Not found" });
        }
        assert.strictEqual(calls.length, 0);

        process.env.HAVKAR_PI_PAYMENTS_ENABLED = "true";

        const wrongMethod = await callPi(handler, {
            url: "/api/pi-approve",
            query: {},
            method: "GET"
        });
        assert.strictEqual(wrongMethod.statusCode, 405);

        const missingPayment = await callPi(handler, {
            url: "/api/pi-approve",
            query: {},
            body: {}
        });
        assert.strictEqual(missingPayment.statusCode, 400);
        assert.strictEqual(missingPayment.body.error, "paymentId is required");

        const missingTxid = await callPi(handler, {
            url: "/api/pi-complete",
            query: { piAction: "complete" },
            body: { paymentId: "pay_1" }
        });
        assert.strictEqual(missingTxid.statusCode, 400);
        assert.strictEqual(missingTxid.body.error, "txid is required");

        const unknownAction = await callPi(handler, {
            url: "/api/pi-approve",
            query: { piAction: "publish" },
            body: { paymentId: "pay_1" }
        });
        assert.strictEqual(unknownAction.statusCode, 400);
        assert.strictEqual(unknownAction.body.error, "Unknown Pi action");
        assert.strictEqual(calls.length, 0);

        const missingKey = await callPi(handler, {
            url: "/api/pi-approve",
            query: {},
            body: { paymentId: "pay_1" }
        });
        assert.strictEqual(missingKey.statusCode, 500);
        assert.strictEqual(missingKey.body.error, "PI_API_KEY is not configured");

        process.env.PI_API_KEY = fakeKey;

        const approved = await callPi(handler, {
            url: "/api/pi-approve",
            query: {},
            body: { paymentId: "pay/1" }
        });
        assert.strictEqual(approved.statusCode, 200);
        assert.strictEqual(
            calls[0].url,
            "https://api.minepi.com/v2/payments/pay%2F1/approve"
        );
        assert.strictEqual(calls[0].options.headers.Authorization, `Key ${fakeKey}`);
        assert.strictEqual(calls[0].options.body, undefined);
        assert.strictEqual(JSON.stringify(approved.body).includes(fakeKey), false);

        const completed = await callPi(handler, {
            url: "/api/pi-approve?piAction=complete",
            query: { piAction: "complete" },
            body: { paymentId: "pay_1", txid: "tx_1" }
        });
        assert.strictEqual(completed.statusCode, 200);
        assert.strictEqual(
            calls[1].url,
            "https://api.minepi.com/v2/payments/pay_1/complete"
        );
        assert.deepStrictEqual(JSON.parse(calls[1].options.body), { txid: "tx_1" });
        assert.strictEqual(JSON.stringify(completed.body).includes(fakeKey), false);

        const completedByPath = await callPi(handler, {
            url: "/api/pi-complete",
            query: {},
            body: { paymentId: "pay_1", txid: "tx_2" }
        });
        assert.strictEqual(
            calls[2].url,
            "https://api.minepi.com/v2/payments/pay_1/complete"
        );
        assert.deepStrictEqual(JSON.parse(calls[2].options.body), { txid: "tx_2" });
        assert.strictEqual(completedByPath.statusCode, 200);

        global.fetch = async () => ({
            status: 422,
            async text() {
                return "not-json";
            }
        });
        const invalidPi = await callPi(handler, {
            url: "/api/pi-approve",
            query: {},
            body: { paymentId: "pay_1" }
        });
        assert.strictEqual(invalidPi.statusCode, 422);
        assert.deepStrictEqual(invalidPi.body, { error: "not-json" });

        global.fetch = async () => {
            throw new Error("upstream failed");
        };
        const logged = [];
        const previousError = console.error;
        console.error = (...args) => logged.push(args.map(String).join(" "));
        let upstream;
        try {
            upstream = await callPi(handler, {
                url: "/api/pi-approve",
                query: {},
                body: { paymentId: "pay_1" }
            });
        } finally {
            console.error = previousError;
        }
        assert.strictEqual(upstream.statusCode, 500);
        assert.deepStrictEqual(upstream.body, { error: "Internal server error" });
        assert.strictEqual(JSON.stringify(upstream.body).includes(fakeKey), false);
        assert.strictEqual(logged.some((line) => line.includes("Pi approval error:")), true);
        assert.strictEqual(logged.some((line) => line.includes(fakeKey)), false);
    } finally {
        global.fetch = previousFetch;
        if (previousFlag === undefined) {
            delete process.env.HAVKAR_PI_PAYMENTS_ENABLED;
        } else {
            process.env.HAVKAR_PI_PAYMENTS_ENABLED = previousFlag;
        }
        if (previousKey === undefined) {
            delete process.env.PI_API_KEY;
        } else {
            process.env.PI_API_KEY = previousKey;
        }
    }

    const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
    assert.deepStrictEqual(vercel.rewrites, [
        {
            source: "/api/pi-complete",
            destination: "/api/pi-approve?piAction=complete"
        },
        {
            source: "/api/flight-offer",
            destination: "/api/flights?flightAction=offer"
        },
        {
            source: "/api/stellar-ticket-intent",
            destination: "/api/stellar-ticket?stellarAction=intent"
        },
        {
            source: "/api/stellar-ticket-prepare",
            destination: "/api/stellar-ticket?stellarAction=prepare"
        },
        {
            source: "/api/stellar-ticket-submit",
            destination: "/api/stellar-ticket?stellarAction=submit"
        },
        {
            source: "/api/stellar-ticket-status",
            destination: "/api/stellar-ticket?stellarAction=status"
        }
    ]);
    assert.strictEqual(JSON.stringify(vercel).includes("/api/:path*"), false);

    const apiFiles = fs.readdirSync(path.join(root, "api"))
        .filter((name) => name.endsWith(".js"));
    assert.strictEqual(apiFiles.includes("pi-complete.js"), false);
    assert.strictEqual(apiFiles.includes("pi-approve.js"), true);
    assert.ok(apiFiles.length <= 12, `expected at most 12 functions, found ${apiFiles.length}`);
    assert.strictEqual(apiFiles.length, 12);

    const preserved = [
        "accommodation-review.js",
        "stripe-webhook.js",
        "create-event-checkout.js",
        "trade-crypto.js",
        "translate.js",
        "business-application-notify.js",
        "eur-usd-quote.js",
        "flights.js",
        "flight-order.js",
        "pi-a2u-testnet.js",
        "stellar-ticket.js"
    ];
    assert.strictEqual(apiFiles.includes("flight-offer.js"), false);
    assert.strictEqual(apiFiles.includes("stellar-ticket-intent.js"), false);
    assert.strictEqual(apiFiles.includes("stellar-ticket-prepare.js"), false);
    assert.strictEqual(apiFiles.includes("stellar-ticket-submit.js"), false);
    assert.strictEqual(apiFiles.includes("stellar-ticket-status.js"), false);
    for (const name of preserved) {
        assert.strictEqual(apiFiles.includes(name), true, name);
    }

    const wallet = fs.readFileSync(path.join(root, "wallet.html"), "utf8");
    assert.ok(wallet.includes('"/api/pi-approve"'));
    assert.ok(wallet.includes('"/api/pi-complete"'));

    for (const file of fs.readdirSync(root).filter((name) => name.endsWith(".html"))) {
        const html = fs.readFileSync(path.join(root, file), "utf8");
        assert.strictEqual(html.includes("PI_API_KEY"), false, file);
    }

    const reviewApi = fs.readFileSync(path.join(root, "api/accommodation-review.js"), "utf8");
    assert.match(reviewApi, /identityVerified:\s*false/);
    assert.strictEqual(fs.existsSync(path.join(root, "accommodation.html")), true);

    const approveSource = fs.readFileSync(path.join(root, "api/pi-approve.js"), "utf8");
    assert.strictEqual(
        approveSource.includes('process.env.HAVKAR_PI_PAYMENTS_ENABLED !== "true"'),
        true
    );

    console.log(`PI_PAYMENT_TEST_OK functions=${apiFiles.length}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
