# ممیزی نهایی انطباق کیف‌پول Stellar — HAVKAR

تاریخ: ۲۰۲۶-۱۱-۱۰  
وضعیت: ممیزی فنی کد + تست امنیتی  
**مشاوره حقوقی نیست. معافیت MiCA/CASP ادعا نمی‌شود.**  
Production تغییر نکرد، merge/deploy/فعال‌سازی پرداخت انجام نشد.

## ۱) آیا هر تراکنش Stellar نیاز به تأیید صریح کاربر در کیف خارجی دارد؟

**PASS (محیط production / hostname غیر localhost)**

مسیر پرداخت:

1. آماده‌سازی XDR بدون امضا (`havkarPrepareStellarPayment`)
2. درخواست امضا از کیف خارجی:

```2340:2354:stellar-wallet-source.js
        else signPromise =
            StellarWalletsKit.signTransaction(

                prepared.xdr,

                {

                    networkPassphrase:
                        network.passphrase,

                    address:prepared.source

                }

            );
```

3. بدون `signedTxXdr` ادامه نمی‌دهد؛ سپس `assertSignedPayment` مقصد/مبلغ/memo/امضا را چک می‌کند.
4. فقط پس از امضای معتبر، `server.submitTransaction(signed)` اجرا می‌شود.

استثنا فقط برای تست محلی:

```2313:2328:stellar-wallet-source.js
        /* Localhost tests may supply this signer.
           A production hostname never reaches it. */
        const testSigner =
            globalThis.HAVKAR_STELLAR_TEST_SIGN;
        ...
            testHost === "localhost" ||
            testHost === "127.0.0.1"
```

## ۲) دسترسی به کلید خصوصی / seed / دارایی مشتری؟

**PASS — شواهد فنی نشان می‌دهد HAVKAR کلید/seed مشتری را نمی‌گیرد و نگه نمی‌دارد.**

| بررسی | نتیجه | شاهد |
| --- | --- | --- |
| ساخت کیف مشتری (`Keypair.random`) در سورس اپ | خیر | فقط در تست‌ها |
| `Keypair.fromSecret` در سورس اپ | خیر | — |
| `Keypair` در کلاینت | فقط `fromPublicKey` برای راستی‌آزمایی امضا | `stellar-wallet-source.js:1720` |
| API مالکیت | `SECRET_REJECTED` برای secret/mnemonic | `lib/stellar-ownership.cjs` / `lib/stellar-mainnet-ownership.cjs` |
| UI | صریحاً secret/recovery را رد می‌کند | `wallet.html` |
| Android native | فقط WebView | `MainActivity.kt` |

HAVKAR دارایی مشتری را در کیف حضانتی نگه نمی‌دارد. در مدل `platform_collect` مبلغ خرید به آدرس شبکهٔ HAVKAR پرداخت می‌شود (کاربر امضا می‌کند) — این «نگهداری کلید مشتری» نیست، اما از نظر MiCA ممکن است دریافت/تسویه تلقی شود (بند ۴).

## ۳) آماده‌سازی، ارسال، کارمزد، `platform_collect`

| مرحله | رفتار کد |
| --- | --- |
| Prepare | سرور quote می‌سازد؛ کلاینت XDR را با memo/timeBounds/payments می‌سازد |
| Fee economics | Buyer 2٪، Seller 3٪، Services 10٪ (`describeSettlementModels`) |
| Preferred model | `direct_split`: یک tx امضاشده → پرداخت فروشنده + کارمزد پلتفرم |
| Fallback | `platform_collect`: یک payment به destination شبکهٔ HAVKAR |
| Submit | کلاینت پس از امضای کاربر به Horizon می‌فرستد |
| Verify | `verifyStellarSettlement` روی Horizon مقصد/مبلغ/memo را چک می‌کند؛ کلید خصوصی ندارد |

```14:15:lib/stellar-settlement-models.cjs
const MODEL_DIRECT_SPLIT = "direct_split";
const MODEL_PLATFORM_COLLECT = "platform_collect";
```

```466:471:lib/stellar-checkout.cjs
    payments: [
      {
        role: "platform_collect",
        destination: platform.destination,
        amount_xlm: amountXlm
      }
```

## ۴) آیا عملیاتی می‌تواند «انتقال کریپتو‌دارایی» تحت MiCA باشد؟

**تعیین حقوقی قطعی نیست — ریسک‌های فنی قابل‌شناسایی:**

| عملیات | ریسک MiCA (فنی/تحلیلی) |
| --- | --- |
| اتصال کیف خارجی + آماده‌سازی XDR + ارسال پس از امضای کاربر | ممکن است تسهیل انتقال تلقی شود؛ وکیل باید بسنجد |
| `direct_split` (پرداخت مستقیم به فروشنده + کارمزد به HAVKAR) | کاهش حضانت مبلغ خرید؛ دریافت کارمزد همچنان قابل‌تحلیل به‌عنوان خدمت کریپتو |
| `platform_collect` (کل مبلغ به destination HAVKAR) | بالاترین سطح ریسک در میان مدل‌های فعلی |
| Trade/exchange | در کد رد می‌شود (`TRADE_UNCHANGED`) — صرافی نیست |
| Custody کلید مشتری | در کد دیده نشد |

نتیجهٔ عامل: **هیچ ادعای «خارج از CASP» مجاز نیست.**

## ۵) حفظ Stellar و SCF

پوشهٔ `docs/scf/` دست‌نخورده ماند (۹ سند). یکپارچگی Stellar حذف یا غیرفعال‌سازی دائمی نشد.

## ۶) Mainnet / LIVE_COLLECTION

کد: بدون `HAVKAR_STELLAR_MAINNET_LIVE_COLLECTION=true` مشتری Mainnet رد می‌شود.

```229:237:lib/stellar-checkout.cjs
  if (
    network === NETWORK_MAINNET &&
    !stellarMainnetLiveCollectionEnabled(env)
  ) {
    return refused(
      403,
      "STELLAR_MAINNET_LIVE_COLLECTION_OFF",
```

Production مشاهده‌شده (۲۰۲۶-۱۱-۱۰):  
`HAVKAR_REAL_PAYMENTS_ENABLED=false` · Stripe live off · webhook `REAL_PAYMENTS_PAUSED` · LIVE_COLLECTION exact-true نیست.

## ۷) تست‌های امنیتی اجراشده

| مجموعه | نتیجه |
| --- | --- |
| `tests/stellar-*.test.mjs` + `xlm-*.test.mjs` (۱۷ تست) | **PASS** |
| `tests/lobstr-sign-guard.test.mjs` | **PASS** |
| `scripts/verify-payment-activation-gates.mjs` | **PASS** (paused) |

لاگ‌ها:

```
/opt/cursor/artifacts/stellar-wallet-compliance-tests.log
/opt/cursor/artifacts/stellar-lobstr-sign-guard.log
/opt/cursor/artifacts/stellar-payment-gates-audit.log
```

## خلاصه تصمیم‌گیری Owner

1. از نظر فنی: امضای خارجی الزامی است؛ کلید مشتری در HAVKAR نیست.  
2. از نظر حقوقی: `platform_collect` و حتی دریافت کارمزد در `direct_split` ممکن است تحت خدمات انتقال/کریپتو MiCA بررسی شوند — وکیل لازم است.  
3. برای انتشار: LIVE_COLLECTION و پرداخت واقعی را خاموش نگه دارید؛ Stellar/Testnet/SCF را حفظ کنید.
