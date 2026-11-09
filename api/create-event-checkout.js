import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { cardPaymentsAllowed } from "../lib/real-payments.cjs";
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

function buildPaymentActivationStatus() {
  const {
    stellarMainnetPaymentsEnabled,
    mainnetReady,
    MAINNET_FLAG,
    MAINNET_DESTINATION_ENV
  } = require("../lib/stellar-mainnet.cjs");

  const stripeKey = String(process.env.STRIPE_SECRET_KEY || "");
  const stripeMode = /^sk_live(?:_|\b)/.test(stripeKey)
    ? "live"
    : /^sk_test(?:_|\b)/.test(stripeKey)
      ? "test"
      : stripeKey
        ? "unknown"
        : "missing";

  const realEnabled = process.env.HAVKAR_REAL_PAYMENTS_ENABLED === "true";
  const cardsAllowed = cardPaymentsAllowed();
  const stellarMainnetFlag = stellarMainnetPaymentsEnabled();
  const stellarMainnetReady = mainnetReady();
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

  if (!stellarMainnetReady) {
    if (!stellarMainnetFlag) {
      blockers.push(
        "Set " + MAINNET_FLAG + "=true on Vercel Production to arm Stellar Mainnet quotes."
      );
    } else {
      blockers.push(
        "Set " +
          MAINNET_DESTINATION_ENV +
          " to the HAVKAR Mainnet receiving public key (G...). Never store a secret seed in env for this."
      );
    }
  }

  blockers.push(
    "XLM recurring/AI subscriptions remain unsupported — do not sell recurring access via one-time XLM."
  );
  blockers.push(
    "Apply migration 20261109033000_stellar_mainnet_payment_intents before Mainnet intents can be stored."
  );
  blockers.push(
    "Refunds require an Owner-signed return payment from the merchant account; server only verifies Horizon."
  );

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    customer_facing_collection: cardsAllowed ? "armed" : "paused",
    stellar_mainnet_collection: stellarMainnetReady ? "armed" : "paused",
    flags: {
      HAVKAR_REAL_PAYMENTS_ENABLED: realEnabled,
      HAVKAR_STRIPE_LIVE_ENABLED:
        process.env.HAVKAR_STRIPE_LIVE_ENABLED === "true",
      HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED: stellarMainnetFlag,
      STELLAR_MAINNET_PAYMENTS_ENABLED_SOURCE: true
    },
    stripe: {
      secret_key_mode: stripeMode,
      webhook_secret_configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      allowed_fiat: allowedStripeFiatCurrencies().map((c) => c.toUpperCase()),
      live_collection_allowed: cardsAllowed
    },
    stellar: {
      testnet_destination_configured: testnetDestinationConfigured,
      mainnet_payments_enabled_in_source: true,
      mainnet_flag: stellarMainnetFlag,
      mainnet_destination_configured: Boolean(
        String(process.env.HAVKAR_STELLAR_MAINNET_DESTINATION || "").trim()
      ),
      mainnet_ready: stellarMainnetReady,
      commissions: {
        marketplace_buyer_bps: 200,
        marketplace_seller_bps: 300,
        services_provider_bps: 1000
      },
      unsupported_flows: ["subscription", "recurring", "trade"]
    },
    owner_activation_required: !cardsAllowed || !stellarMainnetReady,
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
    return "https://havkar-app.vercel.app";
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
    const havkarHost = host === "havkar.online"
      || host.endsWith(".havkar.online")
      || host === "havkar-app.vercel.app"
      || (host.endsWith(".vercel.app") && host.includes("havkar"));

    if (url.protocol === "https:" && havkarHost) {
      return origin;
    }
  } catch {
    /* Use the public site when the request host is not a HAVKAR host. */
  }

  return "https://havkar-app.vercel.app";
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

async function countReservedTickets(eventId) {
  const {
    data,
    error,
  } = await getSupabaseAdmin()
    .from("event_tickets")
    .select("quantity")
    .eq("event_id", eventId)
    .eq("ticket_status", "valid")
    .eq("payment_status", "paid");

  if (error) {
    throw error;
  }

  return (data || []).reduce(
    (sum, row) =>
      sum + Number(row.quantity || 0),
    0
  );
}

/**
 * After Horizon verifies a Testnet XLM settlement, create the domain object
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

  if (String(intent.flow || "") !== "events") {
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
    .select("id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("payment_provider", paymentProvider)
    .eq("payment_reference", intent.tx_hash)
    .maybeSingle();

  if (existing && existing.data && existing.data.id) {
    return {
      ticket_id: existing.data.id,
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
      paid_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data) {
    return {
      ticket_id: null,
      fulfillment: null,
      error: "Settlement was verified but the event ticket could not be stored."
    };
  }

  return {
    ticket_id: inserted.data.id,
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

    return res.status(200).json(buildPaymentActivationStatus());
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
      if (req.body?.action === "verify" || req.body?.action === "refund") {
        const settled = await verifyStellarSettlement(
          getSupabaseAdmin(),
          user.id,
          req.body
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

      const decision = evaluateStellarCheckout(req.body);

      if (!decision.ok) {
        return res.status(decision.status).json(decision);
      }

      const quoted = await buildXlmQuote(decision);

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

    if (unitPrice === 0) {
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
        })
        .select("id")
        .single();

      if (freeTicketError) {
        throw freeTicketError;
      }

      return res.status(200).json({
        ok: true,
        free: true,
        ticket_id: freeTicket.id,
      });
    }

    if (!cardPaymentsAllowed()) {
      return res.status(403).json({
        ok: false,
        error: "Card payments are paused until the owner enables them.",
        code: "REAL_PAYMENTS_PAUSED",
      });
    }

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
      })
      .select("id")
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

    return res.status(200).json({
      ok: true,
      free: false,
      ticket_id: pendingTicket.id,
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
