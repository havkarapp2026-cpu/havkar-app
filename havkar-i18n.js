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

})();
