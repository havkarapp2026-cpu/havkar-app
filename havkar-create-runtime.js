/**
 * Trusted HAVKAR CREATE sandbox renderer.
 * Renders template config as interactive HTML. Does not execute user-supplied scripts.
 */
(function (root) {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderShop(config) {
    const products = Array.isArray(config.products) ? config.products : [];
    const cards = products
      .map(function (p, i) {
        return (
          '<article class="item"><h3>' +
          esc(p.name || "Product " + (i + 1)) +
          "</h3><p>" +
          esc(p.price != null ? p.price + " " + (p.currency || "EUR") : "Price TBD") +
          '</p><button type="button" disabled title="Live checkout OFF">Order (disabled)</button></article>'
        );
      })
      .join("");
    return (
      '<section><h2>Shop catalog</h2><p class="note">Checkout stays OFF until Owner authorization.</p><div class="grid">' +
      (cards || "<p>No products yet. Add products in the builder.</p>") +
      "</div></section>"
    );
  }

  function renderRestaurant(config) {
    const menu = Array.isArray(config.menu) ? config.menu : [];
    const rows = menu
      .map(function (m) {
        return (
          "<li><strong>" +
          esc(m.name || "Item") +
          "</strong> — " +
          esc(m.price != null ? m.price + " EUR" : "") +
          "</li>"
        );
      })
      .join("");
    return (
      "<section><h2>Menu</h2><ul>" +
      (rows || "<li>Add menu items in the builder.</li>") +
      '</ul><p class="note">Ordering mode: inquiry only (no live card charge).</p></section>'
    );
  }

  function renderBooking(config) {
    const services = Array.isArray(config.services) ? config.services : [];
    return (
      "<section><h2>Booking requests</h2><ul>" +
      (services
        .map(function (s) {
          return "<li>" + esc(s.name || "Service") + "</li>";
        })
        .join("") || "<li>Add services in the builder.</li>") +
      '</ul><form onsubmit="return false;"><label>Name<input required maxlength="80"></label><label>Request<textarea maxlength="500"></textarea></label><button type="submit">Send request (local only)</button></form><p class="note">Requests are preview-only; not stored outside your venture until wired by Owner.</p></section>'
    );
  }

  function renderLanding(config) {
    return (
      "<section class='hero'><h1>" +
      esc(config.heroTitle || config.template_name || "Business") +
      "</h1><p>" +
      esc(config.heroSubtitle || "") +
      "</p></section><section><h2>About</h2><p>" +
      esc(config.about || "Describe your business in the builder.") +
      "</p></section><section><h2>Contact</h2><p>" +
      esc(config.contact || "Add contact details.") +
      "</p></section>"
    );
  }

  function renderSports(config) {
    return (
      "<section><h2>Training sessions</h2><p class='banner'>TEST/SIMULATION area for sports templates. Hardware sensors are not claimed here.</p><p>" +
      esc(config.coachNotes || "Coach notes go here.") +
      '</p><p><a href="create-football-2d.html" target="_blank" rel="noopener">Open 2D football demo (separate from Aldo hardware)</a></p></section>'
    );
  }

  function css(theme) {
    const t = theme || {};
    return (
      ":root{--p:" +
      esc(t.primary || "#0d3d16") +
      ";--a:" +
      esc(t.accent || "#1c9a43") +
      ";--s:" +
      esc(t.surface || "#07140b") +
      "}*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:linear-gradient(160deg,var(--s),#020805);color:#e8f6ec;padding:20px}h1,h2{color:#fff}.hero{padding:28px;border-radius:18px;background:linear-gradient(135deg,var(--p),#041108);margin-bottom:16px}.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}.item{border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px;background:rgba(0,0,0,.25)}button{background:var(--a);border:0;color:#fff;padding:10px 12px;border-radius:10px;font-weight:700}button:disabled{opacity:.55}.note,.banner{color:#f0d78c;font-size:13px}label{display:block;margin:8px 0}input,textarea{width:100%;padding:8px;border-radius:8px;border:1px solid #345;background:#0a160f;color:#fff}a{color:#9be0b0}"
    );
  }

  function buildDocument(config) {
    const c = config || {};
    const tid = String(c.template_id || "");
    let body = renderLanding(c);
    if (tid === "online_shop") body = renderLanding(c) + renderShop(c);
    else if (tid === "restaurant_ordering") body = renderLanding(c) + renderRestaurant(c);
    else if (
      tid === "booking_services" ||
      tid === "salon_services" ||
      tid === "repair_workshop"
    ) {
      body = renderLanding(c) + renderBooking(c);
    } else if (tid === "sports_training" || tid === "hardware_connected" || tid === "game_2d_football") {
      body = renderLanding(c) + renderSports(c);
    } else if (tid === "community_creator") {
      body =
        renderLanding(c) +
        "<section><h2>Posts</h2><p class='note'>Short-video pipeline unsupported. Text posts placeholder only.</p></section>";
    } else if (tid === "dashboard_forms") {
      body =
        renderLanding(c) +
        "<section><h2>KPIs</h2><p>Visitors: — · Orders: — · (analytics shell)</p></section>";
    }
    return (
      "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><style>" +
      css(c.theme) +
      "</style></head><body><p class='banner'>HAVKAR CREATE sandbox preview · no arbitrary user code · payments OFF</p>" +
      body +
      "</body></html>"
    );
  }

  function mount(iframe, config) {
    if (!iframe) return;
    iframe.setAttribute(
      "sandbox",
      "allow-forms allow-scripts allow-modals"
    );
    iframe.srcdoc = buildDocument(config);
  }

  root.HAVKAR_CREATE_RUNTIME = {
    buildDocument: buildDocument,
    mount: mount
  };
})(typeof window !== "undefined" ? window : globalThis);
