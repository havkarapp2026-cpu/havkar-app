import assert from "node:assert/strict";
import fs from "node:fs";
import { createDeleteAccountHandler } from "../api/delete-account.js";
import { LANGUAGES } from "../mobile/src/languages.mjs";
import {
  AUTH_CALLBACK,
  isSystemBrowserUrl,
  parseAuthCallback,
  pushRoute,
  reduceBack
} from "../mobile/src/policy.mjs";
import {
  beginProviderSignIn,
  createMobileAuthOptions
} from "../mobile/src/session.mjs";

const i18n = fs.readFileSync(new URL("../havkar-i18n.js", import.meta.url), "utf8");
const wallet = fs.readFileSync(new URL("../wallet.html", import.meta.url), "utf8");
const stellar = fs.readFileSync(new URL("../stellar-wallet-source.js", import.meta.url), "utf8");
const trade = fs.readFileSync(new URL("../api/trade-crypto.js", import.meta.url), "utf8");
const translate = fs.readFileSync(new URL("../api/translate.js", import.meta.url), "utf8");
const config = fs.readFileSync(new URL("../mobile/capacitor.config.ts", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../mobile/src/main.js", import.meta.url), "utf8");
const sessionSource = fs.readFileSync(new URL("../mobile/src/session.mjs", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../mobile/www/index.html", import.meta.url), "utf8");
const webConfig = fs.readFileSync(new URL("../havkar-supabase-config.js", import.meta.url), "utf8");
const mobileConfig = fs.readFileSync(new URL("../mobile/src/public-config.mjs", import.meta.url), "utf8");

assert.equal(LANGUAGES.length, 21);
assert.deepEqual(
  LANGUAGES.filter((language) => language.dir === "rtl").map((language) => language.code),
  ["ckb", "ar", "fa", "ur"]
);
assert.equal(LANGUAGES.find((language) => language.code === "kmr").dir, "ltr");
assert.equal(LANGUAGES.some((language) => language.code === "ku"), false);

for (const language of LANGUAGES) {
  assert.match(i18n, new RegExp(`code:\\s*"${language.code}"`));
  assert.match(i18n, new RegExp(`dir:\\s*"${language.dir}"`));
}

assert.equal(config.includes("server.url"), false);
assert.match(config, /allowNavigation:\s*\[\]/);
assert.match(config, /allowMixedContent:\s*false/);
assert.equal(html.includes("<iframe"), false);
assert.equal(html.includes("havkar-app.vercel.app"), false);

assert.match(main, /backButton/);
assert.match(main, /Browser\.open/);
assert.match(main, /Camera\.getPhoto/);
assert.match(main, /CameraSource\.Camera/);
assert.match(main, /CameraSource\.Photos/);
assert.match(sessionSource, /skipBrowserRedirect:\s*true/);
assert.match(main, /appRestoredResult/);

const androidManifest = fs.readFileSync(
  new URL("../mobile/android/app/src/main/AndroidManifest.xml", import.meta.url),
  "utf8"
);
const infoPlist = fs.readFileSync(
  new URL("../mobile/ios/App/App/Info.plist", import.meta.url),
  "utf8"
);
const entitlements = fs.readFileSync(
  new URL("../mobile/ios/App/App/App.entitlements", import.meta.url),
  "utf8"
);

assert.match(androidManifest, /android:launchMode="singleTask"/);
assert.match(androidManifest, /android:usesCleartextTraffic="false"/);
assert.match(androidManifest, /android:supportsRtl="true"/);
assert.match(androidManifest, /android.permission.CAMERA/);
assert.match(androidManifest, /android:scheme="havkar"/);
assert.match(androidManifest, /android:host="auth"/);
assert.match(infoPlist, /NSCameraUsageDescription/);
assert.match(infoPlist, /NSPhotoLibraryUsageDescription/);
assert.match(infoPlist, /<string>havkar<\/string>/);
assert.match(entitlements, /com.apple.developer.applesignin/);

const walletWithoutComments = wallet.replace(/<!--[\s\S]*?-->/g, "");
assert.equal(walletWithoutComments.includes("sdk.minepi.com"), false);
assert.equal(walletWithoutComments.includes("Pi.init"), false);
assert.match(stellar, /return "TESTNET"/);
assert.match(trade, /HAVKAR_TRADE_ENABLED !== "true"/);
assert.match(translate, /"https:\/\/localhost"/);
assert.match(translate, /"capacitor:\/\/localhost"/);

const webUrl = webConfig.match(/url:\s*"([^"]+)"/)[1];
const webKey = webConfig.match(/publishableKey:\s*"([^"]+)"/)[1];
assert.equal(mobileConfig.includes(webUrl), true);
assert.equal(mobileConfig.includes(webKey), true);
assert.equal(main.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
assert.equal(main.includes("HAVKAR_AI_API_KEY"), false);

const auth = createMobileAuthOptions();
assert.equal(auth.flowType, "pkce");
assert.equal(auth.detectSessionInUrl, false);
assert.equal(AUTH_CALLBACK, "havkar://auth/callback");

assert.equal(isSystemBrowserUrl("https://accounts.google.com/o/oauth2/v2/auth"), true);
assert.equal(isSystemBrowserUrl("https://appleid.apple.com/auth/authorize"), true);
assert.equal(isSystemBrowserUrl("https://gispovnciifgikvgpzck.supabase.co/auth/v1/authorize?provider=google"), true);
assert.equal(isSystemBrowserUrl("https://havkar-app.vercel.app/"), false);
assert.equal(isSystemBrowserUrl("javascript:alert(1)"), false);
assert.equal(isSystemBrowserUrl("http://accounts.google.com/"), false);

assert.deepEqual(
  parseAuthCallback("havkar://auth/callback?code=abcDEF12"),
  { code: "abcDEF12" }
);
assert.equal(parseAuthCallback("havkar://auth/callback?access_token=secret"), null);
assert.equal(parseAuthCallback("https://havkar-app.vercel.app/?code=abcDEF12"), null);
assert.deepEqual(parseAuthCallback("havkar://auth/callback?error=access_denied"), {
  error: "Sign-in was not completed."
});

assert.deepEqual(reduceBack(["home"]), { action: "exit", stack: ["home"] });
assert.deepEqual(reduceBack(["home", "sign-in"]), {
  action: "back",
  stack: ["home"],
  route: "home"
});
assert.deepEqual(pushRoute(["home"], "https://havkar-app.vercel.app"), ["home"]);
assert.deepEqual(pushRoute(["home"], "capture"), ["home", "capture"]);

const opened = [];
const url = await beginProviderSignIn({
  auth: {
    async signInWithOAuth(options) {
      opened.push(options);
      return {
        data: {
          url: "https://gispovnciifgikvgpzck.supabase.co/auth/v1/authorize?provider=google"
        },
        error: null
      };
    }
  }
}, "google");
assert.equal(url.includes("supabase.co"), true);
assert.equal(opened[0].options.skipBrowserRedirect, true);
assert.equal(opened[0].options.redirectTo, AUTH_CALLBACK);

await assert.rejects(
  () => beginProviderSignIn({
    auth: {
      async signInWithOAuth() {
        return { data: { url: "https://evil.example/auth" }, error: null };
      }
    }
  }, "google"),
  /could not be opened/
);

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    }
  };
}

