import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "online.havkar.app",
  appName: "HAVKAR",
  webDir: "www",
  server: {
    androidScheme: "https",
    hostname: "localhost",
    // External sites stay in the system browser. Do not add the public website.
    allowNavigation: [],
    // Android loads this URL as the first document. A bare https://localhost has
    // no path; Capacitor 8 then calls path.equals before it can open
    // assets/public/index.html, and the WebView shows that as file-not-found.
    appStartPath: "/index.html"
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    SystemBars: {
      // The page already sets viewport-fit=cover. Hinting it avoids a
      // startup jump between native padding and CSS safe-area insets.
      initialViewportFitValueHint: "cover"
    }
  },
  ios: {
    contentInset: "automatic"
  }
};

export default config;
