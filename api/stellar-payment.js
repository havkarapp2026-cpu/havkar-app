import { createClient } from "@supabase/supabase-js";
import { Horizon } from "@stellar/stellar-sdk";
import {
  SERVICE_EVENT_TICKET,
  TESTNET_HORIZON,
  assertSignedXdr,
  assertStagingPaymentDatabase,
  assertTestnetHorizonUrl,
  buildTestnetPayment,
  canCancel,
  canPrepare,
  canSubmit,
  configurationError,
  createPaymentReference,
  fetchTestnetTransaction,
  isExpired,
  isPublicKey,
  normalizeEurAmount,
  paymentError,
  publicPaymentView,
  quoteXlmFromEur,
  readApprovedRateProvider,
  readReceivingAccount,
  verifyHorizonPayment
} from "./stellar-payment-core.js";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;

function send(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function safeMessage(error) {
  if (
    error?.code === "STELLAR_NOT_CONFIGURED"
    || error?.code === "STELLAR_PAYMENT"
  ) {
    return error.message;
  }

  return "The Stellar payment could not be completed.";
}

function safeQuantity(value) {
  const quantity = Number(value ?? 1);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
    return null;
  }

  return quantity;
}

function unwrap(result, message) {
  if (result?.error) {
    throw paymentError(500, message);
  }

  return result.data;
}

class SupabasePaymentRepo {
  constructor(admin) {
    this.admin = admin;
  }

  async getEvent(id) {
    return unwrap(
      await this.admin
        .from("events")
        .select("id,title,price,is_public,status,max_attendees,organizer")
        .eq("id", id)
        .maybeSingle(),
      "The event could not be loaded."
    );
  }

  async countPaidTickets(eventId) {
    const rows = unwrap(
      await this.admin
        .from("event_tickets")
        .select("quantity")
        .eq("event_id", eventId)
        .eq("ticket_status", "valid")
        .eq("payment_status", "paid"),
      "Ticket availability could not be checked."
    );

    return (rows || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  }

  async findOpenIntent(userId, eventId, nowIso) {
    return unwrap(
      await this.admin
        .from("stellar_ticket_payments")
        .select("*")
        .eq("user_id", userId)
        .eq("event_id", eventId)
        .in("status", ["PENDING", "AWAITING_SIGNATURE", "SUBMITTED"])
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      "The open payment could not be loaded."
    );
  }

  async countRecentIntents(userId, sinceIso) {
    const result = await this.admin
      .from("stellar_ticket_payments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", sinceIso);

    if (result.error) {
      throw paymentError(500, "The payment limit could not be checked.");
    }

    return result.count || 0;
  }

  async insertTicket(row) {
    return unwrap(
      await this.admin.from("event_tickets").insert(row).select("id").single(),
      "The ticket reservation could not be saved."
    );
  }

  async deletePendingTicket(id, userId) {
    await this.admin
      .from("event_tickets")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .eq("payment_status", "pending")
      .eq("payment_provider", "stellar_testnet");
  }

  async insertPayment(row) {
    return unwrap(
      await this.admin.from("stellar_ticket_payments").insert(row).select("*").single(),
      "The payment intent could not be saved."
    );
  }

  async getPaymentForUser(id, userId) {
    return unwrap(
      await this.admin
        .from("stellar_ticket_payments")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle(),
      "The payment could not be loaded."
    );
  }

  async updatePayment(id, patch, allowedStatuses) {
    const result = await this.admin
      .from("stellar_ticket_payments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", allowedStatuses)
      .select("*")
      .maybeSingle();

    return unwrap(result, "The payment could not be updated.");
  }

  async confirmPayment(input) {
    return unwrap(
      await this.admin.rpc("confirm_stellar_ticket_payment", {
        p_payment_id: input.id,
        p_tx_hash: input.txHash,
        p_ledger: input.ledger,
        p_source: input.source
      }),
      "The confirmed payment could not be saved."
    );
  }

  async insertRefund(row) {
    return unwrap(
      await this.admin.from("stellar_payment_refunds").insert(row).select("*").single(),
      "The refund request could not be saved."
    );
  }

  async getOpenRefund(paymentId, userId) {
    return unwrap(
      await this.admin
        .from("stellar_payment_refunds")
        .select("*")
        .eq("payment_id", paymentId)
        .eq("user_id", userId)
        .eq("status", "REFUND_PENDING")
        .maybeSingle(),
      "The refund could not be loaded."
    );
  }

  async confirmRefund(input) {
    return unwrap(
      await this.admin.rpc("confirm_stellar_refund", {
        p_refund_id: input.id,
        p_tx_hash: input.txHash,
        p_ledger: input.ledger
      }),
      "The refund confirmation could not be saved."
    );
  }

  async insertAudit(row) {
    const result = await this.admin
      .schema("havkar_private")
      .from("stellar_payment_audit")
      .insert(row);

    if (result.error) {
      console.error("HAVKAR stellar audit write failed");
    }
  }

  async findPaymentByHash(hash) {
    return unwrap(
      await this.admin
        .from("stellar_ticket_payments")
        .select("*")
        .eq("tx_hash", hash)
        .maybeSingle(),
      "The transaction could not be checked."
    );
  }
}

async function authenticate(admin, req) {
  const authorization = req.headers.authorization || req.headers.Authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    throw paymentError(401, "Authentication required.");
  }

