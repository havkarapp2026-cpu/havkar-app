/*
 * Buy & Sell marketplace payment helpers.
 * Fees: buyer +2%, seller −3% (5% total of list price). Listing publication is free.
 * Live charging requires Owner HAVKAR_TRADE_ENABLED (+ Stripe/XLM readiness).
 * Quotes never invent blockchain settlements or mark orders paid.
 */

const {
  PRESENTMENT_COUNT,
  listStripePresentmentCurrencies,
  isSupportedCheckoutCurrency,
  getCurrencyMeta
} = require("./stripe-supported-currencies-60.cjs");
const {
  cardPaymentsAllowed,
  tradePaymentsAllowed,
  REAL_PAYMENTS_PAUSED_CODE,
  REAL_PAYMENTS_PAUSED_MESSAGE
} = require("./real-payments.cjs");
const { mainnetCustomerLiveReady } = require("./stellar-mainnet.cjs");
const { marketplaceCardSplit } = require("./marketplace-connect.cjs");
const { buildGlobalPaymentQuote } = require("./havkar-global-payments.cjs");

function isMarketplaceRequest(req) {
  const action = String(
    (req && req.query && req.query.havkarAction) ||
      (req && req.body && req.body.action) ||
      ""
  );
  return (
    action === "marketplace" ||
    action === "marketplace_payment_methods" ||
    action === "marketplace_quote" ||
    action === "marketplace_create_checkout" ||
    action === "marketplace_status" ||
    String((req && req.query && req.query.havkarRoute) || "") === "marketplace"
  );
}

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function feeQuote(listPriceEur, currency) {
  const list = roundMoney(listPriceEur);
  if (!Number.isFinite(list) || list < 0) {
    return { ok: false, error: "list_price_eur must be a non-negative number." };
  }
  const split = marketplaceCardSplit(list) || {
    list_price_eur: list,
    buyer_fee_eur: roundMoney(list * 0.02),
    seller_fee_eur: roundMoney(list * 0.03),
    buyer_pays_eur: roundMoney(list * 1.02),
    seller_receives_eur: roundMoney(list * 0.97),
    platform_commission_eur: roundMoney(list * 0.05)
  };
  const code = String(currency || "eur").trim().toLowerCase() || "eur";
  return {
    ok: true,
    currency: code,
    currency_meta: getCurrencyMeta(code),
    listing_publication_fee: 0,
    ...split,
    fees_note:
      "Buyer service fee 2%. Seller selling fee 3%. Total HAVKAR fees 5% of item price. Posting listings is free. Shipping, taxes, and processor fees are separate.",
    stripe_presentment_count: PRESENTMENT_COUNT
  };
}

