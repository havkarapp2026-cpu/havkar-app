/*
 * Shared browser caller for server-side XLM checkout (Testnet or Mainnet).
 * Fiat buttons stay in place. This file never marks an order paid locally.
 * Mainnet quotes only succeed when server env gates + destination are set.
 */
(function (root) {
  function describe(result) {
    if (!result) {
      return "XLM checkout returned no result. Nothing was marked paid.";
    }

    const networkLabel =
      result.network === "mainnet" ? "Mainnet" : "Testnet";

    if (result.settlement === "refunded") {
      return "Horizon verified the refund on " + networkLabel +
        ". The order is no longer paid.";
    }

    if (result.order_paid === true && result.settlement === "settled") {
      return result.idempotent
        ? "This " + networkLabel + " payment was already verified."
        : "Horizon verified the " + networkLabel +
          " payment. The quote is settled.";
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

    return {
      ok: response.ok && result && result.ok === true,
      response: response,
      result: result
    };
  }

  async function resolvePreferredNetwork() {
    try {
      const response = await fetch("/api/payment-activation-status", {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      const body = await response.json();
      if (
        body &&
        body.ok === true &&
        body.stellar &&
        body.stellar.mainnet_ready === true
      ) {
        return "mainnet";
      }
    } catch (error) {
      // Fall through to Testnet when status is unavailable.
    }

    return "testnet";
  }

  function walletNetworkMatches(preferred) {
    const network =
      typeof root.havkarGetStellarNetwork === "function"
        ? root.havkarGetStellarNetwork()
        : null;

    if (!network) {
      return false;
    }

    if (preferred === "mainnet") {
      return (
        network.id === "PUBLIC" &&
        network.paymentsEnabled === true &&
        String(network.horizon || "").indexOf("horizon.stellar.org") !== -1
      );
    }

    return (
      network.id === "TESTNET" &&
      String(network.horizon || "").indexOf("horizon-testnet.stellar.org") !== -1
    );
  }

  async function quote(options) {
    const input = options || {};
    const key = String(
      input.idempotencyKey || ("hv" + Date.now().toString(36) + "quote")
    );
    const network =
      input.network || (await resolvePreferredNetwork());

    return post(
      {
        payment_method: "xlm",
        action: "quote",
        flow: input.flow,
        price: input.price,
        network: network,
        idempotency_key: key,
        subject_id: input.subjectId || null
      },
      input.accessToken
    );
  }

  async function verify(options) {
    const input = options || {};

    return post(
      {
        payment_method: "xlm",
        action: input.action === "refund" ? "refund" : "verify",
        intent_id: input.intentId,
        tx_hash: input.txHash,
        refund_tx_hash: input.txHash,
        network: input.network || undefined
      },
      input.accessToken
    );
  }

  /**
   * Quote → wallet sign/submit → server Horizon verify.
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

    const preferred = input.network || (await resolvePreferredNetwork());

    if (!walletNetworkMatches(preferred)) {
      return {
        ok: false,
        result: {
          ok: false,
          paid: false,
          order_paid: false,
          error:
            preferred === "mainnet"
              ? "Switch the Stellar wallet to Mainnet (PUBLIC / horizon.stellar.org) before paying."
              : "Switch the Stellar wallet to Testnet before paying."
        }
      };
    }

    const quoted = await quote({
      ...input,
      network: preferred,
      accessToken: accessToken
    });

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
    )
      .trim()
      .toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(txHash)) {
      return {
        ok: false,
        result: {
          ok: false,
          paid: false,
          order_paid: false,
          intent_id: quoted.result.intent_id,
          network: quoted.result.network,
          error:
            (payment && payment.error) ||
            "Wallet did not return a transaction hash. Nothing was marked paid."
        }
      };
    }

    return verify({
      intentId: quoted.result.intent_id,
      txHash: txHash,
      network: quoted.result.network,
      accessToken: accessToken
    });
  }

  root.HAVKAR_XLM = {
    quote: quote,
    verify: verify,
    payAndVerify: payAndVerify,
    describe: describe
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
