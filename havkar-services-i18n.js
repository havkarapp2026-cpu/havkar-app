/**
 * Services page glossary for approved HAVKAR languages.
 * RTL: fa, ar, ckb, ur. Kurmanji (kmr) is LTR.
 */
(function (root) {
  "use strict";
  var RTL = { fa: true, ar: true, ckb: true, ur: true };
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
      Messages: "Messages"
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
      Messages: "پیام‌ها"
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
      Messages: "نامەکان"
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
      Messages: "Peyam"
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
      Messages: "Messaggi"
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
      Messages: "Meddelanden"
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
      Messages: "الرسائل"
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
      Messages: "پیغامات"
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
    PHRASES: PHRASES,
    currentLang: currentLang,
    apply: applyServicesI18n
  };

  document.addEventListener("DOMContentLoaded", function () {
    applyServicesI18n(currentLang());
    window.addEventListener("havkar:langchange", function (ev) {
      applyServicesI18n((ev && ev.detail && ev.detail.lang) || currentLang());
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
