/**
 * Honest status for partner integrations that stay disabled until
 * credentials, contracts, and Owner flags exist.
 * Never fabricates successful external bookings/transactions.
 */
const { classifyDuffelAccessToken } = require("./duffel-live-ready.cjs");
const { omioConfigured } = require("./omio-adapter.cjs");
const { telehealthStatus } = require("./telehealth-adapter.cjs");

function buildExternalIntegrationsStatus(env = process.env) {
  const duffel = classifyDuffelAccessToken(env);
  const hotelsLive = env.HAVKAR_HOTELS_LIVE_BOOKING_ENABLED === "true";
  const omio = omioConfigured(env);
  const telehealth = telehealthStatus(env);

  return {
    ok: true,
    action: "external_integrations_status",
    generated_at: new Date().toISOString(),
    integrations: {
      omio: {
        ...omio,
        ui: "tickets.html shows awaiting-partner panels only"
      },
      duffel_flights: {
        adapter_ready: true,
        token_mode: duffel.mode,
        live_orders_possible: duffel.live_orders_possible === true,
        flag_HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED:
          env.HAVKAR_DUFFEL_LIVE_ORDERS_ENABLED === "true",
        blocker: duffel.requirement || null
      },
      duffel_stays_hotels: {
        adapter_ready: true,
        live_booking_flag: hotelsLive,
        live_booking_effective: hotelsLive,
        blocker: hotelsLive
          ? "Flag on — still requires Duffel Stays product access and inventory."
          : "HAVKAR_HOTELS_LIVE_BOOKING_ENABLED is not true."
      },
      telehealth_voice_video: telehealth
    },
    honesty: {
      never_fabricate_partner_inventory: true,
      never_fabricate_successful_external_transactions: true
    }
  };
}

module.exports = {
  buildExternalIntegrationsStatus
};
