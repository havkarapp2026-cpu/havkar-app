/*
 * Badge display only.
 * This file never inserts, updates, or awards a badge.
 */
(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.HAVKAR_BADGES = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BADGES = Object.freeze({
    identity_verified: Object.freeze({
      className: "personal",
      symbol: "✓",
      label: "Verified identity"
    }),
    business_verified: Object.freeze({
      className: "business",
      symbol: "★",
      label: "Verified business"
    }),
    diamond: Object.freeze({
      className: "diamond",
      symbol: "◆",
      label: "Diamond"
    })
  });

  function rowsFrom(value) {
    return Array.isArray(value) ? value : [];
  }

  function issuedCodes(rows) {
    const codes = {};

    for (const row of rowsFrom(rows)) {
      const code = row && row.badge_code;

      if (Object.prototype.hasOwnProperty.call(BADGES, code)) {
        codes[code] = true;
      }
    }

    return codes;
  }

  function legacyCodes(serverType) {
    const type = String(serverType || "");

    return {
      identity_verified: type === "personal",
      business_verified: type === "business" || type === "company",
      diamond: false
    };
  }

  function itemMarkup(code, issued) {
    const badge = BADGES[code];
    const state = issued ? "Issued" : "Not issued";

    return (
      '<div class="verification-badge ' + badge.className +
      (issued ? "" : " pending") + '">' +
      '<span class="badge-symbol">' + badge.symbol + "</span>" +
      badge.label + " · " + state +
      "</div>"
    );
  }

  function accountMarkup(rows, serverType) {
    const issued = issuedCodes(rows);
    const legacy = legacyCodes(serverType);

    return [
      '<div class="badge-legend">',
      "<p>HAVKAR issues these badges. This account cannot award or edit them.</p>",
      itemMarkup("identity_verified", issued.identity_verified || legacy.identity_verified),
      itemMarkup("business_verified", issued.business_verified || legacy.business_verified),
      itemMarkup("diamond", issued.diamond),
      "</div>"
    ].join("");
  }

  function pageMarkup(rows) {
    const issued = issuedCodes(rows);

    if (!issued.business_verified) {
      return "";
    }

    return itemMarkup("business_verified", true);
  }

  async function loadAccount(client, userId) {
    if (!client || !userId || !client.rpc) {
      return [];
    }

    const result = await client.rpc("list_visible_badges", { target: userId });

    if (!result || result.error || !Array.isArray(result.data)) {
      return [];
    }

    return result.data;
  }

  async function loadPage(client, pageId) {
    if (!client || !pageId || !client.rpc) {
      return [];
    }

    const result = await client.rpc("list_visible_page_badges", {
      target_page: pageId
    });

    if (!result || result.error || !Array.isArray(result.data)) {
      return [];
    }

    return result.data;
  }

  async function mountAccount(host, client, userId, serverType) {
    if (!host) {
      return;
    }

    const rows = await loadAccount(client, userId);
    host.innerHTML = accountMarkup(rows, serverType);
  }

  return {
    BADGES: BADGES,
    accountMarkup: accountMarkup,
    pageMarkup: pageMarkup,
    loadAccount: loadAccount,
    loadPage: loadPage,
    mountAccount: mountAccount
  };
});