  const accessToken = authorization.slice(7).trim();

  if (!accessToken) {
    throw paymentError(401, "Authentication required.");
  }

  const { data, error } = await admin.auth.getUser(accessToken);

  if (error || !data?.user) {
    throw paymentError(401, "Invalid or expired session.");
  }

  return data.user;
}

function quoteContext(env, deps) {
  if (
    env.HAVKAR_STELLAR_LOCAL_TEST === "1"
    && env.VERCEL_ENV !== "production"
    && deps.quoteSource === "test-fixture"
  ) {
    if (!isPublicKey(deps.destination)) {
      throw configurationError("The Stellar receiving address is not approved yet.");
    }

    const rate = String(deps.eurPerXlm || "").trim();

    if (!/^\d+(\.\d{1,7})?$/.test(rate) || Number(rate) <= 0) {
      throw configurationError("The EUR/XLM rate provider is not approved yet.");
    }

    return {
      destination: deps.destination,
      eurPerXlm: rate,
      quoteSource: "test-fixture"
    };
  }

  readApprovedRateProvider(env);

  return {
    destination: readReceivingAccount(env),
    eurPerXlm: null,
    quoteSource: readApprovedRateProvider(env)
  };
}

async function loadPayableEvent(repo, eventId, quantity) {
  const event = await repo.getEvent(eventId);

  if (!event || event.is_public !== true || String(event.status || "").toLowerCase() !== "active") {
    throw paymentError(409, "This event is not available for payment.");
  }

  const unit = normalizeEurAmount(event.price);

  if (!unit) {
    throw paymentError(409, "This event does not have a payable price.");
  }

  const unitCents = Math.round(Number(unit) * 100);
  const total = ((unitCents * quantity) / 100).toFixed(2);
  const maxAttendees = event.max_attendees === null || event.max_attendees === undefined
    ? null
    : Number(event.max_attendees);

  if (maxAttendees !== null) {
    const reserved = await repo.countPaidTickets(eventId);

    if (reserved + quantity > maxAttendees) {
      throw paymentError(409, "Not enough tickets are available.");
    }
  }

  return { event, total };
}

async function submitSignedTransaction(signed) {
  assertTestnetHorizonUrl(TESTNET_HORIZON);
  const server = new Horizon.Server(TESTNET_HORIZON, { allowHttp: false });

  try {
    await server.submitTransaction(signed);
  } catch (error) {
    const status = error?.response?.status;

    if (status !== 400 && status !== 504) {
      throw paymentError(502, "The Stellar network did not accept the transaction.");
    }
  }
}

