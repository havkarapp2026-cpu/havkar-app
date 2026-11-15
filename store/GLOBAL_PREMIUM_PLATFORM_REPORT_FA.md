# گزارش نهایی — ارتقای پلتفرم پریمیوم جهانی HAVKAR

تاریخ: 2026-11-15  
شاخه: `cursor/global-premium-platform-d4b2`  
پایهٔ توسعه: `cursor/platform-audit-repair-d4b2` (PR #197 روی #196)  
وضعیت پرداخت زنده: بدون تغییر فلگ‌های Owner / بدون فعال‌سازی مسیر پرداخت جدید

---

## Phase 0 — ایمنی مخزن و تولید

| مورد | نتیجه |
|---|---|
| عامل‌های همزمان | IDLE در شروع Phase 0 |
| PR #196 / #197 | باز؛ این کار روی شاخهٔ جدا از tip پلتفرم ساخته شد |
| SHA تولید havkar.online | صفحهٔ Accommodation بدون نقشه (stripped) |
| موجودی هتل منتشرشده | `published = 0` (تأیید SQL) |
| مرچ‌کردن به production | انجام نشده (نیاز به تأیید Owner) |

---

## Phase 1 — Hotels / Accommodation

### قبل
- production و tip پلتفرم: `accommodation.html` کوتاه بدون Leaflet/`#map`
- پیام «No verified accommodation is published»
- `/api/hotels` روی tip نبود

### علت ریشه‌ای
رگرسیون UI: نسخهٔ غنی روی `origin/cursor/global-currencies-hotels-d4b2` بود و به tip پلتفرم/production نرسیده بود. موجودی published هم صفر است، اما نقشه به‌خاطر حذف UI نبود نه فقط خالی بودن داده.

### بعد (این PR)
- بازگردانی UI نقشه Leaflet + جستجو + تاریخ/مهمان/اتاق
- GPS با مجوز کاربر، سوئیچ Map/List، empty-state مفید
- بازگردانی handlers `hotels_*` در `api/create-event-checkout.js` + rewrite `/api/hotels`
- `lib/duffel-stays.cjs` + `lib/geocode-destination.cjs` (Nominatim/OSM)
- booking زنده همچنان Owner-gated / OFF
- بدون invent کردن لیستینگ یا قیمت

| وضعیت | حکم |
|---|---|
| نقشه حتی با موجودی خالی | **PASS** (محلی تأیید شد) |
| موجودی واقعی published | **PASS** (۰ ردیف — صادقانه خالی) |
| Duffel Stays | **BLOCKED** (دسترسی تأمین‌کننده) |
| Google Maps | **BLOCKED** (کلید لایسنس‌شده پیکربندی نشده؛ OSM استفاده می‌شود) |
| live booking charge | **BLOCKED** / عمداً OFF |

شواهد:
- قبل: `/opt/cursor/artifacts/hotels-before-prod-stripped.png`
- بعد: `/opt/cursor/artifacts/hotels-after-map-restored.png`

---

## Phase 2 — Transport / Delivery

### قبل
Delivery عملیاتی کامل؛ Taxi عمداً unavailable؛ داشبورد دسته‌بندی حمل‌ونقل نبود.

### بعد
- `transport.html` هاب پریمیوم با دسته‌های freight/food/taxi/bus/air/maritime و وضعیت صادقانه
- لینک از `delivery.html` به هاب
- Delivery بازنویسی نشد (محافظت AGENTS.md)

| دسته | حکم |
|---|---|
| Local courier / Delivery | **PASS** (موجود) |
| Food via Delivery | **PASS** (لینک عملیاتی) |
| Truck freight docs/quotes | **BLOCKED** |
| Taxi live booking | **BLOCKED** |
| Air cargo / maritime freight | **BLOCKED** |

شواهد: `/opt/cursor/artifacts/transport-hub.png`

---

## Phase 3 — Ads

### قبل
بازار Ads تقریباً کامل و isolated.

### بعد
- `showMyCampaigns` + دکمه Campaigns (header/nav)
- فیلتر مالک برای pending/active/expired بدون inject تبلیغ در Home/Buy-Sell
- تست isolation همچنان سبز

| مورد | حکم |
|---|---|
| ایزوله بودن از Home/Buy-Sell/Hotels | **PASS** |
| My Campaigns UI | **PASS** (کد + تست فایل) |
| آمار ساختگی | **PASS** (ساخته نشد) |
| live boost جدید | **BLOCKED** / بدون فعال‌سازی |

---

## Phase 4 — Events / Tickets

### قبل
Events با QR/check-in عملیاتی؛ بدون پنل نقشه در صفحهٔ Events.

### بعد
- پنل «Map discovery» با `havkar-map.js` + GPS؛ بدون شکستن create/ticket/QR
- Omio/Taxi در Tickets همچنان gated

| مورد | حکم |
|---|---|
| Create / tickets / QR موجود | **PASS** (حفظ شد؛ تست QR در این دور اجرا شد در مجموعه) |
| Map discovery | **PASS** (کد + تست استاتیک) |
| Omio live | **BLOCKED** |
| live paid event charge جدید | بدون فعال‌سازی |

---

## Phase 5 — Reviews

### قبل
stub عمدی launch-safe.

### بعد
- UI اعتماد: جستجو، تب Public verified / My Reviews
- Profile → My Reviews (`reviews.html?mine=1`)
- Settings → Customer Reviews
- بارگذاری عمومی فقط verified/completed؛ invent نشد
- RLS: کاربران فقط ردیف‌های خود را برای My Reviews می‌بینند

| مورد | حکم |
|---|---|
| Public verified inventory | **PASS** (خالی صادقانه تا مسیر completed-service) |
| My Reviews (signed-in) | **PASS** کد؛ runtime login در این محیط **NOT TESTED** کامل |
| جلوگیری از دستکاری امتیاز توسط کسب‌وکار | **PASS** (سیاست UI؛ حذف مخفیانه اضافه نشد) |

شواهد: `/opt/cursor/artifacts/reviews-trust-ui.png`

---

## Phase 6 — ۱۳۳ ارز + XLM

- کامپوننت reusable: `havkar-currency-select.js`
- رجیستری: `havkar-presentment-currencies.js` Count=133؛ XLM جدا
- اتصال به Accommodation و `checkout-currency.html`
- `PRESENTMENT_COUNT === 133` در تست

| مورد | حکم |
|---|---|
| ۱۳۳ fiat | **PASS** |
| XLM جدا از fiat | **PASS** |
| فعال‌سازی پرداخت زنده جدید | انجام نشد |

شواهد: `/opt/cursor/artifacts/currency-selector-133.png`

---

## Phase 7 — Maps / GPS

- `havkar-map.js` مشترک (Leaflet/OSM + وضعیت Google + GPS)
- استفاده در Hotels (داخلی) و Events
- Delivery نقشهٔ مسیر کامل: هنوز **NOT TESTED** / اولویت بعدی

| Provider | حکم |
|---|---|
| OpenStreetMap / Leaflet | **PASS** |
| Google Maps licensed key | **BLOCKED** (پیکربندی نشده) |
| Fake tracking/ETA | ساخته نشد — **PASS** |

---

## Phase 8 — Localization (۷ زبان)

کدهای `en it sv fa ckb ku ar` در `havkar-i18n.js` پیدا شدند.  
ترجمه‌های Hotels ایتالیایی برای رشته‌های جدید اضافه شد.  
تست کامل runtime هر ۷ زبان در UI این دور: **NOT TESTED** کامل (فقط وجود دیکشنری).

---

## ماتریس پرداخت (ماژول‌های مرتبط)

| ماژول | Stripe/card | XLM | وضعیت زنده |
|---|---|---|---|
| Hotels | quote / presentment 133 | quote display | live booking OFF |
| Events | gated checkout موجود | مسیر موجود | بدون فلگ جدید |
| Ads boost | test/gated | — | بدون فعال‌سازی جدید |
| Delivery | اختصاصی کامل نیست | — | بدون charge جدید |
| Transport hub | — | — | فقط کشف/لینک |
| Currency matrix | quote-only | جدا | live OFF بدون Owner |

---

## تست‌ها

**PASS (اجرا شده در این شاخه):**
- `tests/hotels-corrections.test.mjs`
- `tests/hotels-global-currencies.test.mjs`
- `tests/global-premium-platform.test.mjs`
- `tests/marketplace-isolation.test.js`
- `tests/events-ticket-qr-flow.test.mjs` (در مجموعه اجرا)

**CI GitHub روی این شاخه:** پس از push — وضعیت در PR گزارش می‌شود.

**FAIL:** هیچ در مجموعهٔ بالا.

---

## امنیت / Production

- بدون افشای secret
- بدون migration مخرب روی prod
- migrationهای CREATE IF NOT EXISTS برای rooms/guest_bookings فقط در repo اضافه شدند؛ اعمال prod بدون تأیید Owner انجام نشد
- بدون merge/deploy خودکار

---

## وضعیت زنده روی production

| مورد | حکم |
|---|---|
| تغییرات این PR روی havkar.online | **NOT LIVE** تا merge/deploy Owner |
| Accommodation production فعلی | هنوز stripped — **FAIL** نسبت به UX مطلوب تا deploy |

---

## Commit / PR

پس از push در همین اجرا پر می‌شود: SHA شاخه + شماره PR.
