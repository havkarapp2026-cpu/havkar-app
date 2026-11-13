import assert from "node:assert/strict";

/**
 * Mirrors chat.html conversationMatchesRoute for pure regression coverage
 * of the Soran PlayStation (ad 50) vs power-bank (ad 28) case.
 */
function conversationMatchesRoute(conversation, route, currentUserId) {
  if (!conversation || !conversation.id) return false;
  if (
    route.conversationId &&
    String(conversation.id) !== String(route.conversationId)
  ) {
    return false;
  }
  if (route.adId && String(conversation.ad_id) !== String(route.adId)) {
    return false;
  }
  if (
    route.sellerId &&
    String(conversation.seller_id) !== String(route.sellerId)
  ) {
    return false;
  }
  const me = String(currentUserId || "");
  if (!me) return false;
  const isBuyer = String(conversation.buyer_id) === me;
  const isSeller = String(conversation.seller_id) === me;
  if (!isBuyer && !isSeller) return false;
  if (
    route.sellerId &&
    isBuyer &&
    String(conversation.seller_id) !== String(route.sellerId)
  ) {
    return false;
  }
  return true;
}

const buyer = "9b34b0bb-271a-49ee-aeb7-a9d28be06a06";
const sellerSoran = "ad052523-8831-45e2-9673-55373dbea311";
const powerBank = {
  id: "f66eda6b-d5b5-4e71-9d85-f2dffaaece2a",
  ad_id: 28,
  buyer_id: buyer,
  seller_id: sellerSoran
};
const playStation = {
  id: "62aa6302-b5f8-42d1-a73e-66dc2c11e6e0",
  ad_id: 50,
  buyer_id: buyer,
  seller_id: sellerSoran
};

const psRoute = {
  conversationId: playStation.id,
  adId: "50",
  sellerId: sellerSoran
};

assert.equal(
  conversationMatchesRoute(playStation, psRoute, buyer),
  true,
  "PlayStation listing thread must match its own route"
);
assert.equal(
  conversationMatchesRoute(powerBank, psRoute, buyer),
  false,
  "Power-bank thread must NOT match PlayStation Message Seller route"
);

// Most-recent same-seller thread must not win when only ad_id/seller_id are set.
assert.equal(
  conversationMatchesRoute(powerBank, { adId: "50", sellerId: sellerSoran }, buyer),
  false
);
assert.equal(
  conversationMatchesRoute(playStation, { adId: "50", sellerId: sellerSoran }, buyer),
  true
);

// Stranger must never match.
assert.equal(
  conversationMatchesRoute(playStation, psRoute, "00000000-0000-0000-0000-000000000000"),
  false
);

console.log("CHAT_CONVERSATION_ROUTE_LOGIC_TEST_OK");
