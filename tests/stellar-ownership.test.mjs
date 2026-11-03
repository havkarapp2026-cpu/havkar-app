import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";
import {
  EXPECTED_PUBKEY,
  canonicalMessage,
  createMemoryChallengeStore,
  handleWalletOwnership,
  verifyAlbedoSignatures
} from "../lib/stellar-ownership.cjs";

const CONFIRMED =
  "GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L";

function albedoProof(keypair, message, fields = {}) {
  const pubkey = keypair.publicKey();
  const base = pubkey + ":" + message;
  const digest = createHash("sha256").update(base, "utf8").digest();

  return {
    pubkey: pubkey,
    original_message: message,
    signed_message: base,
    message_signature: Buffer.from(keypair.sign(digest)).toString("hex"),
    signedMessage: Buffer.from(keypair.signMessage(message)).toString("hex"),
    ...fields
  };
}

async function issue(store, options = {}) {
  return handleWalletOwnership(
    { action: "ownership_challenge", network: "testnet" },
    { store: store, now: options.now, ...options }
  );
}

test("the confirmed Testnet account is the only default signer", () => {
  assert.equal(EXPECTED_PUBKEY, CONFIRMED);
  assert.equal(EXPECTED_PUBKEY.length, 56);
});

test("a challenge is unverified and a valid Albedo signature verifies once", async () => {
  const key = Keypair.random();
  const store = createMemoryChallengeStore();
  const options = {
    store: store,
    allowTestPubkey: true,
    expectedPubkey: key.publicKey()
  };
  const issued = await issue(store, options);

  assert.equal(issued.verified, false);
  assert.equal(issued.funds_moved, false);
  assert.equal(issued.paid, false);
  assert.equal(issued.pubkey, key.publicKey());
  assert.match(issued.message, /network=testnet/);
  assert.match(issued.message, /funds=none/);
  assert.equal(verifyAlbedoSignatures(
    key.publicKey(),
    issued.message,
    albedoProof(key, issued.message)
  ), true);

  const proof = albedoProof(key, issued.message);
  const verified = await handleWalletOwnership(
    { action: "ownership_verify", network: "testnet", nonce: issued.nonce, ...proof },
    options
  );

  assert.equal(verified.verified, true);
  assert.equal(verified.funds_moved, false);
  assert.equal(verified.paid, false);

  const status = await handleWalletOwnership(
    { action: "ownership_status", network: "testnet" },
    options
  );
  assert.equal(status.verified, true);
  assert.equal(status.verified_at, verified.verified_at);

  const replay = await handleWalletOwnership(
    { action: "ownership_verify", network: "testnet", nonce: issued.nonce, ...proof },
    options
  );
  assert.equal(replay.verified, false);
  assert.equal(replay.code, "CHALLENGE_REPLAY");
});

test("another key, a bad signature, expiry, and replay of an old challenge stay unverified", async () => {
  const owner = Keypair.random();
  const other = Keypair.random();
  const store = createMemoryChallengeStore();
  const now = new Date("2026-11-03T21:00:00.000Z");
  const options = {
    store: store,
    allowTestPubkey: true,
    expectedPubkey: owner.publicKey(),
    now: now
  };
  const issued = await issue(store, options);
  const proof = albedoProof(owner, issued.message);

  const wrongKey = await handleWalletOwnership(
    {
      action: "ownership_verify",
      network: "testnet",
      nonce: issued.nonce,
      ...albedoProof(other, issued.message.replace(owner.publicKey(), other.publicKey()))
    },
    options
  );
  assert.equal(wrongKey.verified, false);
  assert.equal(wrongKey.code, "PUBLIC_KEY_MISMATCH");

  const pending = await handleWalletOwnership(
    { action: "ownership_status", network: "testnet" },
    options
  );
  assert.equal(pending.verified, false);

  const bad = await handleWalletOwnership(
    {
      action: "ownership_verify",
      network: "testnet",
      nonce: issued.nonce,
      ...proof,
      message_signature: "a".repeat(128)
    },
    options
  );
  assert.equal(bad.verified, false);
  assert.equal(bad.code, "SIGNATURE_INVALID");

  const expired = await handleWalletOwnership(
    { action: "ownership_verify", network: "testnet", nonce: issued.nonce, ...proof },
    { ...options, now: new Date(now.getTime() + 5 * 60 * 1000 + 1) }
  );
  assert.equal(expired.verified, false);
  assert.equal(expired.code, "CHALLENGE_EXPIRED");

  const replacement = await issue(store, options);
  const stale = await handleWalletOwnership(
    { action: "ownership_verify", network: "testnet", nonce: issued.nonce, ...proof },
    { ...options, now: now }
  );
  assert.equal(stale.code, "CHALLENGE_REPLAY");
  const fresh = await handleWalletOwnership(
    {
      action: "ownership_verify",
      network: "testnet",
      nonce: replacement.nonce,
      ...albedoProof(owner, replacement.message)
    },
    { ...options, now: now }
  );
  assert.equal(fresh.verified, true);
});

test("the confirmed account is not treated as owned without its signature", async () => {
  const stranger = Keypair.random();
  const store = createMemoryChallengeStore();
  const issued = await issue(store);
  const proof = albedoProof(stranger, issued.message);
  const result = await handleWalletOwnership(
    {
      action: "ownership_verify",
      network: "testnet",
      nonce: issued.nonce,
      ...proof,
      expectedPubkey: stranger.publicKey(),
      allowTestPubkey: true
    },
    { store: store }
  );

  assert.equal(issued.pubkey, CONFIRMED);
  assert.equal(result.verified, false);
  assert.equal(result.code, "PUBLIC_KEY_MISMATCH");
  const status = await handleWalletOwnership(
    { action: "ownership_status" },
    { store: store }
  );
  assert.equal(status.verified, false);
});

