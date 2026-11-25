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
  const vercelCron = String(
    (req &&
      req.headers &&
      (req.headers["x-vercel-cron"] || req.headers["X-Vercel-Cron"])) ||
      ""
  );
  if (vercelCron === "1") {
    return { ok: true, mode: "vercel_cron" };
  }

  const secret = env("HAVKAR_TRAVEL_REMINDER_CRON_SECRET", e) || env("CRON_SECRET", e);
  if (!secret) return { ok: false, error: "cron_secret_not_configured" };

  const authHeader = String(
    (req.headers &&
      (req.headers.authorization ||
        req.headers.Authorization ||
        req.headers["x-havkar-cron-secret"])) ||
      ""
  ).trim();
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : authHeader;
  const bodySecret =
    req.body && typeof req.body.cron_secret === "string" ? req.body.cron_secret : "";
  if (bearer === secret || bodySecret === secret) {
    return { ok: true, mode: "cron_secret" };
  }
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
  return (
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate() &&
    d.getUTCFullYear() < now.getUTCFullYear()
  );
}

function escapeHtml(s) {
  return String(s || "").replace(/[<>&]/g, "");
}

async function alreadySent(client, userId, tripId, kind, channel, year) {
  let q = client
    .from("travel_reminder_dispatch")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("channel", channel)
    .eq("year", year);
  if (tripId) q = q.eq("trip_id", tripId);
  else q = q.is("trip_id", null);
  const exists = await q.maybeSingle();
  return Boolean(exists.data);
}

async function markSent(client, userId, tripId, kind, channel, year) {
  return client.from("travel_reminder_dispatch").insert({
    user_id: userId,
    trip_id: tripId || null,
    kind: kind,
    channel: channel,
    year: year
  });
}

async function sendInApp(client, { userId, type, title, message, actionUrl, referenceId, metadata }) {
  return client.from("notifications").insert({
    user_id: userId,
    type: type,
    title: title,
    message: message,
    action_url: actionUrl,
    reference_id: referenceId ? String(referenceId) : null,
    metadata: metadata || {}
  });
}

async function userEmail(client, userId) {
  const userRes = await client.auth.admin.getUserById(userId);
  return (
    (userRes &&
      userRes.data &&
      userRes.data.user &&
      userRes.data.user.email) ||
    null
  );
}

