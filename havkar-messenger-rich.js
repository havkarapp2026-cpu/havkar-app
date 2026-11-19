/**
 * HAVKAR Messenger rich payloads: location cards, media links, soft-delete markers.
 * Encoded inside messages.message_text (no fake coordinates / routes).
 */
(function (global) {
  "use strict";

  var LOC_PREFIX = "[havkar-location]";
  var MEDIA_PREFIX = "[havkar-media]";
  var DELETED_MARKER = "[havkar-deleted]";
  var LIVE_PREFIX = "[havkar-live-location]";

  function trim(v) {
    return String(v == null ? "" : v).trim();
  }

  function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function encodeLocation(item) {
    var lat = Number(item && item.lat);
    var lng = Number(item && item.lng);
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      throw new Error("Invalid coordinates");
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error("Coordinates out of range");
    }
    var payload = {
      v: 1,
      lat: Math.round(lat * 1e6) / 1e6,
      lng: Math.round(lng * 1e6) / 1e6,
      name: trim(item.name).slice(0, 120),
      address: trim(item.address).slice(0, 200),
      note: trim(item.note).slice(0, 280),
      live: false
    };
    return LOC_PREFIX + JSON.stringify(payload);
  }

  function encodeLiveLocation(item) {
    var base = encodeLocation(item).slice(LOC_PREFIX.length);
    var obj = JSON.parse(base);
    obj.live = true;
    obj.expiresAt = item.expiresAt || null;
    obj.sessionId = trim(item.sessionId).slice(0, 64);
    return LIVE_PREFIX + JSON.stringify(obj);
  }

  function parseLocation(text) {
    var raw = trim(text);
    var live = false;
    var json = null;
    if (raw.indexOf(LIVE_PREFIX) === 0) {
      live = true;
      json = raw.slice(LIVE_PREFIX.length);
    } else if (raw.indexOf(LOC_PREFIX) === 0) {
      json = raw.slice(LOC_PREFIX.length);
    } else {
      return null;
    }
    try {
      var obj = JSON.parse(json);
      if (!obj || !isFiniteNumber(Number(obj.lat)) || !isFiniteNumber(Number(obj.lng))) {
        return null;
      }
      return {
        lat: Number(obj.lat),
        lng: Number(obj.lng),
        name: trim(obj.name),
        address: trim(obj.address),
        note: trim(obj.note),
        live: live || !!obj.live,
        expiresAt: obj.expiresAt || null,
        sessionId: trim(obj.sessionId)
      };
    } catch (_e) {
      return null;
    }
  }

  function encodeMedia(item) {
    var url = trim(item && item.url);
    var kind = trim(item && item.kind) || "file";
    if (!url) throw new Error("Missing media url");
    // Only allow HAVKAR storage or data:image small previews already hosted.
    var ok =
      /^https:\/\/[a-z0-9.-]+\.supabase\.co\/storage\//i.test(url) ||
      /^https:\/\/havkar\.online\//i.test(url) ||
      /^https:\/\/[a-z0-9-]+\.vercel\.app\//i.test(url);
    if (!ok) throw new Error("Media URL not allowed");
    return (
      MEDIA_PREFIX +
      JSON.stringify({
        v: 1,
        kind: kind.slice(0, 24),
        url: url.slice(0, 800),
        name: trim(item.name).slice(0, 160),
        mime: trim(item.mime).slice(0, 80)
      })
    );
  }

  function parseMedia(text) {
    var raw = trim(text);
    if (raw.indexOf(MEDIA_PREFIX) !== 0) return null;
    try {
      var obj = JSON.parse(raw.slice(MEDIA_PREFIX.length));
      if (!obj || !obj.url) return null;
      return obj;
    } catch (_e) {
      return null;
    }
  }

  function isDeleted(text) {
    return trim(text) === DELETED_MARKER;
  }

  function osmEmbedUrl(lat, lng) {
    var d = 0.01;
    return (
      "https://www.openstreetmap.org/export/embed.html?bbox=" +
      encodeURIComponent(
        lng - d + "%2C" + (lat - d) + "%2C" + (lng + d) + "%2C" + (lat + d)
      ).replace(/%252C/g, "%2C") +
      "&layer=mapnik&marker=" +
      encodeURIComponent(lat + "%2C" + lng).replace(/%252C/g, "%2C")
    );
  }

  function directionsUrl(lat, lng, mode) {
    // OpenStreetMap directions (no invented ETA). Mode hint only.
    var m = mode === "foot" || mode === "bike" || mode === "car" ? mode : "car";
    return (
      "https://www.openstreetmap.org/directions?engine=fossgis_osrm_" +
      (m === "foot" ? "foot" : m === "bike" ? "bike" : "car") +
      "&route=%3B" +
      encodeURIComponent(lat + "," + lng)
    );
  }

  function ensureStyles() {
    if (document.getElementById("havkar-messenger-rich-css")) return;
    var style = document.createElement("style");
    style.id = "havkar-messenger-rich-css";
    style.textContent =
      ".havkar-loc-card{border:1px solid #cfe0d3;border-radius:14px;overflow:hidden;background:#f7fbf7;max-width:min(100%,320px)}" +
      ".havkar-loc-card iframe{display:block;width:100%;height:140px;border:0;background:#e8f5e9}" +
      ".havkar-loc-card .meta{padding:10px 12px}" +
      ".havkar-loc-card strong{display:block;color:#1b5e20;font-size:.92rem}" +
      ".havkar-loc-card span{display:block;color:#456;font-size:.8rem;margin-top:2px;line-height:1.35}" +
      ".havkar-loc-card .actions{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 12px}" +
      ".havkar-loc-card .actions a,.havkar-loc-card .actions button{min-height:36px;border-radius:10px;border:1px solid #2e7d32;background:#fff;color:#1b5e20;font-weight:700;padding:0 10px;text-decoration:none;font-size:.78rem;cursor:pointer}" +
      ".havkar-media-card{border:1px solid #cfe0d3;border-radius:14px;padding:10px;background:#f7fbf7;max-width:min(100%,280px)}" +
      ".havkar-media-card img,.havkar-media-card video{max-width:100%;border-radius:10px;display:block}" +
      ".havkar-media-card a{color:#1b5e20;font-weight:700}" +
      ".havkar-deleted-msg{font-style:italic;color:#789;opacity:.85}" +
      ".havkar-attach-tray{display:flex;flex-wrap:wrap;gap:8px;padding:8px 10px;background:#f3faf4;border-top:1px solid #d7e6db}" +
      ".havkar-attach-tray button{min-height:40px;border-radius:10px;border:1px solid #cfe0d3;background:#fff;color:#1b5e20;font-weight:700;padding:0 12px;cursor:pointer}" +
      ".havkar-call-blocked{padding:14px;border-radius:14px;background:#fff8e1;border:1px solid #ffe082;color:#e65100;line-height:1.45;font-size:.9rem}";
    document.head.appendChild(style);
  }

  function buildLocationCard(loc) {
    ensureStyles();
    var card = document.createElement("div");
    card.className = "havkar-loc-card";
    var iframe = document.createElement("iframe");
    iframe.title = "Map preview";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    iframe.src = osmEmbedUrl(loc.lat, loc.lng);
    card.appendChild(iframe);
    var meta = document.createElement("div");
    meta.className = "meta";
    var title = document.createElement("strong");
    title.textContent = loc.name || (loc.live ? "Live location" : "Shared location");
    meta.appendChild(title);
    if (loc.address) {
      var addr = document.createElement("span");
      addr.textContent = loc.address;
      meta.appendChild(addr);
    }
    var coords = document.createElement("span");
    coords.textContent = loc.lat.toFixed(5) + ", " + loc.lng.toFixed(5);
    meta.appendChild(coords);
    if (loc.note) {
      var note = document.createElement("span");
      note.textContent = loc.note;
      meta.appendChild(note);
    }
    if (loc.live && loc.expiresAt) {
      var exp = document.createElement("span");
      exp.textContent = "Live until " + String(loc.expiresAt);
      meta.appendChild(exp);
    }
    card.appendChild(meta);
    var actions = document.createElement("div");
    actions.className = "actions";
    function addLink(label, href) {
      var a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      actions.appendChild(a);
    }
    addLink("Open map", "https://www.openstreetmap.org/?mlat=" + loc.lat + "&mlon=" + loc.lng + "#map=16/" + loc.lat + "/" + loc.lng);
    addLink("Walk", directionsUrl(loc.lat, loc.lng, "foot"));
    addLink("Drive", directionsUrl(loc.lat, loc.lng, "car"));
    addLink("Bike", directionsUrl(loc.lat, loc.lng, "bike"));
    card.appendChild(actions);
    return card;
  }

  function renderIntoMessageText(textEl, messageText) {
    if (!textEl) return false;
    ensureStyles();
    if (isDeleted(messageText)) {
      textEl.textContent = "";
      var d = document.createElement("span");
      d.className = "havkar-deleted-msg";
      d.textContent = "This message was deleted.";
      textEl.appendChild(d);
      return true;
    }
    var loc = parseLocation(messageText);
    if (loc) {
      textEl.textContent = "";
      textEl.appendChild(buildLocationCard(loc));
      return true;
    }
    var media = parseMedia(messageText);
    if (media) {
      textEl.textContent = "";
      var card = document.createElement("div");
      card.className = "havkar-media-card";
      if (media.kind === "image") {
        var img = document.createElement("img");
        img.src = media.url;
        img.alt = media.name || "Image";
        card.appendChild(img);
      } else if (media.kind === "video") {
        var vid = document.createElement("video");
        vid.src = media.url;
        vid.controls = true;
        vid.playsInline = true;
        card.appendChild(vid);
      } else if (media.kind === "audio") {
        var aud = document.createElement("audio");
        aud.src = media.url;
        aud.controls = true;
        card.appendChild(aud);
      }
      var link = document.createElement("a");
      link.href = media.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = media.name || "Open file";
      card.appendChild(link);
      textEl.appendChild(card);
      return true;
    }
    return false;
  }

  global.HAVKAR_MESSENGER_RICH = {
    LOC_PREFIX: LOC_PREFIX,
    MEDIA_PREFIX: MEDIA_PREFIX,
    DELETED_MARKER: DELETED_MARKER,
    LIVE_PREFIX: LIVE_PREFIX,
    encodeLocation: encodeLocation,
    encodeLiveLocation: encodeLiveLocation,
    parseLocation: parseLocation,
    encodeMedia: encodeMedia,
    parseMedia: parseMedia,
    isDeleted: isDeleted,
    renderIntoMessageText: renderIntoMessageText,
    buildLocationCard: buildLocationCard,
    ensureStyles: ensureStyles,
    directionsUrl: directionsUrl
  };
})(typeof window !== "undefined" ? window : globalThis);
