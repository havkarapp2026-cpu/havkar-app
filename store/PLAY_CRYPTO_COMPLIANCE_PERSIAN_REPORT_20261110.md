# گزارش کوتاه انطباق کریپتو Google Play — HAVKAR (۱۰ نوامبر ۲۰۲۶)

این سند مشاوره حقوقی نیست. مجوز CASP/MiCA ادعا نشده است. اظهارنامه در Console ارسال نشده است.

## معماری تأییدشده کیف‌پول

- اندروید فقط WebView به `https://havkar.online/` است؛ کلید خصوصی native ندارد.
- کلاینت وب از `@creit.tech/stellar-wallets-kit` استفاده می‌کند: `defaultModules()` (Albedo، Freighter، LOBSTR، Rabet، xBull، Hana و …) + WalletConnect.
- HAVKAR کیف‌پول کاربر نمی‌سازد، seed/mnemonic/secret ذخیره نمی‌کند، و به‌جای کاربر امضا نمی‌کند.
- امضا فقط در کیف‌پول خارجی کاربر (`StellarWalletsKit.signTransaction`) انجام می‌شود؛ سرور تراکنش را روی Horizon راستی‌آزمایی می‌کند.
- صرافی/trade کریپتو ندارد (`TRADE_UNCHANGED`).
- پرداخت واقعی مشتری خاموش است: کارت/Pi = `paused` / `REAL_PAYMENTS_PAUSED`؛ `LIVE_COLLECTION` Mainnet = OFF.

شواهد فنی: `store/PLAY_CRYPTO_NONCUSTODIAL_EVIDENCE_20261110.md`

## چک‌باکس‌های دقیق Financial features (پیشنهاد فنی)

تیک بزن:

1. Mobile payments and digital wallets / پرداخت موبایلی و کیف‌پول دیجیتال  
2. Cryptocurrency wallet / کیف‌پول رمزارز  

تیک نزن:

- Cryptocurrency exchange / صرافی رمزارز  
- NFT sales/trading  
- Banking / loans / insurance / stock trading / BNPL / «هیچ ویژگی مالی ندارد»

نکته: گزینهٔ اضافی Play با متن «non-custodial software wallet» را بدون تأیید وکیل انتخاب نکنید؛ HAVKAR اتصال‌دهندهٔ marketplace است نه محصول کیف‌پول خالص.

## گزینهٔ اظهار EU (اگر از نظر حقوقی قابل دفاع باشد)

منابع رسمی:

```
https://support.google.com/googleplay/android-developer/answer/16329703?hl=en
```

| گزینه Play | وضعیت HAVKAR |
| --- | --- |
| A — در این کشور خرید/نگهداری/تبدیل کریپتو ارائه نمی‌شود + geo-restriction | از نظر فنی قابل آماده‌سازی است (`HAVKAR_CRYPTO_GEO_ENFORCEMENT`؛ فعلاً OFF). کفایت حقوقی = وکیل. |
| B — تأیید non-custodial software wallet | فقط با تأیید وکیل؛ عامل خودکار تأیید نمی‌کند. |
| C — بدون نیاز به مجوز محلی / معافیت قانونی با مدرک | **فعلاً غیرقابل ادعا** (CASP نداریم؛ مدرک معافیت در ریپو نیست). |
| آپلود مجوز MiCA CASP | **انجام نشود** — مجوز وجود ندارد. |

## الزامات اظهار worldwide (کشورهای فهرست‌شده Play)

برای کشورهای جدول رسمی Play (EU + از جولای ۲۰۲۶ IS/LI/NO، و نیز GB/US/AE/JP/…): یا مجوز/ثبت محلی را ارائه دهید، یا یکی از Additional Options صادقانه، یا آن کشورها را از توزیع حذف کنید.

برای کشورهای خارج از فهرست Play: انتشار ممکن است ادامه یابد، ولی رعایت قانون محلی همچنان لازم است و Google ممکن است مدرک بخواهد.

## موانع حقوقی باقی‌مانده

1. تعیین اینکه تسهیل پرداخت XLM marketplace / دریافت کارمزد / fallback `platform_collect` تحت MiCA CASP است یا نه.  
2. انتخاب Additional Option EU/کشورهای فهرست‌شده بدون مدرک وکیل.  
3. فعال نبودن geo enforcement در Production تا تصمیم Owner.  
4. فرم‌های کشورمحور Play پس از تیک Cryptocurrency wallet.

## امن‌ترین مسیر انتشار جهانی اولیه

1. Stellar/Testnet/SCF و کد Mainnet آینده را حذف نکنید.  
2. `LIVE_COLLECTION` و پرداخت واقعی کارت/Pi را خاموش نگه دارید.  
3. در Play: چک‌باکس‌های بالا را صادقانه بزنید؛ صرافی را نزنید.  
4. برای کشورهای فهرست‌شده بدون CASP: یا از targeting حذف شوند، یا پس از تأیید وکیل Option A + فعال‌سازی geo (`play_listed` / `eu_eea`).  
5. Option B/C یا ادعای معافیت بدون مدرک انتخاب نشود.  
6. آپلود AAB Closed Testing جدا از روشن کردن پرداخت کریپتو انجام شود.
