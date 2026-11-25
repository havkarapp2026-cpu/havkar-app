/**
 * Travel Life UI strings for all HAVKAR selectable languages.
 * Applied via data-travel-i18n keys; English is the source.
 */
(function (root) {
  "use strict";

  var STRINGS = {
    en: {
      tripName: "Trip name",
      origin: "Origin (optional)",
      destination: "Destination (optional)",
      extraStop: "Extra stop",
      startTrip: "Start trip",
      pause: "Pause",
      resume: "Resume",
      addStop: "Add stop",
      endTrip: "End trip",
      offlineMapNote:
        "Offline: recorded points stay in IndexedDB and sync when online. Full offline map tiles are not bundled (cost control).",
      personalDrive: "Personal drive",
      myTrips: "My trips",
      publicCameras: "Public cameras",
      memories: "Memories",
      reminders: "Reminders",
      showOnMap: "Show on map",
      shareTrip: "Share (optional)",
      revokeShare: "Revoke share",
      downloadJson: "Download JSON copy"
    },
    fa: {
      tripName: "نام سفر",
      origin: "مبدأ (اختیاری)",
      destination: "مقصد (اختیاری)",
      extraStop: "توقف اضافه",
      startTrip: "شروع سفر",
      pause: "توقف موقت",
      resume: "ادامه",
      addStop: "افزودن توقف",
      endTrip: "پایان سفر",
      offlineMapNote:
        "آفلاین: نقاط در IndexedDB می‌مانند و پس از اتصال همگام می‌شوند. کاشی کامل نقشه آفلاین بسته نشده (کنترل هزینه).",
      personalDrive: "رانندگی شخصی",
      myTrips: "سفرهای من",
      publicCameras: "دوربین‌های عمومی",
      memories: "خاطرات",
      reminders: "یادآورها",
      showOnMap: "نمایش روی نقشه",
      shareTrip: "اشتراک‌گذاری (اختیاری)",
      revokeShare: "لغو اشتراک",
      downloadJson: "دریافت نسخه JSON"
    },
    it: {
      tripName: "Nome viaggio",
      origin: "Partenza (opzionale)",
      destination: "Destinazione (opzionale)",
      extraStop: "Sosta extra",
      startTrip: "Avvia viaggio",
      pause: "Pausa",
      resume: "Riprendi",
      addStop: "Aggiungi sosta",
      endTrip: "Termina viaggio",
      offlineMapNote:
        "Offline: i punti restano in IndexedDB e si sincronizzano online. Tessere mappa offline complete non sono incluse (controllo costi).",
      personalDrive: "Guida personale",
      myTrips: "I miei viaggi",
      publicCameras: "Telecamere pubbliche",
      memories: "Ricordi",
      reminders: "Promemoria",
      showOnMap: "Mostra sulla mappa",
      shareTrip: "Condividi (opzionale)",
      revokeShare: "Revoca condivisione",
      downloadJson: "Scarica copia JSON"
    },
    de: {
      tripName: "Reisename",
      origin: "Start (optional)",
      destination: "Ziel (optional)",
      extraStop: "Zusätzlicher Stopp",
      startTrip: "Reise starten",
      pause: "Pause",
      resume: "Fortsetzen",
      addStop: "Stopp hinzufügen",
      endTrip: "Reise beenden",
      offlineMapNote:
        "Offline: Punkte bleiben in IndexedDB und synchronisieren online. Vollständige Offline-Kartenkacheln sind nicht gebündelt (Kostenkontrolle).",
      personalDrive: "Private Fahrt",
      myTrips: "Meine Reisen",
      publicCameras: "Öffentliche Kameras",
      memories: "Erinnerungen",
      reminders: "Erinnerungen",
      showOnMap: "Auf Karte zeigen",
      shareTrip: "Teilen (optional)",
      revokeShare: "Freigabe widerrufen",
      downloadJson: "JSON-Kopie herunterladen"
    },
    fr: {
      tripName: "Nom du voyage",
      origin: "Départ (facultatif)",
      destination: "Destination (facultatif)",
      extraStop: "Arrêt supplémentaire",
      startTrip: "Démarrer",
      pause: "Pause",
      resume: "Reprendre",
      addStop: "Ajouter un arrêt",
      endTrip: "Terminer",
      offlineMapNote:
        "Hors ligne : les points restent dans IndexedDB et se synchronisent en ligne. Tuiles carte hors ligne complètes non incluses (contrôle des coûts).",
      personalDrive: "Conduite personnelle",
      myTrips: "Mes voyages",
      publicCameras: "Caméras publiques",
      memories: "Souvenirs",
      reminders: "Rappels",
      showOnMap: "Afficher sur la carte",
      shareTrip: "Partager (facultatif)",
      revokeShare: "Révoquer le partage",
      downloadJson: "Télécharger JSON"
    },
    es: {
      tripName: "Nombre del viaje",
      origin: "Origen (opcional)",
      destination: "Destino (opcional)",
      extraStop: "Parada extra",
      startTrip: "Iniciar viaje",
      pause: "Pausa",
      resume: "Reanudar",
      addStop: "Añadir parada",
      endTrip: "Finalizar viaje",
      offlineMapNote:
        "Sin conexión: los puntos permanecen en IndexedDB y se sincronizan al conectar. No se incluyen teselas de mapa offline completas (control de costes).",
      personalDrive: "Conducción personal",
      myTrips: "Mis viajes",
      publicCameras: "Cámaras públicas",
      memories: "Recuerdos",
      reminders: "Recordatorios",
      showOnMap: "Mostrar en el mapa",
      shareTrip: "Compartir (opcional)",
      revokeShare: "Revocar compartido",
      downloadJson: "Descargar JSON"
    },
    pt: {
      tripName: "Nome da viagem",
      origin: "Origem (opcional)",
      destination: "Destino (opcional)",
      extraStop: "Parada extra",
      startTrip: "Iniciar viagem",
      pause: "Pausa",
      resume: "Retomar",
      addStop: "Adicionar parada",
      endTrip: "Terminar viagem",
      offlineMapNote:
        "Offline: os pontos ficam no IndexedDB e sincronizam online. Tiles de mapa offline completos não estão incluídos (controlo de custos).",
      personalDrive: "Condução pessoal",
      myTrips: "As minhas viagens",
      publicCameras: "Câmaras públicas",
      memories: "Memórias",
      reminders: "Lembretes",
      showOnMap: "Mostrar no mapa",
      shareTrip: "Partilhar (opcional)",
      revokeShare: "Revogar partilha",
      downloadJson: "Descarregar JSON"
    },
    nl: {
      tripName: "Reisnaam",
      origin: "Vertrek (optioneel)",
      destination: "Bestemming (optioneel)",
      extraStop: "Extra stop",
      startTrip: "Reis starten",
      pause: "Pauze",
      resume: "Hervatten",
      addStop: "Stop toevoegen",
      endTrip: "Reis beëindigen",
      offlineMapNote:
        "Offline: punten blijven in IndexedDB en synchroniseren online. Volledige offline kaarttegels zijn niet gebundeld (kostenbeheer).",
      personalDrive: "Persoonlijk rijden",
      myTrips: "Mijn reizen",
      publicCameras: "Openbare camera's",
      memories: "Herinneringen",
      reminders: "Herinneringen",
      showOnMap: "Toon op kaart",
      shareTrip: "Delen (optioneel)",
      revokeShare: "Delen intrekken",
      downloadJson: "JSON downloaden"
    },
    sv: {
      tripName: "Resenamn",
      origin: "Start (valfritt)",
      destination: "Mål (valfritt)",
      extraStop: "Extra stopp",
      startTrip: "Starta resa",
      pause: "Paus",
      resume: "Fortsätt",
      addStop: "Lägg till stopp",
      endTrip: "Avsluta resa",
      offlineMapNote:
        "Offline: punkter sparas i IndexedDB och synkas online. Fullständiga offline-kartplattor ingår inte (kostnadskontroll).",
      personalDrive: "Privat körning",
      myTrips: "Mina resor",
      publicCameras: "Offentliga kameror",
      memories: "Minnen",
      reminders: "Påminnelser",
      showOnMap: "Visa på karta",
      shareTrip: "Dela (valfritt)",
      revokeShare: "Återkalla delning",
      downloadJson: "Ladda ner JSON"
    },
    pl: {
      tripName: "Nazwa podróży",
      origin: "Start (opcjonalnie)",
      destination: "Cel (opcjonalnie)",
      extraStop: "Dodatkowy przystanek",
      startTrip: "Rozpocznij",
      pause: "Pauza",
      resume: "Wznów",
      addStop: "Dodaj przystanek",
      endTrip: "Zakończ",
      offlineMapNote:
        "Offline: punkty zostają w IndexedDB i synchronizują się online. Pełne kafelki mapy offline nie są dołączone (kontrola kosztów).",
      personalDrive: "Jazda prywatna",
      myTrips: "Moje podróże",
      publicCameras: "Kamery publiczne",
      memories: "Wspomnienia",
      reminders: "Przypomnienia",
      showOnMap: "Pokaż na mapie",
      shareTrip: "Udostępnij (opcjonalnie)",
      revokeShare: "Cofnij udostępnianie",
      downloadJson: "Pobierz JSON"
    },
    id: {
      tripName: "Nama perjalanan",
      origin: "Asal (opsional)",
      destination: "Tujuan (opsional)",
      extraStop: "Berhenti ekstra",
      startTrip: "Mulai perjalanan",
      pause: "Jeda",
      resume: "Lanjut",
      addStop: "Tambah berhenti",
      endTrip: "Akhiri perjalanan",
      offlineMapNote:
        "Offline: titik tetap di IndexedDB dan disinkronkan saat online. Ubin peta offline lengkap tidak dibundel (kontrol biaya).",
      personalDrive: "Berkendara pribadi",
      myTrips: "Perjalanan saya",
      publicCameras: "Kamera publik",
      memories: "Kenangan",
      reminders: "Pengingat",
      showOnMap: "Tampilkan di peta",
      shareTrip: "Bagikan (opsional)",
      revokeShare: "Cabut berbagi",
      downloadJson: "Unduh JSON"
    },
    zh: {
      tripName: "行程名称",
      origin: "起点（可选）",
      destination: "终点（可选）",
      extraStop: "途经点",
      startTrip: "开始行程",
      pause: "暂停",
      resume: "继续",
      addStop: "添加停留",
      endTrip: "结束行程",
      offlineMapNote: "离线：轨迹点保存在 IndexedDB，联网后同步。完整离线地图瓦片未打包（成本控制）。",
      personalDrive: "自驾",
      myTrips: "我的行程",
      publicCameras: "公共摄像头",
      memories: "回忆",
      reminders: "提醒",
      showOnMap: "在地图上显示",
      shareTrip: "分享（可选）",
      revokeShare: "撤销分享",
      downloadJson: "下载 JSON"
    },
    ja: {
      tripName: "旅の名前",
      origin: "出発地（任意）",
      destination: "目的地（任意）",
      extraStop: "追加の停留",
      startTrip: "旅を開始",
      pause: "一時停止",
      resume: "再開",
      addStop: "停留を追加",
      endTrip: "旅を終了",
      offlineMapNote:
        "オフライン：地点は IndexedDB に保存され、オンラインで同期されます。完全なオフライン地図タイルは同梱していません（コスト管理）。",
      personalDrive: "個人運転",
      myTrips: "自分の旅",
      publicCameras: "公開カメラ",
      memories: "思い出",
      reminders: "リマインダー",
      showOnMap: "地図で表示",
      shareTrip: "共有（任意）",
      revokeShare: "共有を解除",
      downloadJson: "JSONをダウンロード"
    },
    ko: {
      tripName: "여행 이름",
      origin: "출발지(선택)",
      destination: "목적지(선택)",
      extraStop: "추가 경유",
      startTrip: "여행 시작",
      pause: "일시정지",
      resume: "계속",
      addStop: "경유 추가",
      endTrip: "여행 종료",
      offlineMapNote:
        "오프라인: 지점은 IndexedDB에 저장되고 온라인에서 동기화됩니다. 전체 오프라인 지도 타일은 포함되지 않습니다(비용 관리).",
      personalDrive: "개인 운전",
      myTrips: "내 여행",
      publicCameras: "공개 카메라",
      memories: "추억",
      reminders: "알림",
      showOnMap: "지도에 표시",
      shareTrip: "공유(선택)",
      revokeShare: "공유 취소",
      downloadJson: "JSON 다운로드"
    },
    hi: {
      tripName: "यात्रा का नाम",
      origin: "प्रस्थान (वैकल्पिक)",
      destination: "गंतव्य (वैकल्पिक)",
      extraStop: "अतिरिक्त पड़ाव",
      startTrip: "यात्रा शुरू",
      pause: "रोकें",
      resume: "जारी रखें",
      addStop: "पड़ाव जोड़ें",
      endTrip: "यात्रा समाप्त",
      offlineMapNote:
        "ऑफ़लाइन: बिंदु IndexedDB में रहते हैं और ऑनलाइन सिंक होते हैं। पूर्ण ऑफ़लाइन मानचित्र टाइल शामिल नहीं (लागत नियंत्रण)।",
      personalDrive: "निजी ड्राइव",
      myTrips: "मेरी यात्राएँ",
      publicCameras: "सार्वजनिक कैमरे",
      memories: "यादें",
      reminders: "अनुस्मारक",
      showOnMap: "मानचित्र पर दिखाएँ",
      shareTrip: "साझा करें (वैकल्पिक)",
      revokeShare: "साझाकरण रद्द",
      downloadJson: "JSON डाउनलोड"
    },
    ru: {
      tripName: "Название поездки",
      origin: "Откуда (необязательно)",
      destination: "Куда (необязательно)",
      extraStop: "Доп. остановка",
      startTrip: "Начать поездку",
      pause: "Пауза",
      resume: "Продолжить",
      addStop: "Добавить остановку",
      endTrip: "Завершить",
      offlineMapNote:
        "Офлайн: точки остаются в IndexedDB и синхронизируются онлайн. Полные офлайн-тайлы карты не включены (контроль затрат).",
      personalDrive: "Личная поездка",
      myTrips: "Мои поездки",
      publicCameras: "Публичные камеры",
      memories: "Воспоминания",
      reminders: "Напоминания",
      showOnMap: "Показать на карте",
      shareTrip: "Поделиться (опционально)",
      revokeShare: "Отозвать доступ",
      downloadJson: "Скачать JSON"
    },
    tr: {
      tripName: "Yolculuk adı",
      origin: "Kalkış (isteğe bağlı)",
      destination: "Varış (isteğe bağlı)",
      extraStop: "Ek durak",
      startTrip: "Yolculuğu başlat",
      pause: "Duraklat",
      resume: "Devam",
      addStop: "Durak ekle",
      endTrip: "Yolculuğu bitir",
      offlineMapNote:
        "Çevrimdışı: noktalar IndexedDB'de kalır ve çevrimiçi senkronize olur. Tam çevrimdışı harita döşemeleri dahil değil (maliyet kontrolü).",
      personalDrive: "Kişisel sürüş",
      myTrips: "Yolculuklarım",
      publicCameras: "Herkese açık kameralar",
      memories: "Anılar",
      reminders: "Hatırlatmalar",
      showOnMap: "Haritada göster",
      shareTrip: "Paylaş (isteğe bağlı)",
      revokeShare: "Paylaşımı iptal et",
      downloadJson: "JSON indir"
    },
    ar: {
      tripName: "اسم الرحلة",
      origin: "الانطلاق (اختياري)",
      destination: "الوجهة (اختياري)",
      extraStop: "توقف إضافي",
      startTrip: "بدء الرحلة",
      pause: "إيقاف مؤقت",
      resume: "متابعة",
      addStop: "إضافة توقف",
      endTrip: "إنهاء الرحلة",
      offlineMapNote:
        "دون اتصال: تبقى النقاط في IndexedDB وتُزامن عند الاتصال. بلاط الخريطة دون اتصال غير مضمّن (ضبط التكلفة).",
      personalDrive: "قيادة شخصية",
      myTrips: "رحلاتي",
      publicCameras: "كاميرات عامة",
      memories: "ذكريات",
      reminders: "تذكيرات",
      showOnMap: "عرض على الخريطة",
      shareTrip: "مشاركة (اختياري)",
      revokeShare: "إلغاء المشاركة",
      downloadJson: "تنزيل JSON"
    },
    ur: {
      tripName: "سفر کا نام",
      origin: "آغاز (اختیاری)",
      destination: "منزل (اختیاری)",
      extraStop: "اضافی وقفہ",
      startTrip: "سفر شروع",
      pause: "وقفہ",
      resume: "جاری رکھیں",
      addStop: "وقفہ شامل کریں",
      endTrip: "سفر ختم",
      offlineMapNote:
        "آف لائن: پوائنٹس IndexedDB میں رہتے ہیں اور آن لائن ہم آہنگ ہوتے ہیں۔ مکمل آف لائن نقشہ ٹائل شامل نہیں (لاگت کنٹرول).",
      personalDrive: "ذاتی ڈرائیو",
      myTrips: "میرے سفر",
      publicCameras: "عوامی کیمرے",
      memories: "یادیں",
      reminders: "یاد دہانیاں",
      showOnMap: "نقشے پر دکھائیں",
      shareTrip: "شیئر (اختیاری)",
      revokeShare: "شیئر منسوخ",
      downloadJson: "JSON ڈاؤن لوڈ"
    },
    ckb: {
      tripName: "ناوی گەشت",
      origin: "دەستپێک (ئیختیاری)",
      destination: "مەبەست (ئیختیاری)",
      extraStop: "وەستانی زیادە",
      startTrip: "دەستپێکردنی گەشت",
      pause: "وەستان",
      resume: "بەردەوامبوون",
      addStop: "زیادکردنی وەستان",
      endTrip: "کۆتایی گەشت",
      offlineMapNote:
        "ئۆفلاین: خاڵەکان لە IndexedDB دەمێننەوە و کاتێک ئۆنلاین دەبن هاوکات دەکرێن. تایلی نەخشەی تەواوی ئۆفلاین نەبەستراوە (کۆنترۆڵی تێچوو).",
      personalDrive: "شۆفێری کەسی",
      myTrips: "گەشتەکانم",
      publicCameras: "کامێرای گشتی",
      memories: "بیرەوەری",
      reminders: "بیرخستنەوە",
      showOnMap: "پیشاندان لەسەر نەخشە",
      shareTrip: "هاوبەشکردن (ئیختیاری)",
      revokeShare: "هەڵوەشاندنەوەی هاوبەشی",
      downloadJson: "داگرتنی JSON"
    },
    kmr: {
      tripName: "Navê rêwîtiyê",
      origin: "Destpêk (bijarte)",
      destination: "Armanc (bijarte)",
      extraStop: "Rawestana zêde",
      startTrip: "Destpêkirina rêwîtiyê",
      pause: "Rawestan",
      resume: "Berdewam",
      addStop: "Rawestan zêde bike",
      endTrip: "Dawîkirina rêwîtiyê",
      offlineMapNote:
        "Offline: xal di IndexedDB de dimînin û online senkron dibin. Tileyên nexşeya offline ya tevahî nehatine pêçandin (kontrolkirina lêçûnê).",
      personalDrive: "Ajotina kesane",
      myTrips: "Rêwîtiyên min",
      publicCameras: "Kamerayên giştî",
      memories: "Bîranîn",
      reminders: "Bîranîner",
      showOnMap: "Li ser nexşe nîşan bide",
      shareTrip: "Parve bike (bijarte)",
      revokeShare: "Parvekirin betal bike",
      downloadJson: "JSON daxe"
    }
  };

  function currentLang() {
    try {
      var stored = localStorage.getItem("havkar_language");
      if (stored) return String(stored).toLowerCase();
    } catch (_e) {}
    return (document.documentElement.lang || "en").toLowerCase();
  }

  function t(key, lang) {
    lang = lang || currentLang();
    var pack = STRINGS[lang] || STRINGS.en;
    return pack[key] || STRINGS.en[key] || key;
  }

  function apply(rootEl) {
    var lang = currentLang();
    var scope = rootEl || document;
    scope.querySelectorAll("[data-travel-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-travel-i18n");
      if (!key) return;
      var text = t(key, lang);
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON") {
        if (el.tagName === "BUTTON") el.textContent = text;
        else if (el.getAttribute("placeholder") != null) el.setAttribute("placeholder", text);
      } else if (el.tagName === "LABEL") {
        var input = el.querySelector("input,select,textarea");
        if (input) {
          el.childNodes.forEach(function (node) {
            if (node.nodeType === 3 && node.textContent.trim()) {
              node.textContent = text + " ";
            }
          });
        } else {
          el.textContent = text;
        }
      } else if (el.tagName === "SPAN") {
        el.textContent = text;
      } else {
        el.textContent = text;
      }
    });
    document.querySelectorAll('[data-ticket-type] span').forEach(function (span) {
      var btn = span.parentElement;
      if (!btn) return;
      var type = btn.getAttribute("data-ticket-type");
      var map = {
        personal: "personalDrive",
        mytrips: "myTrips",
        cameras: "publicCameras",
        memories: "memories",
        reminders: "reminders"
      };
      if (map[type]) span.textContent = t(map[type], lang);
    });
  }

  root.HAVKAR_TRAVEL_I18N = {
    strings: STRINGS,
    t: t,
    apply: apply,
    languages: Object.keys(STRINGS)
  };

  if (root.document && root.document.readyState !== "loading") {
    apply();
  } else if (root.document) {
    root.document.addEventListener("DOMContentLoaded", function () {
      apply();
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
