import assert from "node:assert/strict";
import { createDeleteAccountHandler } from "../../server/delete-account.js";

const token = "test-access-token";
const ownerId = "11111111-1111-4111-8111-111111111111";

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
      rpc() {
        events.push("rpc");
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

assert.deepEqual(events, ["getUser", "signOut", "deleteUser"]);
assert.equal(response.statusCode, 500);
assert.equal(events.includes("rpc"), false);
console.log("DELETE_ACCOUNT_OWNER_GAP_CONFIRMED");
