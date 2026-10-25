import Foundation

enum HavkarLinks {
    static let startURL = URL(string: "https://havkar-app.vercel.app/")

    static func isAllowedNavigation(_ raw: String?) -> Bool {
        guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty,
              let components = URLComponents(string: raw),
              components.scheme?.lowercased() == "https",
              components.user == nil,
              components.password == nil,
              let hostRaw = components.host else {
            return false
        }
        let host = hostRaw.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        if host.isEmpty || host.contains("..") {
            return false
        }
        return isAppHost(host) || isSignInHost(host)
    }

    private static func isAppHost(_ host: String) -> Bool {
        if host == "havkar-app.vercel.app" || host == "havkar.online" || host == "www.havkar.online" {
            return true
        }
        guard host.hasSuffix(".havkar.online") else { return false }
        let prefix = host.dropLast(".havkar.online".count)
        return !prefix.isEmpty && prefix != "."
    }

    private static func isSignInHost(_ host: String) -> Bool {
        if host == "accounts.google.com" {
            return true
        }
        guard host.hasSuffix(".supabase.co") else { return false }
        let prefix = host.dropLast(".supabase.co".count)
        return !prefix.isEmpty && prefix != "."
    }
}
