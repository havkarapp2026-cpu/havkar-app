const {
  resolveShare,
  dispatchReminders,
  cronAuthorized
} = require("../lib/travel-life-api.cjs");

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  const body = req.method === "GET" ? req.query || {} : readBody(req);
  const action = String(body.action || req.query.action || "").trim();

  try {
    if (action === "resolve_share" || action === "share") {
      const token = body.token || body.share_token || req.query.token;
      const out = await resolveShare(token, process.env);
      res.status(out.status || (out.ok ? 200 : 404)).json(out);
      return;
    }

    if (action === "dispatch_reminders") {
      const auth = cronAuthorized(req, process.env);
      if (!auth.ok) {
        res.status(401).json({ ok: false, error: auth.error });
        return;
      }
      const out = await dispatchReminders(
        { dry_run: body.dry_run === true || body.dry_run === "true" },
        process.env
      );
      res.status(out.status || (out.ok ? 200 : 500)).json(out);
      return;
    }

    if (action === "status") {
      res.status(200).json({
        ok: true,
        actions: ["resolve_share", "dispatch_reminders", "status"],
        cron_secret_configured: Boolean(
          process.env.HAVKAR_TRAVEL_REMINDER_CRON_SECRET || process.env.CRON_SECRET
        ),
        resend_configured: Boolean(process.env.RESEND_API_KEY),
        honesty:
          "Share resolve is public only for opt-in unexpired tokens. Reminder email is opt-in and cron-gated."
      });
      return;
    }

    res.status(400).json({ ok: false, error: "unknown_action" });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String((err && err.message) || err || "travel_life_error")
    });
  }
};
