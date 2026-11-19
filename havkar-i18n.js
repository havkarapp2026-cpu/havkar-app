/**
 * HAVKAR Global i18n
 * =========================================================
 * Central language registry + shared translation engine.
 *
 * Storage:
 *   havkar_language
 *   havkar_language_dir
 *
 * Translation provider:
 *   /api/translate
 *
 * Google credentials remain server-side.
 * =========================================================
 */

(() => {
    "use strict";

    const STORAGE_KEY = "havkar_language";
    const STORAGE_DIR_KEY = "havkar_language_dir";
    const API_URL = "/api/translate";

    /*
     * HAVKAR CENTRAL LANGUAGE REGISTRY
     *
     * IMPORTANT:
     * Language names are self-names.
     * They must NOT be translated with the interface.
     *
     * Kurdî is one top-level option.
     * It contains:
     *   Sorani   = ckb / RTL
     *   Kurmanji = kmr / LTR
     */
    const LANGUAGE_REGISTRY = Object.freeze([
        Object.freeze({
            code: "en",
            name: "English",
            dir: "ltr"
        }),

        Object.freeze({
            code: "it",
            name: "Italiano",
            dir: "ltr"
        }),

        Object.freeze({
            code: "de",
            name: "Deutsch",
            dir: "ltr"
        }),

        Object.freeze({
            code: "fr",
            name: "Français",
            dir: "ltr"
        }),

        Object.freeze({
            code: "es",
            name: "Español",
            dir: "ltr"
        }),

        Object.freeze({
            code: "pt",
            name: "Português",
            dir: "ltr"
        }),

        Object.freeze({
            code: "nl",
            name: "Nederlands",
            dir: "ltr"
        }),

        Object.freeze({
            code: "sv",
            name: "Svenska",
            dir: "ltr"
        }),

        Object.freeze({
            code: "pl",
            name: "Polski",
            dir: "ltr"
        }),

        Object.freeze({
            code: "id",
            name: "Bahasa Indonesia",
            dir: "ltr"
        }),

        Object.freeze({
            code: "zh",
            name: "中文",
            dir: "ltr"
        }),

        Object.freeze({
            code: "ja",
            name: "日本語",
            dir: "ltr"
        }),

        Object.freeze({
            code: "ko",
            name: "한국어",
            dir: "ltr"
        }),

        Object.freeze({
            code: "hi",
            name: "हिन्दी",
            dir: "ltr"
        }),

        Object.freeze({
            code: "ru",
            name: "Русский",
            dir: "ltr"
        }),

        Object.freeze({
            code: "ku",
            name: "Kurdî",
            dir: "ltr",
            selectable: false,

            variants: Object.freeze([
                Object.freeze({
                    code: "ckb",
                    name: "کوردی — سۆرانی",
                    dir: "rtl",
                    parent: "ku"
                }),

                Object.freeze({
                    code: "kmr",
                    name: "Kurdî — Kurmancî",
                    dir: "ltr",
                    parent: "ku"
                })
            ])
        }),

        Object.freeze({
            code: "tr",
            name: "Türkçe",
            dir: "ltr"
        }),

        Object.freeze({
            code: "ar",
            name: "العربية",
            dir: "rtl"
        }),

        Object.freeze({
            code: "fa",
            name: "فارسی",
            dir: "rtl"
        }),

        Object.freeze({
            code: "ur",
            name: "اردو",
            dir: "rtl"
        })
    ]);


    /* =====================================================
       SELECTABLE LANGUAGES
    ===================================================== */

    const SELECTABLE_LANGUAGES = Object.freeze(
        LANGUAGE_REGISTRY.flatMap(language => {

            if (
                Array.isArray(
                    language.variants
                )
            ) {
                return language.variants;
            }

            if (
                language.selectable === false
            ) {
                return [];
            }

            return [language];
        })
    );


    /* =====================================================
       LANGUAGE LOOKUP
    ===================================================== */

    const LANGUAGE_BY_CODE =
        new Map();

    LANGUAGE_REGISTRY.forEach(
        language => {

            LANGUAGE_BY_CODE.set(
                language.code,
                language
            );

            if (
                Array.isArray(
                    language.variants
                )
            ) {
                language.variants.forEach(
                    variant => {

                        LANGUAGE_BY_CODE.set(
                            variant.code,
                            variant
                        );
                    }
                );
            }
        }
    );


    const RTL_LANGUAGES =
        new Set([
            "fa",
            "ar",
            "ur",
            "ckb"
        ]);


    /* =====================================================
       DOM CONFIGURATION
    ===================================================== */

    const EXCLUDED_TAGS =
        new Set([
            "SCRIPT",
            "STYLE",
            "NOSCRIPT",
            "CODE",
            "PRE",
            "SVG",
            "PATH",
            "IFRAME",
            "CANVAS"
        ]);


    const TRANSLATABLE_ATTRIBUTES = [
        "placeholder",
        "title",
        "aria-label"
    ];


    const IGNORE_SELECTOR = [
        "[data-i18n-ignore]",
        "[translate='no']",
        ".notranslate"
    ].join(",");


    let translating = false;

    let observer = null;

    let observerTimer = null;


    const originalTextMap =
        new WeakMap();


    const originalAttributeMap =
        new WeakMap();


    /*
     * Session cache prevents the same
     * strings from being translated
     * repeatedly during the same session.
     */
    const sessionCache =
        new Map();


    /* =====================================================
       LANGUAGE REGISTRY API
    ===================================================== */

    function getLanguages() {

        return LANGUAGE_REGISTRY;
    }


    function getSelectableLanguages() {

        return SELECTABLE_LANGUAGES;
    }


    function getLanguageInfo(
        language
    ) {

        const code =
            String(
                language || ""
            ).trim();

        return (
            LANGUAGE_BY_CODE.get(
                code
            ) ||
            null
        );
    }


    function isSupportedLanguage(
        language
    ) {

        const info =
            getLanguageInfo(
                language
            );

        return Boolean(
            info &&
            info.selectable !== false
        );
    }


    /* =====================================================
       CURRENT LANGUAGE
    ===================================================== */

    function getLanguage() {

        const candidates = [

            localStorage.getItem(
                STORAGE_KEY
            ),

            localStorage.getItem(
                "selectedLanguage"
            ),

            localStorage.getItem(
                "language"
            )
        ];


        for (
            const candidate
            of candidates
        ) {

            const code =
                String(
                    candidate || ""
                ).trim();


            if (
                isSupportedLanguage(
                    code
                )
            ) {

                return code;
            }
        }


        return "en";
    }


    function hasSavedLanguage() {

        const keys = [
            STORAGE_KEY,
            "selectedLanguage",
            "language"
        ];


        return keys.some(
            key => {

                try {

                    return isSupportedLanguage(
                        localStorage.getItem(
                            key
                        )
                    );

                } catch (error) {

                    return false;
                }
            }
        );
    }


    function redirectForEntry() {

        const homeEntry =
            document.documentElement?.dataset?.havkarEntry ===
            "home";


        if (
            homeEntry &&
            !hasSavedLanguage()
        ) {

            window.location.replace(
                "language.html?entry=1"
            );

            return true;
        }


        const onLanguagePage =
            /(?:^|\/)language\.html$/i.test(
                window.location.pathname ||
                ""
            );

        const fromFirstEntry =
            new URLSearchParams(
                window.location.search
            ).get(
                "entry"
            ) === "1";


        if (
            onLanguagePage &&
            fromFirstEntry &&
            hasSavedLanguage()
        ) {

            window.location.replace(
                "index.html"
            );

            return true;
        }


        return false;
    }


    function getDirection(
        language = getLanguage()
    ) {

        const info =
            getLanguageInfo(
                language
            );


        if (
            info &&
            (
                info.dir === "rtl" ||
                info.dir === "ltr"
            )
        ) {

            return info.dir;
        }


        return (
            RTL_LANGUAGES.has(
                language
            )
                ? "rtl"
                : "ltr"
        );
    }


    function applyDocumentLanguage(
        language
    ) {

        const safeLanguage =
            isSupportedLanguage(
                language
            )
                ? language
                : "en";


        const dir =
            getDirection(
                safeLanguage
            );


        document.documentElement.lang =
            safeLanguage;


        document.documentElement.dir =
            dir;


        document.documentElement.setAttribute(
            "dir",
            dir
        );

        ensureBackArrowStyles();
    }


    function ensureBackArrowStyles() {

        const styleId =
            "havkar-back-arrow-direction";

        if (
            document.getElementById(
                styleId
            )
        ) {

            return;
        }


        const style =
            document.createElement(
                "style"
            );

        style.id =
            styleId;

        style.textContent =
            "html[dir=\"rtl\"] i.fa-arrow-left," +
            "html[dir=\"rtl\"] i.fa-solid.fa-arrow-left{" +
            "display:inline-block;" +
            "transform:scaleX(-1);" +
            "}" +
            "html[dir=\"ltr\"] i.fa-arrow-left," +
            "html[dir=\"ltr\"] i.fa-solid.fa-arrow-left{" +
            "transform:none;" +
            "}" +
            "html[dir=\"ltr\"] .havkar-back-glyph::before{content:\"\\2039\";}" +
            "html[dir=\"rtl\"] .havkar-back-glyph::before{content:\"\\203A\";}";

        document.head.appendChild(
            style
        );
    }


    /* =====================================================
       TEXT VALIDATION
    ===================================================== */

    function normalizeText(
        value
    ) {

        return String(
            value || ""
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim();
    }


    function hasLetters(
        value
    ) {

        try {

            return /\p{L}/u.test(
                value
            );

        } catch {

            return /[A-Za-z\u0600-\u06FF]/.test(
                value
            );
        }
    }


    function shouldTranslateText(
        value
    ) {

        const text =
            normalizeText(
                value
            );


        if (!text) {

            return false;
        }


        if (
            !hasLetters(
                text
            )
        ) {

            return false;
        }


        /*
         * Do not translate URLs.
         */
        if (
            /^https?:\/\//i.test(
                text
            ) ||
            /^www\./i.test(
                text
            )
        ) {

            return false;
        }


        /*
         * Do not translate email addresses.
         */
        if (
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                text
            )
        ) {

            return false;
        }


        return true;
    }


    /* =====================================================
       ELEMENT FILTERING
    ===================================================== */

    function isIgnoredElement(
        element
    ) {

        if (
            !element ||
            element.nodeType !== 1
        ) {

            return false;
        }


        if (
            EXCLUDED_TAGS.has(
                element.tagName
            )
        ) {

            return true;
        }


        /*
         * The transfer widget marks its own form translate="no".
         * When HAVKAR asks to translate that form, keep Sorani and
         * Kurmanji independent of the partner's English copy.
         */
        if (
            element.closest &&
            element.closest(
                "#welcomepickups[data-havkar-translate-widget='true']"
            )
        ) {

            return false;
        }


        if (
            element.matches &&
            element.matches(
                IGNORE_SELECTOR
            )
        ) {

            return true;
        }


        if (
            element.closest &&
            element.closest(
                IGNORE_SELECTOR
            )
        ) {

            return true;
        }


        return false;
    }


    function isIgnoredTextNode(
        node
    ) {

        if (
            !node ||
            node.nodeType !==
                Node.TEXT_NODE
        ) {

            return true;
        }


        const parent =
            node.parentElement;


        if (!parent) {

            return true;
        }


        return isIgnoredElement(
            parent
        );
    }


    /* =====================================================
       ORIGINAL TEXT STORAGE
    ===================================================== */

    function rememberOriginalText(
        node
    ) {

        if (
            !originalTextMap.has(
                node
            )
        ) {

            originalTextMap.set(
                node,
                node.nodeValue
            );
        }


        return originalTextMap.get(
            node
        );
    }


    function rememberOriginalAttribute(
        element,
        attribute
    ) {

        let attributes =
            originalAttributeMap.get(
                element
            );


        if (!attributes) {

            attributes = {};

            originalAttributeMap.set(
                element,
                attributes
            );
        }


        if (
            !Object.prototype
                .hasOwnProperty
                .call(
                    attributes,
                    attribute
                )
        ) {

            attributes[
                attribute
            ] =
                element.getAttribute(
                    attribute
                );
        }


        return attributes[
            attribute
        ];
    }


    /* =====================================================
       COLLECT TEXT
    ===================================================== */

    function collectTextNodes(
        root = document.body
    ) {

        const results = [];


        if (!root) {

            return results;
        }


        const walker =
            document.createTreeWalker(

                root,

                NodeFilter.SHOW_TEXT,

                {

                    acceptNode(
                        node
                    ) {

                        if (
                            isIgnoredTextNode(
                                node
                            )
                        ) {

                            return (
                                NodeFilter
                                    .FILTER_REJECT
                            );
                        }


                        const original =
                            rememberOriginalText(
                                node
                            );


                        if (
                            !shouldTranslateText(
                                original
                            )
                        ) {

                            return (
                                NodeFilter
                                    .FILTER_REJECT
                            );
                        }


                        return (
                            NodeFilter
                                .FILTER_ACCEPT
                        );
                    }
                }
            );


        let node;


        while (
            (
                node =
                    walker.nextNode()
            )
        ) {

            results.push(
                node
            );
        }


        return results;
    }


    /* =====================================================
       COLLECT ATTRIBUTES
    ===================================================== */

    function collectAttributes(
        root = document.body
    ) {

        const results = [];


        if (!root) {

            return results;
        }


        const elements = [];


        if (
            root.nodeType === 1 &&
            !isIgnoredElement(
                root
            )
        ) {

            elements.push(
                root
            );
        }


        if (
            root.querySelectorAll
        ) {

            root
                .querySelectorAll(
                    "*"
                )
                .forEach(
                    element => {

                        if (
                            !isIgnoredElement(
                                element
                            )
                        ) {

                            elements.push(
                                element
                            );
                        }
                    }
                );
        }


        elements.forEach(
            element => {

                TRANSLATABLE_ATTRIBUTES
                    .forEach(
                        attribute => {

                            if (
                                !element
                                    .hasAttribute(
                                        attribute
                                    )
                            ) {

                                return;
                            }


                            const original =
                                rememberOriginalAttribute(
                                    element,
                                    attribute
                                );


                            if (
                                !shouldTranslateText(
                                    original
                                )
                            ) {

                                return;
                            }


                            results.push({
                                element,
                                attribute,
                                original
                            });
                        }
                    );
            }
        );


        return results;
    }


    /* =====================================================
       CACHE
    ===================================================== */

    function cacheKey(
        text,
        targetLanguage
    ) {

        return (
            `${targetLanguage}::${text}`
        );
    }


    function getCached(
        text,
        targetLanguage
    ) {

        return sessionCache.get(
            cacheKey(
                text,
                targetLanguage
            )
        );
    }


    function setCached(
        text,
        targetLanguage,
        translation
    ) {

        sessionCache.set(

            cacheKey(
                text,
                targetLanguage
            ),

            translation
        );
    }


    /*
     * Homepage labels for Italian and German are fixed here.
     * The live page stayed in English when the translation
     * request had not returned, and "Services" was being
     * translated as "Fibre". These strings are applied
     * before that request and are not sent to it.
     */
    const HOMEPAGE_GLOSSARY = Object.freeze({
        it: Object.freeze({
            "Connect • Trade • Work • Help": "Connetti • Scambia • Lavora • Aiuta",
            "Buy & Sell": "Compra e vendi",
            "Jobs": "Lavori",
            "Services": "Servizi",
            "Wallet": "Portafoglio",
            "Tickets": "Biglietti",
            "Accommodation": "Alloggi",
            "Ads": "Annunci",
            "Delivery": "Consegne",
            "Events": "Eventi",
            "Chat": "Chat",
            "Languages": "Lingue",
            "Reviews": "Recensioni",
            "Doctors & Pharmacies": "Medici e farmacie",
            "Support": "Supporto",
            "HAVKAR AI": "HAVKAR AI",
            "About HAVKAR": "Informazioni su HAVKAR",
            "Create New Account": "Crea un nuovo account",
            "Already have an account?": "Hai già un account?",
            "Log In": "Accedi",
            "Safe • Secure • Trusted": "Sicuro • Protetto • Affidabile"
        }),
        de: Object.freeze({
            "Connect • Trade • Work • Help": "Verbinden • Handeln • Arbeiten • Helfen",
            "Buy & Sell": "Kaufen & Verkaufen",
            "Jobs": "Jobs",
            "Services": "Dienste",
            "Wallet": "Geldbörse",
            "Tickets": "Tickets",
            "Accommodation": "Unterkunft",
            "Ads": "Anzeigen",
            "Delivery": "Lieferung",
            "Events": "Veranstaltungen",
            "Chat": "Chat",
            "Languages": "Sprachen",
            "Reviews": "Bewertungen",
            "Doctors & Pharmacies": "Ärzte & Apotheken",
            "Support": "Support",
            "HAVKAR AI": "HAVKAR AI",
            "About HAVKAR": "Über HAVKAR",
            "Create New Account": "Neues Konto erstellen",
            "Already have an account?": "Schon ein Konto?",
            "Log In": "Anmelden",
            "Safe • Secure • Trusted": "Sicher • Geschützt • Vertrauenswürdig"
        }),
        fa: Object.freeze({
            "Signed in": "وارد شده‌اید",
            "Connect • Trade • Work • Help": "ارتباط • تجارت • کار • کمک",
            "Buy & Sell": "خرید و فروش",
            "Jobs": "مشاغل",
            "Services": "خدمات",
            "Wallet": "کیف پول",
            "Tickets": "بلیط",
            "Accommodation": "اقامت",
            "Ads": "آگهی‌ها",
            "Delivery": "ارسال",
            "Events": "رویدادها",
            "Chat": "گفتگو",
            "Languages": "زبان‌ها",
            "Reviews": "نظرات",
            "Doctors & Pharmacies": "پزشکان و داروخانه‌ها",
            "Support": "پشتیبانی",
            "HAVKAR AI": "HAVKAR AI",
            "About HAVKAR": "درباره HAVKAR",
            "Create New Account": "ایجاد حساب جدید",
            "Already have an account?": "حساب دارید؟",
            "Log In": "ورود",
            "Safe • Secure • Trusted": "ایمن • مطمئن • قابل اعتماد"
        }),
        ar: Object.freeze({
            "Connect • Trade • Work • Help": "تواصل • تجارة • عمل • مساعدة",
            "Buy & Sell": "بيع وشراء",
            "Jobs": "وظائف",
            "Services": "خدمات",
            "Wallet": "المحفظة",
            "Tickets": "التذاكر",
            "Accommodation": "الإقامة",
            "Ads": "الإعلانات",
            "Delivery": "التوصيل",
            "Events": "الفعاليات",
            "Chat": "الدردشة",
            "Languages": "اللغات",
            "Reviews": "المراجعات",
            "Doctors & Pharmacies": "الأطباء والصيدليات",
            "Support": "الدعم",
            "HAVKAR AI": "HAVKAR AI",
            "About HAVKAR": "حول HAVKAR",
            "Create New Account": "إنشاء حساب جديد",
            "Already have an account?": "هل لديك حساب؟",
            "Log In": "تسجيل الدخول",
            "Safe • Secure • Trusted": "آمن • محمي • موثوق"
        }),
        ckb: Object.freeze({
            "Connect • Trade • Work • Help": "پەیوەندی • بازرگانی • کار • یارمەتی",
            "Buy & Sell": "کڕین و فرۆشتن",
            "Jobs": "کارەکان",
            "Services": "خزمەتگوزارییەکان",
            "Wallet": "جزدان",
            "Tickets": "بلیت",
            "Accommodation": "نیشتەجێبوون",
            "Ads": "ڕیکلامەکان",
            "Delivery": "گەیاندن",
            "Events": "بۆنەکان",
            "Chat": "گفتوگۆ",
            "Languages": "زمانەکان",
            "Reviews": "پێداچوونەوەکان",
            "Doctors & Pharmacies": "پزیشکان و دەرمانخانەکان",
            "Support": "پشتگیری",
            "HAVKAR AI": "HAVKAR AI",
            "About HAVKAR": "دەربارەی HAVKAR",
            "Create New Account": "دروستکردنی هەژماری نوێ",
            "Already have an account?": "هەژمارت هەیە؟",
            "Log In": "چوونەژوورەوە",
            "Safe • Secure • Trusted": "پارێزراو • دڵنیا • متمانەپێکراو"
        }),
        kmr: Object.freeze({
            "Connect • Trade • Work • Help": "Girêdan • Bazirganî • Kar • Alîkarî",
            "Buy & Sell": "Kirîn û Firotin",
            "Jobs": "Kar",
            "Services": "Xizmet",
            "Wallet": "Cûzdan",
            "Tickets": "Bilêt",
            "Accommodation": "Cîwar",
            "Ads": "Reklam",
            "Delivery": "Radestkirin",
            "Events": "Bûyer",
            "Chat": "Chat",
            "Languages": "Ziman",
            "Reviews": "Nirxandin",
            "Doctors & Pharmacies": "Bijîşk û dermanxane",
            "Support": "Piştgirî",
            "HAVKAR AI": "HAVKAR AI",
            "About HAVKAR": "Der barê HAVKAR",
            "Create New Account": "Hesabekî nû çêke",
            "Already have an account?": "Hesabê te heye?",
            "Log In": "Têkeve",
            "Safe • Secure • Trusted": "Ewle • Parastî • Pêbawer"
        }),
        sv: Object.freeze({
            "Connect • Trade • Work • Help": "Anslut • Handla • Arbeta • Hjälp",
            "Buy & Sell": "Köp & sälj",
            "Jobs": "Jobb",
            "Services": "Tjänster",
            "Wallet": "Plånbok",
            "Tickets": "Biljetter",
            "Accommodation": "Boende",
            "Ads": "Annonser",
            "Delivery": "Leverans",
            "Events": "Evenemang",
            "Chat": "Chatt",
            "Languages": "Språk",
            "Reviews": "Recensioner",
            "Doctors & Pharmacies": "Läkare & apotek",
            "Support": "Support",
            "HAVKAR AI": "HAVKAR AI",
            "About HAVKAR": "Om HAVKAR",
            "Create New Account": "Skapa nytt konto",
            "Already have an account?": "Har du redan ett konto?",
            "Log In": "Logga in",
            "Safe • Secure • Trusted": "Säker • Trygg • Pålitlig"
        })
    });


    const MARKETPLACE_GLOSSARY = Object.freeze({
        fa: Object.freeze({
            "Buy & Sell": "خرید و فروش",
            "Search products, services...": "جستجوی کالا و خدمات...",
            "All countries": "همه کشورها",
            "All cities": "همه شهرها",
            "Min price": "حداقل قیمت",
            "Max price": "حداکثر قیمت",
            "Latest listings": "تازه‌ترین آگهی‌ها",
            "Search results": "نتایج جستجو",
            "Saved listings": "آگهی‌های ذخیره‌شده",
            "Home": "خانه",
            "Search": "جستجو",
            "Saved": "ذخیره‌شده",
            "Messages": "پیام‌ها",
            "Profile": "پروفایل",
            "Loading...": "در حال بارگذاری...",
            "All": "همه",
            "Electronics": "الکترونیک",
            "Mobile Phones": "موبایل",
            "Phones & Tablets": "تلفن و تبلت",
            "Computers": "رایانه",
            "Furniture": "مبلمان",
            "Clothing": "پوشاک",
            "Beauty & Personal Care": "زیبایی و مراقبت شخصی",
            "Fees & marketplace rules": "کارمزد و قوانین بازار",
            "Filters & categories": "فیلترها و دسته‌بندی‌ها",
            "Could not load listings": "بارگذاری آگهی‌ها ممکن نشد",
            "HAVKAR could not load the listings.": "هاوکار نتوانست آگهی‌ها را بارگذاری کند.",
            "Try again": "تلاش دوباره",
            "No listings found": "آگهی‌ای پیدا نشد",
            "There are no listings matching your search or category.": "آگهی‌ای مطابق جستجو یا دسته شما نیست.",
            "Load more listings": "آگهی‌های بیشتر",
            "Post a new ad": "ثبت آگهی جدید",
            "Go back": "بازگشت",
            "Notifications": "اعلان‌ها",
            "Clear search": "پاک کردن جستجو",
            "Filter by country": "فیلتر بر اساس کشور",
            "Filter by city": "فیلتر بر اساس شهر",
            "Minimum price": "حداقل قیمت",
            "Maximum price": "حداکثر قیمت",
            "Listing categories": "دسته‌بندی آگهی‌ها",
            "Buy and Sell navigation": "ناوبری خرید و فروش",
            "Signed in": "وارد شده‌اید",
            "Country": "کشور",
            "City": "شهر",
            "Publishing a listing is free. At checkout the buyer fee is 2% and the seller fee is 3%": "ثبت آگهی رایگان است. هنگام پرداخت، کارمزد خریدار ۲٪ و کارمزد فروشنده ۳٪ است",
            "(verified by havkar-marketplace.js / listing checkout). Taxes, shipping and processor fees are separate when applicable.": "(تأییدشده در havkar-marketplace.js / تسویه آگهی). مالیات، ارسال و کارمزد پردازشگر جداگانه است.",
            "Buy & Sell stays distinct from paid Ads.": "خرید و فروش از تبلیغات پولی جداست.",
            "Help for this section": "راهنمای این بخش",
            "Listing": "آگهی",
            "Listing unavailable": "آگهی در دسترس نیست",
            "This listing could not be loaded.": "بارگذاری این آگهی ممکن نشد.",
            "Try again": "تلاش دوباره",
            "Back to Buy & Sell": "بازگشت به خرید و فروش",
            "Message Seller": "پیام به فروشنده",
            "Save": "ذخیره",
            "Share": "اشتراک‌گذاری",
            "Report": "گزارش",
            "Settings": "تنظیمات",
            "Loading listing...": "در حال بارگذاری آگهی...",
            "Description": "توضیحات",
            "Your listing": "آگهی شما",
            "Edit": "ویرایش",
            "Delete": "حذف",
            "BUY NOW": "خرید الآن",
            "Mute": "بی‌صدا",
            "Unmute": "با صدا",
            "Pause": "توقف",
            "Play": "پخش",
            "Open": "باز کردن",
            "Close": "بستن",
            "Video": "ویدئو",
            "Report this listing?": "گزارش این آگهی؟",
            "Submit report": "ارسال گزارش",
            "Cancel": "لغو",
        }),
        ar: Object.freeze({
            "Buy & Sell": "بيع وشراء",
            "Search products, services...": "ابحث عن منتجات وخدمات...",
            "All countries": "كل البلدان",
            "All cities": "كل المدن",
            "Min price": "أقل سعر",
            "Max price": "أعلى سعر",
            "Latest listings": "أحدث الإعلانات",
            "Search results": "نتائج البحث",
            "Saved listings": "الإعلانات المحفوظة",
            "Home": "الرئيسية",
            "Search": "بحث",
            "Saved": "المحفوظ",
            "Messages": "الرسائل",
            "Profile": "الملف",
            "Loading...": "جارٍ التحميل...",
            "All": "الكل"
        }),
        ckb: Object.freeze({
            "Buy & Sell": "کڕین و فرۆشتن",
            "Search products, services...": "گەڕان بۆ کاڵا و خزمەتگوزاری...",
            "All countries": "هەموو وڵاتەکان",
            "All cities": "هەموو شارەکان",
            "Min price": "کەمترین نرخ",
            "Max price": "زۆرترین نرخ",
            "Latest listings": "نوێترین ئاگاهییەکان",
            "Search results": "ئەنجامی گەڕان",
            "Saved listings": "ئاگاهییە پاشەکەوتکراوەکان",
            "Home": "ماڵەوە",
            "Search": "گەڕان",
            "Saved": "پاشەکەوت",
            "Messages": "نامەکان",
            "Profile": "پرۆفایل",
            "Loading...": "بارکردن...",
            "All": "هەموو"
        }),
        kmr: Object.freeze({
            "Buy & Sell": "Kirîn û firotin",
            "Search products, services...": "Li berhem û xizmetan bigere...",
            "All countries": "Hemû welat",
            "All cities": "Hemû bajar",
            "Min price": "Biha herî kêm",
            "Max price": "Biha herî zêde",
            "Latest listings": "Ragihandinên nû",
            "Search results": "Encama lêgerînê",
            "Saved listings": "Ragihandinên tomarkirî",
            "Home": "Mal",
            "Search": "Lêgerîn",
            "Saved": "Tomarkirî",
            "Messages": "Peyam",
            "Profile": "Profîl",
            "Loading...": "Tê barkirin...",
            "All": "Hemû"
        }),
        it: Object.freeze({
            "Buy & Sell": "Compra e vendi",
            "Search products, services...": "Cerca prodotti, servizi...",
            "All countries": "Tutti i paesi",
            "All cities": "Tutte le città",
            "Min price": "Prezzo min",
            "Max price": "Prezzo max",
            "Latest listings": "Annunci recenti",
            "Search results": "Risultati di ricerca",
            "Saved listings": "Annunci salvati",
            "Home": "Home",
            "Search": "Cerca",
            "Saved": "Salvati",
            "Messages": "Messaggi",
            "Profile": "Profilo",
            "Loading...": "Caricamento...",
            "All": "Tutti"
        }),
        sv: Object.freeze({
            "Buy & Sell": "Köp & sälj",
            "Search products, services...": "Sök produkter, tjänster...",
            "All countries": "Alla länder",
            "All cities": "Alla städer",
            "Min price": "Lägsta pris",
            "Max price": "Högsta pris",
            "Latest listings": "Senaste annonser",
            "Search results": "Sökresultat",
            "Saved listings": "Sparade annonser",
            "Home": "Hem",
            "Search": "Sök",
            "Saved": "Sparat",
            "Messages": "Meddelanden",
            "Profile": "Profil",
            "Loading...": "Laddar...",
            "All": "Alla"
        })
    });


    const MESSAGING_GLOSSARY = Object.freeze({
        it: Object.freeze({
            "Auto Translate": "Traduzione automatica",
            "Auto Translate: Off": "Traduzione automatica: Off",
            "Auto Translate: On": "Traduzione automatica: On",
            "Block user": "Blocca utente",
            "No notifications": "Nessuna notifica"
        }),
        de: Object.freeze({
            "Auto Translate": "Automatische Übersetzung",
            "Auto Translate: Off": "Automatische Übersetzung: Aus",
            "Auto Translate: On": "Automatische Übersetzung: An",
            "Block user": "Benutzer blockieren",
            "No notifications": "Keine Benachrichtigungen"
        }),
        fa: Object.freeze({
            "Auto Translate": "ترجمه خودکار",
            "Auto Translate: Off": "ترجمه خودکار: خاموش",
            "Auto Translate: On": "ترجمه خودکار: روشن",
            "Block user": "مسدود کردن کاربر",
            "No notifications": "اعلانی نیست"
        }),
        ar: Object.freeze({
            "Auto Translate": "ترجمة تلقائية",
            "Auto Translate: Off": "ترجمة تلقائية: إيقاف",
            "Auto Translate: On": "ترجمة تلقائية: تشغيل",
            "Block user": "حظر المستخدم",
            "No notifications": "لا إشعارات"
        }),
        ckb: Object.freeze({
            "Auto Translate": "وەرگێڕانی خۆکار",
            "Auto Translate: Off": "وەرگێڕانی خۆکار: ناکارا",
            "Auto Translate: On": "وەرگێڕانی خۆکار: کارا",
            "Block user": "بلۆککردنی بەکارهێنەر",
            "No notifications": "ئاگادارکردنەوە نییە"
        }),
        kmr: Object.freeze({
            "Auto Translate": "Wergera otomatîk",
            "Auto Translate: Off": "Wergera otomatîk: Girtî",
            "Auto Translate: On": "Wergera otomatîk: Vekirî",
            "Block user": "Bikarhênerê asteng bike",
            "No notifications": "Agahdarî tune"
        }),
        sv: Object.freeze({
            "Auto Translate": "Automatisk översättning",
            "Auto Translate: Off": "Automatisk översättning: Av",
            "Auto Translate: On": "Automatisk översättning: På",
            "Block user": "Blockera användare",
            "No notifications": "Inga aviseringar"
        })
    });


    function ui21Pack(language) {
        try {
            if (
                typeof globalThis !== "undefined" &&
                globalThis.HAVKAR_UI_I18N21 &&
                typeof globalThis.HAVKAR_UI_I18N21.pack === "function"
            ) {
                return globalThis.HAVKAR_UI_I18N21.pack(language) || {};
            }
        } catch (_error) {
            /* ignore */
        }
        return {};
    }

    function homepageGlossary(
        language
    ) {
        const base = HOMEPAGE_GLOSSARY[language] || {};
        const pack21 = ui21Pack(language);
        const merged = Object.assign({}, pack21, base);
        return Object.keys(merged).length ? merged : null;
    }


    function marketplaceGlossary(
        language
    ) {
        const base = MARKETPLACE_GLOSSARY[language] || {};
        const pack21 = ui21Pack(language);
        const merged = Object.assign({}, pack21, base);
        return Object.keys(merged).length ? merged : null;
    }


    function messagingGlossary(
        language
    ) {
        const base = MESSAGING_GLOSSARY[language] || {};
        const pack21 = ui21Pack(language);
        const merged = Object.assign({}, pack21, base);
        return Object.keys(merged).length ? merged : null;
    }


    function applyHomepageGlossary(
        root
    ) {

        const language =
            getLanguage();

        const pack =
            Object.assign(
                {},
                homepageGlossary(
                    language
                ) || {},
                marketplaceGlossary(
                    language
                ) || {},
                messagingGlossary(
                    language
                ) || {}
            );


        if (
            !Object.keys(
                pack
            ).length ||
            !root ||
            typeof document === "undefined"
        ) {

            return;
        }


        const walker =
            document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function (node) {

                        return isIgnoredTextNode(node)
                            ? NodeFilter.FILTER_REJECT
                            : NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

        const nodes = [];

        while (walker.nextNode()) {
            nodes.push(walker.currentNode);
        }


        nodes.forEach(function (node) {

            const original =
                rememberOriginalText(node);

            const normalized =
                normalizeText(original);

            if (
                !Object.prototype.hasOwnProperty.call(
                    pack,
                    normalized
                )
            ) {

                return;
            }


            const translation =
                pack[normalized];

            setCached(
                normalized,
                getLanguage(),
                translation
            );

            const current =
                node.nodeValue || "";

            const leading =
                current.match(/^\s*/)?.[0] || "";

            const trailing =
                current.match(/\s*$/)?.[0] || "";

            node.nodeValue =
                leading +
                translation +
                trailing;
        });


        root
            .querySelectorAll(
                "[placeholder], [aria-label]"
            )
            .forEach(
                function (element) {

                    [
                        "placeholder",
                        "aria-label"
                    ]
                        .forEach(
                            function (attributeName) {

                                if (
                                    !element.hasAttribute(
                                        attributeName
                                    )
                                ) {

                                    return;
                                }


                                const value =
                                    normalizeText(
                                        element.getAttribute(
                                            attributeName
                                        )
                                    );

                                if (
                                    !Object.prototype.hasOwnProperty.call(
                                        pack,
                                        value
                                    )
                                ) {

                                    return;
                                }


                                element.setAttribute(
                                    attributeName,
                                    pack[value]
                                );
                            }
                        );
                }
            );
    }


    /* =====================================================
       TRANSLATION API
    ===================================================== */

    async function requestTranslations(
        texts,
        targetLanguage
    ) {

        if (
            !texts.length
        ) {

            return [];
        }


        if (
            !isSupportedLanguage(
                targetLanguage
            )
        ) {

            throw new Error(
                `Unsupported HAVKAR language: ${targetLanguage}`
            );
        }


        const response =
            await fetch(
                API_URL,
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            texts,
                            sourceLanguage:
                                "en",
                            targetLanguage
                        })
                }
            );


        const data =
            await response
                .json()
                .catch(
                    () => ({})
                );


        if (
            !response.ok ||
            !data.ok ||
            !Array.isArray(
                data.translations
            )
        ) {

            throw new Error(
                data.error ||
                "HAVKAR translation failed."
            );
        }


        if (
            data.translations.length !==
            texts.length
        ) {

            throw new Error(
                "Incomplete translation response."
            );
        }


        return (
            data.translations.map(
                item => {

                    if (
                        item &&
                        typeof (
                            item.translatedText
                        ) === "string"
                    ) {

                        return (
                            item.translatedText
                        );
                    }


                    return "";
                }
            )
        );
    }


    /* =====================================================
       TRANSLATE UNIQUE STRINGS
    ===================================================== */

    async function translateUniqueTexts(
        texts,
        targetLanguage
    ) {

        const uniqueTexts =
            [
                ...new Set(

                    texts
                        .map(
                            normalizeText
                        )
                        .filter(
                            Boolean
                        )
                )
            ];


        const resultMap =
            new Map();


        const missing = [];


        uniqueTexts.forEach(
            text => {

                const glossary = Object.assign(
                    {},
                    homepageGlossary(targetLanguage) || {},
                    marketplaceGlossary(targetLanguage) || {},
                    messagingGlossary(targetLanguage) || {}
                );
                const uiDictionary =
                    typeof window !== "undefined" &&
                    window.HAVKAR_UI_DICTIONARY &&
                    window.HAVKAR_UI_DICTIONARY[targetLanguage]
                        ? window.HAVKAR_UI_DICTIONARY[targetLanguage]
                        : null;

                if (
                    Object.prototype.hasOwnProperty.call(
                        glossary,
                        text
                    )
                ) {

                    const translation =
                        glossary[text];

                    resultMap.set(
                        text,
                        translation
                    );

                    setCached(
                        text,
                        targetLanguage,
                        translation
                    );

                    return;
                }

                if (
                    uiDictionary &&
                    Object.prototype.hasOwnProperty.call(
                        uiDictionary,
                        text
                    ) &&
                    typeof uiDictionary[text] === "string" &&
                    uiDictionary[text].trim()
                ) {
                    const translation = uiDictionary[text];
                    resultMap.set(text, translation);
                    setCached(text, targetLanguage, translation);
                    return;
                }


                const cached =
                    getCached(
                        text,
                        targetLanguage
                    );


                if (
                    typeof cached ===
                        "string"
                ) {

                    resultMap.set(
                        text,
                        cached
                    );

                } else {

                    missing.push(
                        text
                    );
                }
            }
        );


        /*
         * Translation endpoint supports
         * batches. Keep them moderate.
         */
        const BATCH_SIZE = 50;


        for (
            let start = 0;

            start <
            missing.length;

            start +=
                BATCH_SIZE
        ) {

            const batch =
                missing.slice(
                    start,
                    start +
                    BATCH_SIZE
                );


            const translations =
                await requestTranslations(
                    batch,
                    targetLanguage
                );


            batch.forEach(
                (
                    text,
                    index
                ) => {

                    const translated =
                        translations[
                            index
                        ] ||
                        text;


                    resultMap.set(
                        text,
                        translated
                    );


                    setCached(
                        text,
                        targetLanguage,
                        translated
                    );
                }
            );
        }


        return resultMap;
    }


    /* =====================================================
       RESTORE ENGLISH
    ===================================================== */

    function restoreEnglish(
        root = document.body
    ) {

        if (!root) {

            return;
        }


        const textNodes =
            collectTextNodes(
                root
            );


        textNodes.forEach(
            node => {

                const original =
                    originalTextMap.get(
                        node
                    );


                if (
                    typeof original ===
                        "string"
                ) {

                    node.nodeValue =
                        original;
                }
            }
        );


        const attributes =
            collectAttributes(
                root
            );


        attributes.forEach(
            item => {

                if (
                    typeof (
                        item.original
                    ) === "string"
                ) {

                    item.element
                        .setAttribute(
                            item.attribute,
                            item.original
                        );
                }
            }
        );
    }


    /* =====================================================
       TRANSLATE ROOT
    ===================================================== */

    async function translateRoot(
        root = document.body
    ) {

        const language =
            getLanguage();


        applyDocumentLanguage(
            language
        );


        if (!root) {

            return;
        }


        if (
            language === "en"
        ) {

            restoreEnglish(
                root
            );

            return;
        }


        applyHomepageGlossary(
            root
        );


        const textNodes =
            collectTextNodes(
                root
            );


        const attributes =
            collectAttributes(
                root
            );


        const originals = [];


        textNodes.forEach(
            node => {

                const original =
                    rememberOriginalText(
                        node
                    );


                const normalized =
                    normalizeText(
                        original
                    );


                if (
                    normalized
                ) {

                    originals.push(
                        normalized
                    );
                }
            }
        );


        attributes.forEach(
            item => {

                const normalized =
                    normalizeText(
                        item.original
                    );


                if (
                    normalized
                ) {

                    originals.push(
                        normalized
                    );
                }
            }
        );


        if (
            !originals.length
        ) {

            return;
        }


        const translations =
            await translateUniqueTexts(
                originals,
                language
            );


        textNodes.forEach(
            node => {

                const original =
                    rememberOriginalText(
                        node
                    );


                const normalized =
                    normalizeText(
                        original
                    );


                const translated =
                    translations.get(
                        normalized
                    );


                if (
                    typeof translated ===
                        "string" &&
                    translated
                ) {

                    const leading =
                        original.match(
                            /^\s*/
                        )?.[0] ||
                        "";


                    const trailing =
                        original.match(
                            /\s*$/
                        )?.[0] ||
                        "";


                    node.nodeValue =
                        leading +
                        translated +
                        trailing;
                }
            }
        );


        attributes.forEach(
            item => {

                const normalized =
                    normalizeText(
                        item.original
                    );


                const translated =
                    translations.get(
                        normalized
                    );


                if (
                    typeof translated ===
                        "string" &&
                    translated
                ) {

                    item.element
                        .setAttribute(
                            item.attribute,
                            translated
                        );
                }
            }
        );
    }


    /* =====================================================
       PAGE TRANSLATION
    ===================================================== */

    async function translatePage() {

        if (
            translating
        ) {

            return;
        }


        translating = true;


        try {

            await translateRoot(
                document.body
            );

        } catch (
            error
        ) {

            console.error(
                "[HAVKAR i18n]",
                error
            );

        } finally {

            translating = false;
        }
    }


    /* =====================================================
       DYNAMIC CONTENT
    ===================================================== */

    function scheduleDynamicTranslation() {

        if (
            observerTimer
        ) {

            clearTimeout(
                observerTimer
            );
        }


        observerTimer =
            setTimeout(

                async () => {

                    if (
                        translating
                    ) {

                        return;
                    }


                    await translatePage();
                },

                250
            );
    }


    function startObserver() {

        if (
            observer ||
            !document.body
        ) {

            return;
        }


        observer =
            new MutationObserver(

                mutations => {

                    if (
                        translating
                    ) {

                        return;
                    }


                    let relevant =
                        false;


                    for (
                        const mutation
                        of mutations
                    ) {

                        if (
                            mutation.type ===
                                "childList" &&
                            mutation
                                .addedNodes
                                .length
                        ) {

                            relevant =
                                true;

                            break;
                        }


                        if (
                            mutation.type ===
                                "characterData"
                        ) {

                            relevant =
                                true;

                            break;
                        }
                    }


                    if (
                        relevant
                    ) {

                        scheduleDynamicTranslation();
                    }
                }
            );


        observer.observe(

            document.body,

            {
                childList:
                    true,

                subtree:
                    true,

                characterData:
                    true
            }
        );
    }


    /* =====================================================
       LANGUAGE CHANGE
    ===================================================== */

    async function setLanguage(
        language,
        direction
    ) {

        const requestedLanguage =
            String(
                language || ""
            ).trim();


        const safeLanguage =
            isSupportedLanguage(
                requestedLanguage
            )
                ? requestedLanguage
                : "en";


        const info =
            getLanguageInfo(
                safeLanguage
            );


        /*
         * Direction comes from the
         * central registry.
         *
         * direction remains as a parameter
         * only for compatibility with
         * existing HAVKAR pages.
         */
        const safeDirection =

            info &&
            (
                info.dir === "rtl" ||
                info.dir === "ltr"
            )

                ? info.dir

                : (
                    direction === "rtl" ||
                    direction === "ltr"

                        ? direction

                        : "ltr"
                );


        localStorage.setItem(
            STORAGE_KEY,
            safeLanguage
        );


        localStorage.setItem(
            STORAGE_DIR_KEY,
            safeDirection
        );


        /*
         * Compatibility with existing
         * HAVKAR pages.
         */
        localStorage.setItem(
            "selectedLanguage",
            safeLanguage
        );


        localStorage.setItem(
            "language",
            safeLanguage
        );


        applyDocumentLanguage(
            safeLanguage
        );


        /*
         * Notify map / module i18n listeners before reload
         * so same-document UIs can refresh immediately.
         */
        try {
            document.dispatchEvent(
                new CustomEvent(
                    "havkar:language-changed",
                    {
                        detail: {
                            language: safeLanguage,
                            direction: safeDirection
                        }
                    }
                )
            );
        } catch (_e) {}

        /*
         * Reload is intentional.
         *
         * The original English DOM is loaded
         * again and translated cleanly into
         * the newly selected language.
         */
        window.location.reload();
    }


    /* =====================================================
       INITIALIZATION
    ===================================================== */

    async function initialize() {

        const language =
            getLanguage();


        applyDocumentLanguage(
            language
        );


        applyHomepageGlossary(
            document.body
        );


        await translatePage();


        startObserver();


        document.dispatchEvent(

            new CustomEvent(

                "havkar:i18n-ready",

                {

                    detail: {

                        language,

                        direction:
                            getDirection(
                                language
                            ),

                        languageInfo:
                            getLanguageInfo(
                                language
                            )
                    }
                }
            )
        );
    }


    /* =====================================================
       PUBLIC HAVKAR API
    ===================================================== */

    window.HAVKAR_I18N = {

        getLanguages,

        getSelectableLanguages,

        getLanguageInfo,

        isSupportedLanguage,

        hasSavedLanguage,

        getLanguage,

        getDirection,

        translatePage,

        translateRoot,

        setLanguage,

        refresh:
            translatePage
    };


    /* =====================================================
       START
    ===================================================== */

    if (
        !redirectForEntry()
    ) {

        if (
            document.readyState ===
            "loading"
        ) {

            document.addEventListener(

                "DOMContentLoaded",

                initialize,

                {
                    once:
                        true
                }
            );

        } else {

            initialize();
        }
    }

})();
