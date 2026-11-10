# Owner action — Supabase Auth URL configuration

Production project: `gispovnciifgikvgpzck`

App code now always sends Google / email `redirectTo` to `https://havkar.online/...`.
Supabase Auth **Site URL** and **Redirect URLs** must allow that host, or OAuth falls back to the old `havkar-app.vercel.app` Site URL.

## Exact Dashboard steps

1. Open:

```
https://supabase.com/dashboard/project/gispovnciifgikvgpzck/auth/url-configuration
```

2. Set **Site URL** to:

```
https://havkar.online
```

3. Under **Redirect URLs**, ensure these entries exist (wildcards allowed):

```
https://havkar.online/**
https://www.havkar.online/**
https://havkar-app.vercel.app/**
```

(`vercel.app` may remain temporarily; Production traffic is redirected to `havkar.online`.)

4. Save.

5. Google Cloud OAuth client used by this Supabase project must keep authorized redirect:

```
https://gispovnciifgikvgpzck.supabase.co/auth/v1/callback
```

No change needed there unless Google Console is missing that callback.

## Verify

1. Open `https://havkar.online/login.html?next=%2Fowner-eur1-checkout.html`
2. Continue with Google
3. Land back on `https://havkar.online/login.html?...` then auto-continue to Owner EUR1
4. Page must show Owner session detected — not a vercel.app host
