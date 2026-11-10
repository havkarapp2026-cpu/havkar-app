# Official email status — 9 November 2026

## Published addresses

- `info@havkar.online`
- `support@havkar.online`
- `soran@havkar.online` (Owner-confidential investment / ownership)

Personal Gmail must not appear on public pages.

## DNS (probed)

| Record | Result |
| --- | --- |
| MX | `10 mail.register.it.` |
| SPF | `v=spf1 include:spf.webapps.net ~all` |
| DMARC | `v=DMARC1; p=none;` |
| DKIM | Common selectors (`default`, `google`, `register`, `mail`) returned empty in this probe |

## Send/receive

- SMTP AUTH / mailbox inbox login **not proven** in this agent environment (no mailbox password available; passwords must not be stored in git).
- Owner action: verify webmail login on Register.it for INFO/SUPPORT/SORAN and tighten DMARC when DKIM is confirmed.

## Access isolation

- Staff Workspace and Admin UI do not expose SORAN contents.
- Owner Control lists SORAN as contact only.
