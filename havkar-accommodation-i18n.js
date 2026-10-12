(function () {
    var PHRASES = {
        "Accommodation": "Alloggi",
        "Published Italian listings only. No sample stays and no prices.": "Solo annunci italiani pubblicati. Nessun soggiorno di esempio e nessun prezzo.",
        "No verified accommodation is published.": "Nessun alloggio verificato è pubblicato.",
        "List a property": "Registra un immobile",
        "Case status": "Stato della pratica",
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

    var applying = false;

    function language() {
        try {
            return localStorage.getItem("havkar_language") || "en";
        } catch (error) {
            return "en";
        }
    }

    function apply(root) {
        if (applying || language() !== "it") {
            if (language() !== "it") {
                document.documentElement.lang = "en";
            }

            return;
        }

        applying = true;

        try {
            document.documentElement.lang = "it";
            var scope = root && root.nodeType === 1 ? root : document.body;
            var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
            var node;

            while ((node = walker.nextNode())) {
                var parent = node.parentElement;

                if (!parent || parent.closest("script, style, [data-user-text]")) {
                    continue;
                }

                var translated = PHRASES[node.nodeValue.trim()];

                if (translated) {
                    node.nodeValue = translated;
                }
            }

            scope.querySelectorAll("[aria-label]").forEach(function (element) {
                var label = PHRASES[element.getAttribute("aria-label")];

                if (label) {
                    element.setAttribute("aria-label", label);
                }
            });
        } finally {
            applying = false;
        }
    }

    window.HAVKAR_ACCOMMODATION_I18N = {
        apply: apply,
        phrase: function (text) {
            if (language() !== "it") {
                return text;
            }

            return PHRASES[text] || text;
        }
    };

    if (document.body && document.body.dataset.accommodationPage) {
        apply(document.body);
        document.addEventListener("havkar:i18n-ready", function () {
            apply(document.body);
        });
    }
})();
