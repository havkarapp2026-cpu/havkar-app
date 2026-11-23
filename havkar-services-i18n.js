/**
 * Services page glossary for approved HAVKAR languages.
 * RTL: fa, ar, ckb, ur. Kurmanji (kmr) is LTR.
 */
(function (root) {
  "use strict";
  var RTL = { fa: true, ar: true, ckb: true, ur: true };
  var KEYS = [
    "Available Services",
    "Bookings",
    "Offer a Service",
    "No services found",
    "Near me",
    "Distance",
    "All distances",
    "Within 5 km",
    "Within 25 km",
    "Within 100 km",
    "Map",
    "Use my location",
    "Stripe Connect",
    "Start Connect",
    "Pay by card",
    "Confirm Booking",
    "Search",
    "Saved",
    "Home",
    "Messages",
    "Provider tools",
    "Availability",
    "Credentials",
    "Reschedule",
    "Request refund",
    "Invoice",
    "Select supported country",
    "File complaint",
    "Cancel request",
    "Accept",
    "Decline"
  ];
  var PHRASES = {
    en: {
      "Available Services": "Available Services",
      Bookings: "Bookings",
      "Offer a Service": "Offer a Service",
      "No services found": "No services found",
      "Near me": "Near me",
      Distance: "Distance",
      "All distances": "All distances",
      "Within 5 km": "Within 5 km",
      "Within 25 km": "Within 25 km",
      "Within 100 km": "Within 100 km",
      Map: "Map",
      "Use my location": "Use my location",
      "Stripe Connect": "Stripe Connect",
      "Start Connect": "Start / continue Stripe Connect",
      "Pay by card": "Pay by card (Stripe Connect, 10% provider fee)",
      "Confirm Booking": "Confirm Booking",
      Search: "Search",
      Saved: "Saved",
      Home: "Home",
      Messages: "Messages",
      "Provider tools": "Provider tools",
      Availability: "Availability",
      Credentials: "Credentials",
      Reschedule: "Reschedule",
      "Request refund": "Request refund",
      Invoice: "Invoice",
      "Select supported country": "Select supported country",
      "File complaint": "File complaint",
      "Cancel request": "Cancel request",
      Accept: "Accept",
      Decline: "Decline"
    },
    fa: {
      "Available Services": "خدمات موجود",
      Bookings: "رزروها",
      "Offer a Service": "ثبت خدمت",
      "No services found": "خدمتی یافت نشد",
      "Near me": "نزدیک من",
      Distance: "فاصله",
      "All distances": "همه فاصله‌ها",
      "Within 5 km": "تا ۵ کیلومتر",
      "Within 25 km": "تا ۲۵ کیلومتر",
      "Within 100 km": "تا ۱۰۰ کیلومتر",
      Map: "نقشه",
      "Use my location": "موقعیت من",
      "Stripe Connect": "اتصال Stripe",
      "Start Connect": "شروع / ادامه اتصال Stripe",
      "Pay by card": "پرداخت کارت (Stripe Connect، کارمزد ۱۰٪ ارائه‌دهنده)",
      "Confirm Booking": "تأیید رزرو",
      Search: "جستجو",
      Saved: "ذخیره‌ها",
      Home: "خانه",
      Messages: "پیام‌ها",
      "Provider tools": "ابزار ارائه‌دهنده",
      Availability: "زمان‌بندی",
      Credentials: "مدارک حرفه‌ای",
      Reschedule: "تغییر زمان",
      "Request refund": "درخواست بازپرداخت",
      Invoice: "صورتحساب",
      "Select supported country": "کشور پشتیبانی‌شده را انتخاب کنید",
      "File complaint": "ثبت شکایت",
      "Cancel request": "لغو درخواست",
      Accept: "پذیرش",
      Decline: "رد"
    },
    ckb: {
      "Available Services": "خزمەتگوزارییە بەردەستەکان",
      Bookings: "حجزکردنەکان",
      "Offer a Service": "خزمەتگوزاری پێشکەش بکە",
      "No services found": "هیچ خزمەتگوزارییەک نەدۆزرایەوە",
      "Near me": "نزیكی من",
      Distance: "دووری",
      "All distances": "هەموو دوورییەکان",
      "Within 5 km": "تا ٥ کم",
      "Within 25 km": "تا ٢٥ کم",
      "Within 100 km": "تا ١٠٠ کم",
      Map: "نەخشە",
      "Use my location": "شوێنی من بەکاربهێنە",
      "Stripe Connect": "پەیوەندی Stripe",
      "Start Connect": "دەستپێکردن / بەردەوامی Stripe Connect",
      "Pay by card": "پارەدان بە کارت",
      "Confirm Booking": "دڵنیاکردنەوەی حجز",
      Search: "گەڕان",
      Saved: "پاشەکەوتکراوەکان",
      Home: "سەرەتا",
      Messages: "نامەکان",
      "Provider tools": "ئامرازەکانی دابینکەر",
      Availability: "کاتەکان",
      Credentials: "بڕوانامە",
      Reschedule: "گۆڕینی کات",
      "Request refund": "داواکاری گەڕاندنەوە",
      Invoice: "وەسڵ",
      "Select supported country": "وڵاتی پشتگیریکراو هەڵبژێرە",
      "File complaint": "سکاڵا تۆمار بکە",
      "Cancel request": "هەڵوەشاندنەوەی داواکاری",
      Accept: "قبوڵکردن",
      Decline: "ڕەتکردنەوە"
    },
    kmr: {
      "Available Services": "Xizmetên berdest",
      Bookings: "Rezervasyon",
      "Offer a Service": "Xizmetê pêşkêş bike",
      "No services found": "Xizmet nehat dîtin",
      "Near me": "Nêzîkî min",
      Distance: "Dûrahî",
      "All distances": "Hemû dûrahî",
      "Within 5 km": "Heta 5 km",
      "Within 25 km": "Heta 25 km",
      "Within 100 km": "Heta 100 km",
      Map: "Nexşe",
      "Use my location": "Cihê min bikar bîne",
      "Stripe Connect": "Girêdana Stripe",
      "Start Connect": "Dest pê bike / Stripe Connect berdewam bike",
      "Pay by card": "Bi kartê bide",
      "Confirm Booking": "Rezervasyonê pejirîne",
      Search: "Lêgerîn",
      Saved: "Tomarkirî",
      Home: "Mal",
      Messages: "Peyam",
      "Provider tools": "Amûrên pêşkêşker",
      Availability: "Demjimêr",
      Credentials: "Belge",
      Reschedule: "Demê biguherîne",
      "Request refund": "Daxwaza vegerandinê",
      Invoice: "Fatura",
      "Select supported country": "Welatê piştgirîkirî hilbijêre",
      "File complaint": "Gilî bike",
      "Cancel request": "Daxwazê betal bike",
      Accept: "Pejirandin",
      Decline: "Redkirin"
    },
    it: {
      "Available Services": "Servizi disponibili",
      Bookings: "Prenotazioni",
      "Offer a Service": "Offri un servizio",
      "No services found": "Nessun servizio trovato",
      "Near me": "Vicino a me",
      Distance: "Distanza",
      "All distances": "Tutte le distanze",
      "Within 5 km": "Entro 5 km",
      "Within 25 km": "Entro 25 km",
      "Within 100 km": "Entro 100 km",
      Map: "Mappa",
      "Use my location": "Usa la mia posizione",
      "Stripe Connect": "Stripe Connect",
      "Start Connect": "Avvia / continua Stripe Connect",
      "Pay by card": "Paga con carta (Stripe Connect, commissione 10% fornitore)",
      "Confirm Booking": "Conferma prenotazione",
      Search: "Cerca",
      Saved: "Salvati",
      Home: "Home",
      Messages: "Messaggi",
      "Provider tools": "Strumenti fornitore",
      Availability: "Disponibilità",
      Credentials: "Credenziali",
      Reschedule: "Riprogramma",
      "Request refund": "Richiedi rimborso",
      Invoice: "Fattura",
      "Select supported country": "Seleziona paese supportato",
      "File complaint": "Invia reclamo",
      "Cancel request": "Annulla richiesta",
      Accept: "Accetta",
      Decline: "Rifiuta"
    },
    sv: {
      "Available Services": "Tillgängliga tjänster",
      Bookings: "Bokningar",
      "Offer a Service": "Erbjud en tjänst",
      "No services found": "Inga tjänster hittades",
      "Near me": "Nära mig",
      Distance: "Avstånd",
      "All distances": "Alla avstånd",
      "Within 5 km": "Inom 5 km",
      "Within 25 km": "Inom 25 km",
      "Within 100 km": "Inom 100 km",
      Map: "Karta",
      "Use my location": "Använd min plats",
      "Stripe Connect": "Stripe Connect",
      "Start Connect": "Starta / fortsätt Stripe Connect",
      "Pay by card": "Betala med kort (Stripe Connect, 10% leverantörsavgift)",
      "Confirm Booking": "Bekräfta bokning",
      Search: "Sök",
      Saved: "Sparade",
      Home: "Hem",
      Messages: "Meddelanden",
      "Provider tools": "Leverantörsverktyg",
      Availability: "Tillgänglighet",
      Credentials: "Behörigheter",
      Reschedule: "Boka om",
      "Request refund": "Begär återbetalning",
      Invoice: "Faktura",
      "Select supported country": "Välj stödd land",
      "File complaint": "Lämna klagomål",
      "Cancel request": "Avbryt begäran",
      Accept: "Acceptera",
      Decline: "Avvisa"
    },
    ar: {
      "Available Services": "الخدمات المتاحة",
      Bookings: "الحجوزات",
      "Offer a Service": "قدّم خدمة",
      "No services found": "لا توجد خدمات",
      "Near me": "بالقرب مني",
      Distance: "المسافة",
      "All distances": "كل المسافات",
      "Within 5 km": "ضمن ٥ كم",
      "Within 25 km": "ضمن ٢٥ كم",
      "Within 100 km": "ضمن ١٠٠ كم",
      Map: "الخريطة",
      "Use my location": "استخدم موقعي",
      "Stripe Connect": "Stripe Connect",
      "Start Connect": "بدء / متابعة Stripe Connect",
      "Pay by card": "الدفع بالبطاقة (عمولة ١٠٪ على المزود)",
      "Confirm Booking": "تأكيد الحجز",
      Search: "بحث",
      Saved: "المحفوظات",
      Home: "الرئيسية",
      Messages: "الرسائل",
      "Provider tools": "أدوات المزود",
      Availability: "التوفر",
      Credentials: "الاعتمادات",
      Reschedule: "إعادة الجدولة",
      "Request refund": "طلب استرداد",
      Invoice: "فاتورة",
      "Select supported country": "اختر دولة مدعومة",
      "File complaint": "تقديم شكوى",
      "Cancel request": "إلغاء الطلب",
      Accept: "قبول",
      Decline: "رفض"
    },
    ur: {
      "Available Services": "دستیاب خدمات",
      Bookings: "بکنگز",
      "Offer a Service": "خدمت پیش کریں",
      "No services found": "کوئی خدمت نہیں ملی",
      "Near me": "میرے قریب",
      Distance: "فاصلہ",
      "All distances": "تمام فاصلے",
      "Within 5 km": "۵ کلومیٹر کے اندر",
      "Within 25 km": "۲۵ کلومیٹر کے اندر",
      "Within 100 km": "۱۰۰ کلومیٹر کے اندر",
      Map: "نقشہ",
      "Use my location": "میرا مقام استعمال کریں",
      "Stripe Connect": "Stripe Connect",
      "Start Connect": "Stripe Connect شروع / جاری رکھیں",
      "Pay by card": "کارڈ سے ادائیگی (۱۰٪ فراہم‌کنندہ کمیشن)",
      "Confirm Booking": "بکنگ کی تصدیق",
      Search: "تلاش",
      Saved: "محفوظ",
      Home: "ہوم",
      Messages: "پیغامات",
      "Provider tools": "فراہم‌کنندہ ٹولز",
      Availability: "دستیابی",
      Credentials: "اسناد",
      Reschedule: "وقت تبدیل کریں",
      "Request refund": "رقم کی واپسی کی درخواست",
      Invoice: "انوائس",
      "Select supported country": "معاون ملک منتخب کریں",
      "File complaint": "شکایت درج کریں",
      "Cancel request": "درخواست منسوخ کریں",
      Accept: "قبول",
      Decline: "مسترد"
    }
  };

  function currentLang() {
    try {
      var raw =
        (window.HAVKAR_I18N && window.HAVKAR_I18N.getLang && window.HAVKAR_I18N.getLang()) ||
        localStorage.getItem("havkar_lang") ||
        document.documentElement.lang ||
        "en";
      return String(raw || "en").toLowerCase();
    } catch (_e) {
      return "en";
    }
  }

  function applyServicesI18n(lang) {
    var code = String(lang || currentLang() || "en").toLowerCase();
    var dict = PHRASES[code] || PHRASES.en;
    document.documentElement.lang = code;
    document.documentElement.dir = RTL[code] ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n-services]").forEach(function (node) {
      var key = node.getAttribute("data-i18n-services");
      if (!key) return;
      var translated = dict[key] || (PHRASES.en && PHRASES.en[key]) || key;
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
        node.setAttribute("placeholder", translated);
      } else if (node.tagName === "OPTION") {
        node.textContent = translated;
      } else {
        node.textContent = translated;
      }
    });
  }

  root.HAVKAR_SERVICES_I18N = {
    RTL: RTL,
    KEYS: KEYS,
    PHRASES: PHRASES,
    currentLang: currentLang,
    apply: applyServicesI18n
  };

  if (typeof document !== "undefined") {
    applyServicesI18n(currentLang());
    document.addEventListener("havkar:langchange", function (ev) {
      applyServicesI18n((ev && ev.detail && ev.detail.lang) || currentLang());
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
