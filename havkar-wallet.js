/*
 * HAVKAR wallet rules that can run without a licensed payment partner.
 *
 * Euro and dollar balances are displayed from stored rows.
 * This file never credits a balance, never sends fiat, and never
 * treats a browser redirect as a deposit.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_WALLET = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const FIAT_TRANSFERS_ENABLED = false;
  const FIAT_DEPOSITS_ENABLED = false;
  const FIAT_WITHDRAWALS_ENABLED = false;
  const FIAT_EXCHANGE_ENABLED = false;
  const QUOTE_MAX_AGE_MS = 60000;
  const PAGE_SIZE = 20;

  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const FIAT_TRANSFER_UNAVAILABLE =
    "Euro transfers are not available. HAVKAR cannot move euro balances until a licensed partner and safeguarded funds exist. No money was sent.";

  const FIAT_DEPOSIT_UNAVAILABLE =
    "Adding money is coming soon. A card or bank deposit needs a licensed provider and a safeguarding arrangement. Stripe ticket checkout is not a wallet deposit. No balance was credited.";

  const FIAT_WITHDRAWAL_UNAVAILABLE =
    "This withdrawal was not sent to a bank. HAVKAR does not pay out euros or dollars until a licensed provider exists. Your balance was not reduced.";

  const FIAT_EXCHANGE_UNAVAILABLE =
    "This is a quotation only. HAVKAR does not exchange EUR and USD until authorized settlement exists. No balance was converted.";

  const PENDING_BALANCE_TEXT =
    "Pending: nothing is reserved. Deposits, withdrawals, and euro transfers are not processed.";

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeUserId(value) {
    const id = clean(value);

    if (!UUID_PATTERN.test(id)) {
      return { ok: false, reason: "invalid_user" };
    }

    return { ok: true, id: id.toLowerCase() };
  }

  function parseMoney(value) {
    const text = clean(value);

    if (!/^\d+\.\d{2}$|^\d+$/.test(text)) {
      return { ok: false, reason: "invalid_amount" };
    }

    const amount = text.indexOf(".") === -1 ? text + ".00" : text;
    const number = Number(amount);

    if (!Number.isFinite(number) || number <= 0 || number > 9999999999999999.99) {
      return { ok: false, reason: "invalid_amount" };
    }

    return { ok: true, amount: amount, number: number };
  }

  function isValidIban(value) {
    const compact = clean(value).replace(/\s+/g, "").toUpperCase();

    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) {
      return false;
    }

    if (compact.length < 15 || compact.length > 34) {
      return false;
    }

    const rearranged = compact.slice(4) + compact.slice(0, 4);
    let remainder = 0;

    for (let index = 0; index < rearranged.length; index += 1) {
      const character = rearranged.charAt(index);
      const digits = character >= "A" && character <= "Z"
        ? String(character.charCodeAt(0) - 55)
        : character;

      for (let digitIndex = 0; digitIndex < digits.length; digitIndex += 1) {
        remainder = (remainder * 10 + Number(digits.charAt(digitIndex))) % 97;
      }
    }

    return remainder === 1;
  }

  function maskIban(value) {
    const compact = clean(value).replace(/\s+/g, "").toUpperCase();

    if (!isValidIban(compact)) {
      return "";
    }

    return compact.slice(0, 2) + "…" + compact.slice(-4);
  }

  function createIdempotencyKey() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return "00000000-0000-4000-8000-000000000000";
  }

  function assessFrankfurterQuote(payload, fetchedAt, now) {
    if (!payload || payload.base !== "EUR" || !payload.rates) {
      return { ok: false, reason: "quote" };
    }

    const rate = Number(payload.rates.USD);

    if (!Number.isFinite(rate) || rate <= 0) {
      return { ok: false, reason: "rate" };
    }

    const fetched = Number(fetchedAt);
    const clock = Number(now);

    if (!Number.isFinite(fetched) || !Number.isFinite(clock)) {
      return { ok: false, reason: "time" };
    }

    const age = clock - fetched;

    return {
      ok: true,
      rate: rate,
      date: clean(payload.date),
      fresh: age >= 0 && age <= QUOTE_MAX_AGE_MS,
      feeAmount: null,
      executable: false
    };
  }

  function estimateConversion(amountText, rate) {
    const money = parseMoney(amountText);

    if (!money.ok || !Number.isFinite(rate) || rate <= 0) {
      return { ok: false, reason: "estimate" };
    }

    const estimate = Math.round(money.number * rate * 100) / 100;

    return {
      ok: true,
      amount: money.amount,
      estimate: estimate.toFixed(2)
    };
  }

  function moneyText(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "";
    }

    return number.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function ledgerEntry(fields) {
    return {
      id: clean(fields.id),
      createdAt: fields.createdAt || "",
      amount: fields.amount,
      currency: clean(fields.currency || "EUR").toUpperCase(),
      type: clean(fields.type),
      status: clean(fields.status),
      counterparty: clean(fields.counterparty),
      fee: clean(fields.fee),
      reference: clean(fields.reference),
      details: clean(fields.details),
      direction: fields.direction || "neutral"
    };
  }

  function fromTransfer(row, userId) {
    if (!row) {
      return null;
    }

    const sent = String(row.sender_id) === String(userId);

    return ledgerEntry({
      id: row.id,
      createdAt: row.created_at,
      amount: row.amount,
      currency: row.currency || "EUR",
      type: sent ? "Sent transfer" : "Received transfer",
      status: "Recorded transfer",
      counterparty: sent ? row.receiver_id : row.sender_id,
      fee: "Not recorded",
      reference: row.id,
      details: "Stored in wallet_transfers. This is not a bank settlement.",
      direction: sent ? "out" : "in"
    });
  }

  function fromTransaction(row) {
    if (!row) {
      return null;
    }

    const labels = {
      deposit: "Deposit",
      withdrawal: "Withdrawal",
      transfer_in: "Received transfer",
      transfer_out: "Sent transfer",
      purchase: "Payment",
      sale: "Sale",
      refund: "Refund",
      fee: "Fee"
    };
    const type = labels[row.type] || row.type || "Ledger entry";
    const outbound = row.type === "withdrawal" ||
      row.type === "transfer_out" ||
      row.type === "purchase" ||
      row.type === "fee";

    return ledgerEntry({
      id: row.id,
      createdAt: row.created_at,
      amount: row.amount,
      currency: row.currency,
      type: type,
      status: "Recorded",
      counterparty: "",
      fee: row.type === "fee" ? moneyText(row.amount) : "Not recorded",
      reference: row.reference_id || row.id,
      details: row.description || "Stored in wallet_transactions. No extra status was recorded.",
      direction: outbound ? "out" : "in"
    });
  }

  function fromOperation(row) {
    if (!row) {
      return null;
    }

    const operation = row.operation === "withdrawal"
      ? "Withdrawal request"
      : "Transfer request";

    return ledgerEntry({
      id: row.id,
      createdAt: row.created_at,
      amount: row.amount,
      currency: row.currency,
      type: operation,
      status: row.status === "not_submitted"
        ? "Not submitted"
        : "Rejected",
      counterparty: row.counterparty_user_id || row.iban_masked || "",
      fee: "No fee was charged",
      reference: row.reference,
      details: row.reason || "No balance was changed.",
      direction: "neutral"
    });
  }

  function sortLedger(entries) {
    return entries.slice().sort(function (left, right) {
      return String(right.createdAt).localeCompare(String(left.createdAt));
    });
  }

  function filterLedger(entries, query) {
    const type = clean(query && query.type || "all");
    const currency = clean(query && query.currency || "all").toUpperCase();
    const search = clean(query && query.search || "").toLowerCase();

    return entries.filter(function (entry) {
      const typeName = entry.type.toLowerCase();
      const typeOk = type === "all" ||
        (type === "sent" && entry.direction === "out" && typeName.indexOf("transfer") !== -1) ||
        (type === "received" && entry.direction === "in" && typeName.indexOf("transfer") !== -1) ||
        (type === "deposit" && typeName === "deposit") ||
        (type === "withdrawal" && typeName.indexOf("withdrawal") !== -1) ||
        (type === "payment" && typeName === "payment") ||
        (type === "refund" && typeName === "refund") ||
        (type === "fee" && typeName === "fee") ||
        (type === "sale" && typeName === "sale") ||
        (type === "all-transfer" && typeName.indexOf("transfer") !== -1);

      const currencyOk = currency === "ALL" || entry.currency === currency;
      const haystack = [
        entry.reference,
        entry.type,
        entry.status,
        entry.counterparty,
        entry.details,
        entry.currency
      ].join(" ").toLowerCase();

      return typeOk && currencyOk && (!search || haystack.indexOf(search) !== -1);
    });
  }

  function pageLedger(entries, page) {
    const size = PAGE_SIZE;
    const pageCount = Math.max(1, Math.ceil(entries.length / size));
    const index = Math.min(Math.max(0, Number(page) || 0), pageCount - 1);
    const start = index * size;

    return {
      page: index,
      pageSize: size,
      total: entries.length,
      pageCount: pageCount,
      items: entries.slice(start, start + size)
    };
  }

  function transferResultMessage(row) {
    const reference = row && row.reference ? " Reference " + row.reference + "." : "";

    return FIAT_TRANSFER_UNAVAILABLE + reference;
  }

  function withdrawalResultMessage(row) {
    const reference = row && row.reference ? " Reference " + row.reference + "." : "";

    return FIAT_WITHDRAWAL_UNAVAILABLE + reference;
  }

  return {
    FIAT_TRANSFERS_ENABLED: FIAT_TRANSFERS_ENABLED,
    FIAT_DEPOSITS_ENABLED: FIAT_DEPOSITS_ENABLED,
    FIAT_WITHDRAWALS_ENABLED: FIAT_WITHDRAWALS_ENABLED,
    FIAT_EXCHANGE_ENABLED: FIAT_EXCHANGE_ENABLED,
    QUOTE_MAX_AGE_MS: QUOTE_MAX_AGE_MS,
    PAGE_SIZE: PAGE_SIZE,
    FIAT_TRANSFER_UNAVAILABLE: FIAT_TRANSFER_UNAVAILABLE,
    FIAT_DEPOSIT_UNAVAILABLE: FIAT_DEPOSIT_UNAVAILABLE,
    FIAT_WITHDRAWAL_UNAVAILABLE: FIAT_WITHDRAWAL_UNAVAILABLE,
    FIAT_EXCHANGE_UNAVAILABLE: FIAT_EXCHANGE_UNAVAILABLE,
    PENDING_BALANCE_TEXT: PENDING_BALANCE_TEXT,
    normalizeUserId: normalizeUserId,
    parseMoney: parseMoney,
    isValidIban: isValidIban,
    maskIban: maskIban,
    createIdempotencyKey: createIdempotencyKey,
    assessFrankfurterQuote: assessFrankfurterQuote,
    estimateConversion: estimateConversion,
    moneyText: moneyText,
    fromTransfer: fromTransfer,
    fromTransaction: fromTransaction,
    fromOperation: fromOperation,
    sortLedger: sortLedger,
    filterLedger: filterLedger,
    pageLedger: pageLedger,
    transferResultMessage: transferResultMessage,
    withdrawalResultMessage: withdrawalResultMessage
  };

});
