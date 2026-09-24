/**
 * HAVKAR Global i18n
 * =========================================================
 * Shared language engine for HAVKAR pages.
 *
 * Reads the language selected in language.html:
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

    const RTL_LANGUAGES = new Set([
        "fa",
        "ar",
        "ckb"
    ]);

    const EXCLUDED_TAGS = new Set([
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

    /*
     * Attributes that normally contain user-visible text.
     */
    const TRANSLATABLE_ATTRIBUTES = [
        "placeholder",
        "title",
        "aria-label"
    ];

    /*
     * Do not translate content inside these elements.
     *
     * Add:
     *   data-i18n-ignore
     *
     * to any element that must stay unchanged.
     */
    const IGNORE_SELECTOR = [
        "[data-i18n-ignore]",
        "[translate='no']",
        ".notranslate"
    ].join(",");

    let translating = false;
    let observer = null;
    let observerTimer = null;

    const originalTextMap = new WeakMap();
    const originalAttributeMap = new WeakMap();

    /*
     * Session cache prevents the same text from being sent
     * repeatedly to the translation API while navigating or
     * when dynamic content is re-rendered.
     */
    const sessionCache = new Map();


    /* =====================================================
       LANGUAGE
    ===================================================== */

    function getLanguage() {
        return (
            localStorage.getItem(STORAGE_KEY) ||
            localStorage.getItem("selectedLanguage") ||
            localStorage.getItem("language") ||
            "en"
        );
    }

    function getDirection(language = getLanguage()) {
        const saved =
            localStorage.getItem(STORAGE_DIR_KEY);

        if (saved === "rtl" || saved === "ltr") {
            return saved;
        }

        return RTL_LANGUAGES.has(language)
            ? "rtl"
            : "ltr";
    }

    function applyDocumentLanguage(language) {
        const dir = getDirection(language);

        document.documentElement.lang = language;
        document.documentElement.dir = dir;

        document.documentElement.setAttribute(
            "dir",
            dir
        );

        /*
         * Important:
         * We do NOT globally reverse flex/grid layouts.
         * Existing HAVKAR page structure remains intact.
         *
         * Direction is applied at document level only.
         */
    }


    /* =====================================================
       TEXT VALIDATION
    ===================================================== */

    function normalizeText(value) {
        return String(value || "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function hasLetters(value) {
        /*
         * Works with Latin, Persian, Arabic, Kurdish,
         * and most Unicode alphabetic scripts.
         */
        try {
            return /\p{L}/u.test(value);
        } catch {
            return /[A-Za-z\u0600-\u06FF]/.test(value);
        }
    }

    function shouldTranslateText(value) {
        const text = normalizeText(value);

        if (!text) return false;

        if (!hasLetters(text)) {
            return false;
        }

        /*
         * Avoid translating raw URLs.
         */
        if (
            /^https?:\/\//i.test(text) ||
            /^www\./i.test(text)
        ) {
            return false;
        }

        /*
         * Avoid translating email addresses.
         */
        if (
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
        ) {
            return false;
        }

        return true;
    }


    /* =====================================================
       ELEMENT FILTERING
    ===================================================== */

    function isIgnoredElement(element) {
        if (!element || element.nodeType !== 1) {
            return false;
        }

        if (EXCLUDED_TAGS.has(element.tagName)) {
            return true;
        }

        if (
            element.matches &&
            element.matches(IGNORE_SELECTOR)
        ) {
            return true;
        }

        if (
            element.closest &&
            element.closest(IGNORE_SELECTOR)
        ) {
            return true;
        }

        return false;
    }

    function isIgnoredTextNode(node) {
        if (!node || node.nodeType !== Node.TEXT_NODE) {
            return true;
        }

        const parent = node.parentElement;

        if (!parent) return true;

        return isIgnoredElement(parent);
    }


    /* =====================================================
       ORIGINAL TEXT STORAGE
    ===================================================== */

    function rememberOriginalText(node) {
        if (!originalTextMap.has(node)) {
            originalTextMap.set(
                node,
                node.nodeValue
            );
        }

        return originalTextMap.get(node);
    }

    function rememberOriginalAttribute(
        element,
        attribute
    ) {
        let attributes =
            originalAttributeMap.get(element);

        if (!attributes) {
            attributes = {};
            originalAttributeMap.set(
                element,
                attributes
            );
        }

        if (
            !Object.prototype.hasOwnProperty.call(
                attributes,
                attribute
            )
        ) {
            attributes[attribute] =
                element.getAttribute(attribute);
        }

        return attributes[attribute];
    }


    /* =====================================================
       COLLECT TEXT
    ===================================================== */

    function collectTextNodes(root = document.body) {
        const results = [];

        if (!root) return results;

        const walker =
            document.createTreeWalker(
                root,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode(node) {
                        if (isIgnoredTextNode(node)) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        const original =
                            rememberOriginalText(node);

                        if (
                            !shouldTranslateText(original)
                        ) {
                            return NodeFilter.FILTER_REJECT;
                        }

                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );

        let node;

        while ((node = walker.nextNode())) {
            results.push(node);
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

        if (!root) return results;

        const elements = [];

        if (
            root.nodeType === 1 &&
            !isIgnoredElement(root)
        ) {
            elements.push(root);
        }

        if (root.querySelectorAll) {
            root
                .querySelectorAll("*")
                .forEach(element => {
                    if (
                        !isIgnoredElement(element)
                    ) {
                        elements.push(element);
                    }
                });
        }

        elements.forEach(element => {
            TRANSLATABLE_ATTRIBUTES.forEach(
                attribute => {
                    if (
                        !element.hasAttribute(
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
        });

        return results;
    }


    /* =====================================================
       CACHE
    ===================================================== */

    function cacheKey(
        text,
        targetLanguage
    ) {
        return `${targetLanguage}::${text}`;
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
       API
    ===================================================== */

    async function requestTranslations(
        texts,
        targetLanguage
    ) {
        if (!texts.length) {
            return [];
        }

        const response =
            await fetch(API_URL, {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    texts,
                    sourceLanguage: "en",
                    targetLanguage
                })
            });

        const data =
            await response
                .json()
                .catch(() => ({}));

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

        return data.translations.map(
            item => {
                if (
                    item &&
                    typeof item.translatedText ===
                        "string"
                ) {
                    return item.translatedText;
                }

                return "";
            }
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
            [...new Set(
                texts
                    .map(normalizeText)
                    .filter(Boolean)
            )];

        const resultMap = new Map();

        const missing = [];

        uniqueTexts.forEach(text => {
            const cached =
                getCached(
                    text,
                    targetLanguage
                );

            if (
                typeof cached === "string"
            ) {
                resultMap.set(
                    text,
                    cached
                );
            } else {
                missing.push(text);
            }
        });

        /*
         * API supports max 100 items/request.
         * Use smaller batches to keep requests stable.
         */
        const BATCH_SIZE = 50;

        for (
            let start = 0;
            start < missing.length;
            start += BATCH_SIZE
        ) {
            const batch =
                missing.slice(
                    start,
                    start + BATCH_SIZE
                );

            const translations =
                await requestTranslations(
                    batch,
                    targetLanguage
                );

            batch.forEach(
                (text, index) => {
                    const translated =
                        translations[index] ||
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
        if (!root) return;

        const textNodes =
            collectTextNodes(root);

        textNodes.forEach(node => {
            const original =
                originalTextMap.get(node);

            if (
                typeof original === "string"
            ) {
                node.nodeValue =
                    original;
            }
        });

        const attributes =
            collectAttributes(root);

        attributes.forEach(item => {
            if (
                typeof item.original ===
                    "string"
            ) {
                item.element.setAttribute(
                    item.attribute,
                    item.original
                );
            }
        });
    }


    /* =====================================================
       TRANSLATE ROOT
    ===================================================== */

    async function translateRoot(
        root = document.body
    ) {
        const language =
            getLanguage();

        applyDocumentLanguage(language);

        if (!root) return;

        if (language === "en") {
            restoreEnglish(root);
            return;
        }

        const textNodes =
            collectTextNodes(root);

        const attributes =
            collectAttributes(root);

        const originals = [];

        textNodes.forEach(node => {
            const original =
                rememberOriginalText(node);

            const normalized =
                normalizeText(original);

            if (normalized) {
                originals.push(
                    normalized
                );
            }
        });

        attributes.forEach(item => {
            const normalized =
                normalizeText(
                    item.original
                );

            if (normalized) {
                originals.push(
                    normalized
                );
            }
        });

        if (!originals.length) {
            return;
        }

        const translations =
            await translateUniqueTexts(
                originals,
                language
            );

        textNodes.forEach(node => {
            const original =
                rememberOriginalText(node);

            const normalized =
                normalizeText(original);

            const translated =
                translations.get(
                    normalized
                );

            if (
                typeof translated ===
                    "string" &&
                translated
            ) {
                /*
                 * Preserve leading/trailing whitespace
                 * around inline text nodes.
                 */
                const leading =
                    original.match(/^\s*/)?.[0] ||
                    "";

                const trailing =
                    original.match(/\s*$/)?.[0] ||
                    "";

                node.nodeValue =
                    leading +
                    translated +
                    trailing;
            }
        });

        attributes.forEach(item => {
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
                item.element.setAttribute(
                    item.attribute,
                    translated
                );
            }
        });
    }


    /* =====================================================
       PAGE TRANSLATION
    ===================================================== */

    async function translatePage() {
        if (translating) {
            return;
        }

        translating = true;

        try {
            await translateRoot(
                document.body
            );
        } catch (error) {
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
        if (observerTimer) {
            clearTimeout(
                observerTimer
            );
        }

        observerTimer =
            setTimeout(
                async () => {
                    if (translating) {
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
                    if (translating) {
                        return;
                    }

                    let relevant = false;

                    for (
                        const mutation
                        of mutations
                    ) {
                        if (
                            mutation.type ===
                                "childList" &&
                            mutation.addedNodes.length
                        ) {
                            relevant = true;
                            break;
                        }

                        if (
                            mutation.type ===
                            "characterData"
                        ) {
                            relevant = true;
                            break;
                        }
                    }

                    if (relevant) {
                        scheduleDynamicTranslation();
                    }
                }
            );

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true,
                characterData: true
            }
        );
    }


    /* =====================================================
       LANGUAGE CHANGE SUPPORT
    ===================================================== */

    async function setLanguage(
        language,
        direction
    ) {
        const safeLanguage =
            String(
                language || "en"
            ).trim() || "en";

        const safeDirection =
            direction === "rtl" ||
            direction === "ltr"
                ? direction
                : (
                    RTL_LANGUAGES.has(
                        safeLanguage
                    )
                        ? "rtl"
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
         * Compatibility with the current
         * language.html implementation.
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
         * Reloading is intentional.
         * It restores the page's original English DOM,
         * then translates cleanly into the new language.
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
                once: true
            }
        );
    } else {
        initialize();
    }

})();
