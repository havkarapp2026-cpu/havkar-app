/*
 * Mainnet destination ownership via LOBSTR signMessage.
 * No transaction is submitted on the preferred path. No secrets are accepted.
 */
(function () {
  var API = "/api/stellar-mainnet-ownership";
  var statusNode = document.getElementById("ownership-status");
  var detailNode = document.getElementById("ownership-detail");
  var messageNode = document.getElementById("ownership-message");
  var addressNode = document.getElementById("ownership-address");
  var memoNode = document.getElementById("ownership-memo");
  var fallbackNode = document.getElementById("ownership-fallback");
  var signButton = document.getElementById("ownership-sign");
  var txButton = document.getElementById("ownership-tx-verify");
  var txInput = document.getElementById("ownership-tx-hash");
  var challenge = null;

  var messages = {
    unverified: "مالکیت Mainnet هنوز تأیید نشده است.",
    verified: "سرور امضای LOBSTR را برای مقصد Mainnet پذیرفت.",
    waiting: "در حال درخواست امضای پیام از LOBSTR. هیچ XLM منتقل نمی‌شود.",
    missing_extension: "افزونه LOBSTR در این مرورگر پیدا نشد. از Chrome/Brave با LOBSTR Extension استفاده کنید یا مسیر fallback را دنبال کنید.",
    wrong_account: "حساب فعال LOBSTR همان مقصد پیکربندی‌شده نیست.",
    rejected: "LOBSTR امضا را برنگرداند.",
    request: "چالش از سرور دریافت نشد.",
    SIGNATURE_INVALID: "امضا با مقصد Mainnet جور درنیامد.",
    PUBLIC_KEY_MISMATCH: "امضاکننده همان مقصد پیکربندی‌شده نیست.",
    CHALLENGE_EXPIRED: "مهلت چالش تمام شد. دوباره تلاش کنید.",
    CHALLENGE_REPLAY: "این چالش قبلاً استفاده شده است.",
    TX_NOT_FOUND: "تراکنش روی Horizon Public پیدا نشد.",
    MEMO_MISMATCH: "Memo تراکنش با چالش فعلی یکی نیست.",
    PAYMENT_MISMATCH: "پرداخت native خروجی از مقصد پیکربندی‌شده در تراکنش نیست."
  };

  function setState(verified, text) {
    statusNode.dataset.verified = verified ? "true" : "false";
    statusNode.dataset.state = verified ? "verified" : "unverified";
    statusNode.textContent = text;
  }

  function explain(response) {
    if (response && response.verified === true) {
      return messages.verified;
    }

    var code = response && response.code;
    return messages[code] || (response && response.error) || messages.unverified;
  }

  function show(response) {
    var ok = Boolean(response && response.verified === true && response.network === "mainnet");
    setState(ok, ok ? messages.verified : explain(response));
    detailNode.textContent = ok && response.verified_at ? response.verified_at : "";

    if (response && response.pubkey) {
      addressNode.textContent = response.pubkey;
    }
  }

  async function post(body) {
    var response = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return (await response.json()) || { verified: false };
  }

  async function ensureLobstr() {
    if (!window.lobstrSignerExtensionApi && !window.lobstrExtensionApi) {
      try {
        await import("https://esm.sh/@lobstrco/signer-extension-api@2.0.0");
      } catch (error) {
      }
    }

    var api = window.lobstrSignerExtensionApi || window.lobstrExtensionApi || null;

    if (!api || typeof api.isConnected !== "function") {
      throw new Error("missing_extension");
    }

    var connected = await api.isConnected();

    if (!connected) {
      throw new Error("missing_extension");
    }

    return api;
  }

  async function refreshStatus() {
    try {
      show(await post({ action: "mainnet_ownership_status" }));
    } catch (error) {
      setState(false, messages.unverified);
    }
  }

  async function signWithLobstr() {
    signButton.disabled = true;
    setState(false, messages.waiting);
    messageNode.textContent = "";

    try {
      var issued = await post({ action: "mainnet_ownership_challenge" });

      if (!issued || issued.ok !== true || !issued.message || !issued.ticket) {
        setState(false, explain(issued));
        return;
      }

      challenge = issued;
      messageNode.textContent = issued.message;
      memoNode.textContent = issued.memo || "";
      fallbackNode.textContent =
        (issued.signing && issued.signing.fallback_outbound) || "";

      var api = await ensureLobstr();
      var publicKey = await api.getPublicKey();

      if (publicKey !== issued.pubkey) {
        setState(false, messages.wrong_account);
        return;
      }

      var signed = await api.signMessage(issued.message);

      if (!signed || !signed.signedMessage) {
        setState(false, messages.rejected);
        return;
      }

      var verified = await post({
        action: "mainnet_ownership_verify",
        network: "mainnet",
        wallet: "lobstr",
        pubkey: issued.pubkey,
        message: issued.message,
        original_message: issued.message,
        ticket: issued.ticket,
        nonce: issued.nonce,
        signedMessage: signed.signedMessage,
        signerAddress: signed.signerAddress || publicKey
      });

      show(verified);
    } catch (error) {
      if (error && error.message === "missing_extension") {
        setState(false, messages.missing_extension);
      } else {
        setState(false, messages.rejected);
      }
    } finally {
      signButton.disabled = false;
    }
  }

  async function verifyTx() {
    if (!challenge || !challenge.ticket) {
      var issued = await post({ action: "mainnet_ownership_challenge" });
      if (!issued || issued.ok !== true) {
        setState(false, explain(issued));
        return;
      }
      challenge = issued;
      messageNode.textContent = issued.message;
      memoNode.textContent = issued.memo || "";
    }

    txButton.disabled = true;

    try {
      var verified = await post({
        action: "mainnet_ownership_verify",
        network: "mainnet",
        pubkey: challenge.pubkey,
        message: challenge.message,
        original_message: challenge.message,
        ticket: challenge.ticket,
        nonce: challenge.nonce,
        tx_hash: String(txInput.value || "").trim()
      });
      show(verified);
    } catch (error) {
      setState(false, messages.unverified);
    } finally {
      txButton.disabled = false;
    }
  }

  signButton.addEventListener("click", signWithLobstr);
  txButton.addEventListener("click", verifyTx);
  refreshStatus();
})();
