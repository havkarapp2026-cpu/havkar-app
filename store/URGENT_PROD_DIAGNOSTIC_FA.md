# گزارش فوری تشخیص Production — HAVKAR

زمان: 2026-11-15  
اولویت: بازیابی production / توقف گسترش فیچر

## حکم ریشه‌ای (تأییدشده با شواهد)

**تغییرات تأییدشدهٔ Hotels/Transport/Reviews/… روی production نیستند چون هرگز به `main` merge و deploy نشده‌اند.**

CI PASS روی preview ≠ به‌روزرسانی production.

| لایه | مقدار واقعی |
|---|---|
| دامنه production | `https://havkar.online` |
| شاخه deploy production | `main` |
| SHA production (Vercel) | `702311f8bec426b6544e820bd901c9f943346351` |
| پیام commit | Merge PR **#195** (New Idea i18n) |
| Deployment | `dpl_Far3b6AcGRtxKBSeLhfeNmMtnGdj` READY |
| PR #196 | OPEN · **mergedAt=null** · base `main` |
| PR #197 | OPEN · **mergedAt=null** · base #196 |
| PR #199 | OPEN · **mergedAt=null** · base #197 · tip `9102dbec` |

## شواهد صفحه به صفحه

| صفحه | Production | Preview (#199) | علت |
|---|---|---|---|
| Accommodation | **2383 بایت**، بدون leaflet/map | **~36KB** با map/GPS | فایل stripped روی main؛ #199 merge نشده |
| transport.html | **HTTP 404** | 200 hub | فایل فقط در #199 است |
| Delivery | فرم قدیمی (بدون لینک hub روی prod) | لینک Transport hub | همان فاصلهٔ merge |
| Reviews | stub کوتاه ~11KB | trust UI ~17KB | #199 روی main نیست |
| Events | بدون map/locationFilter | map+filter | #199 روی main نیست |
| Ads | بدون My Campaigns کامل tip | Campaigns روی tip | #199 روی main نیست |
| Services | روی main؛ باگ RTL bookmark محتمل | مشابه + اصلاح در حال آماده‌سازی | باگ جدا از merge-gap |

مقایسهٔ دقیق Accommodation:
- `origin/main:accommodation.html` = 2383 بایت = production
- `origin/cursor/global-premium-platform-d4b2:accommodation.html` = 36696 بایت

Cache: production `x-vercel-cache: HIT` با age بالا روی برخی HTMLها؛ روی main لیست no-cache شامل `accommodation` نیست. این مشکل ثانویه است — حتی با cache miss همان SHA قدیمی سرو می‌شود.

Service Worker production: `havkar-sw-20261113-emoji-sticky-tabs-v6` — پس از deploy باید bump شود تا تبلت‌ها asset کهنه نگه ندارند.

## آنچه مشکل نیست
- پیش‌فرض اشتباه «CI = production»
- ناپدید شدن تصادفی نقشه روی همان کد #199 (روی preview نقشه هست)
- نیاز به invent کردن موجودی هتل (published=0 صادقانه است)

## مسدودکنندهٔ Owner (اقدام فوری)

برای دیدن UI جدید روی تبلت واقعی:

1. Approve/merge **#196** → `main`
2. Approve/merge **#197** → (پس از #196)
3. Approve/merge **#199** → (پس از #197)
4. صبر برای Vercel production deploy از `main`
5. روی تبلت: بستن کامل اپ/تب، یا hard refresh؛ در صورت نیاز پاک کردن SW/site data برای `havkar.online`

بدون این mergeها، هیچ عامل Cloud نمی‌تواند production را با کد #199 هم‌تراز کند مگر اینکه Owner صراحتاً deploy/merge را مجاز کند.

## اقدامات فنی در حال انجام (بدون فعال‌سازی پرداخت)
- آماده‌سازی bump Service Worker برای cache bust پس از deploy
- افزودن `transport` به HTML no-cache
- اصلاح موقعیت bookmark RTL و placeholder رسانه در Services
- به‌روزرسانی گزارش و PR #199

## وضعیت «تکمیل production»
**اعلام کامل بودن production ممنوع است** تا Owner پس از merge، همان تبلت را روی `havkar.online` تأیید کند.