test("secrets, mainnet, and transactions are rejected", async () => {
  const store = createMemoryChallengeStore();
  const secret = await handleWalletOwnership(
    { action: "ownership_verify", secret: "S".repeat(56) },
    { store: store }
  );
  assert.equal(secret.code, "SECRET_REJECTED");
  assert.equal(secret.verified, false);
  assert.equal(JSON.stringify(secret).includes("S".repeat(56)), false);

  const mainnet = await handleWalletOwnership(
    { action: "ownership_challenge", network: "mainnet" },
    { store: store }
  );
  assert.equal(mainnet.code, "STELLAR_MAINNET_DISABLED");
  assert.equal(mainnet.verified, false);

  const transaction = await handleWalletOwnership(
    { action: "ownership_verify", submit: true, xdr: "AAAA" },
    { store: store }
  );
  assert.equal(transaction.code, "TRANSACTION_REJECTED");
});

test("legacy and SEP-53 signatures are both required when both are present", () => {
  const key = Keypair.random();
  const message = canonicalMessage({
    pubkey: key.publicKey(),
    nonce: "a".repeat(32),
    expires: "2026-11-03T21:05:00.000Z"
  });
  const proof = albedoProof(key, message);

  assert.equal(verifyAlbedoSignatures(key.publicKey(), message, {
    signed_message: proof.signed_message,
    message_signature: proof.message_signature
  }), true);
  assert.equal(verifyAlbedoSignatures(key.publicKey(), message, {
    signedMessage: proof.signedMessage
  }), true);
  assert.equal(verifyAlbedoSignatures(key.publicKey(), message, {
    ...proof,
    signedMessage: "b".repeat(128)
  }), false);
  assert.equal(verifyAlbedoSignatures(key.publicKey(), message, proof), true);
});

test("production is refused and the route stays inside the existing function", async () => {
  const storeCalls = { issue: 0 };
  const store = {
    async issue() {
      storeCalls.issue += 1;
    }
  };
  const production = await handleWalletOwnership(
    { action: "ownership_challenge" },
    {
      supabaseUrl: "https://gispovnciifgikvgpzck.supabase.co",
      serviceRoleKey: "not-used",
      store: store
    }
  );

  assert.equal(production.status, 403);
  assert.equal(production.code, "PRODUCTION_DATABASE_REFUSED");
  assert.equal(production.verified, false);
  assert.equal(storeCalls.issue, 0);

  const missing = await handleWalletOwnership(
    { action: "ownership_challenge" },
    { supabaseUrl: "https://example.supabase.co" }
  );
  assert.equal(missing.code, "STAGING_DATABASE_REQUIRED");
  assert.equal(missing.verified, false);

  const checkout = fs.readFileSync("api/create-event-checkout.js", "utf8");
  const ownership = fs.readFileSync("lib/stellar-ownership.cjs", "utf8");
  const handler = checkout.slice(checkout.indexOf("export default async function handler"));
  const files = fs.readdirSync("api").filter((name) => name.endsWith(".js"));
  const page = fs.readFileSync("wallet-ownership.html", "utf8");
  const browser = fs.readFileSync("havkar-wallet-ownership.js", "utf8");
  const migration = fs.readFileSync(
    "supabase/migrations/20261103235900_wallet_ownership_challenges.sql",
    "utf8"
  );
  const vercel = fs.readFileSync("vercel.json", "utf8");

  assert.equal(files.length, 12);
  assert.match(checkout, /function getStripe\(\)/);
  assert.equal(checkout.includes("const stripe = new Stripe"), false);
  assert.equal(ownership.includes("@stellar/stellar-sdk"), false);
  assert.ok(handler.indexOf("isOwnershipRequest") < handler.indexOf("STRIPE_SECRET_KEY"));
  assert.ok(handler.indexOf("isOwnershipRequest") < handler.indexOf("authenticateUser"));
  assert.equal(handler.includes("allowTestPubkey"), false);
  assert.equal(handler.includes("expectedPubkey"), false);
  assert.match(vercel, /\/api\/stellar-ownership/);
  assert.match(page, new RegExp(CONFIRMED));
  assert.match(page, /data-verified="false"/);
  assert.match(browser, /intent: "sign_message"/);
  assert.match(browser, /response\.verified === true/);
  assert.doesNotMatch(browser, /submit:\s*true/);
  assert.doesNotMatch(browser, /\bpay\s*\(/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL/);
  assert.match(migration, /wallet_ownership_challenges_no_client/);
  assert.match(migration, /USING \(false\)/);
  assert.match(migration, new RegExp(CONFIRMED));
  assert.doesNotMatch(migration, /secret_key|mnemonic|recovery_phrase|private_key/i);
});

test("the API handler refuses production before opening a challenge", async () => {
  delete process.env.STRIPE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://gispovnciifgikvgpzck.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "ownership-test-not-a-secret";
  delete process.env.HAVKAR_OWNERSHIP_SUPABASE_URL;
  delete process.env.HAVKAR_OWNERSHIP_SUPABASE_SERVICE_ROLE_KEY;

  const { default: handler } = await import("../api/create-event-checkout.js");
  const sent = [];
  const res = {
    status(code) {
      sent.push(code);
      return this;
    },
    json(body) {
      sent.push(body);
      return body;
    }
  };

  await handler({
    method: "POST",
    url: "/api/stellar-ownership",
    query: { havkarAction: "ownership" },
    headers: {},
    body: { action: "ownership_challenge", network: "testnet" }
  }, res);

  assert.equal(sent[0], 403);
  assert.equal(sent[1].verified, false);
  assert.equal(sent[1].code, "PRODUCTION_DATABASE_REFUSED");
  assert.equal(sent[1].funds_moved, false);
});
