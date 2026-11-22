# HAVKAR — گزارش نهایی بررسی / اصلاح / فعال‌سازی پرداخت‌های واقعی

تاریخ: 2026-11-12  
برنچ: `cursor/havkar-real-payments-activation-d4b2`  
مبنای فنی: ادامهٔ کار PR #154 (`stripe-payments-settlement-audit`)

## حکم کلی

**پرداخت کارت واقعی فعال نشد و عمداً غیرفعال ماند (NO-GO برای arming).**

دلیل: پیش‌نیازهای فنی هنوز کامل نیستند و دستور کار صراحتاً می‌گوید بدون تأیید جداگانهٔ مالک هیچ تراکنش/برداشت/بازپرداخت واقعی انجام نشود؛ همچنین قفل‌های امنیتی نباید دور زده شوند.

کد `REAL_PAYMENTS_PAUSED` یک باگ تصادفی نیست: قفل رسمی مالک است. روی **Production (`main`)** باگ واقعی دیگری وجود دارد که وب‌هوک‌های **امضادار** Stripe را هم وقتی فلگ‌ها خاموش‌اند با ۴۰۳ رد می‌کند — این در برنچ پرداخت اصلاح شده و هنوز روی `main` منتشر نشده است.

---

## ۱) بخش‌های بررسی‌شده و نتیجه

| بخش | نتیجه | توضیح کوتاه |
|-----|--------|-------------|
| Stripe Live حساب `acct_1UJwZZECWiUpELSP` | **PASS** | `charges_enabled` / `payouts_enabled` / requirements خالی؛ descriptor HAVKAR |
| Stripe Connect (sandbox sellers) | **BLOCKED** | اکانت‌های تست ناقص؛ `charges_enabled=false` |
| خریدوفروش (۲٪+۳٪ destination) | **کد PASS / e2e BLOCKED** | `lib/marketplace-connect.cjs` + تست واحد؛ Connect زنده آماده نیست |
| خدمات (۱۰٪ ارائه‌دهنده) | **کد PASS** | ledger جدا از موجودی Stripe؛ نقدی ≠ Stripe |
| بلیت رویدادها | **کد PASS / Production webhook BLOCKED** | فعال‌سازی بلیت روی برنچ با processor ایدمپوتنت |
| اشتراک / Jobs / HAVKAR AI کارت | **BLOCKED** | در status به‌عنوان unsupported؛ مسیر کارت Stripe برای این‌ها آمادهٔ انتشار نیست |
| کمیسیون‌ها | **PASS (واحد)** | Buy 2%/Sell 3% → fee 5%؛ Services 10% |
| مالیات خودکار داخل اپ | **BLOCKED / محدود** | Stripe Tax در اپ پیاده نیست؛ حساب Live دارای tax/VAT در سطح Stripe |
| سفارش / پرداخت / لغو / refund / dispute | **کد PASS روی برنچ** | processor رویدادهای لازم را پوشش می‌دهد |
| امنیت DB / ایدمپوتنسی وب‌هوک | **PASS (schema)** | `stripe_webhook_events` + `stripe_payout_events` در Supabase موجود |
| تسویه به Revolut | **PASS (پیکربندی)** | بانک پیش‌فرض EUR Revolut `…8455`، payout روزانه؛ `status=new` غیرمسدودکننده |
| فلگ‌های Vercel Production | **OFF** | `HAVKAR_REAL_PAYMENTS_ENABLED` و `HAVKAR_STRIPE_LIVE_ENABLED` تنظیم/true نیستند |
| مجموعهٔ مشتری Production | **paused** | تأیید از `/api/payment-activation-status` |

---

## ۲) مشکلات شناسایی‌شده و اصلاحات

### الف) باگ واقعی Production: وب‌هوک امضادار → `REAL_PAYMENTS_PAUSED`

روی `origin/main` در `api/stripe-webhook.js` بعد از ads-boost و **قبل از** `constructEvent`، اگر `cardPaymentsAllowed()` نباشد، همهٔ deliveryهای Stripe با ۴۰۳ رد می‌شوند. یعنی حتی با ۱۴ رویداد صحیح در Dashboard، Stripe تا وقتی فلگ‌ها روشن نشوند پاسخ موفق نمی‌گیرد و reconciliation کار نمی‌کند.

**اصلاح در برنچ:** پردازش رویدادهای امضادار برای reconciliation مجاز است؛ ایجاد Checkout زنده همچنان پشت گیت می‌ماند؛ marketplace live fulfillment وقتی فلگ‌ها خاموش‌اند رد می‌شود.

### ب) وب‌هوک Live — تطبیق ۱۴ رویداد

خواندن MCP Live (2026-11-12): endpoint `we_1UK6rg…` → `https://havkar.online/api/stripe-webhook`  
`enabled_events` دقیقاً برابر `REQUIRED_WEBHOOK_EVENTS` (**۱۴/۱۴، match=true**).

