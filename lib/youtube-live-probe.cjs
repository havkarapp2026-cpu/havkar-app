/**
 * Probe whether a YouTube id is an actual LIVE broadcast right now.
 *
 * Status taxonomy (Owner directive):
 *   LIVE     — confirmed live (official Data API and/or clear live signals)
 *   OFFLINE  — ended / vod / unavailable / unplayable (not currently live)
 *   UNKNOWN  — bot-check / LOGIN_REQUIRED / inconclusive — must NOT be labeled verified LIVE
 *
 * Prefer official YouTube Data API v3 when HAVKAR_YOUTUBE_API_KEY /
 * YOUTUBE_DATA_API_KEY / YOUTUBE_API_KEY is set (server-side only).
 * Never treats bot-check as offline. Never bypasses CAPTCHA / anti-bot.
 * Never scrapes private content. Results are cached briefly.
 */

const TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map();

function youtubeApiKey() {
  return String(
    process.env.HAVKAR_YOUTUBE_API_KEY ||
      process.env.YOUTUBE_DATA_API_KEY ||
      process.env.YOUTUBE_API_KEY ||
      ""
  ).trim();
}

function cacheGet(id) {
  const hit = cache.get(id);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(id);
    return null;
  }
  return hit.value;
}

function cacheSet(id, value) {
  cache.set(id, { value: value, expires: Date.now() + CACHE_TTL_MS });
}

function parsePlayability(htmlOrJson) {
  const text = String(htmlOrJson || "");
  const statusMatch = text.match(/"playabilityStatus"\s*:\s*\{\s*"status"\s*:\s*"([^"]+)"/);
  const reasonMatch = text.match(/"reason"\s*:\s*"((?:\\.|[^"\\])*)"/);
  return {
    status: statusMatch ? statusMatch[1] : "",
    reason: reasonMatch ? reasonMatch[1].replace(/\\"/g, '"') : ""
  };
}

function isBotCheckSignal(sig) {
  const status = String((sig && sig.playStatus) || "").toUpperCase();
  const reason = String((sig && sig.reason) || "").toLowerCase();
  return (
    status === "LOGIN_REQUIRED" ||
    /sign in to confirm|confirm you.?re not a bot|unusual traffic|login_required|bot.?check|captcha/i.test(
      reason
    )
  );
}

/**
 * Map probe signals → LIVE | OFFLINE family | UNKNOWN.
 * `live: true` only for confirmed LIVE. Bot-check alone → UNKNOWN.
 */
function classifyFromSignals(sig) {
  const reason = String(sig.reason || "").toLowerCase();
  const status = String(sig.playStatus || "").toUpperCase();
  const botCheck = isBotCheckSignal(sig);

  /* Decisive unplayable / removed — OFFLINE family (not bot-check) */
  if (
    !botCheck &&
    (status === "UNPLAYABLE" ||
      status === "ERROR" ||
      /recording is not available|video unavailable|content isn't available|this video isn't available|has been removed|private video|terminated/i.test(
        reason
      ))
  ) {
    return {
      ok: false,
      live: false,
      status: "unavailable",
      availability: "offline",
      reason: "unplayable_or_removed"
    };
  }

  if (sig.liveBroadcastDetails && sig.liveBroadcastDetails.isLiveNow === false) {
    return {
      ok: false,
      live: false,
      status: "ended",
      availability: "offline",
      reason: "live_ended",
      ended_at: sig.liveBroadcastDetails.endTimestamp || null
    };
  }

  /* Confirmed live signals win even if a bot wall also appeared */
  if (sig.isLiveNow === true || sig.isLive === true) {
    return {
      ok: true,
      live: true,
      status: "live",
      availability: "live",
      reason: "live_now"
    };
  }

  if (sig.isLiveContent === true && sig.isLive !== true && sig.isLiveNow !== true) {
    return {
      ok: false,
      live: false,
      status: "ended",
      availability: "offline",
      reason: "ended_recording"
    };
  }

  if (sig.isUpcoming === true) {
    return {
      ok: false,
      live: false,
      status: "upcoming",
      availability: "offline",
      reason: "upcoming"
    };
  }

  /* Finite short VOD / regular upload */
  const len = Number(sig.lengthSeconds);
  if (Number.isFinite(len) && len > 0 && len < 36000 && !sig.isLive && !sig.isLiveNow) {
    return {
      ok: false,
      live: false,
      status: "vod",
      availability: "offline",
      reason: "recorded_video"
    };
  }

  /* Bot-check / LOGIN_REQUIRED without decisive live or offline signals */
  if (botCheck) {
    return {
      ok: false,
      live: false,
      status: "unknown",
      availability: "unknown",
      reason: "bot_check_or_login_required",
      official_open_required: true
    };
  }

  return {
    ok: false,
    live: false,
    status: "unknown",
    availability: "unknown",
    reason: "not_confirmed_live",
    official_open_required: true
  };
}

/**
 * Official YouTube Data API v3 — preferred when server key is configured.
 * Quota: videos.list = 1 unit. Keys never leave the server.
 */
