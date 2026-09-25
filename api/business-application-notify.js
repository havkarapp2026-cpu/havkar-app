export default async function handler(req, res) {
    if (req.method !== "POST") {
        res.setHeader("Allow", ["POST"]);
        return res.status(405).json({
            ok: false,
            error: "Method not allowed"
        });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
        console.error("RESEND_API_KEY is not configured.");

        return res.status(500).json({
            ok: false,
            error: "HAVKAR email service is not configured."
        });
    }

    try {
        const application = req.body?.application;

        if (!application || typeof application !== "object") {
            return res.status(400).json({
                ok: false,
                error: "Business application data is required."
            });
        }

        const clean = (value) => {
            if (value === null || value === undefined || value === "") {
                return "—";
            }

            return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        const businessName =
            clean(application.business_name);

        const legalName =
            clean(application.legal_name);

        const businessType =
            clean(application.business_type);

        const vatNumber =
            clean(application.vat_number);

        const country =
            clean(application.country);

        const city =
            clean(application.city);

        const address =
            clean(application.address);

        const phone =
            clean(application.phone);

        const email =
            clean(application.email);

        const website =
            clean(application.website);

        const description =
            clean(application.description);

        const status =
            clean(application.status);

        const applicationId =
            clean(application.id);

        const userId =
            clean(application.user_id);

        const submittedAt =
            clean(application.submitted_at);

        const subject =
            `New HAVKAR Business Application — ${businessName}`;

        const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>

<body style="
    margin:0;
    padding:0;
    background:#f4f7f4;
    font-family:Arial,Helvetica,sans-serif;
    color:#222;
">

<div style="
    max-width:680px;
    margin:30px auto;
    background:#ffffff;
    border-radius:14px;
    overflow:hidden;
    border:1px solid #e1e7e1;
">

    <div style="
        background:#689f38;
        color:#ffffff;
        padding:24px;
        text-align:center;
    ">
        <h1 style="
            margin:0;
            font-size:26px;
        ">
            HAVKAR
        </h1>

        <p style="
            margin:7px 0 0;
            font-size:15px;
        ">
            New Business Account Application
        </p>
    </div>

    <div style="padding:26px;">

        <p style="
            font-size:16px;
            margin-top:0;
        ">
            A new business account application has been submitted through HAVKAR.
        </p>

        <table
            width="100%"
            cellpadding="10"
            cellspacing="0"
            style="
                border-collapse:collapse;
                font-size:14px;
            "
        >

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Business name</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${businessName}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Legal name</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${legalName}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Account type</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${businessType}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>VAT / Registration</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${vatNumber}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Country</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${country}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>City</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${city}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Address</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${address}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Phone</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${phone}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Business email</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${email}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Website</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${website}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Status</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${status}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>Application ID</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${applicationId}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>User ID</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${userId}
                </td>
            </tr>

            <tr>
                <td>
                    <strong>Submitted</strong>
                </td>
                <td>
                    ${submittedAt}
                </td>
            </tr>

        </table>

        <div style="
            margin-top:24px;
            padding:16px;
            background:#f5f8f3;
            border-radius:8px;
        ">
            <strong>Business description</strong>

            <p style="
                margin-bottom:0;
                line-height:1.6;
                white-space:pre-wrap;
            ">
                ${description}
            </p>
        </div>

    </div>

    <div style="
        padding:18px;
        text-align:center;
        background:#f5f8f3;
        color:#777;
        font-size:12px;
    ">
        HAVKAR Business Account System
    </div>

</div>

</body>
</html>
        `;

        const response = await fetch(
            "https://api.resend.com/emails",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Bearer ${RESEND_API_KEY}`,

                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    from:
                        "HAVKAR <notifications@havkar.online>",

                    to: [
                        "info@havkar.online"
                    ],

                    reply_to:
                        application.email || undefined,

                    subject,

                    html
                })
            }
        );

        const result =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error(
                "Resend email error:",
                result
            );

            return res.status(response.status || 500).json({
                ok: false,
                error:
                    result?.message ||
                    "Email notification could not be sent."
            });
        }

        return res.status(200).json({
            ok: true,
            emailId: result.id || null
        });
    }
    catch (error) {
        console.error(
            "Business application notification error:",
            error
        );

        return res.status(500).json({
            ok: false,
            error:
                "Internal email notification error."
        });
    }
}
