package online.havkar.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * Foreground GPS sampler for consented personal trips.
 * Queues points in SharedPreferences for the WebView to drain/sync.
 * Never starts without an explicit start intent from the JS bridge.
 */
class TravelLocationService : Service(), LocationListener {
    private var locationManager: LocationManager? = null
    private var tripId: String = ""

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopTracking()
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                tripId = intent?.getStringExtra(EXTRA_TRIP_ID)?.trim().orEmpty()
                if (tripId.isEmpty()) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                startAsForeground()
                startTracking()
            }
        }
        return START_STICKY
    }

    private fun startAsForeground() {
        ensureChannel()
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("HAVKAR trip recording")
            .setContentText("Personal GPS is active. Stop anytime in Tickets.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val mgr = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Trip recording",
            NotificationManager.IMPORTANCE_LOW
        )
        channel.description = "Shows while a personal HAVKAR trip is recording in the background."
        mgr.createNotificationChannel(channel)
    }

    private fun startTracking() {
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        locationManager = lm
        try {
            lm.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                MIN_TIME_MS,
                MIN_DISTANCE_M,
                this,
                Looper.getMainLooper()
            )
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    MIN_TIME_MS,
                    MIN_DISTANCE_M,
                    this,
                    Looper.getMainLooper()
                )
            }
        } catch (_: SecurityException) {
            stopSelf()
        }
    }

    private fun stopTracking() {
        try {
            locationManager?.removeUpdates(this)
        } catch (_: Exception) {
        }
        locationManager = null
        stopForeground(STOP_FOREGROUND_REMOVE)
    }

    override fun onDestroy() {
        stopTracking()
        super.onDestroy()
    }

    override fun onLocationChanged(location: Location) {
        if (tripId.isEmpty()) return
        val point = JSONObject()
            .put("trip_id", tripId)
            .put("lat", location.latitude)
            .put("lng", location.longitude)
            .put("accuracy_m", location.accuracy.toDouble())
            .put("speed_mps", if (location.hasSpeed()) location.speed.toDouble() else JSONObject.NULL)
            .put("heading_deg", if (location.hasBearing()) location.bearing.toDouble() else JSONObject.NULL)
            .put("altitude_m", if (location.hasAltitude()) location.altitude else JSONObject.NULL)
            .put("recorded_at", iso8601(location.time))
            .put("source", "android_fgs")
        appendPoint(this, point)
    }

    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}

    companion object {
        const val ACTION_START = "online.havkar.app.TRAVEL_GPS_START"
        const val ACTION_STOP = "online.havkar.app.TRAVEL_GPS_STOP"
        const val EXTRA_TRIP_ID = "trip_id"
        private const val CHANNEL_ID = "havkar_travel_gps"
        private const val NOTIF_ID = 28901
        private const val PREFS = "havkar_travel_gps_queue"
        private const val KEY_POINTS = "points"
        private const val MIN_TIME_MS = 8000L
        private const val MIN_DISTANCE_M = 25f
        private const val MAX_POINTS = 4000

        fun appendPoint(context: Context, point: JSONObject) {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val arr = try {
                JSONArray(prefs.getString(KEY_POINTS, "[]"))
            } catch (_: Exception) {
                JSONArray()
            }
            arr.put(point)
            while (arr.length() > MAX_POINTS) {
                arr.remove(0)
            }
            prefs.edit().putString(KEY_POINTS, arr.toString()).apply()
        }

        fun drainPoints(context: Context): String {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_POINTS, "[]") ?: "[]"
            prefs.edit().putString(KEY_POINTS, "[]").apply()
            return raw
        }

        fun queuedCount(context: Context): Int {
            return try {
                JSONArray(
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getString(KEY_POINTS, "[]")
                ).length()
            } catch (_: Exception) {
                0
            }
        }

        private fun iso8601(epochMs: Long): String {
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
            return sdf.format(java.util.Date(epochMs))
        }
    }
}
