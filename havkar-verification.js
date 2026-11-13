/*
 * Verified badges come from server state only.
 * Primary: public.havkar_verification_cases via RPC (status=approved).
 * Fallback: app_metadata.verified / verification_type (Auth Admin only).
 * user_metadata is ignored to prevent self-assignment.
 */
(function (root, factory) {

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_VERIFICATION = api;

})(typeof globalThis !== "undefined" ? globalThis : this, function () {

  const BADGE_LABELS = {
    personal: "Verified Person",
    business: "Verified Business",
    company: "Verified Company / Factory"
  };

  const BADGE_HELP = {
    personal: "Verified individual identity. Not a rating or paid subscription.",
    business: "Verified registered business. Not a rating or paid subscription.",
    company: "Verified company or factory. Not a rating or paid subscription."
  };

  function normalizeType(type) {
    const value = String(type || "").toLowerCase();
    if (value === "company" || value === "factory") return "company";
    if (value === "business") return "business";
    if (value === "personal") return "personal";
    return "";
  }

  function serverVerifiedType(user) {
    const app = user && user.app_metadata;

    if (!app || typeof app !== "object" || Array.isArray(app)) {
      return "";
    }

    if (app.verified !== true && app.is_verified !== true) {
      return "";
    }

    return normalizeType(
      app.verification_type ||
      app.verificationType ||
      app.account_type ||
      "personal"
    );
  }

  function typesFromCaseRows(rows) {
    const out = [];
    (rows || []).forEach(function (row) {
      const type = normalizeType(row && (row.badge_type || row.type));
      const status = String((row && row.status) || "approved").toLowerCase();
      if (!type || status !== "approved") return;
      if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return;
      if (out.indexOf(type) === -1) out.push(type);
    });
    return out;
  }

  function renderBadgeHtml(type) {
    const normalized = normalizeType(type);
    if (!normalized) return "";
    const label = BADGE_LABELS[normalized];
    const help = BADGE_HELP[normalized];
    return (
      '<span class="havkar-badge ' +
      normalized +
      '" role="img" aria-label="' +
      label +
      ". " +
      help +
      '" title="' +
      help +
      '">' +
      '<span class="icon" aria-hidden="true"></span>' +
      "<span>" +
      label +
      "</span></span>"
    );
  }

  function renderBadgesHtml(types) {
    return (types || [])
      .map(renderBadgeHtml)
      .filter(Boolean)
      .join(" ");
  }

  async function loadApprovedBadgeTypes(supabaseClient, userId) {
    if (!supabaseClient || !userId || typeof supabaseClient.rpc !== "function") {
      return [];
    }
    const result = await supabaseClient.rpc("havkar_public_verification_badges", {
      p_user_id: userId
    });
    if (result.error) {
      return [];
    }
    return typesFromCaseRows(result.data || []);
  }

  return {
    BADGE_LABELS: BADGE_LABELS,
    BADGE_HELP: BADGE_HELP,
    normalizeType: normalizeType,
    serverVerifiedType: serverVerifiedType,
    typesFromCaseRows: typesFromCaseRows,
    renderBadgeHtml: renderBadgeHtml,
    renderBadgesHtml: renderBadgesHtml,
    loadApprovedBadgeTypes: loadApprovedBadgeTypes
  };

});
