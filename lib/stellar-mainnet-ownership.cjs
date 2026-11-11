/*
 * Stellar Mainnet destination ownership verification for HAVKAR.
 * Preferred path: LOBSTR/extension signMessage over a server challenge (no XLM moved).
 * Fallback: tiny outbound native payment FROM the destination with an exact text memo.
 * Verifies signatures server-side against HAVKAR_STELLAR_MAINNET_DESTINATION only.
 */

const {
  createHash,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify
} = require("node:crypto");

const {
  MAINNET_DESTINATION_ENV,
  HORIZON_MAINNET,
  isPublicKey
} = require("./stellar-mainnet.cjs");

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const NETWORK = "mainnet";
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SECRET_FIELDS = [
  "secret",
  "seed",
  "secret_key",
  "secretKey",
  "private_key",
  "privateKey",
  "recovery",
  "recovery_phrase",
  "mnemonic"
];

function refused(status, code, error, extra = {}) {
  return {
    ok: false,
    status,
    code,
    verified: false,
    paid: false,
    funds_moved: false,
    network: NETWORK,
    error,
    ...extra
  };
}

function hasSecretField(body) {
  if (!body || typeof body !== "object") {
    return false;
  }

  return SECRET_FIELDS.some((field) => {
    const value = body[field];
    return value !== undefined && value !== null && String(value).length > 0;
  });
}

function readConfiguredDestination(env = process.env) {
  const value = String(env?.[MAINNET_DESTINATION_ENV] || "").trim();

  if (!value) {
    return refused(
      409,
      "MAINNET_DESTINATION_NOT_CONFIGURED",
      "HAVKAR_STELLAR_MAINNET_DESTINATION is not set on this deployment."
    );
  }

  if (!isPublicKey(value)) {
    return refused(
      409,
      "MAINNET_DESTINATION_INVALID",
      "HAVKAR_STELLAR_MAINNET_DESTINATION is not a valid Stellar public key."
    );
  }

  return { ok: true, destination: value };
}

function hmacSecret(env = process.env) {
  const dedicated = String(env.HAVKAR_MAINNET_OWNERSHIP_HMAC_SECRET || "").trim();

  if (dedicated) {
    return dedicated;
  }

  const fallback = String(
    env.SUPABASE_SERVICE_ROLE_KEY ||
      env.HAVKAR_OWNERSHIP_SUPABASE_SERVICE_ROLE_KEY ||
      ""
  ).trim();

  if (!fallback) {
    return null;
  }

  return createHmac("sha256", "havkar-mainnet-ownership-v1")
    .update(fallback)
    .digest("hex");
}

function canonicalMessage(parts) {
  return [
    "HAVKAR Mainnet wallet ownership",
    "network=mainnet",
    "account=" + parts.pubkey,
    "nonce=" + parts.nonce,
    "expires=" + parts.expires,
    "purpose=prove control of Mainnet receiving public key",
    "funds=none",
    "wallet=LOBSTR"
  ].join("\n");
}

function lineValue(message, name) {
  const prefix = name + "=";
  const line = String(message || "")
    .split("\n")
    .find((item) => item.startsWith(prefix));

  return line ? line.slice(prefix.length) : "";
}

function memoForNonce(nonce) {
  return ("HKMN" + String(nonce || "").slice(0, 24)).slice(0, 28);
}

function ticketFor(message, secret) {
  return createHmac("sha256", secret).update(message, "utf8").digest("base64url");
}

function ticketsEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");

  if (left.length !== right.length || left.length === 0) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function crc16(bytes) {
  let crc = 0;

  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index] << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return crc;
}

