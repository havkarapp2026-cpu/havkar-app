import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import {
  cardPaymentsAllowed,
  stripeSecretMode,
  stripeTestCheckoutAllowed
} from "../lib/real-payments.cjs";
import {
  describeExternalBankPayoutReadiness,
  isBlockingExternalBankStatus
} from "../lib/stripe-bank-status.cjs";
import {
  marketplaceCardSplit,
  buildRecipientAccountV2CreateBody,
  buildMarketplaceDestinationCheckoutParams
} from "../lib/marketplace-connect.cjs";
import { REQUIRED_WEBHOOK_EVENTS } from "../lib/stripe-webhook-processor.cjs";
import {
  allowedStripeFiatCurrencies,
  normalizeStripeFiatCurrency
} from "../lib/stripe-fiat-currency.cjs";
import {
  evaluateStellarCheckout,
  buildXlmQuote,
  verifyStellarSettlement,
  saveUnpaidIntent
} from "../lib/stellar-checkout.cjs";
let stripeClient = null;
let supabaseAdminClient = null;

function getStripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

function getSupabaseAdmin() {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  return supabaseAdminClient;
}

function isOwnershipRequest(req) {
  const action = String(req && req.body && req.body.action || "");
  const url = String(req && req.url || "");

  return Boolean(
    req && req.query && req.query.havkarAction === "ownership"
    || url.indexOf("stellar-ownership") !== -1
    || action === "ownership_challenge"
    || action === "ownership_verify"
    || action === "ownership_status"
  );
}

function isMainnetOwnershipRequest(req) {
  const action = String(req && req.body && req.body.action || "");
  const url = String(req && req.url || "");

  return Boolean(
    (req && req.query && req.query.havkarAction === "mainnetOwnership") ||
      url.indexOf("stellar-mainnet-ownership") !== -1 ||
      action === "mainnet_ownership_challenge" ||
      action === "mainnet_ownership_verify" ||
      action === "mainnet_ownership_status"
  );
}

function isAdBoostCheckoutRequest(req) {
  const action = String(req && req.body && req.body.action || "");
  const url = String(req && req.url || "");

  return Boolean(
    req && req.query && req.query.havkarAction === "adBoost"
    || url.indexOf("create-ad-boost-checkout") !== -1
    || action === "ad_boost_checkout"
  );
}

function isPaymentStatusRequest(req) {
  const action = String(req && req.body && req.body.action || "");
  const url = String(req && req.url || "");

  return Boolean(
    req && req.query && req.query.havkarAction === "paymentStatus"
    || url.indexOf("payment-activation-status") !== -1
    || action === "payment_activation_status"
  );
}

function isXlmInvoiceRequest(req) {
  const action = String(req && req.body && req.body.action || "");
  const url = String(req && req.url || "");

  return Boolean(
    (req && req.query && req.query.havkarAction === "xlmInvoice") ||
      url.indexOf("xlm-invoice") !== -1 ||
      action === "xlm_invoice"
  );
}

function isMarketplaceConnectRequest(req) {
  const action = String((req && req.body && req.body.action) || "");
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "marketplaceConnect") ||
      url.indexOf("marketplace-connect") !== -1 ||
      action === "marketplace_connect_onboard" ||
      action === "marketplace_connect_status" ||
      action === "marketplace_connect_quote"
  );
}

function eventCardCheckoutAllowed(body) {
  if (cardPaymentsAllowed()) {
    return { allowed: true, mode: "live_or_armed" };
  }
  if (
    stripeTestCheckoutAllowed() &&
    body &&
    body.test_mode === true
  ) {
    return { allowed: true, mode: "stripe_test" };
  }
  return { allowed: false, mode: "paused" };
}

function isOwnerEur1CheckoutRequest(req) {
  try {
    const {
      isOwnerEur1Request
    } = require("../lib/owner-eur1-checkout.cjs");
    return isOwnerEur1Request(req);
  } catch {
    return false;
  }
}

async function readXlmInvoice(req) {
  const intentId = String(
    (req.query && (req.query.intent || req.query.id)) ||
      (req.body && (req.body.intent || req.body.intent_id || req.body.id)) ||
      ""
  ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      intentId
    )
  ) {
    return {
      ok: false,
      httpStatus: 400,
      code: "INTENT_ID_INVALID",
      error: "A valid invoice id is required."
    };
  }

  const loaded = await getSupabaseAdmin()
    .from("marketplace_payment_intents")
    .select(
      "id,user_id,flow,amount,currency,network,status,expires_at,amount_xlm,eur_per_xlm,destination,memo,subject_id,created_at,tx_hash,settled_at,payer_account"
    )
    .eq("id", intentId)
    .maybeSingle();

  if (loaded && loaded.error) {
    throw loaded.error;
  }

  const intent = loaded && loaded.data;

  if (!intent) {
    return {
      ok: false,
      httpStatus: 404,
      code: "INVOICE_NOT_FOUND",
      error: "Invoice not found."
    };
  }

  let canVerify = false;
  let signedIn = false;

  try {
    const auth = await authenticateUser(req);

    if (auth && auth.user && auth.user.id) {
      signedIn = true;
      canVerify =
        intent.status === "unpaid" &&
        String(auth.user.id) === String(intent.user_id);
    }
  } catch (error) {
    canVerify = false;
  }

  return {
    ok: true,
    httpStatus: 200,
    paid: intent.status === "settled",
    order_paid: intent.status === "settled",
    payable: intent.status === "unpaid",
    can_verify: canVerify,
    signed_in: signedIn,
    id: intent.id,
    flow: intent.flow,
    amount: intent.amount,
    currency: intent.currency,
    network: intent.network,
    status: intent.status,
    expires_at: intent.expires_at,
    amount_xlm: intent.amount_xlm,
    eur_per_xlm: intent.eur_per_xlm,
    destination: intent.destination,
    memo: intent.memo,
    subject_id: intent.subject_id,
    created_at: intent.created_at,
    tx_hash: intent.tx_hash || null,
    settled_at: intent.settled_at || null,
    payer_account: intent.status === "settled" ? intent.payer_account || null : null,
    horizon:
      intent.network === "mainnet"
        ? "https://horizon.stellar.org"
        : "https://horizon-testnet.stellar.org"
  };
}

