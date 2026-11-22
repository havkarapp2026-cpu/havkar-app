#!/usr/bin/env node
/**
 * Two-account evidence for cheese-style delete with foreign save dependency.
 * Seller creates listing → buyer saves → seller RPC deletes → both accounts
 * confirm row is gone from ads and public list. No payments.
 */
import fs from "node:fs";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

const OUT = "/opt/cursor/artifacts/buysell-cheese-delete-two-account.json";

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
  accounts: {},
  checks: {},
  listing: {},
  formaggio_16: {},
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

  const formaggio = await buyerSb
    .from("ads")
    .select("id,title,status")
    .eq("id", 16)
    .maybeSingle();
  report.formaggio_16 = {
    buyer_sees: formaggio.data || null,
    buyer_error: formaggio.error?.message || null,
    expected_gone: true
  };

  const stamp = Date.now();
  const title = `پنیر تست حذف ${stamp}`;
  const created = await sellerSb
    .from("ads")
    .insert([
      {
        title,
        category: "Food",
        price: 3,
        currency: "EUR",
        location: "Test City",
        description: "Disposable cheese delete repro. Safe to remove.",
        user_id: report.accounts.seller_id,
        status: "active",
        listing_surface: "marketplace",
        photos: []
      }
    ])
    .select("id,title,user_id,status")
    .maybeSingle();

  report.listing.create = {
    ok: !created.error && !!created.data,
    id: created.data?.id || null,
    title,
    error: created.error?.message || null
  };

  if (!created.data?.id) {
    report.error = created.error?.message || "create failed";
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const adId = created.data.id;

  const saved = await buyerSb
    .from("ad_saves")
    .insert([{ ad_id: adId, user_id: report.accounts.buyer_id }])
    .select("id")
    .maybeSingle();
  report.checks.buyer_save = {
    ok: !saved.error && !!saved.data,
    error: saved.error?.message || null
  };

  const buyerCannot = await buyerSb.rpc("delete_own_marketplace_listing", {
    p_ad_id: adId
  });
  report.checks.buyer_cannot_delete = {
    rejected: !!buyerCannot.error,
    error: buyerCannot.error?.message || null
  };

  const stillAfterBuyer = await sellerSb
    .from("ads")
    .select("id")
    .eq("id", adId)
    .maybeSingle();
  report.checks.still_present_after_buyer = {
    ok: !!stillAfterBuyer.data,
    data: stillAfterBuyer.data || null
  };

  const ownerDelete = await sellerSb.rpc("delete_own_marketplace_listing", {
    p_ad_id: adId
  });
  report.checks.owner_delete = {
    ok: !ownerDelete.error && ownerDelete.data?.ok === true,
    payload: ownerDelete.data || null,
    error: ownerDelete.error?.message || null
  };

  const goneSeller = await sellerSb
    .from("ads")
    .select("id,title")
    .eq("id", adId)
    .maybeSingle();
  const goneBuyer = await buyerSb
    .from("ads")
    .select("id,title")
    .eq("id", adId)
    .maybeSingle();
  const savesLeft = await buyerSb
    .from("ad_saves")
    .select("id")
    .eq("ad_id", adId);

  report.checks.gone_for_seller = {
    ok: !goneSeller.error && !goneSeller.data,
    data: goneSeller.data || null
  };
  report.checks.gone_for_buyer = {
    ok: !goneBuyer.error && !goneBuyer.data,
    data: goneBuyer.data || null
  };
  report.checks.saves_cleared = {
    ok: !savesLeft.error && (savesLeft.data || []).length === 0,
    count: (savesLeft.data || []).length
  };

  const publicList = await buyerSb
    .from("ads")
    .select("id,title")
    .or("listing_surface.is.null,listing_surface.eq.marketplace")
    .order("created_at", { ascending: false })
    .limit(40);
  report.checks.absent_from_public_list = {
    ok:
      !publicList.error &&
      !(publicList.data || []).some((row) => Number(row.id) === Number(adId)),
    titles: (publicList.data || []).map((row) => row.title).slice(0, 20)
  };

  report.passed =
    report.checks.buyer_cannot_delete.rejected === true &&
    report.checks.still_present_after_buyer.ok === true &&
    report.checks.owner_delete.ok === true &&
    report.checks.gone_for_seller.ok === true &&
    report.checks.gone_for_buyer.ok === true &&
    report.checks.saves_cleared.ok === true &&
    report.checks.absent_from_public_list.ok === true &&
    report.formaggio_16.buyer_sees === null;

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
