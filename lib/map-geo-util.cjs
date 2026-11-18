/**
 * Shared map geo helpers (haversine + bbox from radius).
 * No invented coordinates.
 */

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bboxFromRadiusKm(lat, lng, radiusKm) {
  const r = Math.min(Math.max(Number(radiusKm) || 5, 0.2), 40);
  const latN = Number(lat);
  const lngN = Number(lng);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return null;
  const dLat = r / 111.32;
  const cosLat = Math.cos((latN * Math.PI) / 180);
  const dLng = r / (111.32 * Math.max(Math.abs(cosLat), 0.05));
  return {
    west: lngN - dLng,
    south: latN - dLat,
    east: lngN + dLng,
    north: latN + dLat,
    radius_km: r
  };
}

function parseLatLngRadius(query) {
  const q = query || {};
  const lat = Number(q.lat != null ? q.lat : q.latitude);
  const lng = Number(q.lng != null ? q.lng : q.longitude);
  let radius = Number(q.radius_km != null ? q.radius_km : q.radius);
  if (!Number.isFinite(radius) || radius <= 0) radius = 5;
  radius = Math.min(Math.max(radius, 0.2), 40);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, radius_km: radius };
}

module.exports = {
  haversineKm,
  bboxFromRadiusKm,
  parseLatLngRadius
};
