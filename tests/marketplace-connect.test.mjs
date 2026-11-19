import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  marketplaceCardSplit,
  buildRecipientAccountV2CreateBody,
  buildMarketplaceDestinationCheckoutParams,
  connectAccountFlagsFromV2,
  describeSellerConnectGate,
  syncSellerConnectAccountRow
} = require("../lib/marketplace-connect.cjs");

test("marketplace 2% buyer + 3% seller routes 5% application fee on destination charge", () => {
  const split = marketplaceCardSplit(100);
  assert.equal(split.buyer_pays_eur, 102);
  assert.equal(split.seller_receives_eur, 97);
  assert.equal(split.platform_commission_eur, 5);
  assert.equal(split.buyer_pays_cents, 10200);
  assert.equal(split.application_fee_cents, 500);
  assert.equal(split.charge_pattern, "destination");
});

test("Accounts v2 recipient body requests express + application responsibilities", () => {
  const body = buildRecipientAccountV2CreateBody({
    email: "seller@example.com",
    country: "IT"
  });
  assert.equal(body.dashboard, "express");
  assert.equal(body.identity.country, "it");
  assert.equal(body.defaults.responsibilities.fees_collector, "application");
  assert.equal(body.defaults.responsibilities.losses_collector, "application");
  assert.equal(
    body.configuration.recipient.capabilities.stripe_balance.stripe_transfers
      .requested,
    true
  );
  assert.ok(body.include.includes("configuration.recipient"));
});

test("connectAccountFlagsFromV2 reads transfer capability status", () => {
  const flags = connectAccountFlagsFromV2({
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { status: "pending" }
          }
        }
      }
    },
    requirements: { summary: { minimum_deadline: "2026-01-01" } }
  });
  assert.equal(flags.charges_enabled, false);
  assert.equal(flags.transfer_capability_status, "pending");
});

test("destination Checkout params keep fee routing server-side", () => {
  const split = marketplaceCardSplit(40);
  const params = buildMarketplaceDestinationCheckoutParams({
    split,
    connectedAccountId: "acct_test_seller",
    listingTitle: "Bike",
    successUrl: "https://havkar.online/ok",
    cancelUrl: "https://havkar.online/cancel"
  });
  assert.equal(params.line_items[0].price_data.unit_amount, 4080);
  assert.equal(params.payment_intent_data.application_fee_amount, 200);
  assert.equal(
    params.payment_intent_data.transfer_data.destination,
    "acct_test_seller"
  );
  assert.equal(params.metadata.havkar_flow, "marketplace");
});

test("describeSellerConnectGate blocks until charges and payouts are enabled", () => {
  assert.equal(describeSellerConnectGate(null).code, "CONNECT_NOT_STARTED");
  assert.equal(
    describeSellerConnectGate({
      stripe_account_id: "acct_x",
      charges_enabled: false,
      payouts_enabled: false
    }).live_card_eligible,
    false
  );
  assert.equal(
    describeSellerConnectGate({
      stripe_account_id: "acct_x",
      charges_enabled: true,
      payouts_enabled: true
    }).code,
    "CONNECT_READY"
  );
});

test("syncSellerConnectAccountRow upserts flags from Stripe retrieve", async () => {
  const calls = [];
  const admin = {
    from(table) {
      assert.equal(table, "marketplace_seller_connect_accounts");
      return {
        upsert(row) {
          calls.push(row);
          return {
            select() {
              return {
                async maybeSingle() {
                  return { data: row, error: null };
                }
              };
            }
          };
        }
      };
    }
  };
  const stripe = {
    v2: {
      core: {
        accounts: {
          async retrieve() {
            return {
              id: "acct_sync",
              configuration: {
                recipient: {
                  capabilities: {
                    stripe_balance: {
                      stripe_transfers: { status: "active" }
                    }
                  }
                }
              }
            };
          }
        }
      }
    }
  };
  const result = await syncSellerConnectAccountRow(
    admin,
    stripe,
    "user-1",
    "acct_sync"
  );
  assert.equal(result.ok, true);
  assert.equal(result.live_checkout_eligible, true);
  assert.equal(calls[0].charges_enabled, true);
  assert.equal(calls[0].payouts_enabled, true);
  assert.equal(calls[0].onboarding_status, "complete");
});
