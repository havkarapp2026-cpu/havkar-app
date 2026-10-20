import { createClient } from "@supabase/supabase-js";
import {
  Asset,
  Horizon,
  Keypair,
  Memo,
  Networks,
  NotFoundError,
  Operation,
  StrKey,
  TransactionBuilder,
  TransactionFailedError,
} from "@stellar/stellar-sdk";

export const TESTNET_HORIZON = "https://horizon-testnet.stellar.org";
export const TESTNET_PASSPHRASE = Networks.TESTNET;
export const QUOTE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=eur";

const OPEN_STATUSES = ["pending", "prepared", "submitted"];
const STROOPS = 10000000n;

export function createTestnetServer() {
  return new Horizon.Server(TESTNET_HORIZON, { allowHttp: false });
}

export function assertTestnetServer(server) {
  const url = server?.serverURL;
  const hostname = typeof url?.hostname === "string" ? url.hostname : "";
  const protocol = typeof url?.protocol === "string" ? url.protocol : "";

  if (protocol !== "https:" || hostname !== "horizon-testnet.stellar.org") {
    throw new Error("Service checkout can only use Stellar Testnet.");
  }
}

export function isPublicKey(value) {
  return StrKey.isValidEd25519PublicKey(String(value || "").trim());
}

export function normalizePrice(value) {
  if (value === null || value === undefined) return null;

  let text = String(value).trim().replace(/\s/g, "").replace(/[€$£]/g, "");

  if (!text) return null;
  if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

export function safeQuantity(value) {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
  return quantity;
}

export function formatStroops(stroops) {
  const negative = stroops < 0n;
  const absolute = negative ? -stroops : stroops;
  const whole = absolute / STROOPS;
  const fraction = (absolute % STROOPS).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

export function parseStroops(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,7})?$/.test(text)) {
    throw new Error("invalid amount");
  }
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * STROOPS + BigInt(fraction.padEnd(7, "0"));
}

export function eurToStroops(eurAmount, eurPerXlm) {
  if (!Number.isFinite(eurAmount) || eurAmount <= 0) {
    throw new Error("invalid eur");
  }
  if (!Number.isFinite(eurPerXlm) || eurPerXlm <= 0) {
    throw new Error("invalid quote");
  }

  const eurCents = BigInt(Math.round(eurAmount * 100));
  const rateMicro = BigInt(Math.round(eurPerXlm * 100000000));
  if (eurCents <= 0n || rateMicro <= 0n) throw new Error("invalid quote");

  const numerator = eurCents * STROOPS * 100000000n;
  const denominator = 100n * rateMicro;
  const stroops = (numerator + denominator - 1n) / denominator;

  if (stroops <= 0n || stroops > 1000000000000000n) {
    throw new Error("invalid xlm amount");
  }

  return stroops;
}

export function createPaymentReference(bytes = cryptoRandom(12)) {
  const hex = Buffer.from(bytes).toString("hex");
  if (!/^[0-9a-f]{24}$/.test(hex)) throw new Error("invalid reference");
  return `hk${hex}`;
}

export async function fetchEurPerXlm(fetchImpl = fetch) {
  const response = await fetchImpl(QUOTE_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const error = new Error("quote");
    error.code = "quote";
    throw error;
  }

  const payload = await response.json();
  const rate = Number(payload?.stellar?.eur);
  if (!Number.isFinite(rate) || rate <= 0) {
    const error = new Error("quote");
    error.code = "quote";
    throw error;
  }

  return {
    eurPerXlm: rate,
    source: "coingecko:stellar:eur",
  };
}

