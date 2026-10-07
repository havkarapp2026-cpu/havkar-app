import { createClient } from "@supabase/supabase-js";

const FIELD_LIMITS = {
    business_name: 160,
    legal_name: 180,
    business_type: 40,
    vat_number: 80,
    country: 100,
    city: 120,
    address: 240,
    phone: 60,
    email: 180,
    website: 300,
    description: 2000,
    status: 40,
    id: 20,
    user_id: 36,
    submitted_at: 40
};

function createDefaultSupabase() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
        return null;
    }

    return createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });
}

function bearerToken(req) {
    const header = req.headers?.authorization
        ?? req.headers?.Authorization
        ?? "";
    const value = Array.isArray(header)
        ? String(header[0] || "")
        : String(header || "");

    if (!value.startsWith("Bearer ")) {
        return "";
    }

    return value.slice("Bearer ".length).trim();
}

function applicationIdFromBody(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return null;
    }

    const value = body.id;
    const numeric = typeof value === "number"
        ? value
        : typeof value === "string"
            ? Number(value)
            : NaN;

    if (!Number.isSafeInteger(numeric) || numeric < 1) {
        return null;
    }

    if (typeof value === "string" && String(numeric) !== value) {
        return null;
    }

    return numeric;
}

function clip(value, max) {
    if (value === null || value === undefined) {
        return "";
    }

    const text = String(value);

    return text.length > max ? text.slice(0, max) : text;
}

function clean(value, max) {
    const text = clip(value, max);

    if (!text) {
        return "—";
    }

    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function trustedReplyTo(email) {
    if (typeof email !== "string") {
        return undefined;
    }

    const value = email.trim();

    if (
        !value ||
        value.length > FIELD_LIMITS.email ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ) {
        return undefined;
    }

    return value;
}

function subjectName(value) {
    const text = clip(value, FIELD_LIMITS.business_name)
        .replace(/[\r\n]+/g, " ")
        .trim();

    return text || "—";
}

export function createBusinessNotificationHandler({
    fetchImpl = globalThis.fetch.bind(globalThis),
    createSupabase = createDefaultSupabase
} = {}) {
    return async function handler(req, res) {
        if (req.method !== "POST") {
            res.setHeader("Allow", ["POST"]);

            return res.status(405).json({
                ok: false,
                error: "Method not allowed"
            });
        }

        const accessToken = bearerToken(req);

        if (!accessToken) {
            return res.status(401).json({
                ok: false,
                error: "Authentication required"
            });
        }

        const supabase = createSupabase();

        if (!supabase) {
            console.error("Supabase server authentication is not configured.");

            return res.status(500).json({
                ok: false,
                error: "HAVKAR authentication service is not configured."
            });
        }

        const {
            data: userData,
            error: userError
        } = await supabase.auth.getUser(accessToken);

        if (userError || !userData?.user?.id) {
            return res.status(401).json({
                ok: false,
                error: "Invalid or expired session"
            });
        }

        const applicationId = applicationIdFromBody(req.body);

        if (!applicationId) {
            return res.status(400).json({
                ok: false,
                error: "Business application id is required."
            });
        }

        const userId = userData.user.id;

        const {
            data: application,
            error: applicationError
        } = await supabase
            .from("business_applications")
            .select("id,user_id,business_type,business_name,legal_name,vat_number,country,city,address,phone,email,website,description,status,submitted_at")
            .eq("id", applicationId)
            .eq("user_id", userId)
            .maybeSingle();

        if (applicationError) {
            console.error(
                "Business application lookup error:",
                applicationError.message || "lookup failed"
            );

            return res.status(500).json({
                ok: false,
                error: "Business application could not be verified."
            });
        }

        if (!application || String(application.user_id) !== String(userId)) {
            return res.status(404).json({
                ok: false,
                error: "Business application not found."
            });
        }

        if (!process.env.RESEND_API_KEY) {
            console.error("RESEND_API_KEY is not configured.");

            return res.status(500).json({
                ok: false,
                error: "HAVKAR email service is not configured."
            });
        }

        const {
            data: allowed,
            error: rateError
        } = await supabase.rpc("consume_business_notification_budget", {
            p_user_id: userId,
            p_application_id: applicationId
        });

        if (rateError || typeof allowed !== "boolean") {
            console.error(
                "Business notification rate limit error:",
                rateError?.message || "invalid rate limit result"
            );

            return res.status(500).json({
                ok: false,
                error: "Notification could not be sent."
            });
        }

        if (!allowed) {
            return res.status(429).json({
                ok: false,
                error: "Too many notification attempts. Please try again later."
            });
        }

        try {
            const businessName = clean(
                application.business_name,
                FIELD_LIMITS.business_name
            );
            const legalName = clean(
                application.legal_name,
                FIELD_LIMITS.legal_name
            );
            const businessType = clean(
                application.business_type,
                FIELD_LIMITS.business_type
            );
            const vatNumber = clean(
                application.vat_number,
                FIELD_LIMITS.vat_number
            );
            const country = clean(application.country, FIELD_LIMITS.country);
            const city = clean(application.city, FIELD_LIMITS.city);
            const address = clean(application.address, FIELD_LIMITS.address);
            const phone = clean(application.phone, FIELD_LIMITS.phone);
            const email = clean(application.email, FIELD_LIMITS.email);
            const website = clean(application.website, FIELD_LIMITS.website);
            const description = clean(
                application.description,
                FIELD_LIMITS.description
            );
            const status = clean(application.status, FIELD_LIMITS.status);
            const savedApplicationId = clean(application.id, FIELD_LIMITS.id);
            const savedUserId = clean(application.user_id, FIELD_LIMITS.user_id);
            const submittedAt = clean(
                application.submitted_at,
                FIELD_LIMITS.submitted_at
            );
            const subject = `New HAVKAR Business Application — ${subjectName(application.business_name)}`;
            const replyTo = trustedReplyTo(application.email);

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
                    ${savedApplicationId}
                </td>
            </tr>

            <tr>
                <td style="border-bottom:1px solid #eee;">
                    <strong>User ID</strong>
                </td>
                <td style="border-bottom:1px solid #eee;">
                    ${savedUserId}
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

            const message = {
                from: "HAVKAR <notifications@havkar.online>",
                to: ["info@havkar.online"],
                subject,
                html
            };

            if (replyTo) {
                message.reply_to = replyTo;
            }

            const response = await fetchImpl(
                "https://api.resend.com/emails",
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(message)
                }
            );

            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                console.error("Resend email error:", result?.message || response.status);

                return res.status(response.status || 500).json({
                    ok: false,
                    error: result?.message || "Email notification could not be sent."
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
                error instanceof Error ? error.message : "send failed"
            );

            return res.status(500).json({
                ok: false,
                error: "Internal email notification error."
            });
        }
    };
}

export default createBusinessNotificationHandler();
