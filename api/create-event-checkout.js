import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import { cardPaymentsAllowed } from "../lib/real-payments.cjs";
import {
  evaluateStellarCheckout,
  buildXlmQuote,
  verifyStellarSettlement,
  saveUnpaidIntent,
  xlmFromEur
} from "../lib/stellar-checkout.cjs";

const require = createRequire(import.meta.url);
const {
  isCommerceRoute,
  handleCommerceRoute
} = require("../havkar-commerce-api.js");
const {
  jobsPaymentMethods,
  servicesPaymentMethods
} = require("../lib/jobs-services-payments.cjs");
const jobBilling = require("../havkar-job-billing.js");

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

async function fetchDisplayXlmFromEur(buyerPaysEur) {
  const rateRes = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=eur&include_last_updated_at=true",
    { headers: { Accept: "application/json" } }
  );
  if (!rateRes.ok) {
    return { ok: false, error: "Exchange rate provider unavailable." };
  }
  const rateBody = await rateRes.json();
  const eurPer = Number(rateBody && rateBody.stellar && rateBody.stellar.eur);
  const updated = Number(
    rateBody && rateBody.stellar && rateBody.stellar.last_updated_at
  );
  if (!Number.isFinite(eurPer) || eurPer <= 0 || !buyerPaysEur) {
    return { ok: false, error: "Exchange rate missing." };
  }
  return {
    ok: true,
    display_only: true,
    payable: false,
    amount_xlm: xlmFromEur(buyerPaysEur, eurPer),
    eur_per_xlm: eurPer,
    network_fee_xlm: "0.00001",
    rate_as_of: Number.isFinite(updated)
      ? new Date(updated * 1000).toISOString()
      : null,
    rate_source: "coingecko:stellar:eur"
  };
}

