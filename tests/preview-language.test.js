const assert = require("assert");
const crypto = require("crypto");
const {
  PAYMENT_PREVIEW_BRANCH
} = require("../api/payment-isolation.cjs");
const {
  isolatedPreviewApiBlock
} = require("../api/preview-isolation.cjs");

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048
});
const saved = {
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,
  GOOGLE_TRANSLATION_CLIENT_EMAIL: process.env.GOOGLE_TRANSLATION_CLIENT_EMAIL,
  GOOGLE_TRANSLATION_PRIVATE_KEY: process.env.GOOGLE_TRANSLATION_PRIVATE_KEY
};

process.env.VERCEL = "1";
process.env.VERCEL_ENV = "preview";
process.env.VERCEL_GIT_COMMIT_REF = PAYMENT_PREVIEW_BRANCH;
process.env.GOOGLE_TRANSLATION_CLIENT_EMAIL = "translate-test@example.com";
process.env.GOOGLE_TRANSLATION_PRIVATE_KEY = privateKey.export({
  type: "pkcs8",
  format: "pem"
});

const handler = require("../api/translate.js");

const PRODUCTION_URL = "https://gispovnciifgikvgpzck.supabase.co";
const paymentEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: PAYMENT_PREVIEW_BRANCH,
  SUPABASE_URL: PRODUCTION_URL,
  SUPABASE_SERVICE_ROLE_KEY: "do-not-use-production-role"
};

assert.strictEqual(handler.getSupabaseAdmin(paymentEnv), null);
assert.strictEqual(
  isolatedPreviewApiBlock("/api/translate", {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "cursor/message-receipts-6a44"
  }).status,
  503
);
assert.strictEqual(
  handler.isolatedPreviewTranslationBudget("post", "", 4).status,
  503
);

const limited = [];

for (let index = 0; index < 60; index += 1) {
  limited.push(
    handler.isolatedPreviewTranslationBudget("post", "203.0.113.20", 1)
  );
}

assert.strictEqual(limited.every((item) => item.ok), true);
assert.strictEqual(
  handler.isolatedPreviewTranslationBudget("post", "203.0.113.20", 1).status,
  429
);

assert.throws(
  () => handler.getSupabaseAdmin({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "cursor/message-receipts-6a44",
    SUPABASE_URL: PRODUCTION_URL,
    SUPABASE_SERVICE_ROLE_KEY: "do-not-use-production-role"
  }),
  (error) => error.code === "ISOLATED_PREVIEW"
);

const seen = [];
const originalFetch = global.fetch;

function restore() {
  global.fetch = originalFetch;

  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

process.env.VERCEL = "1";
process.env.VERCEL_ENV = "preview";
process.env.VERCEL_GIT_COMMIT_REF = PAYMENT_PREVIEW_BRANCH;
process.env.GOOGLE_TRANSLATION_CLIENT_EMAIL = "translate-test@example.com";
process.env.GOOGLE_TRANSLATION_PRIVATE_KEY = privateKey.export({
  type: "pkcs8",
  format: "pem"
});

global.fetch = async (url, options = {}) => {
  const address = String(url);
  seen.push(address);
  assert.strictEqual(address.includes("supabase.co"), false);
  assert.strictEqual(address.includes(PRODUCTION_URL), false);

  if (address.includes("oauth2.googleapis.com")) {
    return {
      ok: true,
      json: async () => ({
        access_token: "preview-language-test-token",
        expires_in: 3600
      })
    };
  }

  const payload = JSON.parse(options.body);
  const translated = payload.contents.map((text) => {
    if (payload.targetLanguageCode === "sv" && text === "Languages") {
      return "Språk";
    }

    if (payload.targetLanguageCode === "sv" && text === "Home") {
      return "Hem";
    }

    if (payload.targetLanguageCode === "ku" && text === "Home") {
      return "Mal";
    }

    if (payload.targetLanguageCode === "ckb" && text === "Home") {
      return "سەرەکی";
    }

    return text;
  });

  return {
    ok: true,
    json: async () => ({
      translations: translated.map((translatedText) => ({
        translatedText
      }))
    })
  };
};

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload) {
      this.body = payload;
    }
  };
}

async function post(targetLanguage, texts) {
  const res = response();

  await handler({
    method: "POST",
    headers: {
      "x-vercel-forwarded-for": "203.0.113.44"
    },
    body: {
      texts,
      sourceLanguage: "en",
      targetLanguage
    }
  }, res);

  assert.strictEqual(res.statusCode, 200);
  return JSON.parse(res.body);
}

(async () => {
  try {
    const swedish = await post("sv", ["Languages", "Home"]);
    assert.deepStrictEqual(
      swedish.translations.map((item) => item.translatedText),
      ["Språk", "Hem"]
    );

    const kurmanji = await post("kmr", ["Home"]);
    assert.strictEqual(kurmanji.translations[0].translatedText, "Mal");
    assert.strictEqual(kurmanji.targetLanguage, "kmr");

    const sorani = await post("ckb", ["Home"]);
    assert.strictEqual(sorani.translations[0].translatedText, "سەرەکی");
    assert.strictEqual(sorani.targetLanguage, "ckb");

    assert.ok(seen.some((url) => url.includes(":translateText")));
    console.log("PREVIEW_LANGUAGE_TEST_OK");
  } finally {
    restore();
  }
})().catch((error) => {
  restore();
  console.error(error);
  process.exit(1);
});
