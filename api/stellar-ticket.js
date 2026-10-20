import { createStellarTicketRequestHandler } from "../lib/stellar-ticket-payment.mjs";
import { createSupabaseProjectRefHandler } from "../lib/supabase-project-ref.mjs";

const ACTIONS = ["intent", "prepare", "submit", "status"];
const PROJECT_REF_ACTION = "project-ref";
const projectRefHandler = createSupabaseProjectRefHandler();

const handlers = {
    intent: createStellarTicketRequestHandler("intent"),
    prepare: createStellarTicketRequestHandler("prepare"),
    submit: createStellarTicketRequestHandler("submit"),
    status: createStellarTicketRequestHandler("status"),
};

function requestPath(value) {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string") return "";
    return text.split("?")[0];
}

function stellarQueryAction(req) {
    const queryAction = req.query?.stellarAction;
    const fromQuery = Array.isArray(queryAction) ? queryAction[0] : queryAction;
    if (typeof fromQuery === "string" && fromQuery) return fromQuery;

    const url = typeof req.url === "string" ? req.url : "";
    const queryIndex = url.indexOf("?");
    if (queryIndex === -1) return "";

    return new URLSearchParams(url.slice(queryIndex + 1)).get("stellarAction") || "";
}

export function stellarRoute(req) {
    const urlPath = requestPath(req.url);

    if (urlPath.endsWith("/api/stellar-ticket-intent")) return "intent";
    if (urlPath.endsWith("/api/stellar-ticket-prepare")) return "prepare";
    if (urlPath.endsWith("/api/stellar-ticket-submit")) return "submit";
    if (urlPath.endsWith("/api/stellar-ticket-status")) return "status";

    const matchedPath = requestPath(req.headers?.["x-matched-path"]);
    const invokePath = requestPath(req.headers?.["x-invoke-path"]);
    if (
        urlPath.endsWith("/api/supabase-project-ref") ||
        matchedPath.endsWith("/api/supabase-project-ref") ||
        invokePath.endsWith("/api/supabase-project-ref")
    ) {
        return PROJECT_REF_ACTION;
    }

    const action = stellarQueryAction(req);
    if (action === PROJECT_REF_ACTION) return PROJECT_REF_ACTION;
    if (ACTIONS.includes(action)) return action;
    return "";
}

export default async function handler(req, res) {
    const action = stellarRoute(req);

    if (action === PROJECT_REF_ACTION) {
        return projectRefHandler(req, res);
    }

    const selected = handlers[action];

    if (!selected) {
        return res.status(404).json({
            ok: false,
            error: "Not found",
        });
    }

    return selected(req, res);
}
