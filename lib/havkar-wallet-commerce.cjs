/**
 * User-scoped wallet commerce activity (read-only).
 * Separates: internal HAVKAR ledger, Stripe Connect marketplace/services,
 * and never invents balances or moves money.
 */
"use strict";

const ARCHITECTURE = Object.freeze({
  model: "ledger_plus_external_rails",
  custody:
    "HAVKAR does not hold customer fiat in an internal e-money wallet. Stripe holds card charges; Connect holds seller/provider destination funds; Stellar holds XLM on-chain in the user's own account.",
  internal_ledger:
    "public.wallets / wallet_transactions are an internal ledger record only. Fiat deposit, withdrawal, P2P transfer, and EUR↔USD exchange execution stay disabled without a licensed partner.",
  marketplace_fees: {
    buyer_bps: 200,
    seller_bps: 300,
    platform_application_fee_bps: 500
  },
  services_fees: {
    provider_commission_bps: 1000,
    payer: "provider"
  }
});

function moneyFromNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function centsToMoney(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
}

function mapMarketplaceOrder(row, role) {
  return {
    kind: "marketplace_card_order",
    role,
    id: row.id,
    ad_id: row.ad_id,
    title: row.listing_title || null,
    status: row.status || null,
    currency: String(row.currency || "EUR").toUpperCase(),
    list_price: moneyFromNumber(row.list_price_eur),
    buyer_pays: moneyFromNumber(row.buyer_pays),
    seller_receives: moneyFromNumber(row.seller_receives),
    platform_fee: moneyFromNumber(row.platform_fee),
    fee_note: "Buyer 2% + seller 3% → 5% application fee (destination charge)",
    stripe_payment_intent: row.stripe_payment_intent || null,
    stripe_transfer_id: row.stripe_transfer_id || null,
    stripe_connected_account_id: row.stripe_connected_account_id || null,
    paid_at: row.paid_at || null,
    created_at: row.created_at || null,
    source: "marketplace_card_orders"
  };
}

function mapServiceBooking(row, commission, role) {
  const commissionCents =
    commission && commission.commission_cents != null
      ? Number(commission.commission_cents)
      : null;
  const settlementCents =
    commission && commission.provider_settlement_cents != null
      ? Number(commission.provider_settlement_cents)
      : null;
  return {
    kind: "service_booking",
    role,
    id: row.id,
    service_id: row.service_id,
    status: row.status || null,
    currency: String(row.currency || "EUR").toUpperCase(),
    agreed_price: moneyFromNumber(row.agreed_price),
    payment_method: row.payment_method || null,
    commission_bps: row.commission_bps != null ? Number(row.commission_bps) : 1000,
    commission_amount:
      moneyFromNumber(row.commission_amount) != null
        ? moneyFromNumber(row.commission_amount)
        : centsToMoney(commissionCents),
    provider_settlement: centsToMoney(settlementCents),
    fee_note: "Provider-paid 10% (1000 bps) on agreed price",
    collection_state: (commission && commission.collection_state) || null,
    settlement_channel: (commission && commission.settlement_channel) || null,
    stripe_payment_intent: row.stripe_payment_intent || null,
    stripe_charge_id: row.stripe_charge_id || null,
    refunded_at: row.refunded_at || null,
    disputed_at: row.disputed_at || null,
    created_at: row.created_at || null,
    source: "service_bookings"
  };
}

