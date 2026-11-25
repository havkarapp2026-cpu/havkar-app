/**
 * Travel Life server API: share resolve + anniversary reminders (opt-in email).
 * No real payments. Dedupes reminder sends. Requires service role + optional RESEND.
 */
const { createClient } = require("@supabase/supabase-js");

function env(name, source) {
  const e = source || process.env;
  return String(e[name] || "").trim();
}

function adminClient(source) {
  const e = source || process.env;
  const url = env("SUPABASE_URL", e) || env("NEXT_PUBLIC_SUPABASE_URL", e);
  const key = env("SUPABASE_SERVICE_ROLE_KEY", e) || env("SUPABASE_SERVICE_KEY", e);
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function cronAuthorized(req, source) {
  const e = source || process.env;
  const secret = env("HAVKAR_TRAVEL_REMINDER_CRON_SECRET", e) || env("CRON_SECRET", e);
  if (!secret) return { ok: false, error: "cron_secret_not_configured" };
  const header = String(
    (req.headers && (req.headers["x-havkar-cron-secret"] || req.headers.authorization)) || ""
  ).trim();
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : header;
  const bodySecret =
    req.body && typeof req.body.cron_secret === "string" ? req.body.cron_secret : "";
  if (bearer === secret || bodySecret === secret) return { ok: true };
  return { ok: false, error: "unauthorized" };
}

async function resolveShare(token, source) {
  const client = adminClient(source);
  if (!client) {
    return { ok: false, error: "supabase_unavailable", status: 500 };
  }
  const { data, error } = await client.rpc("havkar_resolve_trip_share", {
    p_token: String(token || "").trim()
  });
  if (error) {
    return {
      ok: false,
      error: error.message || "resolve_failed",
      status: 500,
      migration_pending: /havkar_resolve_trip_share|function/i.test(String(error.message || ""))
    };
  }
  if (!data || data.ok !== true) {
    return { ok: false, error: (data && data.error) || "not_found", status: 404 };
  }
  return { ok: true, status: 200, ...data };
}

async function sendResendEmail({ to, subject, html, text }, source) {
  const key = env("RESEND_API_KEY", source);
  if (!key) return { ok: false, error: "RESEND_API_KEY_missing" };
  const from =
    env("HAVKAR_TRAVEL_EMAIL_FROM", source) ||
    env("HAVKAR_EMAIL_FROM", source) ||
    "HAVKAR Travel <noreply@havkar.online>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to: [to], subject, html, text })
  });
  if (!response.ok) {
    const body = await response.text().catch(function () {
      return "";
    });
    return { ok: false, error: "resend_failed", detail: body.slice(0, 200) };
  }
  return { ok: true };
}

function anniversaryMatch(startedAt, now) {
  if (!startedAt) return false;
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate()
    && d.getUTCFullYear() < now.getUTCFullYear();
}

