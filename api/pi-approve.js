export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    try {
        const { paymentId } = req.body || {};

        if (!paymentId || typeof paymentId !== "string") {
            return res.status(400).json({
                error: "paymentId is required"
            });
        }

        const apiKey = process.env.PI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "PI_API_KEY is not configured"
            });
        }

        const response = await fetch(
            `https://api.minepi.com/v2/payments/${encodeURIComponent(paymentId)}/approve`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Key ${apiKey}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const text = await response.text();

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            data = {
                error: text || "Invalid response from Pi API"
            };
        }

        return res.status(response.status).json(data);

    } catch (error) {
        console.error("Pi approval error:", error);

        return res.status(500).json({
            error: "Internal server error"
        });
    }
}
