import { createStellarTicketRequestHandler } from "../lib/stellar-ticket-payment.mjs";

const ACTIONS = ["intent", "prepare", "submit", "status"];

const handlers = {
    intent: createStellarTicketRequestHandler("intent"),
    prepare: createStellarTicketRequestHandler("prepare"),
    submit: createStellarTicketRequestHandler("submit"),
    status: createStellarTicketRequestHandler("status"),
};

export function stellarRoute(req) {
    const path = typeof req.url === "string"
        ? req.url.split("?")[0]
        : "";

    if (path.endsWith("/api/stellar-ticket-intent")) return "intent";
    if (path.endsWith("/api/stellar-ticket-prepare")) return "prepare";
    if (path.endsWith("/api/stellar-ticket-submit")) return "submit";
    if (path.endsWith("/api/stellar-ticket-status")) return "status";

    const queryAction = req.query?.stellarAction;
    const action = Array.isArray(queryAction) ? queryAction[0] : queryAction;

    if (ACTIONS.includes(action)) return action;
    return "";
}

export default async function handler(req, res) {
    const action = stellarRoute(req);
    const selected = handlers[action];

    if (!selected) {
        return res.status(404).json({
            ok: false,
            error: "Not found",
        });
    }

    return selected(req, res);
}
