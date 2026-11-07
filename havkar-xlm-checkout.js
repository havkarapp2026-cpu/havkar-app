/*
 * Shared browser caller for the server-side Testnet XLM checkout.
 * Fiat buttons stay in place. This file never marks an order paid locally.
 * Mainnet stays disabled in the wallet kit and on the server.
 */
(function (root) {
  function describe(result) {
    if (!result) {
      return "XLM checkout returned no result. Nothing was marked paid.";
    }

    if (result.settlement === "refunded") {
      return "Horizon verified the refund. The order is no longer paid.";
    }

    if (result.order_paid === true && result.settlement === "settled") {
      return result.idempotent
        ? "This Testnet payment was already verified."
        : "Horizon verified the Testnet payment. The quote is settled.";
    }

    if (result.payable === true && result.order_paid === false) {
      return "Unpaid Testnet quote. Send " + result.amount_xlm +
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

  /**
   * Quote → wallet sign/submit on Testnet → server Horizon verify.
   * Never treats a local wallet success as paid without verify().
   */
  async function payAndVerify(options) {
    const input = options || {};
    const accessToken = String(input.accessToken || "");

    if (!accessToken) {
      return {
        ok: false,
        result: {
          ok: false,
          paid: false,
          order_paid: false,
          error: "Sign in before paying with XLM."
        }
      };
    }

    if (typeof root.havkarSignAndSubmitStellarPayment !== "function") {
      return {
        ok: false,
        result: {
          ok: false,
          paid: false,
          order_paid: false,
          error: "Stellar wallet kit is not loaded."
        }
      };
    }

    const network = typeof root.havkarGetStellarNetwork === "function"
      ? root.havkarGetStellarNetwork()
      : null;

    if (
      !network ||
      network.id !== "TESTNET" ||
      String(network.passphrase || "").indexOf("Test") === -1
    ) {
      return {
        ok: false,
        result: {
          ok: false,
          paid: false,
          order_paid: false,
          error: "Switch the Stellar wallet to Testnet. Mainnet payments stay disabled."
        }
      };
    }

    const quoted = await quote(input);

    if (!quoted.ok || !quoted.result || quoted.result.payable !== true) {
      return quoted;
    }

    const payment = await root.havkarSignAndSubmitStellarPayment({
      destination: quoted.result.destination,
      amount: quoted.result.amount_xlm,
      memo: quoted.result.memo
    });

    const txHash = String(
      (payment && (payment.hash || payment.txHash || payment.id)) || ""
    ).trim().toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(txHash)) {
      return {
        ok: false,
        result: {
          ok: false,
          paid: false,
          order_paid: false,
          intent_id: quoted.result.intent_id,
          error: (payment && payment.error) ||
            "Wallet did not return a Testnet transaction hash. Nothing was marked paid."
        }
      };
    }

    const settled = await verify({
      intentId: quoted.result.intent_id,
      txHash: txHash,
      accessToken: accessToken
    });

    return settled;
  }

  root.HAVKAR_XLM = {
    quote: quote,
    verify: verify,
    payAndVerify: payAndVerify,
    describe: describe
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