function cryptoRandom(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bearer(authorization) {
  const header = String(authorization || "");
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function fail(status, error, extra = {}) {
  return { status, body: { ok: false, error, ...extra } };
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function memoText(memo) {
  if (!memo || memo.type !== "text") return "";
  if (typeof memo.value === "string") return memo.value;
  if (memo.value instanceof Uint8Array) return new TextDecoder().decode(memo.value);
  if (memo.value?.toString) return String(memo.value);
  return "";
}

function isNotFound(error) {
  return (
    error instanceof NotFoundError ||
    error?.response?.status === 404
  );
}

function definitive(reason) {
  const error = new Error(reason || "rejected");
  error.definitive = true;
  error.reason = reason || "rejected";
  return error;
}

function retryable(reason) {
  const error = new Error(reason || "network");
  error.definitive = false;
  return error;
}

async function ledgerLimits(server) {
  const page = await server.ledgers().order("desc").limit(1).call();
  const ledger = page.records?.[0];
  const baseReserve = BigInt(ledger?.base_reserve_in_stroops || 0);
  const baseFee = BigInt(ledger?.base_fee_in_stroops || 0);

  if (baseReserve <= 0n || baseFee <= 0n) {
    throw retryable("ledger");
  }

  return { baseReserve, baseFee };
}

function nativeRow(account) {
  const row = (account.balances || []).find((item) => item.asset_type === "native");
  if (!row) throw new Error("missing native balance");
  return row;
}

function availableStroops(account) {
  const row = nativeRow(account);
  const gross = parseStroops(row.balance);
  const selling = parseStroops(row.selling_liabilities || "0");
  return gross > selling ? gross - selling : 0n;
}

function minimumBalance(account, baseReserve) {
  let entries =
    2n +
    BigInt(account.subentry_count || 0) +
    BigInt(account.num_sponsoring || 0) -
    BigInt(account.num_sponsored || 0);

  if (entries < 2n) entries = 2n;
  return entries * baseReserve;
}

export async function buildTestnetPayment({
  server,
  source,
  destination,
  stroops,
  memo,
}) {
  assertTestnetServer(server);

  if (!isPublicKey(source) || !isPublicKey(destination)) {
    throw new Error("invalid account");
  }
  if (source === destination) {
    const error = new Error("self-payment");
    error.code = "self-payment";
    throw error;
  }
  if (typeof stroops !== "bigint" || stroops <= 0n) {
    throw new Error("invalid xlm amount");
  }
  if (typeof memo !== "string" || Buffer.byteLength(memo) > 28) {
    throw new Error("invalid memo");
  }

  const limits = await ledgerLimits(server);
  let sourceAccount;

  try {
    sourceAccount = await server.loadAccount(source);
  } catch (error) {
    if (isNotFound(error)) {
      const missing = new Error("missing-source");
      missing.code = "missing-source";
      throw missing;
    }
    throw error;
  }

  try {
    await server.loadAccount(destination);
  } catch (error) {
    if (isNotFound(error)) {
      const missing = new Error("missing-destination");
      missing.code = "missing-destination";
      throw missing;
    }
    throw error;
  }

  const spendable =
    availableStroops(sourceAccount) -
    minimumBalance(sourceAccount, limits.baseReserve) -
    limits.baseFee;

  if (stroops > spendable) {
    const error = new Error("insufficient");
    error.code = "insufficient";
    throw error;
  }

  const amountText = formatStroops(stroops);
  const transaction = new TransactionBuilder(sourceAccount, {
    fee: limits.baseFee.toString(),
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount: amountText,
      })
    )
    .addMemo(Memo.text(memo))
    .setTimeout(180)
    .build();

  return {
    xdr: transaction.toXDR(),
    hash: bytesToHex(transaction.hash()),
    sequence: String(transaction.sequence),
    fee: String(transaction.fee),
    minTime: String(transaction.timeBounds?.minTime || "0"),
    maxTime: String(transaction.timeBounds?.maxTime || "0"),
    amountText,
  };
}

export function inspectSignedTicketPayment({ signedXdr, expected, now = new Date() }) {
  if (expected?.passphrase && expected.passphrase !== Networks.TESTNET) {
    throw new Error("mismatch");
  }
  if (expected?.source && expected.source === expected.destination) {
    throw new Error("mismatch");
  }

  let signed;

  try {
    signed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
  } catch {
    throw new Error("mismatch");
  }

  if (signed.innerTransaction || signed.feeSource) {
    throw new Error("mismatch");
  }

  const maxTime = Number(signed.timeBounds?.maxTime || 0);
  const nowSeconds = Math.floor(now.getTime() / 1000);

  if (!Number.isFinite(maxTime) || maxTime <= nowSeconds) {
    throw new Error("expired");
  }

  const hash = bytesToHex(signed.hash());
  const operation = signed.operations?.[0];
  const amount = operation?.amount;

  if (
    signed.source !== expected.source ||
    String(signed.sequence) !== String(expected.sequence) ||
    String(signed.fee) !== String(expected.fee) ||
    String(signed.timeBounds?.minTime || "0") !== String(expected.minTime) ||
    String(signed.timeBounds?.maxTime || "0") !== String(expected.maxTime) ||
    hash !== expected.hash ||
    signed.operations?.length !== 1 ||
    operation?.type !== "payment" ||
    operation?.destination !== expected.destination ||
    !operation?.asset?.isNative?.() ||
    parseStroops(amount) !== parseStroops(expected.amountText)
  ) {
    throw new Error("mismatch");
  }

  const memo = memoText(signed.memo);
  if (memo !== expected.memo) throw new Error("mismatch");

  const signer = Keypair.fromPublicKey(expected.source);
  const digest = signed.hash();
  const valid = (signed.signatures || []).some((signature) => {
    const raw = signature?.signature;
    const bytes = typeof raw === "function" ? raw.call(signature) : raw;
    return bytes ? signer.verify(digest, bytes) : false;
  });

  if (!valid) throw new Error("mismatch");

  return { hash, transaction: signed };
}

export function assertHorizonTicketPayment(transaction, operations, expected) {
  if (transaction?.successful !== true) throw definitive("unsuccessful");
  if (transaction.source_account !== expected.source) throw definitive("source");
  if (transaction.hash !== expected.hash) throw definitive("hash");
  if (transaction.memo_type !== "text" || transaction.memo !== expected.memo) {
    throw definitive("memo");
  }
  if (Number(transaction.operation_count) !== 1) throw definitive("operations");
  if (!Array.isArray(operations) || operations.length !== 1) {
    throw definitive("operations");
  }

  const operation = operations[0];
  if (
    operation.type !== "payment" ||
    operation.asset_type !== "native" ||
    operation.from !== expected.source ||
    operation.to !== expected.destination ||
    parseStroops(operation.amount) !== parseStroops(expected.amountText)
  ) {
    throw definitive("payment");
  }

  return {
    hash: transaction.hash,
    ledger: Number(transaction.ledger) || null,
  };
}

async function readTransaction(server, hash) {
  try {
    return await server.transactions().transaction(hash).call();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function readOperations(server, hash) {
  const page = await server.operations().forTransaction(hash).call();
  return page.records || [];
}

export async function settleTestnetTransaction({
  server,
  signedXdr,
  expected,
  now = new Date(),
}) {
  assertTestnetServer(server);
  const inspected = inspectSignedTicketPayment({ signedXdr, expected, now });
  let record = await readTransaction(server, inspected.hash);

  if (!record) {
    try {
      record = await server.submitTransaction(inspected.transaction);
    } catch (error) {
      record = await readTransaction(server, inspected.hash).catch(() => null);
      if (!record) {
        if (error instanceof TransactionFailedError || error?.definitive) {
          throw definitive("rejected");
        }
        throw retryable("network");
      }
    }
  }

  let operations;

  try {
    operations = await readOperations(server, inspected.hash);
  } catch {
    throw retryable("network");
  }

  return assertHorizonTicketPayment(record, operations, {
    ...expected,
    hash: inspected.hash,
  });
}

function publicPayment(payment) {
  return {
    payment_id: payment.id,
    event_ticket_id: payment.event_ticket_id,
    event_id: payment.event_id,
    network: "TESTNET",
    status: payment.status,
    destination: payment.destination_public_key,
    eur_amount: Number(payment.eur_amount),
    amount_xlm: payment.amount_xlm,
    memo: payment.memo,
    payment_reference: payment.payment_reference,
    expires_at: payment.expires_at,
    tx_hash: payment.tx_hash || null,
    horizon_ledger: payment.horizon_ledger || null,
    confirmed_at: payment.confirmed_at || null,
  };
}

function receipt(payment, ticket) {
  return {
    status: 200,
    body: {
      ok: true,
      confirmed: payment.status === "confirmed" && ticket?.payment_status === "paid",
      ...publicPayment(payment),
      ticket_status: ticket?.ticket_status || null,
      payment_status: ticket?.payment_status || null,
    },
  };
}

async function requireUser(store, accessToken) {
  if (!accessToken) return null;
  return store.getUser(accessToken);
}

function canExpireOpenPayment(payment) {
  if (!payment || payment.tx_hash || payment.confirmed_at) return false;
  if (payment.status === "confirmed") return false;
  return ["pending", "prepared", "submitted", "failed"].includes(payment.status);
}

function sameStellarAccount(source, destination) {
  return isPublicKey(source) && isPublicKey(destination) && source === destination;
}

const SELF_PAYMENT_ERROR = "The paying account must be different from the merchant account";

async function releaseSelfPayment(store, payment, userId) {
  if (!sameStellarAccount(payment?.source_public_key, payment?.destination_public_key)) return null;
  if (payment.tx_hash || payment.confirmed_at || payment.status === "confirmed") return null;
  return store.updatePaymentIf(payment.id, userId, ["pending", "prepared", "submitted"], {
    status: "failed",
    failure_reason: "payer and merchant are the same account",
  });
}

function isOpenEventConflict(error) {
  return String(error?.message || "").includes("stellar_ticket_payments_one_open_event");
}

async function resumeOpenPayment(store, payment, userId) {
  const ticket = await store.getTicketForUser(payment.event_ticket_id, userId);
  return {
    status: 200,
    body: {
      ok: true,
      resumed: true,
      ...publicPayment(payment),
      ticket_status: ticket?.ticket_status || null,
      payment_status: ticket?.payment_status || null,
    },
  };
}

function merchantKey(value) {
  const key = String(value || "").trim();
  if (!isPublicKey(key)) return null;
  return key;
}

export async function createTicketIntent({
  store,
  accessToken,
  body,
  merchantPublicKey,
  fetchImpl,
  server,
  now = () => new Date(),
}) {
  const user = await requireUser(store, accessToken);
  if (!user) return fail(401, "Authentication required");

  const eventId = Number(body?.event_id);
  const quantity = safeQuantity(body?.quantity);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return fail(400, "Invalid event");
  if (!quantity) return fail(400, "Invalid quantity");

  const event = await store.getEvent(eventId);
  if (!event) return fail(404, "Event not found");
  if (event.is_public !== true) return fail(403, "This event is not publicly available");
  if (String(event.status || "").toLowerCase() !== "active") {
    return fail(409, "This event is not active");
  }

  const unitPrice = normalizePrice(event.price);
  if (unitPrice === null) return fail(409, "This event does not have a valid ticket price");
  if (unitPrice === 0) return fail(409, "Free tickets are issued without XLM");

  const destination = merchantKey(merchantPublicKey);
  if (!destination) return fail(503, "XLM checkout is not configured");

  const maxAttendees =
    event.max_attendees === null || event.max_attendees === undefined
      ? null
      : Number(event.max_attendees);

  if (
    maxAttendees !== null &&
    (!Number.isSafeInteger(maxAttendees) || maxAttendees < 1)
  ) {
    return fail(409, "Invalid event capacity");
  }

  if (maxAttendees !== null) {
    const reserved = await store.countPaidTickets(eventId);
    if (reserved + quantity > maxAttendees) {
      return fail(409, "Not enough tickets are available");
    }
  }

  const current = now();
  const open = await store.findOpenPayment(user.id, eventId);
  let releasedSelfPayment = false;
  if (open && sameStellarAccount(open.source_public_key, open.destination_public_key)) {
    if (open.tx_hash || open.confirmed_at || open.status === "confirmed") {
      return fail(409, SELF_PAYMENT_ERROR);
    }
    const released = await releaseSelfPayment(store, open, user.id);
    if (!released) return fail(409, SELF_PAYMENT_ERROR);
    releasedSelfPayment = true;
  } else if (open && new Date(open.expires_at).getTime() > current.getTime()) {
    return resumeOpenPayment(store, open, user.id);
  }
  if (open && !releasedSelfPayment) {
    if (!canExpireOpenPayment(open)) {
      return fail(409, "This payment is no longer payable");
    }
    const expired = await store.markExpired(open.id, user.id);
    if (!expired) {
      const currentOpen = await store.findOpenPayment(user.id, eventId);
      if (
        currentOpen &&
        currentOpen.id !== open.id &&
        new Date(currentOpen.expires_at).getTime() > current.getTime()
      ) {
        return resumeOpenPayment(store, currentOpen, user.id);
      }
      if (currentOpen && currentOpen.id === open.id) {
        return fail(409, "This payment is no longer payable");
      }
    }
  }

  let quote;

  try {
    quote = await fetchEurPerXlm(fetchImpl);
  } catch {
    return fail(503, "XLM price quote is unavailable");
  }

  try {
    assertTestnetServer(server);
    await server.loadAccount(destination);
  } catch (error) {
    if (error?.code === "missing-destination" || isNotFound(error)) {
      return fail(503, "The merchant Testnet account is not available");
    }
    if (String(error?.message || "").includes("Service checkout")) {
      return fail(503, "XLM checkout is not configured");
    }
    return fail(502, "Stellar Testnet could not be reached");
  }

  const eurAmount = Number((unitPrice * quantity).toFixed(2));
  let stroops;

  try {
    stroops = eurToStroops(eurAmount, quote.eurPerXlm);
  } catch {
    return fail(409, "This event does not have a valid ticket price");
  }

  const reference = createPaymentReference();
  const expiresAt = new Date(current.getTime() + 15 * 60 * 1000).toISOString();
  let ticket;

  try {
    ticket = await store.insertTicket({
      user_id: user.id,
      event_id: eventId,
      quantity,
      unit_price: unitPrice,
      currency: "EUR",
      total_amount: eurAmount,
      payment_status: "pending",
      ticket_status: "pending",
      payment_provider: "stellar",
      payment_reference: null,
      paid_at: null,
    });
  } catch {
    return fail(500, "Unable to create XLM checkout");
  }

  try {
    const payment = await store.insertPayment({
      user_id: user.id,
      event_ticket_id: ticket.id,
      event_id: eventId,
      network: "TESTNET",
      status: "pending",
      destination_public_key: destination,
      eur_amount: eurAmount,
      eur_per_xlm: quote.eurPerXlm,
      quote_source: quote.source,
      quoted_at: current.toISOString(),
      amount_stroops: stroops.toString(),
      amount_xlm: formatStroops(stroops),
      payment_reference: reference,
      memo: reference,
      expires_at: expiresAt,
    });

    return {
      status: 200,
      body: { ok: true, resumed: false, ...publicPayment(payment) },
    };
  } catch (error) {
    await store.deletePendingTicket(ticket.id, user.id).catch(() => {});
    if (isOpenEventConflict(error)) {
      const currentOpen = await store.findOpenPayment(user.id, eventId);
      if (currentOpen && new Date(currentOpen.expires_at).getTime() > current.getTime()) {
        return resumeOpenPayment(store, currentOpen, user.id);
      }
    }
    return fail(500, "Unable to create XLM checkout");
  }
}

export async function prepareTicketPayment({
  store,
  accessToken,
  body,
  merchantPublicKey,
  server,
  now = () => new Date(),
}) {
  const user = await requireUser(store, accessToken);
  if (!user) return fail(401, "Authentication required");

  const paymentId = String(body?.payment_id || "").trim();
  const source = String(body?.source_public_key || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) return fail(400, "Invalid payment request");
  if (!isPublicKey(source)) return fail(400, "Invalid Stellar account");

  const payment = await store.getPaymentForUser(paymentId, user.id);
  if (!payment) return fail(404, "Payment not found");
  if (payment.status === "confirmed") return fail(409, "This payment is already confirmed");
  if (payment.status === "failed" || payment.status === "expired") {
    return fail(409, "This payment is no longer payable");
  }

  const current = now();
  if (new Date(payment.expires_at).getTime() <= current.getTime()) {
    await store.markExpired(payment.id, user.id);
    return fail(409, "This payment has expired");
  }

  const destination = merchantKey(merchantPublicKey);
  if (!destination || destination !== payment.destination_public_key) {
    return fail(409, "The merchant destination could not be verified");
  }
  if (source === destination) {
    await releaseSelfPayment(
      store,
      { ...payment, source_public_key: source, destination_public_key: destination },
      user.id
    );
    return fail(409, SELF_PAYMENT_ERROR);
  }

  let built;

  try {
    built = await buildTestnetPayment({
      server,
      source,
      destination,
      stroops: BigInt(payment.amount_stroops),
      memo: payment.memo,
    });
  } catch (error) {
    if (error?.code === "self-payment") {
      return fail(409, SELF_PAYMENT_ERROR);
    }
    if (error?.code === "missing-source") {
      return fail(409, "This Stellar account does not exist on Testnet");
    }
    if (error?.code === "insufficient") {
      return fail(409, "The available XLM is not enough for this payment and the account reserve");
    }
    if (error?.code === "missing-destination" || isNotFound(error)) {
      return fail(503, "The merchant Testnet account is not available");
    }
    return fail(502, "Stellar Testnet could not be reached");
  }

  const updated = await store.updatePaymentIf(
    payment.id,
    user.id,
    ["pending", "prepared"],
    {
      status: "prepared",
      source_public_key: source,
      unsigned_xdr: built.xdr,
      prepared_hash: built.hash,
      sequence: built.sequence,
      fee: built.fee,
      min_time: built.minTime,
      max_time: built.maxTime,
      tx_hash: null,
    }
  );

  if (!updated) return fail(409, "This payment is no longer payable");

  return {
    status: 200,
    body: {
      ok: true,
      ...publicPayment(updated),
      xdr: built.xdr,
      network_passphrase: Networks.TESTNET,
      prepared_hash: built.hash,
    },
  };
}

async function confirmRecordedPayment(store, payment, userId, settled, now) {
  const confirmed = await store.updatePaymentIf(
    payment.id,
    userId,
    ["submitted", "confirmed", "failed"],
    {
      status: "confirmed",
      tx_hash: settled.hash,
      horizon_ledger: settled.ledger,
      confirmed_at: payment.confirmed_at || now.toISOString(),
      failure_reason: null,
    }
  );

  if (!confirmed) return fail(500, "Payment was seen on Testnet but could not be recorded");

  await store.updateTicketIfPending(payment.event_ticket_id, userId, {
    payment_status: "paid",
    ticket_status: "valid",
    payment_provider: "stellar",
    payment_reference: settled.hash,
    paid_at: now.toISOString(),
  });

  const ticket = await store.getTicketForUser(payment.event_ticket_id, userId);
  const fresh = await store.getPaymentForUser(payment.id, userId);

  if (ticket?.payment_status !== "paid" || ticket?.ticket_status !== "valid") {
    return fail(500, "Payment was seen on Testnet but the ticket was not confirmed", {
      tx_hash: settled.hash,
    });
  }

  return receipt(fresh, ticket);
}

export async function submitTicketPayment({
  store,
  accessToken,
  body,
  merchantPublicKey,
  server,
  now = () => new Date(),
}) {
  const user = await requireUser(store, accessToken);
  if (!user) return fail(401, "Authentication required");

  const paymentId = String(body?.payment_id || "").trim();
  const signedXdr = String(body?.signed_xdr || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(paymentId) || !signedXdr) {
    return fail(400, "Invalid payment request");
  }

  const payment = await store.getPaymentForUser(paymentId, user.id);
  if (!payment) return fail(404, "Payment not found");

  const current = now();
  const destination = merchantKey(merchantPublicKey);
  if (!destination || destination !== payment.destination_public_key) {
    return fail(409, "The merchant destination could not be verified");
  }
  if (sameStellarAccount(payment.source_public_key, destination)) {
    const ticket = await store.getTicketForUser(payment.event_ticket_id, user.id);
    if (payment.status === "confirmed" && ticket?.payment_status === "paid") {
      return receipt(payment, ticket);
    }
    await releaseSelfPayment(store, payment, user.id);
    return fail(409, SELF_PAYMENT_ERROR);
  }

  if (payment.status === "confirmed" && payment.tx_hash) {
    const ticket = await store.getTicketForUser(payment.event_ticket_id, user.id);
    if (ticket?.payment_status === "paid") return receipt(payment, ticket);
    try {
      assertTestnetServer(server);
      const record = await readTransaction(server, payment.tx_hash);
      const operations = record
        ? await readOperations(server, payment.tx_hash)
        : [];
      const settled = assertHorizonTicketPayment(record, operations, {
        source: payment.source_public_key,
        destination: payment.destination_public_key,
        amountText: payment.amount_xlm,
        memo: payment.memo,
        hash: payment.tx_hash,
      });
      return confirmRecordedPayment(store, payment, user.id, settled, current);
    } catch {
      return fail(500, "Payment was seen on Testnet but the ticket was not confirmed", {
        tx_hash: payment.tx_hash,
      });
    }
  }

  if (!payment.prepared_hash || !payment.source_public_key) {
    return fail(409, "This payment is not ready to sign");
  }

  if (
    payment.status !== "prepared" &&
    payment.status !== "submitted" &&
    payment.status !== "failed"
  ) {
    return fail(409, "This payment is no longer payable");
  }

  if (new Date(payment.expires_at).getTime() <= current.getTime()) {
    await store.markExpired(payment.id, user.id);
    return fail(409, "This payment has expired");
  }

  const expected = {
    source: payment.source_public_key,
    destination: payment.destination_public_key,
    amountText: payment.amount_xlm,
    memo: payment.memo,
    hash: payment.prepared_hash,
    sequence: payment.sequence,
    fee: payment.fee,
    minTime: payment.min_time,
    maxTime: payment.max_time,
  };

  let inspected;

  try {
    inspected = inspectSignedTicketPayment({
      signedXdr,
      expected,
      now: current,
    });
  } catch (error) {
    if (error.message === "expired") {
      await store.markExpired(payment.id, user.id);
      return fail(409, "This payment has expired");
    }
    return fail(409, "The signed transaction does not match this ticket payment");
  }

  const existing = await store.findByHash(inspected.hash);
  if (existing && existing.id !== payment.id) {
    return fail(409, "This transaction was already used");
  }

  const locked = await store.updatePaymentIf(
    payment.id,
    user.id,
    ["prepared", "submitted", "failed"],
    {
      status: "submitted",
      tx_hash: inspected.hash,
      failure_reason: null,
    }
  );

  if (!locked) return fail(409, "This payment is no longer payable");

  let settled;

  try {
    settled = await settleTestnetTransaction({
      server,
      signedXdr,
      expected,
      now: current,
    });
  } catch (error) {
    if (error?.definitive) {
      await store.updatePaymentIf(payment.id, user.id, ["submitted"], {
        status: "failed",
        failure_reason: "transaction rejected",
      });
      return fail(409, "The Stellar transaction was rejected. The ticket was not confirmed");
    }
    return fail(502, "Network check failed. The ticket was not confirmed");
  }

  return confirmRecordedPayment(store, locked, user.id, settled, current);
}

export async function readTicketPayment({ store, accessToken, paymentId }) {
  const user = await requireUser(store, accessToken);
  if (!user) return fail(401, "Authentication required");

  const id = String(paymentId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Invalid payment request");

  const payment = await store.getPaymentForUser(id, user.id);
  if (!payment) return fail(404, "Payment not found");

  const ticket = await store.getTicketForUser(payment.event_ticket_id, user.id);
  return {
    status: 200,
    body: {
      ok: true,
      ...publicPayment(payment),
      ticket_status: ticket?.ticket_status || null,
      payment_status: ticket?.payment_status || null,
    },
  };
}

export function createSupabaseTicketStore(admin) {
  return {
    async getUser(accessToken) {
      const { data, error } = await admin.auth.getUser(accessToken);
      if (error || !data?.user?.id) return null;
      return { id: data.user.id };
    },

    async getEvent(eventId) {
      const { data, error } = await admin
        .from("events")
        .select("id,title,price,max_attendees,is_public,status")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async countPaidTickets(eventId) {
      const { data, error } = await admin
        .from("event_tickets")
        .select("quantity")
        .eq("event_id", eventId)
        .eq("ticket_status", "valid")
        .eq("payment_status", "paid");
      if (error) throw error;
      return (data || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    },

    async findOpenPayment(userId, eventId) {
      const { data, error } = await admin
        .from("stellar_ticket_payments")
        .select("*")
        .eq("user_id", userId)
        .eq("event_id", eventId)
        .in("status", OPEN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async insertTicket(row) {
      const { data, error } = await admin
        .from("event_tickets")
        .insert(row)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },

    async deletePendingTicket(id, userId) {
      const { error } = await admin
        .from("event_tickets")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .eq("payment_status", "pending");
      if (error) throw error;
    },

    async insertPayment(row) {
      const { data, error } = await admin
        .from("stellar_ticket_payments")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },

    async getPaymentForUser(id, userId) {
      const { data, error } = await admin
        .from("stellar_ticket_payments")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getTicketForUser(id, userId) {
      const { data, error } = await admin
        .from("event_tickets")
        .select("id,user_id,payment_status,ticket_status,payment_provider,payment_reference")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async findByHash(hash) {
      const { data, error } = await admin
        .from("stellar_ticket_payments")
        .select("*")
        .eq("tx_hash", hash)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async updatePaymentIf(id, userId, statuses, patch) {
      const { data, error } = await admin
        .from("stellar_ticket_payments")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .in("status", statuses)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async markExpired(id, userId) {
      const { data, error } = await admin
        .from("stellar_ticket_payments")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .in("status", ["pending", "prepared", "submitted", "failed"])
        .is("tx_hash", null)
        .is("confirmed_at", null)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async updateTicketIfPending(id, userId, patch) {
      const { data, error } = await admin
        .from("event_tickets")
        .update(patch)
        .eq("id", id)
        .eq("user_id", userId)
        .eq("payment_status", "pending")
        .eq("ticket_status", "pending")
        .select("id,payment_status,ticket_status,payment_reference")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  };
}

export function createStellarTicketRequestHandler(action, deps = {}) {
  return async function handler(req, res) {
    const expectedMethod = action === "status" ? "GET" : "POST";

    if (req.method !== expectedMethod) {
      res.setHeader("Allow", expectedMethod);
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const env = deps.env || process.env;
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ ok: false, error: "Server configuration error" });
    }

    const store = deps.store || createSupabaseTicketStore(
      deps.admin ||
        createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
    );
    const server = deps.server || createTestnetServer();
    const fetchImpl = deps.fetchImpl || fetch;
    const accessToken = bearer(req.headers?.authorization || "");
    const body = req.body || {};
    const merchantPublicKey = env.HAVKAR_STELLAR_TICKET_MERCHANT_PUBLIC_KEY;

    try {
      const result =
        action === "intent"
          ? await createTicketIntent({
              store,
              accessToken,
              body,
              merchantPublicKey,
              fetchImpl,
              server,
            })
          : action === "prepare"
            ? await prepareTicketPayment({
                store,
                accessToken,
                body,
                merchantPublicKey,
                server,
              })
            : action === "submit"
              ? await submitTicketPayment({
                  store,
                  accessToken,
                  body,
                  merchantPublicKey,
                  server,
                })
              : await readTicketPayment({
                  store,
                  accessToken,
                  paymentId: req.query?.payment_id,
                });

      return res.status(result.status).json(result.body);
    } catch {
      console.error("stellar ticket checkout failed");
      return res.status(500).json({
        ok: false,
        error: "Unable to complete XLM checkout",
      });
    }
  };
}
