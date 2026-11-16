/*
 * Destination geocoding via OpenStreetMap Nominatim.
 * Used for hotel search map centering — never invents coordinates.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

async function geocodeDestination(query, fetchImpl = fetch) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return {
      ok: false,
      error: "Enter a city or destination with at least 2 characters."
    };
  }

  let response;
  try {
    const url =
      NOMINATIM +
      "?format=jsonv2&limit=6&addressdetails=1&q=" +
      encodeURIComponent(q);
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "HAVKAR-Accommodation/1.0 (hotels-search; https://havkar.online)"
      }
    });
  } catch (_error) {
    return { ok: false, error: "Geocoding network error." };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: "Geocoding provider rejected the request.",
      http_status: response.status
    };
  }

  let rows = [];
  try {
    rows = await response.json();
  } catch (_e) {
    return { ok: false, error: "Geocoding response was not JSON." };
  }

  if (!Array.isArray(rows) || !rows.length) {
    return { ok: false, error: "No matching destination found.", results: [] };
  }

  const results = rows
    .map((row) => {
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const address = row.address || {};
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        null;
      const region =
        address.state || address.region || address.province || null;
      return {
        label: row.display_name || q,
        latitude: lat,
        longitude: lon,
        type: row.type || row.class || null,
        country_code: address.country_code || null,
        city,
        region,
        address: {
          city,
          region,
          country_code: address.country_code || null,
          road: address.road || null,
          postcode: address.postcode || null,
          country: address.country || null
        }
      };
    })
    .filter(Boolean);

  if (!results.length) {
    return { ok: false, error: "No usable coordinates returned.", results: [] };
  }

  return {
    ok: true,
    query: q,
    provider: "openstreetmap_nominatim",
    primary: results[0],
    results
  };
}

module.exports = {
  geocodeDestination
};
