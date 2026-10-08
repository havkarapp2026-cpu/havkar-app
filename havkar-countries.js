/*
 * ISO 3166-1 alpha-2 country codes for HAVKAR listings.
 * Names are the English short names from the ISO 3166 dataset.
 * This file does not translate user-written city names.
 */
(function () {
    "use strict";

    const COUNTRIES = Object.freeze([
        Object.freeze({ code: "AF", name: "Afghanistan" }),
        Object.freeze({ code: "AL", name: "Albania" }),
        Object.freeze({ code: "DZ", name: "Algeria" }),
        Object.freeze({ code: "AS", name: "American Samoa" }),
        Object.freeze({ code: "AD", name: "Andorra" }),
        Object.freeze({ code: "AO", name: "Angola" }),
        Object.freeze({ code: "AI", name: "Anguilla" }),
        Object.freeze({ code: "AQ", name: "Antarctica" }),
        Object.freeze({ code: "AG", name: "Antigua and Barbuda" }),
        Object.freeze({ code: "AR", name: "Argentina" }),
        Object.freeze({ code: "AM", name: "Armenia" }),
        Object.freeze({ code: "AW", name: "Aruba" }),
        Object.freeze({ code: "AU", name: "Australia" }),
        Object.freeze({ code: "AT", name: "Austria" }),
        Object.freeze({ code: "AZ", name: "Azerbaijan" }),
        Object.freeze({ code: "BS", name: "Bahamas" }),
        Object.freeze({ code: "BH", name: "Bahrain" }),
        Object.freeze({ code: "BD", name: "Bangladesh" }),
        Object.freeze({ code: "BB", name: "Barbados" }),
        Object.freeze({ code: "BY", name: "Belarus" }),
        Object.freeze({ code: "BE", name: "Belgium" }),
        Object.freeze({ code: "BZ", name: "Belize" }),
        Object.freeze({ code: "BJ", name: "Benin" }),
        Object.freeze({ code: "BM", name: "Bermuda" }),
        Object.freeze({ code: "BT", name: "Bhutan" }),
        Object.freeze({ code: "BO", name: "Bolivia, Plurinational State of" }),
        Object.freeze({ code: "BQ", name: "Bonaire, Sint Eustatius and Saba" }),
        Object.freeze({ code: "BA", name: "Bosnia and Herzegovina" }),
        Object.freeze({ code: "BW", name: "Botswana" }),
        Object.freeze({ code: "BV", name: "Bouvet Island" }),
        Object.freeze({ code: "BR", name: "Brazil" }),
        Object.freeze({ code: "IO", name: "British Indian Ocean Territory" }),
        Object.freeze({ code: "BN", name: "Brunei Darussalam" }),
        Object.freeze({ code: "BG", name: "Bulgaria" }),
        Object.freeze({ code: "BF", name: "Burkina Faso" }),
        Object.freeze({ code: "BI", name: "Burundi" }),
        Object.freeze({ code: "CV", name: "Cabo Verde" }),
        Object.freeze({ code: "KH", name: "Cambodia" }),
        Object.freeze({ code: "CM", name: "Cameroon" }),
        Object.freeze({ code: "CA", name: "Canada" }),
        Object.freeze({ code: "KY", name: "Cayman Islands" }),
        Object.freeze({ code: "CF", name: "Central African Republic" }),
        Object.freeze({ code: "TD", name: "Chad" }),
        Object.freeze({ code: "CL", name: "Chile" }),
        Object.freeze({ code: "CN", name: "China" }),
        Object.freeze({ code: "CX", name: "Christmas Island" }),
        Object.freeze({ code: "CC", name: "Cocos (Keeling) Islands" }),
        Object.freeze({ code: "CO", name: "Colombia" }),
        Object.freeze({ code: "KM", name: "Comoros" }),
        Object.freeze({ code: "CG", name: "Congo" }),
        Object.freeze({ code: "CD", name: "Congo, Democratic Republic of the" }),
        Object.freeze({ code: "CK", name: "Cook Islands" }),
        Object.freeze({ code: "CR", name: "Costa Rica" }),
        Object.freeze({ code: "HR", name: "Croatia" }),
        Object.freeze({ code: "CU", name: "Cuba" }),
        Object.freeze({ code: "CW", name: "Curaçao" }),
        Object.freeze({ code: "CY", name: "Cyprus" }),
        Object.freeze({ code: "CZ", name: "Czechia" }),
        Object.freeze({ code: "CI", name: "Côte d'Ivoire" }),
        Object.freeze({ code: "DK", name: "Denmark" }),
        Object.freeze({ code: "DJ", name: "Djibouti" }),
        Object.freeze({ code: "DM", name: "Dominica" }),
        Object.freeze({ code: "DO", name: "Dominican Republic" }),
        Object.freeze({ code: "EC", name: "Ecuador" }),
        Object.freeze({ code: "EG", name: "Egypt" }),
        Object.freeze({ code: "SV", name: "El Salvador" }),
        Object.freeze({ code: "GQ", name: "Equatorial Guinea" }),
        Object.freeze({ code: "ER", name: "Eritrea" }),
        Object.freeze({ code: "EE", name: "Estonia" }),
        Object.freeze({ code: "SZ", name: "Eswatini" }),
        Object.freeze({ code: "ET", name: "Ethiopia" }),
        Object.freeze({ code: "FK", name: "Falkland Islands (Malvinas)" }),
        Object.freeze({ code: "FO", name: "Faroe Islands" }),
        Object.freeze({ code: "FJ", name: "Fiji" }),
        Object.freeze({ code: "FI", name: "Finland" }),
        Object.freeze({ code: "FR", name: "France" }),
        Object.freeze({ code: "GF", name: "French Guiana" }),
        Object.freeze({ code: "PF", name: "French Polynesia" }),
        Object.freeze({ code: "TF", name: "French Southern Territories" }),
        Object.freeze({ code: "GA", name: "Gabon" }),
        Object.freeze({ code: "GM", name: "Gambia" }),
        Object.freeze({ code: "GE", name: "Georgia" }),
        Object.freeze({ code: "DE", name: "Germany" }),
        Object.freeze({ code: "GH", name: "Ghana" }),
        Object.freeze({ code: "GI", name: "Gibraltar" }),
        Object.freeze({ code: "GR", name: "Greece" }),
        Object.freeze({ code: "GL", name: "Greenland" }),
        Object.freeze({ code: "GD", name: "Grenada" }),
        Object.freeze({ code: "GP", name: "Guadeloupe" }),
        Object.freeze({ code: "GU", name: "Guam" }),
        Object.freeze({ code: "GT", name: "Guatemala" }),
        Object.freeze({ code: "GG", name: "Guernsey" }),
        Object.freeze({ code: "GN", name: "Guinea" }),
        Object.freeze({ code: "GW", name: "Guinea-Bissau" }),
        Object.freeze({ code: "GY", name: "Guyana" }),
        Object.freeze({ code: "HT", name: "Haiti" }),
        Object.freeze({ code: "HM", name: "Heard Island and McDonald Islands" }),
        Object.freeze({ code: "VA", name: "Holy See" }),
        Object.freeze({ code: "HN", name: "Honduras" }),
        Object.freeze({ code: "HK", name: "Hong Kong" }),
        Object.freeze({ code: "HU", name: "Hungary" }),
        Object.freeze({ code: "IS", name: "Iceland" }),
        Object.freeze({ code: "IN", name: "India" }),
        Object.freeze({ code: "ID", name: "Indonesia" }),
        Object.freeze({ code: "IR", name: "Iran, Islamic Republic of" }),
        Object.freeze({ code: "IQ", name: "Iraq" }),
        Object.freeze({ code: "IE", name: "Ireland" }),
        Object.freeze({ code: "IM", name: "Isle of Man" }),
        Object.freeze({ code: "IL", name: "Israel" }),
        Object.freeze({ code: "IT", name: "Italy" }),
        Object.freeze({ code: "JM", name: "Jamaica" }),
        Object.freeze({ code: "JP", name: "Japan" }),
        Object.freeze({ code: "JE", name: "Jersey" }),
        Object.freeze({ code: "JO", name: "Jordan" }),
        Object.freeze({ code: "KZ", name: "Kazakhstan" }),
        Object.freeze({ code: "KE", name: "Kenya" }),
        Object.freeze({ code: "KI", name: "Kiribati" }),
        Object.freeze({ code: "KP", name: "Korea, Democratic People's Republic of" }),
        Object.freeze({ code: "KR", name: "Korea, Republic of" }),
        Object.freeze({ code: "KW", name: "Kuwait" }),
        Object.freeze({ code: "KG", name: "Kyrgyzstan" }),
        Object.freeze({ code: "LA", name: "Lao People's Democratic Republic" }),
        Object.freeze({ code: "LV", name: "Latvia" }),
        Object.freeze({ code: "LB", name: "Lebanon" }),
        Object.freeze({ code: "LS", name: "Lesotho" }),
        Object.freeze({ code: "LR", name: "Liberia" }),
        Object.freeze({ code: "LY", name: "Libya" }),
        Object.freeze({ code: "LI", name: "Liechtenstein" }),
        Object.freeze({ code: "LT", name: "Lithuania" }),
        Object.freeze({ code: "LU", name: "Luxembourg" }),
        Object.freeze({ code: "MO", name: "Macao" }),
        Object.freeze({ code: "MG", name: "Madagascar" }),
        Object.freeze({ code: "MW", name: "Malawi" }),
        Object.freeze({ code: "MY", name: "Malaysia" }),
        Object.freeze({ code: "MV", name: "Maldives" }),
        Object.freeze({ code: "ML", name: "Mali" }),
        Object.freeze({ code: "MT", name: "Malta" }),
        Object.freeze({ code: "MH", name: "Marshall Islands" }),
        Object.freeze({ code: "MQ", name: "Martinique" }),
        Object.freeze({ code: "MR", name: "Mauritania" }),
        Object.freeze({ code: "MU", name: "Mauritius" }),
        Object.freeze({ code: "YT", name: "Mayotte" }),
        Object.freeze({ code: "MX", name: "Mexico" }),
        Object.freeze({ code: "FM", name: "Micronesia, Federated States of" }),
        Object.freeze({ code: "MD", name: "Moldova, Republic of" }),
        Object.freeze({ code: "MC", name: "Monaco" }),
        Object.freeze({ code: "MN", name: "Mongolia" }),
        Object.freeze({ code: "ME", name: "Montenegro" }),
        Object.freeze({ code: "MS", name: "Montserrat" }),
        Object.freeze({ code: "MA", name: "Morocco" }),
        Object.freeze({ code: "MZ", name: "Mozambique" }),
        Object.freeze({ code: "MM", name: "Myanmar" }),
        Object.freeze({ code: "NA", name: "Namibia" }),
        Object.freeze({ code: "NR", name: "Nauru" }),
        Object.freeze({ code: "NP", name: "Nepal" }),
        Object.freeze({ code: "NL", name: "Netherlands, Kingdom of the" }),
        Object.freeze({ code: "NC", name: "New Caledonia" }),
        Object.freeze({ code: "NZ", name: "New Zealand" }),
        Object.freeze({ code: "NI", name: "Nicaragua" }),
        Object.freeze({ code: "NE", name: "Niger" }),
        Object.freeze({ code: "NG", name: "Nigeria" }),
        Object.freeze({ code: "NU", name: "Niue" }),
        Object.freeze({ code: "NF", name: "Norfolk Island" }),
        Object.freeze({ code: "MK", name: "North Macedonia" }),
        Object.freeze({ code: "MP", name: "Northern Mariana Islands" }),
        Object.freeze({ code: "NO", name: "Norway" }),
        Object.freeze({ code: "OM", name: "Oman" }),
        Object.freeze({ code: "PK", name: "Pakistan" }),
        Object.freeze({ code: "PW", name: "Palau" }),
        Object.freeze({ code: "PS", name: "Palestine, State of" }),
        Object.freeze({ code: "PA", name: "Panama" }),
        Object.freeze({ code: "PG", name: "Papua New Guinea" }),
        Object.freeze({ code: "PY", name: "Paraguay" }),
        Object.freeze({ code: "PE", name: "Peru" }),
        Object.freeze({ code: "PH", name: "Philippines" }),
        Object.freeze({ code: "PN", name: "Pitcairn" }),
        Object.freeze({ code: "PL", name: "Poland" }),
        Object.freeze({ code: "PT", name: "Portugal" }),
        Object.freeze({ code: "PR", name: "Puerto Rico" }),
        Object.freeze({ code: "QA", name: "Qatar" }),
        Object.freeze({ code: "RO", name: "Romania" }),
        Object.freeze({ code: "RU", name: "Russian Federation" }),
        Object.freeze({ code: "RW", name: "Rwanda" }),
        Object.freeze({ code: "RE", name: "Réunion" }),
        Object.freeze({ code: "BL", name: "Saint Barthélemy" }),
        Object.freeze({ code: "SH", name: "Saint Helena, Ascension and Tristan da Cunha" }),
        Object.freeze({ code: "KN", name: "Saint Kitts and Nevis" }),
        Object.freeze({ code: "LC", name: "Saint Lucia" }),
        Object.freeze({ code: "MF", name: "Saint Martin (French part)" }),
        Object.freeze({ code: "PM", name: "Saint Pierre and Miquelon" }),
        Object.freeze({ code: "VC", name: "Saint Vincent and the Grenadines" }),
        Object.freeze({ code: "WS", name: "Samoa" }),
        Object.freeze({ code: "SM", name: "San Marino" }),
        Object.freeze({ code: "ST", name: "Sao Tome and Principe" }),
        Object.freeze({ code: "SA", name: "Saudi Arabia" }),
        Object.freeze({ code: "SN", name: "Senegal" }),
        Object.freeze({ code: "RS", name: "Serbia" }),
        Object.freeze({ code: "SC", name: "Seychelles" }),
        Object.freeze({ code: "SL", name: "Sierra Leone" }),
        Object.freeze({ code: "SG", name: "Singapore" }),
        Object.freeze({ code: "SX", name: "Sint Maarten (Dutch part)" }),
        Object.freeze({ code: "SK", name: "Slovakia" }),
        Object.freeze({ code: "SI", name: "Slovenia" }),
        Object.freeze({ code: "SB", name: "Solomon Islands" }),
        Object.freeze({ code: "SO", name: "Somalia" }),
        Object.freeze({ code: "ZA", name: "South Africa" }),
        Object.freeze({ code: "GS", name: "South Georgia and the South Sandwich Islands" }),
        Object.freeze({ code: "SS", name: "South Sudan" }),
        Object.freeze({ code: "ES", name: "Spain" }),
        Object.freeze({ code: "LK", name: "Sri Lanka" }),
        Object.freeze({ code: "SD", name: "Sudan" }),
        Object.freeze({ code: "SR", name: "Suriname" }),
        Object.freeze({ code: "SJ", name: "Svalbard and Jan Mayen" }),
        Object.freeze({ code: "SE", name: "Sweden" }),
        Object.freeze({ code: "CH", name: "Switzerland" }),
        Object.freeze({ code: "SY", name: "Syrian Arab Republic" }),
        Object.freeze({ code: "TW", name: "Taiwan, Province of China" }),
        Object.freeze({ code: "TJ", name: "Tajikistan" }),
        Object.freeze({ code: "TZ", name: "Tanzania, United Republic of" }),
        Object.freeze({ code: "TH", name: "Thailand" }),
        Object.freeze({ code: "TL", name: "Timor-Leste" }),
        Object.freeze({ code: "TG", name: "Togo" }),
        Object.freeze({ code: "TK", name: "Tokelau" }),
        Object.freeze({ code: "TO", name: "Tonga" }),
        Object.freeze({ code: "TT", name: "Trinidad and Tobago" }),
        Object.freeze({ code: "TN", name: "Tunisia" }),
        Object.freeze({ code: "TM", name: "Turkmenistan" }),
        Object.freeze({ code: "TC", name: "Turks and Caicos Islands" }),
        Object.freeze({ code: "TV", name: "Tuvalu" }),
        Object.freeze({ code: "TR", name: "Türkiye" }),
        Object.freeze({ code: "UG", name: "Uganda" }),
        Object.freeze({ code: "UA", name: "Ukraine" }),
        Object.freeze({ code: "AE", name: "United Arab Emirates" }),
        Object.freeze({ code: "GB", name: "United Kingdom of Great Britain and Northern Ireland" }),
        Object.freeze({ code: "UM", name: "United States Minor Outlying Islands" }),
        Object.freeze({ code: "US", name: "United States of America" }),
        Object.freeze({ code: "UY", name: "Uruguay" }),
        Object.freeze({ code: "UZ", name: "Uzbekistan" }),
        Object.freeze({ code: "VU", name: "Vanuatu" }),
        Object.freeze({ code: "VE", name: "Venezuela, Bolivarian Republic of" }),
        Object.freeze({ code: "VN", name: "Viet Nam" }),
        Object.freeze({ code: "VG", name: "Virgin Islands (British)" }),
        Object.freeze({ code: "VI", name: "Virgin Islands (U.S.)" }),
        Object.freeze({ code: "WF", name: "Wallis and Futuna" }),
        Object.freeze({ code: "EH", name: "Western Sahara" }),
        Object.freeze({ code: "YE", name: "Yemen" }),
        Object.freeze({ code: "ZM", name: "Zambia" }),
        Object.freeze({ code: "ZW", name: "Zimbabwe" }),
        Object.freeze({ code: "AX", name: "Åland Islands" }),
    ]);

    const NAMES = new Map(
        COUNTRIES.map(function (country) {
            return [country.code, country.name];
        })
    );

    function normalizeCode(code) {
        return String(code || "").trim().toUpperCase();
    }

    function isCountryCode(code) {
        return NAMES.has(normalizeCode(code));
    }

    function countryName(code) {
        return NAMES.get(normalizeCode(code)) || "";
    }

    function placeLabel(record) {
        const source = record || {};
        const city = String(source.city || "").trim();
        const code = normalizeCode(source.country_code);
        const country = countryName(code) || code;
        return [city, country].filter(Boolean).join(", ");
    }

    function fillCountrySelect(select, placeholder) {
        if (!select) {
            return;
        }

        const current = normalizeCode(select.value);
        select.replaceChildren();

        const empty = document.createElement("option");
        empty.value = "";
        empty.textContent = placeholder || "";
        select.appendChild(empty);

        COUNTRIES.forEach(function (country) {
            const option = document.createElement("option");
            option.value = country.code;
            option.textContent = country.name;
            select.appendChild(option);
        });

        if (NAMES.has(current)) {
            select.value = current;
        }
    }

    window.HAVKAR_COUNTRIES = Object.freeze({
        list: COUNTRIES,
        isCountryCode: isCountryCode,
        countryName: countryName,
        placeLabel: placeLabel,
        fillCountrySelect: fillCountrySelect
    });
}());
