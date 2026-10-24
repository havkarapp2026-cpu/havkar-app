const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  STAGING_SUPABASE_URL,
  PRODUCTION_PROJECT_REF,
  PROTECTED_PREVIEW_API_FILES,
  preparePreviewSupabaseConfig,
  installPreviewApiStubs
} = require("../scripts/prepare-preview-supabase-config.js");
const {
  PAYMENT_PREVIEW_BRANCH,
  isIsolatedPaymentPreview,
  isolatedPaymentPreviewApiBlock
} = require("../api/payment-isolation.cjs");

const paymentEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: PAYMENT_PREVIEW_BRANCH,
  HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
  HAVKAR_STAGING_PUBLISHABLE_KEY: process.env.HAVKAR_STAGING_PUBLISHABLE_KEY
};

assert.strictEqual(isIsolatedPaymentPreview(paymentEnv), true);
assert.strictEqual(isIsolatedPaymentPreview({
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: PAYMENT_PREVIEW_BRANCH
}), false);
assert.strictEqual(isIsolatedPaymentPreview({
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "main"
}), false);
assert.strictEqual(preparePreviewSupabaseConfig({
  VERCEL_ENV: "production",
  VERCEL_GIT_COMMIT_REF: PAYMENT_PREVIEW_BRANCH
}).action, "skip");

if (!paymentEnv.HAVKAR_STAGING_PUBLISHABLE_KEY) {
  console.log("PAYMENT_ISOLATION_SKIP_KEY");
} else {
  const written = preparePreviewSupabaseConfig(paymentEnv);
  assert.strictEqual(written.action, "write");
  assert.ok(written.source.includes(STAGING_SUPABASE_URL));
  assert.strictEqual(written.source.includes(PRODUCTION_PROJECT_REF), false);
  assert.strictEqual(written.source.includes("service_role"), false);
}

assert.throws(
  () => preparePreviewSupabaseConfig({
    ...paymentEnv,
    HAVKAR_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`
  }),
  (error) => /production|not the havkar-staging/.test(error.publicMessage)
    && !error.publicMessage.includes(PRODUCTION_PROJECT_REF)
);

const stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "havkar-payment-preview-"));
fs.mkdirSync(path.join(stubRoot, "api"));
for (const relativePath of PROTECTED_PREVIEW_API_FILES) {
  fs.copyFileSync(path.join(__dirname, "..", relativePath), path.join(stubRoot, relativePath));
}
installPreviewApiStubs(stubRoot, paymentEnv);
const stub = fs.readFileSync(path.join(stubRoot, "api/stripe-webhook.js"), "utf8");
assert.strictEqual(stub.includes("STRIPE_SECRET_KEY"), false);
assert.strictEqual(stub.includes(PRODUCTION_PROJECT_REF), false);
assert.match(stub, /isolated Stellar payment preview/);
assert.match(
  fs.readFileSync(path.join(__dirname, "..", "api/stripe-webhook.js"), "utf8"),
  /new Stripe\(process\.env\.STRIPE_SECRET_KEY\)/
);

const blocked = isolatedPaymentPreviewApiBlock("/api/stripe-webhook", paymentEnv);
assert.strictEqual(blocked.status, 503);
assert.strictEqual(
  isolatedPaymentPreviewApiBlock("/api/translate", paymentEnv),
  null
);
assert.strictEqual(
  isolatedPaymentPreviewApiBlock("/api/stellar-payment", paymentEnv),
  null
);
assert.strictEqual(
  isolatedPaymentPreviewApiBlock("/api/stripe-webhook", { VERCEL_ENV: "production" }),
  null
);

console.log("PAYMENT_ISOLATION_OK");
