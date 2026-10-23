import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder
} from "@stellar/stellar-sdk";

export const PRODUCTION_PROJECT_REF = "gispovnciifgikvgpzck";
export const STAGING_PROJECT_REF = "keglioewbkgdabsizvys";
export const STAGING_SUPABASE_URL = "https://keglioewbkgdabsizvys.supabase.co";
export const TESTNET_HORIZON = "https://horizon-testnet.stellar.org";
export const TESTNET_EXPLORER = "https://stellar.expert/explorer/testnet/tx/";
export const PAYMENT_STATUSES = Object.freeze([
  "PENDING",
  "AWAITING_SIGNATURE",
  "SUBMITTED",
  "CONFIRMED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED"
]);
export const APPROVED_RATE_PROVIDERS = new Set();
export const QUOTE_TTL_MS = 10 * 60 * 1000;
export const SERVICE_EVENT_TICKET = "event_ticket";

const OPEN_STATUSES = new Set(["PENDING", "AWAITING_SIGNATURE", "SUBMITTED"]);

export function configurationError(message) {
  const error = new Error(message);
  error.status = 503;
  error.code = "STELLAR_NOT_CONFIGURED";
  return error;
}

export function paymentError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.code = "STELLAR_PAYMENT";
  return error;
}

function jwtPayload(token) {
  const parts = String(token || "").split(".");

  if (parts.length !== 3 || !parts[1]) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export function isAcceptedStagingServiceRoleKey(key) {
  const value = String(key || "").trim();

  if (
    !value
    || value.includes(PRODUCTION_PROJECT_REF)
    || value.startsWith("sb_publishable_")
    || value.toLowerCase().includes("publishable")
    || /\s/.test(value)
  ) {
    return false;
  }

  if (value.startsWith("sb_secret_") && value.length >= 20) {
    return true;
  }

  if (!value.startsWith("eyJ")) {
    return false;
  }

  const payload = jwtPayload(value);

  return Boolean(
    payload
    && payload.role === "service_role"
    && payload.ref === STAGING_PROJECT_REF
  );
}

export function assertStagingPaymentDatabase(env) {
  if (env.VERCEL_ENV === "production") {
    throw configurationError("Stellar payments are disabled on production.");
  }

  const url = String(env.HAVKAR_STAGING_SUPABASE_URL || "").trim();
  const key = String(env.HAVKAR_STAGING_SERVICE_ROLE_KEY || "").trim();

  if (
    url.includes(PRODUCTION_PROJECT_REF)
    || key.includes(PRODUCTION_PROJECT_REF)
    || url !== STAGING_SUPABASE_URL
    || !isAcceptedStagingServiceRoleKey(key)
  ) {
    throw configurationError(
      "Staging payment database is not configured. Refusing to use another project."
    );
  }

  return { url, serviceRoleKey: key };
}

export function readReceivingAccount(env) {
  const destination = String(env.HAVKAR_STELLAR_TESTNET_DESTINATION || "").trim();

  if (!StrKey.isValidEd25519PublicKey(destination)) {
    throw configurationError(
      "The Stellar receiving address is not approved yet."
    );
  }

  return destination;
}

export function readApprovedRateProvider(env) {
  const provider = String(env.HAVKAR_XLM_RATE_PROVIDER || "").trim();

  if (!provider || !APPROVED_RATE_PROVIDERS.has(provider)) {
    throw configurationError(
      "The EUR/XLM rate provider is not approved yet."
    );
  }

  return provider;
}

export function isPublicKey(value) {
  return StrKey.isValidEd25519PublicKey(String(value || "").trim());
}

export function normalizeEurAmount(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let text = String(value).trim().replace(/\s/g, "").replace(/[€$£]/g, "");

  if (!text) {
    return null;
  }

  if (/^\d+,\d{1,2}$/.test(text)) {
    text = text.replace(",", ".");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }

  const [whole, fraction = ""] = text.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));

  if (cents <= 0n) {
    return null;
  }

  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

export function eurToCents(amount) {
  const normalized = normalizeEurAmount(amount);

  if (!normalized) {
    throw paymentError(400, "Invalid EUR amount.");
  }

  const [whole, fraction] = normalized.split(".");
  return BigInt(whole) * 100n + BigInt(fraction);
}

export function scaleDecimal(value, scale) {
  const text = String(value || "").trim();

  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw paymentError(400, "Invalid decimal amount.");
  }

  const [whole, fraction = ""] = text.split(".");

  if (fraction.length > scale) {
    throw paymentError(400, "Invalid decimal amount.");
  }

  return BigInt(whole) * (10n ** BigInt(scale))
    + BigInt(fraction.padEnd(scale, "0"));
}

