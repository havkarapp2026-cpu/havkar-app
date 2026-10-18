const EXPECTED_PRICES = {
  plus: { unitAmount: 799, productName: "HAVKAR AI PLUS" },
  pro: { unitAmount: 1499, productName: "HAVKAR AI PRO" },
  business: { unitAmount: 2999, productName: "HAVKAR AI BUSINESS" }
};

function expectedPrice(plan) {
  return EXPECTED_PRICES[plan] || null;
}

function catalogMatch(prices, expected) {
  if (!expected) return "";
  const matches = (Array.isArray(prices) ? prices : []).filter((price) => {
    const product = price && price.product && typeof price.product === "object" ? price.product : {};
    const recurring = price && price.recurring ? price.recurring : {};
    return price
      && price.active === true
      && price.livemode === false
      && price.currency === "eur"
      && price.unit_amount === expected.unitAmount
      && price.type === "recurring"
      && recurring.interval === "month"
      && recurring.interval_count === 1
      && product.active === true
      && product.name === expected.productName
      && typeof price.id === "string"
      && price.id.startsWith("price_");
  });
  return matches.length === 1 ? matches[0].id : "";
}

function periodEndSeconds(subscription) {
  if (!subscription || typeof subscription !== "object") return null;
  if (Number.isInteger(subscription.current_period_end)) return subscription.current_period_end;
  const items = subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
  for (const item of items) {
    if (item && Number.isInteger(item.current_period_end)) return item.current_period_end;
  }
  return null;
}

function cancellationScheduled(subscription) {
  if (!subscription || typeof subscription !== "object") return false;
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired") return false;
  if (subscription.cancel_at_period_end === true) return true;
  return Number.isInteger(subscription.cancel_at);
}

function hasCancellationState(subscription) {
  if (!subscription || typeof subscription !== "object") return false;
  return Object.prototype.hasOwnProperty.call(subscription, "cancel_at_period_end")
    || Object.prototype.hasOwnProperty.call(subscription, "cancel_at");
}

function entitlementStatus(eventType, stripeStatus, sessionComplete) {
  const status = String(stripeStatus || "");
  const known = ["active", "past_due", "canceled", "unpaid", "incomplete"];
  if (eventType === "customer.subscription.deleted" || status === "canceled") return "canceled";
  if (eventType === "invoice.payment_failed" || status === "past_due" || status === "unpaid") {
    return status === "unpaid" ? "unpaid" : "past_due";
  }
  if (eventType === "checkout.session.completed" && sessionComplete === true) return "active";
  if (eventType === "invoice.paid" || status === "active") return "active";
  if (eventType === "customer.subscription.updated") return known.includes(status) ? status : "incomplete";
  return "incomplete";
}

function storedPeriodEnd(subscription, fallbackObject, existingIso) {
  const seconds = periodEndSeconds(subscription) || periodEndSeconds(fallbackObject);
  return seconds ? new Date(seconds * 1000).toISOString() : (existingIso || null);
}

function storedCancelFlag(subscription, fallbackObject, existingFlag) {
  const source = hasCancellationState(subscription)
    ? subscription
    : hasCancellationState(fallbackObject) ? fallbackObject : null;
  if (!source) return existingFlag === true;
  return cancellationScheduled(source);
}

function subscriptionIdFrom(object) {
  if (!object || typeof object !== "object") return "";
  if (typeof object.id === "string" && object.id.startsWith("sub_")) return object.id;
  if (typeof object.subscription === "string" && object.subscription.startsWith("sub_")) return object.subscription;
  if (object.subscription && typeof object.subscription.id === "string" && object.subscription.id.startsWith("sub_")) return object.subscription.id;
  const parent = object.parent && object.parent.subscription_details;
  if (parent && typeof parent.subscription === "string" && parent.subscription.startsWith("sub_")) return parent.subscription;
  return "";
}

function customerIdFrom(object) {
  if (!object || typeof object !== "object") return "";
  if (typeof object.customer === "string" && object.customer.startsWith("cus_")) return object.customer;
  if (object.customer && typeof object.customer.id === "string" && object.customer.id.startsWith("cus_")) return object.customer.id;
  return "";
}

function priceIdFrom(object) {
  if (!object || typeof object !== "object") return "";
  const items = object.items && Array.isArray(object.items.data) ? object.items.data : [];
  const itemPrice = items[0] && items[0].price;
  if (typeof itemPrice === "string" && itemPrice.startsWith("price_")) return itemPrice;
  if (itemPrice && typeof itemPrice.id === "string" && itemPrice.id.startsWith("price_")) return itemPrice.id;
  const lines = object.lines && Array.isArray(object.lines.data) ? object.lines.data : [];
  const line = lines[0] || {};
  if (typeof line.price === "string" && line.price.startsWith("price_")) return line.price;
  if (line.price && typeof line.price.id === "string" && line.price.id.startsWith("price_")) return line.price.id;
  const details = line.pricing && line.pricing.price_details;
  if (details && typeof details.price === "string" && details.price.startsWith("price_")) return details.price;
  if (object.plan && typeof object.plan.id === "string" && object.plan.id.startsWith("price_")) return object.plan.id;
  return "";
}

export {
  cancellationScheduled,
  catalogMatch,
  customerIdFrom,
  entitlementStatus,
  expectedPrice,
  hasCancellationState,
  periodEndSeconds,
  priceIdFrom,
  storedCancelFlag,
  storedPeriodEnd,
  subscriptionIdFrom
};
