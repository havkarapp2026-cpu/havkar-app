/*
 * Double-entry posting helpers for HAVKAR finance.
 * Distinguishes platform commission revenue from third-party seller funds.
 * Does not invent tax rates or issue SDI documents.
 */

const BUYER_FEE_RATE = 0.02;
const SELLER_FEE_RATE = 0.03;
const SERVICE_COMMISSION_RATE = 0.1;
const LISTING_PUBLICATION_FEE_CENTS = 0;

function moneyCents(euros) {
  return Math.round(Number(euros) * 100);
}

function eurosFromCents(cents) {
  return Math.round(Number(cents)) / 100;
}

function quoteMarketplaceFees(listPriceEur) {
  const list = Number(listPriceEur);
  if (!Number.isFinite(list) || list < 0) {
    return { ok: false, error: "invalid_list_price" };
  }
  const listCents = moneyCents(list);
  const buyerFeeCents = moneyCents(list * BUYER_FEE_RATE);
  const sellerFeeCents = moneyCents(list * SELLER_FEE_RATE);
  return {
    ok: true,
    list_cents: listCents,
    buyer_fee_cents: buyerFeeCents,
    seller_fee_cents: sellerFeeCents,
    buyer_pays_cents: listCents + buyerFeeCents,
    seller_receives_cents: listCents - sellerFeeCents,
    platform_commission_cents: buyerFeeCents + sellerFeeCents,
    listing_publication_fee_cents: LISTING_PUBLICATION_FEE_CENTS
  };
}

function quoteServiceFees(agreedPriceEur) {
  const agreed = Number(agreedPriceEur);
  if (!Number.isFinite(agreed) || agreed < 0) {
    return { ok: false, error: "invalid_agreed_price" };
  }
  const agreedCents = moneyCents(agreed);
  const commissionCents = moneyCents(agreed * SERVICE_COMMISSION_RATE);
  return {
    ok: true,
    agreed_cents: agreedCents,
    commission_cents: commissionCents,
    provider_receives_cents: agreedCents - commissionCents
  };
}

function line(accountCode, debitCents, creditCents, description, party) {
  return {
    account_code: accountCode,
    debit_cents: debitCents || 0,
    credit_cents: creditCents || 0,
    description: description || "",
    party_user_id: party && party.user_id ? party.user_id : null,
    party_role: party && party.role ? party.role : null
  };
}

function assertBalanced(lines) {
  const debit = lines.reduce((s, l) => s + Number(l.debit_cents || 0), 0);
  const credit = lines.reduce((s, l) => s + Number(l.credit_cents || 0), 0);
  if (debit !== credit) {
    throw new Error("unbalanced_journal_entry:" + debit + "!=" + credit);
  }
  return { debit_cents: debit, credit_cents: credit };
}

/**
 * Platform-owned Checkout (tickets / Owner micro-test / platform revenue).
 * Full amount is HAVKAR cash; optional fee expense if known.
 */
function buildPlatformPaymentEntry(input) {
  const amount = Number(input.amount_cents || 0);
  const fee = Number(input.stripe_fee_cents || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "invalid_amount" };
  }
  const net = amount - fee;
  const revenueAccount = input.revenue_account_code || "4300";
  const lines = [
    line("1000", net > 0 ? net : amount, 0, "Stripe cash received", {
      role: "platform"
    })
  ];
  if (fee > 0) {
    lines.push(
      line("5000", fee, 0, "Stripe processing fee", { role: "stripe" })
    );
  }
  lines.push(
    line(revenueAccount, 0, amount, input.memo || "Platform payment revenue", {
      role: "platform"
    })
  );
  assertBalanced(lines);
  return {
    ok: true,
    entry: {
      entry_ref: input.entry_ref,
      source_system: input.source_system || "stripe_live",
      source_event_id: input.source_event_id || null,
      source_object_id: input.source_object_id || null,
      occurred_at: input.occurred_at || new Date().toISOString(),
      currency: input.currency || "EUR",
      memo: input.memo || "Platform payment",
      livemode: input.livemode !== false,
      metadata: input.metadata || {}
    },
    lines
  };
}

