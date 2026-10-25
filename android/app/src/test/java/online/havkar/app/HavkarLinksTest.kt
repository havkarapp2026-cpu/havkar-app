package online.havkar.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HavkarLinksTest {
    @Test
    fun allowsHavkarHosts() {
        assertTrue(HavkarLinks.isAllowedNavigation("https://havkar-app.vercel.app/"))
        assertTrue(HavkarLinks.isAllowedNavigation("https://havkar-app.vercel.app/login.html"))
        assertTrue(HavkarLinks.isAllowedNavigation("https://havkar.online/privacy.html"))
        assertTrue(HavkarLinks.isAllowedNavigation("https://www.havkar.online/"))
        assertTrue(HavkarLinks.isAllowedNavigation("https://testnet.havkar.online/events.html"))
        assertTrue(HavkarLinks.isAllowedNavigation("https://staging.havkar.online/signup.html"))
    }

    @Test
    fun allowsSignInHostsOnly() {
        assertTrue(HavkarLinks.isAllowedNavigation("https://gispovnciifgikvgpzck.supabase.co/auth/v1/authorize"))
        assertTrue(HavkarLinks.isAllowedNavigation("https://accounts.google.com/o/oauth2/v2/auth"))
        assertFalse(HavkarLinks.isAllowedNavigation("https://supabase.co/"))
        assertFalse(HavkarLinks.isAllowedNavigation("https://accounts.google.com.evil.com/"))
        assertFalse(HavkarLinks.isAllowedNavigation("https://evil.supabase.co.attacker.test/"))
    }

    @Test
    fun blocksOtherWebAndUnsafeSchemes() {
        assertFalse(HavkarLinks.isAllowedNavigation("https://evil.vercel.app/"))
        assertFalse(HavkarLinks.isAllowedNavigation("https://havkar-app.vercel.app.evil.com/"))
        assertFalse(HavkarLinks.isAllowedNavigation("https://not-havkar.online/"))
        assertFalse(HavkarLinks.isAllowedNavigation("http://havkar-app.vercel.app/"))
        assertFalse(HavkarLinks.isAllowedNavigation("javascript:alert(1)"))
        assertFalse(HavkarLinks.isAllowedNavigation("https://havkar.online@evil.com/"))
        assertFalse(HavkarLinks.isAllowedNavigation(null))
        assertFalse(HavkarLinks.isAllowedNavigation("   "))
    }
}