### ج) Test Mode

Sandbox webhook endpoints: **خالی**. ساخت از MCP write → Unauthorized. e2e کارت تست اجرا نشد.

### د) `REAL_PAYMENTS_PAUSED` روی POST بدون امضا

عمدی است (probe آماده‌سازی). وقتی فلگ‌ها خاموش‌اند، پاسخ ۴۰۳ با این کد برمی‌گردد. این قفل نباید حذف شود.

### هـ) کد Production قدیمی

`main` هنوز processor قدیمی فقط-`checkout.session.completed` را دارد. اصلاحات Connect/fees/webhook روی برنچ PR هستند و به Production نرسیده‌اند.

---

## ۳) وضعیت Stripe Live و Connect

- Live: آماده از نظر حساب/بانک/قابلیت‌ها؛ **جمع‌آوری مشتری خاموش**.
- Connect: helpers Accounts v2 + destination charge در کد؛ فروشندهٔ تست کامل نشده.
- کلید Production: حالت `live` (مقدار کلید گزارش نمی‌شود).

---

## ۴) وضعیت وب‌هوک و آزمایش‌های امنیتی

- اشتراک Live: **۱۴ رویداد منطبق با کد** (Dashboard/MCP).
- پردازش امن امضا روی برنچ: verify signature → ایدمپوتنسی → بلیت/refund/dispute/payout.
- Production فعلی: delivery امضادار با فلگ خاموش → ۴۰۳ (باگ؛ با merge برنچ رفع می‌شود).
- تست‌های خودکار این نشست: suites Stripe/marketplace/commission/events/pause → اجرا و PASS (جزئیات در لاگ artifact).

---

## ۵) وضعیت واقعی فعال‌سازی پرداخت‌ها

| فلگ / حالت | وضعیت |
|------------|--------|
| `customer_facing_collection` | `paused` |
| `HAVKAR_REAL_PAYMENTS_ENABLED` | false / unset |
| `HAVKAR_STRIPE_LIVE_ENABLED` | false / unset |
| `live_collection_allowed` | false |
| تراکنش واقعی این جلسه | **انجام نشد** |
| arming فلگ روی Vercel | **انجام نشد** |

---

## ۶) کمیسیون‌ها و Revolut

- خریدوفروش: خریدار +۲٪، فروشنده −۳٪، `application_fee` ≈ ۵٪ لیست (destination).
- خدمات: ۱۰٪ فقط از ارائه‌دهنده؛ نقدی در ledger جدا و «موجودی Stripe» شمرده نمی‌شود.
- payout schedule حساب Live: daily → بانک Revolut EUR پیش‌فرض.
- هیچ payout/transfer دستی در این جلسه زده نشد.

---

## ۷) باقی‌مانده برای انتشار عمومی (ترتیب Owner)

1. **Merge** برنچ پرداخت (webhook processor + Connect fees + bank status) به مسیر Production و redeploy.
2. تأیید دوباره که Live webhook هنوز ۱۴ رویداد دارد.
3. ساخت **Test Mode** webhook + گذاشتن `sk_test`/`whsec` روی Preview و `HAVKAR_STRIPE_TEST_CHECKOUT_ENABLED=true`؛ یک e2e واقعی تست (پرداخت، بلیت/QR، refund).
4. تکمیل حداقل یک seller Connect تست تا `charges_enabled=true` و یک Checkout مقصدی.
5. تصمیم جداگانه برای Jobs / AI / subscription (احتمالاً IAP/Play Billing؛ کارت Stripe فعلاً unsupported).
6. پس از تأیید کتبی مالک برای مبلغ/ریسک قانونی: روی Vercel Production  
   `HAVKAR_STRIPE_LIVE_ENABLED=true` سپس `HAVKAR_REAL_PAYMENTS_ENABLED=true` و redeploy — **بدون دور زدن گیت‌ها**.
7. فقط با تأیید جداگانه: یک micro-charge زندهٔ اختیاری (این agent انجام نمی‌دهد مگر دستور صریح مبلغ).

---

## شواهد اجراشده (بدون ساختگی)

- MCP Live webhook read → ۱۴ رویداد match
- MCP Test webhook list → `[]`
- MCP write Test webhook / Checkout → Unauthorized
- `GET https://havkar.online/api/payment-activation-status` → collection paused، flags false، Revolut probed
- `POST` بدون امضا به webhook Production → 403 `REAL_PAYMENTS_PAUSED`
- مقایسه `origin/main` webhook vs برنچ → باگ pause قبل از constructEvent فقط روی main
- Supabase: جداول `stripe_webhook_events` و `stripe_payout_events` موجود؛ migration اعمال‌شده
- هیچ secret / IBAN کامل / کلید در این گزارش چاپ نشده است
