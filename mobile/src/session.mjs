import { AUTH_CALLBACK, isSystemBrowserUrl } from "./policy.mjs";

export function createMobileAuthOptions() {
  return {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce"
  };
}

export async function beginProviderSignIn(client, provider) {
  if (provider !== "google" && provider !== "apple") {
    throw new Error("This sign-in provider is not available.");
  }

  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: AUTH_CALLBACK,
      skipBrowserRedirect: true
    }
  });

  if (error || !data?.url || !isSystemBrowserUrl(data.url)) {
    throw new Error("The sign-in page could not be opened.");
  }

  return data.url;
}

export async function completeAuthCallback(client, callback) {
  if (!callback || callback.error) {
    throw new Error(callback?.error || "Sign-in was not completed.");
  }

  const { error } = await client.auth.exchangeCodeForSession(callback.code);

  if (error) {
    throw new Error("Sign-in was not completed.");
  }
}

export async function requestAccountDeletion(fetchImpl, accessToken) {
  const response = await fetchImpl(
    "https://havkar-app.vercel.app/api/delete-account",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ confirm: "DELETE" })
    }
  );

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || !body?.ok) {
    throw new Error("The account could not be deleted.");
  }

  return true;
}