export function formatStroops(stroops) {
  const whole = stroops / 10000000n;
  const fraction = (stroops % 10000000n).toString().padStart(7, "0");
  return `${whole.toString()}.${fraction}`;
}

export function quoteXlmFromEur(eurAmount, eurPerXlm) {
  const cents = eurToCents(eurAmount);
  const rateScale = scaleDecimal(eurPerXlm, 7);

  if (rateScale <= 0n) {
    throw paymentError(400, "Invalid EUR/XLM rate.");
  }

  const numerator = cents * (10n ** 12n);
  const stroops = (numerator + rateScale / 2n) / rateScale;

  if (stroops <= 0n) {
    throw paymentError(400, "The XLM quote is too small to pay.");
  }

  return {
    amountStroops: stroops.toString(),
    amountXlm: formatStroops(stroops)
  };
}

export function canonicalXlm(value) {
  const text = String(value || "").trim();

  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw paymentError(400, "Invalid XLM amount.");
  }

  return formatStroops(scaleDecimal(text, 7));
}

export function createPaymentReference(bytes) {
  const source = bytes || crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(source, (value) => value.toString(16).padStart(2, "0")).join("");

  if (!/^([0-9a-f]{2}){12}$/.test(hex)) {
    throw paymentError(500, "Could not create a payment reference.");
  }

  return `hk${hex}`;
}

export function assertTestnetHorizonUrl(url) {
  const parsed = new URL(url);

  if (parsed.protocol !== "https:" || parsed.hostname !== "horizon-testnet.stellar.org") {
    throw paymentError(409, "Stellar verification is limited to Testnet.");
  }

  return parsed;
}

export function explorerUrl(hash, status) {
  if (status !== "CONFIRMED" && status !== "REFUNDED") {
    return null;
  }

  if (!/^[a-f0-9]{64}$/.test(String(hash || ""))) {
    return null;
  }

  return `${TESTNET_EXPLORER}${hash}`;
}

export function verifyHorizonPayment(transaction, operations, expected) {
  const records = Array.isArray(operations)
    ? operations
    : operations?._embedded?.records || [];

  if (!transaction || transaction.successful !== true) {
    throw paymentError(409, "The Stellar network did not confirm this transaction.");
  }

  if (transaction.hash !== expected.hash) {
    throw paymentError(409, "The transaction hash does not match this payment.");
  }

  if (transaction.source_account !== expected.source) {
    throw paymentError(409, "The transaction source does not match this payment.");
  }

  if (transaction.memo_type !== "text" || transaction.memo !== expected.memo) {
    throw paymentError(409, "The transaction memo does not match this payment.");
  }

  if (records.length !== 1) {
    throw paymentError(409, "The transaction does not contain the expected payment.");
  }

  const operation = records[0];
  const source = operation.source_account || operation.from;
  const destination = operation.to || operation.destination;

  if (
    operation.type !== "payment"
    || operation.asset_type !== "native"
    || source !== expected.source
    || destination !== expected.destination
    || canonicalXlm(operation.amount) !== canonicalXlm(expected.amount)
  ) {
    throw paymentError(409, "The Stellar payment does not match the quoted amount.");
  }

  return {
    hash: transaction.hash,
    ledger: Number(transaction.ledger),
    successful: true
  };
}

export function assertSignedXdr(signedXdr, prepared) {
  let signed;

  try {
    signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  } catch (error) {
    throw paymentError(400, "The signed transaction is not a Testnet transaction.");
  }

  const operation = signed.operations?.[0];
  const amount = operation?.amount;
  const memo = signed.memo?.type === "text"
    ? (typeof signed.memo.value === "string"
      ? signed.memo.value
      : new TextDecoder().decode(signed.memo.value))
    : "";
  const hash = Array.from(signed.hash(), (value) => value.toString(16).padStart(2, "0")).join("");

  if (
    signed.operations?.length !== 1
    || operation?.type !== "payment"
    || !operation.asset?.isNative()
    || signed.source !== prepared.source
    || operation.destination !== prepared.destination
    || canonicalXlm(amount) !== canonicalXlm(prepared.amount)
    || memo !== prepared.memo
    || String(signed.sequence) !== String(prepared.sequence)
    || String(signed.fee) !== String(prepared.fee)
    || String(signed.timeBounds?.minTime || "0") !== String(prepared.minTime)
    || String(signed.timeBounds?.maxTime || "0") !== String(prepared.maxTime)
    || hash !== prepared.hash
  ) {
    throw paymentError(409, "The signed transaction does not match the payment you reviewed.");
  }

  const signer = Keypair.fromPublicKey(prepared.source);
  const valid = signed.signatures.some((signature) => {
    const raw = signature?.signature;
    const bytes = typeof raw === "function" ? raw.call(signature) : raw;
    return bytes ? signer.verify(signed.hash(), bytes) : false;
  });

  if (!valid) {
    throw paymentError(409, "The signature does not match the connected wallet.");
  }

  return signed;
}

