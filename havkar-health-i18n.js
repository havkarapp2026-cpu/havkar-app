/**
 * Key-based Health UI localization for HAVKAR.
 * Languages: en (source), it, sv, fa, ckb, kmr, ar.
 * RTL: fa, ckb, ar. LTR: en, it, sv, kmr.
 */
(function (root) {
  "use strict";

  var RTL = { fa: 1, ar: 1, ckb: 1 };

  var CATEGORIES = {
    gp: {
      en: "General practitioners",
      it: "Medici di base",
      sv: "Allmänläkare",
      fa: "پزشکان عمومی",
      ar: "أطباء عامون",
      ckb: "پزیشتی گشتی",
      kmr: "Bijîşkên giştî"
    },
    specialist: {
      en: "Medical specialists and subspecialists",
      it: "Specialisti e sottospecialisti",
      sv: "Medicinska specialister och subspecialister",
      fa: "متخصصان و فوق‌تخصصان پزشکی",
      ar: "أطباء متخصصون وتخصصات فرعية",
      ckb: "پسپۆڕ و ژێرپسپۆڕی پزیشکی",
      kmr: "Pispor û binpisporên bijîşkî"
    },
    surgeon: {
      en: "Surgeons",
      it: "Chirurghi",
      sv: "Kirurger",
      fa: "جراحان",
      ar: "جرّاحون",
      ckb: "نەشتەرگەر",
      kmr: "Cerrah"
    },
    dentist: {
      en: "Dentists and dental specialists",
      it: "Dentisti e specialisti odontoiatrici",
      sv: "Tandläkare och odontologiska specialister",
      fa: "دندان‌پزشکان و متخصصان دندان",
      ar: "أطباء أسنان واختصاصيو أسنان",
      ckb: "ددانپزیشک و پسپۆڕی ددان",
      kmr: "Bijîşkên diranan û pisporên diranan"
    },
    psychiatrist: {
      en: "Psychiatrists and licensed mental-health professionals",
      it: "Psichiatri e professionisti della salute mentale autorizzati",
      sv: "Psykiatriker och licensierade psykisk-hälsa-proffs",
      fa: "روان‌پزشکان و متخصصان مجاز سلامت روان",
      ar: "أطباء نفسيون ومتخصصو صحة نفسية مرخّصون",
      ckb: "دەروونپزیشک و پسپۆڕی دەروونی مۆڵەتدار",
      kmr: "Bijîşkên derûnî û pisporên derûnî yên pejirandî"
    },
    psychologist: {
      en: "Psychologists and psychotherapy providers",
      it: "Psicologi e fornitori di psicoterapia",
      sv: "Psykologer och psykoterapiprovider",
      fa: "روان‌شناسان و ارائه‌دهندگان روان‌درمانی",
      ar: "علماء نفس ومقدمو علاج نفسي",
      ckb: "دەروونناس و دابینکەری چارەسەری دەروونی",
      kmr: "Derûnnas û pêşkêşkarên psîkoterapî"
    },
    hospital: {
      en: "Hospitals",
      it: "Ospedali",
      sv: "Sjukhus",
      fa: "بیمارستان‌ها",
      ar: "مستشفيات",
      ckb: "نەخۆشخانەکان",
      kmr: "Nexweşxane"
    },
    clinic: {
      en: "Medical clinics",
      it: "Cliniche mediche",
      sv: "Medicinska kliniker",
      fa: "کلینیک‌های پزشکی",
      ar: "عيادات طبية",
      ckb: "کلینیکە پزیشکییەکان",
      kmr: "Klînîkên bijîşkî"
    },
    lab: {
      en: "Diagnostic laboratories",
      it: "Laboratori diagnostici",
      sv: "Diagnostiska laboratorier",
      fa: "آزمایشگاه‌های تشخیصی",
      ar: "مختبرات تشخيصية",
      ckb: "تاقیگەکانی دەستنیشانکردن",
      kmr: "Laboratuarên teşhîsê"
    },
    mri: {
      en: "MRI centers",
      it: "Centri MRI",
      sv: "MRI-center",
      fa: "مراکز MRI",
      ar: "مراكز التصوير بالرنين",
      ckb: "ناوەندەکانی MRI",
      kmr: "Navendên MRI"
    },
    ct: {
      en: "CT scan centers",
      it: "Centri TAC",
      sv: "DT-scan-center",
      fa: "مراکز سی‌تی‌اسکن",
      ar: "مراكز التصوير المقطعي",
      ckb: "ناوەندەکانی CT",
      kmr: "Navendên CT"
    },
    ultrasound: {
      en: "Ultrasound centers",
      it: "Centri di ecografia",
      sv: "Ultraljudscenter",
      fa: "مراکز سونوگرافی",
      ar: "مراكز الموجات فوق الصوتية",
      ckb: "ناوەندەکانی ئالتراساوند",
      kmr: "Navendên ultrason"
    },
    radiology: {
      en: "X-ray and radiology centers",
      it: "Centri di radiologia e raggi X",
      sv: "Röntgen- och radiologicenter",
      fa: "مراکز رادیولوژی و اشعه X",
      ar: "مراكز الأشعة والتصوير",
      ckb: "ناوەندەکانی تیشک و تیشکدەرمانی",
      kmr: "Navendên tîrêj û radyolojî"
    },
    genetics: {
      en: "Genetic testing and other diagnostic services",
      it: "Test genetici e altri servizi diagnostici",
      sv: "Gentest och annan diagnostik",
      fa: "آزمایش ژنتیک و سایر خدمات تشخیصی",
      ar: "اختبارات جينية وخدمات تشخيص أخرى",
      ckb: "تاقیکردنەوەی بۆماوەیی و خزمەتگوزاریی دیکە",
      kmr: "Testên genetîk û xizmetên teşhîsê yên din"
    },
    physio: {
      en: "Rehabilitation and physiotherapy",
      it: "Riabilitazione e fisioterapia",
      sv: "Rehabilitering och fysioterapi",
      fa: "توان‌بخشی و فیزیوتراپی",
      ar: "إعادة تأهيل وعلاج طبيعي",
      ckb: "چاکبوونەوە و فیزیۆتراپی",
      kmr: "Rehabîlîtasyon û fîzyoterapî"
    },
    addiction: {
      en: "Licensed addiction treatment and rehabilitation centers",
      it: "Centri autorizzati per dipendenze e riabilitazione",
      sv: "Licensierade beroendecenter",
      fa: "مراکز مجاز درمان اعتیاد و توان‌بخشی",
      ar: "مراكز مرخّصة لعلاج الإدمان وإعادة التأهيل",
      ckb: "ناوەندی مۆڵەتداری چارەسەری وابەستەیی",
      kmr: "Navendên pejirandî yên tedawiya girêdayîbûnê"
    },
    cosmetic: {
      en: "Cosmetic medicine",
      it: "Medicina estetica",
      sv: "Kosmetisk medicin",
      fa: "پزشکی زیبایی",
      ar: "طب تجميلي",
      ckb: "پزیشکی جوانکاری",
      kmr: "Bijîşkiya xweşikkirinê"
    },
    hair_transplant: {
      en: "Hair transplantation",
      it: "Trapianto di capelli",
      sv: "Hårtransplantation",
      fa: "کاشت مو",
      ar: "زراعة الشعر",
      ckb: "چاندنی قژ",
      kmr: "Çandinîya por"
    },
    plastic: {
      en: "Plastic and reconstructive surgery",
      it: "Chirurgia plastica e ricostruttiva",
      sv: "Plastikkirurgi och rekonstruktion",
      fa: "جراحی پلاستیک و ترمیمی",
      ar: "جراحة تجميل وترميم",
      ckb: "نەشتەرگەری پلاستیک و چاککردنەوە",
      kmr: "Cerrahîya plastîk û nûvekirinê"
    },
    fertility: {
      en: "Fertility and reproductive medicine",
      it: "Fertilità e medicina riproduttiva",
      sv: "Fertilitet och reproduktiv medicin",
      fa: "نازایی و پزشکی باروری",
      ar: "خصوبة وطب الإنجاب",
      ckb: "بەرهەمهێنان و پزیشکی زاوزێ",
      kmr: "Zayînî û bijîşkiya zêdebûnê"
    },
    rare_disease: {
      en: "Rare diseases and highly specialized treatment",
      it: "Malattie rare e cure altamente specializzate",
      sv: "Sällsynta sjukdomar och högspecialiserad vård",
      fa: "بیماری‌های نادر و درمان فوق‌تخصصی",
      ar: "أمراض نادرة وعلاج شديد التخصص",
      ckb: "نەخۆشی دەگمەن و چارەسەری تایبەت",
      kmr: "Nexweşiyên kêm û tedawiya pir taybet"
    },
    medical_travel: {
      en: "International medical travel",
      it: "Viaggi medici internazionali",
      sv: "Internationell medicinsk resa",
      fa: "سفر درمانی بین‌المللی",
      ar: "السفر الطبي الدولي",
      ckb: "گەشتی پزیشکی نێودەوڵەتی",
      kmr: "Rêwîtiya bijîşkî ya navneteweyî"
    },
    pharmacy: {
      en: "Pharmacies",
      it: "Farmacie",
      sv: "Apotek",
      fa: "داروخانه‌ها",
      ar: "صيدليات",
      ckb: "دەرمانخانەکان",
      kmr: "Dermanxane"
    },
    pharmacy_24h: {
      en: "24-hour pharmacies",
      it: "Farmacie 24 ore",
      sv: "Dygnsöppna apotek",
      fa: "داروخانه‌های شبانه‌روزی",
      ar: "صيدليات على مدار الساعة",
      ckb: "دەرمانخانەی ٢٤ کاتژمێری",
      kmr: "Dermanxaneyên 24-saetan"
    },
    herbal_pharmacy: {
      en: "Licensed herbal pharmacies",
      it: "Erboristerie autorizzate",
      sv: "Licensierade örtapotek",
      fa: "داروخانه‌های گیاهی مجاز",
      ar: "صيدليات أعشاب مرخّصة",
      ckb: "دەرمانخانەی گیایی مۆڵەتدار",
      kmr: "Dermanxaneyên giyayî yên pejirandî"
    },
    herbal_shop: {
      en: "Herbal shops and traditional medicine providers",
      it: "Negozi erboristici e medicina tradizionale",
      sv: "Örtbutiker och traditionell medicin",
      fa: "فروشگاه‌های گیاهی و طب سنتی",
      ar: "محلات أعشاب ومقدمو طب تقليدي",
      ckb: "فرۆشگای گیایی و پزیشکی نەریتی",
      kmr: "Firotgehên giyayî û bijîşkiya kevneşopî"
    },
    medicine_info: {
      en: "Evidence-based medical and herbal medicine information",
      it: "Informazioni evidence-based su farmaci ed erbe",
      sv: "Evidensbaserad medicinsk och örtinformation",
      fa: "اطلاعات مبتنی بر شواهد دارو و گیاهی",
      ar: "معلومات طبية وعشبية مبنية على الأدلة",
      ckb: "زانیاری بەڵگەدار دەربارەی دەرمان و گیایی",
      kmr: "Agahiyên bingeh-delîl yên derman û giyayî"
    }
  };

  var GROUPS = {
    doctors: { en: "Doctors", it: "Medici", sv: "Läkare", fa: "پزشکان", ar: "أطباء", ckb: "پزیشکان", kmr: "Bijîşk" },
    pharmacy: { en: "Pharmacies", it: "Farmacie", sv: "Apotek", fa: "داروخانه‌ها", ar: "صيدليات", ckb: "دەرمانخانەکان", kmr: "Dermanxane" },
    facilities: { en: "Hospitals & clinics", it: "Ospedali e cliniche", sv: "Sjukhus & kliniker", fa: "بیمارستان‌ها و کلینیک‌ها", ar: "مستشفيات وعيادات", ckb: "نەخۆشخانە و کلینیک", kmr: "Nexweşxane û klînîk" },
    diagnostics: { en: "Labs & imaging", it: "Laboratori e imaging", sv: "Lab & bilddiagnostik", fa: "آزمایشگاه و تصویربرداری", ar: "مختبرات وتصوير", ckb: "تاقیگە و وێنەگرتن", kmr: "Laboratuar û wêne" },
    care: { en: "Rehab / mental health / addiction", it: "Riabilitazione / salute mentale / dipendenze", sv: "Rehab / psykisk hälsa / beroende", fa: "توان‌بخشی / سلامت روان / اعتیاد", ar: "تأهيل / صحة نفسية / إدمان", ckb: "چاکبوونەوە / دەروونی / وابەستەیی", kmr: "Rehab / derûnî / girêdayîbûn" },
    herbal: { en: "Herbal", it: "Erboristico", sv: "Ört", fa: "گیاهی", ar: "أعشاب", ckb: "گیایی", kmr: "Giyayî" },
    travel: { en: "Medical travel", it: "Viaggi medici", sv: "Medicinsk resa", fa: "سفر درمانی", ar: "سفر طبي", ckb: "گەشتی پزیشکی", kmr: "Rêwîtiya bijîşkî" },
    information: { en: "Information", it: "Informazioni", sv: "Information", fa: "اطلاعات", ar: "معلومات", ckb: "زانیاری", kmr: "Agahî" }
  };

  var UI = {
    "health.title": {
      en: "Doctors & Pharmacies",
      it: "Medici e farmacie",
      sv: "Läkare & apotek",
      fa: "پزشکان و داروخانه‌ها",
      ar: "الأطباء والصيدليات",
      ckb: "پزیشکان و دەرمانخانەکان",
      kmr: "Bijîşk û dermanxane"
    },
    "health.subtitle": {
      en: "Global healthcare discovery. Patients use HAVKAR for free. No invented providers.",
      it: "Scoperta sanitaria globale. I pazienti usano HAVKAR gratis. Nessun fornitore inventato.",
      sv: "Global hälsoupptäckt. Patienter använder HAVKAR gratis. Inga påhittade vårdgivare.",
      fa: "کشف جهانی مراقبت سلامت. بیماران HAVKAR را رایگان استفاده می‌کنند. هیچ ارائه‌دهندهٔ ساختگی نیست.",
      ar: "اكتشاف رعاية صحية عالمي. يستخدم المرضى HAVKAR مجانًا. لا مقدمي خدمة مُختلقين.",
      ckb: "دۆزینەوەی تەندروستی جیهانی. نەخۆشەکان HAVKAR بەخۆڕایی بەکاردەهێنن. هیچ دابینکەرێکی دروستکراو نییە.",
      kmr: "Keşfa tenduristiya gerdûnî. Nexweş HAVKAR belaş bikar tînin. Tu pêşkêşkarê çêkirî tune."
    },
    "health.back": { en: "Back", it: "Indietro", sv: "Tillbaka", fa: "بازگشت", ar: "رجوع", ckb: "گەڕانەوە", kmr: "Paşve" },
    "health.platform_role_label": {
      en: "Platform role:",
      it: "Ruolo della piattaforma:",
      sv: "Plattformsroll:",
      fa: "نقش پلتفرم:",
      ar: "دور المنصة:",
      ckb: "ڕۆڵی پلاتفۆرم:",
      kmr: "Rola platformê:"
    },
    "health.platform_notice": {
      en: "HAVKAR connects patients with independent licensed professionals. HAVKAR does not provide medical treatment, diagnosis, prescriptions or emergency care. For emergencies, contact local emergency services.",
      it: "HAVKAR collega i pazienti a professionisti indipendenti autorizzati. HAVKAR non fornisce cure, diagnosi, ricette o emergenze. In emergenza contattate i servizi locali.",
      sv: "HAVKAR kopplar patienter till oberoende licensierade yrkesutövare. HAVKAR ger inte behandling, diagnos, recept eller akutvård. Vid nöd kontakta lokal räddningstjänst.",
      fa: "HAVKAR بیماران را به متخصصان دارای مجوز مستقل متصل می‌کند. خود HAVKAR درمان، تشخیص، نسخه یا اورژانس ارائه نمی‌دهد. در فوریت با خدمات اضطراری محلی تماس بگیرید.",
      ar: "يربط HAVKAR المرضى بمحترفين مرخّصين مستقلين. لا يقدّم HAVKAR علاجًا أو تشخيصًا أو وصفات أو رعاية طوارئ. للطوارئ اتصل بالخدمات المحلية.",
      ckb: "HAVKAR نەخۆش دەبەستێتەوە بە پسپۆڕی سەربەخۆی مۆڵەتدار. HAVKAR چارەسەری پزیشکی، دەستنیشانکردن، ڕەچەتە یان فریاکەوتن پێشکەش ناکات. بۆ فریاکەوتن پەیوەندی بە خزمەتگوزاری ناوخۆیی بکە.",
      kmr: "HAVKAR nexweşan bi pisporên serbixwe yên pejirandî ve girê dide. HAVKAR tedawî, teşhîs, reçete an acîlî nade. Ji bo acîlîyan bi xizmetên herêmî re têkilî daynin."
    },
    "health.search_aria": { en: "Health search", it: "Ricerca salute", sv: "Hälsosökning", fa: "جستجوی سلامت", ar: "بحث صحي", ckb: "گەڕانی تەندروستی", kmr: "Lêgerîna tenduristiyê" },
    "health.q_label": { en: "Specialty / treatment / procedure", it: "Specialità / trattamento / procedura", sv: "Specialitet / behandling / procedur", fa: "تخصص / درمان / رویه", ar: "تخصص / علاج / إجراء", ckb: "پسپۆڕی / چارەسەری / ڕێکار", kmr: "Pisporî / tedawî / prosedûr" },
    "health.q_placeholder": { en: "Cardiology, MRI, pharmacy…", it: "Cardiologia, MRI, farmacia…", sv: "Kardiologi, MRI, apotek…", fa: "قلب، MRI، داروخانه…", ar: "قلب، رنين، صيدلية…", ckb: "دڵ، MRI، دەرمانخانە…", kmr: "Kardiolojî, MRI, dermanxane…" },
    "health.lang_label": { en: "Provider language", it: "Lingua del fornitore", sv: "Vårdgivarens språk", fa: "زبان ارائه‌دهنده", ar: "لغة مقدم الخدمة", ckb: "زمانی دابینکەر", kmr: "Zimanê pêşkêşkar" },
    "health.any_language": { en: "Any language", it: "Qualsiasi lingua", sv: "Alla språk", fa: "هر زبانی", ar: "أي لغة", ckb: "هەر زمانێک", kmr: "Her ziman" },
    "health.country": { en: "Country", it: "Paese", sv: "Land", fa: "کشور", ar: "البلد", ckb: "وڵات", kmr: "Welat" },
    "health.region": { en: "Region / province", it: "Regione / provincia", sv: "Region / län", fa: "منطقه / استان", ar: "منطقة / محافظة", ckb: "هەرێم / پارێزگا", kmr: "Herêm / parêzgeh" },
    "health.city": { en: "City", it: "Città", sv: "Stad", fa: "شهر", ar: "المدينة", ckb: "شار", kmr: "Bajar" },
    "health.distance": { en: "Distance km (with GPS)", it: "Distanza km (con GPS)", sv: "Avstånd km (med GPS)", fa: "فاصله کیلومتر (با GPS)", ar: "المسافة كم (مع GPS)", ckb: "دووری کم (لەگەڵ GPS)", kmr: "Dûrahî km (bi GPS)" },
    "health.group_label": { en: "Category group", it: "Gruppo categoria", sv: "Kategorigrupp", fa: "گروه دسته", ar: "مجموعة الفئة", ckb: "گرووپی پۆل", kmr: "Koma kategoriyê" },
    "health.all_groups": { en: "All groups", it: "Tutti i gruppi", sv: "Alla grupper", fa: "همه گروه‌ها", ar: "كل المجموعات", ckb: "هەموو گرووپەکان", kmr: "Hemû kom" },
    "health.map_aria": { en: "Health providers map", it: "Mappa fornitori sanitari", sv: "Karta över vårdgivare", fa: "نقشه ارائه‌دهندگان سلامت", ar: "خريطة مقدمي الرعاية", ckb: "نەخشەی دابینکەرانی تەندروستی", kmr: "Nexşeya pêşkêşkarên tenduristiyê" },
    "health.use_location": { en: "Use my location", it: "Usa la mia posizione", sv: "Använd min plats", fa: "استفاده از موقعیت من", ar: "استخدم موقعي", ckb: "شوێنی من بەکاربهێنە", kmr: "Cihê min bikar bîne" },
    "health.verified_only": { en: "Verified only", it: "Solo verificati", sv: "Endast verifierade", fa: "فقط تأییدشده", ar: "الموثّق فقط", ckb: "تەنها پشتڕاستکراو", kmr: "Tenê pejirandî" },
    "health.insurance": { en: "Insurance listed", it: "Assicurazione indicata", sv: "Försäkring listad", fa: "بیمه ثبت‌شده", ar: "تأمين مدرج", ckb: "بیمە تۆمارکراو", kmr: "Bîme tomarkirî" },
    "health.accessibility": { en: "Accessibility notes", it: "Note di accessibilità", sv: "Tillgänglighetsanteckningar", fa: "یادداشت دسترس‌پذیری", ar: "ملاحظات إمكانية الوصول", ckb: "تێبینی دەستگەیشتن", kmr: "Nîşeyên gihîştinê" },
    "health.open_slots": { en: "Open slots", it: "Slot aperti", sv: "Öppna tider", fa: "نوبت‌های باز", ar: "مواعيد مفتوحة", ckb: "کاتی بەتاڵ", kmr: "Demên vekirî" },
    "health.all_categories": { en: "All categories", it: "Tutte le categorie", sv: "Alla kategorier", fa: "همه دسته‌ها", ar: "كل الفئات", ckb: "هەموو پۆلەکان", kmr: "Hemû kategorî" },
    "health.map_empty": {
      en: "Map stays available with an honest empty state when no verified providers are published.",
      it: "La mappa resta disponibile con uno stato vuoto onesto se non ci sono fornitori verificati.",
      sv: "Kartan finns kvar med ett ärligt tomt läge när inga verifierade vårdgivare är publicerade.",
      fa: "نقشه با حالت خالی صادقانه در دسترس می‌ماند وقتی ارائه‌دهنده تأییدشده‌ای منتشر نشده باشد.",
      ar: "تبقى الخريطة متاحة بحالة فارغة صادقة عند عدم نشر مقدمي خدمة موثّقين.",
      ckb: "نەخشە بە دۆخی بەتاڵی ڕاستگۆیانە دەمێنێتەوە کاتێک هیچ دابینکەری پشتڕاستکراو بڵاونەکراوەتەوە.",
      kmr: "Nexşe bi rewşa vala ya rast dimîne dema tu pêşkêşkarê pejirandî neyê weşandin."
    },
    "health.search": { en: "Search providers", it: "Cerca fornitori", sv: "Sök vårdgivare", fa: "جستجوی ارائه‌دهندگان", ar: "ابحث عن مقدمي الخدمة", ckb: "گەڕان بەدوای دابینکەران", kmr: "Pêşkêşkaran bigere" },
    "health.categories": { en: "Categories", it: "Categorie", sv: "Kategorier", fa: "دسته‌ها", ar: "الفئات", ckb: "پۆلەکان", kmr: "Kategorî" },
    "health.empty_title": {
      en: "No published health providers match this search.",
      it: "Nessun fornitore sanitario pubblicato corrisponde a questa ricerca.",
      sv: "Inga publicerade vårdgivare matchar den här sökningen.",
      fa: "هیچ ارائه‌دهنده سلامت منتشرشده‌ای با این جستجو مطابقت ندارد.",
      ar: "لا يوجد مقدمو رعاية منشورون يطابقون هذا البحث.",
      ckb: "هیچ دابینکەری تەندروستی بڵاوکراوە ئەم گەڕانە ناگرێتەوە.",
      kmr: "Tu pêşkêşkarê tenduristiyê yê weşandî bi vê lêgerînê re naguncîne."
    },
    "health.empty_body": {
      en: "HAVKAR never invents doctors, pharmacies, prices or availability. Licensed professionals can register for verification.",
      it: "HAVKAR non inventa mai medici, farmacie, prezzi o disponibilità. I professionisti autorizzati possono registrarsi per la verifica.",
      sv: "HAVKAR hittar aldrig på läkare, apotek, priser eller tillgänglighet. Licensierade yrkesutövare kan registrera sig för verifiering.",
      fa: "HAVKAR هرگز پزشک، داروخانه، قیمت یا موجودی را جعل نمی‌کند. متخصصان دارای مجوز می‌توانند برای تأیید ثبت‌نام کنند.",
      ar: "لا يختلق HAVKAR أطباء أو صيدليات أو أسعارًا أو توافرًا. يمكن للمحترفين المرخّصين التسجيل للتحقق.",
      ckb: "HAVKAR هەرگیز پزیشک، دەرمانخانە، نرخ یان بەردەستی دروست ناکات. پسپۆڕی مۆڵەتدار دەتوانن بۆ پشتڕاستکردنەوە تۆمار بکرێن.",
      kmr: "HAVKAR qet bijîşk, dermanxane, biha an hebûnê çênake. Pisporên pejirandî dikarin ji bo pejirandinê tomar bikin."
    },
    "health.link_register": { en: "Register as a doctor or pharmacy", it: "Registrati come medico o farmacia", sv: "Registrera dig som läkare eller apotek", fa: "ثبت‌نام به‌عنوان پزشک یا داروخانه", ar: "سجّل كطبيب أو صيدلية", ckb: "وەک پزیشک یان دەرمانخانە تۆمار بکە", kmr: "Wek bijîşk an dermanxane tomar bike" },
    "health.link_dashboard": { en: "Provider dashboard", it: "Dashboard fornitore", sv: "Vårdgivarpanel", fa: "داشبورد ارائه‌دهنده", ar: "لوحة مقدم الخدمة", ckb: "داشبۆردی دابینکەر", kmr: "Dashboarda pêşkêşkar" },
    "health.link_medicine": { en: "Medicine encyclopedia", it: "Enciclopedia dei farmaci", sv: "Läkemedelsencyklopedi", fa: "دانشنامه دارو", ar: "موسوعة الأدوية", ckb: "ئەنسیکڵۆپیدیای دەرمان", kmr: "Ansîklopediya dermanan" },
    "health.link_herbal": { en: "Herbal directory", it: "Elenco erboristico", sv: "Örtdirektorium", fa: "فهرست گیاهی", ar: "دليل الأعشاب", ckb: "لیستی گیایی", kmr: "Pêrista giyayî" },
    "health.link_travel": { en: "International medical travel", it: "Viaggi medici internazionali", sv: "Internationell medicinsk resa", fa: "سفر درمانی بین‌المللی", ar: "السفر الطبي الدولي", ckb: "گەشتی پزیشکی نێودەوڵەتی", kmr: "Rêwîtiya bijîşkî ya navneteweyî" },
    "health.link_rankings": { en: "Professional rankings", it: "Classifiche professionali", sv: "Professionella rankingar", fa: "رتبه‌بندی حرفه‌ای", ar: "تصنيفات مهنية", ckb: "پلەبەندی پیشەیی", kmr: "Rêzkirina pîşeyî" },
    "health.link_reviews": { en: "My Reviews", it: "Le mie recensioni", sv: "Mina recensioner", fa: "نظرات من", ar: "مراجعاتي", ckb: "پێداچوونەوەکانی من", kmr: "Nirxandinên min" },
    "health.home": { en: "Home", it: "Home", sv: "Hem", fa: "خانه", ar: "الرئيسية", ckb: "ماڵەوە", kmr: "Mal" },
    "health.nav_directory": { en: "Directory", it: "Elenco", sv: "Katalog", fa: "فهرست", ar: "الدليل", ckb: "لیست", kmr: "Pêrist" },
    "health.nav_medicines": { en: "Medicines", it: "Farmaci", sv: "Läkemedel", fa: "داروها", ar: "أدوية", ckb: "دەرمانەکان", kmr: "Derman" },
    "health.nav_dashboard": { en: "Dashboard", it: "Dashboard", sv: "Panel", fa: "داشبورد", ar: "لوحة التحكم", ckb: "داشبۆرد", kmr: "Dashboard" },
    "health.badge_free": { en: "No mandatory monthly fee", it: "Nessuna quota mensile obbligatoria", sv: "Ingen obligatorisk månadsavgift", fa: "بدون هزینه ماهانه اجباری", ar: "بدون رسوم شهرية إلزامية", ckb: "بێ کرێی مانانەی ناچاری", kmr: "Bê xerca mehane ya mecbûrî" },
    "health.badge_license": { en: "License verification required", it: "Verifica licenza richiesta", sv: "Licensverifiering krävs", fa: "تأیید مجوز لازم است", ar: "التحقق من الترخيص مطلوب", ckb: "پشتڕاستکردنەوەی مۆڵەت پێویستە", kmr: "Pejirandina lîsansê pêwîst e" },
    "health.badge_unlabeled": { en: "Not labeled as verified doctor/pharmacy", it: "Non etichettato come medico/farmacia verificati", sv: "Ej märkt som verifierad läkare/apotek", fa: "به‌عنوان پزشک/داروخانه تأییدشده برچسب نخورده", ar: "غير مُوسَم كطبيب/صيدلية موثّقين", ckb: "وەک پزیشک/دەرمانخانەی پشتڕاستکراو نیشانە نەکراوە", kmr: "Ne wek bijîşk/dermanxaneya pejirandî hatiye nîşankirin" },
    "health.regulated": { en: "regulated", it: "regolamentato", sv: "reglerad", fa: "تحت نظارت", ar: "منظّم", ckb: "ڕێکخراو", kmr: "rêkkirî" },
    "health.not_clinician": { en: "not a licensed clinician label", it: "non etichetta di clinico autorizzato", sv: "inte licensierad klinikermärkning", fa: "برچسب پزشک مجاز نیست", ar: "ليست تسمية طبيب مرخّص", ckb: "نیشانەی کلینیکەری مۆڵەتدار نییە", kmr: "ne nîşana bijîşkê pejirandî ye" },
    "health.provider": { en: "Provider", it: "Fornitore", sv: "Vårdgivare", fa: "ارائه‌دهنده", ar: "مقدم الخدمة", ckb: "دابینکەر", kmr: "Pêşkêşkar" },
    "health.license_verified": { en: "License status: verified for the stated jurisdiction.", it: "Stato licenza: verificata per la giurisdizione indicata.", sv: "Licensstatus: verifierad för angiven jurisdiktion.", fa: "وضعیت مجوز: برای حوزه اعلام‌شده تأیید شده است.", ar: "حالة الترخيص: موثّق للاختصاص القضائي المذكور.", ckb: "دۆخی مۆڵەت: بۆ دەسەڵاتی ناوبراو پشتڕاستکراوە.", kmr: "Rewşa lîsansê: ji bo desthilatdariya diyarkirî pejirandî ye." },
    "health.license_unverified": { en: "License status: unverified — not presented as a verified doctor/pharmacy.", it: "Stato licenza: non verificata — non presentata come medico/farmacia verificati.", sv: "Licensstatus: overifierad — visas inte som verifierad läkare/apotek.", fa: "وضعیت مجوز: تأییدنشده — به‌عنوان پزشک/داروخانه تأییدشده نمایش داده نمی‌شود.", ar: "حالة الترخيص: غير موثّق — لا يُعرض كطبيب/صيدلية موثّقين.", ckb: "دۆخی مۆڵەت: پشتڕاستنەکراو — وەک پزیشک/دەرمانخانەی پشتڕاستکراو پیشان نادرێت.", kmr: "Rewşa lîsansê: nepejirandî — wek bijîşk/dermanxaneya pejirandî nayê nîşandan." },
    "health.verified_license": { en: "Verified license", it: "Licenza verificata", sv: "Verifierad licens", fa: "مجوز تأییدشده", ar: "ترخيص موثّق", ckb: "مۆڵەتی پشتڕاستکراو", kmr: "Lîsansa pejirandî" },
    "health.unverified": { en: "Unverified", it: "Non verificato", sv: "Overifierad", fa: "تأییدنشده", ar: "غير موثّق", ckb: "پشتڕاستنەکراو", kmr: "Nepejirandî" },
    "health.directions": { en: "Directions", it: "Indicazioni", sv: "Vägbeskrivning", fa: "مسیریابی", ar: "الاتجاهات", ckb: "ڕێنیشاندان", kmr: "Rêberî" },
    "health.open_profile": { en: "Open profile", it: "Apri profilo", sv: "Öppna profil", fa: "باز کردن پروفایل", ar: "فتح الملف", ckb: "پڕۆفایل بکەرەوە", kmr: "Profîlê veke" },
    "health.verified_tag": { en: "verified", it: "verificato", sv: "verifierad", fa: "تأییدشده", ar: "موثّق", ckb: "پشتڕاستکراو", kmr: "pejirandî" },
    "health.unverified_tag": { en: "unverified", it: "non verificato", sv: "overifierad", fa: "تأییدنشده", ar: "غير موثّق", ckb: "پشتڕاستنەکراو", kmr: "nepejirandî" },
    "health.catalog_unavailable": { en: "Health catalog unavailable", it: "Catalogo sanitario non disponibile", sv: "Hälsokatalog otillgänglig", fa: "فهرست سلامت در دسترس نیست", ar: "كتالوج الصحة غير متاح", ckb: "لیستی تەندروستی بەردەست نییە", kmr: "Kataloga tenduristiyê ne berdest e" },
    "health.billing_status": {
      en: "Patients: free. Doctor/pharmacy subscription billing: {status}.",
      it: "Pazienti: gratis. Fatturazione abbonamento medico/farmacia: {status}.",
      sv: "Patienter: gratis. Prenumerationsdebitering läkare/apotek: {status}.",
      fa: "بیماران: رایگان. صورتحساب اشتراک پزشک/داروخانه: {status}.",
      ar: "المرضى: مجانًا. فوترة اشتراك الطبيب/الصيدلية: {status}.",
      ckb: "نەخۆشەکان: خۆڕایی. پسوڵەی بەشداری پزیشک/دەرمانخانە: {status}.",
      kmr: "Nexweş: belaş. Fatûrekirina abonetiya bijîşk/dermanxane: {status}."
    },
    "health.billing_off": { en: "OFF (proposed catalog only)", it: "OFF (solo catalogo proposto)", sv: "AV (endast föreslagen katalog)", fa: "خاموش (فقط کاتالوگ پیشنهادی)", ar: "إيقاف (كتالوج مقترح فقط)", ckb: "کوژاوە (تەنها لیستی پێشنیارکراو)", kmr: "GIRTÎ (tenê kataloga pêşniyarkirî)" },
    "health.billing_on": { en: "flag ON", it: "flag ON", sv: "flagga PÅ", fa: "پرچم روشن", ar: "العلم مفعّل", ckb: "ئاڵا هەڵکراوە", kmr: "alaya VEKIRÎ" },
    "health.searching": { en: "Searching published providers…", it: "Ricerca fornitori pubblicati…", sv: "Söker publicerade vårdgivare…", fa: "در حال جستجوی ارائه‌دهندگان منتشرشده…", ar: "جاري البحث عن مقدمي خدمة منشورين…", ckb: "گەڕان بۆ دابینکەری بڵاوکراو…", kmr: "Pêşkêşkarên weşandî digere…" },
    "health.search_failed": { en: "Search failed", it: "Ricerca non riuscita", sv: "Sökning misslyckades", fa: "جستجو ناموفق بود", ar: "فشل البحث", ckb: "گەڕان سەرکەوتوو نەبوو", kmr: "Lêgerîn têk çû" },
    "health.search_request_failed": { en: "Search request failed", it: "Richiesta di ricerca non riuscita", sv: "Sökförfrågan misslyckades", fa: "درخواست جستجو ناموفق بود", ar: "فشل طلب البحث", ckb: "داواکاری گەڕان سەرکەوتوو نەبوو", kmr: "Daxwaza lêgerînê têk çû" },
    "health.matches": {
      en: "Published matches: {n} · invented providers: never · live booking fees: none for patients",
      it: "Corrispondenze pubblicate: {n} · fornitori inventati: mai · costi prenotazione live: nessuno per i pazienti",
      sv: "Publicerade träffar: {n} · påhittade vårdgivare: aldrig · livebokningsavgifter: inga för patienter",
      fa: "نتایج منتشرشده: {n} · ارائه‌دهنده ساختگی: هرگز · هزینه رزرو زنده: رایگان برای بیمار",
      ar: "نتائج منشورة: {n} · مقدمو خدمة مُختلقون: أبدًا · رسوم الحجز المباشر: لا شيء للمرضى",
      ckb: "ئەنجامی بڵاوکراو: {n} · دابینکەری دروستکراو: هەرگیز · کرێی حیجزکردنی زیندوو: هیچ بۆ نەخۆش",
      kmr: "Lihevhatinên weşandî: {n} · pêşkêşkarê çêkirî: qet · xercên rezervasyona zindî: ji bo nexweşan tune"
    },
    "health.gps_ok": {
      en: "GPS permission granted. Nearby search uses your coordinates without inventing providers.",
      it: "Permesso GPS concesso. La ricerca nelle vicinanze usa le coordinate senza inventare fornitori.",
      sv: "GPS-behörighet beviljad. Närliggande sökning använder dina koordinater utan att hitta på vårdgivare.",
      fa: "مجوز GPS داده شد. جستجوی نزدیک از مختصات شما استفاده می‌کند بدون جعل ارائه‌دهنده.",
      ar: "تم منح إذن GPS. يستخدم البحث القريب إحداثياتك دون اختلاق مقدمي خدمة.",
      ckb: "مۆڵەتی GPS درا. گەڕانی نزیک کۆئۆردیناتەکانت بەکاردەهێنێت بەبێ دروستکردنی دابینکەر.",
      kmr: "Destûra GPS hate dayîn. Lêgerîna nêzîk koordînatên te bikar tîne bêyî çêkirina pêşkêşkaran."
    },
    "health.gps_denied": {
      en: "Location permission denied or unavailable. City search still works.",
      it: "Permesso posizione negato o non disponibile. La ricerca per città funziona ancora.",
      sv: "Platsbehörighet nekad eller otillgänglig. Stadssökning fungerar fortfarande.",
      fa: "مجوز موقعیت رد شد یا در دسترس نیست. جستجوی شهری همچنان کار می‌کند.",
      ar: "تم رفض إذن الموقع أو غير متاح. بحث المدينة ما زال يعمل.",
      ckb: "مۆڵەتی شوێن ڕەتکرایەوە یان بەردەست نییە. گەڕانی شار هێشتا کاردەکات.",
      kmr: "Destûra cihê hate redkirin an ne berdest e. Lêgerîna bajêr hîn dixebite."
    },
    "health.map_unavailable": {
      en: "Map unavailable in this browser. List search still works.",
      it: "Mappa non disponibile in questo browser. La ricerca elenco funziona ancora.",
      sv: "Karta otillgänglig i den här webbläsaren. Listsökning fungerar fortfarande.",
      fa: "نقشه در این مرورگر در دسترس نیست. جستجوی فهرستی همچنان کار می‌کند.",
      ar: "الخريطة غير متاحة في هذا المتصفح. بحث القائمة ما زال يعمل.",
      ckb: "نەخشە لەم وێبگەڕەدا بەردەست نییە. گەڕانی لیست هێشتا کاردەکات.",
      kmr: "Nexşe di vê gerokê de ne berdest e. Lêgerîna lîsteyê hîn dixebite."
    },
    "health.dash_title": { en: "Provider dashboard", it: "Dashboard fornitore", sv: "Vårdgivarpanel", fa: "داشبورد ارائه‌دهنده", ar: "لوحة مقدم الخدمة", ckb: "داشبۆردی دابینکەر", kmr: "Dashboarda pêşkêşkar" },
    "health.dash_sub": {
      en: "Doctors & pharmacies manage profiles, licenses, slots and appointments. Live billing OFF.",
      it: "Medici e farmacie gestiscono profili, licenze, slot e appuntamenti. Fatturazione live OFF.",
      sv: "Läkare och apotek hanterar profiler, licenser, tider och bokningar. Livedebitering AV.",
      fa: "پزشکان و داروخانه‌ها پروفایل، مجوز، نوبت و قرارها را مدیریت می‌کنند. صورتحساب زنده خاموش است.",
      ar: "يدير الأطباء والصيدليات الملفات والتراخيص والمواعيد. الفوترة المباشرة متوقفة.",
      ckb: "پزیشک و دەرمانخانە پڕۆفایل، مۆڵەت، کات و حیجز دەبەڕێوەدەبەن. پسوڵەی زیندوو کوژاوەتەوە.",
      kmr: "Bijîşk û dermanxane profîl, lîsans, dem û randevûyan rêve dibin. Fatûrekirina zindî GIRTÎ ye."
    },
    "health.patients_free": {
      en: "Patients stay free. Voice/video consultations are BLOCKED until contracted telehealth infrastructure exists. Text messaging requires explicit consent.",
      it: "I pazienti restano gratis. Consulti voce/video BLOCCATI finché non esiste infrastruttura telemedicina contrattualizzata. I messaggi richiedono consenso esplicito.",
      sv: "Patienter förblir gratis. Röst/video BLOCKERAS tills avtalad telehälsoinfrastruktur finns. Text kräver uttryckligt samtycke.",
      fa: "بیماران رایگان می‌مانند. مشاوره صوتی/تصویری تا زیرساخت تله‌مدیسین قراردادی مسدود است. پیام متنی نیاز به رضایت صریح دارد.",
      ar: "يبقى المرضى مجانًا. الاستشارات الصوتية/المرئية محظورة حتى تتوفر بنية تحتية للطب عن بُعد بعقد. الرسائل تتطلب موافقة صريحة.",
      ckb: "نەخۆشەکان خۆڕایی دەمێننەوە. ڕاوێژکاری دەنگ/ڤیدیۆ بلۆککراوە تا ژێرخانی تەله‌ته‌ندروستی گرێبەستکراو هەبێت. نامە پێویستی بە ڕەزامەندی ڕوون هەیە.",
      kmr: "Nexweş belaş dimînin. Şêwirdariyên deng/vîdyoyê BLOCKED in heta binesaziya tele-tenduristiyê ya peymanî hebe. Peyamên nivîskî razîbûna eşkere dixwazin."
    },
    "health.checking_session": { en: "Checking session…", it: "Verifica sessione…", sv: "Kontrollerar session…", fa: "در حال بررسی نشست…", ar: "جارٍ التحقق من الجلسة…", ckb: "پشکنینی دانیشتن…", kmr: "Danişînê kontrol dike…" },
    "lang.en": { en: "English", it: "Inglese", sv: "Engelska", fa: "انگلیسی", ar: "الإنجليزية", ckb: "ئینگلیزی", kmr: "Îngilîzî" },
    "lang.fa": { en: "Persian", it: "Persiano", sv: "Persiska", fa: "فارسی", ar: "الفارسية", ckb: "فارسی", kmr: "Farsî" },
    "lang.it": { en: "Italian", it: "Italiano", sv: "Italienska", fa: "ایتالیایی", ar: "الإيطالية", ckb: "ئیتالیایی", kmr: "Îtalî" },
    "lang.sv": { en: "Swedish", it: "Svedese", sv: "Svenska", fa: "سوئدی", ar: "السويدية", ckb: "سویدی", kmr: "Swêdî" },
    "lang.ar": { en: "Arabic", it: "Arabo", sv: "Arabiska", fa: "عربی", ar: "العربية", ckb: "عەرەبی", kmr: "Erebî" },
    "lang.ckb": { en: "Sorani Kurdish", it: "Curdo Sorani", sv: "Sorani kurdiska", fa: "کردی سورانی", ar: "الكردية السورانية", ckb: "کوردیی سۆرانی", kmr: "Kurdîya Soranî" },
    "lang.kmr": { en: "Kurmanji Kurdish", it: "Curdo Kurmanji", sv: "Kurmanji kurdiska", fa: "کردی کرمانجی", ar: "الكردية الكرمانجية", ckb: "کوردیی کورمانجی", kmr: "Kurdîya Kurmancî" }
  };

  function lang() {
    try {
      var code = String(
        localStorage.getItem("havkar_language") ||
          localStorage.getItem("selectedLanguage") ||
          localStorage.getItem("language") ||
          "en"
      )
        .trim()
        .toLowerCase();
      if (code === "ku") return "kmr";
      if (code === "ckb-iq" || code === "ckb_iq") return "ckb";
      return code || "en";
    } catch (_e) {
      return "en";
    }
  }

  function pick(map, code) {
    if (!map) return "";
    return map[code] || map.en || "";
  }

  function t(key, vars) {
    var code = lang();
    var entry = UI[key];
    var text = entry ? pick(entry, code) : key;
    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach(function (k) {
        text = text.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return text;
  }

  function categoryLabel(id, fallback) {
    var code = lang();
    var entry = CATEGORIES[id];
    if (entry) return pick(entry, code);
    return fallback || id || "";
  }

  function groupLabel(id, fallback) {
    var code = lang();
    var entry = GROUPS[id];
    if (entry) return pick(entry, code);
    return fallback || id || "";
  }

  function applyDir() {
    var code = lang();
    var dir = RTL[code] ? "rtl" : "ltr";
    try {
      document.documentElement.lang = code === "kmr" ? "ku" : code;
      document.documentElement.dir = dir;
      document.documentElement.setAttribute("dir", dir);
      localStorage.setItem("havkar_language_dir", dir);
    } catch (_e) {}
  }

  function apply(root) {
    applyDir();
    var scope = root && root.nodeType === 1 ? root : document.body;
    if (!scope) return;
    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (!key) return;
      var translated = t(key);
      if (translated && translated !== key) el.textContent = translated;
    });
    scope.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-html");
      if (!key) return;
      var translated = t(key);
      if (translated && translated !== key) el.innerHTML = translated;
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (!key) return;
      var translated = t(key);
      if (translated && translated !== key) el.setAttribute("placeholder", translated);
    });
    scope.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria");
      if (!key) return;
      var translated = t(key);
      if (translated && translated !== key) el.setAttribute("aria-label", translated);
    });
    var titleEl = document.querySelector("title");
    if (titleEl && document.body && document.body.getAttribute("data-health-page") === "directory") {
      titleEl.textContent = "HAVKAR | " + t("health.title");
    }
  }

  root.HAVKAR_HEALTH_I18N = {
    t: t,
    lang: lang,
    apply: apply,
    applyDir: applyDir,
    categoryLabel: categoryLabel,
    groupLabel: groupLabel,
    categories: CATEGORIES,
    groups: GROUPS,
    ui: UI,
    rtl: RTL
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      apply(document.body);
    });
  } else {
    apply(document.body);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