/**
 * Marketplace destination-charge style split.
 * Seller GMV is liability (not HAVKAR revenue). Only commission is revenue.
 */
function buildMarketplaceSplitEntry(input) {
  const quote = quoteMarketplaceFees(eurosFromCents(input.list_cents || 0));
  if (!quote.ok) return quote;
  const buyerPays = quote.buyer_pays_cents;
  const sellerReceives = quote.seller_receives_cents;
  const commission = quote.platform_commission_cents;
  const fee = Number(input.stripe_fee_cents || 0);
  const lines = [
    line("1000", buyerPays - fee, 0, "Buyer payment via Stripe Connect", {
      role: "buyer",
      user_id: input.buyer_user_id
    }),
    line("2000", 0, sellerReceives, "Third-party seller payable (not HAVKAR revenue)", {
      role: "seller",
      user_id: input.seller_user_id
    }),
    line("4000", 0, commission, "Buy & Sell commission (buyer 2% + seller 3%)", {
      role: "platform"
    })
  ];
  if (fee > 0) {
    lines[0].debit_cents = buyerPays - fee;
    lines.push(line("5000", fee, 0, "Stripe processing fee", { role: "stripe" }));
  }
  assertBalanced(lines);
  return {
    ok: true,
    quote,
    entry: {
      entry_ref: input.entry_ref,
      source_system: input.source_system || "stripe_connect",
      source_event_id: input.source_event_id || null,
      source_object_id: input.source_object_id || null,
      occurred_at: input.occurred_at || new Date().toISOString(),
      currency: input.currency || "EUR",
      memo: input.memo || "Marketplace settlement",
      livemode: input.livemode !== false,
      metadata: Object.assign({}, input.metadata || {}, {
        havkar_revenue_only_commission: true,
        seller_gmv_not_havkar_revenue: true
      })
    },
    lines
  };
}

function buildRefundEntry(input) {
  const amount = Number(input.amount_cents || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "invalid_amount" };
  }
  const lines = [
    line("5100", amount, 0, "Refund / chargeback expense", { role: "platform" }),
    line("1000", 0, amount, "Cash leaving Stripe balance", { role: "stripe" })
  ];
  assertBalanced(lines);
  return {
    ok: true,
    entry: {
      entry_ref: input.entry_ref,
      source_system: input.source_system || "stripe_live",
      source_event_id: input.source_event_id || null,
      source_object_id: input.source_object_id || null,
      occurred_at: input.occurred_at || new Date().toISOString(),
      currency: input.currency || "EUR",
      memo: input.memo || "Refund",
      livemode: input.livemode !== false,
      metadata: input.metadata || {}
    },
    lines
  };
}

function classifyStripeObjectForAccounting(event) {
  const type = String((event && event.type) || "");
  const obj = event && event.data && event.data.object;
  if (!obj) return { kind: "ignore" };
  const meta = obj.metadata || {};

  if (type === "charge.refunded" || type === "charge.dispute.created") {
    return {
      kind: "refund",
      amount_cents: Number(obj.amount_refunded || obj.amount || 0),
      currency: obj.currency || "eur",
      object_id: obj.id
    };
  }

  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded"
  ) {
    if (String(obj.payment_status || "") !== "paid") {
      return { kind: "ignore", reason: "not_paid" };
    }
    if (String(meta.havkar_owner_micro_test || "") === "true") {
      return {
        kind: "platform_payment",
        amount_cents: Number(obj.amount_total || 0),
        currency: obj.currency || "eur",
        object_id: obj.id,
        revenue_account_code: "4300",
        memo: "Owner EUR micro-test / platform verification payment"
      };
    }
    if (meta.event_ticket_id || meta.event_id) {
      return {
        kind: "platform_payment",
        amount_cents: Number(obj.amount_total || 0),
        currency: obj.currency || "eur",
        object_id: obj.id,
        revenue_account_code: "4200",
        memo: "Event ticket payment"
      };
    }
    if (String(meta.listing_surface || "") === "marketplace" || meta.marketplace_listing_id) {
      return {
        kind: "marketplace_split",
        list_cents: Number(obj.amount_subtotal || obj.amount_total || 0),
        currency: obj.currency || "eur",
        object_id: obj.id,
        memo: "Marketplace Checkout"
      };
    }
    return {
      kind: "platform_payment",
      amount_cents: Number(obj.amount_total || 0),
      currency: obj.currency || "eur",
      object_id: obj.id,
      revenue_account_code: "4300",
      memo: "Stripe Checkout payment"
    };
  }

  if (type === "payment_intent.succeeded") {
    if (String(meta.havkar_owner_micro_test || "") === "true") {
      return {
        kind: "platform_payment",
        amount_cents: Number(obj.amount_received || obj.amount || 0),
        currency: obj.currency || "eur",
        object_id: obj.id,
        revenue_account_code: "4300",
        memo: "Owner EUR micro-test PaymentIntent"
      };
    }
  }

  return { kind: "ignore" };
}

