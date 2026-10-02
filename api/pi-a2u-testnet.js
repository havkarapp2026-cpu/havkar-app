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

function getPaymentTxid(payment) {
  return (
    payment?.transaction?.txid ||
    payment?.transaction?.tx_id ||
    null
  );
}

/*
 * Handle an already-existing A2U payment safely.
 *
 * 1. If it already has a blockchain transaction:
 *    complete it.
 *
 * 2. If it has no blockchain transaction:
 *    cancel it.
 *
 * IMPORTANT:
 * We deliberately do NOT call submitPayment()
 * for an old/incomplete payment here.
 */
async function resolveExistingPayment(pi, payment) {
  if (!payment?.identifier) {
    throw new Error("Existing Pi payment has no identifier");
  }

  const paymentId = payment.identifier;
  const txid = getPaymentTxid(payment);

  if (txid) {
    const completedPayment =
      await pi.completePayment(paymentId, txid);

    return {
      action: "completed",
      paymentId,
      txid,
      payment: completedPayment
    };
  }

  const cancelledPayment =
    await pi.cancelPayment(paymentId);

  return {
    action: "cancelled",
    paymentId,
    txid: null,
    payment: cancelledPayment
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
    const {
      accessToken,
      amount = 0.01
    } = req.body || {};

    if (
      !accessToken ||
      typeof accessToken !== "string"
    ) {
      return res.status(400).json({
        success: false,
        error: "Pi access token is required"
      });
    }

    const paymentAmount = Number(amount);

    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment amount"
      });
    }

    if (paymentAmount > 0.01) {
      return res.status(400).json({
        success: false,
        error:
          "Testnet payment amount cannot exceed 0.01 Pi"
      });
    }

    const apiKey =
      process.env.PI_TESTNET_API_KEY;

    const walletPrivateSeed =
      process.env.PI_TESTNET_WALLET_SECRET;

    if (!apiKey || !walletPrivateSeed) {
      return res.status(500).json({
        success: false,
        error:
          "Pi Testnet server credentials are not configured"
      });
    }

    /*
     * STEP 1
     * Verify Pi access token server-side.
     */

    let meResponse;

    try {
      meResponse = await fetch(
        PI_ME_URL,
        {
          method: "GET",
          headers: {
            Authorization:
              `Bearer ${accessToken.trim()}`
          }
        }
      );
    } catch (error) {
      console.error(
        "PI_STAGE",
        {
          stage: "VERIFY_USER_REQUEST",
          message:
            error?.message ||
            "Request failed"
        }
      );

      return res.status(502).json({
        success: false,
        stage: "VERIFY_USER_REQUEST",
        error:
          "Could not contact Pi authentication API"
      });
    }

    let meData = null;

    try {
      meData = await meResponse.json();
    } catch {
      meData = null;
    }

    if (!meResponse.ok) {
      console.error(
        "PI_STAGE",
        {
          stage: "VERIFY_USER_RESPONSE",
          status: meResponse.status
        }
      );

      return res.status(401).json({
        success: false,
        stage: "VERIFY_USER_RESPONSE",
        status: meResponse.status,
        error:
          "Pi authentication could not be verified"
      });
    }

    const verifiedUser =
      meData?.user || meData;

    const verifiedUid =
      verifiedUser?.uid;

    const verifiedUsername =
      verifiedUser?.username || null;

    if (
      !verifiedUid ||
      typeof verifiedUid !== "string"
    ) {
      return res.status(401).json({
        success: false,
        stage: "VERIFY_UID",
        error:
          "Verified Pi account did not return a UID"
      });
    }

    /*
     * STEP 2
     * Initialize Pi backend SDK.
     */

    const pi = new PiNetwork(
      apiKey,
      walletPrivateSeed
    );

    /*
     * STEP 3
     * Check for incomplete server payments first.
     */

    let incompletePayments = [];

    try {
      incompletePayments =
        await pi.getIncompleteServerPayments();
    } catch (error) {
      const safeError =
        safePiError(
          error,
          "GET_INCOMPLETE_SERVER_PAYMENTS"
        );

      console.error(
        "PI_STAGE",
        safeError
      );

      return res.status(502).json({
        success: false,
        ...safeError
      });
    }

    /*
     * STEP 4
     * Resolve the first incomplete payment.
     *
     * No transaction:
     * CANCEL it.
     *
     * Existing transaction:
     * COMPLETE it.
     */

    if (
      Array.isArray(incompletePayments) &&
      incompletePayments.length > 0
    ) {
      const pending =
        incompletePayments[0];

      try {
        const resolved =
          await resolveExistingPayment(
            pi,
            pending
          );

        if (
          resolved.action === "cancelled"
        ) {
          console.log(
            "PI_STAGE",
            {
              stage:
                "CANCELLED_INCOMPLETE_PAYMENT",
              paymentId:
                resolved.paymentId
            }
          );

          return res.status(200).json({
            success: true,
            recovered: true,
            cancelled: true,
            retryRequired: true,
            stage:
              "CANCELLED_INCOMPLETE_PAYMENT",
            message:
              "Old incomplete payment was cancelled. Send again to create a fresh payment.",
            user: {
              uid: verifiedUid,
              username:
                verifiedUsername
            },
            paymentId:
              resolved.paymentId
          });
        }

        console.log(
          "PI_STAGE",
          {
            stage:
              "COMPLETED_INCOMPLETE_PAYMENT",
            paymentId:
              resolved.paymentId
          }
        );

        return res.status(200).json({
          success: true,
          recovered: true,
          cancelled: false,
          retryRequired: false,
          stage:
            "COMPLETED_INCOMPLETE_PAYMENT",
          user: {
            uid: verifiedUid,
            username:
              verifiedUsername
          },
          ...resolved
        });

      } catch (error) {
        const safeError =
          safePiError(
            error,
            "RESOLVE_INCOMPLETE_PAYMENT"
          );

        console.error(
          "PI_STAGE",
          safeError
        );

        return res.status(502).json({
          success: false,
          ...safeError
        });
      }
    }

    /*
     * STEP 5
     * No incomplete payment returned.
     * Try to create a fresh A2U payment.
     */

    const paymentData = {
      amount: paymentAmount,

      memo:
        "HAVKAR Testnet A2U",

      metadata: {
        app: "HAVKAR",
        type: "testnet_a2u"
      },

      uid:
        verifiedUid.trim()
    };

    let paymentId;

    try {
      paymentId =
        await pi.createPayment(
          paymentData
        );
    } catch (error) {
      const piData =
        error?.response?.data;

      const ongoingPayment =
        piData?.payment || null;

      /*
       * Pi can return the exact existing payment
       * through ongoing_payment_found even when
       * getIncompleteServerPayments() returned none.
       */
      if (
        piData?.error ===
          "ongoing_payment_found" &&
        ongoingPayment?.identifier
      ) {
        try {
          const resolved =
            await resolveExistingPayment(
              pi,
              ongoingPayment
            );

          if (
            resolved.action === "cancelled"
          ) {
            console.log(
              "PI_STAGE",
              {
                stage:
                  "CANCELLED_ONGOING_PAYMENT",
                paymentId:
                  resolved.paymentId
              }
            );

            return res.status(200).json({
              success: true,
              recovered: true,
              cancelled: true,
              retryRequired: true,
              stage:
                "CANCELLED_ONGOING_PAYMENT",
              message:
                "Old ongoing payment was cancelled. Send again to create a fresh payment.",
              user: {
                uid:
                  verifiedUid,
                username:
                  verifiedUsername
              },
              paymentId:
                resolved.paymentId
            });
          }

          console.log(
            "PI_STAGE",
            {
              stage:
                "COMPLETED_ONGOING_PAYMENT",
              paymentId:
                resolved.paymentId
            }
          );

          return res.status(200).json({
            success: true,
            recovered: true,
            cancelled: false,
            retryRequired: false,
            stage:
              "COMPLETED_ONGOING_PAYMENT",
            user: {
              uid:
                verifiedUid,
              username:
                verifiedUsername
            },
            ...resolved
          });

        } catch (recoveryError) {
          const recoverySafeError =
            safePiError(
              recoveryError,
              "RESOLVE_ONGOING_PAYMENT"
            );

          console.error(
            "PI_STAGE",
            recoverySafeError
          );

          return res.status(502).json({
            success: false,
            ...recoverySafeError
          });
        }
      }

      const safeError =
        safePiError(
          error,
          "CREATE_PAYMENT"
        );

      console.error(
        "PI_STAGE",
        safeError
      );

      return res.status(502).json({
        success: false,
        ...safeError
      });
    }

    /*
     * STEP 6
     * Submit fresh payment to Testnet.
     */

    let txid;

    try {
      txid =
        await pi.submitPayment(
          paymentId
        );
    } catch (error) {
      const safeError =
        safePiError(
          error,
          "SUBMIT_PAYMENT"
        );

      console.error(
        "PI_STAGE",
        safeError
      );

      return res.status(502).json({
        success: false,
        ...safeError
      });
    }

    /*
     * STEP 7
     * Complete fresh payment.
     */

    let payment;

    try {
      payment =
        await pi.completePayment(
          paymentId,
          txid
        );
    } catch (error) {
      const safeError =
        safePiError(
          error,
          "COMPLETE_PAYMENT"
        );

      console.error(
        "PI_STAGE",
        safeError
      );

      return res.status(502).json({
        success: false,
        ...safeError
      });
    }

    console.log(
      "PI_STAGE",
      {
        stage:
          "PAYMENT_COMPLETED",
        paymentId
      }
    );

    return res.status(200).json({
      success: true,
      recovered: false,
      cancelled: false,
      retryRequired: false,
      stage:
        "PAYMENT_COMPLETED",

      user: {
        uid:
          verifiedUid,
        username:
          verifiedUsername
      },

      paymentId,
      txid,
      payment
    });

  } catch (error) {
    console.error(
      "PI_STAGE",
      {
        stage:
          "UNEXPECTED_ERROR",
        message:
          error?.message ||
          "Unexpected error"
      }
    );

    return res.status(500).json({
      success: false,
      stage:
        "UNEXPECTED_ERROR",
      error:
        error?.message ||
        "Pi Testnet A2U payment failed"
    });
  }
}
