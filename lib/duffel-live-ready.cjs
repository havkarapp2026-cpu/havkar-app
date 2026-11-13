/*
 * Detect Duffel credential mode without exposing secrets.
 * Never logs the token value.
 */

function classifyDuffelAccessToken(env = process.env) {
  const raw = String(env.DUFFEL_ACCESS_TOKEN || "").trim();
  if (!raw) {
    return {
      ok: false,
      mode: "missing",
      live_orders_possible: false,
      requirement:
        "Set DUFFEL_ACCESS_TOKEN on Vercel Production (duffel_live_… for live bookings)."
    };
  }

  if (raw.startsWith("duffel_test_")) {
    return {
      ok: true,
      mode: "test",
      live_orders_possible: false,
      requirement:
        "Replace test token with Duffel live access token (duffel_live_…) and enable HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED=true after merchant settlement is verified."
    };
  }

  if (raw.startsWith("duffel_live_")) {
    const armed = env.HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED === "true";
    return {
      ok: true,
      mode: "live",
      live_orders_possible: armed,
      requirement: armed
        ? null
        : "Live Duffel token is present. Set HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED=true only after ticket issuance + payment recovery are verified."
    };
  }

  return {
    ok: false,
    mode: "unknown_prefix",
    live_orders_possible: false,
    requirement:
      "DUFFEL_ACCESS_TOKEN must start with duffel_test_ or duffel_live_."
  };
}

function duffelLiveOrdersReady(env = process.env) {
  return classifyDuffelAccessToken(env).live_orders_possible === true;
}

module.exports = {
  classifyDuffelAccessToken,
  duffelLiveOrdersReady
};
