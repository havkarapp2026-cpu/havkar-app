import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUSINESS_CATEGORIES,
  RESERVED_SLUGS,
  buildPageWrite,
  parseMenuText,
  renderPublicPage
} from "../js/business-catalog.mjs";
import { qrMatrix, qrSvg } from "../js/havkar-qr.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

const migration = read("supabase/migrations/20261015190000_business_public_pages.sql");
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";

const codes = BUSINESS_CATEGORIES.map((category) => category.code);
assert.ok(codes.includes("restaurant"));
assert.ok(codes.includes("factory"));
assert.ok(codes.includes("nonprofit"));
assert.ok(codes.includes("other"));
assert.ok(codes.length >= 8);
for (const code of codes) {
  assert.match(migration, new RegExp("'" + code + "'"));
}
for (const slug of RESERVED_SLUGS) {
  assert.match(migration, new RegExp("'" + slug + "'"));
}

assert.match(migration, /Do not apply this file to production/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /business_menu_items_page_position/);
assert.match(migration, /business_menu_items_page_number/);
assert.match(migration, /p_characters > 6000/);
assert.match(migration, /display text/i);
assert.doesNotMatch(migration, /payment_activation|establish_initial_owner|mainnet/i);

const pizzas = Array.from({ length: 60 }, (_, index) => ({
  name: "Pizza " + String(index + 1).padStart(2, "0"),
  details: index === 0 ? "Tomato and mozzarella" : "",
  priceLabel: index % 2 === 0 ? "12 EUR" : ""
}));
const reversedPrefixes = pizzas.map((item, index) => {
  const parts = [(60 - index) + ". " + item.name];
  if (item.details) {
    parts.push(item.details);
  }
  if (item.priceLabel) {
    parts.push(item.priceLabel);
  }
  return parts.join(" | ");
}).join("\n");
const parsed = parseMenuText(reversedPrefixes);
assert.equal(parsed.ok, true);
assert.equal(parsed.items.length, 60);
assert.deepEqual(parsed.items.map((item) => item.itemNumber), Array.from({ length: 60 }, (_, index) => index + 1));
assert.equal(parsed.items[0].name, "Pizza 01");
assert.equal(parsed.items[59].name, "Pizza 60");

const page = buildPageWrite({
  ownerId: owner,
  slug: "pizza-house",
  displayName: "Pizza <House>",
  categoryCode: "restaurant",
  summary: "Sixty pizzas",
  description: "Baked to order",
  published: true,
  menu: parsed.items,
  services: [{ title: "Delivery", details: "Local", priceLabel: "3 EUR" }],
  products: [{ title: "Olive oil", details: "", priceLabel: "" }],
  sections: [{ title: "Hours", body: "12:00 to 23:00" }]
});
assert.equal(page.ok, true);
assert.equal(page.menu.length, 60);
const html = renderPublicPage({
  page: { ...page.page, published: true },
  menu: page.menu.map((item) => ({
    position: item.position,
    item_number: item.itemNumber,
    name: item.name,
    details: item.details,
    price_label: item.priceLabel
  })),
  services: page.services,
  products: page.products,
  sections: page.sections,
  images: []
});
assert.match(html, /Pizza &lt;House&gt;/);
assert.match(html, /<li value="1"><strong>Pizza 01<\/strong>/);
assert.match(html, /<li value="60"><strong>Pizza 60<\/strong>/);
assert.ok(html.indexOf('value="1"') < html.indexOf('value="60"'));
assert.match(html, /does not take a payment/);
assert.equal(renderPublicPage({ page: { ...page.page, published: false }, menu: page.menu }), "");
assert.equal(buildPageWrite({
  ownerId: owner,
  slug: "wallet",
  displayName: "Nope",
  categoryCode: "factory"
}).ok, false);
assert.equal(buildPageWrite({
  ownerId: owner,
  slug: "mill",
  displayName: "Mill",
  categoryCode: "not-a-category"
}).ok, false);

