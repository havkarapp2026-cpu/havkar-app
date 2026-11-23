package online.havkar.app

import java.net.URI

object HavkarLinks {
    /** Canonical public home — always the 15-tile HAVKAR start surface. */
    const val START_URL = "https://havkar.online/"

    fun isAllowedNavigation(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        val uri = try {
            URI(url.trim())
        } catch (_: Exception) {
            return false
        }
        if (!uri.scheme.equals("https", ignoreCase = true)) return false
        if (!uri.userInfo.isNullOrEmpty()) return false
        val host = uri.host?.lowercase()?.trim('.') ?: return false
        if (host.isEmpty() || host.contains("..")) return false
        return isAppHost(host) || isSignInHost(host)
    }

    /**
     * Owner micro-test checkout pages must never be the app launch/home surface.
     * Real Services / Buy & Sell checkout flows use other paths and stay allowed.
     */
    fun isOwnerMicroTestPath(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        val path = try {
            URI(url.trim()).path?.lowercase() ?: return false
        } catch (_: Exception) {
            return false
        }
        return path.contains("owner-eur1-checkout") ||
            path.contains("owner-jobs-micro") ||
            path.contains("owner-eur1")
    }

    /**
     * Resolve the URL loaded when the Android shell starts or returns via launcher.
     * Launcher / MAIN always opens Home. Owner EUR micro-test URLs never become start.
     */
    fun resolveLaunchUrl(incoming: String?, launcherIntent: Boolean): String {
        if (launcherIntent) return START_URL
        if (!isAllowedNavigation(incoming)) return START_URL
        if (!isAppContentUrl(incoming)) return START_URL
        if (isOwnerMicroTestPath(incoming)) return START_URL
        return incoming!!.trim()
    }

    fun isAppContentUrl(url: String?): Boolean {
        if (!isAllowedNavigation(url)) return false
        val host = try {
            URI(url!!.trim()).host?.lowercase()?.trim('.') ?: return false
        } catch (_: Exception) {
            return false
        }
        return isAppHost(host)
    }

    private fun isAppHost(host: String): Boolean {
        if (host == "havkar-app.vercel.app" || host == "havkar.online" || host == "www.havkar.online") {
            return true
        }
        if (!host.endsWith(".havkar.online")) return false
        val prefix = host.removeSuffix(".havkar.online")
        return prefix.isNotEmpty() && prefix != "."
    }

    private fun isSignInHost(host: String): Boolean {
        if (host == "accounts.google.com") return true
        if (!host.endsWith(".supabase.co")) return false
        val prefix = host.removeSuffix(".supabase.co")
        return prefix.isNotEmpty() && prefix != "."
    }
}
