# HAVKAR Travel Tickets — تجربه زنده (2026-11-24)

## جداسازی
- Travel Tickets (`tickets.html`) از Event Tickets (`events.html` / PR #284) جدا نگه داشته شد.
- این PR فایل‌های Events و مهاجرت event seats را لمس نمی‌کند.

## ✅ تکمیل واقعی در کد
- نقشه سبز HAVKAR + Journey HUD (مبدأ، مقصد، فاصله، ETA، باقی‌مانده با GPS، provider، stops)
- رضایت صریح GPS قبل از locate / watchPosition؛ بدون آپلود مختصات به سرور؛ توقف follow
- ترجیحات جستجو (مدت/قیمت/توقف) به‌عنوان hint برای partner — بدون جعل موجودی
- نوار صداقت دوربین‌های عمومی مجوزدار؛ بدون CCTV خصوصی؛ JPEG هرگز LIVE معرفی نمی‌شود
- شفافیت: کارمزد ۵٪ مارکت‌پلیس با پرواز/قطار/اتوبوس/کشتی/رویداد مخلوط نمی‌شود؛ لینک About برای سیاست درآمد
- وضعیت زنده وسیله: فقط پیام صادقانه «نیاز به feed مجوزدار» — بدون ADS-B جعلی

## 🟡 نیازمند کلید / قرارداد
- TomTom برای جستجو/ترافیک بهتر (بدون کلید: OSM/OSRM)
- Omio API inventory / live booking (redirect فعلی حفظ شد)
- Duffel live orders
- ADS-B / وضعیت زنده قطار/کشتی اپراتوری
- Mapillary / Google embed برای 360 بیشتر

## 🔴 مشکلات واقعی
- هیچ رگرسیون شناخته‌شده در Travel نسبت به main در این PR نیست؛ Events (#284) لمس نشده.

## تست
`tests/tickets-travel-live-experience.test.mjs`
