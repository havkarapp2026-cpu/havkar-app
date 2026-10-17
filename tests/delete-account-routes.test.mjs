import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRoutedBusinessNotificationHandler
} from "../api/business-application-notify.js";
import {
  DELETE_ACCOUNT_ORIGINS,
  createDeleteAccountHandler,
  isAmbiguousDeleteAccountRequest,
  isDeleteAccountRequest
} from "../server/delete-account.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const token = "test-access-token";
const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    }
  };
}

async function call(handler, request) {
  const response = mockResponse();
  await handler(request, response);
  return response;
}

function deleteRequest(overrides = {}) {
  return {
    method: "POST",
    url: "/api/business-application-notify?havkarRoute=delete-account",
    query: { havkarRoute: "delete-account" },
    headers: {
      origin: "https://havkar-app.vercel.app",
      authorization: "Bearer " + token
    },
    body: { confirm: "DELETE" },
    ...overrides
  };
}

function adminClient(events, options = {}) {
  return {
    auth: {
      async getUser(accessToken) {
        events.push(["getUser", accessToken]);
        if (options.getUserError) {
          return { data: { user: null }, error: { message: "bad session" } };
        }
        if (options.throwGetUser) {
          throw new Error("auth unavailable");
        }
        return {
          data: {
            user: {
              id: options.userId === undefined ? userId : options.userId,
              email: "person@example.com"
            }
          },
          error: null
        };
      },
      admin: {
        async signOut(accessToken, scope) {
          events.push(["signOut", accessToken, scope]);
          if (options.signOutStatus) {
            return { error: { status: options.signOutStatus } };
          }
          return { error: null };
        },
        async deleteUser(id) {
          events.push(["deleteUser", id]);
          if (options.deleteError) {
            return { error: { message: "delete failed" } };
          }
          return { error: null };
        }
      }
    },
    async rpc(name, args) {
      if (options.recordRpc) {
        events.push(["rpc", name, args]);
      }
      if (options.rpcThrows) {
        throw new Error("rpc unavailable");
      }
      if (options.rpc) {
        return options.rpc;
      }
      return { data: true, error: null };
    }
  };
}

