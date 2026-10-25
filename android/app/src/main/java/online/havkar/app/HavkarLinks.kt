package online.havkar.app

import java.net.URI

object HavkarLinks {
    const val START_URL = "https://havkar-app.vercel.app/"

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
