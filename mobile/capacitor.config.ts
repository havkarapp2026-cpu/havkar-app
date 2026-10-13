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
  ios: {
    contentInset: "automatic"
  }
};

export default config;
