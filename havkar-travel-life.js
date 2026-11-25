/**
 * HAVKAR Travel Life — personal trips, offline queue, cloud sync (owner RLS).
 * GPS only after HAVKAR_GEO_CONSENT === true. No silent tracking.
 * Screen-off background tracking is OS/native limited; browsers are honest about that.
 */
(function (root) {
  "use strict";

  var IDB_NAME = "havkar_travel_life_v1";
  var IDB_STORE = "pending";
  var IDB_VERSION = 2;
  var SAMPLE_MIN_MS = 8000;
  var SAMPLE_MIN_M = 35;
  var MAX_PENDING = 5000;

  function nativeTravelBridge() {
    if (root.HAVKAR_ANDROID_TRAVEL && typeof root.HAVKAR_ANDROID_TRAVEL.startBackground === "function") {
      return { platform: "android", api: root.HAVKAR_ANDROID_TRAVEL };
    }
    if (root.HAVKAR_IOS_TRAVEL && typeof root.HAVKAR_IOS_TRAVEL.startBackground === "function") {
      return { platform: "ios", api: root.HAVKAR_IOS_TRAVEL };
    }
    return null;
  }

  function parseNativeJson(raw) {
    if (raw == null) return { ok: false, error: "empty" };
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(String(raw));
    } catch (_e) {
      return { ok: false, error: "parse_failed" };
    }
  }

  function supabaseClient() {
    if (!root.supabase || !root.HAVKAR_SUPABASE_CONFIG) return null;
    if (root.__havkarTravelLifeSb) return root.__havkarTravelLifeSb;
    root.__havkarTravelLifeSb = root.supabase.createClient(
      root.HAVKAR_SUPABASE_CONFIG.url,
      root.HAVKAR_SUPABASE_CONFIG.publishableKey
    );
    return root.__havkarTravelLifeSb;
  }

  function openIdb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) {
        reject(new Error("indexeddb_unavailable"));
        return;
      }
      var req = root.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("local_trips")) {
          db.createObjectStore("local_trips", { keyPath: "id" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error || new Error("indexeddb_open_failed"));
      };
    });
  }

  function idbAdd(record) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        var store = tx.objectStore(IDB_STORE);
        var countReq = store.count();
        countReq.onsuccess = function () {
          if (countReq.result >= MAX_PENDING) {
            reject(new Error("offline_queue_full"));
            return;
          }
          store.add(record);
        };
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          reject(tx.error || new Error("indexeddb_write_failed"));
        };
      });
    });
  }

  function idbAll() {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readonly");
        var req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error || new Error("indexeddb_read_failed"));
        };
      });
    });
  }

  function idbClearIds(ids) {
    if (!ids || !ids.length) return Promise.resolve();
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_STORE, "readwrite");
        var store = tx.objectStore(IDB_STORE);
        ids.forEach(function (id) {
          store.delete(id);
        });
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          reject(tx.error || new Error("indexeddb_clear_failed"));
        };
      });
    });
  }

  function haversineM(aLat, aLng, bLat, bLng) {
    var toRad = Math.PI / 180;
    var dLat = (bLat - aLat) * toRad;
    var dLng = (bLng - aLng) * toRad;
    var s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * toRad) * Math.cos(bLat * toRad) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function validTrackPoints(points) {
    return (points || []).filter(function (p) {
      if (!p || p.lat == null || p.lng == null || p.lat === "" || p.lng === "") {
        return false;
      }
      var lat = Number(p.lat);
      var lng = Number(p.lng);
      return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      );
    });
  }

  /** Distance / duration / speed from real GPS samples only — never from place-name labels. */
  function summarizeTrack(points) {
    var pts = validTrackPoints(points);
    var distanceM = 0;
    var maxSpeed = null;
    var speedSum = 0;
    var speedN = 0;
    for (var i = 0; i < pts.length; i++) {
      if (i > 0) {
        distanceM += haversineM(
          Number(pts[i - 1].lat),
          Number(pts[i - 1].lng),
          Number(pts[i].lat),
          Number(pts[i].lng)
        );
      }
      var sp = Number(pts[i].speed_mps);
      if (Number.isFinite(sp) && sp >= 0) {
        speedSum += sp;
        speedN += 1;
        if (maxSpeed == null || sp > maxSpeed) maxSpeed = sp;
      }
    }
    var durationS = 0;
    if (pts.length >= 2) {
      var t0 = Date.parse(pts[0].recorded_at);
      var t1 = Date.parse(pts[pts.length - 1].recorded_at);
      if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
        durationS = Math.round((t1 - t0) / 1000);
      }
    }
    var avgSpeed =
      speedN > 0 ? speedSum / speedN : durationS > 0 ? distanceM / durationS : null;
    return {
      point_count: pts.length,
      distance_m: Math.round(distanceM),
      duration_s: durationS,
      avg_speed_mps: avgSpeed == null ? null : Math.round(avgSpeed * 100) / 100,
      max_speed_mps: maxSpeed == null ? null : Math.round(maxSpeed * 100) / 100,
      has_coordinates: pts.length > 0,
      honesty: pts.length
        ? "Metrics from recorded GPS samples only."
        : "No GPS coordinates recorded. HAVKAR does not invent a path from place names."
    };
  }

  function requireConsent() {
    return root.HAVKAR_GEO_CONSENT === true;
  }

  function sessionUserId(client) {
    return client.auth.getSession().then(function (res) {
      var uid =
        res &&
        res.data &&
        res.data.session &&
        res.data.session.user &&
        res.data.session.user.id;
      return uid || null;
    });
  }

  var active = {
    tripId: null,
    watchId: null,
    lastSampleAt: 0,
    lastLat: null,
    lastLng: null,
    distanceM: 0,
    startedAt: null,
    paused: false,
    localPoints: [],
    wakeLock: null
  };

  function emit(status) {
    try {
      root.dispatchEvent(
        new CustomEvent("havkar-travel-life", { detail: status || {} })
      );
    } catch (_e) {}
  }

  async function ensureWakeLock() {
    try {
      if (root.navigator && root.navigator.wakeLock && root.navigator.wakeLock.request) {
        active.wakeLock = await root.navigator.wakeLock.request("screen");
      }
    } catch (_e) {
      /* Screen Wake Lock optional; browsers may refuse */
    }
  }

  async function releaseWakeLock() {
    try {
      if (active.wakeLock) await active.wakeLock.release();
    } catch (_e) {}
    active.wakeLock = null;
  }

  async function createTrip(partial) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable" };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required" };
    var row = Object.assign(
      {
        user_id: uid,
        title: (partial && partial.title) || "Personal drive",
        trip_type: (partial && partial.trip_type) || "personal_car",
        status: "active",
        started_at: new Date().toISOString(),
        is_private: true
      },
      partial || {}
    );
    var res = await client.from("user_trips").insert(row).select("id").single();
    if (res.error) {
      return {
        ok: false,
        error: res.error.message || "trip_create_failed",
        migration_pending: /relation|schema cache|user_trips/i.test(
          String(res.error.message || "")
        )
      };
    }
    return { ok: true, trip_id: res.data.id };
  }

  async function updateTrip(tripId, patch) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable" };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required" };
    var res = await client
      .from("user_trips")
      .update(Object.assign({ updated_at: new Date().toISOString() }, patch || {}))
      .eq("id", tripId)
      .eq("user_id", uid);
    if (res.error) return { ok: false, error: res.error.message || "trip_update_failed" };
    return { ok: true };
  }

  async function enqueueOrInsertPoint(point) {
    var client = supabaseClient();
    var online = root.navigator ? root.navigator.onLine !== false : true;
    if (!client || !online) {
      await idbAdd({ kind: "track_point", payload: point, queued_at: Date.now() });
      return { ok: true, queued: true };
    }
    var uid = await sessionUserId(client);
    var row = Object.assign({}, point, uid ? { user_id: uid } : {});
    if (!row.user_id) {
      await idbAdd({ kind: "track_point", payload: point, queued_at: Date.now() });
      return { ok: true, queued: true, warn: "sign_in_required" };
    }
    var res = await client.from("trip_track_points").insert(row);
    if (res.error) {
      await idbAdd({ kind: "track_point", payload: point, queued_at: Date.now() });
      return { ok: true, queued: true, warn: res.error.message };
    }
    return { ok: true, queued: false };
  }

  async function saveLocalTripSnapshot(trip) {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction("local_trips", "readwrite");
        tx.objectStore("local_trips").put(trip);
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          reject(tx.error || new Error("local_trip_write_failed"));
        };
      });
    });
  }

  async function listLocalTripSnapshots() {
    return openIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        if (!db.objectStoreNames.contains("local_trips")) {
          resolve([]);
          return;
        }
        var req = db.transaction("local_trips", "readonly").objectStore("local_trips").getAll();
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error || new Error("local_trip_read_failed"));
        };
      });
    }).catch(function () {
      return [];
    });
  }

  async function drainNativePoints() {
    var bridge = nativeTravelBridge();
    if (!bridge) return { ok: true, points: [], platform: null };
    var raw;
    try {
      raw = bridge.api.drainQueuedPoints();
      if (raw && typeof raw.then === "function") raw = await raw;
    } catch (_e) {
      return { ok: false, points: [], error: "native_drain_failed", platform: bridge.platform };
    }
    var parsed = parseNativeJson(raw);
    var points = (parsed && parsed.points) || [];
    for (var i = 0; i < points.length; i++) {
      await enqueueOrInsertPoint(points[i]).catch(function () {
        return null;
      });
    }
    return { ok: true, points: points, platform: bridge.platform, count: points.length };
  }

  async function syncPending() {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable" };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required" };
    var nativeDrain = await drainNativePoints().catch(function () {
      return { count: 0 };
    });
    var rows = await idbAll().catch(function () {
      return [];
    });
    var done = [];
    var syncedStops = 0;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !row.payload) continue;
      if (row.kind === "track_point") {
        var payload = Object.assign({}, row.payload, { user_id: uid });
        var res = await client.from("trip_track_points").insert(payload);
        if (!res.error) done.push(row.id);
      } else if (row.kind === "trip_stop") {
        var stop = Object.assign({}, row.payload, { user_id: uid });
        var stopRes = await client.from("trip_stops").insert(stop);
        if (!stopRes.error) {
          done.push(row.id);
          syncedStops += 1;
        }
      } else if (row.kind === "trip_patch") {
        var patch = row.payload || {};
        if (patch.trip_id) {
          var upd = await client
            .from("user_trips")
            .update(Object.assign({ updated_at: new Date().toISOString() }, patch.fields || {}))
            .eq("id", patch.trip_id)
            .eq("user_id", uid);
          if (!upd.error) done.push(row.id);
        }
      }
    }
    await idbClearIds(done);
    return {
      ok: true,
      synced: done.length,
      synced_stops: syncedStops,
      native_drained: nativeDrain.count || 0,
      remaining: rows.length - done.length
    };
  }

  function onPosition(pos) {
    if (active.paused || !active.tripId) return;
    if (!requireConsent()) return;
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;
    var now = Date.now();
    var moved = 0;
    if (active.lastLat != null) {
      moved = haversineM(active.lastLat, active.lastLng, lat, lng);
    }
    if (
      now - active.lastSampleAt < SAMPLE_MIN_MS &&
      moved < SAMPLE_MIN_M &&
      active.lastLat != null
    ) {
      return;
    }
    if (active.lastLat != null) active.distanceM += moved;
    active.lastSampleAt = now;
    active.lastLat = lat;
    active.lastLng = lng;
    var point = {
      trip_id: active.tripId,
      recorded_at: new Date(pos.timestamp || now).toISOString(),
      lat: lat,
      lng: lng,
      accuracy_m: pos.coords.accuracy,
      speed_mps: pos.coords.speed,
      heading_deg: pos.coords.heading,
      altitude_m: pos.coords.altitude,
      source: "gps"
    };
    active.localPoints.push(point);
    if (active.localPoints.length > 2000) active.localPoints.shift();
    enqueueOrInsertPoint(point).then(function () {
      emit({
        type: "sample",
        trip_id: active.tripId,
        distance_m: active.distanceM,
        speed_mps: pos.coords.speed,
        lat: lat,
        lng: lng,
        accuracy_m: pos.coords.accuracy
      });
    });
  }

  async function startPersonalTrip(opts) {
    if (!requireConsent()) {
      return { ok: false, error: "geolocation_consent_required" };
    }
    if (!root.navigator || !root.navigator.geolocation) {
      return { ok: false, error: "geolocation_unavailable" };
    }
    if (active.watchId != null) {
      return { ok: false, error: "trip_already_active", trip_id: active.tripId };
    }
    var tripOpts = Object.assign({}, opts || {});
    if (tripOpts.origin_label == null && tripOpts.origin) {
      tripOpts.origin_label = tripOpts.origin;
    }
    var created = await createTrip(tripOpts);
    if (!created.ok) {
      /* Local-only fallback when migration pending or offline */
      var localId = "local-" + Date.now();
      active.tripId = localId;
      active.startedAt = Date.now();
      active.distanceM = 0;
      active.paused = false;
      active.localPoints = [];
      await ensureWakeLock();
      active.watchId = root.navigator.geolocation.watchPosition(
        onPosition,
        function () {
          emit({ type: "gps_error", trip_id: localId });
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
      );
      emit({
        type: "started",
        trip_id: localId,
        cloud: false,
        warn: created.error,
        migration_pending: created.migration_pending || false
      });
      return {
        ok: true,
        trip_id: localId,
        cloud: false,
        warn: created.error,
        migration_pending: created.migration_pending || false,
        honesty:
          "Recording on-device. Cloud sync needs sign-in and travel_life tables."
      };
    }
    active.tripId = created.trip_id;
    active.startedAt = Date.now();
    active.distanceM = 0;
    active.paused = false;
    active.localPoints = [];
    await ensureWakeLock();
    active.watchId = root.navigator.geolocation.watchPosition(
      onPosition,
      function () {
        emit({ type: "gps_error", trip_id: active.tripId });
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    );
    addStop(created.trip_id, {
      kind: "origin",
      label: tripOpts.origin_label || "Start",
      seq: 0
    }).catch(function () {
      return null;
    });
    var native = nativeTravelBridge();
    var nativeStart = null;
    if (native) {
      try {
        nativeStart = parseNativeJson(native.api.startBackground(String(created.trip_id)));
      } catch (_e) {
        nativeStart = { ok: false, error: "native_start_failed" };
      }
    }
    saveLocalTripSnapshot({
      id: created.trip_id,
      status: "active",
      started_at: new Date().toISOString(),
      title: tripOpts.title || "Personal drive",
      origin_label: tripOpts.origin_label || null,
      offline: false
    }).catch(function () {
      return null;
    });
    emit({
      type: "started",
      trip_id: active.tripId,
      cloud: true,
      native_background: nativeStart
    });
    return {
      ok: true,
      trip_id: active.tripId,
      cloud: true,
      native_background: nativeStart,
      honesty: native
        ? "Foreground watch + native background GPS bridge armed for this trip (Android FGS / iOS CLLocation). Consent required."
        : "Foreground GPS with consent. Screen-off needs the HAVKAR Android/iOS app build with the travel GPS bridge."
    };
  }

  function pauseTrip() {
    active.paused = true;
    if (active.tripId && String(active.tripId).indexOf("local-") !== 0) {
      addStop(active.tripId, {
        kind: "pause",
        label: "Pause",
        lat: active.lastLat,
        lng: active.lastLng
      }).catch(function () {
        return null;
      });
      updateTrip(active.tripId, { status: "paused" }).catch(function () {
        return null;
      });
    }
    emit({ type: "paused", trip_id: active.tripId, distance_m: active.distanceM });
    return { ok: true };
  }

  function resumeTrip() {
    if (!requireConsent()) return { ok: false, error: "geolocation_consent_required" };
    active.paused = false;
    if (active.tripId && String(active.tripId).indexOf("local-") !== 0) {
      updateTrip(active.tripId, { status: "active" }).catch(function () {
        return null;
      });
    }
    emit({ type: "resumed", trip_id: active.tripId });
    return { ok: true };
  }

  async function stopTrip(opts) {
    opts = opts || {};
    if (active.watchId != null && root.navigator && root.navigator.geolocation) {
      try {
        root.navigator.geolocation.clearWatch(active.watchId);
      } catch (_e) {}
    }
    active.watchId = null;
    var native = nativeTravelBridge();
    if (native) {
      try {
        native.api.stopBackground();
      } catch (_e) {}
    }
    await drainNativePoints().catch(function () {
      return null;
    });
    await releaseWakeLock();
    var durationS = active.startedAt
      ? Math.max(0, Math.round((Date.now() - active.startedAt) / 1000))
      : 0;
    var tripId = active.tripId;
    var distanceM = active.distanceM;
    if (tripId && String(tripId).indexOf("local-") !== 0) {
      var destLabel = opts.destination_label || opts.destination || "End";
      await updateTrip(tripId, {
        status: "completed",
        ended_at: new Date().toISOString(),
        distance_m: distanceM,
        duration_s: durationS,
        destination_label: destLabel
      });
      await addStop(tripId, {
        kind: "destination",
        label: destLabel,
        lat: active.lastLat,
        lng: active.lastLng,
        seq: 9999
      }).catch(function () {
        return null;
      });
    } else if (tripId) {
      try {
        root.localStorage.setItem(
          "havkar_local_trip_" + tripId,
          JSON.stringify({
            id: tripId,
            status: "completed",
            distance_m: distanceM,
            duration_s: durationS,
            points: active.localPoints.slice(-500),
            ended_at: new Date().toISOString()
          })
        );
      } catch (_e) {}
    }
    emit({
      type: "stopped",
      trip_id: tripId,
      distance_m: distanceM,
      duration_s: durationS
    });
    active.tripId = null;
    active.paused = false;
    await syncPending().catch(function () {
      return null;
    });
    return { ok: true, trip_id: tripId, distance_m: distanceM, duration_s: durationS };
  }

  async function listMyTrips(limit) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable", trips: [] };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required", trips: [] };
    var res = await client
      .from("user_trips")
      .select(
        "id,title,trip_type,status,started_at,ended_at,distance_m,duration_s,origin_label,destination_label,countries,cities,notes,is_private,created_at"
      )
      .eq("user_id", uid)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(Math.min(Number(limit) || 50, 200));
    if (res.error) {
      return {
        ok: false,
        error: res.error.message || "list_failed",
        trips: [],
        migration_pending: /relation|schema cache|user_trips/i.test(
          String(res.error.message || "")
        )
      };
    }
    return { ok: true, trips: res.data || [] };
  }

  async function deleteTrip(tripId) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable" };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required" };
    var res = await client.from("user_trips").delete().eq("id", tripId).eq("user_id", uid);
    if (res.error) return { ok: false, error: res.error.message || "delete_failed" };
    return { ok: true };
  }

  async function saveReminderPrefs(prefs) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable" };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required" };
    var row = Object.assign({ user_id: uid, updated_at: new Date().toISOString() }, prefs || {});
    var res = await client.from("user_reminder_prefs").upsert(row, { onConflict: "user_id" });
    if (res.error) {
      return {
        ok: false,
        error: res.error.message || "prefs_failed",
        migration_pending: /relation|schema cache|user_reminder_prefs/i.test(
          String(res.error.message || "")
        )
      };
    }
    return { ok: true };
  }

  async function loadReminderPrefs() {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable" };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required" };
    var res = await client.from("user_reminder_prefs").select("*").eq("user_id", uid).maybeSingle();
    if (res.error) {
      return {
        ok: false,
        error: res.error.message || "prefs_load_failed",
        migration_pending: /relation|schema cache|user_reminder_prefs/i.test(
          String(res.error.message || "")
        )
      };
    }
    return { ok: true, prefs: res.data || null };
  }

  async function renameTrip(tripId, title, notes) {
    var patch = {};
    if (title != null) patch.title = String(title).slice(0, 120);
    if (notes != null) patch.notes = String(notes).slice(0, 4000);
    return updateTrip(tripId, patch);
  }

  async function exportMyTripsJson() {
    var listed = await listMyTrips(200);
    if (!listed.ok) return listed;
    var blob = {
      exported_at: new Date().toISOString(),
      source: "havkar_travel_life",
      private: true,
      trips: listed.trips || []
    };
    return { ok: true, json: JSON.stringify(blob, null, 2), trips: listed.trips };
  }

  async function createAlbum(tripId, title) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable" };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required" };
    var res = await client
      .from("trip_albums")
      .insert({
        trip_id: tripId,
        user_id: uid,
        title: String(title || "Trip album").slice(0, 120),
        is_private: true
      })
      .select("id")
      .single();
    if (res.error) {
      return {
        ok: false,
        error: res.error.message || "album_create_failed",
        migration_pending: /relation|schema cache|trip_albums/i.test(
          String(res.error.message || "")
        )
      };
    }
    return { ok: true, album_id: res.data.id };
  }

  function compressImageIfNeeded(file, maxBytes) {
    maxBytes = maxBytes || 4 * 1024 * 1024;
    if (!file || !/^image\//.test(file.type) || file.size <= maxBytes) {
      return Promise.resolve(file);
    }
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          var scale = Math.min(1, Math.sqrt(maxBytes / file.size));
          canvas.width = Math.max(1, Math.floor(img.width * scale));
          canvas.height = Math.max(1, Math.floor(img.height * scale));
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            function (blob) {
              URL.revokeObjectURL(url);
              if (!blob) {
                resolve(file);
                return;
              }
              resolve(
                new File([blob], (file.name || "photo").replace(/\.\w+$/, "") + ".jpg", {
                  type: "image/jpeg"
                })
              );
            },
            "image/jpeg",
            0.82
          );
        } catch (_e) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  async function uploadTripMedia(opts) {
    opts = opts || {};
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable" };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required" };
    if (!opts.trip_id || !opts.file) return { ok: false, error: "trip_and_file_required" };
    var file = await compressImageIfNeeded(opts.file, 4 * 1024 * 1024);
    if (file.size > 52428800) return { ok: false, error: "file_too_large_50mb" };
    var albumId = opts.album_id;
    if (!albumId) {
      var album = await createAlbum(opts.trip_id, opts.album_title || "Trip album");
      if (!album.ok) return album;
      albumId = album.album_id;
    }
    var ext = (file.name && file.name.split(".").pop()) || "bin";
    var path = uid + "/" + opts.trip_id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + ext;
    var up = await client.storage.from("travel-media").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
    if (up.error) {
      return {
        ok: false,
        error: up.error.message || "upload_failed",
        migration_pending: /bucket|not found|travel-media/i.test(String(up.error.message || ""))
      };
    }
    var mediaType = /^video\//.test(file.type) ? "video" : "photo";
    var row = {
      album_id: albumId,
      trip_id: opts.trip_id,
      user_id: uid,
      storage_path: path,
      media_type: mediaType,
      mime_type: file.type || null,
      byte_size: file.size,
      taken_at: new Date().toISOString(),
      is_private: true,
      caption: opts.caption ? String(opts.caption).slice(0, 500) : null
    };
    if (opts.attach_geo && requireConsent() && active.lastLat != null) {
      row.lat = active.lastLat;
      row.lng = active.lastLng;
    } else if (opts.lat != null && opts.lng != null && requireConsent()) {
      row.lat = opts.lat;
      row.lng = opts.lng;
    }
    var ins = await client.from("trip_media").insert(row).select("id").single();
    if (ins.error) {
      return { ok: false, error: ins.error.message || "media_row_failed", storage_path: path };
    }
    return { ok: true, media_id: ins.data.id, album_id: albumId, storage_path: path, private: true };
  }

  function yearlyStats(trips) {
    var byYear = {};
    var byMonth = {};
    var totalM = 0;
    (trips || []).forEach(function (t) {
      var stamp = t.started_at || t.created_at || "";
      var y = String(stamp.slice(0, 4) || "unknown");
      var ym = String(stamp.slice(0, 7) || "unknown");
      if (!byYear[y]) byYear[y] = { year: y, trips: 0, distance_m: 0 };
      if (!byMonth[ym]) byMonth[ym] = { month: ym, trips: 0, distance_m: 0 };
      byYear[y].trips += 1;
      byYear[y].distance_m += Number(t.distance_m) || 0;
      byMonth[ym].trips += 1;
      byMonth[ym].distance_m += Number(t.distance_m) || 0;
      totalM += Number(t.distance_m) || 0;
    });
    return {
      by_year: byYear,
      by_month: byMonth,
      total_distance_m: totalM,
      trip_count: (trips || []).length
    };
  }

  async function addStop(tripId, partial) {
    var client = supabaseClient();
    var uid = client ? await sessionUserId(client) : null;
    var row = Object.assign(
      {
        trip_id: tripId,
        user_id: uid || null,
        kind: "waypoint",
        seq: 0,
        lat: active.lastLat,
        lng: active.lastLng,
        arrived_at: new Date().toISOString()
      },
      partial || {}
    );
    var online = root.navigator ? root.navigator.onLine !== false : true;
    if (!client || !uid || !online) {
      await idbAdd({ kind: "trip_stop", payload: row, queued_at: Date.now() });
      emit({ type: "stop_added", trip_id: tripId, queued: true, label: row.label });
      return { ok: true, queued: true };
    }
    var res = await client.from("trip_stops").insert(row).select("id").single();
    if (res.error) {
      await idbAdd({ kind: "trip_stop", payload: row, queued_at: Date.now() });
      return {
        ok: true,
        queued: true,
        warn: res.error.message || "stop_failed",
        migration_pending: /relation|schema cache|trip_stops/i.test(
          String(res.error.message || "")
        )
      };
    }
    emit({ type: "stop_added", trip_id: tripId, stop_id: res.data.id, label: row.label });
    return { ok: true, stop_id: res.data.id };
  }

  async function listStops(tripId) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable", stops: [] };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required", stops: [] };
    var res = await client
      .from("trip_stops")
      .select("id,seq,label,lat,lng,arrived_at,departed_at,kind")
      .eq("trip_id", tripId)
      .eq("user_id", uid)
      .order("seq", { ascending: true });
    if (res.error) return { ok: false, error: res.error.message, stops: [] };
    return { ok: true, stops: res.data || [] };
  }

  async function loadTrackPoints(tripId, limit) {
    var lim = Math.min(Number(limit) || 2000, 5000);
    if (!tripId) {
      return {
        ok: true,
        points: [],
        source: "none",
        honesty:
          "No GPS coordinates recorded for this trip. No invented route."
      };
    }
    /* In-memory samples for the active recording session */
    if (active.tripId && String(active.tripId) === String(tripId) && active.localPoints.length) {
      return {
        ok: true,
        points: validTrackPoints(active.localPoints).slice(-lim),
        source: "active",
        summary: summarizeTrack(active.localPoints)
      };
    }
    /* Local-only completed trips (no cloud UUID) */
    try {
      if (root.localStorage) {
        var raw = root.localStorage.getItem("havkar_local_trip_" + tripId);
        if (raw) {
          var parsed = JSON.parse(raw);
          var localPts = validTrackPoints(parsed.points || []);
          return {
            ok: true,
            points: localPts.slice(-lim),
            source: "local_storage",
            summary: summarizeTrack(localPts),
            honesty: localPts.length
              ? null
              : "No GPS coordinates recorded for this trip. No invented route."
          };
        }
      }
    } catch (_e) {}

    var client = supabaseClient();
    if (!client) {
      return {
        ok: true,
        points: [],
        source: "none",
        honesty:
          "No GPS coordinates available offline. HAVKAR does not invent a path from place names."
      };
    }
    var uid = await sessionUserId(client);
    if (!uid) {
      return {
        ok: true,
        points: [],
        source: "none",
        honesty:
          "Sign in required to load cloud GPS. No invented route was drawn."
      };
    }
    var res = await client
      .from("trip_track_points")
      .select("lat,lng,recorded_at,speed_mps,accuracy_m")
      .eq("trip_id", tripId)
      .eq("user_id", uid)
      .order("recorded_at", { ascending: true })
      .limit(lim);
    if (res.error) {
      return { ok: false, error: res.error.message, points: [], source: "cloud_error" };
    }
    var cloudPts = validTrackPoints(res.data || []);
    return {
      ok: true,
      points: cloudPts,
      source: cloudPts.length ? "cloud" : "none",
      summary: summarizeTrack(cloudPts),
      honesty: cloudPts.length
        ? null
        : "No GPS coordinates recorded for this trip. No invented route."
    };
  }

  function randomToken() {
    var bytes = new Uint8Array(24);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
    else for (var i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
    var s = "";
    for (var j = 0; j < bytes.length; j++) s += ("0" + bytes[j].toString(16)).slice(-2);
    return s;
  }

  async function createShareLink(tripId, opts) {
    opts = opts || {};
    var days = Math.min(Math.max(Number(opts.days) || 7, 1), 30);
    var expires = new Date(Date.now() + days * 86400000).toISOString();
    var token = randomToken();
    var patch = {
      is_private: false,
      share_token: token,
      share_expires_at: expires,
      share_include_media: !!opts.include_media,
      share_include_geo: !!opts.include_geo,
      share_include_track: opts.include_track !== false
    };
    var updated = await updateTrip(tripId, patch);
    if (!updated.ok) return updated;
    var origin = root.location && root.location.origin ? root.location.origin : "https://havkar.online";
    return {
      ok: true,
      token: token,
      expires_at: expires,
      url: origin + "/travel-share.html?token=" + encodeURIComponent(token),
      honesty:
        "Share is opt-in and time-limited. Exact GPS/media only if you enabled those flags. Revoke anytime."
    };
  }

  async function revokeShare(tripId) {
    return updateTrip(tripId, {
      is_private: true,
      share_token: null,
      share_expires_at: null,
      share_include_media: false,
      share_include_geo: false,
      share_include_track: false
    });
  }

  async function listAlbums(tripId) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable", albums: [] };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required", albums: [] };
    var res = await client
      .from("trip_albums")
      .select("id,title,is_private,created_at")
      .eq("trip_id", tripId)
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (res.error) return { ok: false, error: res.error.message, albums: [] };
    return { ok: true, albums: res.data || [] };
  }

  async function listMedia(tripId) {
    var client = supabaseClient();
    if (!client) return { ok: false, error: "supabase_unavailable", media: [] };
    var uid = await sessionUserId(client);
    if (!uid) return { ok: false, error: "sign_in_required", media: [] };
    var res = await client
      .from("trip_media")
      .select("id,album_id,media_type,mime_type,byte_size,taken_at,lat,lng,caption,is_private,storage_path")
      .eq("trip_id", tripId)
      .eq("user_id", uid)
      .order("taken_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (res.error) return { ok: false, error: res.error.message, media: [] };
    return { ok: true, media: res.data || [] };
  }

  if (root.addEventListener) {
    root.addEventListener("online", function () {
      syncPending().then(function (r) {
        emit({ type: "sync", result: r });
      });
    });
  }

  root.HAVKAR_TRAVEL_LIFE = {
    startPersonalTrip: startPersonalTrip,
    pauseTrip: pauseTrip,
    resumeTrip: resumeTrip,
    stopTrip: stopTrip,
    listMyTrips: listMyTrips,
    deleteTrip: deleteTrip,
    renameTrip: renameTrip,
    exportMyTripsJson: exportMyTripsJson,
    createAlbum: createAlbum,
    uploadTripMedia: uploadTripMedia,
    listAlbums: listAlbums,
    listMedia: listMedia,
    yearlyStats: yearlyStats,
    addStop: addStop,
    listStops: listStops,
    loadTrackPoints: loadTrackPoints,
    summarizeTrack: summarizeTrack,
    validTrackPoints: validTrackPoints,
    createShareLink: createShareLink,
    revokeShare: revokeShare,
    syncPending: syncPending,
    drainNativePoints: drainNativePoints,
    listLocalTripSnapshots: listLocalTripSnapshots,
    saveReminderPrefs: saveReminderPrefs,
    loadReminderPrefs: loadReminderPrefs,
    getActive: function () {
      return {
        trip_id: active.tripId,
        paused: active.paused,
        distance_m: active.distanceM,
        points: active.localPoints.length,
        last_lat: active.lastLat,
        last_lng: active.lastLng,
        native: Boolean(nativeTravelBridge())
      };
    },
    nativeBridgeAvailable: function () {
      return Boolean(nativeTravelBridge());
    },
    browserBackgroundHonesty:
      "Mobile browsers generally cannot guarantee continuous GPS with the screen off. Use the HAVKAR Android/iOS app for background recording after consent.",
    nativeBackgroundReady:
      "Android Foreground Service (location) + iOS CLLocation Always bridge are wired. WebView alone still cannot guarantee screen-off GPS."
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
