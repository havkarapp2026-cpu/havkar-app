/**
 * Production-oriented telehealth adapter (WebRTC readiness + gates).
 * Public clinical voice/video stays gated until Owner clinical authorization
 * evidence is present. Never fabricates a live clinical session as open.
 */

const SELECTABLE_LANGS = [
  "en",
  "it",
  "de",
  "fr",
  "es",
  "pt",
  "nl",
  "sv",
  "pl",
  "id",
  "zh",
  "ja",
  "ko",
  "hi",
  "ru",
  "ckb",
  "kmr",
  "tr",
  "ar",
  "fa",
  "ur"
];

function flagTrue(env, name) {
  return String(env[name] || "").trim().toLowerCase() === "true";
}

function iceServersFromEnv(env = process.env) {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  const turnUrl = String(env.HAVKAR_TURN_URL || "").trim();
  const turnUser = String(env.HAVKAR_TURN_USERNAME || "").trim();
  const turnCred = String(env.HAVKAR_TURN_CREDENTIAL || "").trim();
  if (turnUrl && turnUser && turnCred) {
    servers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnCred
    });
  }
  return {
    iceServers: servers,
    turn_configured: Boolean(turnUrl && turnUser && turnCred),
    note: turnUrl
      ? "TURN present for NAT traversal."
      : "Public STUN only until HAVKAR_TURN_* secrets are bound."
  };
}

function clinicalReadiness(env = process.env) {
  const liveFlag = flagTrue(env, "HAVKAR_TELEHEALTH_LIVE_ENABLED");
  const contract = flagTrue(env, "HAVKAR_TELEHEALTH_CLINICAL_CONTRACT_VERIFIED");
  const ownerAuth = flagTrue(env, "HAVKAR_TELEHEALTH_OWNER_AUTHORIZED");
  const privacy = flagTrue(env, "HAVKAR_TELEHEALTH_PRIVACY_SAFEGUARDS_VERIFIED");
  const licensing = flagTrue(env, "HAVKAR_TELEHEALTH_PROVIDER_LICENSING_VERIFIED");
  const testMode = flagTrue(env, "HAVKAR_TELEHEALTH_TEST_MODE");
  const ice = iceServersFromEnv(env);

  const missing = [];
  if (!liveFlag) missing.push("HAVKAR_TELEHEALTH_LIVE_ENABLED");
  if (!contract) missing.push("HAVKAR_TELEHEALTH_CLINICAL_CONTRACT_VERIFIED");
  if (!ownerAuth) missing.push("HAVKAR_TELEHEALTH_OWNER_AUTHORIZED");
  if (!privacy) missing.push("HAVKAR_TELEHEALTH_PRIVACY_SAFEGUARDS_VERIFIED");
  if (!licensing) missing.push("HAVKAR_TELEHEALTH_PROVIDER_LICENSING_VERIFIED");

  const publicLive = missing.length === 0;
  return {
    live_flag: liveFlag,
    clinical_contract_verified: contract,
    owner_authorized: ownerAuth,
    privacy_safeguards_verified: privacy,
    provider_licensing_verified: licensing,
    test_mode: testMode,
    public_clinical_sessions_allowed: publicLive,
    authorized_test_sessions_allowed: testMode && !publicLive,
    missing_requirements: missing,
    ice,
    recording_default: "OFF",
    selectable_languages: SELECTABLE_LANGS.slice()
  };
}

function telehealthStatus(env = process.env) {
  const ready = clinicalReadiness(env);
  const publicLive = ready.public_clinical_sessions_allowed;
  return {
    ok: true,
    adapter: "telehealth",
    architecture: "webrtc_1to1",
    voice: publicLive ? "READY" : "BLOCKED",
    video: publicLive ? "READY" : "BLOCKED",
    messaging: "text_only",
    flag_HAVKAR_TELEHEALTH_LIVE_ENABLED: ready.live_flag,
    live_sessions: publicLive,
    public_clinical_sessions_allowed: publicLive,
    authorized_test_sessions_allowed: ready.authorized_test_sessions_allowed,
    readiness: ready,
    features: {
      waiting_room: true,
      mute_unmute: true,
      camera_toggle: true,
      camera_switch: true,
      reconnect: true,
      appointment_linked: true,
      consent_required: true,
      session_logs_without_media_recording: true,
      media_recording_default: "OFF",
      emergency_use_limitation_notice: true
    },
    blocker: publicLive
      ? null
      : "Clinical telehealth requires verified contract, privacy safeguards, provider licensing, and Owner authorization before public voice/video. Infrastructure is implemented and remains gated.",
    note: "Flag alone must never open public clinical sessions without full readiness checklist."
  };
}

function createSessionToken() {
  const bytes = require("crypto").randomBytes(24).toString("base64url");
  return `th_${bytes}`;
}

/**
 * Create a telehealth session descriptor.
 * Returns blocked unless public clinical readiness OR authorized test mode.
 * Never returns media content or long-lived private medical payloads.
 */
function createTelehealthSession(input = {}, env = process.env) {
  const ready = clinicalReadiness(env);
  const modality = String(input.modality || "video").trim().toLowerCase();
  if (modality !== "voice" && modality !== "video") {
    return { ok: false, error: "invalid_modality", allowed: ["voice", "video"] };
  }
  if (!input.appointment_id || !input.provider_id || !input.patient_user_id) {
    return {
      ok: false,
      error: "appointment_provider_patient_required"
    };
  }
  if (!input.consent_acknowledged) {
    return { ok: false, error: "consent_required" };
  }
  if (!ready.public_clinical_sessions_allowed && !ready.authorized_test_sessions_allowed) {
    return {
      ok: false,
      error: "telehealth_blocked",
      status: "BLOCKED",
      readiness: ready,
      reason:
        "Public clinical voice/video stays gated until clinical contract, licensing, privacy safeguards and Owner authorization are verified."
    };
  }

  const sessionId = createSessionToken();
  const ice = iceServersFromEnv(env);
  return {
    ok: true,
    action: "telehealth_session_create",
    session: {
      id: sessionId,
      modality,
      appointment_id: String(input.appointment_id),
      provider_id: String(input.provider_id),
      patient_user_id: String(input.patient_user_id),
      waiting_room: true,
      recording: "OFF",
      created_at: new Date().toISOString(),
      mode: ready.public_clinical_sessions_allowed ? "public_clinical" : "authorized_test",
      iceServers: ice.iceServers,
      controls: {
        mute: true,
        camera: modality === "video",
        camera_switch: modality === "video",
        reconnect: true,
        end_call: true
      },
      safeguards: {
        emergency_use_not_for_emergencies: true,
        jurisdiction_check_required: true,
        provider_license_check_required: true,
        no_media_recording_by_default: true,
        session_log_excludes_media: true
      }
    },
    // Signaling token is short-lived opaque; never log raw medical notes here.
    signaling: {
      token: createSessionToken(),
      expires_in_sec: 600
    }
  };
}

function endTelehealthSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, error: "session_id_required" };
  return {
    ok: true,
    action: "telehealth_session_end",
    session_id: id,
    ended_at: new Date().toISOString(),
    media_recorded: false
  };
}

module.exports = {
  SELECTABLE_LANGS,
  clinicalReadiness,
  iceServersFromEnv,
  telehealthStatus,
  createTelehealthSession,
  endTelehealthSession
};
