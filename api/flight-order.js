"use strict";

/*
  HAVKAR - Duffel Test Order API
  File: /api/flight-order.js

  IMPORTANT:
  - DUFFEL_ACCESS_TOKEN stays server-side in Vercel.
  - This endpoint is intended for Duffel TEST MODE first.
  - It creates an instant Duffel order using Duffel balance.
*/

const DUFFEL_API = "https://api.duffel.com";
const DUFFEL_VERSION = "v2";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  );
}

function send(res, status, body) {
  return res.status(status).json(body);
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(cleanString(value));
}

function validOfferId(value) {
  return /^off_[A-Za-z0-9]+$/.test(cleanString(value));
}

function validPassengerId(value) {
  return /^pas_[A-Za-z0-9]+$/.test(cleanString(value));
}

function normalizeTitle(value) {
  const title = cleanString(value).toLowerCase();

  if (
    title === "mr" ||
    title === "mrs" ||
    title === "ms" ||
    title === "miss" ||
    title === "dr"
  ) {
    return title;
  }

  return null;
}

function normalizeGender(value) {
  const gender = cleanString(value).toLowerCase();

  if (gender === "m" || gender === "f") {
    return gender;
  }

  return null;
}

function normalizePhone(value) {
  const phone = cleanString(value).replace(/\s+/g, "");

  if (!phone) {
    return "";
  }

  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    return null;
  }

  return phone;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded)
      .split(",")[0]
      .trim();
  }

  return "";
}

function getUserAgent(req) {
  return cleanString(req.headers["user-agent"]);
}

async function parseDuffelResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text
    };
  }
}

function getDuffelError(payload, fallback) {
  const errors = payload?.errors;

  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0];

    return {
      message:
        first?.message ||
        first?.title ||
        fallback,

      type:
        first?.type ||
        null,

      code:
        first?.code ||
        null,

      field:
        first?.source?.field ||
        first?.source?.pointer ||
        null
    };
  }

  return {
    message:
      payload?.message ||
      payload?.error ||
      fallback,

    type: null,
    code: null,
    field: null
  };
}

async function getOffer(token, offerId) {
  const response = await fetch(
    `${DUFFEL_API}/air/offers/${encodeURIComponent(offerId)}`,
    {
      method: "GET",

      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "Duffel-Version": DUFFEL_VERSION,
        Authorization: `Bearer ${token}`
      }
    }
  );

  const payload = await parseDuffelResponse(response);

  if (!response.ok) {
    const error = getDuffelError(
      payload,
      "Unable to verify the selected Duffel offer."
    );

    const err = new Error(error.message);

    err.status = response.status;
    err.duffel = error;

    throw err;
  }

  return payload?.data || null;
}

function mapPassengers(inputPassengers, offerPassengers) {
  if (!Array.isArray(inputPassengers) || inputPassengers.length === 0) {
    throw new Error("Passenger details are required.");
  }

  if (
    !Array.isArray(offerPassengers) ||
    offerPassengers.length === 0
  ) {
    throw new Error(
      "The selected Duffel offer does not contain passenger references."
    );
  }

  if (inputPassengers.length !== offerPassengers.length) {
    throw new Error(
      `This offer requires exactly ${offerPassengers.length} passenger(s).`
    );
  }

  return inputPassengers.map((input, index) => {
    const offerPassenger =
      offerPassengers.find(
        item =>
          validPassengerId(input?.id) &&
          item?.id === input.id
      ) ||
      offerPassengers[index];

    if (!offerPassenger?.id) {
      throw new Error(
        `Duffel passenger reference is missing for passenger ${index + 1}.`
      );
    }

    const givenName = cleanString(input?.given_name);
    const familyName = cleanString(input?.family_name);
    const bornOn = cleanString(input?.born_on);
    const email = normalizeEmail(input?.email);
    const phoneNumber = normalizePhone(input?.phone_number);
    const title = normalizeTitle(input?.title);
    const gender = normalizeGender(input?.gender);

    if (!givenName) {
      throw new Error(
        `Given name is required for passenger ${index + 1}.`
      );
    }

    if (!familyName) {
      throw new Error(
        `Family name is required for passenger ${index + 1}.`
      );
    }

    if (!validDate(bornOn)) {
      throw new Error(
        `A valid date of birth is required for passenger ${index + 1}.`
      );
    }

    if (!title) {
      throw new Error(
        `A valid title is required for passenger ${index + 1}.`
      );
    }

    if (!gender) {
      throw new Error(
        `Gender must be "m" or "f" for passenger ${index + 1}.`
      );
    }

    if (!email || !validEmail(email)) {
      throw new Error(
        `A valid email is required for passenger ${index + 1}.`
      );
    }

    if (phoneNumber === null) {
      throw new Error(
        `Phone number must use international format, for example +393331234567.`
      );
    }

    const passenger = {
      id: offerPassenger.id,
      title,
      given_name: givenName,
      family_name: familyName,
      born_on: bornOn,
      gender,
      email
    };

    if (phoneNumber) {
      passenger.phone_number = phoneNumber;
    }

    return passenger;
  });
}

