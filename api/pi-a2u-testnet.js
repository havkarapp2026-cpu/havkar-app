import PiNetwork from "pi-backend";

const PI_ME_URL = "https://api.minepi.com/v2/me";

function safePiError(error, stage) {
  return {
    stage,
    status: error?.response?.status || null,
    message: error?.message || "Unknown Pi error",
    piData:
      typeof error?.response?.data === "string"
        ? error.response.data.slice(0, 500)
        : error?.response?.data || null
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { accessToken, amount = 0.01 } = req.body || {};

    if (!accessToken || typeof accessToken !== "string") {
      return res.status(400).json({
        success: false,
        error: "Pi access token is required"
      });
    }

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment amount"
      });
    }

    if (paymentAmount > 0.01) {
      return res.status(400).json({
        success: false,
        error: "Testnet payment amount cannot exceed 0.01 Pi"
      });
    }

    const apiKey = process.env.PI_TESTNET_API_KEY;
    const walletPrivateSeed = process.env.PI_TESTNET_WALLET_SECRET;

    if (!apiKey || !walletPrivateSeed) {
      return res.status(500).json({
        success: false,
        error: "Pi Testnet server credentials are not configured"
      });
    }

    /*
     * STEP 1 — Verify Pi user.
     * Never trust a UID supplied by the browser.
     */
    let meResponse;

    try {
      meResponse = await fetch(PI_ME_URL, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`
        }
      });
    } catch (error) {
      console.error("PI_STAGE", {
        stage: "VERIFY_USER_REQUEST",
        message: error?.message || "Request failed"
      });

      return res.status(502).json({
        success: false,
        stage: "VERIFY_USER_REQUEST",
        error: "Could not contact Pi authentication API"
      });
    }

    let meData = null;

    try {
      meData = await meResponse.json();
    } catch {
      meData = null;
    }

    if (!meResponse.ok) {
      console.error("PI_STAGE", {
        stage: "VERIFY_USER_RESPONSE",
        status: meResponse.status
      });

      return res.status(401).json({
        success: false,
        stage: "VERIFY_USER_RESPONSE",
        status: meResponse.status,
        error: "Pi authentication could not be verified"
      });
    }

    const verifiedUser = meData?.user || meData;
    const verifiedUid = verifiedUser?.uid;
    const verifiedUsername = verifiedUser?.username || null;

    if (!verifiedUid || typeof verifiedUid !== "string") {
      return res.status(401).json({
        success: false,
        stage: "VERIFY_UID",
        error: "Verified Pi account did not return a UID"
      });
    }

    /*
     * STEP 2 — Initialize Pi backend SDK.
     */
    const pi = new PiNetwork(apiKey, walletPrivateSeed);

    /*
     * STEP 3 — Check incomplete server payments.
     */
    let incompletePayments;

    try {
      incompletePayments = await pi.getIncompleteServerPayments();
    } catch (error) {
      const safeError = safePiError(
        error,
        "GET_INCOMPLETE_SERVER_PAYMENTS"
      );

      console.error("PI_STAGE", safeError);

      return res.status(502).json({
        success: false,
        ...safeError
      });
    }

    /*
     * STEP 4 — Recover an existing incomplete payment first.
     */
    if (
      Array.isArray(incompletePayments) &&
      incompletePayments.length > 0
    ) {
      const pending = incompletePayments[0];

      if (!pending?.identifier) {
        return res.status(500).json({
          success: false,
          stage: "RECOVER_INCOMPLETE_PAYMENT",
          error: "Incomplete Pi payment has no identifier"
        });
      }

      let txid = pending?.transaction?.txid || null;

      if (!txid) {
        try {
          txid = await pi.submitPayment(pending.identifier);
        } catch (error) {
          const safeError = safePiError(
            error,
            "SUBMIT_INCOMPLETE_PAYMENT"
          );

          console.error("PI_STAGE", safeError);

          return res.status(502).json({
            success: false,
            ...safeError
          });
        }
      }

      try {
        const completedPayment = await pi.completePayment(
          pending.identifier,
          txid
        );

        return res.status(200).json({
          success: true,
          recovered: true,
          stage: "COMPLETE_INCOMPLETE_PAYMENT",
          paymentId: pending.identifier,
          txid,
          payment: completedPayment
        });
      } catch (error) {
        const safeError = safePiError(
          error,
          "COMPLETE_INCOMPLETE_PAYMENT"
        );

        console.error("PI_STAGE", safeError);

        return res.status(502).json({
          success: false,
          ...safeError
        });
      }
    }

    /*
     * STEP 5 — Create a new A2U Testnet payment.
     */
    const paymentData = {
      amount: paymentAmount,
      memo: "HAVKAR Testnet A2U",
      metadata: {
        app: "HAVKAR",
        type: "testnet_a2u"
      },
      uid: verifiedUid.trim()
    };

    let paymentId;

    try {
      paymentId = await pi.createPayment(paymentData);
    } catch (error) {
      const safeError = safePiError(error, "CREATE_PAYMENT");

      console.error("PI_STAGE", safeError);

      return res.status(502).json({
        success: false,
        ...safeError
      });
    }

    /*
     * STEP 6 — Submit payment to blockchain.
     */
    let txid;

    try {
      txid = await pi.submitPayment(paymentId);
    } catch (error) {
      const safeError = safePiError(error, "SUBMIT_PAYMENT");

      console.error("PI_STAGE", safeError);

      return res.status(502).json({
        success: false,
        ...safeError
      });
    }

    /*
     * STEP 7 — Complete payment with Pi.
     */
    let payment;

    try {
      payment = await pi.completePayment(paymentId, txid);
    } catch (error) {
      const safeError = safePiError(error, "COMPLETE_PAYMENT");

      console.error("PI_STAGE", safeError);

      return res.status(502).json({
        success: false,
        ...safeError
      });
    }

    return res.status(200).json({
      success: true,
      recovered: false,
      stage: "PAYMENT_COMPLETED",
      user: {
        uid: verifiedUid,
        username: verifiedUsername
      },
      paymentId,
      txid,
      payment
    });

  } catch (error) {
    /*
     * IMPORTANT:
     * Do NOT log the complete Axios error object.
     * It may contain sensitive request configuration.
     */
    console.error("PI_STAGE", {
      stage: "UNEXPECTED_ERROR",
      message: error?.message || "Unexpected error"
    });

    return res.status(500).json({
      success: false,
      stage: "UNEXPECTED_ERROR",
      error: error?.message || "Pi Testnet A2U payment failed"
    });
  }
}