const samples = [
  "Hello",
  "https://havkar-app.vercel.app/business.html?slug=pizza-house",
  "menu-60-" + "pizza-".repeat(30)
];
const expected = JSON.parse(execFileSync("python3", ["-c", `
import json, sys
import qrcode
from qrcode.constants import ERROR_CORRECT_M
samples = json.loads(sys.argv[1])
out = {}
for text in samples:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, border=0)
    qr.add_data(text)
    qr.make(fit=True)
    out[text] = [[1 if cell else 0 for cell in row] for row in qr.get_matrix()]
print(json.dumps(out))
`, JSON.stringify(samples)], { encoding: "utf8" }));
for (const text of samples) {
  assert.deepEqual(qrMatrix(text), expected[text], text);
}
const svg = qrSvg(samples[1], { color: "#2e7d32" });
assert.match(svg, /fill="#2e7d32"/);
assert.doesNotMatch(svg, /<script/i);

for (const name of fs.readdirSync(root).filter((entry) => entry.endsWith(".html"))) {
  const text = read(name);
  assert.match(text, /rel="icon"/, name);
  assert.match(text, /icon\.png/, name);
}
assert.match(read("index.html"), /assets\/home\/header\.png/);
assert.match(read("profile.html"), /href="business-studio\.html"/);
assert.match(read("havkar-ai.html"), /value="menu"/);
assert.match(read("business.html"), /business_menu_items/);
assert.doesNotMatch(read("business-studio.html"), /service_role|payment_activation/);
assert.match(read("mobile/www/index.html"), /rel="icon"/);

const database = "havkar_business_pages_test";
const values = parsed.items.map((item) => `(${item.position}, ${item.itemNumber}, '${item.name}', '${item.details}', '${item.priceLabel}')`).join(",\n");
const script = `
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
\\i '${path.join(root, "supabase/migrations/20261013180000_ai_assistant_budget.sql")}'
\\i '${path.join(root, "supabase/migrations/20261015190000_business_public_pages.sql")}'
INSERT INTO auth.users (id) VALUES ('${owner}'), ('${other}');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${owner}', false);
INSERT INTO public.business_pages (owner_id, slug, display_name, category_code, summary, description, published)
VALUES ('${owner}', 'pizza-house', 'Pizza House', 'restaurant', 'Sixty pizzas', 'Baked to order', true);
INSERT INTO public.business_menu_items (page_id, position, item_number, name, details, price_label)
SELECT page.id, item.position, item.item_number, item.name, item.details, item.price_label
FROM public.business_pages AS page
JOIN (VALUES
${values}
) AS item(position, item_number, name, details, price_label) ON true
WHERE page.slug = 'pizza-house';
INSERT INTO public.business_pages (owner_id, slug, display_name, category_code, published)
VALUES ('${owner}', 'north-mill', 'North Mill', 'factory', false);
RESET ROLE;
SELECT count(*) = 60 AND min(item_number) = 1 AND max(item_number) = 60
  FROM public.business_menu_items;
SET ROLE anon;
SELECT count(*) FROM public.business_menu_items;
SELECT count(*) FROM public.business_pages;
SELECT display_name FROM public.business_pages ORDER BY slug;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '${other}', false);
UPDATE public.business_pages SET display_name = 'Taken' WHERE slug = 'pizza-house';
RESET ROLE;
SELECT display_name FROM public.business_pages WHERE slug = 'pizza-house';
SELECT allowed FROM public.consume_ai_budget('${owner}'::uuid, 6000);
`;

execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${database}`], { encoding: "utf8" });
execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${database}`], { encoding: "utf8" });
const scriptPath = path.join(os.tmpdir(), "havkar-business-pages-test.sql");
fs.writeFileSync(scriptPath, script);
try {
  const output = execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", scriptPath], { encoding: "utf8" });
  assert.match(output, /t\n/);
  assert.match(output, /Pizza House/);
  assert.doesNotMatch(output, /North Mill/);
  assert.match(output, /\n\s*60\n/);
  let rejected = false;
  try {
    execFileSync("sudo", ["-u", "postgres", "psql", "-d", database, "-c", `SELECT public.consume_ai_budget('${owner}'::uuid, 6001);`], { encoding: "utf8" });
  } catch (error) {
    rejected = String(error.stderr || "").includes("invalid assistant budget request");
  }
  assert.equal(rejected, true);
} finally {
  execFileSync("sudo", ["-u", "postgres", "psql", "-c", `DROP DATABASE IF EXISTS ${database};`], { encoding: "utf8" });
  fs.rmSync(scriptPath, { force: true });
}

console.log("BUSINESS_PAGES_TEST_OK");
