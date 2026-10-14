import assert from "node:assert/strict";
import fs from "node:fs";
import { createDeleteAccountHandler } from "../../server/delete-account.js";

const token = "test-access-token";
const ownerId = "11111111-1111-4111-8111-111111111111";
const source = fs.readFileSync(
  new URL("../../server/delete-account.js", import.meta.url),
  "utf8"
);

assert.ok(
  source.indexOf("havkar_account_deletion_allowed")
  < source.indexOf('signOut(accessToken, "global")')
);
assert.ok(
  source.indexOf('signOut(accessToken, "global")')
  < source.indexOf("deleteUser(userId)")
);

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader() {},
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

const events = [];
const handler = createDeleteAccountHandler({
  getAdmin() {
    return {
      auth: {
        async getUser() {
          events.push("getUser");
          return { data: { user: { id: ownerId } }, error: null };
        },
        admin: {
          async signOut() {
            events.push("signOut");
            return { error: null };
          },
          async deleteUser() {
            events.push("deleteUser");
            return { error: { message: "owner delete blocked" } };
          }
        }
      },
      rpc(name, args) {
        events.push(["rpc", name, args.p_user_id]);
        return Promise.resolve({ data: false, error: null });
      }
    };
  }
});

const response = mockResponse();
await handler(
  {
    method: "POST",
    url: "/api/delete-account",
    headers: {
      origin: "https://havkar-app.vercel.app",
      authorization: "Bearer " + token
    },
    body: { confirm: "DELETE" }
  },
  response
);

assert.deepEqual(events, [
  "getUser",
  ["rpc", "havkar_account_deletion_allowed", ownerId]
]);
assert.equal(response.statusCode, 403);
assert.deepEqual(response.body, {
  ok: false,
  error: "This account cannot be deleted."
});
assert.equal(events.includes("signOut"), false);
assert.equal(events.includes("deleteUser"), false);
console.log("DELETE_ACCOUNT_OWNER_BLOCKED_BEFORE_SIGNOUT");