export default async function handler(req, res) {
  const commerceRoute =
    typeof req.query?.havkarRoute === "string" ? req.query.havkarRoute : "";

  if (isCommerceRoute(commerceRoute)) {
    return handleCommerceRoute({
      route: commerceRoute,
      req,
      res,
      stripe: getStripe(),
      supabaseAdmin: getSupabaseAdmin(),
      authenticateUser,
      getOrigin
    });
  }

  const bodyAction = String((req.body && req.body.action) || "");

  if (
    req.method === "POST" &&
    (bodyAction === "jobs_payment_methods" ||
      bodyAction === "services_payment_methods" ||
      bodyAction === "jobs_quote" ||
      bodyAction === "services_quote")
  ) {
    if (bodyAction === "jobs_payment_methods") {
      return res.status(200).json(jobsPaymentMethods(process.env));
    }
    if (bodyAction === "services_payment_methods") {
      return res.status(200).json(servicesPaymentMethods(process.env));
    }

    const method = String((req.body && req.body.method) || "stripe");
    const isXlm = method === "xlm" || method === "xlm_mainnet";

    if (bodyAction === "jobs_quote") {
      const planName = String((req.body && req.body.plan) || "Professional");
      const ordinary = jobBilling.ORDINARY_PLANS[planName];
      const corporate = jobBilling.COMPANY_PLANS[planName];
      const listEur = ordinary
        ? ordinary.eur
        : corporate
          ? corporate.eur
          : null;
      if (listEur == null) {
        return res.status(400).json({
          ok: false,
          error: "Unknown jobs plan.",
          ordinary_plans: Object.keys(jobBilling.ORDINARY_PLANS),
          corporate_plans: Object.keys(jobBilling.COMPANY_PLANS)
        });
      }
      const catalog = jobsPaymentMethods(process.env);
      const chargeAllowed = Boolean(
        catalog.live_flag_armed &&
          ((isXlm &&
            catalog.methods.find((m) => m.id === "xlm_mainnet")
              ?.charge_allowed_now) ||
            (!isXlm &&
              catalog.methods.find((m) => m.id === "stripe")?.charge_allowed_now))
      );
      let xlmDisplay = null;
      if (isXlm) {
        if (corporate) {
          return res.status(200).json({
            ok: true,
            action: "jobs_quote",
            payment_method: "xlm_mainnet",
            plan: planName,
            billing: "stripe_subscription_monthly",
            xlm_supported: false,
            charge_allowed_now: false,
            charge_created: false,
            availability_status: "not_yet_available",
            availability_label: "Not yet available",
            error:
              "Corporate monthly subscriptions renew on Stripe only. XLM cannot start automatic renewals."
          });
        }
        xlmDisplay = await fetchDisplayXlmFromEur(listEur);
      }
      return res.status(200).json({
        ok: true,
        action: "jobs_quote",
        payment_method: isXlm ? "xlm_mainnet" : "stripe",
        plan: planName,
        list_price_eur: listEur,
        billing: ordinary ? "one_time_prepaid" : "stripe_subscription_monthly",
        period_days: ordinary ? ordinary.durationDays : null,
        auto_renew: Boolean(corporate),
        stripe_presentment_count: catalog.stripe_presentment_count,
        xlm_is_not_a_stripe_currency: true,
        xlm_display: xlmDisplay,
        amount_xlm: xlmDisplay && xlmDisplay.amount_xlm,
        eur_per_xlm: xlmDisplay && xlmDisplay.eur_per_xlm,
        rate_as_of: xlmDisplay && xlmDisplay.rate_as_of,
        rate_source: xlmDisplay && xlmDisplay.rate_source,
        network_fee_xlm: xlmDisplay && xlmDisplay.network_fee_xlm,
        charge_allowed_now: chargeAllowed,
        charge_created: false,
        availability_status: chargeAllowed ? "available" : "not_yet_available",
        availability_label: chargeAllowed ? "Available" : "Not yet available",
        availability_reason: catalog.gate.message,
        duplicate_protection:
          "Live XLM uses memo uniqueness + Horizon verification; Stripe uses Checkout/Subscription idempotency when armed."
      });
    }

    if (bodyAction === "services_quote") {
      const listEur = Number((req.body && req.body.list_price_eur) || 100);
      if (!Number.isFinite(listEur) || listEur <= 0) {
        return res.status(400).json({ ok: false, error: "list_price_eur required." });
      }
      const catalog = servicesPaymentMethods(process.env);
      const commissionCents = Math.round(listEur * 100 * 1000 / 10000);
      const chargeAllowed = Boolean(
        catalog.live_flag_armed &&
          ((isXlm &&
            catalog.methods.find((m) => m.id === "xlm_mainnet")
              ?.charge_allowed_now) ||
            (!isXlm &&
              catalog.methods.find((m) => m.id === "stripe")?.charge_allowed_now))
      );
      let xlmDisplay = null;
      if (isXlm) {
        xlmDisplay = await fetchDisplayXlmFromEur(listEur);
      }
      return res.status(200).json({
        ok: true,
        action: "services_quote",
        payment_method: isXlm ? "xlm_mainnet" : "stripe",
        list_price_eur: listEur,
        customer_pays_eur: listEur,
        provider_commission_bps: 1000,
        provider_commission_eur: commissionCents / 100,
        provider_settlement_eur: listEur - commissionCents / 100,
        commission_payer: "provider",
        customer_extra_havkar_commission: false,
        stripe_presentment_count: catalog.stripe_presentment_count,
        xlm_is_not_a_stripe_currency: true,
        xlm_display: xlmDisplay,
        amount_xlm: xlmDisplay && xlmDisplay.amount_xlm,
        eur_per_xlm: xlmDisplay && xlmDisplay.eur_per_xlm,
        rate_as_of: xlmDisplay && xlmDisplay.rate_as_of,
        rate_source: xlmDisplay && xlmDisplay.rate_source,
        network_fee_xlm: xlmDisplay && xlmDisplay.network_fee_xlm,
        charge_allowed_now: chargeAllowed,
        charge_created: false,
        availability_status: chargeAllowed ? "available" : "not_yet_available",
        availability_label: chargeAllowed ? "Available" : "Not yet available",
        availability_reason: catalog.gate.message
      });
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

        return res.status(settled.status).json(settled);
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
          currency: "EUR",
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
        currency: "EUR",
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
      session =
        await getStripe().checkout.sessions.create({
          mode: "payment",

          payment_method_types: [
            "card",
          ],

          customer_email:
            user.email || undefined,

          line_items: [
            {
              quantity,

              price_data: {
                currency: "eur",

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
          },

          payment_intent_data: {
            metadata: {
              event_ticket_id:
                String(pendingTicket.id),

              event_id:
                String(eventId),

              havkar_user_id:
                String(user.id),
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
        });
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
