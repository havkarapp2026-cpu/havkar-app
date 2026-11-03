/*
 * One-time Stellar Testnet wallet ownership challenge.
 * Albedo signs a server-issued message. No transaction is built or submitted.
 * Ownership stays unverified until the signature matches this public key.
 * The production database is never used as the nonce store.
 */

const { createHash, randomBytes } = require("node:crypto");
const { Keypair } = require("@stellar/stellar-sdk");

const EXPECTED_PUBKEY =
  "GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L";
const PRODUCTION_REF = "gispovnciifgikvgpzck";
const STAGING_REF = "keglioewbkgdabsizvys";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
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

function refused(status, code, error) {
  return {
    ok: false,
    status: status,
    code: code,
    verified: false,
    paid: false,
    funds_moved: false,
    network: "testnet",
    pubkey: EXPECTED_PUBKEY,
    error: error
  };
}

function canonicalMessage(parts) {
  return [
    "HAVKAR wallet ownership",
    "network=testnet",
    "account=" + parts.pubkey,
    "nonce=" + parts.nonce,
    "expires=" + parts.expires,
    "purpose=prove control of this public key",
    "funds=none"
  ].join("\n");
}

function lineValue(message, name) {
  const prefix = name + "=";
  const line = String(message || "")
    .split("\n")
    .find((item) => item.startsWith(prefix));

  return line ? line.slice(prefix.length) : "";
}

function databaseHost(url) {
  try {
    return new URL(String(url || "")).host;
  } catch (error) {
    return "";
  }
}

