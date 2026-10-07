import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";

const require = createRequire("/workspace/package.json");
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048
});
const pem = privateKey.export({
  type: "pkcs8",
  format: "pem"
});

const SERVICE_ROLE = "test-service-role-value";

process.env.VERCEL = "1";
process.env.GOOGLE_TRANSLATION_PROJECT_ID = "test-project";
process.env.GOOGLE_TRANSLATION_CLIENT_EMAIL =
  "translate-test@example.com";
process.env.GOOGLE_TRANSLATION_PRIVATE_KEY = pem;
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
delete process.env.TRUSTED_CLIENT_IP_HEADER;

const calls = {
  rpc: [],
  fetch: []
};

let rpcResult = {
  data: [{ allowed: true, retry_after: 0 }],
  error: null
};

const supabasePath = require.resolve("@supabase/supabase-js");

require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    createClient() {
      return {
        rpc(name, args) {
          calls.rpc.push({ name, args });
          return Promise.resolve(rpcResult);
        }
      };
    }
  }
};

global.fetch = async (url, options = {}) => {
  const href = String(url);
  calls.fetch.push(href);

  if (href.includes("oauth2.googleapis.com")) {
    return jsonResponse({
      access_token: "ya29.mock-token",
      expires_in: 3600
    });
  }

  if (href.includes(":translateText")) {
    const body = JSON.parse(options.body);
    return jsonResponse({
      translations: body.contents.map((text) => ({
        translatedText: `tr:${text}`,
        detectedLanguageCode: "en"
      }))
    });
  }

  if (href.includes("/supportedLanguages")) {
    return jsonResponse({
      languages: [
        { languageCode: "fa", displayName: "Persian" }
      ]
    });
  }

  throw new Error(`unexpected fetch ${href}`);
};

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

const handler = require("/workspace/api/translate.js");
const failures = [];

function check(name, condition) {
  if (!condition) {
    failures.push(name);
    console.error("FAIL", name);
    return;
  }

  console.log("PASS", name);
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    end(payload) {
      this.body = payload || "";
    }
  };
}

function mockReq(method, headers = {}, extras = {}) {
  const normalized = {};

  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }

  return {
    method,
    headers: normalized,
    query: extras.query || {},
    body: extras.body || {},
    socket: {
      remoteAddress: "10.1.1.1"
    }
  };
}

async function invoke(method, headers, extras) {
  const res = mockRes();
  await handler(mockReq(method, headers, extras), res);
  return res;
}

function noSecret(res) {
  const serialized = `${res.body}\n${JSON.stringify(res.headers)}`;
  return (
    !serialized.includes(SERVICE_ROLE) &&
    !serialized.includes("BEGIN PRIVATE KEY") &&
    !serialized.includes("ya29.mock-token")
  );
}

function googleCalls() {
  return calls.fetch.filter((url) =>
    url.includes("googleapis.com")
  ).length;
}

const allowedOrigin = {
  origin: "https://testnet.havkar.online",
  "x-vercel-forwarded-for": "203.0.113.10"
};

let beforeFetch = googleCalls();
let beforeRpc = calls.rpc.length;
let res = await invoke("POST", {
  origin: "https://evil.example",
  "x-vercel-forwarded-for": "203.0.113.10",
  "x-real-ip": "198.51.100.20"
}, {
  body: {
    text: "hello",
    targetLanguage: "fa"
  }
});
check(
  "evil origin is rejected before Google",
  res.statusCode === 403 &&
    !res.headers["access-control-allow-origin"] &&
    calls.rpc.length === beforeRpc &&
    googleCalls() === beforeFetch &&
    noSecret(res)
);

beforeFetch = googleCalls();
beforeRpc = calls.rpc.length;
res = await invoke("POST", {
  "x-real-ip": "198.51.100.20",
  "x-forwarded-for": "198.51.100.21"
}, {
  body: {
    text: "hello",
    targetLanguage: "fa"
  }
});
check(
  "spoofed IP headers fail closed",
  res.statusCode === 503 &&
    calls.rpc.length === beforeRpc &&
    googleCalls() === beforeFetch &&
    noSecret(res)
);

