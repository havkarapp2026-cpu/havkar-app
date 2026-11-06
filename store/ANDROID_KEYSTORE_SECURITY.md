# Android upload keystore — security and recovery (tablet)

Status: procedure ready. **No upload key is generated until the owner explicitly approves this procedure and runs the workflow with the confirmation phrase.**

This does **not** publish to Google Play. Live payments stay off. This does **not** use a debug keystore.

## Why GitHub Actions (not Termux keytool)

On some Samsung tablets (Android 16), Termux OpenJDK `keytool` crashes. GitHub-hosted Ubuntu runners can run Temurin JDK 17 `keytool` instead. The runner must never leave a plaintext keystore in logs or a public artifact.

## Safest verified design

1. On the tablet, create an **age** key pair (no Java). Keep the **private** identity only on the tablet / password manager offline backup.
2. Put only the **public** recipient (`age1...`) in GitHub secret `HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT`.
3. Owner approves this document, then runs **Android upload keystore** with confirmation exactly `CREATE_NEW_UPLOAD_KEY`.
4. The workflow:
   - refuses if any `HAVKAR_UPLOAD_KEYSTORE_BASE64` / store password / alias / key password secret already exists (no overwrite);
   - generates a new RSA-2048 PKCS12 upload key (not debug);
   - creates random store/key passwords;
   - packs `havkar-upload.p12` + `credentials.txt`;
   - encrypts with `age` to the owner public recipient;
   - uploads **only** `havkar-upload-backup.tar.age`;
   - shreds plaintext on the runner.
5. Owner downloads the artifact on the tablet, decrypts with the private age identity, sets the four `HAVKAR_UPLOAD_*` secrets, then builds a signed AAB with **Android release AAB**.

Workflow file: `.github/workflows/android-upload-keystore.yml`

## Owner approval checklist (read before running)

- [ ] I understand losing both the age private key and the decrypted keystore backup can permanently block Play updates for this upload key.
- [ ] I will keep the age private identity offline and never paste it into chat, Issues, or the repository.
- [ ] I will not run the generator if Play / GitHub already has a usable upload key for `online.havkar.app`.
- [ ] I accept that GitHub Actions artifacts expire (default 7 days) and I must back up the encrypted file myself.
- [ ] I will not ask an agent to generate the key until I reply with explicit approval of this procedure.

After approval, run the workflow once. Do not re-run if secrets were already filled.

## Tablet steps — create age identity (Termux, no OpenJDK)

```
pkg update
pkg install age openssl
mkdir -p ~/havkar-secure
chmod 700 ~/havkar-secure
age-keygen -o ~/havkar-secure/havkar-upload-age.key
```

Show the public recipient (safe to put in GitHub Secrets):

```
grep -E '^# public key:|^age1' ~/havkar-secure/havkar-upload-age.key
```

Copy the `age1...` line into repository secret:

```
HAVKAR_UPLOAD_BACKUP_AGE_RECIPIENT
```

Back up `~/havkar-secure/havkar-upload-age.key` offline (encrypted drive / password-manager attachment). Never commit it.

## Tablet steps — after the workflow finishes

1. Open the successful Actions run → Artifacts → download `havkar-upload-backup-age-<run_id>`.
2. Move the `.age` file into Termux storage, then:

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

4. Keep `havkar-upload-backup.tar.age` + age private key as the long-term backup. Delete plaintext `credentials.txt` / `.p12` from the tablet after secrets are saved, or keep them only in an encrypted offline backup.
5. Run **Android release AAB** in `signed` mode.

## What this agent will not do

- Generate the upload key before explicit owner approval of this procedure
- Print, commit, or invent passwords / private keys / keystore bytes
- Overwrite existing `HAVKAR_UPLOAD_*` secrets
- Publish to Google Play or enable live payments