function routedHandler(events, options = {}) {
  const businessCalls = [];
  const handler = createRoutedBusinessNotificationHandler({
    deleteAccountHandler: createDeleteAccountHandler({
      getAdmin() {
        events.push("delete-admin");
        if (options.unconfigured) {
          return null;
        }
        return adminClient(events, options);
      }
    }),
    fetchImpl: async () => {
      businessCalls.push("resend");
      throw new Error("business email must not run for this request");
    },
    createSupabase() {
      businessCalls.push("business-supabase");
      return {
        auth: {
          async getUser(accessToken) {
            businessCalls.push(["business-user", accessToken]);
            return { data: { user: { id: userId } }, error: null };
          }
        },
        from(table) {
          businessCalls.push(["from", table]);
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return { data: null, error: null };
                        }
                      };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  });
  return { handler, businessCalls };
}

const markerCases = [
  [{ query: { havkarRoute: "delete-account" } }, true],
  [{ query: { havkarRoute: ["delete-account"] } }, true],
  [{ url: "/api/delete-account" }, true],
  [{ url: "/api/delete-account?unused=1" }, true],
  [{ url: "https://havkar-app.vercel.app/api/delete-account" }, true],
  [{ query: { havkarRoute: ["delete-account", "extra"] } }, false],
  [{ query: { havkarRoute: ["delete-account", "delete-account"] } }, false],
  [{ query: { havkarRoute: "delete-account " } }, false],
  [{ query: { havkarRoute: "Delete-account" } }, false],
  [{ query: { havkarRoute: "" } }, false],
  [{ query: { havkarRoute: ["nope"] } }, false],
  [{ url: "/api/business-application-notify" }, false],
  [{ url: "/api/business-application-notify?id=1", query: {} }, false],
  [{ url: "/api/delete-account-extra" }, false],
  [{ url: "/api/delete-account/" }, false],
  [{
    url: "/api/delete-account",
    query: { havkarRoute: ["delete-account", "extra"] }
  }, false]
];

for (const [request, expected] of markerCases) {
  assert.equal(isDeleteAccountRequest(request), expected, JSON.stringify(request));
  assert.equal(
    isAmbiguousDeleteAccountRequest(request),
    Object.prototype.hasOwnProperty.call(request.query || {}, "havkarRoute") && !expected,
    JSON.stringify(request)
  );
}

const events = [];
const { handler, businessCalls } = routedHandler(events);
const deleted = await call(handler, deleteRequest());
assert.equal(deleted.statusCode, 200);
assert.deepEqual(deleted.body, { ok: true });
assert.deepEqual(events, [
  "delete-admin",
  ["getUser", token],
  ["deleteUser", userId]
]);
assert.equal(JSON.stringify(events).includes("signOut"), false);

const ownerEvents = [];
const ownerRoute = routedHandler(ownerEvents, {
  recordRpc: true,
  rpc: { data: false, error: null }
});
const previousOwnerError = console.error;
console.error = () => {};
let ownerResponse;
try {
  ownerResponse = await call(ownerRoute.handler, deleteRequest());
} finally {
  console.error = previousOwnerError;
}
assert.equal(ownerResponse.statusCode, 403);
assert.deepEqual(ownerResponse.body, {
  ok: false,
  error: "This account cannot be deleted."
});
assert.deepEqual(ownerEvents, [
  "delete-admin",
  ["getUser", token],
  ["rpc", "havkar_account_deletion_allowed", { p_user_id: userId }]
]);

for (const rpc of [
  { data: null, error: { message: "missing function" } },
  { data: null, error: null }
]) {
  const failedCheck = [];
  const failedRoute = routedHandler(failedCheck, { recordRpc: true, rpc });
  console.error = () => {};
  let failedCheckResponse;
  try {
    failedCheckResponse = await call(failedRoute.handler, deleteRequest());
  } finally {
    console.error = previousOwnerError;
  }
  assert.equal(failedCheckResponse.statusCode, 500);
  assert.equal(JSON.stringify(failedCheck).includes("signOut"), false);
  assert.equal(JSON.stringify(failedCheck).includes("deleteUser"), false);
}

const thrownCheck = [];
const thrownRoute = routedHandler(thrownCheck, { recordRpc: true, rpcThrows: true });
console.error = () => {};
let thrownCheckResponse;
try {
  thrownCheckResponse = await call(thrownRoute.handler, deleteRequest());
} finally {
  console.error = previousOwnerError;
}
assert.equal(thrownCheckResponse.statusCode, 500);
assert.equal(JSON.stringify(thrownCheck).includes("signOut"), false);
assert.equal(JSON.stringify(thrownCheck).includes("deleteUser"), false);
assert.deepEqual(businessCalls, []);
assert.equal(JSON.stringify(deleted.body).includes(token), false);
assert.equal(JSON.stringify(deleted.body).includes(userId), false);
assert.equal(JSON.stringify(deleted.body).includes("person@example.com"), false);

const directPathEvents = [];
const direct = routedHandler(directPathEvents);
const directResponse = await call(direct.handler, deleteRequest({
  url: "/api/delete-account",
  query: {}
}));
assert.equal(directResponse.statusCode, 200);
assert.deepEqual(direct.businessCalls, []);
assert.deepEqual(directPathEvents.at(-1), ["deleteUser", userId]);

const queryUserEvents = [];
const queryUser = routedHandler(queryUserEvents);
const queryUserResponse = await call(queryUser.handler, deleteRequest({
  query: { havkarRoute: "delete-account", userId: otherUserId }
}));
assert.equal(queryUserResponse.statusCode, 200);
assert.deepEqual(queryUserEvents.at(-1), ["deleteUser", userId]);

const bodyUserEvents = [];
const bodyUser = routedHandler(bodyUserEvents);
const bodyUserResponse = await call(bodyUser.handler, deleteRequest({
  body: { confirm: "DELETE", userId: otherUserId }
}));
assert.equal(bodyUserResponse.statusCode, 400);
assert.deepEqual(bodyUserEvents, []);
assert.deepEqual(bodyUser.businessCalls, []);

for (const origin of DELETE_ACCOUNT_ORIGINS) {
  const originEvents = [];
  const originRoute = routedHandler(originEvents);
  const originResponse = await call(originRoute.handler, deleteRequest({
    headers: { origin, authorization: "Bearer " + token }
  }));
  assert.equal(originResponse.statusCode, 200, origin);
  assert.equal(originResponse.headers["access-control-allow-origin"], origin);
  assert.deepEqual(originRoute.businessCalls, []);
}

const sameOriginEvents = [];
const sameOrigin = routedHandler(sameOriginEvents);
const sameOriginResponse = await call(sameOrigin.handler, deleteRequest({
  headers: { authorization: "Bearer " + token }
}));
assert.equal(sameOriginResponse.statusCode, 200);
assert.equal(sameOriginResponse.headers["access-control-allow-origin"], undefined);

const evilEvents = [];
const evil = routedHandler(evilEvents);
const evilResponse = await call(evil.handler, deleteRequest({
  headers: {
    origin: "https://evil.example",
    authorization: "Bearer " + token
  }
}));
assert.equal(evilResponse.statusCode, 403);
assert.deepEqual(evilEvents, []);
assert.deepEqual(evil.businessCalls, []);

const optionsResponse = await call(handler, deleteRequest({ method: "OPTIONS" }));
assert.equal(optionsResponse.statusCode, 204);
assert.equal(optionsResponse.headers.allow, undefined);

const getResponse = await call(handler, deleteRequest({ method: "GET" }));
assert.equal(getResponse.statusCode, 405);
assert.equal(getResponse.headers.allow, "POST");
assert.deepEqual(getResponse.body, { ok: false, error: "Method not allowed." });

const unconfirmed = await call(handler, deleteRequest({ body: { confirm: "delete" } }));
assert.equal(unconfirmed.statusCode, 400);

const businessBodyOnDelete = await call(handler, deleteRequest({
  body: { id: 1, confirm: "DELETE" }
}));
assert.equal(businessBodyOnDelete.statusCode, 400);
assert.deepEqual(businessCalls, []);

const anonymous = await call(handler, deleteRequest({
  headers: { origin: "https://localhost" }
}));
assert.equal(anonymous.statusCode, 401);
assert.deepEqual(anonymous.body, { ok: false, error: "Authentication required." });

const foreignEvents = [];
const foreign = routedHandler(foreignEvents, { userId: "not-a-user" });
const foreignResponse = await call(foreign.handler, deleteRequest());
assert.equal(foreignResponse.statusCode, 401);
assert.deepEqual(foreignEvents, ["delete-admin", ["getUser", token]]);

const unconfiguredEvents = [];
const unconfigured = routedHandler(unconfiguredEvents, { unconfigured: true });
const previousError = console.error;
console.error = () => {};
let unconfiguredResponse;
try {
  unconfiguredResponse = await call(unconfigured.handler, deleteRequest());
} finally {
  console.error = previousError;
}
assert.equal(unconfiguredResponse.statusCode, 500);
assert.deepEqual(unconfiguredResponse.body, {
  ok: false,
  error: "The account could not be deleted."
});
assert.equal(unconfiguredEvents.includes("deleteUser"), false);

const authThrown = [];
const thrown = routedHandler(authThrown, { throwGetUser: true });
console.error = () => {};
let thrownResponse;
try {
  thrownResponse = await call(thrown.handler, deleteRequest());
} finally {
  console.error = previousError;
}
assert.equal(thrownResponse.statusCode, 401);
assert.equal(JSON.stringify(authThrown).includes("deleteUser"), false);

const deleteFailed = [];
const failedDelete = routedHandler(deleteFailed, { deleteError: true });
console.error = () => {};
let failedDeleteResponse;
try {
  failedDeleteResponse = await call(failedDelete.handler, deleteRequest());
} finally {
  console.error = previousError;
}
assert.equal(failedDeleteResponse.statusCode, 500);
assert.deepEqual(deleteFailed.at(-1), ["deleteUser", userId]);
assert.equal(JSON.stringify(failedDeleteResponse.body).includes("delete failed"), false);

const ambiguousEvents = [];
const ambiguous = routedHandler(ambiguousEvents);
const ambiguousResponse = await call(ambiguous.handler, deleteRequest({
  url: "/api/delete-account",
  query: { havkarRoute: ["delete-account", "extra"] },
  body: { confirm: "DELETE" }
}));
assert.equal(ambiguousResponse.statusCode, 400);
assert.deepEqual(ambiguousResponse.body, {
  ok: false,
  error: "The account could not be deleted."
});
assert.deepEqual(ambiguousEvents, []);
assert.deepEqual(ambiguous.businessCalls, []);

const businessEvents = [];
const business = routedHandler(businessEvents);
const businessResponse = await call(business.handler, {
  method: "POST",
  url: "/api/business-application-notify",
  query: {},
  headers: { authorization: "Bearer " + token },
  body: { confirm: "DELETE" }
});
assert.equal(businessResponse.statusCode, 400);
assert.deepEqual(businessResponse.body, {
  ok: false,
  error: "Business application id is required."
});
assert.deepEqual(businessEvents, []);
assert.deepEqual(business.businessCalls, ["business-supabase", ["business-user", token]]);

const businessLookup = routedHandler([]);
const lookupResponse = await call(businessLookup.handler, {
  method: "POST",
  url: "/api/business-application-notify",
  headers: { authorization: "Bearer " + token },
  body: { id: 15 }
});
assert.equal(lookupResponse.statusCode, 404);
assert.deepEqual(lookupResponse.body, {
  ok: false,
  error: "Business application not found."
});
assert.equal(businessLookup.businessCalls.includes("resend"), false);
assert.deepEqual(businessLookup.businessCalls[2], ["from", "business_applications"]);

const businessOptions = await call(business.handler, {
  method: "OPTIONS",
  url: "/api/business-application-notify",
  headers: {}
});
assert.equal(businessOptions.statusCode, 405);
assert.deepEqual(businessOptions.body, { ok: false, error: "Method not allowed" });

const businessAnonymous = await call(business.handler, {
  method: "POST",
  url: "/api/business-application-notify",
  headers: {},
  body: { id: 15 }
});
assert.equal(businessAnonymous.statusCode, 401);
assert.deepEqual(businessAnonymous.body, {
  ok: false,
  error: "Authentication required"
});

const savedUrl = process.env.SUPABASE_URL;
const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
console.error = () => {};
let liveRoute;
try {
  liveRoute = await call(createDeleteAccountHandler(), deleteRequest({
    url: "/api/delete-account",
    query: {}
  }));
} finally {
  console.error = previousError;
  if (savedUrl === undefined) {
    delete process.env.SUPABASE_URL;
  } else {
    process.env.SUPABASE_URL = savedUrl;
  }
  if (savedKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
  }
}
assert.equal(liveRoute.statusCode, 500);
assert.deepEqual(liveRoute.body, {
  ok: false,
  error: "The account could not be deleted."
});
assert.equal(JSON.stringify(liveRoute.body).includes("SUPABASE"), false);

const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
assert.deepEqual(vercel.rewrites, [
  {
    source: "/api/pi-complete",
    destination: "/api/pi-approve?piAction=complete"
  },
  {
    source: "/api/delete-account",
    destination: "/api/business-application-notify?havkarRoute=delete-account"
  }
]);
assert.equal(JSON.stringify(vercel).includes("/api/:path*"), false);
assert.equal(JSON.stringify(vercel).includes("*"), false);

const apiFiles = fs.readdirSync(path.join(root, "api"))
  .filter((name) => name.endsWith(".js"))
  .sort();
assert.deepEqual(apiFiles, [
  "accommodation-review.js",
  "ai-subscription-checkout.js",
  "ai-subscription-portal.js",
  "ai-subscription-webhook.js",
  "business-application-notify.js",
  "create-event-checkout.js",
  "eur-usd-quote.js",
  "flight-offer.js",
  "flight-order.js",
  "flights.js",
  "pi-a2u-testnet.js",
  "pi-approve.js",
  "stripe-webhook.js",
  "trade-crypto.js",
  "translate.js"
]);
assert.equal(fs.existsSync(path.join(root, "api/delete-account.js")), false);
assert.equal(fs.existsSync(path.join(root, "server/delete-account.js")), true);

const deleteSource = fs.readFileSync(path.join(root, "server/delete-account.js"), "utf8");
const businessSource = fs.readFileSync(
  path.join(root, "api/business-application-notify.js"),
  "utf8"
);
assert.match(deleteSource, /body\.confirm === "DELETE" && Object\.keys\(body\)\.length === 1/);
assert.match(deleteSource, /havkar_account_deletion_allowed/);
assert.doesNotMatch(deleteSource, /signOut\(accessToken, "global"\)/);
assert.ok(
  deleteSource.indexOf("havkar_account_deletion_allowed")
  < deleteSource.indexOf("deleteUser(userId)")
);
assert.match(deleteSource, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(deleteSource, /business_applications|api\.resend\.com|RESEND_API_KEY/);
assert.match(businessSource, /if \(isDeleteAccountRequest\(req\)\)/);
assert.match(businessSource, /createDeleteAccountHandler\(\)/);
assert.doesNotMatch(
  businessSource,
  /createDeleteAccountHandler\(\{[\s\S]*createSupabase/
);
assert.doesNotMatch(businessSource, /auth\.admin\.deleteUser/);
assert.match(businessSource, /https:\/\/api\.resend\.com\/emails/);

const policy = fs.readFileSync(path.join(root, "mobile/src/policy.mjs"), "utf8");
assert.match(policy, /\/api\/delete-account/);

console.log("DELETE_ACCOUNT_ROUTES_TEST_OK functions=" + apiFiles.length);