process.env.VERCEL = "";
beforeFetch = googleCalls();
beforeRpc = calls.rpc.length;
res = await invoke("POST", {
  "x-vercel-forwarded-for": "203.0.113.10",
  "x-real-ip": "198.51.100.20"
}, {
  body: {
    text: "hello",
    targetLanguage: "fa"
  }
});
check(
  "Vercel IP header is ignored off Vercel",
  res.statusCode === 503 &&
    calls.rpc.length === beforeRpc &&
    googleCalls() === beforeFetch
);
process.env.VERCEL = "1";

process.env.TRUSTED_CLIENT_IP_HEADER = "x-real-ip";
process.env.VERCEL = "";
beforeRpc = calls.rpc.length;
res = await invoke("POST", {
  "x-real-ip": "198.51.100.20"
}, {
  body: {
    text: "hello",
    targetLanguage: "fa"
  }
});
check(
  "configured x-real-ip is still rejected",
  res.statusCode === 503 && calls.rpc.length === beforeRpc
);
process.env.TRUSTED_CLIENT_IP_HEADER = "cf-connecting-ip";
rpcResult = {
  data: [{ allowed: false, retry_after: 4 }],
  error: null
};
beforeRpc = calls.rpc.length;
beforeFetch = googleCalls();
res = await invoke("POST", {
  "cf-connecting-ip": "203.0.113.50",
  "x-forwarded-for": "198.51.100.21",
  "x-real-ip": "198.51.100.20"
}, {
  body: {
    text: "portable",
    targetLanguage: "fa"
  }
});
check(
  "another host can name its own overwritten IP header",
  res.statusCode === 429 &&
    calls.rpc.at(-1).args.p_client_ip === "203.0.113.50" &&
    calls.rpc.length === beforeRpc + 1 &&
    googleCalls() === beforeFetch
);
delete process.env.TRUSTED_CLIENT_IP_HEADER;
process.env.VERCEL = "1";

rpcResult = {
  data: null,
  error: { message: "database unavailable" }
};
beforeFetch = googleCalls();
res = await invoke("POST", allowedOrigin, {
  body: {
    text: "db down",
    targetLanguage: "fa"
  }
});
check(
  "database failure fails closed",
  res.statusCode === 503 &&
    googleCalls() === beforeFetch &&
    !res.body.includes("database unavailable") &&
    noSecret(res)
);

rpcResult = {
  data: [{ allowed: false, retry_after: 17 }],
  error: null
};
beforeFetch = googleCalls();
res = await invoke("POST", allowedOrigin, {
  body: {
    text: "too many",
    targetLanguage: "fa"
  }
});
check(
  "denied budget returns 429 before Google",
  res.statusCode === 429 &&
    res.headers["retry-after"] === "17" &&
    googleCalls() === beforeFetch &&
    noSecret(res)
);

rpcResult = {
  data: [{ allowed: true, retry_after: 0 }],
  error: null
};
beforeFetch = googleCalls();
beforeRpc = calls.rpc.length;
res = await invoke("POST", allowedOrigin, {
  body: {
    texts: new Array(101).fill("a"),
    targetLanguage: "fa"
  }
});
check(
  "100-text limit still rejects before the budget",
  res.statusCode === 400 &&
    calls.rpc.length === beforeRpc &&
    googleCalls() === beforeFetch
);

beforeRpc = calls.rpc.length;
res = await invoke("POST", allowedOrigin, {
  body: {
    text: "b".repeat(30001),
    targetLanguage: "fa"
  }
});
check(
  "30000-character limit still rejects before the budget",
  res.statusCode === 413 &&
    calls.rpc.length === beforeRpc &&
    googleCalls() === beforeFetch
);

