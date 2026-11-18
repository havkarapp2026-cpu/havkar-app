/**
 * Probe whether a YouTube id is an actual LIVE broadcast right now.
 * Never treats ended recordings / VOD as live.
 * Results are cached briefly to protect quota and latency.
 */

const TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map();

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

function classifyFromSignals(sig) {
  const reason = String(sig.reason || "").toLowerCase();
  const status = String(sig.playStatus || "").toUpperCase();

  if (
    status === "UNPLAYABLE" ||
    status === "ERROR" ||
    /recording is not available|video unavailable|content isn't available|this video isn't available|has been removed|private video|terminated/i.test(
      reason
    )
  ) {
    return {
      ok: false,
      live: false,
      status: "unavailable",
      reason: "unplayable_or_removed"
    };
  }

  if (sig.liveBroadcastDetails && sig.liveBroadcastDetails.isLiveNow === false) {
    return {
      ok: false,
      live: false,
      status: "ended",
      reason: "live_ended",
      ended_at: sig.liveBroadcastDetails.endTimestamp || null
    };
  }

  if (sig.isLiveNow === true || sig.isLive === true) {
    return {
      ok: true,
      live: true,
      status: "live",
      reason: "live_now"
    };
  }

  if (sig.isLiveContent === true && sig.isLive !== true && sig.isLiveNow !== true) {
    return {
      ok: false,
      live: false,
      status: "ended",
      reason: "ended_recording"
    };
  }

  if (sig.isUpcoming === true) {
    return {
      ok: false,
      live: false,
      status: "upcoming",
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
      reason: "recorded_video"
    };
  }

  return {
    ok: false,
    live: false,
    status: "unknown",
    reason: "not_confirmed_live"
  };
}

async function probeViaPlayerApi(youtubeId) {
  try {
    const res = await fetch(
      "https://www.youtube.com/youtubei/v1/player?key=" +
        encodeURIComponent("AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8") +
        "&prettyPrint=false",
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
        source: "watch_html"
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

/**
 * @param {string} youtubeId
 * @returns {Promise<{ok:boolean,live:boolean,status:string,reason:string,title?:string,probed_at:string,source?:string}>}
 */
async function probeYouTubeLive(youtubeId) {
  const id = String(youtubeId || "").trim();
  if (!/^[\w-]{11}$/.test(id)) {
    return {
      ok: false,
      live: false,
      status: "invalid",
      reason: "invalid_youtube_id",
      probed_at: new Date().toISOString()
    };
  }
  const cached = cacheGet(id);
  if (cached) return Object.assign({}, cached, { cached: true });

  const player = await probeViaPlayerApi(id);
  let signals = player;
  let classified = player ? classifyFromSignals(player) : null;

  /* Player API often bot-walls live streams as LOGIN_REQUIRED with empty details.
     Fall back to watch HTML which still exposes isLive for many public cams. */
  const needsHtml =
    !classified ||
    classified.reason === "not_confirmed_live" ||
    (player &&
      String(player.playStatus).toUpperCase() === "LOGIN_REQUIRED" &&
      !player.isLive &&
      !player.isLiveNow);

  if (needsHtml) {
    const htmlSig = await probeViaWatchHtml(id);
    if (htmlSig) {
      signals = Object.assign({}, player || {}, htmlSig, {
        /* Prefer decisive UNPLAYABLE from either source */
        playStatus:
          (player && player.playStatus === "UNPLAYABLE" && player.playStatus) ||
          htmlSig.playStatus ||
          (player && player.playStatus) ||
          "",
        reason:
          (player && /recording|unavailable|removed/i.test(player.reason || "")
            ? player.reason
            : htmlSig.reason) ||
          (player && player.reason) ||
          "",
        isLive: !!(htmlSig.isLive || (player && player.isLive)),
        isLiveNow: !!(htmlSig.isLiveNow || (player && player.isLiveNow)),
        isLiveContent: !!(htmlSig.isLiveContent || (player && player.isLiveContent)),
        liveBroadcastDetails:
          htmlSig.liveBroadcastDetails || (player && player.liveBroadcastDetails) || null,
        title: htmlSig.title || (player && player.title) || "",
        source: "player+html"
      });
      classified = classifyFromSignals(signals);
    }
  }

  if (!classified) {
    classified = {
      ok: false,
      live: false,
      status: "unknown",
      reason: "probe_failed"
    };
  }

  const out = Object.assign({}, classified, {
    title: (signals && signals.title) || "",
    youtube_id: id,
    source: (signals && signals.source) || "probe",
    probed_at: new Date().toISOString()
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
  CACHE_TTL_MS
};
