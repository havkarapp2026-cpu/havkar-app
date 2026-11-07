# Android upload keystore — security and recovery (tablet)

Status: **owner approved** this procedure on 7 November 2026 (Europe/Rome) for package `online.havkar.app`.

Generation waits for a durable owner-controlled **public** backup recipient so the encrypted backup can be decrypted only on the tablet. Supported public recipients (verified with `age`):

| Type | Public secret value shape | Decrypt identity on tablet |
| --- | --- | --- |
| age X25519 | `age1...` | age private identity file |
| SSH Ed25519 | `ssh-ed25519 AAAA...[comment]` | SSH private key (`-i`); passphrase prompted if the key is passphrase-protected |

This agent will not invent secrets, will not put private keys or passphrases in chat, and will not disable fail-closed checks.

This does **not** publish to Google Play. Live payments stay off. This does **not** use a debug keystore.

## Why GitHub Actions (not Termux keytool)

On some Samsung tablets (Android 16), Termux OpenJDK `keytool` crashes. GitHub-hosted Ubuntu runners can run Temurin JDK 17 `keytool` instead. The runner must never leave a plaintext keystore in logs or a public artifact.

## Safest verified design

1. On the tablet, create a backup identity (**age** *or* passphrase-protected **SSH Ed25519**). Keep the **private** key only on the tablet / offline backup.
2. Put **only** the matching **public** line in GitHub secret `HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT`.
3. Owner approves this document, then runs **Android upload keystore** with confirmation exactly `CREATE_NEW_UPLOAD_KEY`.
4. The workflow:
   - refuses if any `HAVKAR_UPLOAD_KEYSTORE_BASE64` / store password / alias / key password secret already exists (no overwrite);
   - refuses private-key-shaped secret values;
   - accepts only `age1...` or `ssh-ed25519 AAAA...`;
   - probes that `age` can encrypt to that public recipient (ciphertext only; secret value never printed);
   - generates a new RSA-2048 PKCS12 upload key (not debug);
   - creates random store/key passwords;
   - packs `havkar-upload.p12` + `credentials.txt`;
   - encrypts with `age -r` to the owner public recipient;
   - uploads **only** `havkar-upload-backup.tar.age`;
   - shreds plaintext on the runner.
5. Owner downloads the artifact on the tablet, decrypts with the private identity, sets the four `HAVKAR_UPLOAD_*` secrets, then builds a signed AAB with **Android release AAB**.

Workflow file: `.github/workflows/android-upload-keystore.yml`

## Owner approval checklist (read before running)

- [x] I understand losing both the backup private identity and the decrypted keystore backup can permanently block Play updates for this upload key.
- [x] I will keep the private identity offline and never paste it into chat, Issues, or the repository.
- [x] I will not run the generator if Play / GitHub already has a usable upload key for `online.havkar.app`.
- [x] I accept that GitHub Actions artifacts expire (default 7 days) and I must back up the encrypted file myself.
- [x] Explicit approval received (7 November 2026) to create the official upload signing key and prepare a signed release AAB.

**Current blocker:** set repository secret `HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT` to the **public** recipient only (`age1...` **or** `ssh-ed25519 AAAA...`). Prior Actions run `42307300847` fail-closed when the secret was missing.

After the public recipient secret exists, run the workflow once with `CREATE_NEW_UPLOAD_KEY`. Do not re-run if upload secrets were already filled.

## Preferred tablet path — SSH Ed25519 (already used on device)

If you already created a passphrase-protected SSH Ed25519 key for backup (example public file `~/havkar-secure/havkar-upload-backup.pub`), verify the public file encrypts with age:

```
age -R ~/havkar-secure/havkar-upload-backup.pub -o /dev/null </dev/null
```

Show the single public line (safe for GitHub Secrets / Cursor):

```
cat ~/havkar-secure/havkar-upload-backup.pub
```

Copy that **entire** public line (starts with `ssh-ed25519`) into repository secret:

```
HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT
```

Never put the private key file or the passphrase into GitHub Secrets, chat, Issues, or the repository.

Keep the private SSH key + passphrase offline. The private key is required later to decrypt the `.age` artifact.

## Alternate tablet path — native age identity

```
pkg update
pkg install age openssl
mkdir -p ~/havkar-secure
chmod 700 ~/havkar-secure
age-keygen -o ~/havkar-secure/havkar-upload-age.key
age-keygen -y ~/havkar-secure/havkar-upload-age.key
```

Copy the printed `age1...` line into the same secret `HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT`. Back up the private identity file offline. Never commit it.

## Tablet steps — after the workflow finishes

1. Open the successful Actions run → Artifacts → download `havkar-upload-backup-age-<run_id>`.
2. Move the `.age` file into Termux storage, then decrypt with the matching private identity.

SSH Ed25519 (passphrase prompted by `age` if the key is protected):

```
age -d -i ~/havkar-secure/havkar-upload-backup -o ~/havkar-secure/havkar-upload-backup.tar havkar-upload-backup.tar.age
tar -C ~/havkar-secure -xf ~/havkar-secure/havkar-upload-backup.tar
```

Native age identity:

```
age -d -i ~/havkar-secure/havkar-upload-age.key -o ~/havkar-secure/havkar-upload-backup.tar havkar-upload-backup.tar.age
tar -C ~/havkar-secure -xf ~/havkar-secure/havkar-upload-backup.tar
```

3. Create the four GitHub Actions secrets from the decrypted files (tablet browser). Do not paste them into chat.

```
# values come from credentials.txt — do not echo them into screenshots of chat
base64 -w 0 ~/havkar-secure/havkar-upload.p12
```

| Secret | Source |
| --- | --- |
| `HAVKAR_UPLOAD_KEYSTORE_BASE64` | output of `base64 -w 0 havkar-upload.p12` |
| `HAVKAR_UPLOAD_STORE_PASSWORD` | from `credentials.txt` |
| `HAVKAR_UPLOAD_KEY_ALIAS` | from `credentials.txt` (default `havkar-upload`) |
| `HAVKAR_UPLOAD_KEY_PASSWORD` | from `credentials.txt` |

4. Keep `havkar-upload-backup.tar.age` + the private backup identity as the long-term backup. Delete plaintext `credentials.txt` / `.p12` from the tablet after secrets are saved, or keep them only in an encrypted offline backup.
5. Run **Android release AAB** in `signed` mode.

## What this agent will not do

- Generate the upload key before the public recipient secret is set and the owner runs/approves the generator step
- Request, print, commit, or invent private keys, passphrases, passwords, or keystore bytes
- Overwrite existing `HAVKAR_UPLOAD_*` secrets
- Publish to Google Play or enable live payments
