/*
 * Safe public seller profile for Buy & Sell listing details.
 * Never returns email, phone, address, or other confidential fields.
 * Prefer profiles.full_name; fall back to auth user_metadata display fields.
 */

function isHttpsUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const url = new URL(text);
    return url.protocol === "https:";
  } catch (_err) {
    return false;
  }
}

function sanitizeDisplayName(raw) {
  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length > 80) return text.slice(0, 80).trim();
  // Never treat an email-shaped string as a public display name.
  if (/@/.test(text)) return null;
  return text;
}

function pickPublicDisplayName(profile, meta) {
  const fromProfile = sanitizeDisplayName(profile && profile.full_name);
  if (fromProfile) return fromProfile;

  const fromMetaFull = sanitizeDisplayName(meta && meta.full_name);
  if (fromMetaFull) return fromMetaFull;

  const fromMetaName = sanitizeDisplayName(meta && meta.name);
  if (fromMetaName) return fromMetaName;

  const composed = sanitizeDisplayName(
    [meta && meta.first_name, meta && meta.last_name]
      .filter(Boolean)
      .join(" ")
  );
  return composed || null;
}

function pickPublicAvatarUrl(profile, meta) {
  const candidates = [
    profile && profile.avatar_url,
    meta && meta.avatar_url,
    meta && meta.picture
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    if (isHttpsUrl(candidates[i])) {
      return String(candidates[i]).trim();
    }
  }
  return null;
}

function buildMarketplaceSellerPublicPayload({
  listingId,
  sellerUserId,
  profile,
  authUser
} = {}) {
  const meta =
    (authUser &&
      (authUser.user_metadata ||
        (authUser.raw_user_meta_data && authUser.raw_user_meta_data))) ||
    {};
  const displayName = pickPublicDisplayName(profile, meta);
  const avatarUrl = pickPublicAvatarUrl(profile, meta);
  const memberSince =
    (profile && profile.created_at) ||
    (authUser && authUser.created_at) ||
    null;

  return {
    ok: true,
    listing_id: listingId != null ? String(listingId) : null,
    seller_user_id: sellerUserId ? String(sellerUserId) : null,
    seller: {
      display_name: displayName,
      avatar_url: avatarUrl,
      country:
        profile && profile.country
          ? String(profile.country).trim().slice(0, 64)
          : null,
      city:
        profile && profile.city
          ? String(profile.city).trim().slice(0, 64)
          : null,
      member_since: memberSince,
      has_public_profile: Boolean(displayName || avatarUrl)
    },
    fallback_label: "HAVKAR Member"
  };
}

module.exports = {
  isHttpsUrl,
  sanitizeDisplayName,
  pickPublicDisplayName,
  pickPublicAvatarUrl,
  buildMarketplaceSellerPublicPayload
};