async function handleMarketplaceRequest(req, res, helpers) {
  const sendError =
    (helpers && helpers.sendError) ||
    ((r, status, error) => r.status(status).json({ ok: false, error }));
  const authenticateUser = helpers && helpers.authenticateUser;
  const getStripe = helpers && helpers.getStripe;
  const getSupabaseAdmin = helpers && helpers.getSupabaseAdmin;

  const action = String(
    (req.query && (req.query.action || req.query.havkarAction)) ||
      (req.body && req.body.action) ||
      "marketplace_status"
  )
    .trim()
    .toLowerCase();

  const tradeArmed = tradePaymentsAllowed();
  const stripeArmed = cardPaymentsAllowed();
  const xlmArmed = mainnetCustomerLiveReady();
  const chargeAllowed = tradeArmed && (stripeArmed || xlmArmed);

  if (action === "marketplace" || action === "marketplace_status") {
    return res.status(200).json({
      ok: true,
      action: "marketplace_status",
      module: "marketplace",
      listing_publication_fee: 0,
      buyer_fee_rate: 0.02,
      seller_fee_rate: 0.03,
      total_havkar_fee_rate: 0.05,
      stripe_presentment_count: PRESENTMENT_COUNT,
      trade_payments_enabled: tradeArmed,
      stripe_live: stripeArmed,
      xlm_live: xlmArmed,
      charge_allowed_now: chargeAllowed,
      charge_created: false,
      gate: tradeArmed
        ? null
        : {
            code: "HAVKAR_TRADE_ENABLED_OFF",
            message:
              "Marketplace live charging stays OFF until Owner sets HAVKAR_TRADE_ENABLED=true after verification."
          },
      isolation: "Buy & Sell listings are listing_surface=marketplace, separate from Ads advertising."
    });
  }

  if (action === "marketplace_payment_methods") {
    return res.status(200).json({
      ok: true,
      action: "marketplace_payment_methods",
      stripe_presentment_count: PRESENTMENT_COUNT,
      currencies: listStripePresentmentCurrencies().slice(0, 20),
      xlm_is_not_a_stripe_currency: true,
      charge_allowed_now: chargeAllowed,
      methods: [
        {
          id: "stripe",
          kind: "fiat_card",
          label: "Stripe — Pay by card / supported currencies",
          currency_count: PRESENTMENT_COUNT,
          charge_allowed_now: tradeArmed && stripeArmed,
          status: tradeArmed && stripeArmed ? "armed" : "quote_only"
        },
        {
          id: "xlm_mainnet",
          kind: "stellar_xlm",
          label: "Stellar XLM — Pay with XLM wallet",
          currency_count: 1,
          charge_allowed_now: tradeArmed && xlmArmed,
          status: tradeArmed && xlmArmed ? "armed" : "quote_only",
          note: "XLM is not a Stripe presentment currency. Settlement is verified server-side on Horizon."
        }
      ],
      fees: {
        buyer_bps: 200,
        seller_bps: 300,
        listing_publication_fee: 0
      }
    });
  }

  if (action === "marketplace_quote") {
    const listPrice = Number(
      (req.body && (req.body.list_price_eur || req.body.price)) || 0
    );
    const currency = String((req.body && req.body.currency) || "eur")
      .trim()
      .toLowerCase();
    const method = String(
      (req.body && (req.body.method || req.body.payment_method)) || "stripe"
    )
      .trim()
      .toLowerCase();

    const fees = feeQuote(listPrice, currency);
    if (!fees.ok) {
      return sendError(res, 400, fees.error);
    }

    if (method === "stripe" || method === "card") {
      if (!isSupportedCheckoutCurrency(currency)) {
        return res.status(400).json({
          ok: false,
          error:
            "Currency is not in HAVKAR's verified Stripe presentment currency list.",
          charge_created: false,
          charge_allowed_now: false
        });
      }
      const quote = await buildGlobalPaymentQuote({
        module: "marketplace",
        method: "stripe",
        currency,
        list_price_eur: listPrice,
        subject_id: String((req.body && req.body.listing_id) || "marketplace_quote"),
        idempotency_key:
          String((req.body && req.body.idempotency_key) || "") ||
          "marketplace-quote-" + Date.now()
      });
      return res.status(quote.status || (quote.ok ? 200 : 400)).json({
        ...quote,
        action: "marketplace_quote",
        fees,
        payment_method: "stripe",
        charge_created: false,
        charge_allowed_now: false,
        trade_payments_enabled: tradeArmed,
        availability_status: chargeAllowed ? "armed_quote_only_here" : "not_yet_available",
        note: "Quote only. Live charge requires HAVKAR_TRADE_ENABLED and a confirmed checkout workflow."
      });
    }

    if (method === "xlm" || method === "xlm_mainnet") {
      const quote = await buildGlobalPaymentQuote({
        module: "marketplace",
        method: "xlm_mainnet",
        currency: "eur",
        list_price_eur: listPrice,
        subject_id: String((req.body && req.body.listing_id) || "marketplace_quote"),
        idempotency_key:
          String((req.body && req.body.idempotency_key) || "") ||
          "marketplace-xlm-quote-" + Date.now()
      });

      let xlmDisplay = null;
      try {
        const { xlmFromEur } = require("./stellar-checkout.cjs");
        const rateRes = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=eur&include_last_updated_at=true",
          { headers: { Accept: "application/json" } }
        );
        if (rateRes.ok) {
          const rateBody = await rateRes.json();
          const eurPer = Number(rateBody && rateBody.stellar && rateBody.stellar.eur);
          const updated = Number(
            rateBody && rateBody.stellar && rateBody.stellar.last_updated_at
          );
          if (Number.isFinite(eurPer) && eurPer > 0) {
            xlmDisplay = {
              ok: true,
              display_only: true,
              payable: false,
              amount_xlm: xlmFromEur(fees.buyer_pays_eur, eurPer),
              eur_per_xlm: eurPer,
              network_fee_xlm: "0.00001",
              rate_as_of: Number.isFinite(updated)
                ? new Date(updated * 1000).toISOString()
                : null,
              rate_source: "coingecko:stellar:eur"
            };
          }
        }
      } catch (_e) {
        xlmDisplay = null;
      }

      return res.status(quote.status || (quote.ok ? 200 : 400)).json({
        ...quote,
        action: "marketplace_quote",
        fees,
        payment_method: "xlm_mainnet",
        xlm_is_not_a_stripe_currency: true,
        xlm_display: xlmDisplay,
        amount_xlm: xlmDisplay && xlmDisplay.amount_xlm,
        eur_per_xlm: xlmDisplay && xlmDisplay.eur_per_xlm,
        network_fee_xlm: xlmDisplay && xlmDisplay.network_fee_xlm,
        rate_as_of: xlmDisplay && xlmDisplay.rate_as_of,
        charge_created: false,
        charge_allowed_now: false,
        trade_payments_enabled: tradeArmed
      });
    }

    return sendError(res, 400, "method must be stripe or xlm_mainnet.");
  }

  if (action === "marketplace_create_checkout") {
    if (!authenticateUser || !getStripe || !getSupabaseAdmin) {
      return sendError(res, 500, "Marketplace checkout helpers unavailable.");
    }

    const auth = await authenticateUser(req);
    if (!auth || auth.error || !auth.user) {
      return sendError(res, 401, (auth && auth.error) || "Authentication required");
    }

    if (!tradeArmed) {
      return res.status(403).json({
        ok: false,
        code: "HAVKAR_TRADE_ENABLED_OFF",
        error:
          "Marketplace live checkout is OFF until Owner enables HAVKAR_TRADE_ENABLED after verification.",
        charge_created: false
      });
    }

    if (!stripeArmed) {
      return res.status(403).json({
        ok: false,
        code: REAL_PAYMENTS_PAUSED_CODE,
        error: REAL_PAYMENTS_PAUSED_MESSAGE,
        charge_created: false
      });
    }

    const listingId = Number((req.body && req.body.listing_id) || 0);
    if (!Number.isSafeInteger(listingId) || listingId <= 0) {
      return sendError(res, 400, "Valid listing_id is required.");
    }

    const admin = getSupabaseAdmin();
    const { data: listing, error: listingError } = await admin
      .from("ads")
      .select(
        "id,user_id,title,price,currency,status,listing_surface,city,country_code"
      )
      .eq("id", listingId)
      .maybeSingle();

    if (listingError || !listing) {
      return sendError(res, 404, "Listing not found.");
    }
    if (listing.listing_surface && listing.listing_surface !== "marketplace") {
      return sendError(res, 400, "Only marketplace listings can be purchased here.");
    }
    if (String(listing.status || "").toLowerCase() !== "active") {
      return sendError(res, 409, "Listing is not active for purchase.");
    }
    if (listing.user_id === auth.user.id) {
      return sendError(res, 400, "Sellers cannot purchase their own listing.");
    }

    const listPrice = Number(listing.price);
    const fees = feeQuote(listPrice, listing.currency || "eur");
    if (!fees.ok) {
      return sendError(res, 400, fees.error);
    }

    // Platform-collect until seller Connect destination is verified.
    // Destination Connect charges require an onboarded seller account.
    const origin =
      (helpers.getOrigin && helpers.getOrigin(req)) ||
      "https://havkar.online";
    const successUrl =
      String((req.body && req.body.success_url) || "").trim() ||
      origin + "/product.html?id=" + listingId + "&paid=1";
    const cancelUrl =
      String((req.body && req.body.cancel_url) || "").trim() ||
      origin + "/product.html?id=" + listingId + "&paid=0";

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: auth.user.email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: String(listing.currency || "eur").toLowerCase(),
              unit_amount: Math.round(fees.buyer_pays_eur * 100),
              product_data: {
                name: String(listing.title || "HAVKAR marketplace item").slice(
                  0,
                  120
                ),
                metadata: {
                  listing_id: String(listingId),
                  list_price_eur: String(fees.list_price_eur),
                  buyer_fee_eur: String(fees.buyer_fee_eur),
                  seller_fee_eur: String(fees.seller_fee_eur)
                }
              }
            }
          }
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          havkar_module: "marketplace",
          listing_id: String(listingId),
          buyer_id: auth.user.id,
          seller_id: listing.user_id,
          list_price_eur: String(fees.list_price_eur),
          platform_commission_eur: String(fees.platform_commission_eur)
        }
      });

      return res.status(200).json({
        ok: true,
        action: "marketplace_create_checkout",
        charge_created: true,
        charge_allowed_now: true,
        checkout_mode: "platform_collect",
        connect_destination: false,
        connect_note:
          "Seller Stripe Connect destination payout is not attached on this path yet. Funds collect to the platform account for Owner-controlled settlement.",
        session_id: session.id,
        url: session.url,
        fees
      });
    } catch (error) {
      console.error("HAVKAR marketplace checkout error:", error && error.message);
      return sendError(res, 500, "Could not create Stripe Checkout session.");
    }
  }

  return sendError(res, 400, "Unknown marketplace action");
}

module.exports = {
  isMarketplaceRequest,
  handleMarketplaceRequest,
  feeQuote,
  PRESENTMENT_COUNT
};
