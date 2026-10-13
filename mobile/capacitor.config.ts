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
    errorPath: "index.html"
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