function databaseDecision(url) {
  const host = databaseHost(url);

  if (host === PRODUCTION_REF + ".supabase.co") {
    return refused(
      403,
      "PRODUCTION_DATABASE_REFUSED",
      "Wallet ownership challenges are not stored in the production database."
    );
  }

  if (host !== STAGING_REF + ".supabase.co") {
    return refused(
      409,
      "STAGING_DATABASE_REQUIRED",
      "Wallet ownership challenges require the staging database. This server is not connected to it."
    );
  }

  return { ok: true };
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

function hexToBytes(value) {
  const text = String(value || "").trim();

  if (!/^[0-9a-fA-F]{128}$/.test(text)) {
    return null;
  }

  return Buffer.from(text, "hex");
}

function verifyAlbedoSignatures(pubkey, message, proof) {
  let keypair;

  try {
    keypair = Keypair.fromPublicKey(pubkey);
  } catch (error) {
    return false;
  }

  const legacyHex = proof && proof.message_signature;
  const sepHex = proof && (proof.signedMessage || proof.sep53_signature);
  const signedMessage = proof && proof.signed_message != null
    ? String(proof.signed_message)
    : "";
  let saw = false;

  if (legacyHex != null && String(legacyHex).length > 0) {
    saw = true;

    if (signedMessage !== pubkey + ":" + message) {
      return false;
    }

    const signature = hexToBytes(legacyHex);

    if (!signature) {
      return false;
    }

    const digest = createHash("sha256")
      .update(pubkey + ":" + message, "utf8")
      .digest();

    if (!keypair.verify(digest, signature)) {
      return false;
    }
  }

  if (sepHex != null && String(sepHex).length > 0) {
    saw = true;
    const signature = hexToBytes(sepHex);

    if (!signature || !keypair.verifyMessage(message, signature)) {
      return false;
    }
  }

  return saw;
}

function messageBoundToRow(row, expected) {
  if (!row || row.pubkey !== expected) {
    return false;
  }

  if (row.message !== canonicalMessage({
    pubkey: row.pubkey,
    nonce: row.nonce,
    expires: lineValue(row.message, "expires")
  })) {
    return false;
  }

  const expiresAt = Date.parse(row.expires_at);
  const messageExpires = Date.parse(lineValue(row.message, "expires"));

  return Number.isFinite(expiresAt)
    && expiresAt === messageExpires
    && lineValue(row.message, "network") === "testnet"
    && lineValue(row.message, "account") === row.pubkey
    && lineValue(row.message, "nonce") === row.nonce
    && lineValue(row.message, "funds") === "none";
}

function assertNoTransaction(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  if (body.submit === true || body.xdr || body.tx) {
    return refused(
      403,
      "TRANSACTION_REJECTED",
      "Ownership verification signs a message only. It does not accept or submit a transaction."
    );
  }

  const network = String(body.network || "testnet").toLowerCase();

  if (network === "public" || network === "mainnet") {
    return refused(
      403,
      "STELLAR_MAINNET_DISABLED",
      "Stellar Mainnet is not used for this ownership check."
    );
  }

  if (network !== "testnet") {
    return refused(
      403,
      "TESTNET_REQUIRED",
      "The ownership challenge is Testnet only."
    );
  }

  return null;
}

function createMemoryChallengeStore() {
  const rows = new Map();

  return {
    async issue(row) {
      for (const current of rows.values()) {
        if (current.pubkey === row.pubkey && current.state === "pending") {
          current.state = "superseded";
        }
      }

      rows.set(row.nonce, {
        nonce: row.nonce,
        pubkey: row.pubkey,
        message: row.message,
        expires_at: row.expires_at,
        state: "pending",
        used_at: null
      });
    },
    async read(nonce) {
      const row = rows.get(nonce);
      return row ? { ...row } : null;
    },
    async consume(nonce, nowIso) {
      const row = rows.get(nonce);

      if (!row || row.state !== "pending") {
        return false;
      }

      if (Date.parse(row.expires_at) <= Date.parse(nowIso)) {
        return false;
      }

      row.state = "consumed";
      row.used_at = nowIso;
      return true;
    },
    async latestVerified(pubkey) {
      let latest = null;

      for (const row of rows.values()) {
        if (row.pubkey !== pubkey || row.state !== "consumed" || !row.used_at) {
          continue;
        }

        if (!latest || Date.parse(row.used_at) > Date.parse(latest.used_at)) {
          latest = row;
        }
      }

      return latest ? { used_at: latest.used_at } : null;
    }
  };
}

function createSupabaseChallengeStore(client) {
  return {
    async issue(row) {
      const retired = await client
        .from("wallet_ownership_challenges")
        .update({ state: "superseded" })
        .eq("pubkey", row.pubkey)
        .eq("state", "pending");

      if (retired.error) {
        throw retired.error;
      }

      const inserted = await client
        .from("wallet_ownership_challenges")
        .insert({
          nonce: row.nonce,
          pubkey: row.pubkey,
          message: row.message,
          expires_at: row.expires_at,
          state: "pending"
        });

      if (inserted.error) {
        throw inserted.error;
      }
    },
    async read(nonce) {
      const result = await client
        .from("wallet_ownership_challenges")
        .select("nonce,pubkey,message,expires_at,state,used_at")
        .eq("nonce", nonce)
        .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      return result.data;
    },
    async consume(nonce, nowIso) {
      const result = await client
        .from("wallet_ownership_challenges")
        .update({ state: "consumed", used_at: nowIso })
        .eq("nonce", nonce)
        .eq("state", "pending")
        .gt("expires_at", nowIso)
        .select("nonce");

      if (result.error) {
        throw result.error;
      }

      return Array.isArray(result.data) && result.data.length === 1;
    },
    async latestVerified(pubkey) {
      const result = await client
        .from("wallet_ownership_challenges")
        .select("used_at")
        .eq("pubkey", pubkey)
        .eq("state", "consumed")
        .order("used_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (result.error) {
        throw result.error;
      }

      return result.data;
    }
  };
}

async function openStore(options) {
  if (options.supabaseUrl || !options.store) {
    const decision = databaseDecision(options.supabaseUrl);

    if (!decision.ok) {
      return decision;
    }
  }

  if (options.store) {
    return options.store;
  }

  if (!options.serviceRoleKey) {
    return refused(
      409,
      "STAGING_DATABASE_REQUIRED",
      "Wallet ownership challenges require the staging database. This server is not connected to it."
    );
  }

  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(
    options.supabaseUrl,
    options.serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  return createSupabaseChallengeStore(client);
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

async function issueChallenge(store, now, expected) {
  const expires = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  const nonce = randomBytes(16).toString("hex");
  const message = canonicalMessage({
    pubkey: expected,
    nonce: nonce,
    expires: expires
  });

  await store.issue({
    nonce: nonce,
    pubkey: expected,
    message: message,
    expires_at: expires
  });

  return {
    ok: true,
    status: 200,
    verified: false,
    paid: false,
    funds_moved: false,
    network: "testnet",
    pubkey: expected,
    nonce: nonce,
    expires_at: expires,
    message: message
  };
}

async function verifyChallenge(store, body, now, expected) {
  const blocked = assertNoTransaction(body);

  if (blocked) {
    return blocked;
  }

  const nonce = String(body.nonce || "");
  const pubkey = String(body.pubkey || "");
  const row = await store.read(nonce);

  if (!row) {
    return refused(404, "CHALLENGE_NOT_FOUND", "This ownership challenge does not exist.");
  }

  if (pubkey !== expected || row.pubkey !== expected) {
    return refused(
      403,
      "PUBLIC_KEY_MISMATCH",
      "The signature is not for the confirmed Testnet account."
    );
  }

  if (!messageBoundToRow(row, expected)) {
    return refused(403, "MESSAGE_MISMATCH", "The stored challenge does not match the Testnet ownership message.");
  }

  if (body.original_message != null && String(body.original_message) !== row.message) {
    return refused(403, "MESSAGE_MISMATCH", "The signed text is not the server challenge.");
  }

  if (row.state === "consumed") {
    return refused(409, "CHALLENGE_REPLAY", "This ownership challenge was already used.");
  }

  if (row.state !== "pending") {
    return refused(409, "CHALLENGE_REPLAY", "This ownership challenge is no longer active.");
  }

  if (Date.parse(row.expires_at) <= now.getTime()) {
    return refused(410, "CHALLENGE_EXPIRED", "This ownership challenge has expired.");
  }

  if (!verifyAlbedoSignatures(expected, row.message, body)) {
    return refused(403, "SIGNATURE_INVALID", "The Albedo signature does not prove control of the Testnet account.");
  }

  const nowIso = now.toISOString();
  const consumed = await store.consume(nonce, nowIso);

  if (!consumed) {
    return refused(409, "CHALLENGE_REPLAY", "This ownership challenge was already used.");
  }

  return {
    ok: true,
    status: 200,
    verified: true,
    paid: false,
    funds_moved: false,
    network: "testnet",
    pubkey: expected,
    nonce: nonce,
    verified_at: nowIso
  };
}

async function ownershipStatus(store, expected) {
  if (!store || typeof store.latestVerified !== "function") {
    return refused(
      409,
      "STAGING_DATABASE_REQUIRED",
      "Wallet ownership status is unavailable."
    );
  }

  const latest = await store.latestVerified(expected);

  if (!latest || !latest.used_at) {
    return {
      ok: true,
      status: 200,
      verified: false,
      paid: false,
      funds_moved: false,
      network: "testnet",
      pubkey: expected,
      verified_at: null
    };
  }

  return {
    ok: true,
    status: 200,
    verified: true,
    paid: false,
    funds_moved: false,
    network: "testnet",
    pubkey: expected,
    verified_at: latest.used_at
  };
}

async function handleWalletOwnership(body, options = {}) {
  const input = body && typeof body === "object" ? body : {};
  const action = String(input.action || "");

  if (hasSecretField(input)) {
    return refused(
      400,
      "SECRET_REJECTED",
      "A secret key or recovery phrase is not accepted."
    );
  }

  if (
    action !== "ownership_challenge"
    && action !== "ownership_verify"
    && action !== "ownership_status"
  ) {
    return refused(400, "OWNERSHIP_ACTION_INVALID", "The ownership action is not recognized.");
  }

  let store;

  try {
    store = await openStore(options);
  } catch (error) {
    return refused(500, "OWNERSHIP_STORE_UNAVAILABLE", "The ownership challenge store is unavailable.");
  }

  if (store && store.ok === false) {
    return store;
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const expected = options.allowTestPubkey === true && options.expectedPubkey
    ? options.expectedPubkey
    : EXPECTED_PUBKEY;

  try {
    if (action === "ownership_challenge") {
      const blocked = assertNoTransaction(input);

      if (blocked) {
        return blocked;
      }

      return await issueChallenge(store, now, expected);
    }

    if (action === "ownership_status") {
      return await ownershipStatus(store, expected);
    }

    return await verifyChallenge(store, input, now, expected);
  } catch (error) {
    return refused(500, "OWNERSHIP_STORE_UNAVAILABLE", "The ownership challenge store is unavailable.");
  }
}

module.exports = {
  EXPECTED_PUBKEY,
  CHALLENGE_TTL_MS,
  canonicalMessage,
  verifyAlbedoSignatures,
  databaseDecision,
  createMemoryChallengeStore,
  createSupabaseChallengeStore,
  isOwnershipRequest,
  handleWalletOwnership
};
