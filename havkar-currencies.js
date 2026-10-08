/*
 * ISO 4217 currency codes sellers can store on a HAVKAR advertisement.
 * Formatting shows the selected currency. It does not convert amounts
 * and does not assume EUR when no currency was recorded.
 */
(function () {
    "use strict";

    const CURRENCIES = Object.freeze([
        Object.freeze({ code: "EUR", name: "Euro" }),
        Object.freeze({ code: "USD", name: "US Dollar" }),
        Object.freeze({ code: "GBP", name: "Pound Sterling" }),
        Object.freeze({ code: "CHF", name: "Swiss Franc" }),
        Object.freeze({ code: "SEK", name: "Swedish Krona" }),
        Object.freeze({ code: "NOK", name: "Norwegian Krone" }),
        Object.freeze({ code: "DKK", name: "Danish Krone" }),
        Object.freeze({ code: "AED", name: "UAE Dirham" }),
        Object.freeze({ code: "SAR", name: "Saudi Riyal" }),
        Object.freeze({ code: "TRY", name: "Turkish Lira" }),
        Object.freeze({ code: "IQD", name: "Iraqi Dinar" }),
        Object.freeze({ code: "IRR", name: "Iranian Rial" }),
        Object.freeze({ code: "CNY", name: "Yuan Renminbi" }),
        Object.freeze({ code: "JPY", name: "Yen" }),
        Object.freeze({ code: "INR", name: "Indian Rupee" }),
        Object.freeze({ code: "RUB", name: "Russian Ruble" }),
        Object.freeze({ code: "CAD", name: "Canadian Dollar" }),
        Object.freeze({ code: "AUD", name: "Australian Dollar" }),
        Object.freeze({ code: "BRL", name: "Brazilian Real" })
    ]);

    const NAMES = new Map(
        CURRENCIES.map(function (currency) {
            return [currency.code, currency.name];
        })
    );

    function normalizeCode(code) {
        return String(code || "").trim().toUpperCase();
    }

    function isCurrencyCode(code) {
        return NAMES.has(normalizeCode(code));
    }

    function formatNumber(numeric) {
        return new Intl.NumberFormat(
            undefined,
            {
                maximumFractionDigits: 2
            }
        ).format(numeric);
    }

    function formatAmount(value, currency, emptyLabel) {
        if (
            value === null ||
            value === undefined ||
            String(value).trim() === ""
        ) {
            return emptyLabel || "";
        }

        const numeric = Number(value);

        if (!Number.isFinite(numeric)) {
            return String(value);
        }

        const code = normalizeCode(currency);

        if (!isCurrencyCode(code)) {
            return formatNumber(numeric);
        }

        try {
            return new Intl.NumberFormat(
                undefined,
                {
                    style: "currency",
                    currency: code
                }
            ).format(numeric);
        } catch (error) {
            return formatNumber(numeric) + " " + code;
        }
    }

    function fillCurrencySelect(select, placeholder) {
        if (!select) {
            return;
        }

        const current = normalizeCode(select.value);
        select.replaceChildren();

        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = placeholder || "";
        select.appendChild(empty);

        CURRENCIES.forEach(function (currency) {
            const option = document.createElement("option");
            option.value = currency.code;
            option.textContent =
                currency.code + " — " + currency.name;
            select.appendChild(option);
        });

        if (NAMES.has(current)) {
            select.value = current;
        }
    }

    window.HAVKAR_CURRENCIES = Object.freeze({
        list: CURRENCIES,
        isCurrencyCode: isCurrencyCode,
        formatAmount: formatAmount,
        fillCurrencySelect: fillCurrencySelect
    });
}());
