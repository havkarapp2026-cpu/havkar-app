import { createClient } from "@supabase/supabase-js";
import {
    assertServerCredentialsAllowed,
    rejectIsolatedPreview
} from "./preview-isolation.cjs";

const REVIEW_DECISIONS = new Set([
    "needs_more_info",
    "rejected",
    "approved",
    "suspended",
    "revoked"
]);

export function reviewDecisionError(decision) {
    if (
        decision === "verified" ||
        decision === "identity_verified" ||
        decision === "publish"
    ) {
        return "This decision is not available.";
    }

    if (!REVIEW_DECISIONS.has(decision)) {
        return "Unknown decision.";
    }

    return "";
}

function bearerToken(req) {
    const header = req.headers?.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const authorization = typeof value === "string" ? value : "";

    if (!authorization.startsWith("Bearer ")) {
        return "";
    }

    return authorization.slice(7).trim();
}

function serviceClient() {
    assertServerCredentialsAllowed();

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null;
    }

    return createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        }
    );
}

export default async function handler(req, res) {
    if (rejectIsolatedPreview(res)) {
        return;
    }

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Method not allowed" });
    }

    const decisionError = reviewDecisionError(req.body?.decision);

    if (decisionError) {
        return res.status(400).json({ error: decisionError });
    }

    const propertyId = String(req.body?.propertyId || "").trim();
    const notes = String(req.body?.notes || "").slice(0, 2000);

    if (!/^[0-9a-f-]{36}$/i.test(propertyId)) {
        return res.status(400).json({ error: "Property not found." });
    }

    const accessToken = bearerToken(req);

    if (!accessToken) {
        return res.status(401).json({ error: "Authentication required" });
    }

    const admin = serviceClient();

    if (!admin) {
        return res.status(500).json({ error: "Server configuration error" });
    }

    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);

    if (userError || !userData?.user) {
        return res.status(401).json({ error: "Invalid or expired session" });
    }

    const { data: reviewer, error: reviewerError } = await admin
        .from("accommodation_reviewers")
        .select("user_id")
        .eq("user_id", userData.user.id)
        .eq("active", true)
        .maybeSingle();

    if (reviewerError) {
        return res.status(500).json({ error: "Reviewer lookup failed" });
    }

    if (!reviewer) {
        return res.status(403).json({ error: "Reviewer access is required." });
    }

    const { error: decisionFailure } = await admin.rpc("decide_accommodation_review", {
        p_actor: userData.user.id,
        p_property_id: propertyId,
        p_decision: req.body.decision,
        p_notes: notes
    });

    if (decisionFailure) {
        return res.status(409).json({ error: decisionFailure.message });
    }

    return res.status(200).json({
        ok: true,
        identityVerified: false
    });
}
