"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261012140000_ads_listing_kind.sql"),
  "utf8"
);
const buySell = fs.readFileSync(path.join(root, "buy-sell.html"), "utf8");
const ads = fs.readFileSync(path.join(root, "ads.html"), "utf8");
const postAd = fs.readFileSync(path.join(root, "post-ad.html"), "utf8");
const details = fs.readFileSync(path.join(root, "ad-details.html"), "utf8");
const saved = fs.readFileSync(path.join(root, "saved.html"), "utf8");
const product = fs.readFileSync(path.join(root, "product.html"), "utf8");
const chat = fs.readFileSync(path.join(root, "chat.html"), "utf8");

assert.ok(migration.includes("SET listing_kind = 'buy_sell'"));
assert.ok(migration.includes("listing kind cannot be changed"));
assert.ok(migration.includes("new listings must use listing kind buy_sell"));
assert.ok(!/DELETE\s+FROM\s+public\.ads/i.test(migration));
assert.ok(!/UPDATE\s+public\.ads\s+SET\s+photos/i.test(migration));
assert.ok(migration.includes("expected 4 ad saves"));
assert.ok(migration.includes("advertisement 8"));

assert.ok(
  buySell.includes('"listing_kind",\n                "buy_sell"')
);
assert.ok(buySell.includes('ad.listing_kind !== "buy_sell"'));
assert.ok(postAd.includes('listing_kind:\n          "buy_sell"'));
assert.ok(ads.includes('"listing_kind",\n                        "commercial"'));
assert.ok(ads.includes('ad.listing_kind !==\n                        "commercial"'));
assert.ok(ads.includes('listing_kind:\n                        "buy_sell"'));
assert.ok(ads.includes("Your listing was published in Buy & Sell."));
assert.ok(!details.includes("listing_kind"));
assert.ok(saved.includes('.from("ads")'));
assert.ok(product.includes('.from("ads")'));
assert.ok(chat.includes('.from("ads")'));
assert.ok(!saved.includes("listing_kind"));
assert.ok(!product.includes("listing_kind"));
assert.ok(!chat.includes("listing_kind"));

function psql(database, sql) {
  return execFileSync(
    "sudo",
    [
      "-u",
      "postgres",
      "psql",
      "-p",
      "5433",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      database
    ],
    {
      input: sql,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"]
    }
  );
}

function recreate(database) {
  psql(
    "postgres",
    "DROP DATABASE IF EXISTS " + database + ";\n" +
      "CREATE DATABASE " + database + ";\n"
  );
  psql(
    database,
    fs.readFileSync(path.join(__dirname, "listing-kind-fixture.sql"), "utf8")
  );
}

recreate("havkar_listing_kind_ok");
psql(
  "havkar_listing_kind_ok",
  "BEGIN;\n" + migration + "\nCOMMIT;\n"
);
psql(
  "havkar_listing_kind_ok",
  fs.readFileSync(path.join(__dirname, "listing-kind-assert.sql"), "utf8")
);

const plan = psql(
  "havkar_listing_kind_ok",
  "SET enable_seqscan = off;\n" +
    "EXPLAIN (FORMAT TEXT) SELECT id FROM public.ads " +
    "WHERE listing_kind = 'buy_sell' " +
    "ORDER BY created_at DESC LIMIT 50;\n"
);
assert.ok(
  plan.includes("ads_listing_kind_created_at_idx"),
  plan
);

recreate("havkar_listing_kind_abort");
psql(
  "havkar_listing_kind_abort",
  "INSERT INTO public.ads (id, title, category, user_id, photos, status) " +
    "VALUES (99, 'Extra', 'Other', " +
    "'11111111-1111-4111-8111-111111111111', '[]', 'active');\n"
);

let aborted = false;
try {
  psql(
    "havkar_listing_kind_abort",
    "BEGIN;\n" + migration + "\nCOMMIT;\n"
  );
} catch (error) {
  aborted = true;
  const output = String(error.stderr || error.stdout || error.message);
  assert.ok(
    output.includes("expected exactly advertisements"),
    output
  );
}
assert.strictEqual(aborted, true);

const unchanged = psql(
  "havkar_listing_kind_abort",
  "SELECT " +
    "(SELECT count(*) FROM information_schema.columns " +
    "  WHERE table_schema = 'public' AND table_name = 'ads' " +
    "    AND column_name = 'listing_kind') AS kind_column, " +
    "(SELECT count(*) FROM public.ads) AS ads, " +
    "(SELECT count(*) FROM public.ad_saves) AS saves, " +
    "(SELECT count(*) FROM public.conversations WHERE ad_id = 8) AS conversations, " +
    "(SELECT photos FROM public.ads WHERE id = 8) AS photo_eight;\n"
);
assert.ok(unchanged.includes("kind_column") && /kind_column\s+\|\s+0|\s0\s+\|\s+9\s+\|\s+4\s+\|\s+1\s+\|/.test(unchanged.replace(/\n/g, " ")), unchanged);
assert.ok(unchanged.includes("data:image/jpeg;base64,PIZZA-MIXER-FIXTURE"));

console.log("LISTING_KIND_TEST_OK");
