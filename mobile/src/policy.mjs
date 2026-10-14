/**
 * Navigation and sign-in policy for the unused local shell in mobile/www.
 * The installed Android and iOS apps open the existing website through
 * Capacitor server.url. This module still treats that origin as an in-app
 * URL, not a system-browser URL.
 */

export const ROUTES = Object.freeze([
  "home",
  "language",
  "sign-in",
  "account",
  "capture"
]);

export const AUTH_CALLBACK = "havkar://auth/callback";

export const API_ORIGIN = "https://havkar-app.vercel.app";

const BROWSER_HOSTS = new Set([
  "gispovnciifgikvgpzck.supabase.co",
  "accounts.google.com",
  "appleid.apple.com"
]);

export function isAppRoute(route) {
  return ROUTES.includes(route);
}

export function reduceBack(stack) {
  const current = Array.isArray(stack) ? stack.filter(isAppRoute) : [];

  if (current.length <= 1) {
    return {
      action: "exit",
      stack: current.length ? current : ["home"]
    };
  }

  const next = current.slice(0, -1);

  return {
    action: "back",
    stack: next,
    route: next[next.length - 1]
  };
}

export function pushRoute(stack, route) {
  if (!isAppRoute(route)) {
    return Array.isArray(stack) && stack.length ? stack.slice() : ["home"];
  }

  const current = Array.isArray(stack) ? stack.filter(isAppRoute) : [];

  if (current[current.length - 1] === route) {
    return current.length ? current : ["home"];
  }

  return [...current, route];
}

export function isSystemBrowserUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return url.protocol === "https:"
    && !url.username
    && !url.password
    && BROWSER_HOSTS.has(url.hostname);
}

export function parseAuthCallback(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== "havkar:"
    || url.hostname !== "auth"
    || url.pathname !== "/callback"
    || url.username
    || url.password
    || url.hash
  ) {
    return null;
  }

  if (url.searchParams.has("access_token") || url.searchParams.has("refresh_token")) {
    return null;
  }

  const error = url.searchParams.get("error");

  if (error) {
    return {
      error: "Sign-in was not completed."
    };
  }

  const code = url.searchParams.get("code") || "";

  if (!/^[A-Za-z0-9_-]{8,2048}$/.test(code)) {
    return null;
  }

  return { code };
}

export function accountDeletionUrl() {
  return API_ORIGIN + "/api/delete-account";
}
