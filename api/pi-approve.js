function piAction(req) {
    const queryAction = req.query?.piAction;
    const action = Array.isArray(queryAction) ? queryAction[0] : queryAction;
    const path = typeof req.url === "string"
        ? req.url.split("?")[0]
        : "";

    if (action === "complete" || path.endsWith("/api/pi-complete")) {
        return "complete";
    }

    if (action) {
        return "unknown";
    }

    return "approve";
}

function readPiResponse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return {
            error: text || "Invalid response from Pi API"
        };
    }
}

export default async function handler(req, res) {
    if (process.env.HAVKAR_PI_PAYMENTS_ENABLED !== "true") {
        return res.status(404).json({
            error: "Not found"
        });
    }

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const action = piAction(req);

    if (action === "unknown") {
        return res.status(400).json({
            error: "Unknown Pi action"
        });
    }

    try {
        const { paymentId, txid } = req.body || {};

        if (!paymentId || typeof paymentId !== "string") {
            return res.status(400).json({
                error: "paymentId is required"
            });
        }

        if (action === "complete" && (!txid || typeof txid !== "string")) {
            return res.status(400).json({
                error: "txid is required"
            });
        }

        const apiKey = process.env.PI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "PI_API_KEY is not configured"
            });
        }

        const paymentUrl = `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/${action}`;
        const response = await fetch(paymentUrl, {
            method: "POST",
            headers: {
                "Authorization": `Key ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: action === "complete"
                ? JSON.stringify({ txid })
                : undefined
        });

        const data = readPiResponse(await response.text());

        return res.status(response.status).json(data);
    } catch (error) {
        console.error(
            action === "complete" ? "Pi completion error:" : "Pi approval error:",
            error
        );

        return res.status(500).json({
            error: "Internal server error"
        });
    }
}
