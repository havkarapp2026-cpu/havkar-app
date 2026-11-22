#!/usr/bin/env node
/**
 * Buy & Sell multi-currency + XLM dry-run evidence against Preview.
 * Does NOT charge cards or transfer live XLM.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BASE =
  process.env.HAVKAR_PREVIEW_BASE ||
  "https://havkar-app-git-cursor-messe-ac1f41-havkarapp2026-4055s-projects.vercel.app";
const SHARE =
  process.env.HAVKAR_VERCEL_SHARE ||
  "beqn77Y22SQ3b9g8GO662e8rHhi1Vphz";
const OUT = "/opt/cursor/artifacts/buysell-currency-e2e.json";

function withShare(path) {
  const u = new URL(path, BASE);
  u.searchParams.set("_vercel_share", SHARE);
  return u.toString();
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { res, body, status: res.status };
}

const report = {
  started_at: new Date().toISOString(),
  base: BASE,
  sha_hint: process.env.GIT_SHA || null,
  checks: {},
  currencies_tested: [],
  two_accounts: "BLOCKED_only_one_login_secret",
  live_payments: false,
  live_xlm_transfer: false
};

async function main() {
  // 1) Matrix + FX
  const matrix = await getJson(withShare("/api/currency-matrix"));
  const currencies = (matrix.body && matrix.body.matrix && matrix.body.matrix.currencies) || [];
  const fx = (matrix.body && matrix.body.fx) || {};
  report.checks.currency_matrix = {
    ok: matrix.status === 200 && matrix.body && matrix.body.ok === true,
    status: matrix.status,
    presentment_count: currencies.length,
    live_collection: matrix.body && matrix.body.live_collection,
    fx_source: fx.source || matrix.body.fx_source || null,
    fx_date: fx.date || matrix.body.fx_date || null,
    fx_rates_count: fx.rates ? Object.keys(fx.rates).length : 0,
    coverage: fx.coverage || null
  };

  // 2) Quotes for sample currencies
  const samples = ["eur", "usd", "sek", "jpy", "gbp", "irr"];
  for (const code of samples) {
    const q = await getJson(withShare("/api/currency-matrix?action=currency_quote"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "currency_quote",
        currency: code,
        list_price_eur: 100
      })
    });
    const row = currencies.find((c) => String(c.code).toLowerCase() === code);
    const quote = q.body && q.body.quote;
    const entry = {
      code: code.toUpperCase(),
      http: q.status,
      ok: !!(q.body && q.body.ok && quote),
      checkout_allowed: row ? row.checkout_allowed !== false : null,
      buyer_pays: quote && quote.buyer_pays,
      seller_receives: quote && quote.seller_receives,
      platform_fee: quote && quote.platform_fee,
      fx_rate: quote && quote.fx_rate,
      buyer_fee_pct_check:
        quote && Math.abs(quote.buyer_pays - quote.list_price * 1.02) < 0.05,
      seller_fee_pct_check:
        quote && Math.abs(quote.seller_receives - quote.list_price * 0.97) < 0.05,
      error: q.body && q.body.error
    };
    report.currencies_tested.push(entry);
  }

  // 3) Auth + create multi-currency listings (if secrets present)
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const email = process.env.EMAIL;
  const pass = process.env.PASS;

  report.checks.secrets = {
    supabase_url: Boolean(url),
    anon_key: Boolean(anon),
    email: Boolean(email),
    pass: Boolean(pass),
    second_account: false
  };

  if (url && anon && email && pass) {
    const sb = createClient(url, anon);
    const signed = await sb.auth.signInWithPassword({ email, password: pass });
    report.checks.login = {
      ok: !signed.error && !!signed.data.session,
      error: signed.error && signed.error.message
    };

    if (signed.data && signed.data.session) {
      const uid = signed.data.session.user.id;
      const token = signed.data.session.access_token;
      const created = [];
      const createCodes = ["EUR", "USD", "SEK", "JPY"];
      for (const cur of createCodes) {
        const price = cur === "JPY" ? 15000 : cur === "SEK" ? 1100 : 100;
        const row = {
          title: "Currency E2E " + cur + " " + Date.now(),
          category: "electronics",
          price,
          currency: cur,
          location: "Rome, IT",
          country_code: "IT",
          city: "Rome",
          description: "Automated multi-currency listing for PR240 evidence. Safe to delete.",
          photos: [],
          user_id: uid,
          status: "active",
          listing_surface: "marketplace"
        };
        const ins = await sb.from("ads").insert([row]).select("id,price,currency,status").single();
        created.push({
          currency: cur,
          ok: !ins.error && !!ins.data,
          id: ins.data && ins.data.id,
          price: ins.data && ins.data.price,
          stored_currency: ins.data && ins.data.currency,
          error: ins.error && ins.error.message
        });
        if (ins.data && ins.data.id) {
          const selfBuy = await getJson(withShare("/api/create-event-checkout"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token
            },
            body: JSON.stringify({
              action: "marketplace_buy_checkout",
              listing_id: String(ins.data.id),
              currency: "eur"
            })
          });
          created[created.length - 1].self_buy_blocked = {
            http: selfBuy.status,
            ok:
              selfBuy.status === 400 &&
              /cannot buy your own listing/i.test(
                String((selfBuy.body && selfBuy.body.error) || "")
              ),
            error: selfBuy.body && selfBuy.body.error
          };

          // cleanup
          await sb.from("ads").delete().eq("id", ins.data.id).eq("user_id", uid);
          created[created.length - 1].deleted = true;
        }
      }
      report.checks.listings = created;

      const foreign = await sb
        .from("ads")
        .select("id,price,currency,user_id,title")
        .eq("listing_surface", "marketplace")
        .eq("status", "active")
        .neq("user_id", uid)
        .limit(1)
        .maybeSingle();
      if (foreign.data && foreign.data.id) {
        const buy = await getJson(withShare("/api/create-event-checkout"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({
            action: "marketplace_buy_checkout",
            listing_id: String(foreign.data.id),
            currency: "sek"
          })
        });
        report.checks.foreign_buy_quote = {
          listing_id: foreign.data.id,
          listing_currency: foreign.data.currency,
          http: buy.status,
          ok: !!(buy.body && buy.body.ok),
          charged: buy.body && buy.body.charged,
          code: buy.body && buy.body.code,
          checkout_url: buy.body && buy.body.checkout_url,
          list_price_eur:
            buy.body && buy.body.receipt && buy.body.receipt.list_price_eur,
          presentment_currency:
            buy.body &&
            buy.body.receipt &&
            buy.body.receipt.presentment_currency,
          live_collection:
            buy.body && buy.body.receipt && buy.body.receipt.live_collection
        };

        const listEur =
          Number(
            buy.body && buy.body.receipt && buy.body.receipt.list_price_eur
          ) || Number(foreign.data.price) || 1;
        const xlm = await getJson(withShare("/api/create-event-checkout"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({
            payment_method: "xlm",
            action: "quote",
            flow: "marketplace",
            price: listEur,
            network: "testnet",
            idempotency_key: ("hvcur" + Date.now()).slice(0, 40),
            subject_id: String(foreign.data.id)
          })
        });
        report.checks.xlm_dry_run_quote = {
          http: xlm.status,
          ok: !!(xlm.body && xlm.body.ok),
          payable: xlm.body && xlm.body.payable,
          order_paid: xlm.body && xlm.body.order_paid,
          amount_xlm: xlm.body && xlm.body.amount_xlm,
          network: xlm.body && xlm.body.network,
          network_fee_xlm: xlm.body && xlm.body.network_fee_xlm,
          rate_source: xlm.body && xlm.body.rate_source,
          code: xlm.body && xlm.body.code,
          error: xlm.body && xlm.body.error,
          live_transfer: false
        };
      } else {
        report.checks.foreign_buy_quote = {
          ok: null,
          note: "no foreign active marketplace listing"
        };
      }

      // Unauthorized update attempt of foreign listing if any public ad exists
      const foreignRls = await sb
        .from("ads")
        .select("id,user_id")
        .eq("listing_surface", "marketplace")
        .eq("status", "active")
        .neq("user_id", uid)
        .limit(1)
        .maybeSingle();
      if (foreignRls.data && foreignRls.data.id) {
        const bad = await sb
          .from("ads")
          .update({ title: "HACK" })
          .eq("id", foreignRls.data.id)
          .select("id");
        report.checks.rls_foreign_update_blocked = {
          ok: !bad.data || bad.data.length === 0,
          error: bad.error && bad.error.message,
          rows: bad.data ? bad.data.length : 0
        };
      } else {
        report.checks.rls_foreign_update_blocked = {
          ok: null,
          note: "no foreign active marketplace listing found"
        };
      }
    }
  }

  // 4) Static pages present
  for (const path of ["/buy-sell.html", "/post-ad.html", "/ad-details.html?id=1"]) {
    const page = await fetch(withShare(path));
    const text = await page.text();
    report.checks["page_" + path.split("?")[0].replace(/\W+/g, "_")] = {
      status: page.status,
      has_presentment: /havkar-presentment-currencies/.test(text),
      has_currency_filter: /currencyFilter|currencySelectMount|buyCurrencyList/.test(text)
    };
  }

  report.finished_at = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const criticalFail =
    !report.checks.currency_matrix?.ok ||
    report.currencies_tested.filter((c) => c.code !== "IRR" && !c.ok).length > 0;
  process.exit(criticalFail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  report.error = String(err && err.message ? err.message : err);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  process.exit(1);
});