function decodePublicKey(address) {
  if (!isPublicKey(address)) {
    return null;
  }

  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (const character of String(address)) {
    const value = BASE32_ALPHABET.indexOf(character);

    if (value < 0) {
      return null;
    }

    buffer = (buffer << 5) | value;
    bits += 5;

    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  if (bytes.length !== 35 || bytes[0] !== 48) {
    return null;
  }

  const payload = Buffer.from(bytes.slice(0, 33));
  const checksum = bytes[33] | (bytes[34] << 8);

  if (crc16(payload) !== checksum) {
    return null;
  }

  return payload.subarray(1);
}

function ed25519Verify(publicKey, data, signature) {
  try {
    const key = createPublicKey({
      key: {
        kty: "OKP",
        crv: "Ed25519",
        x: Buffer.from(publicKey).toString("base64url")
      },
      format: "jwk"
    });

    return verify(null, data, key, signature);
  } catch (error) {
    return false;
  }
}

function decodeSignature(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  if (/^[0-9a-fA-F]{128}$/.test(text)) {
    return Buffer.from(text, "hex");
  }

  try {
    const b64 = Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");

    if (b64.length === 64) {
      return b64;
    }
  } catch (error) {
    return null;
  }

  return null;
}

function verifyMessageSignatures(pubkey, message, proof) {
  const publicKey = decodePublicKey(pubkey);

  if (!publicKey) {
    return false;
  }

  const candidates = [
    proof && proof.signedMessage,
    proof && proof.signed_message_sig,
    proof && proof.sep53_signature,
    proof && proof.message_signature,
    proof && proof.signature
  ]
    .map(decodeSignature)
    .filter(Boolean);

  if (!candidates.length) {
    return false;
  }

  const payloads = [
    createHash("sha256")
      .update(
        Buffer.concat([
          Buffer.from("Stellar Signed Message:\n", "utf8"),
          Buffer.from(message, "utf8")
        ])
      )
      .digest(),
    createHash("sha256").update(pubkey + ":" + message, "utf8").digest(),
    createHash("sha256").update(message, "utf8").digest(),
    Buffer.from(message, "utf8")
  ];

  for (const signature of candidates) {
    for (const payload of payloads) {
      if (ed25519Verify(publicKey, payload, signature)) {
        return true;
      }
    }
  }

  return false;
}

function parseChallenge(message, expectedPubkey) {
  const nonce = lineValue(message, "nonce");
  const expires = lineValue(message, "expires");
  const account = lineValue(message, "account");
  const network = lineValue(message, "network");
  const funds = lineValue(message, "funds");

  if (
    network !== "mainnet" ||
    funds !== "none" ||
    account !== expectedPubkey ||
    !/^[0-9a-f]{32}$/.test(nonce) ||
    !expires
  ) {
    return null;
  }

  const expected = canonicalMessage({
    pubkey: expectedPubkey,
    nonce,
    expires
  });

  if (expected !== message) {
    return null;
  }

  const expiresMs = Date.parse(expires);

  if (!Number.isFinite(expiresMs)) {
    return null;
  }

  return { nonce, expires, expiresMs };
}

function createMemoryProofStore() {
  const rows = new Map();

  return {
    async saveProof(row) {
      if (rows.has(row.nonce)) {
        return { ok: false, code: "CHALLENGE_REPLAY" };
      }

      if (row.tx_hash) {
        for (const existing of rows.values()) {
          if (existing.tx_hash === row.tx_hash) {
            return { ok: false, code: "TX_REPLAY" };
          }
        }
      }

      rows.set(row.nonce, { ...row });
      return { ok: true };
    },
    async latestVerified(pubkey) {
      let latest = null;

      for (const row of rows.values()) {
        if (row.pubkey !== pubkey) {
          continue;
        }

        if (!latest || Date.parse(row.verified_at) > Date.parse(latest.verified_at)) {
          latest = row;
        }
      }

      return latest;
    }
  };
}

function createSupabaseProofStore(client) {
  return {
    async saveProof(row) {
      const inserted = await client.from("stellar_mainnet_ownership_proofs").insert({
        nonce: row.nonce,
        pubkey: row.pubkey,
        message: row.message,
        method: row.method,
        verified_at: row.verified_at,
        tx_hash: row.tx_hash || null
      });

      if (inserted.error) {
        const text = String(inserted.error.message || "");

        if (/duplicate|unique/i.test(text)) {
          return {
            ok: false,
            code: /tx_hash/i.test(text) ? "TX_REPLAY" : "CHALLENGE_REPLAY"
          };
        }

        throw inserted.error;
      }

      return { ok: true };
    },
    async latestVerified(pubkey) {
      const result = await client
        .from("stellar_mainnet_ownership_proofs")
        .select("nonce,pubkey,message,method,verified_at,tx_hash")
        .eq("pubkey", pubkey)
        .order("verified_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      return result.data;
    }
  };
}

async function openProofStore(options = {}) {
  if (options.store) {
    return options.store;
  }

  const url = String(options.supabaseUrl || process.env.SUPABASE_URL || "").trim();
  const key = String(
    options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();

  if (!url || !key) {
    return refused(
      409,
      "OWNERSHIP_STORE_UNAVAILABLE",
      "Mainnet ownership proofs require the production Supabase service role."
    );
  }

  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return createSupabaseProofStore(client);
}

async function issueChallenge(env, secret, now) {
  const destination = readConfiguredDestination(env);

  if (!destination.ok) {
    return destination;
  }

  const expires = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  const nonce = randomBytes(16).toString("hex");
  const message = canonicalMessage({
    pubkey: destination.destination,
    nonce,
    expires
  });
  const ticket = ticketFor(message, secret);
  const memo = memoForNonce(nonce);

  return {
    ok: true,
    status: 200,
    verified: false,
    paid: false,
    funds_moved: false,
    network: NETWORK,
    pubkey: destination.destination,
    nonce,
    expires_at: expires,
    message,
    ticket,
    memo,
    signing: {
      preferred: "lobstr_sign_message",
      lobstr_supported: true,
      instructions:
        "Connect the LOBSTR browser extension on this origin, ensure the active account is the configured Mainnet destination, and sign the challenge message. No XLM is transferred.",
      fallback_outbound:
        "If LOBSTR cannot signMessage, send a tiny native XLM payment FROM this exact account with memo_type=text and memo=" +
        memo +
        ", then submit action=mainnet_ownership_verify with tx_hash."
    }
  };
}

async function verifyHorizonOutbound(txHash, expected, memo, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const horizon = options.horizon || HORIZON_MAINNET;
  const hash = String(txHash || "").trim().toLowerCase();

  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return refused(400, "TX_HASH_INVALID", "Provide a 64-character hex Horizon transaction hash.");
  }

  let txResponse;
  let paymentsResponse;

  try {
    txResponse = await fetchImpl(horizon + "/transactions/" + hash, {
      headers: { Accept: "application/json" }
    });
    paymentsResponse = await fetchImpl(
      horizon + "/transactions/" + hash + "/payments?limit=20",
      { headers: { Accept: "application/json" } }
    );
  } catch (error) {
    return refused(503, "MAINNET_HORIZON_UNAVAILABLE", "Horizon Mainnet could not be reached.");
  }

  if (txResponse.status === 404) {
    return refused(404, "TX_NOT_FOUND", "That transaction was not found on Horizon Public.");
  }

  if (!txResponse.ok || !paymentsResponse.ok) {
    return refused(503, "MAINNET_HORIZON_UNAVAILABLE", "Horizon Mainnet returned an unexpected status.");
  }

  const tx = await txResponse.json();
  const payments = await paymentsResponse.json();

  if (tx.successful !== true) {
    return refused(403, "TX_NOT_SUCCESSFUL", "The ownership payment transaction was not successful.");
  }

  if (String(tx.memo_type || "") !== "text" || String(tx.memo || "") !== memo) {
    return refused(403, "MEMO_MISMATCH", "The ownership payment memo does not match this challenge.");
  }

  const records = (payments && payments._embedded && payments._embedded.records) || [];
  const match = records.find((row) => {
    return (
      row &&
      row.type === "payment" &&
      row.asset_type === "native" &&
      row.from === expected &&
      Number(row.amount) > 0
    );
  });

  if (!match) {
    return refused(
      403,
      "PAYMENT_MISMATCH",
      "No native outbound payment from the configured Mainnet destination was found in that transaction."
    );
  }

  return { ok: true, tx_hash: hash };
}

async function verifyChallenge(body, options = {}) {
  const env = options.env || process.env;
  const now = options.now instanceof Date ? options.now : new Date();
  const destination = readConfiguredDestination(env);

  if (!destination.ok) {
    return destination;
  }

  const secret = hmacSecret(env);

  if (!secret) {
    return refused(
      409,
      "OWNERSHIP_HMAC_UNAVAILABLE",
      "Server cannot issue/verify Mainnet ownership tickets without a service secret."
    );
  }

  const message = String(body.message || body.original_message || "");
  const ticket = String(body.ticket || "");
  const parsed = parseChallenge(message, destination.destination);

  if (!parsed) {
    return refused(403, "MESSAGE_MISMATCH", "The ownership challenge message is invalid for this destination.");
  }

  if (!ticketsEqual(ticket, ticketFor(message, secret))) {
    return refused(403, "TICKET_INVALID", "The ownership challenge ticket is invalid.");
  }

  if (parsed.expiresMs <= now.getTime()) {
    return refused(410, "CHALLENGE_EXPIRED", "This ownership challenge has expired. Request a new one.");
  }

  if (String(body.pubkey || "") && String(body.pubkey) !== destination.destination) {
    return refused(403, "PUBLIC_KEY_MISMATCH", "The signer is not the configured Mainnet destination.");
  }

  const memo = memoForNonce(parsed.nonce);
  let method = "sign_message";
  let txHash = null;

  if (body.tx_hash) {
    const outbound = await verifyHorizonOutbound(
      body.tx_hash,
      destination.destination,
      memo,
      options
    );

    if (!outbound.ok) {
      return outbound;
    }

    method = "outbound_memo_payment";
    txHash = outbound.tx_hash;
  } else {
    const signerAddress = String(body.signerAddress || body.signer_address || "").trim();

    if (signerAddress && signerAddress !== destination.destination) {
      return refused(
        403,
        "PUBLIC_KEY_MISMATCH",
        "LOBSTR signerAddress is not the configured Mainnet destination."
      );
    }

    if (!verifyMessageSignatures(destination.destination, message, body)) {
      return refused(
        403,
        "SIGNATURE_INVALID",
        "The LOBSTR/message signature does not prove control of the configured Mainnet destination."
      );
    }

    if (String(body.wallet || "").toLowerCase() === "lobstr") {
      method = "lobstr_sign_message";
    }
  }

  const store = await openProofStore(options);

  if (store && store.ok === false) {
    return store;
  }

  const verifiedAt = now.toISOString();
  const saved = await store.saveProof({
    nonce: parsed.nonce,
    pubkey: destination.destination,
    message,
    method,
    verified_at: verifiedAt,
    tx_hash: txHash
  });

  if (!saved.ok) {
    return refused(
      409,
      saved.code || "CHALLENGE_REPLAY",
      "This ownership challenge or transaction was already used."
    );
  }

  return {
    ok: true,
    status: 200,
    verified: true,
    paid: false,
    funds_moved: method === "outbound_memo_payment",
    network: NETWORK,
    pubkey: destination.destination,
    nonce: parsed.nonce,
    method,
    verified_at: verifiedAt,
    tx_hash: txHash
  };
}

async function ownershipStatus(options = {}) {
  const env = options.env || process.env;
  const destination = readConfiguredDestination(env);

  if (!destination.ok) {
    return destination;
  }

  const store = await openProofStore(options);

  if (store && store.ok === false) {
    return store;
  }

  const latest = await store.latestVerified(destination.destination);

  if (!latest || !latest.verified_at) {
    return {
      ok: true,
      status: 200,
      verified: false,
      paid: false,
      funds_moved: false,
      network: NETWORK,
      pubkey: destination.destination,
      verified_at: null
    };
  }

  return {
    ok: true,
    status: 200,
    verified: true,
    paid: false,
    funds_moved: latest.method === "outbound_memo_payment",
    network: NETWORK,
    pubkey: destination.destination,
    verified_at: latest.verified_at,
    method: latest.method,
    tx_hash: latest.tx_hash || null
  };
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

async function handleMainnetWalletOwnership(body, options = {}) {
  const input = body && typeof body === "object" ? body : {};
  const action = String(input.action || "");
  const env = options.env || process.env;

  if (hasSecretField(input)) {
    return refused(400, "SECRET_REJECTED", "A secret key or recovery phrase is not accepted.");
  }

  if (
    action !== "mainnet_ownership_challenge" &&
    action !== "mainnet_ownership_verify" &&
    action !== "mainnet_ownership_status"
  ) {
    return refused(400, "OWNERSHIP_ACTION_INVALID", "The Mainnet ownership action is not recognized.");
  }

  if (input.xdr || input.tx || input.submit === true) {
    return refused(
      403,
      "TRANSACTION_REJECTED",
      "Message signing does not accept transaction XDR. Use signMessage or the memo-payment fallback only."
    );
  }

  const now = options.now instanceof Date ? options.now : new Date();

  if (action === "mainnet_ownership_status") {
    return ownershipStatus(options);
  }

  const secret = hmacSecret(env);

  if (!secret) {
    return refused(
      409,
      "OWNERSHIP_HMAC_UNAVAILABLE",
      "Server cannot issue/verify Mainnet ownership tickets without a service secret."
    );
  }

  if (action === "mainnet_ownership_challenge") {
    return issueChallenge(env, secret, now);
  }

  return verifyChallenge(input, { ...options, env, now });
}

async function mainnetOwnershipVerified(options = {}) {
  const status = await ownershipStatus(options);
  return status.ok === true && status.verified === true;
}

module.exports = {
  CHALLENGE_TTL_MS,
  NETWORK,
  canonicalMessage,
  memoForNonce,
  ticketFor,
  verifyMessageSignatures,
  createMemoryProofStore,
  createSupabaseProofStore,
  isMainnetOwnershipRequest,
  handleMainnetWalletOwnership,
  mainnetOwnershipVerified,
  readConfiguredDestination
};