async function dispatchReminders(opts, source) {
  const e = source || process.env;
  const client = adminClient(e);
  if (!client) return { ok: false, error: "supabase_unavailable", status: 500 };

  const dryRun = opts && opts.dry_run === true;
  const now = new Date();
  const year = now.getUTCFullYear();

  const prefsRes = await client
    .from("user_reminder_prefs")
    .select("*")
    .or("trip_anniversary.eq.true,yearly_recap.eq.true,album_memories.eq.true");

  if (prefsRes.error) {
    return {
      ok: false,
      error: prefsRes.error.message,
      status: 500,
      migration_pending: /user_reminder_prefs/i.test(String(prefsRes.error.message || ""))
    };
  }

  const prefs = prefsRes.data || [];
  let considered = 0;
  let inApp = 0;
  let emailed = 0;
  let skipped = 0;
  const samples = [];

  for (let i = 0; i < prefs.length; i++) {
    const p = prefs[i];
    if (!p || !p.user_id) continue;
    if (!p.in_app_enabled && !p.email_enabled && !p.push_enabled) {
      skipped += 1;
      continue;
    }

    const tripsRes = await client
      .from("user_trips")
      .select("id,title,started_at,distance_m,status")
      .eq("user_id", p.user_id)
      .eq("status", "completed")
      .not("started_at", "is", null)
      .limit(200);

    if (tripsRes.error) continue;
    const trips = tripsRes.data || [];

    for (let t = 0; t < trips.length; t++) {
      const trip = trips[t];
      if (!p.trip_anniversary || !anniversaryMatch(trip.started_at, now)) continue;
      considered += 1;

      if (p.in_app_enabled) {
        const exists = await client
          .from("travel_reminder_dispatch")
          .select("id")
          .eq("user_id", p.user_id)
          .eq("trip_id", trip.id)
          .eq("kind", "trip_anniversary")
          .eq("channel", "in_app")
          .eq("year", year)
          .maybeSingle();
        if (!exists.data) {
          if (!dryRun) {
            await client.from("notifications").insert({
              user_id: p.user_id,
              type: "travel_anniversary",
              title: "Travel memory",
              message:
                "One year ago: " +
                (trip.title || "your trip") +
                ". Open Tickets → My trips to revisit.",
              action_url: "/tickets.html#mode-mytrips",
              reference_id: String(trip.id),
              metadata: { kind: "trip_anniversary", year: year }
            });
            await client.from("travel_reminder_dispatch").insert({
              user_id: p.user_id,
              trip_id: trip.id,
              kind: "trip_anniversary",
              channel: "in_app",
              year: year
            });
          }
          inApp += 1;
          if (samples.length < 5) {
            samples.push({ channel: "in_app", trip_id: trip.id, dry_run: dryRun });
          }
        } else {
          skipped += 1;
        }
      }

      if (p.email_enabled) {
        const exists = await client
          .from("travel_reminder_dispatch")
          .select("id")
          .eq("user_id", p.user_id)
          .eq("trip_id", trip.id)
          .eq("kind", "trip_anniversary")
          .eq("channel", "email")
          .eq("year", year)
          .maybeSingle();
        if (exists.data) {
          skipped += 1;
          continue;
        }
        const userRes = await client.auth.admin.getUserById(p.user_id);
        const email =
          userRes &&
          userRes.data &&
          userRes.data.user &&
          userRes.data.user.email;
        if (!email) {
          skipped += 1;
          continue;
        }
        if (!dryRun) {
          const mail = await sendResendEmail(
            {
              to: email,
              subject: "HAVKAR travel memory",
              text:
                "One year ago you recorded “" +
                (trip.title || "a trip") +
                "” in HAVKAR. Open My trips to revisit. Unsubscribe: Tickets → Reminders (email off).",
              html:
                "<p>One year ago you recorded <strong>" +
                String(trip.title || "a trip").replace(/[<>&]/g, "") +
                "</strong> in HAVKAR.</p><p><a href=\"https://havkar.online/tickets.html#mode-mytrips\">Open My trips</a></p><p>Email reminders stay opt-in. Disable anytime in Tickets → Reminders.</p>"
            },
            e
          );
          if (!mail.ok) {
            samples.push({ channel: "email", error: mail.error, trip_id: trip.id });
            continue;
          }
          await client.from("travel_reminder_dispatch").insert({
            user_id: p.user_id,
            trip_id: trip.id,
            kind: "trip_anniversary",
            channel: "email",
            year: year
          });
        }
        emailed += 1;
        if (samples.length < 8) {
          samples.push({ channel: "email", trip_id: trip.id, dry_run: dryRun });
        }
      }
    }
  }

  return {
    ok: true,
    status: 200,
    dry_run: dryRun,
    considered: considered,
    in_app_sent: inApp,
    email_sent: emailed,
    skipped: skipped,
    resend_configured: Boolean(env("RESEND_API_KEY", e)),
    samples: samples,
    honesty:
      "Reminders require opt-in prefs. Email needs RESEND_API_KEY + cron secret. No duplicate year/channel sends."
  };
}

module.exports = {
  resolveShare,
  dispatchReminders,
  cronAuthorized,
  anniversaryMatch
};
