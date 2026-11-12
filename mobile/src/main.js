import { createClient } from "@supabase/supabase-js";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  LANGUAGES,
  applyLanguage,
  storedLanguage
} from "./languages.mjs";
import {
  accountDeletionUrl,
  isSystemBrowserUrl,
  parseAuthCallback,
  pushRoute,
  reduceBack
} from "./policy.mjs";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from "./public-config.mjs";
import {
  beginProviderSignIn,
  completeAuthCallback,
  createMobileAuthOptions,
  requestAccountDeletion
} from "./session.mjs";

const STRINGS = {
  back: "Back",
  signIn: "Sign in",
  email: "Email",
  password: "Password",
  continueEmail: "Continue with email",
  google: "Continue with Google",
  apple: "Continue with Apple",
  language: "Language",
  account: "Account",
  capture: "Camera and files",
  signOut: "Sign out",
  takePhoto: "Take a photo",
  chooseFile: "Choose a file",
  previewNote: "The selected file stays on this device.",
  deleteAccount: "Delete account",
  deleteHelp: "Type DELETE to permanently remove this HAVKAR account.",
  deleteAction: "Delete this account",
  signedOut: "Sign in to use your HAVKAR account.",
  signedIn: "You are signed in.",
  unavailable: "This action could not be completed."
};

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  { auth: createMobileAuthOptions() }
);

const state = {
  stack: ["home"],
  session: null,
  language: storedLanguage(),
  strings: { ...STRINGS }
};

const $ = (id) => document.getElementById(id);

function showError(message) {
  const node = $("notice");
  node.textContent = message || "";
}

function render() {
  const route = state.stack[state.stack.length - 1];
  const text = state.strings;

  document.querySelectorAll("[data-screen]").forEach((screen) => {
    screen.hidden = screen.dataset.screen !== route;
  });

  $("back").hidden = state.stack.length < 2;
  $("back").textContent = text.back;
  $("home-status").textContent = state.session ? text.signedIn : text.signedOut;
  $("home-email").textContent = state.session?.user?.email || "";
  $("open-language").textContent = text.language;
  $("open-sign-in").hidden = Boolean(state.session);
  $("open-sign-in").textContent = text.signIn;
  $("open-account").hidden = !state.session;
  $("open-account").textContent = text.account;
  $("open-capture").textContent = text.capture;
  $("email-label").textContent = text.email;
  $("password-label").textContent = text.password;
  $("email-sign-in").textContent = text.continueEmail;
  $("google-sign-in").textContent = text.google;
  $("apple-sign-in").textContent = text.apple;
  $("sign-out").textContent = text.signOut;
  $("take-photo").textContent = text.takePhoto;
  $("choose-file").textContent = text.chooseFile;
  $("preview-note").textContent = text.previewNote;
  $("delete-help").textContent = text.deleteHelp;
  $("delete-account").textContent = text.deleteAction;
  $("language-title").textContent = text.language;
}

function openRoute(route) {
  state.stack = pushRoute(state.stack, route);
  showError("");
  render();
}

function goBack() {
  const result = reduceBack(state.stack);
  state.stack = result.stack;

  if (result.action === "exit") {
    if (Capacitor.isNativePlatform()) {
      App.exitApp();
    }
    return;
  }

  showError("");
  render();
}

async function refreshStrings() {
  state.strings = { ...STRINGS };
  applyLanguage(state.language.code);

  if (state.language.code === "en") {
    render();
    return;
  }

  try {
    const response = await fetch("https://havkar-app.vercel.app/api/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        texts: Object.values(STRINGS),
        sourceLanguage: "en",
        targetLanguage: state.language.code
      })
    });

    if (!response.ok) {
      render();
      return;
    }

    const payload = await response.json();
    const translated = Array.isArray(payload.translations)
      ? payload.translations.map((item) => item.translatedText || item.text || "")
      : [];
    const keys = Object.keys(STRINGS);

    if (translated.length === keys.length) {
      state.strings = Object.fromEntries(
        keys.map((key, index) => [key, translated[index] || STRINGS[key]])
      );
    }
  } catch {
    state.strings = { ...STRINGS };
  }

  render();
}