export function isExpired(row, now) {
  return new Date(row.expires_at).getTime() <= now.getTime();
}

export function canCancel(row) {
  return row.status === "PENDING" || row.status === "AWAITING_SIGNATURE";
}

export function canPrepare(row) {
  return row.status === "PENDING" || row.status === "AWAITING_SIGNATURE";
}

export function canSubmit(row) {
  return row.status === "AWAITING_SIGNATURE" || row.status === "SUBMITTED";
}

export async function buildTestnetPayment(prepared, fetchImpl = fetch) {
  assertTestnetHorizonUrl(TESTNET_HORIZON);
  const server = new Horizon.Server(TESTNET_HORIZON, { allowHttp: false });
  const sourceAccount = await server.loadAccount(prepared.source);
  const feeResponse = await fetchImpl(`${TESTNET_HORIZON}/fee_stats`, {
    headers: { Accept: "application/json" }
  });

  if (!feeResponse.ok) {
    throw paymentError(502, "The Stellar fee quote is unavailable.");
  }

  const feeBody = await feeResponse.json();
  const fee = String(feeBody.last_ledger_base_fee || "");

  if (!/^[1-9]\d{0,8}$/.test(fee)) {
    throw paymentError(502, "The Stellar fee quote is unavailable.");
  }

  let destinationExists = true;

  try {
    await server.loadAccount(prepared.destination);
  } catch (error) {
    if (error?.response?.status === 404 || error?.name === "NotFoundError") {
      destinationExists = false;
    } else {
      throw error;
    }
  }

  if (!destinationExists) {
    throw paymentError(409, "The receiving Stellar account does not exist on Testnet.");
  }

  const transaction = new TransactionBuilder(sourceAccount, {
    fee,
    networkPassphrase: Networks.TESTNET
  })
    .addOperation(Operation.payment({
      destination: prepared.destination,
      asset: Asset.native(),
      amount: canonicalXlm(prepared.amount)
    }))
    .addMemo(Memo.text(prepared.memo))
    .setTimeout(180)
    .build();

  return {
    xdr: transaction.toXDR(),
    hash: Array.from(transaction.hash(), (value) => value.toString(16).padStart(2, "0")).join(""),
    sequence: String(transaction.sequence),
    fee: String(transaction.fee),
    minTime: String(transaction.timeBounds?.minTime || "0"),
    maxTime: String(transaction.timeBounds?.maxTime || "0"),
    networkFeeStroops: String(transaction.fee)
  };
}

export async function fetchTestnetTransaction(hash, fetchImpl = fetch) {
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw paymentError(400, "Invalid transaction hash.");
  }

  const transactionUrl = `${TESTNET_HORIZON}/transactions/${hash}`;
  assertTestnetHorizonUrl(transactionUrl);
  const transactionResponse = await fetchImpl(transactionUrl, {
    headers: { Accept: "application/json" }
  });

  if (transactionResponse.status === 404) {
    return null;
  }

  if (!transactionResponse.ok) {
    throw paymentError(502, "Horizon could not be reached.");
  }

  const operationsResponse = await fetchImpl(`${transactionUrl}/operations?limit=5`, {
    headers: { Accept: "application/json" }
  });

  if (!operationsResponse.ok) {
    throw paymentError(502, "Horizon could not be reached.");
  }

  return {
    transaction: await transactionResponse.json(),
    operations: await operationsResponse.json()
  };
}

export function publicPaymentView(row, event) {
  return {
    id: row.id,
    service_type: SERVICE_EVENT_TICKET,
    service_name: event?.title || "HAVKAR event",
    merchant_name: event?.organizer || "HAVKAR",
    status: row.status,
    eur_amount: row.eur_amount,
    xlm_amount: row.amount_xlm,
    eur_per_xlm: row.eur_per_xlm,
    quote_source: row.quote_source,
    quoted_at: row.quoted_at,
    expires_at: row.expires_at,
    destination: row.destination_public_key,
    source: row.source_public_key,
    network: "TESTNET",
    network_fee_stroops: row.fee,
    memo: row.memo,
    transaction_hash: row.tx_hash,
    ledger: row.horizon_ledger,
    explorer_url: explorerUrl(row.tx_hash, row.status),
    failure_reason: row.failure_reason,
    reconciliation_state: row.reconciliation_state || null
  };
}

export function openStatus(status) {
  return OPEN_STATUSES.has(status);
}
