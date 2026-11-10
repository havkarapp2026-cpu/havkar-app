import assert from "node:assert/strict";
import {
  EU_EEA_ISO2,
  PLAY_CRYPTO_FORM_ISO2,
  cryptoGeoEnforcementEnabled,
  evaluateCryptoGeoAccess,
  resolveRequestCountry,
  describeCryptoGeoStatus
} from "../lib/crypto-geo-policy.cjs";
import { evaluateStellarCheckout, verifyStellarSettlement } from "../lib/stellar-checkout.cjs";

assert.equal(cryptoGeoEnforcementEnabled({}), false);
assert.equal(
  cryptoGeoEnforcementEnabled({ HAVKAR_CRYPTO_GEO_ENFORCEMENT: "true" }),
  true
);

const statusOff = describeCryptoGeoStatus({});
assert.equal(statusOff.enforcement, false);

// Default: enforcement off → crypto allowed even for IT
{
  const it = evaluateCryptoGeoAccess({ country: "IT", uncertain: false }, {});
  assert.equal(it.allowed, true);
  assert.equal(it.enforcement, false);
}

const enforceEu = {
  HAVKAR_CRYPTO_GEO_ENFORCEMENT: "true",
  HAVKAR_CRYPTO_GEO_PRESET: "eu_eea",
  HAVKAR_CRYPTO_GEO_UNCERTAIN: "deny"
};

{
  const blocked = evaluateCryptoGeoAccess(
    { country: "IT", uncertain: false },
    enforceEu
  );
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.code, "CRYPTO_GEO_RESTRICTED");

  const us = evaluateCryptoGeoAccess({ country: "US", uncertain: false }, enforceEu);
  // US is not in eu_eea deny list → allowed under deny_list eu_eea
  assert.equal(us.allowed, true);

  const uncertain = evaluateCryptoGeoAccess(
    { country: null, uncertain: true },
    enforceEu
  );
  assert.equal(uncertain.allowed, false);
  assert.equal(uncertain.code, "CRYPTO_GEO_UNCERTAIN");
}

// play_listed preset blocks US
{
  const play = {
    HAVKAR_CRYPTO_GEO_ENFORCEMENT: "true",
    HAVKAR_CRYPTO_GEO_PRESET: "play_listed"
  };
  const us = evaluateCryptoGeoAccess({ country: "US", uncertain: false }, play);
  assert.equal(us.allowed, false);
  assert.ok(PLAY_CRYPTO_FORM_ISO2.includes("US"));
}

// allow_list mode
{
  const allowEnv = {
    HAVKAR_CRYPTO_GEO_ENFORCEMENT: "true",
    HAVKAR_CRYPTO_GEO_MODE: "allow_list",
    HAVKAR_CRYPTO_ALLOWED_COUNTRIES: "NZ,AU"
  };
  assert.equal(
    evaluateCryptoGeoAccess({ country: "NZ", uncertain: false }, allowEnv).allowed,
    true
  );
  assert.equal(
    evaluateCryptoGeoAccess({ country: "IT", uncertain: false }, allowEnv).allowed,
    false
  );
}

// Platform header preferred; client header ignored by default (anti-bypass)
{
  const resolved = resolveRequestCountry(
    {
      headers: {
        "x-vercel-ip-country": "DE",
        "x-havkar-country": "US"
      },
      body: { country_code: "US" }
    },
    enforceEu
  );
  assert.equal(resolved.country, "DE");
  assert.equal(resolved.source, "platform");

  const clientIgnored = resolveRequestCountry(
    {
      headers: { "x-havkar-country": "US" },
      body: { country_code: "US" }
    },
    enforceEu
  );
  assert.equal(clientIgnored.country, null);
  assert.equal(clientIgnored.uncertain, true);

  const clientTrusted = resolveRequestCountry(
    {
      headers: { "x-havkar-country": "US" },
      body: {}
    },
    { ...enforceEu, HAVKAR_CRYPTO_GEO_TRUST_CLIENT_HEADER: "true" }
  );
  assert.equal(clientTrusted.country, "US");
  assert.equal(clientTrusted.source, "client_trusted");
}

// Checkout integration: enforcement off keeps marketplace quote path
{
  const quote = evaluateStellarCheckout({
    flow: "marketplace",
    price: 20,
    idempotency_key: "geo-market-20xx",
    _geo: { country: "IT", uncertain: false }
  });
  assert.equal(quote.ok, true);
}

// Checkout integration: enforcement on blocks IT
{
  const prev = process.env.HAVKAR_CRYPTO_GEO_ENFORCEMENT;
  const prevPreset = process.env.HAVKAR_CRYPTO_GEO_PRESET;
  process.env.HAVKAR_CRYPTO_GEO_ENFORCEMENT = "true";
  process.env.HAVKAR_CRYPTO_GEO_PRESET = "eu_eea";
  try {
    const refused = evaluateStellarCheckout({
      flow: "marketplace",
      price: 20,
      idempotency_key: "geo-market-block",
      _geo: { country: "IT", uncertain: false }
    });
    assert.equal(refused.ok, false);
    assert.equal(refused.code, "CRYPTO_GEO_RESTRICTED");
    assert.equal(refused.paid, false);

    const settledBlocked = await verifyStellarSettlement(
      {
        from() {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            neq() {
              return this;
            },
            update() {
              return this;
            },
            maybeSingle: async () => ({ data: null }),
            single: async () => ({ data: null })
          };
        }
      },
      "user-1",
      { intent_id: "x", tx_hash: "a".repeat(64) },
      {
        geo: { country: "FR", uncertain: false },
        env: {
          HAVKAR_CRYPTO_GEO_ENFORCEMENT: "true",
          HAVKAR_CRYPTO_GEO_PRESET: "eu_eea",
          HAVKAR_STELLAR_TESTNET_DESTINATION:
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
        }
      }
    );
    assert.equal(settledBlocked.code, "CRYPTO_GEO_RESTRICTED");
    assert.equal(settledBlocked.order_paid, false);
  } finally {
    if (prev === undefined) delete process.env.HAVKAR_CRYPTO_GEO_ENFORCEMENT;
    else process.env.HAVKAR_CRYPTO_GEO_ENFORCEMENT = prev;
    if (prevPreset === undefined) delete process.env.HAVKAR_CRYPTO_GEO_PRESET;
    else process.env.HAVKAR_CRYPTO_GEO_PRESET = prevPreset;
  }
}

assert.ok(EU_EEA_ISO2.includes("IT"));
assert.ok(EU_EEA_ISO2.includes("NO"));
assert.equal(EU_EEA_ISO2.length >= 30, true);

console.log("CRYPTO_GEO_POLICY_TEST_OK");