function safeOfferSummary(offer) {
  return {
    id: offer?.id || null,
    live_mode: offer?.live_mode === true,
    total_amount: offer?.total_amount || null,
    total_currency: offer?.total_currency || null,
    expires_at: offer?.expires_at || null,
    requires_instant_payment:
      offer?.payment_requirements
        ?.requires_instant_payment === true,
    payment_required_by:
      offer?.payment_requirements
        ?.payment_required_by || null
  };
}

function safeOrderSummary(order) {
  return {
    id: order?.id || null,
    booking_reference:
      order?.booking_reference || null,

    live_mode:
      order?.live_mode === true,

    awaiting_payment:
      order?.awaiting_payment === true,

    total_amount:
      order?.total_amount || null,

    total_currency:
      order?.total_currency || null,

    tax_amount:
      order?.tax_amount || null,

    tax_currency:
      order?.tax_currency || null,

    base_amount:
      order?.base_amount || null,

    base_currency:
      order?.base_currency || null,

    payment_required_by:
      order?.payment_required_by || null,

    created_at:
      order?.created_at || null,

    documents:
      Array.isArray(order?.documents)
        ? order.documents
        : [],

    passengers:
      Array.isArray(order?.passengers)
        ? order.passengers
        : [],

    slices:
      Array.isArray(order?.slices)
        ? order.slices
        : [],

    owner:
      order?.owner || null,

    payment_status:
      order?.payment_status || null
  };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return send(res, 405, {
      ok: false,
      error: "Method not allowed. Use POST."
    });
  }

  const token = process.env.DUFFEL_ACCESS_TOKEN;

  if (!token) {
    return send(res, 500, {
      ok: false,
      error:
        "DUFFEL_ACCESS_TOKEN is not configured on the server."
    });
  }

  try {
    const body =
      req.body && typeof req.body === "object"
        ? req.body
        : {};

    const offerId = cleanString(body.offer_id);

    if (!validOfferId(offerId)) {
      return send(res, 400, {
        ok: false,
        error: "A valid offer_id is required."
      });
    }

    /*
      Safety guard:
      HAVKAR is currently building the booking flow
      against Duffel TEST MODE.

      Client must explicitly send:
      test_mode: true
    */
    if (body.test_mode !== true) {
      return send(res, 400, {
        ok: false,
        error:
          "HAVKAR flight ordering is currently restricted to test mode."
      });
    }

    /*
      Re-fetch the offer immediately before booking.

      This is important because:
      - offers expire
      - price can change
      - passenger references come from Duffel
      - payment requirements belong to the selected offer
    */
    const offer = await getOffer(
      token,
      offerId
    );

    if (!offer?.id) {
      return send(res, 404, {
        ok: false,
        error:
          "The selected Duffel offer could not be found."
      });
    }

    /*
      Hard protection against accidentally creating
      a LIVE booking while HAVKAR is testing.
    */
    if (offer.live_mode === true) {
      return send(res, 403, {
        ok: false,
        error:
          "Live Duffel offers are blocked by this HAVKAR test endpoint."
      });
    }

    const expiresAt =
      offer?.expires_at
        ? new Date(offer.expires_at)
        : null;

    if (
      expiresAt &&
      !Number.isNaN(expiresAt.getTime()) &&
      expiresAt.getTime() <= Date.now()
    ) {
      return send(res, 409, {
        ok: false,
        error:
          "This Duffel offer has expired. Search for the flight again."
      });
    }

    const totalAmount =
      cleanString(offer.total_amount);

    const totalCurrency =
      cleanString(offer.total_currency)
        .toUpperCase();

    if (
      !totalAmount ||
      !/^\d+(?:\.\d+)?$/.test(totalAmount)
    ) {
      return send(res, 409, {
        ok: false,
        error:
          "Duffel did not return a valid total amount for this offer."
      });
    }

    if (!/^[A-Z]{3}$/.test(totalCurrency)) {
      return send(res, 409, {
        ok: false,
        error:
          "Duffel did not return a valid currency for this offer."
      });
    }

    let passengers;

    try {
      passengers = mapPassengers(
        body.passengers,
        offer.passengers
      );
    } catch (error) {
      return send(res, 400, {
        ok: false,
        error: error.message
      });
    }

    /*
      Instant order + Duffel balance.

      Duffel TEST MODE has unlimited test balance.
      No real traveller payment is collected here.

      In production HAVKAR must collect/confirm the
      customer's payment before creating the airline order.
    */
    const orderData = {
      type: "instant",

      selected_offers: [
        offer.id
      ],

      passengers,

      payments: [
        {
          type: "balance",
          currency: totalCurrency,
          amount: totalAmount
        }
      ],

      metadata: {
        source: "HAVKAR",
        environment: "test"
      }
    };

    /*
      Optional services.

      Only include them if the client explicitly sends
      service IDs/quantities selected from this offer.
    */
    if (
      Array.isArray(body.services) &&
      body.services.length > 0
    ) {
      const services = body.services
        .map(service => {
          const id = cleanString(service?.id);

          let quantity =
            Number(service?.quantity);

          if (
            !id ||
            !/^ase_[A-Za-z0-9]+$/.test(id)
          ) {
            return null;
          }

          if (
            !Number.isInteger(quantity) ||
            quantity < 1
          ) {
            quantity = 1;
          }

          return {
            id,
            quantity
          };
        })
        .filter(Boolean);

      if (services.length > 0) {
        orderData.services = services;
      }
    }

    const headers = {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "Content-Type": "application/json",
      "Duffel-Version": DUFFEL_VERSION,
      Authorization: `Bearer ${token}`
    };

    const clientIp = getClientIp(req);
    const userAgent = getUserAgent(req);

    /*
      Duffel recommends forwarding these when available
      on booking/payment endpoints.
    */
    if (clientIp) {
      headers["x-duffel-device-ip"] =
        clientIp;
    }

    if (userAgent) {
      headers["x-duffel-device-user-agent"] =
        userAgent;
    }

    const response = await fetch(
      `${DUFFEL_API}/air/orders`,
      {
        method: "POST",
        headers,

        body: JSON.stringify({
          data: orderData
        })
      }
    );

    const payload =
      await parseDuffelResponse(response);

    if (!response.ok) {
      const error = getDuffelError(
        payload,
        "Duffel order creation failed."
      );

      return send(
        res,
        response.status >= 400 &&
        response.status <= 599
          ? response.status
          : 502,
        {
          ok: false,
          error: error.message,

          duffel: {
            type: error.type,
            code: error.code,
            field: error.field
          },

          offer:
            safeOfferSummary(offer)
        }
      );
    }

    const order =
      payload?.data || null;

    if (!order?.id) {
      return send(res, 502, {
        ok: false,
        error:
          "Duffel returned an unexpected order response."
      });
    }

    /*
      Another safety assertion.
    */
    if (order.live_mode === true) {
      return send(res, 500, {
        ok: false,
        error:
          "Safety check failed: Duffel returned a live order."
      });
    }

    return send(res, 200, {
      ok: true,

      mode: "test",

      message:
        "Duffel test order created successfully.",

      offer:
        safeOfferSummary(offer),

      order:
        safeOrderSummary(order)
    });

  } catch (error) {
    const status =
      Number.isInteger(error?.status) &&
      error.status >= 400 &&
      error.status <= 599
        ? error.status
        : 500;

    return send(res, status, {
      ok: false,

      error:
        error?.message ||
        "Unexpected HAVKAR flight order error.",

      duffel:
        error?.duffel || null
    });
  }
};
