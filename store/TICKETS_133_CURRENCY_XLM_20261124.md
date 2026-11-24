# HAVKAR Tickets — ۱۳۳ ارز + XLM (2026-11-24)

## منبع حقیقت
- `lib/stripe-supported-currencies-60.cjs` → `PRESENTMENT_COUNT === 133`
- `havkar-presentment-currencies.js` (فرانت)
- XLM در فهرست ۱۳۳ نیست (ریل کریپتو جدا)

## ✅ تکمیل‌شده
- انتخابگر قابل جستجو (نام / کد / نماد / منطقه) در Travel Tickets و Events
- جداسازی Display / Payment / Settlement
- FX فقط با نرخ معتبر + زمان به‌روزرسانی؛ بدون تخمین
- Omio: فقط hint ارزهای تأییدشده عمومی؛ XLM هرگز به شریک پاس نمی‌شود
- حفظ PR #285 (travel live) و عدم لمس قابلیت‌های سالم #284
- بدون فعال‌سازی پرداخت زنده / merge / deploy

## شمارش‌ها (صادقانه)
- **نمایش (display):** ۱۳۳ فیات تأییدشده + XLM جدا
- **قابل پرداخت کارت زنده:** فقط وقتی Owner فلگ‌های Stripe را فعال کند؛ نمایش ۱۳۳ ≠ شارژ همه
- **Hint شریک Omio:** زیرمجموعه محافظه‌کار ISO (نه هر ۱۳۳)
- **XLM:** ریل Stellar مستقل؛ Mainnet Owner-gated؛ کلید خصوصی ذخیره نمی‌شود

## 🟡 باقی‌مانده
- قرارداد/کلید Omio API inventory
- فعال‌سازی Owner برای Stripe live multi-currency charge روی Events
- Mainnet XLM live برای Events با تأیید مالک

## 🔴 محدودیت واقعی
- بدون نرخ FX → مبلغ تبدیل‌شده نشان داده نمی‌شود (عمدی)
- Rome2Rio پارامتر currency عمومی پایدار ندارد