async function dispatchChannel(client, opts) {
  const {
    p,
    dryRun,
    kind,
    trip,
    year,
    title,
    message,
    emailSubject,
    emailText,
    emailHtml,
    samples,
    counters
  } = opts;
  const tripId = trip && trip.id ? trip.id : null;

  if (p.in_app_enabled) {
    const dup = await alreadySent(client, p.user_id, tripId, kind, "in_app", year);
    if (!dup) {
      if (!dryRun) {
        await sendInApp(client, {
          userId: p.user_id,
          type: "travel_" + kind,
          title: title,
          message: message,
          actionUrl: "/tickets.html#mode-mytrips",
          referenceId: tripId,
          metadata: { kind: kind, year: year }
        });
        await markSent(client, p.user_id, tripId, kind, "in_app", year);
      }
      counters.inApp += 1;
      if (samples.length < 8) {
        samples.push({ channel: "in_app", kind: kind, trip_id: tripId, dry_run: dryRun });
      }
    } else {
      counters.skipped += 1;
    }
  }

  if (p.email_enabled) {
    const dup = await alreadySent(client, p.user_id, tripId, kind, "email", year);
    if (dup) {
      counters.skipped += 1;
      return;
    }
    const email = await userEmail(client, p.user_id);
    if (!email) {
      counters.skipped += 1;
      return;
    }
    if (!dryRun) {
      const mail = await sendResendEmail(
        {
          to: email,
          subject: emailSubject,
          text: emailText,
          html: emailHtml
        },
        opts.source
      );
      if (!mail.ok) {
        samples.push({ channel: "email", kind: kind, error: mail.error, trip_id: tripId });
        return;
      }
      await markSent(client, p.user_id, tripId, kind, "email", year);
    }
    counters.emailed += 1;
    if (samples.length < 10) {
      samples.push({ channel: "email", kind: kind, trip_id: tripId, dry_run: dryRun });
    }
  }
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
  const counters = { considered: 0, inApp: 0, emailed: 0, skipped: 0 };
  const samples = [];

  for (let i = 0; i < prefs.length; i++) {
    const p = prefs[i];
    if (!p || !p.user_id) continue;
    if (!p.in_app_enabled && !p.email_enabled) {
      counters.skipped += 1;
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

    if (p.trip_anniversary) {
      for (let t = 0; t < trips.length; t++) {
        const trip = trips[t];
        if (!anniversaryMatch(trip.started_at, now)) continue;
        counters.considered += 1;
        const label = trip.title || "your trip";
        await dispatchChannel(client, {
          p: p,
          dryRun: dryRun,
          kind: "trip_anniversary",
          trip: trip,
          year: year,
          title: "Travel memory",
          message:
            "One year ago: " + label + ". Open Tickets → My trips to revisit.",
          emailSubject: "HAVKAR travel memory",
          emailText:
            "One year ago you recorded “" +
            label +
            "” in HAVKAR. Open My trips to revisit. Unsubscribe: Tickets → Reminders (email off).",
          emailHtml:
            "<p>One year ago you recorded <strong>" +
            escapeHtml(label) +
            '</strong> in HAVKAR.</p><p><a href="https://havkar.online/tickets.html#mode-mytrips">Open My trips</a></p><p>Email reminders stay opt-in. Disable anytime in Tickets → Reminders.</p>',
          samples: samples,
          counters: counters,
          source: e
        });
      }
    }

    if (p.album_memories) {
      for (let t = 0; t < trips.length; t++) {
        const trip = trips[t];
        if (!anniversaryMatch(trip.started_at, now)) continue;
        const mediaRes = await client
          .from("trip_media")
          .select("id", { count: "exact", head: true })
          .eq("trip_id", trip.id)
          .eq("user_id", p.user_id);
        const mediaCount = (mediaRes && mediaRes.count) || 0;
        if (!mediaCount) continue;
        counters.considered += 1;
        const label = trip.title || "your trip album";
        await dispatchChannel(client, {
          p: p,
          dryRun: dryRun,
          kind: "album_memories",
          trip: trip,
          year: year,
          title: "Album memory",
          message:
            "A year ago you saved photos on “" +
            label +
            "”. Open Memories to revisit (private).",
          emailSubject: "HAVKAR album memory",
          emailText:
            "A year ago you saved travel photos for “" +
            label +
            "”. Open Tickets → Memories. Opt out in Reminders.",
          emailHtml:
            "<p>A year ago you saved travel photos for <strong>" +
            escapeHtml(label) +
            '</strong>.</p><p><a href="https://havkar.online/tickets.html#mode-memories">Open Memories</a></p><p>Opt-in only. Disable in Tickets → Reminders.</p>',
          samples: samples,
          counters: counters,
          source: e
        });
      }
    }

    if (p.yearly_recap) {
      const isJan1 = now.getUTCMonth() === 0 && now.getUTCDate() === 1;
      if (isJan1) {
        const lastYear = year - 1;
        const yearTrips = trips.filter(function (trip) {
          return String(trip.started_at || "").slice(0, 4) === String(lastYear);
        });
        if (yearTrips.length) {
          counters.considered += 1;
          const km = (
            yearTrips.reduce(function (sum, trip) {
              return sum + (Number(trip.distance_m) || 0);
            }, 0) / 1000
          ).toFixed(1);
          await dispatchChannel(client, {
            p: p,
            dryRun: dryRun,
            kind: "yearly_recap",
            trip: null,
            year: year,
            title: "Yearly travel recap",
            message:
              "In " +
              lastYear +
              " you recorded " +
              yearTrips.length +
              " trips · " +
              km +
              " km. Open My trips for details.",
            emailSubject: "HAVKAR yearly travel recap",
            emailText:
              "In " +
              lastYear +
              " you recorded " +
              yearTrips.length +
              " trips (" +
              km +
              " km) in HAVKAR. Open My trips. Opt out in Reminders.",
            emailHtml:
              "<p>In <strong>" +
              lastYear +
              "</strong> you recorded <strong>" +
              yearTrips.length +
              "</strong> trips (" +
              km +
              ' km).</p><p><a href="https://havkar.online/tickets.html#mode-mytrips">Open My trips</a></p>',
            samples: samples,
            counters: counters,
            source: e
          });
        }
      }
    }
  }

  return {
    ok: true,
    status: 200,
    dry_run: dryRun,
    considered: counters.considered,
    in_app_sent: counters.inApp,
    email_sent: counters.emailed,
    skipped: counters.skipped,
    resend_configured: Boolean(env("RESEND_API_KEY", e)),
    samples: samples,
    honesty:
      "Reminders require opt-in prefs. Email needs RESEND_API_KEY. Cron: Vercel x-vercel-cron or CRON_SECRET / HAVKAR_TRAVEL_REMINDER_CRON_SECRET. No duplicate year/channel sends. Push device channel is prefs-only until FCM is Owner-armed."
  };
}

module.exports = {
  resolveShare,
  dispatchReminders,
  cronAuthorized,
  anniversaryMatch
};
