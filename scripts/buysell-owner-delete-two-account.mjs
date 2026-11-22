#!/usr/bin/env node
/**
 * Two-account evidence: owner can delete own test listing; other account cannot.
 * Uses disposable E2E accounts only. No live payment / XLM transfer.
 */
import fs from "node:fs";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

const OUT = "/opt/cursor/artifacts/buysell-owner-delete-two-account.json";

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
  live_payments: false,
  live_xlm_transfer: false,
  accounts: {},
  checks: {},
  listing: {},
  error: null
};

async function main() {
  const secret = JSON.parse(
    fs.readFileSync("/tmp/buysell-two-account.secret", "utf8")
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

  const sellerId = sellerLogin.data.user.id;
  const stamp = Date.now();
  const title = `E2E delete-own listing ${stamp} [safe-to-delete]`;

  const created = await sellerSb
    .from("ads")
    .insert([
      {
        title,
        category: "Other",
        price: 1,
        currency: "EUR",
        location: "Test City",
        description: "Disposable two-account delete test. Safe to remove.",
        user_id: sellerId,
        status: "active",
        listing_surface: "marketplace",
        photos: []
      }
    ])
    .select("id,title,user_id,status,listing_surface")
    .maybeSingle();

  report.listing.create = {
    ok: !created.error && !!created.data,
    id: created.data?.id || null,
    error: created.error?.message || null
  };

  if (!created.data?.id) {
    report.error = created.error?.message || "create failed";
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const adId = created.data.id;

  const sellerPublic = await sellerSb.rpc("get_marketplace_seller_public", {
    p_ad_id: adId
  });
  report.checks.seller_public_rpc = {
    ok: !sellerPublic.error && sellerPublic.data?.ok === true,
    display_name: sellerPublic.data?.seller?.display_name || null,
    has_avatar: !!sellerPublic.data?.seller?.avatar_url,
    error: sellerPublic.error?.message || null
  };

  const buyerDelete = await buyerSb.rpc("delete_own_marketplace_listing", {
    p_ad_id: adId
  });
  report.checks.buyer_cannot_delete = {
    rejected: !!buyerDelete.error,
    error: buyerDelete.error?.message || null,
    data: buyerDelete.data || null
  };

  const stillThere = await sellerSb
    .from("ads")
    .select("id,title,status")
    .eq("id", adId)
    .maybeSingle();
  report.checks.listing_still_present_after_buyer_attempt = {
    ok: !stillThere.error && !!stillThere.data,
    id: stillThere.data?.id || null
  };

  const ownerDelete = await sellerSb.rpc("delete_own_marketplace_listing", {
    p_ad_id: adId
  });
  report.checks.owner_delete = {
    ok: !ownerDelete.error && ownerDelete.data?.ok === true,
    payload: ownerDelete.data || null,
    error: ownerDelete.error?.message || null
  };

  const gone = await sellerSb
    .from("ads")
    .select("id")
    .eq("id", adId)
    .maybeSingle();
  report.checks.listing_gone_from_db = {
    ok: !gone.error && !gone.data,
    data: gone.data || null,
    error: gone.error?.message || null
  };

  const publicList = await buyerSb
    .from("ads")
    .select("id")
    .eq("id", adId)
    .eq("listing_surface", "marketplace")
    .maybeSingle();
  report.checks.listing_gone_from_public_query = {
    ok: !publicList.error && !publicList.data,
    data: publicList.data || null,
    error: publicList.error?.message || null
  };

  report.passed =
    report.checks.buyer_cannot_delete.rejected === true &&
    report.checks.listing_still_present_after_buyer_attempt.ok === true &&
    report.checks.owner_delete.ok === true &&
    report.checks.listing_gone_from_db.ok === true &&
    report.checks.listing_gone_from_public_query.ok === true;

  report.finished_at = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  report.error = String(err && err.message ? err.message : err);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(report.error);
  process.exit(1);
});