async function buildWalletActivity(db, userId) {
  const uid = String(userId || "").trim();
  if (!uid) {
    return { ok: false, error: "user_id required" };
  }

  const [
    walletsRes,
    txRes,
    soldRes,
    boughtRes,
    providerRes,
    customerRes,
    connectRes
  ] = await Promise.all([
    db
      .from("wallets")
      .select("currency,balance,updated_at")
      .eq("user_id", uid),
    db
      .from("wallet_transactions")
      .select("id,type,amount,currency,reference_id,description,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("marketplace_card_orders")
      .select(
        "id,ad_id,buyer_id,seller_id,listing_title,list_price_eur,buyer_pays,seller_receives,platform_fee,currency,status,stripe_payment_intent,stripe_transfer_id,stripe_connected_account_id,paid_at,created_at"
      )
      .eq("seller_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("marketplace_card_orders")
      .select(
        "id,ad_id,buyer_id,seller_id,listing_title,list_price_eur,buyer_pays,seller_receives,platform_fee,currency,status,stripe_payment_intent,stripe_transfer_id,stripe_connected_account_id,paid_at,created_at"
      )
      .eq("buyer_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("service_bookings")
      .select(
        "id,service_id,customer_id,provider_id,status,currency,agreed_price,payment_method,commission_bps,commission_amount,stripe_payment_intent,stripe_charge_id,refunded_at,disputed_at,created_at"
      )
      .eq("provider_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("service_bookings")
      .select(
        "id,service_id,customer_id,provider_id,status,currency,agreed_price,payment_method,commission_bps,commission_amount,stripe_payment_intent,stripe_charge_id,refunded_at,disputed_at,created_at"
      )
      .eq("customer_id", uid)
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("marketplace_seller_connect_accounts")
      .select(
        "stripe_account_id,charges_enabled,payouts_enabled,details_submitted,onboarding_status,updated_at"
      )
      .eq("user_id", uid)
      .maybeSingle()
  ]);

  const errors = [
    walletsRes.error,
    txRes.error,
    soldRes.error,
    boughtRes.error,
    providerRes.error,
    customerRes.error,
    connectRes.error
  ].filter(Boolean);
  if (errors.length) {
    return { ok: false, error: errors[0].message || "query_failed" };
  }

  const providerBookings = providerRes.data || [];
  const customerBookings = customerRes.data || [];
  const bookingIds = Array.from(
    new Set(
      providerBookings
        .concat(customerBookings)
        .map((b) => b.id)
        .filter((id) => id != null)
    )
  );

  let commissionsByBooking = {};
  if (bookingIds.length) {
    const { data: commissions, error: cErr } = await db
      .from("service_commission_entries")
      .select(
        "booking_id,commission_cents,provider_settlement_cents,collection_state,settlement_channel,commission_bps,customer_charge_cents"
      )
      .in("booking_id", bookingIds);
    if (cErr) {
      return { ok: false, error: cErr.message };
    }
    (commissions || []).forEach((row) => {
      commissionsByBooking[row.booking_id] = row;
    });
  }

  const wallets = (walletsRes.data || []).map((w) => ({
    currency: String(w.currency || "").toUpperCase(),
    balance: moneyFromNumber(w.balance),
    updated_at: w.updated_at || null,
    source: "wallets"
  }));

  const eur = wallets.find((w) => w.currency === "EUR") || null;

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    user_id: uid,
    architecture: ARCHITECTURE,
    fiat_rails: {
      deposits_enabled: false,
      withdrawals_enabled: false,
      transfers_enabled: false,
      exchange_executable: false,
      note: "Internal fiat custody/payout rails remain OFF until a licensed partner and safeguarding exist."
    },
    internal_ledger: {
      wallets,
      available_eur: eur ? eur.balance : null,
      pending_reserved: 0,
      pending_note:
        "Nothing is reserved in the internal ledger. Stripe/Connect funds are not mirrored here.",
      recent_transactions: (txRes.data || []).map((t) => ({
        id: t.id,
        type: t.type,
        amount: moneyFromNumber(t.amount),
        currency: String(t.currency || "EUR").toUpperCase(),
        reference_id: t.reference_id || null,
        description: t.description || null,
        created_at: t.created_at || null,
        source: "wallet_transactions"
      })),
      empty: !(txRes.data || []).length
    },
    stripe_connect: {
      account: connectRes.data
        ? {
            stripe_account_id: connectRes.data.stripe_account_id || null,
            charges_enabled: !!connectRes.data.charges_enabled,
            payouts_enabled: !!connectRes.data.payouts_enabled,
            details_submitted: !!connectRes.data.details_submitted,
            onboarding_status: connectRes.data.onboarding_status || null,
            updated_at: connectRes.data.updated_at || null,
            note: "Connect balance and bank payouts live in Stripe — not in wallets.balance."
          }
        : null
    },
    marketplace: {
      as_seller: (soldRes.data || []).map((r) => mapMarketplaceOrder(r, "seller")),
      as_buyer: (boughtRes.data || []).map((r) => mapMarketplaceOrder(r, "buyer"))
    },
    services: {
      as_provider: providerBookings.map((b) =>
        mapServiceBooking(b, commissionsByBooking[b.id], "provider")
      ),
      as_customer: customerBookings.map((b) =>
        mapServiceBooking(b, commissionsByBooking[b.id], "customer")
      )
    },
    money_moved_by_this_endpoint: false
  };
}

module.exports = {
  ARCHITECTURE,
  buildWalletActivity,
  mapMarketplaceOrder,
  mapServiceBooking,
  moneyFromNumber,
  centsToMoney
};
