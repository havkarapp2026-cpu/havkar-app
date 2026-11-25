/**
 * Grounded smart guide for stays / trips / health access.
 * Rule-based from real TomTom POI + optional routing inputs — no paid LLM,
 * no invented safety scores, hotel quality, or room inventory.
 */

import { createRequire } from "node:module";
import nearbyPoisHandler from "./map-nearby-pois.mjs";

const require = createRequire(import.meta.url);
const { travelPlusStatus } = require("./havkar-travel-plus.cjs");

function send(res, status, body) {
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(status).json(body);
}

function parseCenter(q) {
  const lat = Number(q.lat != null ? q.lat : q.latitude);
  const lng = Number(q.lng != null ? q.lng : q.longitude != null ? q.longitude : q.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: lat, lng: lng };
}

async function loadPois(center, radiusM) {
  const out = { statusCode: 0, body: null };
  const res = {
    setHeader() {},
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(body) {
      out.body = body;
      return this;
    }
  };
  await nearbyPoisHandler(
    {
      method: "GET",
      query: {
        lat: String(center.lat),
        lng: String(center.lng),
        radius_m: String(radiusM),
        limit: "4",
        category: "all"
      }
    },
    res
  );
  return out.body || { ok: false, groups: [], places: [] };
}

function buildInsights(poisBody, context) {
  const insights = [];
  const limits = [];
  const groups = (poisBody && poisBody.groups) || [];
  const byId = {};
  groups.forEach(function (g) {
    byId[g.id] = g;
  });

  function count(id) {
    return (byId[id] && byId[id].count) || 0;
  }
  function nearest(id) {
    const places = (byId[id] && byId[id].places) || [];
    return places[0] || null;
  }

  const ph = nearest("pharmacy");
  if (ph) {
    insights.push({
      id: "pharmacy_near",
      title: "Pharmacy within walking/driving reach of listing coords",
      detail:
        ph.name +
        " is about " +
        ph.distance_m +
        " m away (TomTom POI, haversine).",
      source: "tomtom_poi_search",
      fetched_at: ph.fetched_at,
      confidence: "coordinate_distance_only"
    });
  } else {
    limits.push({
      id: "pharmacy_missing",
      detail:
        "No TomTom pharmacy POI in this radius. That may mean sparse catalog coverage — not proof that none exist."
    });
  }

  const hosp = nearest("hospital");
  if (hosp) {
    insights.push({
      id: "hospital_near",
      title: "Hospital / clinic POI near stay",
      detail: hosp.name + " · ~" + hosp.distance_m + " m (TomTom).",
      source: "tomtom_poi_search",
      fetched_at: hosp.fetched_at,
      confidence: "coordinate_distance_only"
    });
  }

  const transit = nearest("transit");
  if (transit) {
    insights.push({
      id: "transit_near",
      title: "Public transport POI nearby",
      detail: transit.name + " · ~" + transit.distance_m + " m (TomTom).",
      source: "tomtom_poi_search",
      fetched_at: transit.fetched_at,
      confidence: "coordinate_distance_only"
    });
  } else {
    limits.push({
      id: "transit_missing",
      detail: "No TomTom transit station match in radius — check official local transit maps."
    });
  }

  const food = count("restaurant");
  if (food > 0) {
    insights.push({
      id: "food_count",
      title: "Restaurants indexed nearby",
      detail: food + " TomTom restaurant POIs in radius (not a quality ranking).",
      source: "tomtom_poi_search",
      confidence: "catalog_count"
    });
  }

  limits.push({
    id: "no_safety_claim",
    detail:
      "HAVKAR does not score neighborhood safety, hotel star quality, or room availability without verified evidence."
  });
  limits.push({
    id: "no_diagnosis",
    detail:
      "Health POIs are access guides only — not diagnosis, prescriptions, or emergency response."
  });

  if (context === "health") {
    insights.push({
      id: "health_access",
      title: "Health access tip",
      detail:
        "Use verified HAVKAR providers when published; otherwise TomTom hospital/pharmacy POIs are location hints only. Emergencies: local emergency services.",
      source: "havkar_policy",
      confidence: "policy"
    });
  }

  return { insights: insights, limits: limits };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { ok: false, error: "method_not_allowed" });
  }

  const q =
    req.method === "POST" && req.body && typeof req.body === "object"
      ? Object.assign({}, req.query || {}, req.body)
      : req.query || {};
  const center = parseCenter(q);
  if (!center) {
    return send(res, 400, {
      ok: false,
      error: "invalid_location",
      message: "Provide lat and lng for the place under review."
    });
  }

  let radiusM = Number(q.radius_m || q.radius || 3000);
  if (!Number.isFinite(radiusM)) radiusM = 3000;
  radiusM = Math.min(Math.max(Math.floor(radiusM), 200), 15000);
  const context = String(q.context || "stay").toLowerCase();

  const pois = await loadPois(center, radiusM);
  const built = buildInsights(pois, context);
  const plus = travelPlusStatus();

  return send(res, 200, {
    ok: true,
    available: Boolean(pois && pois.ok),
    engine: "havkar_grounded_rules_v1",
    paid_llm: false,
    free_for_users: true,
    center: { latitude: center.lat, longitude: center.lng },
    radius_m: radiusM,
    context: context,
    insights: built.insights,
    limits: built.limits,
    poi_summary: {
      count: (pois && pois.count) || 0,
      groups: (pois && pois.groups) || [],
      source: (pois && pois.provider) || null,
      last_updated: (pois && pois.last_updated) || null,
      honesty: (pois && pois.honesty) || null
    },
    travel_plus: {
      sales_enabled: plus.sales_enabled === true,
      armed: plus.armed === true,
      free_features_preserved: plus.free_features_preserved !== false,
      message: plus.message
    },
    honesty:
      "Suggestions cite TomTom POI distances and HAVKAR policy only. Missing data is stated openly. No paid AI model is called.",
    fetched_at: new Date().toISOString()
  });
}
