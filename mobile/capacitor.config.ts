import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "online.havkar.app",
  appName: "HAVKAR",
  webDir: "www",
  server: {
    // The installed app opens the existing website. Pages, APIs, and sessions
    // stay on this origin. The trailing slash gives Android a path so the
    // local-server matcher is not asked to read a null path.
    url: "https://havkar-app.vercel.app/",
    androidScheme: "https",
    hostname: "localhost",
    // Same-origin pages are already allowed by server.url. These hosts are the
    // top-level navigations the current login and Stripe Checkout already use.
    allowNavigation: [
      "gispovnciifgikvgpzck.supabase.co",
      "*.google.com",
      "appleid.apple.com",
      "checkout.stripe.com"
    ]
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
