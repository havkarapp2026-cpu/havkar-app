(() => {
    "use strict";

    const COPY = {
        en: {
            title: "Pay with XLM",
            testnet: "Network: Testnet",
            service: "Service",
            merchant: "Merchant",
            eur: "EUR price",
            xlm: "XLM amount",
            rate: "Conversion rate",
            fee: "Network fee",
            destination: "Payment destination",
            status: "Payment status",
            reference: "Transaction reference",
            sign: "Approve in wallet",
            close: "Close",
            cancel: "Cancel payment",
            receipt: "Payment receipt",
            explorer: "View on the Testnet explorer",
            unavailable: "XLM checkout is not available until the receiving address and EUR/XLM rate are approved.",
            working: "Contacting the Stellar network..."
        },
        fa: {
            title: "پرداخت با XLM",
            testnet: "شبکه: Testnet",
            service: "خدمت",
            merchant: "فروشنده",
            eur: "قیمت یورو",
            xlm: "مقدار XLM",
            rate: "نرخ تبدیل",
            fee: "کارمزد شبکه",
            destination: "مقصد پرداخت",
            status: "وضعیت پرداخت",
            reference: "مرجع تراکنش",
            sign: "تأیید در کیف‌پول",
            close: "بستن",
            cancel: "لغو پرداخت",
            receipt: "رسید پرداخت",
            explorer: "مشاهده در مرورگر Testnet",
            unavailable: "پرداخت XLM تا تأیید آدرس دریافت و نرخ یورو به XLM آماده نیست.",
            working: "در حال ارتباط با شبکه استلار..."
        },
        ar: {
            title: "الدفع بـ XLM",
            testnet: "الشبكة: Testnet",
            service: "الخدمة",
            merchant: "التاجر",
            eur: "السعر باليورو",
            xlm: "مبلغ XLM",
            rate: "سعر التحويل",
            fee: "رسوم الشبكة",
            destination: "وجهة الدفع",
            status: "حالة الدفع",
            reference: "مرجع المعاملة",
            sign: "الموافقة في المحفظة",
            close: "إغلاق",
            cancel: "إلغاء الدفع",
            receipt: "إيصال الدفع",
            explorer: "عرض على مستكشف Testnet",
            unavailable: "دفع XLM غير متاح قبل اعتماد عنوان الاستلام وسعر اليورو إلى XLM.",
            working: "جارٍ الاتصال بشبكة ستيلار..."
        },
        it: {
            title: "Paga con XLM",
            testnet: "Rete: Testnet",
            service: "Servizio",
            merchant: "Esercente",
            eur: "Prezzo in EUR",
            xlm: "Importo XLM",
            rate: "Tasso di cambio",
            fee: "Commissione di rete",
            destination: "Destinazione del pagamento",
            status: "Stato del pagamento",
            reference: "Riferimento della transazione",
            sign: "Approva nel wallet",
            close: "Chiudi",
            cancel: "Annulla pagamento",
            receipt: "Ricevuta di pagamento",
            explorer: "Apri l'explorer Testnet",
            unavailable: "Il pagamento XLM resta non disponibile finché l'indirizzo di incasso e il tasso EUR/XLM non sono approvati.",
            working: "Connessione alla rete Stellar..."
        },
        sv: {
            title: "Betala med XLM",
            testnet: "Nätverk: Testnet",
            service: "Tjänst",
            merchant: "Säljare",
            eur: "Pris i EUR",
            xlm: "XLM-belopp",
            rate: "Växelkurs",
            fee: "Nätverksavgift",
            destination: "Betalningsmottagare",
            status: "Betalningsstatus",
            reference: "Transaktionsreferens",
            sign: "Godkänn i plånboken",
            close: "Stäng",
            cancel: "Avbryt betalning",
            receipt: "Betalningskvitto",
            explorer: "Visa i Testnet-utforskaren",
            unavailable: "XLM-betalning är inte tillgänglig förrän mottagaradress och EUR/XLM-kurs har godkänts.",
            working: "Kontaktar Stellar-nätverket..."
        },
        ckb: {
            title: "پارەدان بە XLM",
            testnet: "تۆڕ: Testnet",
            service: "خزمەتگوزاری",
            merchant: "فرۆشیار",
            eur: "نرخی یۆرۆ",
            xlm: "بڕی XLM",
            rate: "نرخی گۆڕین",
            fee: "کرێی تۆڕ",
            destination: "ناونیشانی وەرگرتن",
            status: "دۆخی پارەدان",
            reference: "ژمارەی مامەڵە",
            sign: "پەسەندکردن لە جزدان",
            close: "داخستن",
            cancel: "هەڵوەشاندنەوەی پارەدان",
            receipt: "پسووڵەی پارەدان",
            explorer: "بینین لە گەڕۆکی Testnet",
            unavailable: "پارەدانی XLM ئامادە نییە تا ناونیشانی وەرگرتن و نرخی یۆرۆ بۆ XLM پەسەند بکرێن.",
            working: "پەیوەندی بە تۆڕی ستێلارەوە..."
        },
        kmr: {
            title: "Bi XLM bidin",
            testnet: "Tor: Testnet",
            service: "Xizmet",
            merchant: "Firoşkar",
            eur: "Bihayê EUR",
            xlm: "Mîqdara XLM",
            rate: "Rêjeya guhertinê",
            fee: "Xerca torê",
            destination: "Navnîşana wergirtinê",
            status: "Rewşa dayînê",
            reference: "Referansa danûstendinê",
            sign: "Di berîkê de pesend bike",
            close: "Bigire",
            cancel: "Dayînê betal bike",
            receipt: "Makbûza dayînê",
            explorer: "Li lêgerîna Testnet bibîne",
            unavailable: "Dayîna XLM heta pejirandina navnîşan û rêjeya EUR/XLM ne amade ye.",
            working: "Têkilî bi tora Stellar re..."
        }
    };

    function language() {
        const stored = localStorage.getItem("havkar_language") || "en";
        return COPY[stored] ? stored : "en";
    }

    function text(key) {
        return COPY[language()][key] || COPY.en[key] || "";
    }

    function direction() {
        return localStorage.getItem("havkar_language_dir")
            || (language() === "fa" || language() === "ar" || language() === "ckb" ? "rtl" : "ltr");
    }

    function ensurePanel() {
        let panel = document.getElementById("havkarStellarCheckout");

        if (panel) {
            return panel;
        }

        panel = document.createElement("section");
        panel.id = "havkarStellarCheckout";
        panel.hidden = true;
        panel.innerHTML = `
            <style>
                #havkarStellarCheckout {
                    position: fixed;
                    inset: 0;
                    z-index: 1100;
                    background: rgba(27, 94, 32, .35);
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                }
                #havkarStellarCheckout[hidden] { display: none; }
                #havkarStellarCheckout .sheet {
                    width: min(520px, 100%);
                    max-height: 92vh;
                    overflow: auto;
                    background: #fff;
                    border-radius: 18px 18px 0 0;
                    padding: 18px 16px 24px;
                    color: #1b5e20;
                }
                #havkarStellarCheckout h2 { margin: 0 0 8px; font-size: 1.2rem; }
                #havkarStellarCheckout .network {
                    display: inline-block;
                    background: #e8f5e9;
                    border-radius: 999px;
                    padding: 4px 10px;
                    font-weight: 700;
                }
                #havkarStellarCheckout dl { margin: 14px 0; }
                #havkarStellarCheckout dt { font-size: .78rem; color: #558b2f; }
                #havkarStellarCheckout dd {
                    margin: 0 0 10px;
                    font-weight: 700;
                    overflow-wrap: anywhere;
                }
                #havkarStellarCheckout button, #havkarStellarCheckout a.action {
                    min-height: 46px;
                    border: 0;
                    border-radius: 11px;
                    padding: 0 16px;
                    font-weight: 700;
                    margin: 4px 4px 0 0;
                    display: inline-flex;
                    align-items: center;
                    text-decoration: none;
                }
                #havkarStellarCheckout .primary { background: #1b5e20; color: white; }
                #havkarStellarCheckout .quiet { background: #e8f5e9; color: #1b5e20; }
                #havkarStellarCheckout .message { white-space: pre-wrap; }
            </style>
            <div class="sheet" role="dialog" aria-modal="true">
                <h2></h2>
                <div class="network"></div>
                <p class="message"></p>
                <dl></dl>
                <div class="actions"></div>
            </div>
        `;
        document.body.appendChild(panel);
        return panel;
    }

    function row(label, value) {
        return `<dt>${label}</dt><dd>${value || "—"}</dd>`;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function render(payment, message, actions) {
        const panel = ensurePanel();
        const sheet = panel.querySelector(".sheet");
        sheet.dir = direction();
        panel.querySelector("h2").textContent = payment?.status === "CONFIRMED"
            ? text("receipt")
            : text("title");
        panel.querySelector(".network").textContent = text("testnet");
        panel.querySelector(".message").textContent = message || "";
        const fee = payment?.network_fee_stroops
            ? `${payment.network_fee_stroops} stroops`
            : "—";
        panel.querySelector("dl").innerHTML = [
            row(text("service"), escapeHtml(payment?.service_name)),
            row(text("merchant"), escapeHtml(payment?.merchant_name)),
            row(text("eur"), escapeHtml(payment?.eur_amount)),
            row(text("xlm"), escapeHtml(payment?.xlm_amount)),
            row(text("rate"), escapeHtml(payment?.eur_per_xlm ? `${payment.eur_per_xlm} EUR / XLM` : "")),
            row(text("fee"), escapeHtml(fee)),
            row(text("destination"), escapeHtml(payment?.destination)),
            row(text("status"), escapeHtml(payment?.status)),
            row(text("reference"), escapeHtml(payment?.transaction_hash || payment?.memo))
        ].join("");
        const actionBox = panel.querySelector(".actions");
        actionBox.replaceChildren();

        for (const action of actions) {
            const control = action.href
                ? document.createElement("a")
                : document.createElement("button");
            control.className = action.primary ? "action primary" : "action quiet";
            control.textContent = action.label;

            if (action.href) {
                const url = new URL(action.href);
                if (url.protocol !== "https:" || url.hostname !== "stellar.expert") {
                    continue;
                }
                control.href = url.href;
                control.target = "_blank";
                control.rel = "noopener";
            } else {
                control.type = "button";
                control.addEventListener("click", action.onClick);
            }

            actionBox.appendChild(control);
        }

        panel.hidden = false;
    }

    function closePanel() {
        const panel = document.getElementById("havkarStellarCheckout");
        if (panel) panel.hidden = true;
    }

    async function accessToken() {
        if (typeof window.havkarAccessToken === "function") {
            return String(await window.havkarAccessToken() || "");
        }

        const client = window.supabase;
        if (typeof client?.auth?.getSession !== "function") {
            return "";
        }

        const session = await client.auth.getSession();
        return session?.data?.session?.access_token || "";
    }

    async function post(body) {
        const token = await accessToken();

        if (!token) {
            throw new Error("Authentication required.");
        }

        const response = await fetch("/api/stellar-payment", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        const payload = await response.json();

        if (!response.ok || payload.ok !== true) {
            const error = new Error(payload.error || "The Stellar payment could not be completed.");
            error.payment = payload.payment || null;
            throw error;
        }

        return payload;
    }

    function actionsFor(payment, retry) {
        const actions = [{ label: text("close"), onClick: closePanel }];

        if (payment?.explorer_url) {
            actions.unshift({
                label: text("explorer"),
                href: payment.explorer_url,
                primary: true
            });
        }

        if (payment && (payment.status === "PENDING" || payment.status === "AWAITING_SIGNATURE")) {
            actions.unshift({
                label: text("sign"),
                primary: true,
                onClick: () => sign(payment).catch((error) => {
                    render(error.payment || payment, error.message, actionsFor(error.payment || payment));
                })
            });
            actions.splice(1, 0, {
                label: text("cancel"),
                onClick: () => cancel(payment).catch((error) => {
                    render(error.payment || payment, error.message, actionsFor(error.payment || payment));
                })
            });
        }

        if (!payment && retry) {
            actions.unshift({ label: text("sign"), primary: true, onClick: retry });
        }

        return actions;
    }

    async function sign(payment) {
        render(payment, text("working"), []);

        if (typeof window.havkarSetStellarNetwork === "function") {
            window.havkarSetStellarNetwork("TESTNET");
        }

        if (typeof window.havkarConnectStellarWallet !== "function"
            || typeof window.havkarSignPreparedCheckoutXdr !== "function") {
            throw new Error("Stellar wallet signing is not available.");
        }

        const source = payment.source || await window.havkarConnectStellarWallet();
        const prepared = await post({
            action: "prepare",
            payment_id: payment.id,
            source_public_key: source
        });
        const signedXdr = await window.havkarSignPreparedCheckoutXdr(
            prepared.xdr,
            prepared.payment.source || source
        );
        const submitted = await post({
            action: "submit",
            payment_id: payment.id,
            signed_xdr: signedXdr
        });

        if (submitted.payment?.status !== "CONFIRMED" || !submitted.payment.transaction_hash) {
            throw new Error("The Stellar network did not confirm this transaction.");
        }

        render(submitted.payment, "", actionsFor(submitted.payment));
    }

    async function cancel(payment) {
        const result = await post({ action: "cancel", payment_id: payment.id });
        render(result.payment, "", actionsFor(result.payment));
    }

    async function openCheckout(serviceType, serviceId, quantity) {
        render(null, text("working"), []);

        try {
            const payload = {
                action: "create",
                service_type: serviceType,
                quantity: quantity || 1
            };

            if (serviceType === "event_ticket") {
                payload.event_id = Number(serviceId);
            } else {
                payload.service_id = String(serviceId);
            }

            const created = await post(payload);
            render(created.payment, "", actionsFor(created.payment));
        } catch (error) {
            const unavailable = /not approved yet|not configured|disabled on production/i.test(error.message);
            render(error.payment, unavailable ? text("unavailable") : error.message, [
                { label: text("close"), onClick: closePanel }
            ]);
        }
    }

    window.havkarOpenStellarCheckout = function havkarOpenStellarCheckout(eventId) {
        return openCheckout("event_ticket", eventId, 1);
    };

    window.havkarOpenStellarServiceCheckout = function havkarOpenStellarServiceCheckout(request) {
        return openCheckout(request?.serviceType, request?.serviceId, request?.quantity || 1);
    };

    document.querySelectorAll("[data-havkar-xlm-label]").forEach((node) => {
        node.textContent = text("title");
    });
})();