function buildEntryFromStripeEvent(event) {
  const classified = classifyStripeObjectForAccounting(event);
  if (classified.kind === "ignore") {
    return { ok: true, skipped: true, reason: classified.reason || "ignored" };
  }
  const base = {
    entry_ref: "JE-" + String(event.id || classified.object_id),
    source_event_id: event.id,
    source_object_id: classified.object_id,
    occurred_at: new Date((event.created || Date.now() / 1000) * 1000).toISOString(),
    livemode: event.livemode === true,
    currency: String(classified.currency || "eur").toUpperCase(),
    memo: classified.memo,
    metadata: { stripe_event_type: event.type }
  };

  if (classified.kind === "refund") {
    return buildRefundEntry(Object.assign({}, base, classified));
  }
  if (classified.kind === "marketplace_split") {
    return buildMarketplaceSplitEntry(Object.assign({}, base, classified, {
      source_system: "stripe_connect"
    }));
  }
  return buildPlatformPaymentEntry(Object.assign({}, base, classified, {
    source_system: "stripe_live",
    revenue_account_code: classified.revenue_account_code
  }));
}

async function postJournalEntry(supabase, built) {
  if (!built || !built.ok || built.skipped) {
    return built || { ok: false, error: "nothing_to_post" };
  }
  const entry = built.entry;
  const { data: inserted, error } = await supabase
    .from("havkar_finance_journal_entries")
    .insert({
      entry_ref: entry.entry_ref,
      source_system: entry.source_system,
      source_event_id: entry.source_event_id,
      source_object_id: entry.source_object_id,
      occurred_at: entry.occurred_at,
      currency: entry.currency,
      memo: entry.memo,
      livemode: entry.livemode,
      metadata: entry.metadata || {}
    })
    .select("id,entry_ref")
    .maybeSingle();

  if (error) {
    if (
      error.code === "23505" ||
      /duplicate|unique/i.test(String(error.message || ""))
    ) {
      return { ok: true, duplicate: true, entry_ref: entry.entry_ref };
    }
    throw error;
  }

  const lines = built.lines.map(function (l) {
    return {
      entry_id: inserted.id,
      account_code: l.account_code,
      debit_cents: l.debit_cents,
      credit_cents: l.credit_cents,
      party_user_id: l.party_user_id,
      party_role: l.party_role,
      description: l.description
    };
  });

  const { error: lineError } = await supabase
    .from("havkar_finance_journal_lines")
    .insert(lines);
  if (lineError) throw lineError;

  return {
    ok: true,
    posted: true,
    entry_id: inserted.id,
    entry_ref: inserted.entry_ref,
    amount_cents: lines.reduce((s, l) => s + Number(l.debit_cents || 0), 0)
  };
}

module.exports = {
  BUYER_FEE_RATE,
  SELLER_FEE_RATE,
  SERVICE_COMMISSION_RATE,
  LISTING_PUBLICATION_FEE_CENTS,
  moneyCents,
  eurosFromCents,
  quoteMarketplaceFees,
  quoteServiceFees,
  assertBalanced,
  buildPlatformPaymentEntry,
  buildMarketplaceSplitEntry,
  buildRefundEntry,
  classifyStripeObjectForAccounting,
  buildEntryFromStripeEvent,
  postJournalEntry
};
