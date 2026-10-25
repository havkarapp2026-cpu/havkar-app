import XCTest

final class HavkarLinksTests: XCTestCase {
    func testAllowsHavkarHosts() {
        XCTAssertTrue(HavkarLinks.isAllowedNavigation("https://havkar-app.vercel.app/"))
        XCTAssertTrue(HavkarLinks.isAllowedNavigation("https://havkar-app.vercel.app/login.html"))
        XCTAssertTrue(HavkarLinks.isAllowedNavigation("https://havkar.online/privacy.html"))
        XCTAssertTrue(HavkarLinks.isAllowedNavigation("https://www.havkar.online/"))
        XCTAssertTrue(HavkarLinks.isAllowedNavigation("https://testnet.havkar.online/events.html"))
        XCTAssertTrue(HavkarLinks.isAllowedNavigation("https://staging.havkar.online/signup.html"))
    }

    func testAllowsSignInHostsOnly() {
        XCTAssertTrue(HavkarLinks.isAllowedNavigation("https://gispovnciifgikvgpzck.supabase.co/auth/v1/authorize"))
        XCTAssertTrue(HavkarLinks.isAllowedNavigation("https://accounts.google.com/o/oauth2/v2/auth"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("https://supabase.co/"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("https://accounts.google.com.evil.com/"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("https://evil.supabase.co.attacker.test/"))
    }

    func testBlocksOtherWebAndUnsafeSchemes() {
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("https://evil.vercel.app/"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("https://havkar-app.vercel.app.evil.com/"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("https://not-havkar.online/"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("http://havkar-app.vercel.app/"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("javascript:alert(1)"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("https://havkar.online@evil.com/"))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation(nil))
        XCTAssertFalse(HavkarLinks.isAllowedNavigation("   "))
    }
}
