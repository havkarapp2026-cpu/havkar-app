/**
 * Offline glossary for premium-platform UI strings (Transport, Reviews, Hotels chrome).
 * Covers approved HAVKAR languages: en (source), it, sv, fa, ckb, kmr, ar.
 * ku maps to kmr when selected elsewhere.
 */
(function (root) {
  "use strict";

  var PHRASES = {
    it: {
      "Transport & Logistics": "Trasporti e logistica",
      "Premium HAVKAR categories. Live regulated booking stays gated until provider agreements exist.":
        "Categorie premium HAVKAR. La prenotazione regolamentata resta bloccata finché non ci sono accordi con i fornitori.",
      "Local courier & parcels": "Corriere locale e pacchi",
      "Food & grocery courier": "Corriere cibo e spesa",
      "Truck & commercial goods": "Camion e merce commerciale",
      "Bus & passenger routes": "Autobus e tratte passeggeri",
      "Taxi & private transfers": "Taxi e trasferimenti privati",
      "Air cargo & flights": "Cargo aereo e voli",
      "Maritime & ferry": "Marittimo e traghetti",
      "Transit & forwarding": "Transito e spedizioni",
      "Operational": "Operativo",
      "Unavailable": "Non disponibile",
      "Verified reviews": "Recensioni verificate",
      "My Reviews": "Le mie recensioni",
      "Customer Reviews": "Recensioni clienti",
      "Public verified": "Pubbliche verificate",
      "Search businesses & services": "Cerca attività e servizi",
      "Use my location": "Usa la mia posizione",
      "Map discovery": "Scoperta sulla mappa",
      "Map + list": "Mappa + elenco",
      "Favorites": "Preferiti",
      "Compare": "Confronta",
      "Add to favorites": "Aggiungi ai preferiti",
      "Remove from favorites": "Rimuovi dai preferiti",
      "Compare stays": "Confronta soggiorni",
      "City / destination / address": "Città / destinazione / indirizzo",
      "No verified accommodation is published yet":
        "Nessun alloggio verificato è ancora pubblicato",
      "Doctors & Pharmacies": "Medici e farmacie",
      "Global healthcare discovery. Patients use HAVKAR for free. No invented providers.":
        "Scoperta sanitaria globale. I pazienti usano HAVKAR gratis. Nessun fornitore inventato.",
      "Medicine encyclopedia": "Enciclopedia dei farmaci",
      "International medical travel": "Viaggi medici internazionali",
      "Use my location": "Usa la mia posizione",
      "Search providers": "Cerca fornitori"
    },
    sv: {
      "Transport & Logistics": "Transport och logistik",
      "Premium HAVKAR categories. Live regulated booking stays gated until provider agreements exist.":
        "Premiumkategorier i HAVKAR. Reglerad livebokning förblir stängd tills leverantörsavtal finns.",
      "Local courier & parcels": "Lokal budservice och paket",
      "Food & grocery courier": "Mat- och livsmedelsbud",
      "Truck & commercial goods": "Lastbil och gods",
      "Bus & passenger routes": "Buss och passagerarlinjer",
      "Taxi & private transfers": "Taxi och privata transfer",
      "Air cargo & flights": "Flygfrakt och flyg",
      "Maritime & ferry": "Sjöfrakt och färja",
      "Transit & forwarding": "Transit och spedition",
      "Operational": "I drift",
      "Unavailable": "Ej tillgänglig",
      "Verified reviews": "Verifierade recensioner",
      "My Reviews": "Mina recensioner",
      "Customer Reviews": "Kundrecensioner",
      "Public verified": "Offentliga verifierade",
      "Search businesses & services": "Sök företag och tjänster",
      "Use my location": "Använd min plats",
      "Map discovery": "Kartupptäckt",
      "Map + list": "Karta + lista",
      "Favorites": "Favoriter",
      "Compare": "Jämför",
      "Add to favorites": "Lägg till i favoriter",
      "Remove from favorites": "Ta bort från favoriter",
      "Compare stays": "Jämför boenden",
      "City / destination / address": "Stad / destination / adress",
      "No verified accommodation is published yet":
        "Inget verifierat boende är publicerat ännu",
      "Doctors & Pharmacies": "Läkare & apotek",
      "Global healthcare discovery. Patients use HAVKAR for free. No invented providers.":
        "Global hälsoupptäckt. Patienter använder HAVKAR gratis. Inga påhittade vårdgivare.",
      "Medicine encyclopedia": "Läkemedelsencyklopedi",
      "International medical travel": "Internationell medicinsk resa",
      "Search providers": "Sök vårdgivare"
    },
    fa: {
      "Transport & Logistics": "حمل‌ونقل و لجستیک",
      "Premium HAVKAR categories. Live regulated booking stays gated until provider agreements exist.":
        "دسته‌های پریمیوم HAVKAR. رزرو زندهٔ مشمول مجوز تا زمان توافق با ارائه‌دهنده بسته می‌ماند.",
      "Local courier & parcels": "پیک محلی و بسته",
      "Food & grocery courier": "پیک غذا و خرید",
      "Truck & commercial goods": "کامیون و کالای تجاری",
      "Bus & passenger routes": "اتوبوس و مسیر مسافری",
      "Taxi & private transfers": "تاکسی و ترانسفر خصوصی",
      "Air cargo & flights": "بار هوایی و پرواز",
      "Maritime & ferry": "دریایی و کشتی",
      "Transit & forwarding": "ترانزیت و فورواردر",
      "Operational": "عملیاتی",
      "Unavailable": "در دسترس نیست",
      "Verified reviews": "نظرات تأییدشده",
      "My Reviews": "نظرات من",
      "Customer Reviews": "نظرات مشتریان",
      "Public verified": "عمومی تأییدشده",
      "Search businesses & services": "جستجوی کسب‌وکار و خدمات",
      "Use my location": "استفاده از موقعیت من",
      "Map discovery": "کشف روی نقشه",
      "Map + list": "نقشه + فهرست",
      "Favorites": "علاقه‌مندی‌ها",
      "Compare": "مقایسه",
      "Add to favorites": "افزودن به علاقه‌مندی‌ها",
      "Remove from favorites": "حذف از علاقه‌مندی‌ها",
      "Compare stays": "مقایسه اقامتگاه‌ها",
      "City / destination / address": "شهر / مقصد / آدرس",
      "No verified accommodation is published yet":
        "هنوز هیچ اقامتگاه تأییدشده‌ای منتشر نشده است",
      "Doctors & Pharmacies": "پزشکان و داروخانه‌ها",
      "Global healthcare discovery. Patients use HAVKAR for free. No invented providers.":
        "کشف جهانی مراقبت سلامت. بیماران HAVKAR را رایگان استفاده می‌کنند. هیچ ارائه‌دهندهٔ ساختگی نیست.",
      "Medicine encyclopedia": "دانشنامه دارو",
      "International medical travel": "سفر درمانی بین‌المللی",
      "Search providers": "جستجوی ارائه‌دهندگان"
    },
    ar: {
      "Transport & Logistics": "النقل والخدمات اللوجستية",
      "Premium HAVKAR categories. Live regulated booking stays gated until provider agreements exist.":
        "فئات HAVKAR المميزة. يبقى الحجز المباشر المنظم مغلقًا حتى تتوفر اتفاقيات المزودين.",
      "Local courier & parcels": "توصيل محلي وطرود",
      "Food & grocery courier": "توصيل طعام وبقالة",
      "Truck & commercial goods": "شاحنات وبضائع تجارية",
      "Bus & passenger routes": "حافلات ومسارات الركاب",
      "Taxi & private transfers": "تاكسي ونقل خاص",
      "Air cargo & flights": "شحن جوي ورحلات",
      "Maritime & ferry": "بحري وعبارات",
      "Transit & forwarding": "ترانزيت وشحن دولي",
      "Operational": "تشغيلي",
      "Unavailable": "غير متاح",
      "Verified reviews": "مراجعات موثّقة",
      "My Reviews": "مراجعاتي",
      "Customer Reviews": "مراجعات العملاء",
      "Public verified": "عامة موثّقة",
      "Search businesses & services": "ابحث عن أعمال وخدمات",
      "Use my location": "استخدم موقعي",
      "Map discovery": "اكتشاف الخريطة",
      "Map + list": "خريطة + قائمة",
      "Favorites": "المفضلة",
      "Compare": "مقارنة",
      "Add to favorites": "أضف إلى المفضلة",
      "Remove from favorites": "إزالة من المفضلة",
      "Compare stays": "قارن الإقامات",
      "City / destination / address": "مدينة / وجهة / عنوان",
      "No verified accommodation is published yet":
        "لا توجد إقامة موثّقة منشورة بعد",
      "Doctors & Pharmacies": "الأطباء والصيدليات",
      "Medicine encyclopedia": "موسوعة الأدوية",
      "International medical travel": "السفر الطبي الدولي",
      "Search providers": "ابحث عن مقدمي الخدمة"
    },
    ckb: {
      "Transport & Logistics": "گواستنەوە و لۆجستیک",
      "Verified reviews": "پێداچوونەوەی پشتڕاستکراو",
      "My Reviews": "پێداچوونەوەکانی من",
      "Customer Reviews": "پێداچوونەوەی کڕیاران",
      "Use my location": "شوێنی من بەکاربهێنە",
      "Map discovery": "دۆزینەوەی نەخشە",
      "Map + list": "نەخشە + لیست",
      "Favorites": "دڵخوازەکان",
      "Compare": "بەراورد",
      "Operational": "چالاک",
      "Unavailable": "بەردەست نییە",
      "No verified accommodation is published yet":
        "هێشتا هیچ شوێنی مانەوەی پشتڕاستکراو بڵاونەکراوەتەوە",
      "Doctors & Pharmacies": "پزیشکان و دەرمانخانەکان",
      "Medicine encyclopedia": "ئەنسیکڵۆپیدیای دەرمان",
      "International medical travel": "گەشتی پزیشکی نێودەوڵەتی",
      "Search providers": "گەڕان بەدوای دابینکەران"
    },
    kmr: {
      "Transport & Logistics": "Veguheztin û lojîstîk",
      "Verified reviews": "Nirxandinên pejirandî",
      "My Reviews": "Nirxandinên min",
      "Customer Reviews": "Nirxandinên xerîdaran",
      "Use my location": "Cihê min bikar bîne",
      "Map discovery": "Keşfa nexşeyê",
      "Map + list": "Nexşe + lîste",
      "Favorites": "Bijare",
      "Compare": "Berawird bike",
      "Operational": "Çalak",
      "Unavailable": "Neynê",
      "No verified accommodation is published yet":
        "Hîn tu cihê mayînê yê pejirandî nehatiye weşandin",
      "Doctors & Pharmacies": "Bijîşk û dermanxane",
      "Medicine encyclopedia": "Ansîklopediya dermanan",
      "International medical travel": "Rêwîtiya bijîşkî ya navneteweyî",
      "Search providers": "Pêşkêşkaran bigere"
    }
  };

  function lang() {
    try {
      var code = String(localStorage.getItem("havkar_language") || "en")
        .trim()
        .toLowerCase();
      if (code === "ku") return "kmr";
      return code;
    } catch (_e) {
      return "en";
    }
  }

  function t(text) {
    var code = lang();
    if (code === "en" || !PHRASES[code]) return text;
    return PHRASES[code][text] || text;
  }

  function apply(root) {
    var code = lang();
    if (code === "en" || !PHRASES[code]) return;
    var scope = root && root.nodeType === 1 ? root : document.body;
    if (!scope) return;
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || parent.closest("script, style, [data-user-text]")) continue;
      var raw = node.nodeValue.trim();
      if (!raw) continue;
      var translated = PHRASES[code][raw];
      if (translated) node.nodeValue = translated;
    }
    scope.querySelectorAll("[aria-label]").forEach(function (el) {
      var label = PHRASES[code][el.getAttribute("aria-label")];
      if (label) el.setAttribute("aria-label", label);
    });
  }

  root.HAVKAR_PREMIUM_I18N = {
    phrases: PHRASES,
    t: t,
    apply: apply,
    language: lang
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      apply(document.body);
    });
  } else {
    apply(document.body);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
