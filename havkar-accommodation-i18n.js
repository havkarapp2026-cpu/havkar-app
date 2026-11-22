(function () {
    function language() {
        try {
            return (
                (window.HAVKAR_I18N &&
                    window.HAVKAR_I18N.getLanguage &&
                    window.HAVKAR_I18N.getLanguage()) ||
                localStorage.getItem("havkar_language") ||
                "en"
            );
        } catch (_e) {
            return "en";
        }
    }

    function packFor(lang) {
        try {
            if (window.HAVKAR_UI_I18N21 && typeof window.HAVKAR_UI_I18N21.pack === "function") {
                return window.HAVKAR_UI_I18N21.pack(lang) || {};
            }
        } catch (_e) {}
        return {};
    }

    var PHRASES = {
        "Accommodation": "Alloggi",
        "Published Italian listings only. No sample stays and no prices.": "Solo annunci italiani pubblicati. Nessun soggiorno di esempio e nessun prezzo.",
        "Search published HAVKAR stays + eligible suppliers. Live booking stays Owner-gated.": "Cerca soggiorni HAVKAR pubblicati e fornitori idonei. La prenotazione live resta bloccata dal Proprietario.",
        "No verified accommodation is published.": "Nessun alloggio verificato è pubblicato.",
        "No verified accommodation is published yet": "Nessun alloggio verificato è ancora pubblicato",
        "The interactive map above still works for destination search and GPS. HAVKAR never invents hotel inventory, prices, or availability. Property owners can apply via “List a property”.": "La mappa interattiva sopra funziona comunque per destinazione e GPS. HAVKAR non inventa inventario, prezzi o disponibilità. I proprietari possono candidarsi da “Registra un immobile”.",
        "City / destination": "Città / destinazione",
        "City / destination / address": "Città / destinazione / indirizzo",
        "Category": "Categoria",
        "All types": "Tutti i tipi",
        "Hotel": "Hotel",
        "Apartment": "Appartamento",
        "Guesthouse": "Affittacamere",
        "Other": "Altro",
        "Use my location": "Usa la mia posizione",
        "Map": "Mappa",
        "List": "Elenco",
        "Map + list": "Mappa + elenco",
        "Destination map": "Mappa della destinazione",
        "Choose a destination to place the map marker.": "Scegli una destinazione per posizionare il marker sulla mappa.",
        "Map stays available even when no verified stay is published. Choose a destination or use GPS.": "La mappa resta disponibile anche senza soggiorni verificati. Scegli una destinazione o usa il GPS.",
        "Check-in": "Check-in",
        "Check-out": "Check-out",
        "Adults": "Adulti",
        "Children": "Bambini",
        "Rooms": "Camere",
        "Display / charge currency": "Valuta di visualizzazione / addebito",
        "Currency": "Valuta",
        "Search stays": "Cerca soggiorni",
        "Fee quote (no charge)": "Preventivo commissioni (senza addebito)",
        "Payment probe (no charge)": "Prova pagamento (senza addebito)",
        "Payment methods": "Metodi di pagamento",
        "Two separate rails. XLM is not a Stripe currency. Live hotel charges stay OFF.": "Due canali separati. XLM non è una valuta Stripe. Gli addebiti hotel live restano OFF.",
        "Pay by card / supported currencies": "Paga con carta / valute supportate",
        "Pay with XLM wallet": "Paga con wallet XLM",
        "Sample list price (EUR)": "Prezzo elenco di esempio (EUR)",
        "Stripe fee quote (no charge)": "Preventivo commissioni Stripe (senza addebito)",
        "XLM quote (no charge)": "Preventivo XLM (senza addebito)",
        "Not yet available": "Non ancora disponibile",
        "My booking history": "Le mie prenotazioni",
        "Owner tools": "Strumenti proprietario",
        "Currency matrix": "Matrice valute",
        "List a property": "Registra un immobile",
        "Case status": "Stato della pratica",
        "Hotel search": "Ricerca hotel",
        "Private owner tools. Listings stay unpublished until verified. Payouts require KYB + Connect eligibility.": "Strumenti privati del proprietario. Gli annunci restano non pubblicati fino alla verifica. I pagamenti richiedono KYB e idoneità Connect.",
        "Room name": "Nome camera",
        "Room category": "Categoria camera",
        "Save room": "Salva camera",
        "Checking owner payout eligibility…": "Verifica idoneità ai pagamenti del proprietario…",
        "Sign in to view payout eligibility.": "Accedi per vedere l'idoneità ai pagamenti.",
        "The operator record does not verify identity or the property.": "La scheda del titolare non verifica l'identità né l'immobile.",
        "A confirmed email is required. Identity Verified stays off until a contracted identity service is connected. Monthly plans are not priced and are not charged.": "È richiesta un'email confermata. L'identità verificata resta disattivata finché non è collegato un servizio di identità con contratto. I piani mensili non hanno un prezzo e non vengono addebitati.",
        "Legal name": "Nome legale",
        "Role": "Ruolo",
        "Owner": "Proprietario",
        "Legal representative": "Rappresentante legale",
        "Save operator": "Salva titolare",
        "Sign in before continuing.": "Accedi prima di continuare.",
        "Confirm the account email before creating an accommodation file.": "Conferma l'email dell'account prima di creare una pratica di alloggio.",
        "Enter the legal name of the owner or representative.": "Inserisci il nome legale del proprietario o del rappresentante.",
        "The application was saved. Identity verification stays off.": "La pratica è stata salvata. La verifica dell'identità resta disattivata.",
        "Property draft": "Bozza immobile",
        "Italy only. Saving a draft does not publish it.": "Solo Italia. Salvare una bozza non pubblica l'annuncio.",
        "Property name": "Nome dell'immobile",
        "Marketing type": "Tipo di struttura",
        "Apartment": "Appartamento",
        "Holiday home": "Casa vacanze",
        "Guesthouse": "Affittacamere",
        "Italian legal category": "Categoria giuridica italiana",
        "Hotel structure": "Struttura alberghiera",
        "Non-hotel structure": "Struttura non alberghiera",
        "Short let": "Locazione breve",
        "Tourist lease": "Locazione turistica",
        "City": "Città",
        "Region": "Regione",
        "Street": "Via",
        "Building number": "Numero civico",
        "Postal code": "CAP",
        "Cadastral sheet": "Foglio catastale",
        "Cadastral parcel": "Particella catastale",
        "Cadastral subaltern": "Subalterno catastale",
        "Save draft": "Salva bozza",
        "Submit for review": "Invia per la revisione",
        "Create the operator record first.": "Crea prima la scheda del titolare.",
        "Choose a property type.": "Scegli il tipo di struttura.",
        "Choose an Italian legal category.": "Scegli la categoria giuridica italiana.",
        "Property name is required.": "Il nome dell'immobile è obbligatorio.",
        "City is required.": "La città è obbligatoria.",
        "Street is required.": "La via è obbligatoria.",
        "Building number is required.": "Il numero civico è obbligatorio.",
        "Building number is too long.": "Il numero civico è troppo lungo.",
        "Italian CIN must be 15 letters or digits.": "Il CIN italiano deve avere 15 lettere o cifre.",
        "Submission is open for Italy only.": "L'invio è aperto solo per l'Italia.",
        "Draft property saved. It is not published.": "Bozza salvata. L'annuncio non è pubblicato.",
        "Submitted for review. The listing stays unpublished.": "Inviata per la revisione. L'annuncio resta non pubblicato.",
        "This application was already submitted.": "Questa pratica è già stata inviata.",
        "Property not found.": "Immobile non trovato.",
        "Property documents": "Documenti dell'immobile",
        "Private storage. Identity documents cannot be uploaded.": "Archivio privato. I documenti di identità non possono essere caricati.",
        "A passport, an identity card, or a selfie cannot be uploaded until the privacy assessment and an identity-provider contract are complete. Uploading a property record does not verify the person or the property.": "Un passaporto, una carta d'identità o un selfie non possono essere caricati finché la valutazione privacy e il contratto con un fornitore di identità non sono conclusi. Caricare un documento dell'immobile non verifica la persona né l'immobile.",
        "Property record": "Documento dell'immobile",
        "Ownership record": "Titolo di proprietà",
        "Management mandate": "Mandato di gestione",
        "CIN record": "Attestazione CIN",
        "Regional code": "Codice regionale",
        "Local permit": "Autorizzazione comunale",
        "Exterior photo": "Foto esterna",
        "Safety declaration": "Dichiarazione di sicurezza",
        "Store privately": "Archivia in privato",
        "Identity document upload is not open.": "Il caricamento dei documenti di identità non è aperto.",
        "Choose a property document and open this page from the property draft.": "Scegli un documento dell'immobile e apri questa pagina dalla bozza.",
        "Evidence path is not allowed.": "Il percorso del documento non è consentito.",
        "Document stored in private storage. It does not verify the property.": "Documento archiviato in privato. Non verifica l'immobile.",
        "Identity status": "Stato identità",
        "Identity check": "Controllo identità",
        "Not started. Identity Verified stays off.": "Non avviata. L'identità verificata resta disattivata.",
        "Waiting for an identity provider. None is connected.": "In attesa di un fornitore di identità. Nessuno è collegato.",
        "The identity file needs more information.": "Il fascicolo identità richiede altre informazioni.",
        "The identity file was rejected.": "Il fascicolo identità è stato respinto.",
        "The identity file is suspended.": "Il fascicolo identità è sospeso.",
        "Identity Verified stays off.": "L'identità verificata resta disattivata.",
        "No identity provider is connected.": "Nessun fornitore di identità è collegato.",
        "Identity and property are separate. Neither can be switched on here.": "Identità e immobile restano separati. Da qui non si possono attivare.",
        "Identity Verified is off for every account until a contracted provider records a pass. Account metadata cannot turn it on.": "L'identità verificata è disattivata per ogni account finché un fornitore con contratto non registra un esito positivo. I metadati dell'account non possono attivarla.",
        "Properties": "Immobili",
        "No property file yet.": "Nessuna pratica immobile.",
        "Draft saved. Submit it when the property file is complete.": "Bozza salvata. Inviala quando la pratica è completa.",
        "A reviewer has the property file. The listing stays unpublished.": "Un revisore ha la pratica dell'immobile. L'annuncio resta non pubblicato.",
        "More property information is required before another review.": "Servono altre informazioni sull'immobile prima di un nuovo esame.",
        "The property file was approved. Identity stays unverified and the listing stays unpublished.": "La pratica dell'immobile è stata approvata. L'identità resta non verificata e l'annuncio resta non pubblicato.",
        "The property file was rejected.": "La pratica dell'immobile è stata respinta.",
        "The property file is suspended.": "La pratica dell'immobile è sospesa.",
        "The property file was revoked.": "La pratica dell'immobile è stata revocata.",
        "The property file is recorded.": "La pratica dell'immobile è registrata.",
        "Review queue": "Coda di revisione",
        "Server-assigned reviewers only. This page cannot verify identity.": "Solo revisori assegnati dal server. Questa pagina non verifica l'identità.",
        "No property is waiting for review.": "Nessun immobile è in attesa di revisione.",
        "Review access is assigned on the server.": "L'accesso alla revisione viene assegnato sul server.",
        "Review case": "Pratica in revisione",
        "A property decision does not verify identity and does not publish the listing.": "Una decisione sull'immobile non verifica l'identità e non pubblica l'annuncio.",
        "Loading the case.": "Caricamento della pratica.",
        "Property decision": "Decisione sull'immobile",
        "Needs more information": "Servono altre informazioni",
        "Reject": "Respingi",
        "Approve property": "Approva l'immobile",
        "Suspend": "Sospendi",
        "Revoke": "Revoca",
        "Notes": "Note",
        "Record decision": "Registra la decisione",
        "This decision is not available.": "Questa decisione non è disponibile.",
        "Unknown decision.": "Decisione sconosciuta.",
        "Property decision recorded. Identity Verified remains off and the listing stays unpublished.": "Decisione registrata. L'identità verificata resta disattivata e l'annuncio resta non pubblicato.",
        "The decision was not recorded.": "La decisione non è stata registrata.",
        "Supabase configuration is missing.": "Manca la configurazione di Supabase.",
        "Log In": "Accedi",
        "Create New Account": "Crea un nuovo account",
        "Home": "Home",
        "Listings": "Annunci",
        "Status": "Stato",
        "Operator": "Titolare",
        "Property": "Immobile",
        "Documents": "Documenti",
        "Queue": "Coda",
        "Back": "Indietro"
    };


    var FA_PHRASES = {
        "Accommodation": "اقامت",
        "Search published HAVKAR stays + eligible suppliers. Live booking stays Owner-gated.": "جستجوی اقامتگاه‌های منتشرشده هاوکار و تأمین‌کنندگان واجد شرایط. رزرو زنده همچنان تحت کنترل مالک است.",
        "No verified accommodation is published yet": "هنوز اقامتگاه تأییدشده‌ای منتشر نشده است",
        "The interactive map above still works for destination search and GPS. HAVKAR never invents hotel inventory, prices, or availability. Property owners can apply via “List a property”.": "نقشه تعاملی بالا همچنان برای جستجوی مقصد و GPS کار می‌کند. هاوکار اقامتگاه، قیمت یا موجودی ساختگی نمی‌سازد. مالکان می‌توانند از «ثبت ملک» اقدام کنند.",
        "City / destination": "شهر / مقصد",
        "City / destination / address": "شهر / مقصد / آدرس",
        "Category": "دسته",
        "All types": "همه انواع",
        "Hotel": "هتل",
        "Apartment": "آپارتمان",
        "Guesthouse": "مهمان‌خانه",
        "Other": "سایر",
        "Use my location": "از موقعیت من استفاده کن",
        "Search this area": "جستجو در این محدوده",
        "Map": "نقشه",
        "List": "فهرست",
        "Map + list": "نقشه + فهرست",
        "Destination map": "نقشه مقصد",
        "Favorites": "علاقه‌مندی‌ها",
        "Compare": "مقایسه",
        "Share location": "اشتراک‌گذاری موقعیت",
        "Copy location link": "کپی لینک موقعیت",
        "Check-in": "ورود",
        "Check-out": "خروج",
        "Adults": "بزرگسال",
        "Children": "کودک",
        "Rooms": "اتاق",
        "Display / charge currency": "ارز نمایش / پرداخت",
        "Currency": "ارز",
        "Search stays": "جستجوی اقامت",
        "Payment methods": "روش‌های پرداخت",
        "Two separate rails. XLM is not a Stripe currency. Live hotel charges stay OFF.": "دو مسیر جدا. XLM ارز Stripe نیست. شارژ زنده هتل خاموش است.",
        "Pay by card / supported currencies": "پرداخت با کارت / ارزهای پشتیبانی‌شده",
        "Pay with XLM wallet": "پرداخت با کیف‌پول XLM",
        "Sample list price (EUR)": "قیمت نمونه فهرست (یورو)",
        "Stripe fee quote (no charge)": "پیش‌فاکتور کارمزد Stripe (بدون شارژ)",
        "XLM quote (no charge)": "پیش‌فاکتور XLM (بدون شارژ)",
        "My booking history": "تاریخچه رزروهای من",
        "Owner tools": "ابزارهای مالک",
        "Currency matrix": "ماتریس ارز",
        "List a property": "ثبت ملک",
        "Case status": "وضعیت پرونده",
        "Hotel search": "جستجوی هتل",
        "Calls": "تماس‌ها",
        "Log In": "ورود",
        "Create New Account": "ایجاد حساب جدید",
        "Home": "خانه",
        "Listings": "آگهی‌ها",
        "Back": "بازگشت",
        "Help for this section": "راهنمای این بخش",
        "Professional HAVKAR map for Accommodation: street / satellite / hybrid, live traffic, place search, GPS, routing. Satellite is static imagery, not a live camera. Cameras/rain only from licensed public sources. All active map tools are free.": "نقشه حرفه‌ای هاوکار برای اقامت: خیابان / ماهواره / ترکیبی، ترافیک زنده، جستجوی مکان، GPS و مسیریابی. ماهواره تصویر ثابت است نه دوربین زنده. دوربین/باران فقط از منابع عمومی مجاز. همه ابزارهای فعال نقشه رایگان‌اند."
    };

    var applying = false;

    function phraseMap() {
        var lang = language();
        if (lang === "it") return PHRASES;
        if (lang === "fa") return Object.assign({}, packFor(lang), FA_PHRASES);
        if (lang === "ar" || lang === "ckb") return Object.assign({}, packFor(lang), FA_PHRASES);
        return Object.assign({}, packFor(lang));
    }

    function apply(root) {
        if (applying) {
            return;
        }

        var lang = language();
        if (lang === "en") {
            document.documentElement.lang = "en";
            return;
        }

        applying = true;

        try {
            document.documentElement.lang = lang;
            try {
                document.documentElement.dir =
                    (lang === "fa" || lang === "ar" || lang === "ur" || lang === "ckb")
                        ? "rtl"
                        : "ltr";
            } catch (_d) {}
            var phrases = phraseMap();
            var scope = root && root.nodeType === 1 ? root : document.body;
            var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            var node;

            while ((node = walker.nextNode())) {
                var parent = node.parentElement;

                if (!parent || parent.closest("script, style, [data-user-text]")) {
                    continue;
                }

                var translated = phrases[node.nodeValue.trim()];

                if (translated) {
                    node.nodeValue = translated;
                }
            }

            scope.querySelectorAll("[aria-label]").forEach(function (element) {
                var label = phrases[element.getAttribute("aria-label")];

                if (label) {
                    element.setAttribute("aria-label", label);
                }
            });

            if (window.HAVKAR_PREMIUM_I18N && typeof window.HAVKAR_PREMIUM_I18N.apply === "function") {
                window.HAVKAR_PREMIUM_I18N.apply(scope);
            }
        } finally {
            applying = false;
        }
    }

    window.HAVKAR_ACCOMMODATION_I18N = {
        apply: apply,
        phrase: function (text) {
            var phrases = phraseMap();
            return phrases[text] || text;
        }
    };

    if (document.body && document.body.dataset.accommodationPage) {
        apply(document.body);
        document.addEventListener("havkar:i18n-ready", function () {
            apply(document.body);
        });
    }
})();