async function probeViaDataApi(youtubeId) {
  const key = youtubeApiKey();
  if (!key) return null;
  try {
    const url =
      "https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails,status&id=" +
      encodeURIComponent(youtubeId) +
      "&key=" +
      encodeURIComponent(key);
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (res.status === 403 || res.status === 429) {
      return {
        playStatus: "ERROR",
        reason: "youtube_data_api_quota_or_forbidden",
        source: "youtube_data_api",
        api_http: res.status,
        inconclusive: true
      };
    }
    if (!res.ok) {
      return {
        playStatus: "ERROR",
        reason: "youtube_data_api_http_" + res.status,
        source: "youtube_data_api",
        api_http: res.status,
        inconclusive: true
      };
    }
    const body = await res.json();
    const items = body && Array.isArray(body.items) ? body.items : [];
    if (!items.length) {
      return {
        playStatus: "UNPLAYABLE",
        reason: "video unavailable",
        source: "youtube_data_api",
        isLive: false,
        isLiveNow: false,
        isLiveContent: false
      };
    }
    const item = items[0];
    const snippet = item.snippet || {};
    const live = item.liveStreamingDetails || {};
    const st = item.status || {};
    const broadcast = String(snippet.liveBroadcastContent || "none").toLowerCase();
    const hasStart = Boolean(live.actualStartTime);
    const hasEnd = Boolean(live.actualEndTime);
    const isLiveNow = broadcast === "live" || (hasStart && !hasEnd);
    return {
      playStatus: st.privacyStatus === "private" ? "UNPLAYABLE" : "OK",
      reason: st.privacyStatus === "private" ? "private video" : "",
      title: snippet.title || "",
      lengthSeconds: null,
      isLive: isLiveNow,
      isLiveContent: broadcast === "live" || broadcast === "upcoming" || hasStart,
      isUpcoming: broadcast === "upcoming",
      isLiveNow: isLiveNow,
      liveBroadcastDetails: {
        isLiveNow: isLiveNow,
        startTimestamp: live.actualStartTime || live.scheduledStartTime || null,
        endTimestamp: live.actualEndTime || null
      },
      source: "youtube_data_api",
      liveBroadcastContent: broadcast
    };
  } catch (_e) {
    return {
      playStatus: "ERROR",
      reason: "youtube_data_api_network",
      source: "youtube_data_api",
      inconclusive: true
    };
  }
}

async function probeViaPlayerApi(youtubeId) {
  try {
    /* Public YouTube web client key used by youtube.com itself (not a HAVKAR secret).
       When Data API key is absent this is a best-effort signal only; LOGIN_REQUIRED → UNKNOWN. */
    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240101.00.00",
              hl: "en",
              gl: "US"
            }
          },
          videoId: youtubeId,
          contentCheckOk: true,
          racyCheckOk: true
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      }
    );
    if (!res.ok) return null;
    const body = await res.json();
    const ps = body.playabilityStatus || {};
    const vd = body.videoDetails || {};
    const mf =
      body.microformat && body.microformat.playerMicroformatRenderer
        ? body.microformat.playerMicroformatRenderer
        : null;
    return {
      playStatus: ps.status || "",
      reason: ps.reason || "",
      title: vd.title || "",
      lengthSeconds: vd.lengthSeconds,
      isLive: vd.isLive === true,
      isLiveContent: vd.isLiveContent === true,
      isUpcoming: vd.isUpcoming === true,
      isLiveNow: !!(mf && mf.liveBroadcastDetails && mf.liveBroadcastDetails.isLiveNow === true),
      liveBroadcastDetails: (mf && mf.liveBroadcastDetails) || null,
      source: "youtubei_web"
    };
  } catch (_e) {
    return null;
  }
}

