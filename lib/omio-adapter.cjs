/**
 * Omio partner adapter (train/bus/ferry).
 * Search/booking stay disabled until OMIO_API_KEY + HAVKAR_OMIO_API_ENABLED
 * and partner contract exist. Never fabricates journeys or fares.
 */

function omioConfigured(env = process.env) {
  const key = String(env.OMIO_API_KEY || "").trim();
  const flag = env.HAVKAR_OMIO_API_ENABLED === "true";
  return {
    ok: true,
    adapter: "omio",
    modes: ["train", "bus", "ferry"],
    credential_present: Boolean(key),
    flag_enabled: flag,
    live_search: false,
    live_booking: false,
    reason: !key
      ? "missing_OMIO_API_KEY"
      : !flag
        ? "HAVKAR_OMIO_API_ENABLED_not_true"
        : "partner_contract_required_before_live_search",
    note: "Tickets UI shows awaiting-partner panels only until Omio grants API access."
  };
}

async function searchOmioJourneys(_query, env = process.env) {
  const status = omioConfigured(env);
  return {
    ok: false,
    action: "omio_search",
    results: [],
    error: "omio_blocked",
    status,
    honesty: "No Omio journeys are fabricated."
  };
}

module.exports = {
  omioConfigured,
  searchOmioJourneys
};
