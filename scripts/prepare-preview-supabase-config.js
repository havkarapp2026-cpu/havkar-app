"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  isIsolatedReceiptsPreview
} = require("../api/preview-isolation.cjs");
const {
  isIsolatedPaymentPreview
} = require("../api/payment-isolation.cjs");

const PROTECTED_PREVIEW_API_FILES = [
  "api/pi-approve.js",
  "api/pi-a2u-testnet.js",
  "api/stripe-webhook.js",
  "api/create-event-checkout.js",
  "api/trade-crypto.js"
];

const STAGING_SUPABASE_URL = "https://keglioewbkgdabsizvys.supabase.co";
const PRODUCTION_PROJECT_REF = "gispovnciifgikvgpzck";
const STAGING_PUBLISHABLE_SHA256 =
  "fc969bfcab60e3823ddc0459bff97e90490384acb60384bceda786bd53db98c3";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safeError(publicMessage) {
  const error = new Error(publicMessage);
  error.publicMessage = publicMessage;
  return error;
}

function renderBrowserConfig(url, publishableKey) {
  if (url !== STAGING_SUPABASE_URL) {
    throw safeError(
      "Refusing to render a browser config for a project other than havkar-staging."
    );
  }

  if (
    !publishableKey.startsWith("sb_publishable_")
    || publishableKey.includes("service_role")
    || publishableKey.startsWith("eyJ")
  ) {
    throw safeError(
      "Refusing to render a browser config without a staging publishable key."
    );
  }

  const source = [
    "window.HAVKAR_SUPABASE_CONFIG = {",
    `  url: ${JSON.stringify(url)},`,
    `  publishableKey: ${JSON.stringify(publishableKey)}`,
    "};",
    ""
  ].join("\n");

  if (
    source.includes("service_role")
    || source.includes(PRODUCTION_PROJECT_REF)
    || source.includes("eyJ")
  ) {
    throw safeError("Generated browser config failed the isolation check.");
  }

  return source;
}

function preparePreviewSupabaseConfig(env, options = {}) {
  const expectedHash = options.expectedPublishableSha256
    || STAGING_PUBLISHABLE_SHA256;

  if (!isIsolatedReceiptsPreview(env) && !isIsolatedPaymentPreview(env)) {
    return { action: "skip" };
  }

  const url = typeof env.HAVKAR_STAGING_SUPABASE_URL === "string"
    ? env.HAVKAR_STAGING_SUPABASE_URL.trim()
    : "";
  const key = typeof env.HAVKAR_STAGING_PUBLISHABLE_KEY === "string"
    ? env.HAVKAR_STAGING_PUBLISHABLE_KEY.trim()
    : "";

  if (!url) {
    throw safeError(
      "HAVKAR_STAGING_SUPABASE_URL is missing. Refusing to fall back to production."
    );
  }

  if (url.includes(PRODUCTION_PROJECT_REF)) {
    throw safeError(
      "HAVKAR_STAGING_SUPABASE_URL points at production. Refusing to build the receipts preview."
    );
  }

  if (url !== STAGING_SUPABASE_URL) {
    throw safeError(
      "HAVKAR_STAGING_SUPABASE_URL is not the havkar-staging project. Refusing to build the receipts preview."
    );
  }

  if (!key) {
    throw safeError(
      "HAVKAR_STAGING_PUBLISHABLE_KEY is missing. Refusing to fall back to production."
    );
  }

  if (
    key.includes("service_role")
    || key.startsWith("eyJ")
    || key.includes(PRODUCTION_PROJECT_REF)
  ) {
    throw safeError(
      "HAVKAR_STAGING_PUBLISHABLE_KEY is not a staging publishable key. Refusing to write it into the browser config."
    );
  }

  if (!key.startsWith("sb_publishable_") || sha256(key) !== expectedHash) {
    throw safeError(
      "HAVKAR_STAGING_PUBLISHABLE_KEY does not match havkar-staging. Refusing to build the receipts preview."
    );
  }

  return {
    action: "write",
    source: renderBrowserConfig(url, key)
  };
}

function verifyWrittenBrowserConfig(source) {
  if (
    source.includes("service_role")
    || source.includes(PRODUCTION_PROJECT_REF)
    || source.includes("eyJ")
    || !source.includes(STAGING_SUPABASE_URL)
  ) {
    throw safeError("Generated browser config failed the isolation check.");
  }

  const match = source.match(
    /url:\s*"([^"]+)",\n\s*publishableKey:\s*"([^"]+)"/
  );

  if (!match || match[1] !== STAGING_SUPABASE_URL) {
    throw safeError("Generated browser config failed the isolation check.");
  }

  if (sha256(match[2]) !== STAGING_PUBLISHABLE_SHA256) {
    throw safeError("Generated browser config failed the isolation check.");
  }
}

