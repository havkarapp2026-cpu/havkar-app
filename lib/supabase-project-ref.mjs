import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = /^[a-z0-9]{20}$/;

export function supabaseProjectRef(url) {
    let hostname = "";

    try {
        hostname = new URL(String(url || "")).hostname.toLowerCase();
    } catch {
        return "";
    }

    if (!hostname.endsWith(".supabase.co")) return "";

    const ref = hostname.slice(0, -".supabase.co".length);
    if (!PROJECT_REF.test(ref)) return "";
    return ref;
}

function headerValue(value) {
    const text = Array.isArray(value) ? value[0] : value;
    return typeof text === "string" ? text.trim() : "";
}

function sessionToken(headers) {
    const custom = headerValue(headers?.["x-havkar-session"]);
    if (custom) {
        if (custom.length <= 8192 && !/\s/.test(custom)) return custom;
        return "";
    }

    const authorization = headerValue(headers?.authorization);
    if (!authorization.startsWith("Bearer ")) return "";
    const token = authorization.slice(7).trim();
    if (!token || /\s/.test(token)) return "";
    return token;
}

export function createSupabaseProjectRefHandler(deps = {}) {
    return async function supabaseProjectRefHandler(req, res) {
        res.setHeader("Cache-Control", "private, no-store");

        if (req.method !== "GET") {
            res.setHeader("Allow", "GET");
            return res.status(405).json({
                ok: false,
                error: "Method not allowed",
            });
        }

        const token = sessionToken(req.headers);
        if (!token) {
            return res.status(401).json({
                ok: false,
                error: "Authentication required",
            });
        }

        const env = deps.env || process.env;
        const projectRef = supabaseProjectRef(env.SUPABASE_URL);
        if (!projectRef || !env.SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({
                ok: false,
                error: "Server configuration error",
            });
        }

        try {
            const admin = deps.admin || createClient(
                env.SUPABASE_URL,
                env.SUPABASE_SERVICE_ROLE_KEY,
                { auth: { persistSession: false, autoRefreshToken: false } }
            );
            const { data, error } = await admin.auth.getUser(token);
            if (error || !data?.user?.id) {
                return res.status(401).json({
                    ok: false,
                    error: "Authentication required",
                });
            }
        } catch {
            return res.status(401).json({
                ok: false,
                error: "Authentication required",
            });
        }

        return res.status(200).json({
            ok: true,
            project_ref: projectRef,
        });
    };
}