beforeFetch = googleCalls();
beforeRpc = calls.rpc.length;
res = await invoke("POST", {
  origin: "https://havkar-app.vercel.app",
  "x-vercel-forwarded-for": "203.0.113.10:443, 198.51.100.8",
  "x-real-ip": "198.51.100.20",
  "x-forwarded-for": "198.51.100.21"
}, {
  body: {
    text: "guest page",
    targetLanguage: "fa"
  }
});
const guestRpc = calls.rpc[calls.rpc.length - 1];
check(
  "public translation uses only the trusted IP",
  res.statusCode === 200 &&
    !("authorization" in (res.headers || {})) &&
    JSON.parse(res.body).translatedText === "tr:guest page" &&
    guestRpc.name === "consume_translation_budget" &&
    guestRpc.args.p_kind === "post" &&
    guestRpc.args.p_client_ip === "203.0.113.10" &&
    guestRpc.args.p_requests === 1 &&
    guestRpc.args.p_characters === "guest page".length &&
    googleCalls() === beforeFetch + 2 &&
    calls.rpc.length === beforeRpc + 1 &&
    res.headers["access-control-allow-origin"] ===
      "https://havkar-app.vercel.app" &&
    noSecret(res)
);

beforeFetch = googleCalls();
beforeRpc = calls.rpc.length;
res = await invoke("POST", {
  "x-vercel-forwarded-for": "203.0.113.10"
}, {
  body: {
    text: "guest page",
    targetLanguage: "fa"
  }
});
check(
  "cache still serves a repeated translation",
  res.statusCode === 200 &&
    JSON.parse(res.body).cached === true &&
    calls.rpc.length === beforeRpc + 1 &&
    googleCalls() === beforeFetch &&
    noSecret(res)
);

rpcResult = {
  data: [{ allowed: false, retry_after: 9 }],
  error: null
};
beforeFetch = googleCalls();
res = await invoke("GET", allowedOrigin, {
  query: { action: "languages" }
});
check(
  "language list is limited before Google",
  res.statusCode === 429 &&
    res.headers["retry-after"] === "9" &&
    googleCalls() === beforeFetch &&
    calls.rpc.at(-1).args.p_kind === "languages" &&
    calls.rpc.at(-1).args.p_characters === 0
);

rpcResult = {
  data: [{ allowed: true, retry_after: 0 }],
  error: null
};
beforeFetch = googleCalls();
res = await invoke("GET", {
  "x-vercel-forwarded-for": "2001:DB8::1"
}, {
  query: { action: "languages" }
});
check(
  "allowed language list reaches Google once",
  res.statusCode === 200 &&
    JSON.parse(res.body).count === 1 &&
    calls.rpc.at(-1).args.p_client_ip === "2001:db8::1" &&
    googleCalls() === beforeFetch + 1 &&
    noSecret(res)
);

beforeRpc = calls.rpc.length;
beforeFetch = googleCalls();
res = await invoke("GET", {
  "x-real-ip": "198.51.100.20"
});
check(
  "health check does not call Google or the budget",
  res.statusCode === 200 &&
    JSON.parse(res.body).ok === true &&
    calls.rpc.length === beforeRpc &&
    googleCalls() === beforeFetch &&
    noSecret(res)
);

res = await invoke("OPTIONS", {
  origin: "https://testnet.havkar.online"
});
check(
  "allowed preflight returns the exact origin",
  res.statusCode === 204 &&
    res.headers["access-control-allow-origin"] ===
      "https://testnet.havkar.online"
);

res = await invoke("OPTIONS", {
  origin: "https://evil.example"
});
check(
  "rejected preflight does not reflect the origin",
  res.statusCode === 403 &&
    !res.headers["access-control-allow-origin"]
);

if (failures.length) {
  console.error(`FAILED ${failures.length}: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("ALL_PASSED");
