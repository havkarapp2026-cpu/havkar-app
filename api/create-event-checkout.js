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
  buildMarketplaceDestinationCheckoutParams,
  createRecipientAccountV2,
  createRecipientAccountOnboardingLink
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

function isStripeSandboxPayoutE2eRequest(req) {
  const action = String((req && req.body && req.body.action) || "");
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "stripeSandboxPayoutE2e") ||
      url.indexOf("stripe-sandbox-payout-e2e") !== -1 ||
      action === "stripe_sandbox_payout_e2e"
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
      action === "marketplace_connect_quote" ||
      action === "marketplace_buy_checkout"
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

function isFinanceApiRequest(req) {
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "finance") ||
      url.indexOf("havkarAction=finance") !== -1 ||
      url.indexOf("/api/finance") !== -1
  );
}

function isChatNotifyRequest(req) {
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "chatNotify") ||
      url.indexOf("havkarAction=chatNotify") !== -1 ||
      url.indexOf("/api/chat-notify") !== -1
  );
}

function isCurrencyMatrixRequest(req) {
  const action = String((req && req.body && req.body.action) || "");
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "currencyMatrix") ||
      url.indexOf("/api/currency-matrix") !== -1 ||
      action === "currency_matrix" ||
      action === "currency_quote"
  );
}

function isGlobalPaymentsRequest(req) {
  const action = String((req && req.body && req.body.action) || "");
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "globalPayments") ||
      url.indexOf("/api/global-payments") !== -1 ||
      url.indexOf("havkarAction=globalPayments") !== -1 ||
      action === "global_payments_catalog" ||
      action === "global_payment_quote" ||
      action === "global_live_checkout"
  );
}