const token = "test-access-token";
const deleted = [];
const handler = createDeleteAccountHandler({
  getAdmin() {
    return {
      auth: {
        async getUser(accessToken) {
          assert.equal(accessToken, token);
          return { data: { user: { id: "user-1", email: "person@example.com" } }, error: null };
        },
        admin: {
          async deleteUser(id) {
            deleted.push(id);
            return { error: null };
          }
        }
      }
    };
  }
});

const ok = mockResponse();
await handler({
  method: "POST",
  headers: {
    origin: "https://localhost",
    authorization: "Bearer " + token
  },
  body: { confirm: "DELETE" }
}, ok);
assert.equal(ok.statusCode, 200);
assert.deepEqual(ok.body, { ok: true });
assert.deepEqual(deleted, ["user-1"]);
assert.equal(JSON.stringify(ok.body).includes(token), false);
assert.equal(JSON.stringify(ok.body).includes("person@example.com"), false);

const denied = mockResponse();
await handler({
  method: "POST",
  headers: { origin: "https://evil.example", authorization: "Bearer " + token },
  body: { confirm: "DELETE" }
}, denied);
assert.equal(denied.statusCode, 403);

const unconfirmed = mockResponse();
await handler({
  method: "POST",
  headers: { authorization: "Bearer " + token },
  body: { confirm: "delete" }
}, unconfirmed);
assert.equal(unconfirmed.statusCode, 400);

console.log("MOBILE_CAPACITOR_TEST_OK");