async function buildPaymentActivationStatus() {
  const {
    stellarMainnetPaymentsEnabled,
    stellarMainnetLiveCollectionEnabled,
    mainnetReady,
    mainnetCustomerLiveReady,
    MAINNET_FLAG,
    MAINNET_LIVE_COLLECTION_FLAG,
    MAINNET_DESTINATION_ENV
  } = require("../lib/stellar-mainnet.cjs");
  const {
    handleMainnetWalletOwnership
  } = require("../lib/stellar-mainnet-ownership.cjs");
  const {
    describeCryptoGeoStatus
  } = require("../lib/crypto-geo-policy.cjs");
  const {
    describeSettlementModels
  } = require("../lib/stellar-settlement-models.cjs");

  const stripeMode = stripeSecretMode();

  const realEnabled = process.env.HAVKAR_REAL_PAYMENTS_ENABLED === "true";
  const cardsAllowed = cardPaymentsAllowed();
  const stellarMainnetFlag = stellarMainnetPaymentsEnabled();
  const stellarMainnetLive = stellarMainnetLiveCollectionEnabled();
  const stellarMainnetReady = mainnetReady();
  const stellarMainnetCustomerLive = mainnetCustomerLiveReady();
  const testnetDestinationConfigured = Boolean(
    String(
      process.env.HAVKAR_STELLAR_TESTNET_DESTINATION ||
        process.env.HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY ||
        ""
    ).trim()
  );

  const blockers = [];

  if (!cardsAllowed) {
    blockers.push(
      "Set HAVKAR_REAL_PAYMENTS_ENABLED=true only after legal/security checklist for card/Pi collection."
    );
    if (stripeMode === "live") {
      blockers.push(
        "Also set HAVKAR_STRIPE_LIVE_ENABLED=true for Stripe live-mode secrets."
      );
    } else {
      blockers.push(
        "Confirm Stripe key mode (test vs live) before charging customers."
      );
    }
  }

  const mainnetDestinationConfigured = Boolean(
    String(process.env.HAVKAR_STELLAR_MAINNET_DESTINATION || "").trim()
  );

  let mainnetOwnership = {
    verified: false,
    verified_at: null,
    method: null
  };

  try {
    const ownership = await handleMainnetWalletOwnership(
      { action: "mainnet_ownership_status" },
      {
        supabaseUrl: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    );

    if (ownership && ownership.ok) {
      mainnetOwnership = {
        verified: ownership.verified === true,
        verified_at: ownership.verified_at || null,
        method: ownership.method || null,
        pubkey: ownership.pubkey || null
      };
    }
  } catch (error) {
    mainnetOwnership = {
      verified: false,
      verified_at: null,
      method: null,
      error: "ownership_status_unavailable"
    };
  }

  if (!stellarMainnetReady) {
    if (!mainnetDestinationConfigured) {
      blockers.push(
        "Owner must provide the approved Stellar Mainnet receiving public key and set " +
          MAINNET_DESTINATION_ENV +
          " on Vercel Production (G... only; never a secret seed)."
      );
    } else if (!mainnetOwnership.verified) {
      blockers.push(
        "Prove LOBSTR control of the configured Mainnet destination at /mainnet-wallet-ownership.html (signMessage; no XLM required)."
      );
    }
    if (!stellarMainnetFlag) {
      blockers.push(
        "After ownership proof, set " +
          MAINNET_FLAG +
          "=true on Vercel Production, then redeploy."
      );
    }
  } else if (!stellarMainnetLive) {
    blockers.push(
      "Mainnet infrastructure is armed, but customer live collection stays off until Owner sets " +
        MAINNET_LIVE_COLLECTION_FLAG +
        "=true after final approval, then redeploys. Testnet XLM remains available."
    );
  }

  blockers.push(
    "XLM recurring/AI subscriptions remain unsupported — do not sell recurring access via one-time XLM."
  );
  blockers.push(
    "Refunds require an Owner-signed return payment from the merchant Mainnet account; server only verifies Horizon."
  );

  // Safe payout-bank summary only (bank name + last4). Never include IBAN/BIC.
  // Prefer GET /v1/account (own secret key). Restricted keys may omit banks.
  let payoutBank = {
    probed: false,
    default_eur: null
  };
  if (stripeMode === "live" || stripeMode === "test") {
    try {
      const stripe = getStripe();
      const accountId = String(
        process.env.STRIPE_ACCOUNT_ID || "acct_1UJwZZECWiUpELSP"
      ).trim();
      let account = null;
      try {
        account = await stripe.request({
          method: "GET",
          path: "/v1/account",
          params: { expand: ["external_accounts"] }
        });
      } catch (_ownAccountError) {
        account = await stripe.accounts.retrieve(accountId, {
          expand: ["external_accounts"]
        });
      }
      let banks = Array.isArray(account?.external_accounts?.data)
        ? account.external_accounts.data
        : [];
      if (!banks.length) {
        try {
          const listed = await stripe.accounts.listExternalAccounts(accountId, {
            object: "bank_account",
            limit: 10
          });
          banks = Array.isArray(listed?.data) ? listed.data : [];
        } catch (_listError) {
          banks = [];
        }
      }
      const eurDefault =
        banks.find(
          (b) =>
            b &&
            b.object === "bank_account" &&
            String(b.currency || "").toLowerCase() === "eur" &&
            b.default_for_currency === true
        ) ||
        banks.find(
          (b) =>
            b &&
            b.object === "bank_account" &&
            String(b.currency || "").toLowerCase() === "eur"
        ) ||
        null;
      payoutBank = {
        probed: true,
        charges_enabled: account?.charges_enabled === true,
        payouts_enabled: account?.payouts_enabled === true,
        tax_id_provided: account?.company?.tax_id_provided === true,
        vat_id_provided: account?.company?.vat_id_provided === true,
        bank_accounts_visible: banks.length > 0,
        default_eur: eurDefault
          ? {
              bank_name: String(eurDefault.bank_name || ""),
              last4: String(eurDefault.last4 || ""),
              country: String(eurDefault.country || ""),
              currency: String(eurDefault.currency || "").toLowerCase(),
              default_for_currency: eurDefault.default_for_currency === true,
              status: String(eurDefault.status || "")
            }
          : null
      };
      if (payoutBank.default_eur) {
        const readiness = describeExternalBankPayoutReadiness(
          {
            status: payoutBank.default_eur.status,
            available_payout_methods: ["standard"]
          },
          {
            payouts_enabled: payoutBank.payouts_enabled === true,
            charges_enabled: payoutBank.charges_enabled === true
          }
        );
        payoutBank.default_eur.payout_readiness = readiness;
        if (
          payoutBank.default_eur.last4 !== "8455" ||
          !/revolut/i.test(payoutBank.default_eur.bank_name || "")
        ) {
          blockers.push(
            "Confirm Revolut Business EUR (last4 8455) remains the default Stripe payout bank."
          );
        } else if (isBlockingExternalBankStatus(payoutBank.default_eur.status)) {
          blockers.push(
            "Stripe payout bank Revolut …8455 is in a blocking status (" +
              payoutBank.default_eur.status +
              "). Replace bank details in Dashboard before relying on payouts."
          );
        } else if (!payoutBank.payouts_enabled) {
          blockers.push(
            "Stripe account payouts_enabled is false; scheduled Revolut payouts cannot run."
          );
        }
        // status=new is normal and not a blocker when payouts_enabled=true.
      } else if (!payoutBank.bank_accounts_visible) {
        // Restricted Production keys often cannot list external accounts.
        // Authoritative verification remains Stripe Dashboard / Owner MCP audit.
        payoutBank.note =
          "Bank list not readable with current Production Stripe key permissions; use Dashboard/MCP for last4 confirmation.";
      }
    } catch (error) {
      payoutBank = {
        probed: false,
        error: "payout_bank_probe_unavailable"
      };
    }
  }

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    customer_facing_collection: cardsAllowed ? "armed" : "paused",
    stellar_mainnet_collection: stellarMainnetReady ? "armed" : "paused",
    stellar_mainnet_customer_live: stellarMainnetCustomerLive
      ? "armed"
      : "paused",
    flags: {
      HAVKAR_REAL_PAYMENTS_ENABLED: realEnabled,
      HAVKAR_STRIPE_LIVE_ENABLED:
        process.env.HAVKAR_STRIPE_LIVE_ENABLED === "true",
      HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: stellarMainnetFlag,
      HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION: stellarMainnetLive,
      STELLAR_MAINNET_PAYMENTS_ENABLED_SOURCE: true
    },
    stripe: {
      secret_key_mode: stripeMode,
      webhook_secret_configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      allowed_fiat: allowedStripeFiatCurrencies().map((c) => c.toUpperCase()),
      live_collection_allowed: cardsAllowed,
      test_checkout_allowed: stripeTestCheckoutAllowed(),
      required_webhook_events: REQUIRED_WEBHOOK_EVENTS,
      payout_bank: payoutBank,
      marketplace_connect: {
        implemented: true,
        charge_pattern: "destination",
        buyer_fee_bps: 200,
        seller_fee_bps: 300,
        live_armed: cardsAllowed
      }
    },
    stellar: {
      testnet_destination_configured: testnetDestinationConfigured,
      mainnet_payments_enabled_in_source: true,
      mainnet_flag: stellarMainnetFlag,
      mainnet_live_collection: stellarMainnetLive,
      mainnet_destination_configured: mainnetDestinationConfigured,
      mainnet_ownership_verified: mainnetOwnership.verified === true,
      mainnet_ownership_verified_at: mainnetOwnership.verified_at,
      mainnet_ownership_method: mainnetOwnership.method,
      mainnet_ready: stellarMainnetReady,
      mainnet_customer_live: stellarMainnetCustomerLive,
      migration_20261109033000: "applied_or_reconciled",
      commissions: {
        marketplace_buyer_bps: 200,
        marketplace_seller_bps: 300,
        services_provider_bps: 1000
      },
      unsupported_flows: ["subscription", "recurring", "trade", "ai", "jobs"],
      supported_flows: ["marketplace", "services", "events"],
      crypto_geo: describeCryptoGeoStatus(),
      settlement_models: describeSettlementModels()
    },
    owner_activation_required:
      !cardsAllowed || !stellarMainnetCustomerLive,
    owner_actions: stellarMainnetCustomerLive
      ? []
      : [
          ...(mainnetDestinationConfigured
            ? []
            : [
                {
                  id: "provide_mainnet_destination",
                  required: true,
                  detail:
                    "Provide the approved HAVKAR Stellar Mainnet merchant receiving public key (G...). Do not send a secret seed."
                }
              ]),
          ...(mainnetOwnership.verified
            ? []
            : [
                {
                  id: "prove_mainnet_wallet_control",
                  required: true,
                  detail:
                    "Open /mainnet-wallet-ownership.html, connect LOBSTR with the configured destination account, and sign the server challenge (no XLM). Fallback: tiny outbound native payment with the exact memo shown on that page, then paste the Horizon tx hash."
                }
              ]),
          {
            id: "arm_mainnet_flag",
            required: !stellarMainnetFlag,
            detail:
              "After ownership proof, set HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true (exact) on Vercel Production and redeploy."
          },
          {
            id: "enable_mainnet_live_collection",
            required: stellarMainnetReady && !stellarMainnetLive,
            detail:
              "After final Owner approval of the XLM release branch, set HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION=true (exact) and redeploy. Until then customer Mainnet quotes stay refused; Testnet remains available."
          },
          {
            id: "smoke_settle",
            required: stellarMainnetCustomerLive,
            detail:
              "After stellar.mainnet_customer_live=true, run one tiny real Mainnet payment and confirm the intent settles with the Horizon tx hash."
          }
        ],
    blockers: blockers
  };
}

