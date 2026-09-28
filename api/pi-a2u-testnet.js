import PiNetwork from "pi-backend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const { uid, amount = 0.01 } = req.body || {};

    if (!uid || typeof uid !== "string") {
      return res.status(400).json({
        success: false,
        error: "Pi user uid is required"
      });
    }

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment amount"
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

    const pi = new PiNetwork(apiKey, walletPrivateSeed);

    const paymentData = {
      amount: paymentAmount,
      memo: "HAVKAR Testnet A2U",
      metadata: {
        app: "HAVKAR",
        type: "testnet_a2u"
      },
      uid: uid.trim()
    };

    const paymentId = await pi.createPayment(paymentData);

    const txid = await pi.submitPayment(paymentId);

    const payment = await pi.completePayment(
      paymentId,
      txid
    );

    return res.status(200).json({
      success: true,
      paymentId,
      txid,
      payment
    });

  } catch (error) {
    console.error("Pi Testnet A2U error:", error);

    return res.status(500).json({
      success: false,
      error: error?.message || "Pi Testnet A2U payment failed"
    });
  }
}
