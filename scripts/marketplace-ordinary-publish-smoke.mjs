#!/usr/bin/env node
/**
 * Live smoke: ordinary authenticated user can publish a free marketplace listing.
 * Does not touch Stripe Live or create payments.
 *
 * Required env:
 *   HAVKAR_SMOKE_EMAIL
 *   HAVKAR_SMOKE_PASSWORD
 * Optional:
 *   HAVKAR_SUPABASE_URL (default production project)
 *   HAVKAR_SUPABASE_PUBLISHABLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const configText = fs.readFileSync(
  path.join(root, "havkar-supabase-config.js"),
  "utf8"
);
const urlMatch = configText.match(/url:\s*"([^"]+)"/);
const keyMatch = configText.match(/publishableKey:\s*"([^"]+)"/);

const SUPABASE_URL =
  process.env.HAVKAR_SUPABASE_URL || (urlMatch && urlMatch[1]);
const PUBLISHABLE_KEY =
  process.env.HAVKAR_SUPABASE_PUBLISHABLE_KEY || (keyMatch && keyMatch[1]);
const EMAIL = process.env.HAVKAR_SMOKE_EMAIL;
const PASSWORD = process.env.HAVKAR_SMOKE_PASSWORD;

function fail(message) {
  console.error("MARKETPLACE_ORDINARY_PUBLISH_SMOKE_FAIL:", message);
  process.exit(1);
}

if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
  fail("missing Supabase URL or publishable key");
}

if (!EMAIL || !PASSWORD) {
  fail("set HAVKAR_SMOKE_EMAIL and HAVKAR_SMOKE_PASSWORD");
}

async function api(pathname, options = {}) {
  const response = await fetch(SUPABASE_URL + pathname, options);
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body };
}

const login = await api("/auth/v1/token?grant_type=password", {
  method: "POST",
  headers: {
    apikey: PUBLISHABLE_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD })
});

if (!login.response.ok || !login.body?.access_token || !login.body?.user?.id) {
  fail("login failed: " + JSON.stringify(login.body));
}

const access = login.body.access_token;
const userId = login.body.user.id;
const marker = "HAVKAR-SMOKE-" + Date.now();

const insert = await api("/rest/v1/ads", {
  method: "POST",
  headers: {
    apikey: PUBLISHABLE_KEY,
    Authorization: "Bearer " + access,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  },
  body: JSON.stringify({
    title: marker,
    category: "Electronics",
    price: 11.5,
    currency: "EUR",
    location: "Milan, Italy",
    country_code: "IT",
    city: "Milan",
    description: "Ordinary-user free marketplace smoke listing",
    photos: "[]",
    user_id: userId,
    status: "active",
    listing_surface: "marketplace"
  })
});

if (!insert.response.ok || !Array.isArray(insert.body) || !insert.body[0]?.id) {
  fail("marketplace insert failed: " + JSON.stringify(insert.body));
}

const createdId = insert.body[0].id;

const advertising = await api("/rest/v1/ads", {
  method: "POST",
  headers: {
    apikey: PUBLISHABLE_KEY,
    Authorization: "Bearer " + access,
    "Content-Type": "application/json",
    Prefer: "return=minimal"
  },
  body: JSON.stringify({
    title: marker + "-ads",
    category: "Services",
    price: 1,
    currency: "EUR",
    location: "Milan",
    country_code: "IT",
    city: "Milan",
    description: "Should be blocked",
    photos: "[]",
    user_id: userId,
    status: "pending_review",
    listing_surface: "advertising"
  })
});

if (advertising.response.ok) {
  fail("ordinary user was allowed to insert Business Ads");
}

const publicView = await api(
  "/rest/v1/ads?select=id,title,listing_surface,status&id=eq." + createdId,
  {
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: "Bearer " + PUBLISHABLE_KEY
    }
  }
);

if (
  !publicView.response.ok ||
  !Array.isArray(publicView.body) ||
  publicView.body[0]?.title !== marker ||
  publicView.body[0]?.listing_surface !== "marketplace"
) {
  fail("public Explore select missing published marketplace listing");
}

const edit = await api("/rest/v1/ads?id=eq." + createdId, {
  method: "PATCH",
  headers: {
    apikey: PUBLISHABLE_KEY,
    Authorization: "Bearer " + access,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  },
  body: JSON.stringify({ title: marker + "-edited" })
});

if (!edit.response.ok || edit.body?.[0]?.title !== marker + "-edited") {
  fail("owner edit failed: " + JSON.stringify(edit.body));
}

const del = await api("/rest/v1/ads?id=eq." + createdId, {
  method: "DELETE",
  headers: {
    apikey: PUBLISHABLE_KEY,
    Authorization: "Bearer " + access,
    Prefer: "return=representation"
  }
});

if (!del.response.ok) {
  fail("owner delete failed: " + JSON.stringify(del.body));
}

console.log(
  JSON.stringify({
    ok: true,
    userId,
    createdId,
    advertisingBlocked: true,
    feesPreservedHint: "buyer 2% seller 3% publication free"
  })
);
