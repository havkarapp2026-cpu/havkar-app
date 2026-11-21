/*
 * Compare HAVKAR presentment registry with a live Stripe account snapshot.
 * Full per-currency PaymentIntent probes belong in test mode only.
 */

const {
  listStripePresentmentCurrencies,
  PRESENTMENT_COUNT,
  toMinorUnits
} = require("./stripe-supported-currencies-60.cjs");

function summarizeAccountCapabilities(account) {
  if (!account || typeof account !== "object") {
    return {
      ok: false,
      error: "Stripe account snapshot missing."
    };
  }

  const capabilities = account.capabilities || {};
  const activeMethods = Object.keys(capabilities).filter(
    (key) => capabilities[key] === "active"
  );
  const pendingMethods = Object.keys(capabilities).filter(
    (key) => capabilities[key] === "pending"
  );

  return {
    ok: true,
    account_id: account.id || null,
    country: account.country || null,
    default_currency: account.default_currency || null,
    charges_enabled: account.charges_enabled === true,
    payouts_enabled: account.payouts_enabled === true,
    business_type: account.business_type || null,
    active_payment_capabilities: activeMethods.sort(),
    pending_payment_capabilities: pendingMethods.sort(),
    settlement_external_accounts: (
      (account.external_accounts && account.external_accounts.data) ||
      []
    ).map((row) => ({
      bank_name: row.bank_name || null,
      country: row.country || null,
      currency: row.currency || null,
      last4: row.last4 || null
    }))
  };
}

function buildCurrencyAudit(account, probeResults) {
  const summary = summarizeAccountCapabilities(account);
  const registry = listStripePresentmentCurrencies();
  const probes = Array.isArray(probeResults) ? probeResults : [];
  const byCode = new Map(
    probes.map((row) => [String(row.code || "").toLowerCase(), row])
  );

  const currencies = registry.map((row) => {
    const probe = byCode.get(row.code);
    let eligibility = "docs_presentment_listed";
    let probe_ok = null;
    let probe_error = null;

    if (probe) {
      probe_ok = probe.ok === true;
      probe_error = probe.error || null;
      eligibility = probe.ok
        ? "sandbox_price_accepted"
        : "sandbox_price_rejected";
    }

    return {
      code: row.code,
      name: row.name,
      decimals: row.decimals,
      min_major: row.min_major,
      zero_decimal: row.zero_decimal === true,
      amex_supported: row.amex_supported === true,
      eligibility,
      probe_ok,
      probe_error,
      settlement_note:
        "Presentment currency ≠ settlement. IT account settles in " +
        String(summary.default_currency || "eur").toUpperCase() +
        "."
    };
  });

  const accepted = currencies.filter((row) => row.probe_ok === true).length;
  const rejected = currencies.filter((row) => row.probe_ok === false).length;
  const unprobed = currencies.filter((row) => row.probe_ok === null).length;

  return {
    ok: summary.ok === true,
    registry_count: PRESENTMENT_COUNT || registry.length,
    account: summary,
    probe_summary: {
      accepted,
      rejected,
      unprobed,
      mode: probes.length ? "sandbox_price_probe" : "account_snapshot_only"
    },
    currencies,
    notes: [
      "Stripe Account API does not return a full per-currency allow-list.",
      "HAVKAR registry is based on Stripe presentment docs.",
      "Payment-method availability is dynamic (capabilities + customer location + currency).",
      "Do not confuse charge currencies with settlement currency or payout countries."
    ]
  };
}

function minorAmountForProbe(meta) {
  const major = Number(meta && meta.min_major);
  const safeMajor = Number.isFinite(major) && major > 0 ? major : 1;
  try {
    return toMinorUnits(safeMajor, meta.code);
  } catch (_e) {
    return meta && meta.zero_decimal ? 100 : 100;
  }
}

/**
 * Docs + registry capability matrix without creating charges.
 * Optional Stripe account snapshot improves settlement metadata only.
 * Per-currency PaymentIntent probes remain Owner-approved sandbox-only.
 */
function describePresentmentCapabilityMatrix(account) {
  const audit = buildCurrencyAudit(account || null, []);
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    italian_account_expected_country: "IT",
    settlement_currency_expected: "eur",
    account_country: audit.account && audit.account.country,
    account_default_currency: audit.account && audit.account.default_currency,
    account_matches_expected:
      !account ||
      (String(audit.account.country || "").toUpperCase() === "IT" &&
        String(audit.account.default_currency || "").toLowerCase() === "eur"),
    registry_count: audit.registry_count,
    probe_summary: audit.probe_summary,
    currencies: audit.currencies,
    notes: audit.notes.concat([
      "This matrix does not activate live charges.",
      "Sandbox Price probes require Owner-approved sk_test_ and must not use live money."
    ]),
    live_collection: false
  };
}

module.exports = {
  summarizeAccountCapabilities,
  buildCurrencyAudit,
  minorAmountForProbe,
  describePresentmentCapabilityMatrix
};
