"use strict";

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

async function handleHotelsRequest(req, res, ctx) {
  const sendError = ctx.sendError;
  const getSupabaseAdmin = ctx.getSupabaseAdmin;
  const authenticateUser = ctx.authenticateUser;
  const getStripe = ctx.getStripe;

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
      const role = String(
        (req.body && req.body.role) ||
          (req.query && req.query.role) ||
          "guest"
      )
        .trim()
        .toLowerCase();
      const hotelLiveOff = publicLiveHotelBooking !== true;
      const stripeArmed = cardPaymentsAllowed();
      const xlmArmed = mainnetCustomerLiveReady();
      const guestChargeStatus = hotelLiveOff
        ? "not_yet_available"
        : stripeArmed
          ? "ready_when_inventory_confirmed"
          : "not_yet_available";
      const guestXlmStatus = hotelLiveOff
        ? "not_yet_available"
        : xlmArmed
          ? "ready_when_inventory_confirmed"
          : "not_yet_available";

      return res.status(200).json({
        ok: true,
        action: "hotels_payment_methods",
        role: role === "owner" ? "owner" : "guest",
        currency: getCurrencyMeta(currency),
        settlement_currency: "eur",
        stripe_presentment_count: PRESENTMENT_COUNT,
        xlm_is_not_a_stripe_currency: true,
        public_live_booking: false,
        methods: [
          {
            id: "stripe",
            kind: "fiat_card",
            label: "Stripe — Pay by card / supported currencies",
            label_it: "Stripe — Paga con carta / valute supportate",
            symbol: null,
            currencies: "stripe_presentment_it_account",
            currency_count: PRESENTMENT_COUNT,
            status: guestChargeStatus,
            status_label: hotelLiveOff
              ? "Not yet available"
              : "Armed (Owner-gated inventory)",
            status_label_it: hotelLiveOff
              ? "Non ancora disponibile"
              : "Armato (inventario con gate Owner)",
            live_collection_armed: stripeArmed,
            charge_allowed_now: false,
            note:
              "Eligible Stripe methods (cards, Apple Pay, Google Pay, local PMs) are chosen dynamically at Checkout from account capabilities + customer location + currency.",
            guest_flow: "havkar_direct_booking_checkout",
            owner_payout_flow: "stripe_connect_after_kyb",
            distinct_from_xlm: true
          },
          {
            id: "xlm_mainnet",
            kind: "stellar_xlm",
            label: "Stellar XLM — Pay with XLM wallet",
            label_it: "Stellar XLM — Paga con wallet XLM",
            symbol: "✦",
            symbol_note: "Official Stellar mark used as ✦ in HAVKAR green UI",
            currencies: "native_xlm_only",
            currency_count: 1,
            status: guestXlmStatus,
            status_label: hotelLiveOff
              ? "Not yet available"
              : "Armed (Owner-gated inventory)",
            status_label_it: hotelLiveOff
              ? "Non ancora disponibile"
              : "Armato (inventario con gate Owner)",
            live_collection_armed: xlmArmed,
            charge_allowed_now: false,
            offered_for_havkar_direct: true,
            offered_for_duffel_stays: false,
            reason_duffel:
              "Supplier funding/settlement for Duffel Stays via XLM is not verified.",
            guest_flow: "stellar_checkout_services_flow",
            owner_payout_flow: "separate_from_guest_xlm_never_auto",
            uses_existing_rails: [
              "lib/stellar-checkout.cjs",
              "lib/stellar-mainnet.cjs",
              "Horizon verification",
              "idempotency + memo uniqueness"
            ],
            note:
              "XLM is not a Stripe presentment currency. Quotes use CoinGecko EUR/XLM with timestamp; live hotel charges stay OFF until Duffel/supplier readiness and Owner approval."
          }
        ],
        gate: {
          code: "HOTELS_LIVE_BOOKING_OFF",
          message:
            "Visible payment options may quote fees, but public live hotel charges remain disabled."
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

      const isXlm = method === "xlm" || method === "xlm_mainnet";
      let xlmQuote = null;
      let xlmDisplay = null;
      if (isXlm && quote && quote.ok && quote.decision && quote.decision.ok) {
        try {
          const { buildXlmQuote, xlmFromEur } = require("../lib/stellar-checkout.cjs");
          xlmQuote = await buildXlmQuote(quote.decision, {
            env: process.env,
            nowMs: Date.now()
          });
          // Display-only EUR→XLM conversion when settlement destination
          // is not yet configured for hotels (live charges remain OFF).
          if (!xlmQuote || xlmQuote.ok !== true || !xlmQuote.amount_xlm) {
            const rateRes = await fetch(
              "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=eur&include_last_updated_at=true",
              { headers: { Accept: "application/json" } }
            );
            if (rateRes.ok) {
              const rateBody = await rateRes.json();
              const eurPer = Number(
                rateBody && rateBody.stellar && rateBody.stellar.eur
              );
              const updated = Number(
                rateBody && rateBody.stellar && rateBody.stellar.last_updated_at
              );
              const buyerPays =
                (quote.fees && quote.fees.buyerPays) ||
                (quote.decision.fees && quote.decision.fees.buyerPays);
              if (Number.isFinite(eurPer) && eurPer > 0 && buyerPays) {
                xlmDisplay = {
                  ok: true,
                  display_only: true,
                  payable: false,
                  amount_xlm: xlmFromEur(buyerPays, eurPer),
                  eur_per_xlm: eurPer,
                  network_fee_xlm: "0.00001",
                  rate_as_of: Number.isFinite(updated)
                    ? new Date(updated * 1000).toISOString()
                    : null,
                  rate_source: "coingecko:stellar:eur",
                  note:
                    "Display-only XLM equivalent. Settlement destination not armed for hotel live charges."
                };
              }
            }
          }
        } catch (_e) {
          xlmQuote = null;
        }
      }

      const xlmEffective =
        xlmQuote && xlmQuote.ok === true && xlmQuote.amount_xlm
          ? xlmQuote
          : xlmDisplay;

      return res.status(quote.status || (quote.ok ? 200 : 400)).json({
        ...quote,
        action: "hotels_quote",
        public_live_booking: false,
        charge_allowed_now: false,
        charge_created: false,
        payment_method: isXlm ? "xlm_mainnet" : "stripe",
        xlm_is_not_a_stripe_currency: isXlm ? true : undefined,
        xlm_quote: xlmQuote,
        xlm_display: xlmDisplay,
        amount_xlm: xlmEffective && xlmEffective.amount_xlm,
        eur_per_xlm: xlmEffective && xlmEffective.eur_per_xlm,
        network_fee_xlm: xlmEffective && xlmEffective.network_fee_xlm,
        rate_as_of: xlmEffective && xlmEffective.rate_as_of,
        availability_status: "not_yet_available",
        availability_label: "Not yet available",
        availability_label_it: "Non ancora disponibile",
        availability_reason:
          "Live hotel charges stay OFF until Duffel Stays access, end-to-end verification, and explicit Owner approval.",
        taxes_note:
          "Taxes and service fees must be disclosed from supplier/property before charge.",
        cancellation_note:
          "Cancellation/refund terms come from the property policy or Duffel rate conditions.",
        duplicate_protection:
          "Live XLM settlement uses memo uniqueness + Horizon tx verification; Stripe uses PaymentIntent/Checkout idempotency keys when armed."
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
      const isXlm = method === "xlm" || method === "xlm_mainnet";
      return res.status(quote.status || (quote.ok ? 200 : 400)).json({
        ...quote,
        action: "hotels_payment_probe",
        public_live_booking: false,
        charge_created: false,
        charge_allowed_now: false,
        payment_method: isXlm ? "xlm_mainnet" : "stripe",
        xlm_is_not_a_stripe_currency: isXlm ? true : undefined,
        availability_status: "not_yet_available",
        availability_label: "Not yet available",
        note:
          "Probe only — no PaymentIntent/Checkout/XLM settlement created. Public live hotel payments stay OFF."
      });
    }

    return sendError(res, 400, "Unknown hotels action");
  } catch (error) {
    console.error("HAVKAR hotels error:", error && error.message);
    return sendError(res, 500, "Hotels request failed");
  }
}

module.exports = {
  isHotelsRequest,
  handleHotelsRequest
};
