import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import {
  canonicalMessage,
  createMemoryProofStore,
  handleMainnetWalletOwnership,
  memoForNonce,
  ticketFor,
  verifyMessageSignatures
} from "../lib/stellar-mainnet-ownership.cjs";

const destination = Keypair.random();
const other = Keypair.random();
const env = {
  HAVKAR_STELLAR_MAINNET_DESTINATION: destination.publicKey(),
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-for-hmac-only"
};

function sep53Proof(keypair, message) {
  return {
    signedMessage: Buffer.from(keypair.signMessage(message)).toString("base64"),
    signerAddress: keypair.publicKey(),
    wallet: "lobstr"
  };
}

{
  const store = createMemoryProofStore();
  const issued = await handleMainnetWalletOwnership(
    { action: "mainnet_ownership_challenge" },
    { env, store, now: new Date("2026-11-09T13:00:00.000Z") }
  );

  assert.equal(issued.ok, true);
  assert.equal(issued.verified, false);
  assert.equal(issued.network, "mainnet");
  assert.equal(issued.pubkey, destination.publicKey());
  assert.match(issued.message, /network=mainnet/);
  assert.match(issued.message, /funds=none/);
  assert.equal(issued.memo, memoForNonce(issued.nonce));
  assert.equal(issued.signing.lobstr_supported, true);
}

{
  const store = createMemoryProofStore();
  const now = new Date("2026-11-09T13:00:00.000Z");
  const issued = await handleMainnetWalletOwnership(
    { action: "mainnet_ownership_challenge" },
    { env, store, now }
  );

  assert.equal(
    verifyMessageSignatures(
      destination.publicKey(),
      issued.message,
      sep53Proof(destination, issued.message)
    ),
    true
  );

  const verified = await handleMainnetWalletOwnership(
    {
      action: "mainnet_ownership_verify",
      message: issued.message,
      ticket: issued.ticket,
      pubkey: destination.publicKey(),
      ...sep53Proof(destination, issued.message)
    },
    { env, store, now }
  );

  assert.equal(verified.verified, true);
  assert.equal(verified.funds_moved, false);
  assert.equal(verified.pubkey, destination.publicKey());
  assert.equal(verified.method, "lobstr_sign_message");

  const status = await handleMainnetWalletOwnership(
    { action: "mainnet_ownership_status" },
    { env, store, now }
  );
  assert.equal(status.verified, true);

  const replay = await handleMainnetWalletOwnership(
    {
      action: "mainnet_ownership_verify",
      message: issued.message,
      ticket: issued.ticket,
      ...sep53Proof(destination, issued.message)
    },
    { env, store, now }
  );
  assert.equal(replay.verified, false);
  assert.equal(replay.code, "CHALLENGE_REPLAY");
}

{
  const store = createMemoryProofStore();
  const now = new Date("2026-11-09T13:00:00.000Z");
  const issued = await handleMainnetWalletOwnership(
    { action: "mainnet_ownership_challenge" },
    { env, store, now }
  );

  const wrongSignerAddress = await handleMainnetWalletOwnership(
    {
      action: "mainnet_ownership_verify",
      message: issued.message,
      ticket: issued.ticket,
      ...sep53Proof(other, issued.message)
    },
    { env, store, now }
  );
  assert.equal(wrongSignerAddress.code, "PUBLIC_KEY_MISMATCH");

  const wrong = await handleMainnetWalletOwnership(
    {
      action: "mainnet_ownership_verify",
      message: issued.message,
      ticket: issued.ticket,
      signedMessage: Buffer.from(other.signMessage(issued.message)).toString("base64"),
      wallet: "lobstr"
    },
    { env, store, now }
  );
  assert.equal(wrong.code, "SIGNATURE_INVALID");

  const badTicket = await handleMainnetWalletOwnership(
    {
      action: "mainnet_ownership_verify",
      message: issued.message,
      ticket: "not-the-ticket",
      ...sep53Proof(destination, issued.message)
    },
    { env, store, now }
  );
  assert.equal(badTicket.code, "TICKET_INVALID");
}

{
  const store = createMemoryProofStore();
  const now = new Date("2026-11-09T13:00:00.000Z");
  const issued = await handleMainnetWalletOwnership(
    { action: "mainnet_ownership_challenge" },
    { env, store, now }
  );
  const hash = "a".repeat(64);

  const verified = await handleMainnetWalletOwnership(
    {
      action: "mainnet_ownership_verify",
      message: issued.message,
      ticket: issued.ticket,
      pubkey: destination.publicKey(),
      tx_hash: hash
    },
    {
      env,
      store,
      now,
      fetchImpl: async (url) => {
        const href = String(url);
        if (href.endsWith("/payments?limit=20")) {
          return {
            ok: true,
            json: async () => ({
              _embedded: {
                records: [
                  {
                    type: "payment",
                    asset_type: "native",
                    from: destination.publicKey(),
                    to: other.publicKey(),
                    amount: "0.0000001"
                  }
                ]
              }
            })
          };
        }
        return {
          ok: true,
          json: async () => ({
            successful: true,
            memo_type: "text",
            memo: issued.memo
          })
        };
      }
    }
  );

  assert.equal(verified.verified, true);
  assert.equal(verified.method, "outbound_memo_payment");
  assert.equal(verified.funds_moved, true);
  assert.equal(verified.tx_hash, hash);
}

{
  const message = canonicalMessage({
    pubkey: destination.publicKey(),
    nonce: "ab".repeat(16),
    expires: "2026-11-09T13:10:00.000Z"
  });
  assert.match(message, /HAVKAR Mainnet wallet ownership/);
  const ticket = ticketFor(message, "secret");
  assert.equal(ticket, ticketFor(message, "secret"));
  assert.notEqual(ticket, ticketFor(message + "x", "secret"));
  assert.equal(createHash("sha256").update("x").digest("hex").length, 64);
}

console.log("STELLAR_MAINNET_OWNERSHIP_TEST_OK");
