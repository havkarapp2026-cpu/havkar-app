/**
 * Telehealth voice/video adapter placeholder.
 * Hard-blocked until clinical contract + Owner flag + jurisdiction checks.
 */

function telehealthStatus(env = process.env) {
  const flag = env.HAVKAR_TELEHEALTH_LIVE_ENABLED === "true";
  return {
    ok: true,
    adapter: "telehealth",
    voice: "BLOCKED",
    video: "BLOCKED",
    messaging: "text_only",
    flag_HAVKAR_TELEHEALTH_LIVE_ENABLED: flag,
    live_sessions: false,
    blocker:
      "Clinical telehealth contract, jurisdiction compliance, and separate Owner activation are required. Code keeps voice/video BLOCKED.",
    note: "Flag alone must never enable sessions without health API hard-gate removal by Owner order."
  };
}

module.exports = {
  telehealthStatus
};
