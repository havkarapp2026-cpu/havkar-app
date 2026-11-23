/*
 * Services geo helpers — haversine distance for in-person filtering.
 * Does not store or expose private customer addresses.
 */

function toRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (
    ![aLat, aLon, bLat, bLon].every((n) => Number.isFinite(n)) ||
    aLat < -90 ||
    aLat > 90 ||
    bLat < -90 ||
    bLat > 90 ||
    aLon < -180 ||
    aLon > 180 ||
    bLon < -180 ||
    bLon > 180
  ) {
    return null;
  }
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) *
      Math.cos(toRad(bLat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 100) / 100;
}

function filterServicesByDistance(services, origin, maxKm) {
  const lat = origin && Number(origin.latitude);
  const lon = origin && Number(origin.longitude);
  const radius = Number(maxKm);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius) || radius <= 0) {
    return Array.isArray(services) ? services.slice() : [];
  }
  return (services || [])
    .map((row) => {
      const d = haversineKm(lat, lon, row.latitude, row.longitude);
      return Object.assign({}, row, {
        distance_km: d,
        distance_available: d != null
      });
    })
    .filter((row) => {
      if (String(row.service_mode || row.delivery_mode || "").toLowerCase() === "online") {
        return true;
      }
      return row.distance_available && row.distance_km <= radius;
    })
    .sort((a, b) => {
      const da = a.distance_km == null ? Number.POSITIVE_INFINITY : a.distance_km;
      const db = b.distance_km == null ? Number.POSITIVE_INFINITY : b.distance_km;
      return da - db;
    });
}

function osmEmbedUrl(lat, lon, zoom) {
  const a = Number(lat);
  const b = Number(lon);
  const z = Number(zoom) || 14;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const delta = 0.02;
  return (
    "https://www.openstreetmap.org/export/embed.html?bbox=" +
    encodeURIComponent(
      [b - delta, a - delta, b + delta, a + delta].join(",")
    ) +
    "&layer=mapnik&marker=" +
    encodeURIComponent(a + "," + b) +
    "&zoom=" +
    encodeURIComponent(String(z))
  );
}

module.exports = {
  haversineKm,
  filterServicesByDistance,
  osmEmbedUrl
};