export async function handleStellarPayment(req, res, deps = {}) {
  const env = deps.env || process.env;

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return send(res, 405, { ok: false, error: "Method not allowed." });
    }

    const local = env.HAVKAR_STELLAR_LOCAL_TEST === "1"
      && env.VERCEL_ENV !== "production"
      && deps.repo
      && deps.user;

    let repo = deps.repo;
    let user = deps.user || null;

    if (!local) {
      const database = assertStagingPaymentDatabase(env);
      const admin = createClient(database.url, database.serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
      user = await authenticate(admin, req);
      repo = new SupabasePaymentRepo(admin);
    }

    const body = req.method === "GET" ? {} : (req.body || {});
    const action = req.method === "GET"
      ? "receipt"
      : String(body.action || "");
    const now = deps.now ? deps.now() : new Date();

    if (action === "create") {
      if (body.service_type !== SERVICE_EVENT_TICKET) {
        throw paymentError(409, "This service is not payable with XLM.");
      }

      const quote = quoteContext(env, deps);

      if (!quote.eurPerXlm) {
        throw configurationError("The EUR/XLM rate provider is not approved yet.");
      }

      const eventId = Number(body.event_id);
      const quantity = safeQuantity(body.quantity);

      if (!Number.isSafeInteger(eventId) || eventId <= 0 || !quantity) {
        throw paymentError(400, "Invalid event.");
      }

      const recent = await repo.countRecentIntents(
        user.id,
        new Date(now.getTime() - RATE_WINDOW_MS).toISOString()
      );

      if (recent >= RATE_LIMIT) {
        throw paymentError(429, "Too many payment requests. Wait before trying again.");
      }

      const open = await repo.findOpenIntent(user.id, eventId, now.toISOString());

      if (open && !isExpired(open, now)) {
        const event = await repo.getEvent(eventId);
        return send(res, 200, { ok: true, payment: publicPaymentView(open, event) });
      }

      const payable = await loadPayableEvent(repo, eventId, quantity);
      const quoted = quoteXlmFromEur(payable.total, quote.eurPerXlm);
      const reference = deps.reference || createPaymentReference();
      const quotedAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
      const ticket = await repo.insertTicket({
        user_id: user.id,
        event_id: eventId,
        quantity,
        unit_price: normalizeEurAmount(payable.event.price),
        currency: "EUR",
        total_amount: payable.total,
        payment_status: "pending",
        ticket_status: "pending",
        payment_provider: "stellar_testnet",
        payment_reference: null,
        paid_at: null
      });

      try {
        const payment = await repo.insertPayment({
          user_id: user.id,
          event_ticket_id: ticket.id,
          event_id: eventId,
          network: "TESTNET",
          status: "PENDING",
          destination_public_key: quote.destination,
          eur_amount: payable.total,
          eur_per_xlm: quote.eurPerXlm,
          quote_source: quote.quoteSource,
          quoted_at: quotedAt,
          amount_stroops: quoted.amountStroops,
          amount_xlm: quoted.amountXlm,
          payment_reference: reference,
          memo: reference,
          expires_at: expiresAt
        });

        await repo.insertAudit({
          payment_id: payment.id,
          actor_user_id: user.id,
          action: "intent_created",
          detail: { event_id: eventId, quantity }
        });

        return send(res, 200, {
          ok: true,
          payment: publicPaymentView(payment, payable.event)
        });
      } catch (error) {
        await repo.deletePendingTicket(ticket.id, user.id);
        throw error;
      }
    }

    const paymentId = String(body.payment_id || req.query?.payment_id || "").trim();
    const payment = await repo.getPaymentForUser(paymentId, user.id);

    if (!payment) {
      throw paymentError(404, "Payment not found.");
    }

    const event = await repo.getEvent(payment.event_id);

    if (isExpired(payment, now) && (canPrepare(payment) || payment.status === "SUBMITTED")) {
      const expired = await repo.updatePayment(payment.id, {
        status: "EXPIRED",
        failure_reason: "The payment quote expired."
      }, ["PENDING", "AWAITING_SIGNATURE", "SUBMITTED"]);
      return send(res, 409, {
        ok: false,
        error: "The payment quote expired.",
        payment: publicPaymentView(expired || { ...payment, status: "EXPIRED" }, event)
      });
    }

    if (action === "receipt") {
      return send(res, 200, { ok: true, payment: publicPaymentView(payment, event) });
    }

    if (action === "cancel") {
      if (!canCancel(payment)) {
        throw paymentError(409, "This payment can no longer be cancelled.");
      }

      const cancelled = await repo.updatePayment(payment.id, {
        status: "CANCELLED"
      }, ["PENDING", "AWAITING_SIGNATURE"]);

      await repo.insertAudit({
        payment_id: payment.id,
        actor_user_id: user.id,
        action: "cancelled",
        detail: {}
      });

      return send(res, 200, {
        ok: true,
        payment: publicPaymentView(cancelled, event)
      });
    }

    if (action === "prepare") {
      if (!canPrepare(payment)) {
        throw paymentError(409, "This payment is not waiting for a signature.");
      }

      if (!isPublicKey(body.source_public_key)) {
        throw paymentError(400, "A valid Stellar public key is required.");
      }

      if (body.source_public_key === payment.destination_public_key) {
        throw paymentError(409, "The paying account must be different from the receiving account.");
      }

      const built = await buildTestnetPayment({
        source: body.source_public_key,
        destination: payment.destination_public_key,
        amount: payment.amount_xlm,
        memo: payment.memo
      }, deps.fetch || fetch);
      const prepared = await repo.updatePayment(payment.id, {
        status: "AWAITING_SIGNATURE",
        source_public_key: body.source_public_key,
        unsigned_xdr: built.xdr,
        prepared_hash: built.hash,
        sequence: built.sequence,
        fee: built.fee,
        min_time: Number(built.minTime),
        max_time: Number(built.maxTime)
      }, ["PENDING", "AWAITING_SIGNATURE"]);

      return send(res, 200, {
        ok: true,
        xdr: built.xdr,
        payment: publicPaymentView(prepared, event)
      });
    }

    if (action === "submit") {
      if (payment.status === "CONFIRMED" || payment.status === "REFUNDED") {
        return send(res, 200, { ok: true, payment: publicPaymentView(payment, event) });
      }

      if (!canSubmit(payment)) {
        throw paymentError(409, "This payment is not ready to submit.");
      }

      const signed = assertSignedXdr(body.signed_xdr, {
        source: payment.source_public_key,
        destination: payment.destination_public_key,
        amount: payment.amount_xlm,
        memo: payment.memo,
        sequence: payment.sequence,
        fee: payment.fee,
        minTime: payment.min_time,
        maxTime: payment.max_time,
        hash: payment.prepared_hash
      });
      const existing = await repo.findPaymentByHash(payment.prepared_hash);

      if (existing && existing.id !== payment.id) {
        throw paymentError(409, "This transaction is already recorded.");
      }

      await repo.updatePayment(payment.id, { status: "SUBMITTED" }, [
        "AWAITING_SIGNATURE",
        "SUBMITTED"
      ]);
      await submitSignedTransaction(signed);
      const observed = await fetchTestnetTransaction(payment.prepared_hash, deps.fetch || fetch);

      if (!observed) {
        throw paymentError(409, "The transaction hash could not be confirmed on Horizon.");
      }

      const verified = verifyHorizonPayment(observed.transaction, observed.operations, {
        hash: payment.prepared_hash,
        source: payment.source_public_key,
        destination: payment.destination_public_key,
        amount: payment.amount_xlm,
        memo: payment.memo
      });
      const confirmed = await repo.confirmPayment({
        id: payment.id,
        txHash: verified.hash,
        ledger: verified.ledger,
        source: payment.source_public_key
      });

      return send(res, 200, {
        ok: true,
        payment: publicPaymentView(confirmed, event)
      });
    }

    if (action === "refund") {
      if (payment.status !== "CONFIRMED" && payment.status !== "REFUND_PENDING") {
        throw paymentError(409, "Only a confirmed payment can be refunded.");
      }

      let refund = await repo.getOpenRefund(payment.id, user.id);

      if (!refund) {
        if (payment.status !== "CONFIRMED") {
          throw paymentError(409, "Only a confirmed payment can be refunded.");
        }

        refund = await repo.insertRefund({
          payment_id: payment.id,
          user_id: user.id,
          network: "TESTNET",
          status: "REFUND_PENDING",
          amount_stroops: payment.amount_stroops,
          amount_xlm: payment.amount_xlm,
          source_public_key: payment.destination_public_key,
          destination_public_key: payment.source_public_key,
          memo: createPaymentReference().replace(/^hk/, "rf")
        });
        await repo.updatePayment(payment.id, { status: "REFUND_PENDING" }, ["CONFIRMED"]);
        await repo.insertAudit({
          payment_id: payment.id,
          refund_id: refund.id,
          actor_user_id: user.id,
          action: "refund_requested",
          detail: {}
        });
      }

      if (!body.tx_hash) {
        return send(res, 200, {
          ok: true,
          refund: {
            id: refund.id,
            status: "REFUND_PENDING",
            amount_xlm: refund.amount_xlm,
            source: refund.source_public_key,
            destination: refund.destination_public_key,
            memo: refund.memo,
            network: "TESTNET"
          },
          payment: publicPaymentView({ ...payment, status: "REFUND_PENDING" }, event)
        });
      }

      const observed = await fetchTestnetTransaction(body.tx_hash, deps.fetch || fetch);

      if (!observed) {
        throw paymentError(409, "The refund transaction is not on Testnet yet.");
      }

      const verified = verifyHorizonPayment(observed.transaction, observed.operations, {
        hash: body.tx_hash,
        source: refund.source_public_key,
        destination: refund.destination_public_key,
        amount: refund.amount_xlm,
        memo: refund.memo
      });
      await repo.confirmRefund({
        id: refund.id,
        txHash: verified.hash,
        ledger: verified.ledger
      });
      const refreshed = await repo.getPaymentForUser(payment.id, user.id);

      return send(res, 200, {
        ok: true,
        payment: publicPaymentView(refreshed, event)
      });
    }

    if (action === "reconcile") {
      if (!payment.tx_hash || (payment.status !== "CONFIRMED" && payment.status !== "REFUNDED")) {
        throw paymentError(409, "This payment has no confirmed transaction to reconcile.");
      }

      const observed = await fetchTestnetTransaction(payment.tx_hash, deps.fetch || fetch);
      let state = "mismatch";

      try {
        if (observed) {
          verifyHorizonPayment(observed.transaction, observed.operations, {
            hash: payment.tx_hash,
            source: payment.source_public_key,
            destination: payment.destination_public_key,
            amount: payment.amount_xlm,
            memo: payment.memo
          });
          state = "matched";
        }
      } catch (error) {
        state = "mismatch";
      }

      const updated = await repo.updatePayment(payment.id, {
        reconciliation_state: state
      }, [payment.status]);

      await repo.insertAudit({
        payment_id: payment.id,
        actor_user_id: user.id,
        action: "reconciled",
        detail: { state }
      });

      return send(res, 200, {
        ok: state === "matched",
        payment: publicPaymentView(updated || payment, event)
      });
    }

    throw paymentError(400, "Unknown payment action.");
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return send(res, status, { ok: false, error: safeMessage(error) });
  }
}

export default function handler(req, res) {
  return handleStellarPayment(req, res);
}
