package online.havkar.app

import android.content.Context
import android.content.Intent
import android.os.Build
import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat

/**
 * WebView bridge: window.HAVKAR_ANDROID_TRAVEL
 * Only called after web consent + signed-in personal trip start.
 */
class TravelGpsBridge(private val context: Context) {
    @JavascriptInterface
    fun startBackground(tripId: String): String {
        val id = tripId.trim()
        if (id.isEmpty() || id.startsWith("local-")) {
            return """{"ok":false,"error":"cloud_trip_required"}"""
        }
        val intent = Intent(context, TravelLocationService::class.java).apply {
            action = TravelLocationService.ACTION_START
            putExtra(TravelLocationService.EXTRA_TRIP_ID, id)
        }
        return try {
            ContextCompat.startForegroundService(context, intent)
            """{"ok":true,"mode":"android_fgs","trip_id":${JSONString(id)}}"""
        } catch (e: Exception) {
            """{"ok":false,"error":${JSONString(e.message ?: "start_failed")}}"""
        }
    }

    @JavascriptInterface
    fun stopBackground(): String {
        val intent = Intent(context, TravelLocationService::class.java).apply {
            action = TravelLocationService.ACTION_STOP
        }
        return try {
            context.startService(intent)
            """{"ok":true}"""
        } catch (e: Exception) {
            """{"ok":false,"error":${JSONString(e.message ?: "stop_failed")}}"""
        }
    }

    @JavascriptInterface
    fun drainQueuedPoints(): String {
        val points = TravelLocationService.drainPoints(context)
        return """{"ok":true,"points":$points}"""
    }

    @JavascriptInterface
    fun queuedCount(): Int = TravelLocationService.queuedCount(context)

    @JavascriptInterface
    fun platform(): String = "android"

    @JavascriptInterface
    fun sdkInt(): Int = Build.VERSION.SDK_INT

    private fun JSONString(value: String): String {
        val escaped = value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
        return "\"$escaped\""
    }
}