function isHotelsRequest(req) {
  const action = String((req && req.body && req.body.action) || "");
  const url = String((req && req.url) || "");
  return Boolean(
    (req && req.query && req.query.havkarAction === "hotels") ||
      url.indexOf("/api/hotels") !== -1 ||
      url.indexOf("havkarAction=hotels") !== -1 ||
      action === "hotels_search" ||
      action === "hotels_status" ||
      action === "hotels_duffel_probe" ||
      action === "hotels_quote" ||
      action === "hotels_book" ||
      action === "hotels_cancel" ||
      action === "hotels_history" ||
      action === "hotels_owner_status" ||
      action === "hotels_payment_methods" ||
      action === "hotels_geocode" ||
      action === "hotels_stripe_currency_audit" ||
      action === "hotels_owner_rooms" ||
      action === "hotels_payment_probe"
  );
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
      "Automatic XLM subscription debits remain unsupported — use prepaid ai_credits / jobs_listing / business_listing one-time flows only."
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
      presentment_currency_count: allowedStripeFiatCurrencies().length,
      stripe_account_country: "IT",
      settlement_currency: "eur",
      display_vs_charge_vs_settlement:
        "display=buyer presentment; charge=Checkout/PI presentment; settlement=EUR to Revolut …8455",
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
    duffel: require("../lib/duffel-live-ready.cjs").classifyDuffelAccessToken(),
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
      supported_flows: [
        "marketplace",
        "services",
        "events",
        "ads",
        "jobs_listing",
        "business_listing",
        "ai_credits",
        "flights"
      ],
      prepaid_only_note:
        "ai_credits, jobs_listing, and business_listing are one-time prepaid windows. Automatic XLM renewals are not claimed.",
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

  // UI historically stored free events as the word "Free".
  // Treat Free/gratis/0 as zero so free tickets still issue while card collection stays paused.
  if (/^(free|gratis|0+|0+[.,]0+)$/i.test(text)) {
    return 0;
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

  if (flow === "ads") {
    const adId = Number(subjectId);

    if (!Number.isSafeInteger(adId) || adId <= 0) {
      return {
        ok: false,
        status: 400,
        code: "SUBJECT_INVALID",
        error: "Ads subject_id must be an advertisement id.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const loaded = await admin
      .from("ads")
      .select("id,user_id,listing_surface,status")
      .eq("id", adId)
      .maybeSingle();

    const ad = loaded && loaded.data;

    if (!ad || String(ad.listing_surface || "") !== "advertising") {
      return {
        ok: false,
        status: 404,
        code: "AD_NOT_FOUND",
        error: "Advertisement was not found for XLM boost checkout.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (String(ad.user_id) !== String(userId)) {
      return {
        ok: false,
        status: 403,
        code: "AD_OWNER_REQUIRED",
        error: "Only the advertiser can pay for an XLM boost.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    return { ok: true, ad: ad };
  }

  if (flow === "jobs_listing") {
    const jobId = Number(subjectId);

    if (!Number.isSafeInteger(jobId) || jobId <= 0) {
      return {
        ok: false,
        status: 400,
        code: "SUBJECT_INVALID",
        error: "jobs_listing subject_id must be a job id.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const loaded = await admin
      .from("jobs")
      .select("id,user_id,status,monthly_fee")
      .eq("id", jobId)
      .maybeSingle();

    const job = loaded && loaded.data;

    if (!job) {
      return {
        ok: false,
        status: 404,
        code: "JOB_NOT_FOUND",
        error: "Job listing was not found for XLM prepaid checkout.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (String(job.user_id) !== String(userId)) {
      return {
        ok: false,
        status: 403,
        code: "JOB_OWNER_REQUIRED",
        error: "Only the employer can pay for this job listing.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    const listed = Number(job.monthly_fee);
    if (Number.isFinite(listed) && listed > 0) {
      if (Number(decision.fees.price) !== listed) {
        return {
          ok: false,
          status: 409,
          code: "PRICE_MISMATCH",
          error: "Quoted price does not match the job listing fee.",
          paid: false,
          order_paid: false,
          payable: false
        };
      }
    }

    return { ok: true, job: job };
  }

  if (flow === "business_listing") {
    const {
      BUSINESS_LISTING_PLANS
    } = require("../lib/havkar-global-payments.cjs");
    const plan = BUSINESS_LISTING_PLANS.find(
      (row) => row.id === subjectId
    );

    if (!plan) {
      return {
        ok: false,
        status: 400,
        code: "SUBJECT_INVALID",
        error: "business_listing subject_id must be a known prepaid plan id.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (Number(decision.fees.price) !== Number(plan.list_price_eur)) {
      return {
        ok: false,
        status: 409,
        code: "PRICE_MISMATCH",
        error: "Quoted price does not match the business listing plan.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    return { ok: true, business_plan: plan };
  }

  if (flow === "ai_credits") {
    const { AI_CREDIT_PACKS } = require("../lib/havkar-global-payments.cjs");
    const pack = AI_CREDIT_PACKS.find((row) => row.id === subjectId);

    if (!pack) {
      return {
        ok: false,
        status: 400,
        code: "SUBJECT_INVALID",
        error: "ai_credits subject_id must be a known credit pack id.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    if (Number(decision.fees.price) !== Number(pack.list_price_eur)) {
      return {
        ok: false,
        status: 409,
        code: "PRICE_MISMATCH",
        error: "Quoted price does not match the AI credit pack.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    return { ok: true, ai_pack: pack };
  }

  if (flow === "flights") {
    const offerId = String(subjectId || "");
    if (!/^off_[A-Za-z0-9_-]{6,}$/.test(offerId) && !/^[A-Za-z0-9_-]{8,80}$/.test(offerId)) {
      return {
        ok: false,
        status: 400,
        code: "SUBJECT_INVALID",
        error: "flights subject_id must be a Duffel offer id.",
        paid: false,
        order_paid: false,
        payable: false
      };
    }

    return {
      ok: true,
      flight_offer_id: offerId,
      note:
        "Flight live XLM collection remains Owner-gated. Quote/intent only until armed."
    };
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

  if (flow === "ads") {
    return {
      ticket_id: null,
      fulfillment: "ads_boost_intent",
      ad_id: intent.subject_id || null,
      payment_reference: intent.tx_hash || null,
      network: intent.network || null,
      error: null
    };
  }

  if (flow === "jobs_listing") {
    const jobId = Number(intent.subject_id);
    if (Number.isSafeInteger(jobId) && jobId > 0) {
      const updated = await admin
        .from("jobs")
        .update({ status: "active" })
        .eq("id", jobId)
        .eq("user_id", userId)
        .eq("status", "pending_payment")
        .select("id,status")
        .maybeSingle();

      if (!updated.data || String(updated.data.status) !== "active") {
        return {
          ticket_id: null,
          fulfillment: "jobs_listing_intent",
          job_id: jobId,
          payment_reference: intent.tx_hash || null,
          error:
            "Settlement verified. Job could not be activated (already active or unavailable)."
        };
      }

      return {
        ticket_id: null,
        fulfillment: "jobs_listing_activated",
        job_id: jobId,
        payment_reference: intent.tx_hash || null,
        network: intent.network || null,
        error: null
      };
    }
  }

  if (flow === "business_listing" || flow === "ai_credits" || flow === "flights") {
    return {
      ticket_id: null,
      fulfillment: flow + "_prepaid_intent",
      subject_id: intent.subject_id || null,
      payment_reference: intent.tx_hash || null,
      network: intent.network || null,
      renewal_note:
        "One-time prepaid settlement only. No automatic XLM renewal was scheduled.",
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
  if (isFinanceApiRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }
    try {
      const { handler: financeHandler } = require("../lib/havkar-finance-api.cjs");
      return await financeHandler(req, res);
    } catch (error) {
      console.error("HAVKAR finance API error:", error && error.message);
      return sendError(res, 500, "Finance API failed");
    }
  }

  if (isChatNotifyRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }
    try {
      const { handler: chatNotifyHandler } = require("../lib/havkar-chat-notify-api.cjs");
      return await chatNotifyHandler(req, res);
    } catch (error) {
      console.error("HAVKAR chat notify API error:", error && error.message);
      return sendError(res, 500, "Chat notify API failed");
    }
  }

  if (isPaymentStatusRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }

    return res.status(200).json(await buildPaymentActivationStatus());
  }

  if (isCurrencyMatrixRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }
    try {
      const {
        describeCurrencyMatrix,
        normalizeStripeFiatCurrency
      } = require("../lib/stripe-fiat-currency.cjs");
      const { quoteWithFees, fetchEurRates } = require("../lib/havkar-fx-rates.cjs");
      const {
        cardPaymentsAllowed,
        realPaymentsEnabled
      } = require("../lib/real-payments.cjs");
      const action = String(
        (req.query && req.query.action) ||
          (req.body && req.body.action) ||
          "currency_matrix"
      );
      if (action === "currency_quote") {
        const listEur = Number(
          (req.body && req.body.list_price_eur) ||
            (req.query && req.query.list_price_eur) ||
            0
        );
        const currency = String(
          (req.body && req.body.currency) ||
            (req.query && req.query.currency) ||
            "eur"
        );
        const normalized = normalizeStripeFiatCurrency(currency);
        if (!normalized.ok) {
          return sendError(res, 400, normalized.error);
        }
        if (!(listEur > 0)) {
          return sendError(res, 400, "list_price_eur must be a positive number");
        }
        const fx = await fetchEurRates();
        const quote = quoteWithFees(listEur, normalized.currencyUpper, fx.rates);
        if (!quote.ok) {
          return sendError(res, 400, quote.error || "quote_failed");
        }
        return res.status(200).json({
          ok: true,
          fx_date: fx.date,
          live_collection: cardPaymentsAllowed() ? "armed" : "paused",
          real_payments_enabled: realPaymentsEnabled(),
          quote
        });
      }
      return res.status(200).json({
        ok: true,
        live_collection: cardPaymentsAllowed() ? "armed" : "paused",
        real_payments_enabled: realPaymentsEnabled(),
        matrix: describeCurrencyMatrix()
      });
    } catch (error) {
      console.error("HAVKAR currency matrix error:", error && error.message);
      return sendError(res, 500, "Currency matrix failed");
    }
  }

  if (isGlobalPaymentsRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }

    try {
      const {
        moduleCatalog,
        buildGlobalPaymentQuote,
        refuseLiveCheckout
      } = require("../lib/havkar-global-payments.cjs");
      const action = String(
        (req.query && req.query.action) ||
          (req.body && req.body.action) ||
          "global_payments_catalog"
      );

      if (action === "global_live_checkout") {
        const refused = refuseLiveCheckout(
          (req.body && req.body.method) || null
        );
        return res.status(refused.status).json(refused);
      }

      if (action === "global_payment_quote") {
        const quoted = await buildGlobalPaymentQuote(req.body || {});
        return res.status(quoted.status || (quoted.ok ? 200 : 400)).json(quoted);
      }

      return res.status(200).json(moduleCatalog());
    } catch (error) {
      console.error("HAVKAR global payments error:", error && error.message);
      return sendError(res, 500, "Global payments catalog failed");
    }
  }

  if (isHotelsRequest(req)) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendError(res, 405, "Method not allowed");
    }

    try {
      const {
        listStripePresentmentCurrencies,
        PRESENTMENT_COUNT,
        isSupportedCheckoutCurrency,
        getCurrencyMeta
      } = require("../lib/stripe-supported-currencies-60.cjs");
      const {
        probeDuffelStaysAccess,
        searchDuffelStays
      } = require("../lib/duffel-stays.cjs");
      const {
        cardPaymentsAllowed,
        realPaymentsEnabled
      } = require("../lib/real-payments.cjs");
      const { mainnetCustomerLiveReady } = require("../lib/stellar-mainnet.cjs");
      const { buildGlobalPaymentQuote } = require("../lib/havkar-global-payments.cjs");
      const action = String(
        (req.query && req.query.action) ||
          (req.body && req.body.action) ||
          "hotels_status"
      );

      const publicLiveHotelBooking =
        String(process.env.HAVKAR_HOTELS_LIVE_BOOKING_ENABLED || "")
          .trim()
          .toLowerCase() === "true";

      if (action === "hotels_duffel_probe" || action === "hotels_status") {
        const stays = await probeDuffelStaysAccess(process.env);
        return res.status(200).json({
          ok: true,
          action: "hotels_status",
          public_live_booking: false,
          owner_live_booking_flag: publicLiveHotelBooking,
          providers: {
            havkar_direct: {
              inventory: "accommodation_listings",
              bookings_table: "accommodation_guest_bookings",
              booking_enabled_rpc: "havkar_accommodation_booking_enabled",
              note:
                "Direct owner inventory is separate from Duffel. Unverified owners cannot receive payouts."
            },
            duffel_stays: stays
          },
          payments: {
            stripe_presentment_count: PRESENTMENT_COUNT,
            settlement_currency: "eur",
            stripe_live: cardPaymentsAllowed(),
            xlm_live: mainnetCustomerLiveReady(),
            real_payments_enabled: realPaymentsEnabled(),
            xlm_for_duffel:
              "XLM checkout for Duffel Stays stays OFF until supplier funding/settlement is verified."
          },
          currencies: listStripePresentmentCurrencies().slice(0, 20),
          currency_total: PRESENTMENT_COUNT
        });
      }

      if (action === "hotels_payment_methods") {
        const currency = String(
          (req.body && req.body.currency) ||
            (req.query && req.query.currency) ||
            "eur"
        )
          .trim()
          .toLowerCase();
        if (!isSupportedCheckoutCurrency(currency)) {
          return sendError(
            res,
            400,
            "Currency is not in Stripe's verified presentment list."
          );
        }
        return res.status(200).json({
          ok: true,
          action: "hotels_payment_methods",
          currency: getCurrencyMeta(currency),
          settlement_currency: "eur",
          public_live_booking: false,
          methods: {
            stripe_dynamic:
              "Eligible methods come from Stripe account capabilities + customer location + currency at Checkout/PaymentIntent time (cards, Apple Pay, Google Pay, local PMs when available).",
            xlm_mainnet: {
              offered_for_havkar_direct: true,
              offered_for_duffel_stays: false,
              reason_duffel:
                "Supplier funding/settlement for Duffel Stays via XLM is not verified."
            },
            stripe_live_armed: cardPaymentsAllowed(),
            xlm_live_armed: mainnetCustomerLiveReady()
          }
        });
      }

      if (action === "hotels_search") {
        const city = String(
          (req.body && req.body.city) ||
            (req.query && req.query.city) ||
            ""
        ).trim();
        const checkIn = String(
          (req.body && req.body.check_in) ||
            (req.query && req.query.check_in) ||
            ""
        ).trim();
        const checkOut = String(
          (req.body && req.body.check_out) ||
            (req.query && req.query.check_out) ||
            ""
        ).trim();
        const adults = Number(
          (req.body && req.body.adults) ||
            (req.query && req.query.adults) ||
            2
        );
        const children = Number(
          (req.body && req.body.children) ||
            (req.query && req.query.children) ||
            0
        );
        const rooms = Number(
          (req.body && req.body.rooms) || (req.query && req.query.rooms) || 1
        );
        const currency = String(
          (req.body && req.body.currency) ||
            (req.query && req.query.currency) ||
            "eur"
        )
          .trim()
          .toLowerCase();
        const latitude = Number(
          (req.body && req.body.latitude) ||
            (req.query && req.query.latitude)
        );
        const longitude = Number(
          (req.body && req.body.longitude) ||
            (req.query && req.query.longitude)
        );

        let direct = [];
        try {
          const admin = getSupabaseAdmin();
          let query = admin
            .from("accommodation_listings")
            .select("id,title,summary,publication_status,property_id")
            .eq("publication_status", "published")
            .limit(40);
          if (city) {
            const safe = city.replace(/[%(),]/g, "").slice(0, 80);
            if (safe) {
              query = query.ilike("title", "%" + safe + "%");
            }
          }
          const loaded = await query;
          direct = (loaded && loaded.data) || [];
        } catch (_error) {
          direct = [];
        }

        let duffelSearch = {
          access: "skipped",
          results: [],
          requirement: "Coordinates required for Duffel geographic search."
        };
        if (Number.isFinite(latitude) && Number.isFinite(longitude) && checkIn && checkOut) {
          duffelSearch = await searchDuffelStays(
            {
              check_in: checkIn,
              check_out: checkOut,
              adults,
              children,
              rooms,
              latitude,
              longitude
            },
            process.env
          );
        } else {
          const stays = await probeDuffelStaysAccess(process.env);
          duffelSearch = {
            access: stays.access,
            stays_ready: stays.stays_ready === true,
            results: [],
            note:
              stays.requirement ||
              "Provide check-in/out + map coordinates for Duffel Stays search. Probe-only status returned."
          };
        }

        return res.status(200).json({
          ok: true,
          action: "hotels_search",
          public_live_booking: false,
          query: {
            city: city || null,
            check_in: checkIn || null,
            check_out: checkOut || null,
            adults: Number.isFinite(adults) ? adults : 2,
            children: Number.isFinite(children) ? children : 0,
            rooms: Number.isFinite(rooms) ? rooms : 1,
            currency: isSupportedCheckoutCurrency(currency) ? currency : "eur",
            latitude: Number.isFinite(latitude) ? latitude : null,
            longitude: Number.isFinite(longitude) ? longitude : null
          },
          results: {
            havkar_direct: direct.map((row) => ({
              provider: "havkar_direct",
              id: row.id,
              property_id: row.property_id,
              title: row.title,
              summary: row.summary,
              bookable: false,
              reason:
                "Guest booking checkout stays gated until Owner enables accommodation booking + verified payments."
            })),
            duffel_stays: duffelSearch
          },
          payments_ready: {
            stripe: cardPaymentsAllowed(),
            xlm: mainnetCustomerLiveReady()
          },
          stripe_presentment_count: PRESENTMENT_COUNT
        });
      }

      if (action === "hotels_quote") {
        const listPrice = Number(
          (req.body && req.body.list_price_eur) || 0
        );
        const currency = String(
          (req.body && req.body.currency) || "eur"
        )
          .trim()
          .toLowerCase();
        const method = String((req.body && req.body.method) || "stripe")
          .trim()
          .toLowerCase();
        const provider = String((req.body && req.body.provider) || "havkar_direct")
          .trim()
          .toLowerCase();

        if (provider === "duffel_stays" && (method === "xlm" || method === "xlm_mainnet")) {
          return res.status(403).json({
            ok: false,
            code: "XLM_DUFFEL_STAYS_BLOCKED",
            error:
              "XLM is not offered for Duffel Stays until supplier funding/settlement is verified."
          });
        }

        const quote = await buildGlobalPaymentQuote({
          module: "hotels",
          method,
          currency,
          list_price_eur: listPrice,
          subject_id: String((req.body && req.body.listing_id) || "hotel_quote"),
          idempotency_key:
            String((req.body && req.body.idempotency_key) || "") ||
            "hotels-quote-" + Date.now()
        });

        return res.status(quote.status || (quote.ok ? 200 : 400)).json({
          ...quote,
          action: "hotels_quote",
          public_live_booking: false,
          taxes_note:
            "Taxes and service fees must be disclosed from supplier/property before charge.",
          cancellation_note:
            "Cancellation/refund terms come from the property policy or Duffel rate conditions."
        });
      }

      if (action === "hotels_book") {
        if (!publicLiveHotelBooking) {
          return res.status(403).json({
            ok: false,
            code: "HOTELS_LIVE_BOOKING_OFF",
            error:
              "Public live hotel booking is OFF. Owner must set HAVKAR_HOTELS_LIVE_BOOKING_ENABLED=true after verification.",
            public_live_booking: false
          });
        }

        const auth = await authenticateUser(req);
        if (!auth.user) {
          return sendError(res, 401, auth.error || "Authentication required");
        }

        return res.status(403).json({
          ok: false,
          code: "HOTELS_BOOKING_NOT_ARMED",
          error:
            "Booking pipeline requires verified inventory acceptance + payment settlement before confirmation. Not armed for public traffic."
        });
      }

      if (action === "hotels_cancel") {
        const auth = await authenticateUser(req);
        if (!auth.user) {
          return sendError(res, 401, auth.error || "Authentication required");
        }
        const reference = String(
          (req.body && req.body.booking_reference) || ""
        ).trim();
        if (!reference) {
          return sendError(res, 400, "booking_reference required");
        }
        try {
          const admin = getSupabaseAdmin();
          const loaded = await admin
            .from("accommodation_guest_bookings")
            .select("id,status,guest_user_id,booking_reference")
            .eq("booking_reference", reference)
            .eq("guest_user_id", auth.user.id)
            .maybeSingle();
          if (!loaded.data) {
            return sendError(res, 404, "Booking not found");
          }
          if (loaded.data.status === "confirmed" || loaded.data.status === "paid_pending_supplier") {
            return res.status(403).json({
              ok: false,
              code: "CANCEL_REQUIRES_REFUND_WORKFLOW",
              error:
                "Confirmed bookings cancel only through verified refund workflow. Public auto-cancel is OFF."
            });
          }
          const updated = await admin
            .from("accommodation_guest_bookings")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", loaded.data.id)
            .select("id,booking_reference,status")
            .single();
          return res.status(200).json({
            ok: true,
            action: "hotels_cancel",
            booking: updated.data
          });
        } catch (error) {
          return sendError(res, 500, "Cancel failed");
        }
      }

      if (action === "hotels_history") {
        const auth = await authenticateUser(req);
        if (!auth.user) {
          return sendError(res, 401, auth.error || "Authentication required");
        }
        try {
          const admin = getSupabaseAdmin();
          const loaded = await admin
            .from("accommodation_guest_bookings")
            .select(
              "id,booking_reference,provider,check_in,check_out,status,currency,total_cents,created_at"
            )
            .eq("guest_user_id", auth.user.id)
            .order("created_at", { ascending: false })
            .limit(50);
          return res.status(200).json({
            ok: true,
            action: "hotels_history",
            bookings: (loaded && loaded.data) || []
          });
        } catch (_error) {
          return res.status(200).json({
            ok: true,
            action: "hotels_history",
            bookings: [],
            note: "Bookings table unavailable until migration is applied."
          });
        }
      }

      if (action === "hotels_owner_status") {
        const auth = await authenticateUser(req);
        if (!auth.user) {
          return sendError(res, 401, auth.error || "Authentication required");
        }
        try {
          const admin = getSupabaseAdmin();
          const operator = await admin
            .from("accommodation_operators")
            .select("id,identity_status,phone_confirmed_at")
            .eq("user_id", auth.user.id)
            .maybeSingle();
          if (!operator.data) {
            return res.status(200).json({
              ok: true,
              action: "hotels_owner_status",
              operator: null,
              properties: [],
              payouts_eligible: false,
              note: "Register via accommodation-apply before owner tools unlock."
            });
          }
          const properties = await admin
            .from("accommodation_properties")
            .select("id,display_name,property_status")
            .eq("operator_id", operator.data.id);
          const propertyIds = (properties.data || []).map((row) => row.id);
          let rooms = [];
          if (propertyIds.length) {
            const roomLoad = await admin
              .from("accommodation_rooms")
              .select("id,property_id,name,category,max_adults,max_children,quantity")
              .in("property_id", propertyIds);
            rooms = (roomLoad && roomLoad.data) || [];
          }
          const payoutsEligible =
            operator.data.identity_status === "verified" &&
            (properties.data || []).some(
              (row) => row.property_status === "approved"
            );
          return res.status(200).json({
            ok: true,
            action: "hotels_owner_status",
            operator: {
              id: operator.data.id,
              identity_status: operator.data.identity_status
            },
            properties: properties.data || [],
            rooms,
            payouts_eligible: payoutsEligible === true,
            payouts_note:
              "Property registration does not authorize unverified owners to receive payouts. Stripe Connect country/currency capability checks still apply.",
            staff_permissions: "Owner tools only; staff roles require admin assignment."
          });
        } catch (error) {
          return sendError(res, 500, "Owner status failed");
        }
      }

      if (action === "hotels_geocode") {
        const { geocodeDestination } = require("../lib/geocode-destination.cjs");
        const query = String(
          (req.body && (req.body.query || req.body.city || req.body.destination)) ||
            (req.query && (req.query.query || req.query.city)) ||
            ""
        );
        const geo = await geocodeDestination(query);
        return res.status(geo.ok ? 200 : 404).json({
          action: "hotels_geocode",
          ...geo
        });
      }

      if (action === "hotels_stripe_currency_audit") {
        const {
          buildCurrencyAudit
        } = require("../lib/stripe-currency-capability-audit.cjs");
        let account = null;
        try {
          account = await getStripe().accounts.retrieve();
        } catch (error) {
          return sendError(
            res,
            500,
            "Unable to retrieve Stripe account for currency audit"
          );
        }
        const audit = buildCurrencyAudit(account, []);
        return res.status(200).json({
          ok: true,
          action: "hotels_stripe_currency_audit",
          public_live_booking: false,
          ...audit,
          stripe_api_accepted_extra_vs_prior_60_removed: true
        });
      }

      if (action === "hotels_owner_rooms") {
        const auth = await authenticateUser(req);
        if (!auth.user) {
          return sendError(res, 401, auth.error || "Authentication required");
        }
        const propertyId = String(
          (req.body && req.body.property_id) || ""
        ).trim();
        const name = String((req.body && req.body.name) || "").trim();
        const category = String((req.body && req.body.category) || "standard")
          .trim()
          .toLowerCase();
        if (!propertyId || name.length < 2) {
          return sendError(res, 400, "property_id and room name required");
        }
        try {
          const admin = getSupabaseAdmin();
          const property = await admin
            .from("accommodation_properties")
            .select("id,operator_id,accommodation_operators!inner(user_id)")
            .eq("id", propertyId)
            .maybeSingle();
          const ownerId =
            property.data &&
            property.data.accommodation_operators &&
            property.data.accommodation_operators.user_id;
          if (!property.data || ownerId !== auth.user.id) {
            // Fallback without join shape
            const op = await admin
              .from("accommodation_operators")
              .select("id")
              .eq("user_id", auth.user.id)
              .maybeSingle();
            const owned = await admin
              .from("accommodation_properties")
              .select("id")
              .eq("id", propertyId)
              .eq("operator_id", op.data && op.data.id)
              .maybeSingle();
            if (!owned.data) {
              return sendError(res, 403, "Not your property");
            }
          }
          const inserted = await admin
            .from("accommodation_rooms")
            .insert({
              property_id: propertyId,
              name,
              category,
              max_adults: Math.max(
                1,
                Math.min(20, Number((req.body && req.body.max_adults) || 2))
              ),
              max_children: Math.max(
                0,
                Math.min(20, Number((req.body && req.body.max_children) || 0))
              ),
              quantity: Math.max(
                1,
                Math.min(500, Number((req.body && req.body.quantity) || 1))
              ),
              description: String((req.body && req.body.description) || "").slice(
                0,
                4000
              ) || null
            })
            .select("id,property_id,name,category,quantity,max_adults,max_children")
            .single();
          if (inserted.error) {
            return sendError(res, 400, inserted.error.message || "Room save failed");
          }
          return res.status(200).json({
            ok: true,
            action: "hotels_owner_rooms",
            room: inserted.data,
            note: "Room inventory saved. Public booking stays gated."
          });
        } catch (error) {
          return sendError(res, 500, "Room inventory failed");
        }
      }

      if (action === "hotels_payment_probe") {
        // Verifies quote rails without creating public live charges.
        const method = String((req.body && req.body.method) || "stripe")
          .trim()
          .toLowerCase();
        const currency = String((req.body && req.body.currency) || "eur")
          .trim()
          .toLowerCase();
        const quote = await buildGlobalPaymentQuote({
          module: "hotels",
          method,
          currency,
          list_price_eur: Number((req.body && req.body.list_price_eur) || 80),
          subject_id: "hotels_payment_probe",
          idempotency_key: "hotels-probe-" + Date.now()
        });
        return res.status(quote.status || (quote.ok ? 200 : 400)).json({
          ...quote,
          action: "hotels_payment_probe",
          public_live_booking: false,
          charge_created: false,
          note:
            "Probe only — no PaymentIntent/Checkout Session created. Public live hotel payments stay OFF."
        });
      }

      return sendError(res, 400, "Unknown hotels action");
    } catch (error) {
      console.error("HAVKAR hotels error:", error && error.message);
      return sendError(res, 500, "Hotels request failed");
    }
  }

  if (isStripeSandboxPayoutE2eRequest(req)) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendError(res, 405, "Method not allowed");
    }
    try {
      const {
        runSandboxPaymentScenario
      } = require("../lib/stripe-sandbox-payment-e2e.cjs");
      const result = await runSandboxPaymentScenario(process.env, req.body);
      return res.status(result.httpStatus || (result.ok ? 200 : 500)).json(result);
    } catch (error) {
      console.error("HAVKAR staging sandbox payment e2e error:", error && error.message);
      return res.status(500).json({
        ok: false,
        code: "SANDBOX_PAYMENT_E2E_FAILED",
        error: "Sandbox payment e2e failed"
      });
    }
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
      const currencyRaw = String((req.body && req.body.currency) || "eur");
      let currencyQuote = null;
      try {
        const { normalizeStripeFiatCurrency } = require("../lib/stripe-fiat-currency.cjs");
        const { quoteWithFees, fetchEurRates } = require("../lib/havkar-fx-rates.cjs");
        const normalized = normalizeStripeFiatCurrency(currencyRaw);
        if (normalized.ok) {
          const fx = await fetchEurRates();
          currencyQuote = quoteWithFees(listPrice, normalized.currencyUpper, fx.rates);
        }
      } catch (_e) {
        currencyQuote = null;
      }
      return res.status(200).json({
        ok: true,
        live_collection: cardPaymentsAllowed() ? "armed" : "paused",
        public_live_payments: false,
        split,
        currency_quote: currencyQuote
      });
    }

    if (action === "marketplace_buy_checkout") {
      const authBuy = await authenticateUser(req);
      if (!authBuy.user) {
        return sendError(res, 401, authBuy.error || "Authentication required");
      }
      try {
        const listingId = String((req.body && req.body.listing_id) || "").trim();
        const currencyRaw = String((req.body && req.body.currency) || "eur");
        if (!listingId) {
          return sendError(res, 400, "listing_id is required");
        }
        const {
          normalizeStripeFiatCurrency,
          toMinorUnits
        } = require("../lib/stripe-fiat-currency.cjs");
        const { quoteWithFees, fetchEurRates } = require("../lib/havkar-fx-rates.cjs");
        const normalized = normalizeStripeFiatCurrency(currencyRaw);
        if (!normalized.ok) {
          return sendError(res, 400, normalized.error || "Unsupported currency");
        }

        // Production marketplace rows live in public.ads (not advertisements).
        const { data: ad, error: adError } = await getSupabaseAdmin()
          .from("ads")
          .select(
            "id,title,price,currency,user_id,status,listing_surface,expires_at"
          )
          .eq("id", listingId)
          .maybeSingle();
        if (adError || !ad) {
          return sendError(res, 404, "Listing not found");
        }
        if (String(ad.user_id) === String(authBuy.user.id)) {
          return sendError(res, 400, "You cannot buy your own listing");
        }
        const surface = String(ad.listing_surface || "marketplace").toLowerCase();
        if (
          surface &&
          surface !== "marketplace" &&
          surface !== "buy_sell" &&
          surface !== "buysell"
        ) {
          return sendError(
            res,
            400,
            "This listing is not available for Buy Now checkout"
          );
        }
        const listPrice = Number(ad.price);
        if (!Number.isFinite(listPrice) || listPrice <= 0) {
          return sendError(res, 400, "Listing has no purchasable price");
        }

        const fx = await fetchEurRates();
        const listingCurrency = String(ad.currency || "EUR").toUpperCase();
        let listPriceEur = listPrice;
        if (listingCurrency !== "EUR") {
          const rate = fx.rates[listingCurrency];
          if (!rate) {
            return sendError(
              res,
              400,
              "Cannot convert listing currency " + listingCurrency + " to EUR for checkout"
            );
          }
          listPriceEur = Math.round((listPrice / Number(rate)) * 100) / 100;
        }
        const currencyQuote = quoteWithFees(
          listPriceEur,
          normalized.currencyUpper,
          fx.rates
        );
        if (!currencyQuote.ok) {
          return sendError(res, 400, currencyQuote.error || "quote_failed");
        }
        const buyerMinor = toMinorUnits(
          currencyQuote.buyer_pays,
          normalized.currency
        );
        const feeMinor = toMinorUnits(
          currencyQuote.platform_fee,
          normalized.currency
        );
        if (!buyerMinor.ok || !feeMinor.ok) {
          return sendError(res, 400, "Could not convert amounts to Stripe minor units");
        }
        const split = marketplaceCardSplit(listPriceEur);
        const liveArmed = cardPaymentsAllowed();
        const testAllowed =
          stripeTestCheckoutAllowed() &&
          req.body &&
          req.body.test_mode === true;
        const receipt = {
          listing_id: String(ad.id),
          listing_title: ad.title || "HAVKAR listing",
          list_price_eur: listPriceEur,
          presentment_currency: normalized.currencyUpper,
          buyer_pays: currencyQuote.buyer_pays,
          seller_receives: currencyQuote.seller_receives,
          platform_fee: currencyQuote.platform_fee,
          fx_rate: currencyQuote.fx_rate,
          fx_date: fx.date,
          live_collection: liveArmed ? "armed" : "paused",
          public_live_payments: false
        };

        if (!liveArmed && !testAllowed) {
          return res.status(200).json({
            ok: true,
            charged: false,
            code: "LIVE_COLLECTION_PAUSED",
            message:
              "Checkout quote ready. Public live card collection stays OFF without Owner authorization.",
            receipt,
            split,
            currency_quote: currencyQuote,
            checkout_url: null
          });
        }

        const sellerConnect = await getSupabaseAdmin()
          .from("marketplace_seller_connect_accounts")
          .select(
            "stripe_account_id,charges_enabled,payouts_enabled,onboarding_status"
          )
          .eq("user_id", ad.user_id)
          .maybeSingle();
        const connectedAccountId =
          sellerConnect.data &&
          sellerConnect.data.charges_enabled === true
            ? sellerConnect.data.stripe_account_id
            : null;

        const origin = allowedCheckoutOrigin(req);
        const successUrl =
          origin +
          "/ad-details.html?id=" +
          encodeURIComponent(String(ad.id)) +
          "&paid=1";
        const cancelUrl =
          origin +
          "/ad-details.html?id=" +
          encodeURIComponent(String(ad.id)) +
          "&paid=0";

        let sessionParams;
        if (connectedAccountId) {
          const presentmentSplit = {
            ...split,
            buyer_pays_cents: buyerMinor.amount_minor,
            application_fee_cents: feeMinor.amount_minor
          };
          sessionParams = buildMarketplaceDestinationCheckoutParams({
            split: presentmentSplit,
            connectedAccountId,
            listingTitle: ad.title || "HAVKAR marketplace purchase",
            currency: normalized.currency,
            successUrl,
            cancelUrl,
            customerEmail: authBuy.user.email,
            metadata: {
              listing_id: String(ad.id),
              havkar_user_id: String(authBuy.user.id),
              havkar_currency: normalized.currencyUpper,
              list_price_eur: String(listPriceEur)
            }
          });
        } else {
          sessionParams = {
            mode: "payment",
            customer_email: authBuy.user.email || undefined,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: normalized.currency,
                  unit_amount: buyerMinor.amount_minor,
                  product_data: {
                    name: ad.title || "HAVKAR marketplace purchase",
                    description:
                      "Includes HAVKAR buyer fee (2%). Seller Connect pending — platform collects."
                  }
                }
              }
            ],
            metadata: {
              listing_id: String(ad.id),
              havkar_user_id: String(authBuy.user.id),
              havkar_currency: normalized.currencyUpper,
              havkar_flow: "marketplace",
              list_price_eur: String(listPriceEur)
            },
            payment_intent_data: {
              metadata: {
                listing_id: String(ad.id),
                havkar_user_id: String(authBuy.user.id),
                havkar_currency: normalized.currencyUpper,
                havkar_flow: "marketplace"
              }
            },
            success_url: successUrl,
            cancel_url: cancelUrl
          };
        }
        if (testAllowed) {
          sessionParams.metadata = {
            ...(sessionParams.metadata || {}),
            test_mode: "true",
            havkar_test_mode: "true"
          };
        }

        const session = await getStripe().checkout.sessions.create(sessionParams);
        return res.status(200).json({
          ok: true,
          charged: false,
          checkout_url: session.url,
          session_id: session.id,
          receipt,
          split,
          currency_quote: currencyQuote,
          destination_charge: Boolean(connectedAccountId),
          live_collection: liveArmed ? "armed" : "paused",
          public_live_payments: false
        });
      } catch (error) {
        console.error(
          "marketplace_buy_checkout failed",
          error && error.message
        );
        return sendError(res, 500, "Buy Now checkout could not be prepared");
      }
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
        // Accounts v2 only — Accounts v1 create is blocked on this platform.
        const created = await createRecipientAccountV2(stripe, {
          email: auth.user.email,
          displayName:
            (auth.user.user_metadata && auth.user.user_metadata.full_name) ||
            "HAVKAR seller"
        });
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
      const accountLink = await createRecipientAccountOnboardingLink(stripe, {
        accountId,
        refreshUrl: `${origin}/market.html?connect=refresh`,
        returnUrl: `${origin}/market.html?connect=return`
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
        onboarding_url: accountLink.url || accountLink.link || null,
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