function renderLanguages() {
  const list = $("language-list");
  list.replaceChildren();

  for (const language of LANGUAGES) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "language";
    button.dir = language.dir;
    button.lang = language.code;
    button.textContent = language.name;
    button.setAttribute("aria-pressed", String(language.code === state.language.code));
    button.addEventListener("click", async () => {
      state.language = applyLanguage(language.code);
      renderLanguages();
      await refreshStrings();
    });
    list.append(button);
  }
}

async function refreshSession() {
  const { data } = await supabase.auth.getSession();
  state.session = data.session || null;
  render();
}

async function openProvider(provider) {
  showError("");

  try {
    const url = await beginProviderSignIn(supabase, provider);

    if (!isSystemBrowserUrl(url)) {
      throw new Error("The sign-in page could not be opened.");
    }

    await Browser.open({ url });
  } catch (error) {
    showError(error.message || STRINGS.unavailable);
  }
}

async function onAuthUrl(url) {
  const callback = parseAuthCallback(url);

  if (!callback) {
    return;
  }

  try {
    await Browser.close();
  } catch {
    // The browser may already be closed.
  }

  try {
    await completeAuthCallback(supabase, callback);
    await refreshSession();
    state.stack = ["home"];
    render();
  } catch (error) {
    showError(error.message || STRINGS.unavailable);
  }
}

async function showPreview(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    showError(STRINGS.unavailable);
    return;
  }

  const image = $("preview");
  image.src = dataUrl;
  image.hidden = false;
}

async function capture(source) {
  showError("");

  if (!Capacitor.isNativePlatform()) {
    $("file-input").dataset.source = source;
    $("file-input").click();
    return;
  }

  try {
    const photo = await Camera.getPhoto({
      quality: 70,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === "camera" ? CameraSource.Camera : CameraSource.Photos
    });

    await showPreview(photo.dataUrl || "");
  } catch {
    showError(STRINGS.unavailable);
  }
}

function bind() {
  $("back").addEventListener("click", goBack);
  $("open-language").addEventListener("click", () => openRoute("language"));
  $("open-sign-in").addEventListener("click", () => openRoute("sign-in"));
  $("open-account").addEventListener("click", () => openRoute("account"));
  $("open-capture").addEventListener("click", () => openRoute("capture"));
  $("google-sign-in").addEventListener("click", () => openProvider("google"));
  $("apple-sign-in").addEventListener("click", () => openProvider("apple"));
  $("take-photo").addEventListener("click", () => capture("camera"));
  $("choose-file").addEventListener("click", () => capture("photos"));
  $("sign-out").addEventListener("click", async () => {
    await supabase.auth.signOut();
    state.session = null;
    state.stack = ["home"];
    render();
  });

  $("email-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: $("email").value.trim(),
      password: $("password").value
    });

    if (error || !data.session) {
      showError(STRINGS.unavailable);
      return;
    }

    state.session = data.session;
    state.stack = ["home"];
    $("password").value = "";
    render();
  });

  $("delete-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    if ($("delete-confirm").value !== "DELETE" || !state.session?.access_token) {
      showError(STRINGS.unavailable);
      return;
    }

    try {
      await requestAccountDeletion(fetch, state.session.access_token);
      await supabase.auth.signOut();
      state.session = null;
      state.stack = ["home"];
      $("delete-confirm").value = "";
      render();
    } catch (error) {
      showError(error.message || STRINGS.unavailable);
    }
  });

  $("file-input").addEventListener("change", () => {
    const file = $("file-input").files && $("file-input").files[0];
    $("file-input").value = "";

    if (!file || !file.type.startsWith("image/")) {
      showError(STRINGS.unavailable);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => showPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function start() {
  applyLanguage(state.language.code);
  renderLanguages();
  bind();
  render();

  if (Capacitor.isNativePlatform()) {
    App.addListener("backButton", () => {
      goBack();
    });
    App.addListener("appUrlOpen", (event) => {
      onAuthUrl(event.url || "");
    });
    App.addListener("appRestoredResult", (event) => {
      if (event.pluginId === "Camera" && event.methodName === "getPhoto" && event.success) {
        showPreview(event.data?.dataUrl || "");
      }
    });

    try {
      await StatusBar.setStyle({ style: Style.Light });
      await SplashScreen.hide();
    } catch {
      // Native chrome is optional during local browser checks.
    }
  }

  await refreshStrings();
  await refreshSession();
}

if (accountDeletionUrl()) {
  start();
}
