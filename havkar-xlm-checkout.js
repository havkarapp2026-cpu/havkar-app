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

    if (result.code === "STELLAR_MAINNET_DISABLED") {
      return "Stellar Mainnet payments are disabled until owner authorization gates are live. Testnet remains available.";
    }

    if (
      result.code === "CRYPTO_GEO_RESTRICTED" ||
      result.code === "CRYPTO_GEO_UNCERTAIN"
    ) {
      return (
        result.error ||
        "XLM checkout is unavailable in this location under HAVKAR crypto geo policy. Other features remain available."
      );
    }

    if (result.code === "STELLAR_MAINNET_LIVE_COLLECTION_OFF") {
      return "Stellar Mainnet customer collection is armed but not live until Owner final approval. Use Testnet or wait for live collection.";
    }

    if (result.settlement === "pending") {
      return "Horizon has not confirmed this transaction yet. The order stays unpaid. Retry verify after the ledger includes it.";
    }

    if (result.settlement === "failed") {
      return "The Stellar transaction was not successful. Nothing was marked paid.";
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
      const fees = result.fees || {};
      const buyerPaysEur =
        fees.buyerPays != null ? String(fees.buyerPays) + " EUR" : "listed EUR";
      return (
        "Unpaid " +
        networkLabel +
        " quote. Buyer pays " +
        buyerPaysEur +
        " ≈ " +
        result.amount_xlm +
        " native XLM (rate " +
        result.eur_per_xlm +
        " EUR/XLM) to " +
        result.destination +
        " with text memo " +
        result.memo +
        ". Network fee " +
        (result.network_fee_xlm || "0.00001") +
        " XLM is separate. The order stays unpaid until Horizon verification."
      );
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
        body.stellar.mainnet_customer_live === true
      ) {
        return "mainnet";
      }
    } catch (error) {
      // Fall through to Testnet when status is unavailable.
    }

    return "testnet";
  }

  async function describeNetworkAvailability() {
    try {
      const response = await fetch("/api/payment-activation-status", {
        method: "GET",
        headers: { Accept: "application/json" }
      });
      const body = await response.json();
      if (!body || body.ok !== true || !body.stellar) {
        return {
          preferred: "testnet",
          buttonLabel: "Pay with XLM (Stellar Testnet)",
          note: "Stellar quotes use Testnet until Mainnet live collection is Owner-approved."
        };
      }

      if (body.stellar.mainnet_customer_live === true) {
        return {
          preferred: "mainnet",
          buttonLabel: "Pay with XLM (Stellar Mainnet)",
          note:
            "Mainnet customer collection is live. Confirm amount, destination, memo, and fees before signing in your wallet. HAVKAR never asks for a recovery phrase."
        };
      }

      if (body.stellar.mainnet_ready === true) {
        return {
          preferred: "testnet",
          buttonLabel: "Pay with XLM (Stellar Testnet)",
          note:
            "Mainnet infrastructure is armed, but customer live collection stays off until Owner final approval. Current quotes use Testnet only."
        };
      }

      return {
        preferred: "testnet",
        buttonLabel: "Pay with XLM (Stellar Testnet)",
        note: "Stellar Mainnet collection is not live. Quotes and settlement use Testnet only."
      };
    } catch (error) {
      return {
        preferred: "testnet",
        buttonLabel: "Pay with XLM (Stellar Testnet)",
        note: "Network status unavailable. Defaulting to Stellar Testnet."
      };
    }
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

    stageWalletPayment(quoted.result);

    const signRequest = {
      destination: quoted.result.destination,
      amount: quoted.result.amount_xlm,
      memo: quoted.result.memo
    };

    if (
      quoted.result.settlement_model === "direct_split" &&
      Array.isArray(quoted.result.payments) &&
      quoted.result.payments.length >= 2
    ) {
      signRequest.payments = quoted.result.payments.map(function (entry) {
        return {
          destination: entry.destination,
          amount: entry.amount_xlm
        };
      });
    }

    const payment = await root.havkarSignAndSubmitStellarPayment(signRequest);

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

  function stageWalletPayment(quoteResult) {
    if (!quoteResult || quoteResult.payable !== true || !quoteResult.destination) {
      return false;
    }

    try {
      sessionStorage.setItem("havkar_stellar_pending_payment", JSON.stringify({
        network: quoteResult.network === "mainnet" ? "PUBLIC" : "TESTNET",
        intentId: quoteResult.intent_id || null,
        destination: quoteResult.destination,
        amount: quoteResult.amount_xlm,
        memo: quoteResult.memo,
        asset: "native",
        createdAt: Date.now()
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  root.HAVKAR_XLM = {
    quote: quote,
    verify: verify,
    payAndVerify: payAndVerify,
    describe: describe,
    stageWalletPayment: stageWalletPayment,
    resolvePreferredNetwork: resolvePreferredNetwork,
    describeNetworkAvailability: describeNetworkAvailability
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
