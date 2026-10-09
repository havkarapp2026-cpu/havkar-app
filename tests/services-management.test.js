"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const services = require("../havkar-services.js");

const page = fs.readFileSync(
  path.join(__dirname, "..", "services.html"),
  "utf8"
);

function mockClient(responder) {
  const calls = [];

  function from(table) {
    const state = {
      table: table,
      op: null,
      payload: null,
      filters: [],
      selected: null
    };
    const api = {
      update: function (payload) {
        state.op = "update";
        state.payload = payload;
        return api;
      },
      eq: function (column, value) {
        state.filters.push([column, value]);
        return api;
      },
      select: function (columns) {
        state.selected = columns;
        return api;
      },
      then: function (resolve, reject) {
        calls.push(state);
        return Promise.resolve(responder(state)).then(resolve, reject);
      }
    };
    return api;
  }

  return { from: from, calls: calls };
}

function filterValue(call, column) {
  const found = call.filters.find(function (filter) {
    return filter[0] === column;
  });
  return found ? found[1] : undefined;
}

(async function () {
  const hourly = services.parsePriceInput("€30 / hour");
  assert.strictEqual(hourly.ok, true);
  assert.strictEqual(hourly.priceType, "hourly");
  assert.strictEqual(hourly.amount, 30);

  const fixed = services.parsePriceInput("25");
  assert.strictEqual(fixed.priceType, "fixed");

  const daily = services.parsePriceInput("40 per day");
  assert.strictEqual(daily.priceType, "daily");

  const negotiable = services.parsePriceInput("15 negotiable");
  assert.strictEqual(negotiable.priceType, "negotiable");

  assert.strictEqual(services.parsePriceInput("30 per job").ok, false);
  assert.strictEqual(
    services.parsePriceInput("30 per job").reason,
    "unsupported_price_type"
  );
  assert.strictEqual(services.parsePriceInput("20 per visit").ok, false);
  assert.deepStrictEqual(services.PRICE_TYPES, [
    "fixed",
    "hourly",
    "daily",
    "negotiable"
  ]);

  assert.strictEqual(services.providerBookingTransition("pending", "accepted"), true);
  assert.strictEqual(services.providerBookingTransition("pending", "declined"), true);
  assert.strictEqual(services.providerBookingTransition("accepted", "completed"), true);
  assert.strictEqual(services.providerBookingTransition("pending", "completed"), false);
  assert.strictEqual(services.providerBookingTransition("pending", "cancelled"), false);
  assert.strictEqual(services.providerBookingTransition("declined", "accepted"), false);
  assert.strictEqual(services.providerBookingTransition("completed", "accepted"), false);
  assert.strictEqual(services.customerBookingTransition("pending", "cancelled"), true);
  assert.strictEqual(services.customerBookingTransition("accepted", "cancelled"), true);
  assert.strictEqual(services.customerBookingTransition("completed", "cancelled"), false);
  assert.strictEqual(services.customerBookingTransition("pending", "accepted"), false);

  assert.strictEqual(services.canBookService({
    provider_id: "owner",
    status: "active"
  }, "owner"), false);
  assert.strictEqual(services.canBookService({
    provider_id: "owner",
    status: "paused"
  }, "customer"), false);
  assert.strictEqual(services.canBookService({
    provider_id: "owner",
    status: "active"
  }, "customer"), true);

  const blocked = mockClient(function () {
    throw new Error("update should not run");
  });
  const blockedResult = await services.applyBookingTransition(blocked, {
    role: "provider",
    bookingId: 5,
    userId: "provider-1",
    fromStatus: "pending",
    toStatus: "completed"
  });
  assert.strictEqual(blockedResult.ok, false);
  assert.strictEqual(blockedResult.reason, "blocked_transition");
  assert.strictEqual(blocked.calls.length, 0);

  const accepted = mockClient(function () {
    return {
      data: [{ id: 5, status: "accepted", provider_id: "provider-1" }],
      error: null
    };
  });
  const acceptedResult = await services.applyBookingTransition(accepted, {
    role: "provider",
    bookingId: 5,
    userId: "provider-1",
    fromStatus: "pending",
    toStatus: "accepted"
  });
  assert.strictEqual(acceptedResult.ok, true);
  assert.strictEqual(accepted.calls.length, 1);
  assert.strictEqual(accepted.calls[0].table, "service_bookings");
  assert.deepStrictEqual(accepted.calls[0].payload, { status: "accepted" });
  assert.strictEqual(filterValue(accepted.calls[0], "id"), 5);
  assert.strictEqual(filterValue(accepted.calls[0], "provider_id"), "provider-1");
  assert.strictEqual(filterValue(accepted.calls[0], "status"), "pending");

  const empty = mockClient(function () {
    return { data: [], error: null };
  });
  const emptyResult = await services.applyBookingTransition(empty, {
    role: "customer",
    bookingId: 8,
    userId: "customer-1",
    fromStatus: "pending",
    toStatus: "cancelled"
  });
  assert.strictEqual(emptyResult.ok, false);
  assert.strictEqual(emptyResult.reason, "not_confirmed");
  assert.strictEqual(filterValue(empty.calls[0], "customer_id"), "customer-1");
  assert.strictEqual(filterValue(empty.calls[0], "provider_id"), undefined);

  const paused = mockClient(function (state) {
    return {
      data: [{ id: state.filters[0][1], status: state.payload.status }],
      error: null
    };
  });
  const pausedResult = await services.updateOwnServiceStatus(paused, {
    serviceId: 3,
    userId: "owner-1",
    fromStatus: "active",
    toStatus: "paused"
  });
  assert.strictEqual(pausedResult.ok, true);
  assert.deepStrictEqual(paused.calls[0].payload, { status: "paused" });
  assert.strictEqual(filterValue(paused.calls[0], "provider_id"), "owner-1");
  assert.strictEqual(filterValue(paused.calls[0], "status"), "active");

  const closedToPending = await services.updateOwnServiceStatus(mockClient(function () {
    throw new Error("update should not run");
  }), {
    serviceId: 3,
    userId: "owner-1",
    fromStatus: "closed",
    toStatus: "paused"
  });
  assert.strictEqual(closedToPending.reason, "blocked_transition");

  const edited = mockClient(function () {
    return {
      data: [{
        id: 3,
        provider_id: "owner-1",
        title: "Plumbing help",
        status: "active"
      }],
      error: null
    };
  });
  const editedResult = await services.updateOwnService(edited, {
    serviceId: 3,
    userId: "owner-1",
    fromStatus: "active",
    draft: {
      title: "Plumbing help",
      category: "Plumbing",
      description: "Emergency plumbing for kitchens.",
      location: "Crotone",
      currency: "eur",
      priceType: "hourly",
      price: "30",
      status: "active"
    }
  });
  assert.strictEqual(editedResult.ok, true);
  assert.strictEqual(edited.calls[0].payload.currency, "EUR");
  assert.strictEqual(edited.calls[0].payload.price_type, "hourly");
  assert.strictEqual(edited.calls[0].payload.provider_id, undefined);
  assert.strictEqual(filterValue(edited.calls[0], "provider_id"), "owner-1");

  const badge = page.slice(
    page.indexOf('id="notificationBadge"'),
    page.indexOf('id="notificationBadge"') + 180
  );
  assert.strictEqual(badge.indexOf(">4<"), -1);
  assert.ok(badge.indexOf("display:none") !== -1);
  assert.ok(page.indexOf("/havkar-services.js") !== -1);
  assert.ok(page.indexOf("applyBookingTransition") !== -1);
  assert.ok(page.indexOf("updateOwnService") !== -1);
  assert.ok(page.indexOf("openBookings") !== -1);
  assert.strictEqual(page.indexOf('priceType = "job"'), -1);
  assert.strictEqual(page.indexOf('priceType = "visit"'), -1);
  assert.ok(page.indexOf("You cannot book your own service.") !== -1);
  assert.ok(page.indexOf('from("service_bookings")') !== -1);
  assert.ok(page.indexOf('from("service_saves")') !== -1);
  assert.ok(page.indexOf("/havkar-i18n.js") !== -1);

  console.log("SERVICES_MANAGEMENT_TEST_OK");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
