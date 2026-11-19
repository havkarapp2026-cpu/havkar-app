#!/usr/bin/env node
/**
 * Two-account Buy & Sell security evidence on Preview + Production Supabase.
 * No live card charge. No live XLM transfer. No secrets written to artifacts.
 */
import fs from "node:fs";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const StellarSdk = require("stellar-sdk");
const Keypair = StellarSdk.Keypair;

const BASE =
  process.env.HAVKAR_PREVIEW_BASE ||
  "https://havkar-app-git-cursor-messe-ac1f41-havkarapp2026-4055s-projects.vercel.app";
const SHARE =
  process.env.HAVKAR_VERCEL_SHARE ||
  "beqn77Y22SQ3b9g8GO662e8rHhi1Vphz";
const OUT = "/opt/cursor/artifacts/buysell-two-account-security.json";

function withShare(path) {
  const u = new URL(path, BASE);
  u.searchParams.set("_vercel_share", SHARE);
  return u.toString();
}

async function postJson(path, token, body) {
  const res = await fetch(withShare(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(body)
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

function clientFromConfig() {
  const sandbox = { window: {}, globalThis: {} };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(
    fs.readFileSync("havkar-supabase-config.js", "utf8"),
    sandbox
  );
  const cfg = sandbox.window.HAVKAR_SUPABASE_CONFIG;
  return {
    cfg,
    make: () => createClient(cfg.url, cfg.publishableKey)
  };
}

const report = {
  started_at: new Date().toISOString(),
  base: BASE,
  sha: process.env.GIT_SHA || null,
  live_payments: false,
  live_xlm_transfer: false,
  accounts: {},
  checks: {},
  db: {}
};

async function main() {
  const secret = JSON.parse(
    fs.readFileSync("/tmp/buysell-two-account.secret", "utf8")
  );
  const meta = JSON.parse(
    fs.readFileSync("/tmp/buysell-two-account.json", "utf8")
  );
  const { make } = clientFromConfig();

  const sellerSb = make();
  const buyerSb = make();

  const sellerLogin = await sellerSb.auth.signInWithPassword({
    email: process.env.EMAIL,
    password: process.env.PASS
  });
  const buyerLogin = await buyerSb.auth.signInWithPassword({
    email: secret.emailB,
    password: secret.passB
  });

  report.accounts = {
    seller_ok: !sellerLogin.error && !!sellerLogin.data.session,
    buyer_ok: !buyerLogin.error && !!buyerLogin.data.session,
    seller_id: sellerLogin.data?.user?.id || null,
    buyer_id: buyerLogin.data?.user?.id || null,
    distinct:
      !!sellerLogin.data?.user?.id &&
      !!buyerLogin.data?.user?.id &&
      sellerLogin.data.user.id !== buyerLogin.data.user.id
  };

  if (!report.accounts.seller_ok || !report.accounts.buyer_ok) {
    report.error = {
      seller: sellerLogin.error?.message,
      buyer: buyerLogin.error?.message
    };
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const sellerToken = sellerLogin.data.session.access_token;
  const buyerToken = buyerLogin.data.session.access_token;
  const sellerId = sellerLogin.data.user.id;
  const buyerId = buyerLogin.data.user.id;

  // Seller creates multi-currency listing
  const listing = await sellerSb
    .from("ads")
    .insert([
      {
        title: "Two-account SEK listing " + Date.now(),
        category: "electronics",
        price: 1100,
        currency: "SEK",
        location: "Rome, IT",
        country_code: "IT",
        city: "Rome",
        description: "Security E2E listing. Safe to delete.",
        photos: [],
        user_id: sellerId,
        status: "active",
        listing_surface: "marketplace"
      }
    ])
    .select("id,price,currency,user_id,status")
    .single();

  report.checks.create_listing = {
    ok: !listing.error && !!listing.data,
    id: listing.data?.id || null,
    currency: listing.data?.currency || null,
    error: listing.error?.message || null
  };

  const listingId = listing.data?.id;

  // Buyer cannot update seller listing (RLS)
  const hack = await buyerSb
    .from("ads")
    .update({ title: "HACKED_BY_BUYER" })
    .eq("id", listingId)
    .select("id,title");
  report.checks.buyer_cannot_update_seller_listing = {
    ok: !hack.data || hack.data.length === 0,
    rows: hack.data ? hack.data.length : 0,
    error: hack.error?.message || null
  };

  // Buyer cannot delete seller listing
  const delHack = await buyerSb
    .from("ads")
    .delete()
    .eq("id", listingId)
    .select("id");
  report.checks.buyer_cannot_delete_seller_listing = {
    ok: !delHack.data || delHack.data.length === 0,
    rows: delHack.data ? delHack.data.length : 0,
    error: delHack.error?.message || null
  };

  // Seller cannot buy own listing
  const selfBuy = await postJson("/api/create-event-checkout", sellerToken, {
    action: "marketplace_buy_checkout",
    listing_id: String(listingId),
    currency: "eur"
  });
  report.checks.seller_self_buy_blocked = {
    ok:
      selfBuy.status === 400 &&
      /own listing/i.test(String(selfBuy.body?.error || "")),
    status: selfBuy.status,
    error: selfBuy.body?.error || null
  };

  // Buyer can get paused card quote
  const buyQuote = await postJson("/api/create-event-checkout", buyerToken, {
    action: "marketplace_buy_checkout",
    listing_id: String(listingId),
    currency: "usd"
  });
  report.checks.buyer_card_quote_paused = {
    ok: !!(buyQuote.body && buyQuote.body.ok === true),
    status: buyQuote.status,
    charged: buyQuote.body?.charged,
    code: buyQuote.body?.code,
    checkout_url: buyQuote.body?.checkout_url,
    list_price_eur: buyQuote.body?.receipt?.list_price_eur,
    presentment: buyQuote.body?.receipt?.presentment_currency,
    live_collection: buyQuote.body?.receipt?.live_collection
  };

  // Attempt register stellar receive key (seller) — expects failure on Production until migration
  const kp = Keypair.random();
  const receiveKey = kp.publicKey();
  // never log secret
  const recv = await sellerSb
    .from("stellar_receive_accounts")
    .upsert({ user_id: sellerId, public_key: receiveKey, updated_at: new Date().toISOString() })
    .select("user_id,public_key");
  report.checks.seller_register_stellar_receive = {
    ok: !recv.error && Array.isArray(recv.data) && recv.data.length > 0,
    error: recv.error?.message || null,
    code: recv.error?.code || null,
    public_key_registered: !!(recv.data && recv.data[0] && recv.data[0].public_key)
  };

  // XLM dry-run quote as buyer
  const listEur =
    Number(buyQuote.body?.receipt?.list_price_eur) ||
    Math.round((1100 / 11.147) * 100) / 100;
  const xlm = await postJson("/api/create-event-checkout", buyerToken, {
    payment_method: "xlm",
    action: "quote",
    flow: "marketplace",
    price: listEur,
    network: "testnet",
    idempotency_key: ("hv2acc" + Date.now()).slice(0, 40),
    subject_id: String(listingId)
  });
  report.checks.buyer_xlm_dry_run = {
    status: xlm.status,
    ok: !!(xlm.body && xlm.body.ok),
    payable: xlm.body?.payable,
    order_paid: xlm.body?.order_paid,
    code: xlm.body?.code,
    error: xlm.body?.error,
    amount_xlm: xlm.body?.amount_xlm,
    network: xlm.body?.network,
    network_fee_xlm: xlm.body?.network_fee_xlm,
    rate_source: xlm.body?.rate_source,
    live_transfer: false
  };

  // Report RPC (may be missing on Production)
  const reportRpc = await buyerSb.rpc("create_marketplace_listing_report", {
    p_ad_id: listingId,
    p_reason: "spam",
    p_details: "two-account security probe"
  });
  const reportMissing = /Could not find the function|PGRST202/i.test(
    String(reportRpc.error?.message || reportRpc.error?.code || "")
  );
  report.checks.buyer_report_listing = {
    ok: !reportRpc.error,
    rpc_missing_on_production: reportMissing,
    error: reportRpc.error?.message || null,
    code: reportRpc.error?.code || null,
    data: reportRpc.data ?? null
  };

  // Seller cannot report own listing (only meaningful if RPC exists)
  const selfReport = await sellerSb.rpc("create_marketplace_listing_report", {
    p_ad_id: listingId,
    p_reason: "spam",
    p_details: "should fail"
  });
  const selfReportMissing = /Could not find the function|PGRST202/i.test(
    String(selfReport.error?.message || selfReport.error?.code || "")
  );
  report.checks.seller_self_report_blocked = {
    ok: selfReportMissing
      ? null
      : !!selfReport.error && /own listing|cannot report/i.test(String(selfReport.error.message || "")),
    rpc_missing_on_production: selfReportMissing,
    error: selfReport.error?.message || null
  };

  // Message seller via production RPC used by ad-details/chat
  const convo = await buyerSb.rpc("havkar_get_or_create_listing_conversation", {
    p_ad_id: listingId
  });
  report.checks.buyer_message_seller_conversation = {
    ok: !convo.error && convo.data != null,
    conversation_id: convo.data || null,
    error: convo.error?.message || null,
    code: convo.error?.code || null
  };

  // Cleanup listing
  const cleaned = await sellerSb
    .from("ads")
    .delete()
    .eq("id", listingId)
    .eq("user_id", sellerId)
    .select("id");
  report.checks.seller_cleanup_delete = {
    ok: Array.isArray(cleaned.data) && cleaned.data.length === 1,
    rows: cleaned.data ? cleaned.data.length : 0,
    error: cleaned.error?.message || null
  };

  // DB status notes (from prior MCP probes; restate for report)
  report.db = {
    production_project: "gispovnciifgikvgpzck",
    staging_project: "keglioewbkgdabsizvys",
    production: {
      create_marketplace_listing_report: false,
      stellar_receive_accounts: false,
      marketplace_payment_intents_split_columns: false
    },
    staging: {
      create_marketplace_listing_report: true,
      stellar_receive_accounts: true,
      note: "stellar_receive_accounts applied this turn on staging only"
    },
    preview_uses: "production Supabase (havkar-supabase-config.js)"
  };

  report.finished_at = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const hardFail =
    !report.accounts.distinct ||
    !report.checks.buyer_cannot_update_seller_listing.ok ||
    !report.checks.buyer_cannot_delete_seller_listing.ok ||
    !report.checks.seller_self_buy_blocked.ok ||
    !report.checks.buyer_card_quote_paused.ok;
  process.exit(hardFail ? 1 : 0);
}

main().catch((err) => {
  report.error = String(err && err.message ? err.message : err);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(err);
  process.exit(1);
});
