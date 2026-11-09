/*
 * Stellar Mainnet arming for HAVKAR.
 * Exact string "true" required. Destination must be a public key only.
 * Never invents accounts, seeds, or transaction hashes.
 */

const MAINNET_FLAG = "HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED";
const MAINNET_DESTINATION_ENV = "HAVKAR_STELLAR_MAINNET_DESTINATION";
const HORIZON_MAINNET = "https://horizon.stellar.org";
const NETWORK_MAINNET = "mainnet";

function isPublicKey(value) {
  return /^G[A-Z2-7]{55}$/.test(String(value || ""));
}

function stellarMainnetPaymentsEnabled(env = process.env) {
  return env?.[MAINNET_FLAG] === "true";
}

function readMainnetDestination(env = process.env) {
  if (!stellarMainnetPaymentsEnabled(env)) {
    return {
      ok: false,
      status: 403,
      code: "STELLAR_MAINNET_DISABLED",
      error:
        "Stellar Mainnet payments are disabled until HAVKAR_STELLAR_MAINNET_PAYMENTS_ENABLED=true."
    };
  }

  const value = String(env?.[MAINNET_DESTINATION_ENV] || "").trim();

  if (!value) {
    return {
      ok: false,
      status: 409,
      code: "MAINNET_DESTINATION_NOT_CONFIGURED",
      error:
        "HAVKAR_STELLAR_MAINNET_DESTINATION is not set. Set it to the public key of the HAVKAR Stellar Mainnet receiving account. No secret key is accepted."
    };
  }

  if (!isPublicKey(value)) {
    return {
      ok: false,
      status: 409,
      code: "MAINNET_DESTINATION_INVALID",
      error:
        "HAVKAR_STELLAR_MAINNET_DESTINATION must be a Stellar public key (G...). The configured value was rejected."
    };
  }

  return {
    ok: true,
    destination: value,
    network: NETWORK_MAINNET,
    horizon: HORIZON_MAINNET
  };
}

function mainnetReady(env = process.env) {
  const destination = readMainnetDestination(env);
  return destination.ok === true;
}

/**
 * Confirms the configured Mainnet destination exists on Horizon Public.
 * Never invents an account. Does not print balances or secrets.
 */
async function assertMainnetDestinationFunded(destination, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const horizon = options.horizon || HORIZON_MAINNET;
  const key = String(destination || "").trim();

  if (!isPublicKey(key)) {
    return {
      ok: false,
      status: 409,
      code: "MAINNET_DESTINATION_INVALID",
      error:
        "HAVKAR_STELLAR_MAINNET_DESTINATION must be a Stellar public key (G...)."
    };
  }

  let response;

  try {
    response = await fetchImpl(horizon + "/accounts/" + key, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "MAINNET_HORIZON_UNAVAILABLE",
      error:
        "Horizon Mainnet could not be reached to verify the receiving account."
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      status: 409,
      code: "MAINNET_DESTINATION_NOT_FOUND",
      error:
        "The configured Mainnet destination is not an existing Horizon Public account. Fund/create it on Mainnet before accepting payments."
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: 503,
      code: "MAINNET_HORIZON_UNAVAILABLE",
      error: "Horizon Mainnet returned an unexpected status for the destination account."
    };
  }

  return { ok: true, destination: key, horizon };
}

module.exports = {
  MAINNET_FLAG,
  MAINNET_DESTINATION_ENV,
  HORIZON_MAINNET,
  NETWORK_MAINNET,
  isPublicKey,
  stellarMainnetPaymentsEnabled,
  readMainnetDestination,
  mainnetReady,
  assertMainnetDestinationFunded
};
