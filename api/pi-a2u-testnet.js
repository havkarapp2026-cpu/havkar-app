import PiNetwork from "pi-backend";

const PI_ME_URL = "https://api.minepi.com/v2/me";

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

    /*
     * Never trust a UID supplied directly by the browser.
     * Verify the Pi access token server-side and obtain
     * the real UID from Pi Platform API /v2/me.
     */
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

    /*
     * Safety limit for this temporary Testnet endpoint.
     */
    if (paymentAmount > 0.01) {
      return res.status(400).json({
        success: false,
        error: "Testnet payment amount cannot exceed 0.01 Pi"
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
     * Verify the user's access token directly with Pi.
     */
    const meResponse = await fetch(
      PI_ME_URL,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${accessToken.trim()}`
        }
      }
    );

    let meData = null;

    try {
      meData = await meResponse.json();
    } catch {
      meData = null;
    }

    if (!meResponse.ok) {
      return res.status(401).json({
        success: false,
        error:
          "Pi authentication could not be verified"
      });
    }

    /*
     * Pi /v2/me normally returns the user data.
     * Support both direct UserDTO and wrapped user shape
     * defensively.
     */
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
        error:
          "Verified Pi account did not return a UID"
      });
    }

    /*
     * Initialize official Pi backend SDK.
     * Credentials remain server-side only.
     */
    const pi = new PiNetwork(
      apiKey,
      walletPrivateSeed
    );

    /*
     * Pi permits only one incomplete server-side
     * payment at a time.
     *
     * Recover it before creating another A2U payment.
     */
    const incompletePayments =
      await pi.getIncompleteServerPayments();

    if (
      Array.isArray(incompletePayments) &&
      incompletePayments.length > 0
    ) {
      const pending =
        incompletePayments[0];

      if (!pending?.identifier) {
        throw new Error(
          "Incomplete Pi payment has no identifier"
        );
      }

      let txid =
        pending?.transaction?.txid || null;

      /*
       * If the blockchain transaction already exists,
       * only complete the existing payment.
       */
      if (txid) {
        const completedPayment =
          await pi.completePayment(
            pending.identifier,
            txid
          );

        return res.status(200).json({
          success: true,
          recovered: true,
          paymentId:
            pending.identifier,
          txid,
          payment:
            completedPayment
        });
      }

      /*
       * Otherwise submit the existing payment
       * and then complete it.
       */
      txid =
        await pi.submitPayment(
          pending.identifier
        );

      const completedPayment =
        await pi.completePayment(
          pending.identifier,
          txid
        );

      return res.status(200).json({
        success: true,
        recovered: true,
        paymentId:
          pending.identifier,
        txid,
        payment:
          completedPayment
      });
    }

    /*
     * No incomplete payment exists.
     * Create a new Testnet App-to-User payment
     * using ONLY the UID verified by Pi /v2/me.
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

    const paymentId =
      await pi.createPayment(
        paymentData
      );

    const txid =
      await pi.submitPayment(
        paymentId
      );

    const payment =
      await pi.completePayment(
        paymentId,
        txid
      );

    return res.status(200).json({
      success: true,
      recovered: false,
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
      "Pi Testnet A2U error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Pi Testnet A2U payment failed"
    });
  }
}