function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    error: message,
  });
}

function normalizePrice(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let text = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/[€$£]/g, "");

  if (!text) {
    return null;
  }

  if (/^\d+,\d{1,2}$/.test(text)) {
    text = text.replace(",", ".");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const amount = Number(text);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return amount;
}

function safeQuantity(value) {
  const quantity = Number(value ?? 1);

  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 20
  ) {
    return null;
  }

  return quantity;
}

function getOrigin(req) {
  const configuredOrigin =
    process.env.HAVKAR_APP_URL?.trim();

  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }

  const forwardedHost =
    req.headers["x-forwarded-host"];

  const host =
    typeof forwardedHost === "string" && forwardedHost
      ? forwardedHost
      : req.headers.host;

  if (!host) {
    return "https://havkar.online";
  }

  const forwardedProto =
    req.headers["x-forwarded-proto"];

  const protocol =
    typeof forwardedProto === "string" && forwardedProto
      ? forwardedProto.split(",")[0].trim()
      : "https";

  return `${protocol}://${host}`;
}

function allowedCheckoutOrigin(req) {
  const origin = getOrigin(req);

  try {
    const url = new URL(origin);
    const host = url.hostname;
    const stagingHost =
      host === "staging.havkar.online" || host === "testnet.havkar.online";
    const havkarHost = host === "havkar.online"
      || host === "www.havkar.online"
      || host.endsWith(".havkar.online")
      || host === "havkar-app.vercel.app"
      || (host.endsWith(".vercel.app") && host.includes("havkar"));

    if (url.protocol === "https:" && havkarHost) {
      // Keep dedicated preview hosts; canonicalize Production aliases to apex.
      if (stagingHost) {
        return origin;
      }
      return "https://havkar.online";
    }
  } catch {
    /* Use the public site when the request host is not a HAVKAR host. */
  }

  return "https://havkar.online";
}

