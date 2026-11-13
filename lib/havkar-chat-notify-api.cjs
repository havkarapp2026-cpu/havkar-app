/*
 * Chat push/notification dispatch after confirmed message persistence.
 * Web Push uses VAPID env keys when present. FCM optional via FCM_SERVER_KEY.
 * Never claims delivery when permission denied or tokens missing.
 */

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

function env(name) {
  return String(process.env[name] || "").trim();
}

function getAdmin() {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function bearer(req) {
  const h = String((req.headers && req.headers.authorization) || "");
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function vapidPublicJwk() {
  // Browser PushManager expects applicationServerKey as raw uncompressed P-256.
  // We expose the public key from env as URL-safe base64.
  return env("HAVKAR_VAPID_PUBLIC_KEY");
}

async function authenticate(req, admin) {
  const token = bearer(req);
  if (!token) return { ok: false, error: "missing_bearer_token", status: 401 };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data || !data.user) {
    return { ok: false, error: "invalid_session", status: 401 };
  }
  return { ok: true, user: data.user };
}

async function sendWebPush(subscription, payload) {
  const vapidPublic = env("HAVKAR_VAPID_PUBLIC_KEY");
  const vapidPrivate = env("HAVKAR_VAPID_PRIVATE_KEY");
  const subject = env("HAVKAR_VAPID_SUBJECT") || "mailto:support@havkar.online";
  if (!vapidPublic || !vapidPrivate) {
    return { ok: false, skipped: true, reason: "vapid_not_configured" };
  }
  try {
    // Prefer web-push if installed; otherwise skip gracefully.
    let webpush;
    try {
      webpush = require("web-push");
    } catch (_e) {
      return { ok: false, skipped: true, reason: "web_push_package_missing" };
    }
    webpush.setVapidDetails(subject, vapidPublic, vapidPrivate);
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
}

async function sendFcmLegacy(token, payload) {
  const serverKey = env("FCM_SERVER_KEY") || env("HAVKAR_FCM_SERVER_KEY");
  if (!serverKey) {
    return { ok: false, skipped: true, reason: "fcm_not_configured" };
  }
  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: "key=" + serverKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title: payload.title,
          body: payload.body,
          click_action: payload.url,
          sound: "default"
        },
        data: {
          conversation_id: payload.conversation_id || "",
          message_id: payload.message_id || "",
          url: payload.url || ""
        }
      })
    });
    if (!res.ok) {
      return { ok: false, error: "fcm_http_" + res.status };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
}

async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed" });
  }

  const admin = getAdmin();
  if (!admin) return send(res, 500, { error: "supabase_config_missing" });

  const auth = await authenticate(req, admin);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });

  const action = String(
    (req.query && req.query.action) ||
      (req.body && req.body.action) ||
      "status"
  );

  if (action === "status" || req.method === "GET") {
    return send(res, 200, {
      ok: true,
      web_push_configured: Boolean(vapidPublicJwk() && env("HAVKAR_VAPID_PRIVATE_KEY")),
      vapid_public_key: vapidPublicJwk() || null,
      fcm_configured: Boolean(env("FCM_SERVER_KEY") || env("HAVKAR_FCM_SERVER_KEY")),
      note:
        "Push delivery requires OS permission, active device token, and network. Denied permission or offline devices are not claimed as delivered."
    });
  }

  if (action === "register") {
    const platform = String((req.body && req.body.platform) || "web");
    const endpoint = String((req.body && req.body.endpoint) || "").trim();
    const p256dh = String((req.body && req.body.p256dh) || "").trim() || null;
    const authSecret = String((req.body && req.body.auth) || "").trim() || null;
    const fcmToken = String((req.body && req.body.fcm_token) || "").trim() || null;
    if (!endpoint && !fcmToken) {
      return send(res, 400, { error: "endpoint_or_fcm_token_required" });
    }
    const row = {
      user_id: auth.user.id,
      platform: ["web", "android", "ios"].indexOf(platform) >= 0 ? platform : "web",
      endpoint: endpoint || "fcm:" + fcmToken,
      p256dh: p256dh,
      auth_secret: authSecret,
      fcm_token: fcmToken,
      user_agent: String((req.headers && req.headers["user-agent"]) || "").slice(0, 400),
      permission_state: "granted",
      last_seen_at: new Date().toISOString(),
      revoked_at: null
    };
    const { error } = await admin.from("havkar_push_device_tokens").upsert(row, {
      onConflict: "endpoint"
    });
    if (error) return send(res, 400, { error: error.message });
    return send(res, 200, { ok: true, registered: true });
  }

  if (action === "unregister") {
    const endpoint = String((req.body && req.body.endpoint) || "").trim();
    if (!endpoint) return send(res, 400, { error: "endpoint_required" });
    await admin
      .from("havkar_push_device_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", auth.user.id)
      .eq("endpoint", endpoint);
    return send(res, 200, { ok: true, revoked: true });
  }

  if (action === "notify_message") {
    const conversationId = String(
      (req.body && req.body.conversation_id) || ""
    ).trim();
    const messageId = String((req.body && req.body.message_id) || "").trim();
    if (!conversationId || !messageId) {
      return send(res, 400, { error: "conversation_id_and_message_id_required" });
    }

    const msg = await admin
      .from("messages")
      .select("id,conversation_id,sender_id,message_text,created_at")
      .eq("id", messageId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (msg.error || !msg.data) {
      return send(res, 404, { error: "message_not_found" });
    }
    if (String(msg.data.sender_id) !== String(auth.user.id)) {
      return send(res, 403, { error: "sender_only" });
    }

    const conv = await admin
      .from("conversations")
      .select("id,buyer_id,seller_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (conv.error || !conv.data) {
      return send(res, 404, { error: "conversation_not_found" });
    }
    const peerId =
      String(conv.data.buyer_id) === String(auth.user.id)
        ? conv.data.seller_id
        : conv.data.buyer_id;
    if (!peerId) return send(res, 200, { ok: true, dispatched: 0 });

    const tokens = await admin
      .from("havkar_push_device_tokens")
      .select("id,platform,endpoint,p256dh,auth_secret,fcm_token")
      .eq("user_id", peerId)
      .is("revoked_at", null)
      .limit(20);

    const preview = String(msg.data.message_text || "").slice(0, 120);
    const payload = {
      title: "New HAVKAR message",
      body: preview,
      url: "/chat.html?conversation_id=" + conversationId,
      conversation_id: conversationId,
      message_id: messageId
    };

    const results = [];
    for (const token of tokens.data || []) {
      if (token.fcm_token) {
        results.push(await sendFcmLegacy(token.fcm_token, payload));
      } else if (token.endpoint && token.p256dh && token.auth_secret) {
        results.push(
          await sendWebPush(
            {
              endpoint: token.endpoint,
              keys: { p256dh: token.p256dh, auth: token.auth_secret }
            },
            payload
          )
        );
      } else {
        results.push({ ok: false, skipped: true, reason: "incomplete_token" });
      }
    }

    return send(res, 200, {
      ok: true,
      peer_id: peerId,
      token_count: (tokens.data || []).length,
      results: results,
      guaranteed: false
    });
  }

  return send(res, 400, { error: "unknown_action" });
}

module.exports = {
  handler,
  vapidPublicJwk,
  b64url,
  // exported for tests
  _test: { sendWebPush, sendFcmLegacy }
};
