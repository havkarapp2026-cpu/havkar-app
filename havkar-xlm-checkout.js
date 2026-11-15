/*
 * Shared browser caller for server-side XLM checkout helpers.
 * Marketplace Buy Now uses /api/marketplace Mainnet path instead.
 * This file never marks an order paid locally.
 */
(function (root) {
  function describe(result) {
    if (!result) {
      return "XLM checkout returned no result. Nothing was marked paid.";
    }

    if (result.settlement === "refunded") {
      return "Horizon verified the refund. The order is no longer paid.";
    }

    var networkLabel =
      String(result.network || "").toLowerCase() === "mainnet" ? "Mainnet" : "Testnet";
    if (result.order_paid === true && result.settlement === "settled") {
      return result.idempotent
        ? "This " + networkLabel + " payment was already verified."
        : "Horizon verified the " + networkLabel + " payment. The quote is settled.";
    }

    if (result.payable === true && result.order_paid === false) {
      return "Unpaid " + networkLabel + " quote. Send " + result.amount_xlm +
        " native XLM to " + result.destination +
        " with text memo " + result.memo +
        ". The network fee is separate. The order stays unpaid until Horizon verification.";
    }

    return result.error || "XLM payment was not settled.";
  }

  async function post(body, accessToken) {
    const response = await fetch("/api/create-event-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken
      },
      body: JSON.stringify(body)
    });
    let result = null;

    try {
      result = await response.json();
    } catch (error) {
      result = null;
    }

    return { ok: response.ok && result && result.ok === true, response: response, result: result };
  }

  async function quote(options) {
    const input = options || {};
    const key = String(input.idempotencyKey || ("hv" + Date.now().toString(36) + "quote"));

    return post({
      payment_method: "xlm",
      action: "quote",
      flow: input.flow,
      price: input.price,
      network: "testnet",
      idempotency_key: key,
      subject_id: input.subjectId || null
    }, input.accessToken);
  }

  async function verify(options) {
    const input = options || {};

    return post({
      payment_method: "xlm",
      action: input.action === "refund" ? "refund" : "verify",
      intent_id: input.intentId,
      tx_hash: input.txHash,
      refund_tx_hash: input.txHash,
      network: "testnet"
    }, input.accessToken);
  }

  root.HAVKAR_XLM = {
    quote: quote,
    verify: verify,
    describe: describe
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