async function authenticateUser(req) {
  const authorization =
    req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return {
      user: null,
      error: "Authentication required",
    };
  }

  const accessToken =
    authorization.slice(7).trim();

  if (!accessToken) {
    return {
      user: null,
      error: "Authentication required",
    };
  }

  const {
    data,
    error,
  } = await getSupabaseAdmin().auth.getUser(accessToken);

  if (error || !data?.user) {
    return {
      user: null,
      error: "Invalid or expired session",
    };
  }

  return {
    user: data.user,
    error: null,
  };
}

function generateTicketCode() {
  const raw = String(
    globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}${Math.random()}`
  ).replace(/-/g, "");

  return raw.slice(0, 12).toUpperCase();
}

function normalizeTicketType(value, unitPrice) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (
    raw === "vip" ||
    raw === "early" ||
    raw === "general" ||
    raw === "free"
  ) {
    return raw;
  }

  return Number(unitPrice) === 0 ? "free" : "general";
}

function holdExpiresAtIso(minutes = 30) {
  return new Date(
    Date.now() + Math.max(5, Number(minutes) || 30) * 60 * 1000
  ).toISOString();
}

async function countReservedTickets(eventId) {
  const admin = getSupabaseAdmin();
  const rpc = await admin.rpc("havkar_event_occupied_seats", {
    p_event_id: eventId
  });

  if (!rpc.error && rpc.data != null) {
    return Number(rpc.data) || 0;
  }

  // Fallback if RPC is unavailable: paid seats + active pending holds.
  const {
    data,
    error,
  } = await admin
    .from("event_tickets")
    .select("quantity,ticket_status,payment_status,hold_expires_at,cancelled_at")
    .eq("event_id", eventId);

  if (error) {
    throw error;
  }

  const now = Date.now();

  return (data || []).reduce((sum, row) => {
    if (row.cancelled_at) {
      return sum;
    }

    const qty = Number(row.quantity || 0);

    if (
      row.ticket_status === "valid" &&
      row.payment_status === "paid"
    ) {
      return sum + qty;
    }

    if (
      row.ticket_status === "pending" &&
      row.payment_status === "pending"
    ) {
      if (
        !row.hold_expires_at ||
        new Date(row.hold_expires_at).getTime() > now
      ) {
        return sum + qty;
      }
    }

    return sum;
  }, 0);
}

/**
 * Validate marketplace / services / events subjects before storing an unpaid quote.
 * Never invents prices. Never allows self-purchase marketplace quotes.
 */
async function loadMerchantStellarReceive(admin, ownerUserId) {
  const owner = String(ownerUserId || "").trim();

  if (!owner) {
    return null;
  }

  try {
    const loaded = await admin
      .from("stellar_receive_accounts")
      .select("public_key")
      .eq("user_id", owner)
      .maybeSingle();

    const key = String((loaded && loaded.data && loaded.data.public_key) || "").trim();

    if (/^G[A-Z2-7]{55}$/.test(key)) {
      return key;
    }
  } catch (_error) {
    // Table may not exist until Owner applies migration.
  }

  return null;
}

async function validateXlmQuoteSubject(admin, userId, decision) {
  const flow = String(decision.flow || "");
  const subjectId = String(decision.subject_id || "").trim();

  if (!subjectId) {
    return {
      ok: false,
      status: 400,
      code: "SUBJECT_REQUIRED",
      error: "A subject_id is required for XLM checkout.",
      paid: false,
      order_paid: false,
      payable: false
    };
  }

  if (flow === "marketplace") {
    const listingId = Number(subjectId);

    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      return {
        ok: false,
        status: 400,
        code: "SUBJECT_INVALID",
        error: "Marketplace subject_id must be a listing id.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const loaded = await admin
      .from("ads")
      .select("id,user_id,price,status,listing_surface")
      .eq("id", listingId)
      .maybeSingle();

    const ad = loaded && loaded.data;

    if (!ad) {
      return {
        ok: false,
        status: 404,
        code: "LISTING_NOT_FOUND",
        error: "Marketplace listing was not found.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (String(ad.listing_surface || "") !== "marketplace") {
      return {
        ok: false,
        status: 409,
        code: "NOT_MARKETPLACE_LISTING",
        error: "XLM marketplace checkout is only for marketplace listings.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (String(ad.status || "").toLowerCase() !== "active") {
      return {
        ok: false,
        status: 409,
        code: "LISTING_NOT_ACTIVE",
        error: "Only active marketplace listings can be paid with XLM.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (String(ad.user_id) === String(userId)) {
      return {
        ok: false,
        status: 403,
        code: "SELF_PURCHASE_FORBIDDEN",
        error: "You cannot pay yourself for your own listing.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const listed = Number(ad.price);

    if (!Number.isFinite(listed) || listed <= 0) {
      return {
        ok: false,
        status: 409,
        code: "LISTING_PRICE_INVALID",
        error: "The listing has no positive price for XLM.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (Number(decision.fees.price) !== listed) {
      return {
        ok: false,
        status: 409,
        code: "PRICE_MISMATCH",
        error: "Quoted price does not match the current listing price.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const merchantKey = await loadMerchantStellarReceive(admin, ad.user_id);

    return {
      ok: true,
      listing: ad,
      merchant_stellar_receive: merchantKey
    };
  }

  if (flow === "services") {
    const serviceId = Number(subjectId);

    if (!Number.isSafeInteger(serviceId) || serviceId <= 0) {
      return {
        ok: false,
        status: 400,
        code: "SUBJECT_INVALID",
        error: "Services subject_id must be a service id.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const loaded = await admin
      .from("services")
      .select("id,provider_id,price,price_type,status")
      .eq("id", serviceId)
      .maybeSingle();

    const service = loaded && loaded.data;

    if (!service) {
      return {
        ok: false,
        status: 404,
        code: "SERVICE_NOT_FOUND",
        error: "Service was not found for XLM checkout.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (String(service.provider_id) === String(userId)) {
      return {
        ok: false,
        status: 403,
        code: "SELF_PURCHASE_FORBIDDEN",
        error: "You cannot pay yourself for your own service.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (
      service.status != null &&
      String(service.status).toLowerCase() !== "active"
    ) {
      return {
        ok: false,
        status: 409,
        code: "SERVICE_NOT_ACTIVE",
        error: "Only active services can be paid with XLM.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const priceType = String(service.price_type || "").toLowerCase();

    if (["hour", "day", "week", "month"].indexOf(priceType) !== -1) {
      return {
        ok: false,
        status: 403,
        code: "XLM_RECURRING_UNSUPPORTED",
        error: "Recurring service pricing cannot be settled with one-time XLM.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const listed = Number(service.price);

    if (!Number.isFinite(listed) || listed <= 0) {
      return {
        ok: false,
        status: 409,
        code: "SERVICE_PRICE_INVALID",
        error: "The service has no positive one-time price for XLM.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (Number(decision.fees.price) !== listed) {
      return {
        ok: false,
        status: 409,
        code: "PRICE_MISMATCH",
        error: "Quoted price does not match the current service price.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const merchantKey = await loadMerchantStellarReceive(
      admin,
      service.provider_id
    );

    return {
      ok: true,
      service: service,
      merchant_stellar_receive: merchantKey
    };
  }

  if (flow === "events") {
    const eventId = Number(subjectId);

    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      return {
        ok: false,
        status: 400,
        code: "SUBJECT_INVALID",
        error: "Events subject_id must be an event id.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const loaded = await admin
      .from("events")
      .select("id,price,status,max_attendees")
      .eq("id", eventId)
      .maybeSingle();

    const event = loaded && loaded.data;

    if (!event) {
      return {
        ok: false,
        status: 404,
        code: "EVENT_NOT_FOUND",
        error: "Event was not found for XLM checkout.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const listed = Number(event.price);

    if (!Number.isFinite(listed) || listed <= 0) {
      return {
        ok: false,
        status: 409,
        code: "EVENT_PRICE_INVALID",
        error: "The event has no positive one-time price for XLM.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (Number(decision.fees.price) !== listed) {
      return {
        ok: false,
        status: 409,
        code: "PRICE_MISMATCH",
        error: "Quoted price does not match the current event price.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    return { ok: true, event: event };
  }

  return {
    ok: false,
    status: 400,
    code: "XLM_FLOW_UNSUPPORTED",
    error: "Unsupported XLM flow.",
    paid: false,
    order_paid: false,
    payable: false
  };
}

/**
 * After Horizon verifies an XLM settlement, create the domain object
 * for supported one-time flows. Never invents a ticket for unpaid quotes.
 */
async function fulfillSettledXlmIntent(admin, userId, intentId) {
  const loaded = await admin
    .from("marketplace_payment_intents")
    .select("id,user_id,flow,status,subject_id,amount,currency,tx_hash,network")
    .eq("id", intentId)
    .eq("user_id", userId)
    .maybeSingle();

  const intent = loaded && loaded.data;

  if (!intent || intent.status !== "settled") {
    return { ticket_id: null, fulfillment: null, error: null };
  }

  const flow = String(intent.flow || "");

  if (flow === "marketplace") {
    const listingId = Number(intent.subject_id);

    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      return {
        ticket_id: null,
        fulfillment: null,
        error: "Marketplace subject is missing on the settled quote."
      };
    }

    const updated = await admin
      .from("ads")
      .update({ status: "ended" })
      .eq("id", listingId)
      .eq("listing_surface", "marketplace")
      .eq("status", "active")
      .select("id,status")
      .maybeSingle();

    if (!updated.data || String(updated.data.status) !== "ended") {
      return {
        ticket_id: null,
        fulfillment: "marketplace_intent",
        listing_id: listingId,
        error:
          "Settlement was verified. Listing could not be marked ended (already ended or unavailable)."
      };
    }

    return {
      ticket_id: null,
      fulfillment: "marketplace_listing_ended",
      listing_id: listingId,
      error: null
    };
  }

  if (flow === "services") {
    return {
      ticket_id: null,
      fulfillment: "services_intent",
      service_id: intent.subject_id || null,
      payment_reference: intent.tx_hash || null,
      network: intent.network || null,
      error: null
    };
  }

  if (flow !== "events") {
    return {
      ticket_id: null,
      fulfillment: "intent_only",
      error: null
    };
  }

  const eventId = Number(intent.subject_id);
  const paymentProvider =
    String(intent.network || "") === "mainnet"
      ? "stellar_mainnet"
      : "stellar_testnet";

  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    return {
      ticket_id: null,
      fulfillment: null,
      error: "Event subject is missing on the settled quote."
    };
  }

  const existing = await admin
    .from("event_tickets")
    .select("id,ticket_code")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("payment_provider", paymentProvider)
    .eq("payment_reference", intent.tx_hash)
    .maybeSingle();

  if (existing && existing.data && existing.data.id) {
    return {
      ticket_id: existing.data.id,
      ticket_code: existing.data.ticket_code || null,
      fulfillment: "event_ticket",
      error: null
    };
  }

  const eventLoaded = await admin
    .from("events")
    .select("id,price,max_attendees,status")
    .eq("id", eventId)
    .maybeSingle();

  const event = eventLoaded && eventLoaded.data;

  if (!event) {
    return {
      ticket_id: null,
      fulfillment: null,
      error: "Settled quote refers to a missing event."
    };
  }

  const maxAttendees =
    event.max_attendees == null
      ? null
      : Number(event.max_attendees);

  if (maxAttendees !== null) {
    const reserved = await countReservedTickets(eventId);

    if (reserved + 1 > maxAttendees) {
      return {
        ticket_id: null,
        fulfillment: null,
        error:
          "Event capacity was reached after settlement. Contact support with the Stellar tx hash."
      };
    }
  }

  const unitPrice = Number(event.price || intent.amount || 0);
  const ticketCode = generateTicketCode();
  const inserted = await admin
    .from("event_tickets")
    .insert({
      user_id: userId,
      event_id: eventId,
      quantity: 1,
      unit_price: unitPrice,
      currency: String(intent.currency || "EUR").toUpperCase(),
      total_amount: Number(intent.amount || unitPrice),
      payment_status: "paid",
      ticket_status: "valid",
      payment_provider: paymentProvider,
      payment_reference: intent.tx_hash,
      paid_at: new Date().toISOString(),
      ticket_code: ticketCode,
      ticket_type: normalizeTicketType(null, unitPrice),
      hold_expires_at: null
    })
    .select("id,ticket_code")
    .single();

  if (inserted.error || !inserted.data) {
    return {
      ticket_id: null,
      fulfillment: null,
      error: "Settlement was verified but the event ticket could not be stored."
    };
  }

  await admin.from("event_ticket_events").insert({
    ticket_id: inserted.data.id,
    event_id: eventId,
    actor_user_id: userId,
    action: "issue_xlm",
    detail: {
      ticket_code: inserted.data.ticket_code,
      payment_provider: paymentProvider,
      tx_hash: intent.tx_hash
    }
  });

  return {
    ticket_id: inserted.data.id,
    ticket_code: inserted.data.ticket_code || ticketCode,
    fulfillment: "event_ticket",
    error: null
  };
}

export default async function handler(req, res) {
  if (isPaymentStatusRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }

    return res.status(200).json(await buildPaymentActivationStatus());
  }

  if (isMarketplaceConnectRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }

    const action = String((req.body && req.body.action) || "");
    if (action === "marketplace_connect_quote") {
      const listPrice = Number((req.body && req.body.list_price_eur) || 0);
      const split = marketplaceCardSplit(listPrice);
      if (!split) {
        return sendError(res, 400, "list_price_eur must be a positive number");
      }
      return res.status(200).json({
        ok: true,
        live_collection: cardPaymentsAllowed() ? "armed" : "paused",
        split
      });
    }

    const auth = await authenticateUser(req);
    if (!auth.user) {
      return sendError(res, 401, auth.error || "Authentication required");
    }

    if (action === "marketplace_connect_status") {
      const { data, error } = await getSupabaseAdmin()
        .from("marketplace_seller_connect_accounts")
        .select(
          "stripe_account_id,charges_enabled,payouts_enabled,details_submitted,onboarding_status,updated_at"
        )
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) {
        return sendError(res, 500, "Could not load Connect status");
      }
      return res.status(200).json({
        ok: true,
        live_collection: cardPaymentsAllowed() ? "armed" : "paused",
        account: data || null
      });
    }

    // marketplace_connect_onboard
    if (!cardPaymentsAllowed() && !stripeTestCheckoutAllowed()) {
      return res.status(403).json({
        ok: false,
        error: "Connect onboarding is paused until Stripe test or live collection is enabled.",
        code: "REAL_PAYMENTS_PAUSED"
      });
    }

    try {
      const stripe = getStripe();
      const existing = await getSupabaseAdmin()
        .from("marketplace_seller_connect_accounts")
        .select("stripe_account_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();

      let accountId = existing.data && existing.data.stripe_account_id;
      if (!accountId) {
        // Prefer Accounts v2; fall back to controller-property v1 if v2 unavailable on this SDK/key.
        let created;
        try {
          created = await stripe.request({
            method: "POST",
            path: "/v2/core/accounts",
            body: buildRecipientAccountV2CreateBody({
              email: auth.user.email,
              displayName:
                (auth.user.user_metadata && auth.user.user_metadata.full_name) ||
                "HAVKAR seller"
            })
          });
        } catch (_v2Error) {
          created = await stripe.accounts.create({
            controller: {
              stripe_dashboard: { type: "express" },
              fees: { payer: "application" },
              losses: { payments: "application" }
            },
            capabilities: {
              transfers: { requested: true }
            },
            email: auth.user.email || undefined,
            metadata: {
              havkar_flow: "marketplace_connect",
              havkar_user_id: String(auth.user.id)
            }
          });
        }
        accountId = created.id;
        await getSupabaseAdmin()
          .from("marketplace_seller_connect_accounts")
          .upsert({
            user_id: auth.user.id,
            stripe_account_id: accountId,
            onboarding_status: "pending",
            updated_at: new Date().toISOString()
          });
      }

      const origin = allowedCheckoutOrigin(req);
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${origin}/market.html?connect=refresh`,
        return_url: `${origin}/market.html?connect=return`,
        type: "account_onboarding"
      });

      // Example destination Checkout params (not charged unless Owner arms collection).
      const demoSplit = marketplaceCardSplit(100);
      const exampleCheckout = buildMarketplaceDestinationCheckoutParams({
        split: demoSplit,
        connectedAccountId: accountId,
        listingTitle: "Example HAVKAR listing",
        successUrl: `${origin}/market.html?payment=success`,
        cancelUrl: `${origin}/market.html?payment=cancelled`,
        metadata: { havkar_user_id: String(auth.user.id) },
        customerEmail: auth.user.email
      });

      return res.status(200).json({
        ok: true,
        live_collection: cardPaymentsAllowed() ? "armed" : "paused",
        stripe_account_id: accountId,
        onboarding_url: accountLink.url,
        fee_example_eur_100: demoSplit,
        destination_checkout_example: exampleCheckout
      });
    } catch (error) {
      console.error("marketplace connect onboard failed", error && error.message);
      return sendError(res, 500, "Connect onboarding could not be started");
    }
  }

  if (isXlmInvoiceRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }

    try {
      const invoice = await readXlmInvoice(req);
      return res.status(invoice.httpStatus || 500).json(invoice);
    } catch (error) {
      console.error("XLM invoice read failed", error && error.message);
      return sendError(res, 500, "XLM invoice could not be loaded");
    }
  }

  if (isOwnerEur1CheckoutRequest(req)) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "Method not allowed");
    }

    try {
      const {
        CONFIRM_PHRASE,
        isOwnerIdentity,
        createOwnerEur1CheckoutSession,
        retrieveOwnerEur1Session
      } = require("../lib/owner-eur1-checkout.cjs");

      const auth = await authenticateUser(req);
      if (!auth.user) {
        return sendError(res, 401, auth.error || "Authentication required");
      }
      if (!isOwnerIdentity(auth.user)) {
        return sendError(res, 403, "Owner identity required for EUR 1 micro-test.");
      }

      if (!process.env.STRIPE_SECRET_KEY) {
        return sendError(res, 503, "Stripe is not configured.");
      }

      const action = String((req.body && req.body.action) || "owner_eur1_prepare");

      if (action === "owner_eur1_status") {
        const status = await retrieveOwnerEur1Session(
          getStripe(),
          req.body && req.body.session_id
        );
        return res.status(status.httpStatus || 500).json(status);
      }

      if (String((req.body && req.body.confirm) || "") !== CONFIRM_PHRASE) {
        return res.status(400).json({
          ok: false,
          error: "Exact confirm phrase required.",
          required_confirm: CONFIRM_PHRASE
        });
      }

      // Intentionally bypasses public HAVKAR_REAL_PAYMENTS_ENABLED gate.
      // Public / events checkout remains paused; this path is Owner-only.
      const session = await createOwnerEur1CheckoutSession(
        getStripe(),
        allowedCheckoutOrigin(req)
      );

      return res.status(200).json({
        ok: true,
        public_collection: "paused",
        amount_eur: "1.00",
        session_id: session.id,
        url: session.url,
        expires_at: session.expires_at,
        livemode: session.livemode === true,
        note: "Complete payment in Stripe Checkout. Public card collection stays disabled."
      });
    } catch (error) {
      console.error(
        "Owner EUR1 checkout prepare failed",
        error && error.message
      );
      return sendError(res, 500, "Owner EUR 1 Checkout could not be prepared");
    }
  }

  if (isMainnetOwnershipRequest(req)) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "Method not allowed");
    }

    try {
      const {
        handleMainnetWalletOwnership
      } = await import("../lib/stellar-mainnet-ownership.cjs");
      const result = await handleMainnetWalletOwnership(req.body, {
        supabaseUrl: process.env.SUPABASE_URL,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
      });

      return res.status(result.status || 500).json(result);
    } catch (error) {
      console.error(
        "Mainnet wallet ownership verification failed",
        error && error.message
      );

      return sendError(
        res,
        500,
        "Mainnet wallet ownership verification failed"
      );
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return sendError(
      res,
      405,
      "Method not allowed"
    );
  }

  if (isOwnershipRequest(req)) {
    try {
      const { handleWalletOwnership } = await import("../lib/stellar-ownership.cjs");
      const result = await handleWalletOwnership(req.body, {
        supabaseUrl:
          process.env.HAVKAR_OWNERSHIP_SUPABASE_URL ||
          process.env.HAVKAR_STAGING_SUPABASE_URL ||
          process.env.SUPABASE_URL,
        serviceRoleKey:
          process.env.HAVKAR_OWNERSHIP_SUPABASE_SERVICE_ROLE_KEY ||
          process.env.HAVKAR_STAGING_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY
      });

      return res.status(result.status).json(result);
    } catch (error) {
      console.error(
        "Wallet ownership verification failed",
        error && error.message
      );

      return sendError(
        res,
        500,
        "Wallet ownership verification failed"
      );
    }
  }

  if (isAdBoostCheckoutRequest(req)) {
    try {
      const { handleAdBoostCheckout } = await import("../lib/ad-boost-checkout.cjs");
      return await handleAdBoostCheckout(req, res);
    } catch (error) {
      console.error(
        "Ads boost checkout failed",
        error && error.message
      );

      return sendError(
        res,
        500,
        "Ads boost checkout failed"
      );
    }
  }

  if (
    !process.env.STRIPE_SECRET_KEY ||
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error(
      "Missing required server environment variables"
    );

    return sendError(
      res,
      500,
      "Server configuration error"
    );
  }

  try {
    const {
      user,
      error: authError,
    } = await authenticateUser(req);

    if (authError || !user) {
      return sendError(
        res,
        401,
        authError || "Authentication required"
      );
    }

    if (req.body?.payment_method === "xlm") {
      const {
        resolveRequestCountry
      } = require("../lib/crypto-geo-policy.cjs");
      const requestGeo = resolveRequestCountry(req);

      if (req.body?.action === "verify" || req.body?.action === "refund") {
        const settled = await verifyStellarSettlement(
          getSupabaseAdmin(),
          user.id,
          req.body,
          { geo: requestGeo }
        );

        if (
          req.body?.action === "verify" &&
          settled.ok === true &&
          settled.order_paid === true
        ) {
          const fulfilled = await fulfillSettledXlmIntent(
            getSupabaseAdmin(),
            user.id,
            req.body?.intent_id
          );

          return res.status(settled.status).json({
            ...settled,
            intent_id: req.body?.intent_id || null,
            tx_hash: req.body?.tx_hash || null,
            ticket_id: fulfilled.ticket_id || null,
            ticket_code: fulfilled.ticket_code || null,
            fulfillment: fulfilled.fulfillment || null,
            fulfillment_error: fulfilled.error || null
          });
        }

        return res.status(settled.status).json({
          ...settled,
          intent_id: req.body?.intent_id || null,
          tx_hash: req.body?.tx_hash || null
        });
      }

      const decision = evaluateStellarCheckout({
        ...req.body,
        _geo: requestGeo
      });

      if (!decision.ok) {
        return res.status(decision.status).json(decision);
      }

      const subjectCheck = await validateXlmQuoteSubject(
        getSupabaseAdmin(),
        user.id,
        decision
      );

      if (!subjectCheck.ok) {
        return res.status(subjectCheck.status).json(subjectCheck);
      }

      const quoted = await buildXlmQuote(decision, {
        merchantDestination: subjectCheck.merchant_stellar_receive || null
      });

      if (!quoted.ok) {
        return res.status(quoted.status).json(quoted);
      }

      const saved = await saveUnpaidIntent(
        getSupabaseAdmin(),
        user.id,
        quoted
      );

      if (!saved.ok) {
        return res.status(503).json({
          ok: false,
          paid: false,
          order_paid: false,
          error: saved.error
        });
      }

      return res.status(200).json({
        ...quoted,
        intent_id: saved.id,
        paid: false,
        order_paid: false
      });
    }

    const eventId =
      Number(req.body?.event_id);

    const quantity =
      safeQuantity(req.body?.quantity);

    if (
      !Number.isSafeInteger(eventId) ||
      eventId <= 0
    ) {
      return sendError(
        res,
        400,
        "Invalid event"
      );
    }

    if (!quantity) {
      return sendError(
        res,
        400,
        "Invalid quantity"
      );
    }

    const {
      data: event,
      error: eventError,
    } = await getSupabaseAdmin()
      .from("events")
      .select(
        "id,title,price,max_attendees,is_public,status,event_date,event_time,location"
      )
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) {
      throw eventError;
    }

    if (!event) {
      return sendError(
        res,
        404,
        "Event not found"
      );
    }

    if (event.is_public !== true) {
      return sendError(
        res,
        403,
        "This event is not publicly available"
      );
    }

    if (
      String(event.status || "")
        .toLowerCase() !== "active"
    ) {
      return sendError(
        res,
        409,
        "This event is not active"
      );
    }

    const unitPrice =
      normalizePrice(event.price);

    if (unitPrice === null) {
      console.error(
        "Invalid event price:",
        event.id,
        event.price
      );

      return sendError(
        res,
        409,
        "This event does not have a valid ticket price"
      );
    }

    const maxAttendees =
      event.max_attendees === null ||
      event.max_attendees === undefined
        ? null
        : Number(event.max_attendees);

    if (
      maxAttendees !== null &&
      (
        !Number.isSafeInteger(maxAttendees) ||
        maxAttendees < 1
      )
    ) {
      return sendError(
        res,
        409,
        "Invalid event capacity"
      );
    }

    if (maxAttendees !== null) {
      const reserved =
        await countReservedTickets(eventId);

      if (
        reserved + quantity >
        maxAttendees
      ) {
        return sendError(
          res,
          409,
          "Not enough tickets are available"
        );
      }
    }

    const totalAmount =
      Number(
        (unitPrice * quantity).toFixed(2)
      );

    const origin = allowedCheckoutOrigin(req);

    // Event ticket prices are EUR-denominated today. USD/other fiat is accepted
    // only when explicitly requested and allow-listed; no silent FX conversion.
    const fiat = normalizeStripeFiatCurrency(
      req.body?.currency || "eur"
    );

    if (!fiat.ok) {
      return sendError(res, 400, fiat.error);
    }

    if (fiat.currency !== "eur") {
      return sendError(
        res,
        409,
        "Event tickets are priced in EUR. USD checkout requires an owner-approved FX policy and is not enabled."
      );
    }

    const requestedTicketType = normalizeTicketType(
      req.body?.ticket_type,
      unitPrice
    );

    if (unitPrice === 0) {
      const ticketCode = generateTicketCode();
      const {
        data: freeTicket,
        error: freeTicketError,
      } = await getSupabaseAdmin()
        .from("event_tickets")
        .insert({
          user_id: user.id,
          event_id: eventId,
          quantity,
          unit_price: 0,
          currency: fiat.currencyUpper,
          total_amount: 0,
          payment_status: "paid",
          ticket_status: "valid",
          payment_provider: "free",
          payment_reference: null,
          paid_at: new Date().toISOString(),
          ticket_code: ticketCode,
          ticket_type: requestedTicketType === "vip" ? "vip" : "free",
          hold_expires_at: null,
        })
        .select("id,ticket_code")
        .single();

      if (freeTicketError) {
        throw freeTicketError;
      }

      await getSupabaseAdmin().from("event_ticket_events").insert({
        ticket_id: freeTicket.id,
        event_id: eventId,
        actor_user_id: user.id,
        action: "issue_free",
        detail: {
          ticket_code: freeTicket.ticket_code || ticketCode,
          quantity
        }
      });

      return res.status(200).json({
        ok: true,
        free: true,
        ticket_id: freeTicket.id,
        ticket_code: freeTicket.ticket_code || ticketCode,
      });
    }

    const cardGate = eventCardCheckoutAllowed(req.body || {});
    if (!cardGate.allowed) {
      return res.status(403).json({
        ok: false,
        error: "Card payments are paused until the owner enables them.",
        code: "REAL_PAYMENTS_PAUSED",
      });
    }

    const ticketCode = generateTicketCode();
    const {
      data: pendingTicket,
      error: ticketError,
    } = await getSupabaseAdmin()
      .from("event_tickets")
      .insert({
        user_id: user.id,
        event_id: eventId,
        quantity,
        unit_price: unitPrice,
        currency: fiat.currencyUpper,
        total_amount: totalAmount,
        payment_status: "pending",
        ticket_status: "pending",
        payment_provider: "stripe",
        payment_reference: null,
        paid_at: null,
        ticket_code: ticketCode,
        ticket_type: requestedTicketType,
        hold_expires_at: holdExpiresAtIso(30),
      })
      .select("id,ticket_code")
      .single();

    if (ticketError) {
      throw ticketError;
    }

    let session;

    try {
      // Omit payment_method_types so Stripe Dashboard dynamic PMs apply.
      // Idempotency protects against double-charge on retries.
      session =
        await getStripe().checkout.sessions.create(
          {
            mode: "payment",

            customer_email:
              user.email || undefined,

            line_items: [
              {
                quantity,

                price_data: {
                  currency: fiat.currency,

                  unit_amount: Math.round(
                    unitPrice * 100
                  ),

                  product_data: {
                    name:
                      event.title ||
                      "HAVKAR Event Ticket",

                    description:
                      event.location
                        ? `HAVKAR event ticket — ${event.location}`
                        : "HAVKAR event ticket",
                  },
                },
              },
            ],

            metadata: {
              event_ticket_id:
                String(pendingTicket.id),

              event_id:
                String(eventId),

              havkar_user_id:
                String(user.id),

              havkar_currency:
                fiat.currencyUpper,

              havkar_flow: "events",
              ...(cardGate.mode === "stripe_test"
                ? { test_mode: "true", havkar_test_mode: "true" }
                : {})
            },

            payment_intent_data: {
              metadata: {
                event_ticket_id:
                  String(pendingTicket.id),

                event_id:
                  String(eventId),

                havkar_user_id:
                  String(user.id),

                havkar_currency:
                  fiat.currencyUpper,

                havkar_flow: "events",
                ...(cardGate.mode === "stripe_test"
                  ? { test_mode: "true", havkar_test_mode: "true" }
                  : {})
              },
            },

            success_url:
              `${origin}/events.html?payment=success&ticket_id=${encodeURIComponent(
                pendingTicket.id
              )}&open=my-event-tickets&session_id={CHECKOUT_SESSION_ID}`,

            cancel_url:
              `${origin}/events.html?payment=cancelled&ticket_id=${encodeURIComponent(
                pendingTicket.id
              )}`,
          },
          {
            idempotencyKey:
              "havkar-event-ticket-" +
              String(pendingTicket.id)
          }
        );
    } catch (stripeError) {
      const {
        error: cleanupError,
      } = await getSupabaseAdmin()
        .from("event_tickets")
        .delete()
        .eq("id", pendingTicket.id)
        .eq("user_id", user.id)
        .eq("payment_status", "pending");

      if (cleanupError) {
        console.error(
          "Could not clean up pending HAVKAR ticket:",
          pendingTicket.id,
          cleanupError
        );
      }

      throw stripeError;
    }

    const {
      error: referenceError,
    } = await getSupabaseAdmin()
      .from("event_tickets")
      .update({
        payment_reference: session.id,
      })
      .eq("id", pendingTicket.id)
      .eq("payment_status", "pending");

    if (referenceError) {
      console.error(
        "Could not store Stripe Checkout Session reference:",
        referenceError
      );
    }

    if (!session.url) {
      throw new Error(
        "Stripe Checkout Session has no URL"
      );
    }

    await getSupabaseAdmin().from("event_ticket_events").insert({
      ticket_id: pendingTicket.id,
      event_id: eventId,
      actor_user_id: user.id,
      action: "hold_created",
      detail: {
        ticket_code: pendingTicket.ticket_code || ticketCode,
        hold_expires_at: holdExpiresAtIso(30),
        quantity
      }
    });

    return res.status(200).json({
      ok: true,
      free: false,
      ticket_id: pendingTicket.id,
      ticket_code: pendingTicket.ticket_code || ticketCode,
      checkout_url: session.url,
    });
  } catch (error) {
    console.error(
      "HAVKAR create-event-checkout error:",
      error
    );

    return sendError(
      res,
      500,
      "Unable to create checkout"
    );
  }
}