async function probeViaWatchHtml(youtubeId) {
  try {
    const res = await fetch("https://www.youtube.com/watch?v=" + encodeURIComponent(youtubeId), {
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!res.ok) {
      return {
        playStatus: "ERROR",
        reason: "http_" + res.status,
        source: "watch_html",
        inconclusive: true
      };
    }
    const html = await res.text();
    const play = parsePlayability(html);
    const titleMatch =
      html.match(/"videoDetails":\{"videoId":"[^"]+","title":"((?:\\.|[^"\\])*)"/) ||
      html.match(/playerOverlayVideoDetailsRenderer":\{"title":\{"simpleText":"((?:\\.|[^"\\])*)"/);
    const title = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : "";
    const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
    const liveDetailsMatch = html.match(/"liveBroadcastDetails":\{([^}]*)\}/);
    let liveBroadcastDetails = null;
    if (liveDetailsMatch) {
      const block = liveDetailsMatch[0];
      liveBroadcastDetails = {
        isLiveNow: /"isLiveNow"\s*:\s*true/.test(block),
        startTimestamp: (/startTimestamp":"([^"]+)"/.exec(block) || [])[1] || null,
        endTimestamp: (/endTimestamp":"([^"]+)"/.exec(block) || [])[1] || null
      };
    }
    return {
      playStatus: play.status,
      reason: play.reason,
      title: title,
      lengthSeconds: lengthMatch ? lengthMatch[1] : null,
      isLive: /"isLive"\s*:\s*true/.test(html),
      isLiveContent: /"isLiveContent"\s*:\s*true/.test(html),
      isUpcoming: /"isUpcoming"\s*:\s*true/.test(html),
      isLiveNow:
        /"isLiveNow"\s*:\s*true/.test(html) ||
        !!(liveBroadcastDetails && liveBroadcastDetails.isLiveNow),
      liveBroadcastDetails: liveBroadcastDetails,
      source: "watch_html"
    };
  } catch (_e) {
    return null;
  }
}

function mergeSignals(primary, secondary) {
  if (!primary) return secondary;
  if (!secondary) return primary;
  return Object.assign({}, primary, secondary, {
    playStatus:
      (primary.playStatus === "UNPLAYABLE" && primary.playStatus) ||
      secondary.playStatus ||
      primary.playStatus ||
      "",
    reason:
      (/recording|unavailable|removed/i.test(primary.reason || "")
        ? primary.reason
        : secondary.reason) ||
      primary.reason ||
      "",
    isLive: !!(secondary.isLive || primary.isLive),
    isLiveNow: !!(secondary.isLiveNow || primary.isLiveNow),
    isLiveContent: !!(secondary.isLiveContent || primary.isLiveContent),
    isUpcoming: !!(secondary.isUpcoming || primary.isUpcoming),
    liveBroadcastDetails:
      secondary.liveBroadcastDetails || primary.liveBroadcastDetails || null,
    title: secondary.title || primary.title || "",
    lengthSeconds:
      secondary.lengthSeconds != null ? secondary.lengthSeconds : primary.lengthSeconds,
    source: [primary.source, secondary.source].filter(Boolean).join("+")
  });
}

/**
 * @param {string} youtubeId
 * @returns {Promise<{ok:boolean,live:boolean,status:string,availability:string,reason:string,title?:string,probed_at:string,source?:string,official_api_configured?:boolean}>}
 */
async function probeYouTubeLive(youtubeId) {
  const id = String(youtubeId || "").trim();
  if (!/^[\w-]{11}$/.test(id)) {
    return {
      ok: false,
      live: false,
      status: "invalid",
      availability: "offline",
      reason: "invalid_youtube_id",
      probed_at: new Date().toISOString(),
      official_api_configured: Boolean(youtubeApiKey())
    };
  }
  const cached = cacheGet(id);
  if (cached) return Object.assign({}, cached, { cached: true });

  const officialConfigured = Boolean(youtubeApiKey());
  let signals = null;
  let classified = null;

  /* 1) Official Data API when key is present */
  const dataApi = await probeViaDataApi(id);
  if (dataApi && !dataApi.inconclusive) {
    signals = dataApi;
    classified = classifyFromSignals(dataApi);
  } else if (dataApi && dataApi.inconclusive) {
    signals = dataApi;
  }

  /* 2) Best-effort public player signals — never treat bot-check as offline */
  if (!classified || classified.availability === "unknown" || !classified.live) {
    const player = await probeViaPlayerApi(id);
    if (player) {
      signals = mergeSignals(signals, player);
      classified = classifyFromSignals(signals);
    }

    const needsHtml =
      !classified ||
      classified.availability === "unknown" ||
      classified.reason === "not_confirmed_live" ||
      (player && isBotCheckSignal(player) && !player.isLive && !player.isLiveNow);

    if (needsHtml) {
      const htmlSig = await probeViaWatchHtml(id);
      if (htmlSig) {
        signals = mergeSignals(signals, htmlSig);
        classified = classifyFromSignals(signals);
      }
    }
  }

  if (!classified) {
    classified = {
      ok: false,
      live: false,
      status: "unknown",
      availability: "unknown",
      reason: "probe_failed",
      official_open_required: true
    };
  }

  /* Hard rule: never upgrade UNKNOWN bot-check to offline */
  if (
    classified.availability === "offline" &&
    signals &&
    isBotCheckSignal(signals) &&
    !signals.isLive &&
    !signals.isLiveNow &&
    classified.reason !== "unplayable_or_removed" &&
    classified.status !== "ended" &&
    classified.status !== "vod"
  ) {
    classified = {
      ok: false,
      live: false,
      status: "unknown",
      availability: "unknown",
      reason: "bot_check_or_login_required",
      official_open_required: true
    };
  }

  const out = Object.assign({}, classified, {
    title: (signals && signals.title) || "",
    youtube_id: id,
    source: (signals && signals.source) || "probe",
    probed_at: new Date().toISOString(),
    official_api_configured: officialConfigured,
    watch_url: "https://www.youtube.com/watch?v=" + encodeURIComponent(id)
  });
  cacheSet(id, out);
  return out;
}

async function probeMany(ids) {
  const list = Array.isArray(ids) ? ids : [];
  const out = [];
  for (const id of list) {
    out.push(await probeYouTubeLive(id));
  }
  return out;
}

module.exports = {
  probeYouTubeLive,
  probeMany,
  classifyFromSignals,
  isBotCheckSignal,
  youtubeApiKey,
  CACHE_TTL_MS
};
