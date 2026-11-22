# Future HAVKAR Independent Messenger — Integration Boundaries

Status: preparation only. This document does **not** ship or require an independent messenger app.

## Goals

- Keep in-app `chat.html` as the current production messaging surface.
- Allow a future HAVKAR-connected messenger to link accounts securely without database coupling.
- Never force users to install an unavailable messenger to use HAVKAR.

## Stable identity

- Primary user id: Supabase Auth `user.id` (UUID).
- Profile display fields live in `public.profiles` and remain the canonical HAVKAR identity.
- Do not invent a second user table for messenger accounts.
- Account linking must require explicit user consent and server-side verification.

## Auth architecture

- Messenger clients must authenticate with short-lived tokens issued by HAVKAR backends.
- Prefer OAuth / OIDC-style authorization code + PKCE for native apps.
- Never embed service-role keys or long-lived admin JWTs in a messenger client.
- Owner/staff roles remain server-confirmed; messenger must not trust client-only role claims.

## Messaging API abstraction

Recommended future boundary (not implemented in this task):

1. `POST /api/messenger/session` — create linked session after consent.
2. `GET /api/messenger/conversations` — list conversations the user may access.
3. `POST /api/messenger/messages` — send message through the same persistence rules as `havkar_send_chat_message`.
4. Realtime delivery via Supabase Realtime or an equivalent server-mediated channel.

Rules:

- `messages.message_text` is always the original content.
- Optional `translated_text` / language metadata are derived representations only.
- Private conversations are never auto-shared with third-party apps.
- Contact/graph sharing requires explicit permission scopes.

## Consent and privacy

- Explicit opt-in for account linking.
- Explicit opt-in for contact sync.
- Explicit opt-in for live location sharing (with expiry and stop control) when offered.
- Medical telehealth media remains gated separately and must not dump into general messenger history.

## Non-goals for this phase

- Building or releasing the independent messenger.
- Requiring messenger installation.
- Automatic sharing of private conversations.
- Direct database access from an external messenger process.

## Current HAVKAR readiness checklist

- [x] Stable UUID user identity via Auth
- [x] Canonical profile page / settings hub
- [x] Chat RPC that preserves original text + optional translation columns
- [x] Documented integration boundary (this file)
- [ ] Messenger OAuth client registration (Owner future work)
- [ ] Scoped consent UI for account linking (Owner future work)