function previewApiStubSource() {
  return [
    "\"use strict\";",
    "",
    "module.exports = async function handler(req, res) {",
    "  res.status(503).json({",
    "    ok: false,",
    "    error: \"This API is disabled on the isolated message-receipts preview.\"",
    "  });",
    "};",
    ""
  ].join("\n");
}

function paymentPreviewApiStubSource() {
  return [
    "\"use strict\";",
    "",
    "module.exports = async function handler(req, res) {",
    "  res.status(503).json({",
    "    ok: false,",
    "    error: \"This API is disabled on the isolated Stellar payment preview.\"",
    "  });",
    "};",
    ""
  ].join("\n");
}

function installPreviewApiStubs(rootDir, env) {
  if (!isIsolatedReceiptsPreview(env) && !isIsolatedPaymentPreview(env)) {
    throw safeError(
      "Refusing to disable APIs outside the isolated receipts preview."
    );
  }

  const stub = isIsolatedPaymentPreview(env)
    ? paymentPreviewApiStubSource()
    : previewApiStubSource();

  if (
    stub.includes("service_role")
    || stub.includes(PRODUCTION_PROJECT_REF)
    || stub.includes("eyJ")
    || stub.includes("SUPABASE_")
  ) {
    throw safeError("Preview API stub failed the isolation check.");
  }

  const originals = PROTECTED_PREVIEW_API_FILES.map((relativePath) => {
    const fullPath = path.join(rootDir, relativePath);
    return {
      fullPath,
      source: fs.readFileSync(fullPath, "utf8")
    };
  });

  try {
    for (const item of originals) {
      const temporaryPath = `${item.fullPath}.${process.pid}.preview-tmp`;
      fs.writeFileSync(temporaryPath, stub, { encoding: "utf8", flag: "w" });
      if (fs.readFileSync(temporaryPath, "utf8") !== stub) {
        throw safeError("Preview API stub failed the isolation check.");
      }
      fs.renameSync(temporaryPath, item.fullPath);
    }
  } catch (error) {
    for (const item of originals) {
      fs.writeFileSync(item.fullPath, item.source, { encoding: "utf8", flag: "w" });
      const temporaryPath = `${item.fullPath}.${process.pid}.preview-tmp`;
      if (fs.existsSync(temporaryPath)) {
        fs.unlinkSync(temporaryPath);
      }
    }

    throw error;
  }
}

function writeIsolatedBrowserConfig(env, outputPath) {
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    throw safeError("Receipts preview configuration was rejected.");
  }

  const result = preparePreviewSupabaseConfig(env);

  if (result.action === "skip") {
    return result;
  }

  const temporaryPath = `${outputPath}.${process.pid}.preview-tmp`;

  try {
    fs.writeFileSync(temporaryPath, result.source, { encoding: "utf8", flag: "w" });
    verifyWrittenBrowserConfig(fs.readFileSync(temporaryPath, "utf8"));
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }

    throw error;
  }

  return result;
}

function main() {
  const outputPath = path.join(__dirname, "..", "havkar-supabase-config.js");

  try {
    const result = writeIsolatedBrowserConfig(process.env, outputPath);

    if (result.action === "skip") {
      console.log(
        "Receipts preview isolation is not active. Committed production browser config left unchanged."
      );
      return;
    }

    installPreviewApiStubs(path.join(__dirname, ".."), process.env);

    if (isIsolatedPaymentPreview(process.env)) {
      console.log("Payment preview browser config written for havkar-staging.");
      console.log("Stripe, Pi, and unrelated server APIs are disabled for this preview build.");
      return;
    }

    console.log("Receipts preview browser config written for havkar-staging.");
    console.log("Wallet, Pi, and payment APIs disabled for this preview build.");
  } catch (error) {
    console.error(
      error && error.publicMessage
        ? error.publicMessage
        : "Receipts preview configuration was rejected."
    );
    process.exit(1);
  }
}

module.exports = {
  STAGING_SUPABASE_URL,
  PRODUCTION_PROJECT_REF,
  STAGING_PUBLISHABLE_SHA256,
  PROTECTED_PREVIEW_API_FILES,
  preparePreviewSupabaseConfig,
  previewApiStubSource,
  paymentPreviewApiStubSource,
  installPreviewApiStubs,
  renderBrowserConfig,
  sha256,
  verifyWrittenBrowserConfig,
  writeIsolatedBrowserConfig
};

if (require.main === module) {
  main();
}
