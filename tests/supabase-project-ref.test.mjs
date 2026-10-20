import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseProjectRefHandler, supabaseProjectRef } from "../lib/supabase-project-ref.mjs";
import { stellarRoute } from "../api/stellar-ticket.js";

const staging = "https://keglioewbkgdabsizvys.supabase.co";
const production = "https://gispovnciifgikvgpzck.supabase.co";
const serviceRole = "service-role-must-not-appear";

function response() {
    return {
        statusCode: 0,
        headers: {},
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
}

function handler(admin, env = {}) {
    return createSupabaseProjectRefHandler({
        env: {
            SUPABASE_URL: staging,
            SUPABASE_SERVICE_ROLE_KEY: serviceRole,
            ...env,
        },
        admin,
    });
}

assert.equal(supabaseProjectRef(staging), "keglioewbkgdabsizvys");
assert.equal(supabaseProjectRef(production), "gispovnciifgikvgpzck");
assert.equal(supabaseProjectRef("https://evil.example/keglioewbkgdabsizvys.supabase.co"), "");
assert.equal(supabaseProjectRef("https://keglioewbkgdabsizvys.supabase.co.evil.example"), "");
assert.equal(supabaseProjectRef("not a url"), "");

assert.equal(
    stellarRoute({
        url: "/api/stellar-ticket-intent?stellarAction=project-ref",
        query: { stellarAction: "project-ref" },
    }),
    "intent"
);
assert.equal(
    stellarRoute({
        url: "/api/supabase-project-ref",
        query: { stellarAction: "project-ref" },
    }),
    "project-ref"
);
assert.equal(
    stellarRoute({
        url: "/api/stellar-ticket",
        query: {},
        headers: { "x-matched-path": "/api/supabase-project-ref" },
    }),
    "project-ref"
);
assert.equal(
    stellarRoute({
        url: "/api/stellar-ticket?stellarAction=project-ref",
        query: {},
    }),
    "project-ref"
);
assert.equal(
    stellarRoute({
        url: "/api/stellar-ticket-submit",
        query: {},
        headers: { "x-matched-path": "/api/supabase-project-ref" },
    }),
    "submit"
);

const anonymous = response();
await handler({ auth: { async getUser() { throw new Error("should not run"); } } })(
    { method: "GET", headers: {} },
    anonymous
);
assert.equal(anonymous.statusCode, 401);
assert.equal(anonymous.headers["Cache-Control"], "private, no-store");
assert.deepEqual(anonymous.body, { ok: false, error: "Authentication required" });
assert.equal("project_ref" in anonymous.body, false);

const infrastructureHeader = response();
await handler({ auth: { async getUser() { throw new Error("should not run"); } } })(
    {
        method: "GET",
        headers: {
            "x-vercel-sc-headers": JSON.stringify({ Authorization: "Bearer staging-user" }),
        },
    },
    infrastructureHeader
);
assert.equal(infrastructureHeader.statusCode, 401);
assert.equal(infrastructureHeader.body.error, "Authentication required");

const customHeader = response();
await handler({
    auth: {
        async getUser(token) {
            assert.equal(token, "staging-user");
            return { data: { user: { id: "user-1" } }, error: null };
        },
    },
})(
    { method: "GET", headers: { "x-havkar-session": "staging-user", authorization: "Bearer infrastructure-token" } },
    customHeader
);
assert.equal(customHeader.statusCode, 200);
assert.deepEqual(customHeader.body, { ok: true, project_ref: "keglioewbkgdabsizvys" });

const leaked = `invalid ${serviceRole} for ${staging}`;
const rejected = response();
await handler({
    auth: {
        async getUser() {
            return { data: { user: null }, error: { message: leaked } };
        },
    },
})(
    { method: "GET", headers: { authorization: "Bearer staging-user" } },
    rejected
);
assert.equal(rejected.statusCode, 401);
assert.equal(JSON.stringify(rejected.body).includes(serviceRole), false);
assert.equal(JSON.stringify(rejected.body).includes("keglioewbkgdabsizvys"), false);
assert.equal(JSON.stringify(rejected.body).includes(leaked), false);

const thrown = response();
await handler({
    auth: {
        async getUser() {
            throw new Error(leaked);
        },
    },
})(
    { method: "GET", headers: { authorization: "Bearer staging-user" } },
    thrown
);
assert.equal(thrown.statusCode, 401);
assert.equal(JSON.stringify(thrown.body).includes(serviceRole), false);

const accepted = response();
await handler({
    auth: {
        async getUser(token) {
            assert.equal(token, "staging-user");
            return { data: { user: { id: "user-1" } }, error: null };
        },
    },
})(
    { method: "GET", headers: { authorization: "Bearer staging-user" } },
    accepted
);
assert.equal(accepted.statusCode, 200);
assert.deepEqual(Object.keys(accepted.body).sort(), ["ok", "project_ref"]);
assert.deepEqual(accepted.body, { ok: true, project_ref: "keglioewbkgdabsizvys" });

const fetched = response();
await createSupabaseProjectRefHandler({
    env: {
        SUPABASE_URL: staging,
        SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    },
    async fetch(url, init) {
        assert.equal(String(url), `${staging}/auth/v1/user`);
        assert.equal(init.redirect, "manual");
        assert.equal(init.headers.authorization, "Bearer staging-user");
        assert.equal(init.headers.apikey, serviceRole);
        return {
            status: 200,
            async json() {
                return { id: "user-1", email: "hidden@example.com" };
            },
        };
    },
})(
    { method: "GET", headers: { "x-havkar-session": "staging-user" } },
    fetched
);
assert.equal(fetched.statusCode, 200);
assert.deepEqual(fetched.body, { ok: true, project_ref: "keglioewbkgdabsizvys" });
assert.equal(JSON.stringify(fetched.body).includes("hidden@example.com"), false);
assert.equal(JSON.stringify(fetched.body).includes(serviceRole), false);

const redirected = response();
await createSupabaseProjectRefHandler({
    env: {
        SUPABASE_URL: staging,
        SUPABASE_SERVICE_ROLE_KEY: serviceRole,
    },
    async fetch() {
        return { status: 302, async json() { return { id: "user-1" }; } };
    },
})(
    { method: "GET", headers: { authorization: "Bearer staging-user" } },
    redirected
);
assert.equal(redirected.statusCode, 401);
assert.equal("project_ref" in redirected.body, false);

const otherProject = response();
await handler(
    {
        auth: {
            async getUser() {
                return { data: { user: { id: "user-1" } }, error: null };
            },
        },
    },
    { SUPABASE_URL: production }
)(
    { method: "GET", headers: { authorization: "Bearer production-user" } },
    otherProject
);
assert.deepEqual(otherProject.body, { ok: true, project_ref: "gispovnciifgikvgpzck" });

const missingConfig = response();
await handler(
    { auth: { async getUser() { throw new Error("should not run"); } } },
    { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" }
)(
    { method: "GET", headers: { authorization: "Bearer staging-user" } },
    missingConfig
);
assert.equal(missingConfig.statusCode, 500);
assert.deepEqual(missingConfig.body, { ok: false, error: "Server configuration error" });

const source = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "supabase-project-ref.mjs"),
    "utf8"
);
assert.equal(/\.(insert|update|delete|upsert)\s*\(/.test(source), false);
assert.equal(source.includes("console."), false);
assert.equal(source.includes("@supabase/supabase-js"), false);
assert.equal(source.includes("createClient"), false);
assert.equal(
    stellarRoute({
        url: "/api/stellar-ticket",
        get query() {
            throw new Error("query parser failed");
        },
    }),
    ""
);

console.log("SUPABASE_PROJECT_REF_TEST_OK");
