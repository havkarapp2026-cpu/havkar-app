const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  STAGING_SUPABASE_URL,
  PRODUCTION_PROJECT_REF,
  STAGING_PUBLISHABLE_SHA256,
  preparePreviewSupabaseConfig,
  sha256
} = require("../scripts/prepare-preview-supabase-config.js");
const {
  isIsolatedReceiptsPreview,
  rejectIsolatedPreview,
  assertServerCredentialsAllowed
} = require("../api/preview-isolation.cjs");

const root = path.join(__dirname, "..");
const configPath = path.join(root, "havkar-supabase-config.js");
const previewEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "cursor/message-receipts-6a44"
};

function rejection(run) {
  try {
    run();
  } catch (error) {
    return error;
  }

  assert.fail("expected the receipts preview build to fail");
}

assert.strictEqual(preparePreviewSupabaseConfig({}).action, "skip");
assert.strictEqual(
  preparePreviewSupabaseConfig({
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "cursor/message-receipts-6a44",
    HAVKAR_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`
  }).action,
  "skip"
);
assert.strictEqual(
  preparePreviewSupabaseConfig({
    ...previewEnv,
    VERCEL_GIT_COMMIT_REF: "main"
  }).action,
  "skip"
);

let error = rejection(() => preparePreviewSupabaseConfig(previewEnv));
assert.match(error.publicMessage, /HAVKAR_STAGING_SUPABASE_URL is missing/);
assert.strictEqual(error.publicMessage.includes("gispovnciifgikvgpzck"), false);

error = rejection(() => preparePreviewSupabaseConfig({
  ...previewEnv,
  HAVKAR_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  HAVKAR_STAGING_PUBLISHABLE_KEY: "sb_publishable_production_example"
}));
assert.match(error.publicMessage, /points at production/);
assert.strictEqual(error.publicMessage.includes("production_example"), false);

error = rejection(() => preparePreviewSupabaseConfig({
  ...previewEnv,
  HAVKAR_STAGING_SUPABASE_URL: `${STAGING_SUPABASE_URL}/`,
  HAVKAR_STAGING_PUBLISHABLE_KEY: "sb_publishable_example"
}));
assert.match(error.publicMessage, /not the havkar-staging project/);

error = rejection(() => preparePreviewSupabaseConfig({
  ...previewEnv,
  HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL
}));
assert.match(error.publicMessage, /HAVKAR_STAGING_PUBLISHABLE_KEY is missing/);

error = rejection(() => preparePreviewSupabaseConfig({
  ...previewEnv,
  HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
  HAVKAR_STAGING_PUBLISHABLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"
}));
assert.match(error.publicMessage, /not a staging publishable key/);
assert.strictEqual(error.publicMessage.includes("eyJ"), false);

error = rejection(() => preparePreviewSupabaseConfig({
  ...previewEnv,
  HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
  HAVKAR_STAGING_PUBLISHABLE_KEY: "sb_publishable_wrong",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-must-not-leak"
}));
assert.match(error.publicMessage, /does not match havkar-staging/);
assert.strictEqual(error.publicMessage.includes("service-role-must-not-leak"), false);
assert.strictEqual(error.publicMessage.includes("sb_publishable_wrong"), false);

const exampleKey = "sb_publishable_example_only";
const written = preparePreviewSupabaseConfig({
  ...previewEnv,
  HAVKAR_STAGING_SUPABASE_URL: STAGING_SUPABASE_URL,
  HAVKAR_STAGING_PUBLISHABLE_KEY: exampleKey,
  SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "service-role-must-not-leak"
}, {
  expectedPublishableSha256: sha256(exampleKey)
});

assert.strictEqual(written.action, "write");
assert.strictEqual(
  written.source,
  [
    "window.HAVKAR_SUPABASE_CONFIG = {",
    `  url: ${JSON.stringify(STAGING_SUPABASE_URL)},`,
    `  publishableKey: ${JSON.stringify(exampleKey)}`,
    "};",
    ""
  ].join("\n")
);
assert.strictEqual(written.source.includes("service_role"), false);
assert.strictEqual(written.source.includes("service-role-must-not-leak"), false);
assert.strictEqual(written.source.includes(PRODUCTION_PROJECT_REF), false);

assert.strictEqual(
  STAGING_PUBLISHABLE_SHA256,
  "fc969bfcab60e3823ddc0459bff97e90490384acb60384bceda786bd53db98c3"
);

const committedBefore = fs.readFileSync(configPath, "utf8");
assert.match(committedBefore, new RegExp(`https://${PRODUCTION_PROJECT_REF}\\.supabase\\.co`));
assert.strictEqual(committedBefore.includes("keglioewbkgdabsizvys"), false);
const productionKey = committedBefore.match(/publishableKey: "([^"]+)"/)[1];
assert.notStrictEqual(sha256(productionKey), STAGING_PUBLISHABLE_SHA256);

const script = fs.readFileSync(
  path.join(root, "scripts/prepare-preview-supabase-config.js"),
  "utf8"
);
const isolation = fs.readFileSync(
  path.join(root, "api/preview-isolation.cjs"),
  "utf8"
);
assert.strictEqual(script.includes("a7paZ5jrvFIGYABCY05w3g"), false);
assert.strictEqual(isolation.includes("a7paZ5jrvFIGYABCY05w3g"), false);
assert.strictEqual(script.includes("SUPABASE_SERVICE_ROLE_KEY"), false);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.strictEqual(packageJson.scripts.build, "npm run build:stellar");
assert.strictEqual(
  packageJson.scripts["vercel-build"],
  "node scripts/prepare-preview-supabase-config.js && npm run build:stellar"
);

const skipOutput = execFileSync(
  process.execPath,
  ["scripts/prepare-preview-supabase-config.js"],
  {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "cursor/message-receipts-6a44",
      HAVKAR_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`
    },
    encoding: "utf8"
  }
);
assert.match(skipOutput, /left unchanged/);
assert.strictEqual(fs.readFileSync(configPath, "utf8"), committedBefore);

let failedClosed = false;

try {
  execFileSync(
    process.execPath,
    ["scripts/prepare-preview-supabase-config.js"],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "cursor/message-receipts-6a44",
        HAVKAR_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
        HAVKAR_STAGING_PUBLISHABLE_KEY: "sb_publishable_example",
        SUPABASE_SERVICE_ROLE_KEY: "do-not-print-this-role"
      },
      encoding: "utf8"
    }
  );
} catch (commandError) {
  failedClosed = commandError.status === 1;
  const stderr = String(commandError.stderr || "");
  assert.match(stderr, /points at production/);
  assert.strictEqual(stderr.includes("do-not-print-this-role"), false);
  assert.strictEqual(stderr.includes("sb_publishable_example"), false);
}

assert.strictEqual(failedClosed, true);
assert.strictEqual(fs.readFileSync(configPath, "utf8"), committedBefore);

const guardedRoutes = [
  "business-application-notify.js",
  "translate.js",
  "stripe-webhook.js",
  "trade-crypto.js",
  "accommodation-review.js",
  "create-event-checkout.js",
  "flight-offer.js",
  "flight-order.js",
  "flights.js",
  "pi-a2u-testnet.js",
  "pi-approve.js"
];

for (const name of guardedRoutes) {
  const source = fs.readFileSync(path.join(root, "api", name), "utf8");
  assert.strictEqual(source.includes("rejectIsolatedPreview"), true, name);
}

const quote = fs.readFileSync(path.join(root, "api/eur-usd-quote.js"), "utf8");
assert.strictEqual(quote.includes("SUPABASE"), false);
assert.strictEqual(quote.includes("SECRET"), false);
assert.strictEqual(quote.includes("service_role"), false);

for (const name of ["stripe-webhook.js", "create-event-checkout.js"]) {
  const source = fs.readFileSync(path.join(root, "api", name), "utf8");
  assert.match(source, /isolatedReceiptsPreview\s*\?\s*null\s*:\s*new Stripe/);
  assert.match(source, /isolatedReceiptsPreview\s*\?\s*null\s*:\s*createClient/);
}

const responses = [];
const blocked = rejectIsolatedPreview({
  status(code) {
    this.code = code;
    return this;
  },
  json(body) {
    responses.push(body);
  }
}, previewEnv);
assert.strictEqual(blocked, true);
assert.strictEqual(responses[0].ok, false);
assert.strictEqual(
  rejectIsolatedPreview({
    status() {
      return this;
    },
    json() {}
  }, { VERCEL_ENV: "production" }),
  false
);

assert.throws(
  () => assertServerCredentialsAllowed(previewEnv),
  (caught) => caught.code === "ISOLATED_PREVIEW"
);
assertServerCredentialsAllowed({ VERCEL_ENV: "production" });
assert.strictEqual(isIsolatedReceiptsPreview(previewEnv), true);
assert.strictEqual(
  isIsolatedReceiptsPreview({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "main"
  }),
  false
);
assert.strictEqual(fs.readFileSync(configPath, "utf8"), committedBefore);

error = rejection(() => {
  const { writeIsolatedBrowserConfig } = require("../scripts/prepare-preview-supabase-config.js");
  writeIsolatedBrowserConfig(previewEnv);
});
assert.strictEqual(
  error.publicMessage,
  "Receipts preview configuration was rejected."
);
assert.strictEqual(fs.existsSync(path.join(root, "undefined")), false);

console.log("PREVIEW_ISOLATION_TEST_OK");
