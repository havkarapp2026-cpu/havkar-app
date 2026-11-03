/*
 * Tablet page for one Albedo signature.
 * The kit's signMessage wrapper throws, so this uses Albedo's sign_message
 * intent directly. It never sends a transaction and never asks for a secret.
 */
(function () {
  var EXPECTED_PUBKEY =
    "GAPCPQKBQ2VKSSRXUFOCGNUYEJLT3FRPYBCJCN2SJZ2TPLGEMMCUJV4L";
  var ALBEDO_ORIGIN = "https://albedo.link";
  var ALBEDO_CONFIRM = "https://albedo.link/confirm";
  var ALBEDO_WINDOW = "auth.albedo.link";
  var messages = {
    unverified: "مالکیت هنوز تأیید نشده است.",
    verified: "سرور امضای این آدرس را پذیرفت.",
    waiting: "در حال امضای پیام در Albedo. هیچ XLM منتقل نمی‌شود.",
    popup: "پنجره Albedo باز نشد. در مرورگر تبلت اجازه پنجره بازشو بدهید و دوباره تلاش کنید.",
    rejected: "Albedo امضا را برنگرداند. مالکیت تأیید نشد.",
    request: "چالش از سرور دریافت نشد. مالکیت تأیید نشد.",
    PRODUCTION_DATABASE_REFUSED: "این بررسی در پایگاه تولید ذخیره نمی‌شود. مالکیت تأیید نشد.",
    STAGING_DATABASE_REQUIRED: "این پیش‌نمایش به پایگاه آزمایشی Staging وصل نیست. مالکیت تأیید نشد.",
    SIGNATURE_INVALID: "امضا با این آدرس جور درنیامد. مالکیت تأیید نشد.",
    PUBLIC_KEY_MISMATCH: "آدرس امضاشده همان آدرس تأییدشده نیست. مالکیت تأیید نشد.",
    CHALLENGE_EXPIRED: "مهلت این چالش تمام شد. یک چالش تازه بگیرید.",
    CHALLENGE_REPLAY: "این چالش قبلاً استفاده شده است. یک چالش تازه بگیرید.",
    SECRET_REJECTED: "کلید خصوصی یا عبارت بازیابی پذیرفته نمی‌شود."
  };

  var statusNode = document.getElementById("ownership-status");
  var detailNode = document.getElementById("ownership-detail");
  var messageNode = document.getElementById("ownership-message");
  var button = document.getElementById("ownership-sign");
  var challenge = null;

  function setState(verified, text) {
    statusNode.dataset.verified = verified ? "true" : "false";
    statusNode.dataset.state = verified ? "verified" : "unverified";
    statusNode.textContent = text;
  }

  function accepted(response) {
    return Boolean(
      response
      && response.verified === true
      && response.funds_moved === false
      && response.paid === false
      && response.pubkey === EXPECTED_PUBKEY
      && response.network === "testnet"
    );
  }

  function explain(response) {
    if (accepted(response)) {
      return messages.verified;
    }

    var code = response && response.code;
    return messages[code] || messages.unverified;
  }

  function show(response) {
    var ok = accepted(response);
    setState(ok, ok ? messages.verified : explain(response));
    detailNode.textContent = ok && response.verified_at
      ? response.verified_at
      : "";
  }

  async function post(body) {
    var response = await fetch("/api/stellar-ownership", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    var payload = await response.json();
    return payload || { verified: false };
  }

  function openAlbedo() {
    var popup = window.open(
      "about:blank",
      ALBEDO_WINDOW,
      "height=600,width=480,top=80,left=80,menubar=0,toolbar=0,location=0,status=0,personalbar=0,scrollbars=0,dependent=1"
    );

    if (!popup) {
      return null;
    }

    try {
      popup.location.href = ALBEDO_CONFIRM;
    } catch (error) {
      try {
        popup.close();
      } catch (closeError) {
      }
      return null;
    }

    return popup;
  }

  function requestAlbedoSignature(message) {
    var popup = openAlbedo();

    if (!popup) {
      return Promise.reject(new Error("popup"));
    }

    var reqid = Math.random().toString(36).slice(2) + Date.now().toString(36);

    return new Promise(function (resolve, reject) {
      var settled = false;

      function finish(error, result) {
        if (settled) {
          return;
        }
        settled = true;
        window.removeEventListener("message", onMessage);
        window.clearTimeout(timer);
        try {
          popup.close();
        } catch (closeError) {
        }
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }

      function onMessage(event) {
        if (!event || event.origin !== ALBEDO_ORIGIN || event.source !== popup) {
          return;
        }

        var data = event.data || {};

        if (data.albedo && data.albedo.protocol) {
          if (data.albedo.protocol < 3) {
            finish(new Error("protocol"));
            return;
          }
          popup.postMessage({
            intent: "sign_message",
            message: message,
            pubkey: EXPECTED_PUBKEY,
            __reqid: reqid,
            __albedo_intent_version: 3
          }, ALBEDO_ORIGIN);
          return;
        }

        if (!data.albedoIntentResult || data.albedoIntentResult.__reqid !== reqid) {
          return;
        }

        if (data.albedoIntentResult.error) {
          finish(new Error("rejected"));
          return;
        }

        finish(null, data.albedoIntentResult);
      }

      var timer = window.setTimeout(function () {
        finish(new Error("timeout"));
      }, 150000);

      window.addEventListener("message", onMessage);
    });
  }

  async function refreshStatus() {
    try {
      show(await post({ action: "ownership_status", network: "testnet" }));
    } catch (error) {
      setState(false, messages.unverified);
    }
  }

  async function sign() {
    button.disabled = true;
    setState(false, messages.waiting);
    messageNode.textContent = "";

    try {
      var issued = await post({
        action: "ownership_challenge",
        network: "testnet"
      });

      if (!issued || issued.ok !== true || issued.verified === true || !issued.message) {
        setState(false, explain(issued));
        return;
      }

      challenge = issued;
      messageNode.textContent = issued.message;
      var signed = await window.HAVKAR_WALLET_OWNERSHIP.requestAlbedoSignature(
        issued.message
      );
      var result = await post({
        action: "ownership_verify",
        network: "testnet",
        nonce: issued.nonce,
        pubkey: signed && signed.pubkey,
        original_message: signed && (signed.original_message || issued.message),
        signed_message: signed && signed.signed_message,
        message_signature: signed && signed.message_signature,
        signedMessage: signed && signed.signedMessage
      });
      show(result);
    } catch (error) {
      var reason = error && error.message === "popup"
        ? messages.popup
        : messages.rejected;
      setState(false, reason);
    } finally {
      button.disabled = false;
    }
  }

  window.HAVKAR_WALLET_OWNERSHIP = {
    pubkey: EXPECTED_PUBKEY,
    requestAlbedoSignature: requestAlbedoSignature,
    accepted: accepted
  };

  setState(false, messages.unverified);
  button.addEventListener("click", sign);
  refreshStatus();
})();
