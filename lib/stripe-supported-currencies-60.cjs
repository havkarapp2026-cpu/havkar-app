/*
 * Stripe presentment currency registry for HAVKAR Italian account (acct capabilities-verified).
 * Source: https://docs.stripe.com/currencies — presentment list.
 * Settlement currency remains EUR (Revolut …8455). This file lists charge/presentment
 * currencies only; it does not invent payout-country eligibility.
 * Live collection still requires Owner payment flags.
 */

const ZERO_DECIMAL = new Set([
"bif",
"clp",
"djf",
"gnf",
"jpy",
"kmf",
"krw",
"mga",
"pyg",
"rwf",
"vnd",
"vuv",
"xaf",
"xof",
"xpf"
]);

const SPECIAL_TWO_DECIMAL_ZERO = Object.freeze(new Set(["isk", "ugx"]));

const THREE_DECIMAL = Object.freeze(new Set(["bhd", "jod", "kwd", "omr", "tnd"]));

const CURRENCIES = Object.freeze([
  {
    "code": "usd",
    "name": "US Dollar",
    "symbol": "$",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "aed",
    "name": "UAE Dirham",
    "symbol": "د.إ",
    "decimals": 2,
    "min_major": 2,
    "amex_supported": true
  },
  {
    "code": "afn",
    "name": "AFN",
    "symbol": "AFN",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "all",
    "name": "ALL",
    "symbol": "ALL",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "amd",
    "name": "AMD",
    "symbol": "AMD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "ang",
    "name": "ANG",
    "symbol": "ANG",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "aoa",
    "name": "AOA",
    "symbol": "AOA",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "ars",
    "name": "ARS",
    "symbol": "ARS",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "aud",
    "name": "Australian Dollar",
    "symbol": "A$",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "awg",
    "name": "AWG",
    "symbol": "AWG",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "azn",
    "name": "AZN",
    "symbol": "AZN",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "bam",
    "name": "BAM",
    "symbol": "BAM",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "bbd",
    "name": "BBD",
    "symbol": "BBD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "bdt",
    "name": "Bangladeshi Taka",
    "symbol": "BDT",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "bif",
    "name": "BIF",
    "symbol": "BIF",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "bmd",
    "name": "BMD",
    "symbol": "BMD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "bnd",
    "name": "BND",
    "symbol": "BND",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "bob",
    "name": "BOB",
    "symbol": "BOB",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "brl",
    "name": "Brazilian Real",
    "symbol": "R$",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "bsd",
    "name": "BSD",
    "symbol": "BSD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "bwp",
    "name": "BWP",
    "symbol": "BWP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "byn",
    "name": "BYN",
    "symbol": "BYN",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "bzd",
    "name": "BZD",
    "symbol": "BZD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "cad",
    "name": "Canadian Dollar",
    "symbol": "CA$",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "cdf",
    "name": "CDF",
    "symbol": "CDF",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "chf",
    "name": "Swiss Franc",
    "symbol": "CHF",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "clp",
    "name": "CLP",
    "symbol": "CLP",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": false
  },
  {
    "code": "cny",
    "name": "Chinese Yuan",
    "symbol": "CN¥",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "cop",
    "name": "COP",
    "symbol": "COP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "crc",
    "name": "CRC",
    "symbol": "CRC",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "cve",
    "name": "CVE",
    "symbol": "CVE",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "czk",
    "name": "Czech Koruna",
    "symbol": "CZK",
    "decimals": 2,
    "min_major": 15,
    "amex_supported": true
  },
  {
    "code": "djf",
    "name": "DJF",
    "symbol": "DJF",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": false
  },
  {
    "code": "dkk",
    "name": "Danish Krone",
    "symbol": "kr",
    "decimals": 2,
    "min_major": 2.5,
    "amex_supported": true
  },
  {
    "code": "dop",
    "name": "DOP",
    "symbol": "DOP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "dzd",
    "name": "DZD",
    "symbol": "DZD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "egp",
    "name": "Egyptian Pound",
    "symbol": "E£",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "etb",
    "name": "ETB",
    "symbol": "ETB",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "eur",
    "name": "Euro",
    "symbol": "€",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "fjd",
    "name": "FJD",
    "symbol": "FJD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "fkp",
    "name": "FKP",
    "symbol": "FKP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "gbp",
    "name": "British Pound",
    "symbol": "£",
    "decimals": 2,
    "min_major": 0.3,
    "amex_supported": true
  },
  {
    "code": "gel",
    "name": "GEL",
    "symbol": "GEL",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "gip",
    "name": "GIP",
    "symbol": "GIP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "gmd",
    "name": "GMD",
    "symbol": "GMD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "gnf",
    "name": "GNF",
    "symbol": "GNF",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": false
  },
  {
    "code": "gtq",
    "name": "GTQ",
    "symbol": "GTQ",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "gyd",
    "name": "GYD",
    "symbol": "GYD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "hkd",
    "name": "Hong Kong Dollar",
    "symbol": "HK$",
    "decimals": 2,
    "min_major": 4,
    "amex_supported": true
  },
  {
    "code": "hnl",
    "name": "HNL",
    "symbol": "HNL",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "htg",
    "name": "HTG",
    "symbol": "HTG",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "huf",
    "name": "Hungarian Forint",
    "symbol": "HUF",
    "decimals": 2,
    "min_major": 175,
    "amex_supported": true
  },
  {
    "code": "idr",
    "name": "Indonesian Rupiah",
    "symbol": "Rp",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "ils",
    "name": "Israeli Shekel",
    "symbol": "₪",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "inr",
    "name": "Indian Rupee",
    "symbol": "₹",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "isk",
    "name": "Icelandic Króna",
    "symbol": "ISK",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "jmd",
    "name": "JMD",
    "symbol": "JMD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "jpy",
    "name": "Japanese Yen",
    "symbol": "¥",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "kes",
    "name": "Kenyan Shilling",
    "symbol": "KES",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "kgs",
    "name": "KGS",
    "symbol": "KGS",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "khr",
    "name": "KHR",
    "symbol": "KHR",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "kmf",
    "name": "KMF",
    "symbol": "KMF",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "krw",
    "name": "South Korean Won",
    "symbol": "₩",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "kyd",
    "name": "KYD",
    "symbol": "KYD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "kzt",
    "name": "KZT",
    "symbol": "KZT",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "lak",
    "name": "LAK",
    "symbol": "LAK",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "lbp",
    "name": "LBP",
    "symbol": "LBP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "lkr",
    "name": "Sri Lankan Rupee",
    "symbol": "LKR",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "lrd",
    "name": "LRD",
    "symbol": "LRD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "lsl",
    "name": "LSL",
    "symbol": "LSL",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mad",
    "name": "Moroccan Dirham",
    "symbol": "MAD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mdl",
    "name": "MDL",
    "symbol": "MDL",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mga",
    "name": "MGA",
    "symbol": "MGA",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "mkd",
    "name": "MKD",
    "symbol": "MKD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mmk",
    "name": "MMK",
    "symbol": "MMK",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mnt",
    "name": "MNT",
    "symbol": "MNT",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mop",
    "name": "MOP",
    "symbol": "MOP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mur",
    "name": "MUR",
    "symbol": "MUR",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "mvr",
    "name": "MVR",
    "symbol": "MVR",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mwk",
    "name": "MWK",
    "symbol": "MWK",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "mxn",
    "name": "Mexican Peso",
    "symbol": "MX$",
    "decimals": 2,
    "min_major": 10,
    "amex_supported": true
  },
  {
    "code": "myr",
    "name": "Malaysian Ringgit",
    "symbol": "RM",
    "decimals": 2,
    "min_major": 2,
    "amex_supported": true
  },
  {
    "code": "mzn",
    "name": "MZN",
    "symbol": "MZN",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "nad",
    "name": "NAD",
    "symbol": "NAD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "ngn",
    "name": "Nigerian Naira",
    "symbol": "₦",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "nio",
    "name": "NIO",
    "symbol": "NIO",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "nok",
    "name": "Norwegian Krone",
    "symbol": "kr",
    "decimals": 2,
    "min_major": 3,
    "amex_supported": true
  },
  {
    "code": "npr",
    "name": "NPR",
    "symbol": "NPR",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "nzd",
    "name": "New Zealand Dollar",
    "symbol": "NZ$",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "pab",
    "name": "PAB",
    "symbol": "PAB",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "pen",
    "name": "PEN",
    "symbol": "PEN",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "pgk",
    "name": "PGK",
    "symbol": "PGK",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "php",
    "name": "Philippine Peso",
    "symbol": "₱",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "pkr",
    "name": "Pakistani Rupee",
    "symbol": "PKR",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "pln",
    "name": "Polish Złoty",
    "symbol": "PLN",
    "decimals": 2,
    "min_major": 2,
    "amex_supported": true
  },
  {
    "code": "pyg",
    "name": "PYG",
    "symbol": "PYG",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": false
  },
  {
    "code": "qar",
    "name": "Qatari Riyal",
    "symbol": "QAR",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "ron",
    "name": "Romanian Leu",
    "symbol": "RON",
    "decimals": 2,
    "min_major": 2,
    "amex_supported": true
  },
  {
    "code": "rsd",
    "name": "RSD",
    "symbol": "RSD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "rub",
    "name": "Russian Ruble",
    "symbol": "₽",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "rwf",
    "name": "RWF",
    "symbol": "RWF",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "sar",
    "name": "Saudi Riyal",
    "symbol": "﷼",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "sbd",
    "name": "SBD",
    "symbol": "SBD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "scr",
    "name": "SCR",
    "symbol": "SCR",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "sek",
    "name": "Swedish Krona",
    "symbol": "kr",
    "decimals": 2,
    "min_major": 3,
    "amex_supported": true
  },
  {
    "code": "sgd",
    "name": "Singapore Dollar",
    "symbol": "S$",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "shp",
    "name": "SHP",
    "symbol": "SHP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "sle",
    "name": "SLE",
    "symbol": "SLE",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "sos",
    "name": "SOS",
    "symbol": "SOS",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "srd",
    "name": "SRD",
    "symbol": "SRD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "szl",
    "name": "SZL",
    "symbol": "SZL",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "thb",
    "name": "Thai Baht",
    "symbol": "฿",
    "decimals": 2,
    "min_major": 10,
    "amex_supported": true
  },
  {
    "code": "tjs",
    "name": "TJS",
    "symbol": "TJS",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "top",
    "name": "TOP",
    "symbol": "TOP",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "try",
    "name": "Turkish Lira",
    "symbol": "₺",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "ttd",
    "name": "TTD",
    "symbol": "TTD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "twd",
    "name": "New Taiwan Dollar",
    "symbol": "NT$",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "tzs",
    "name": "TZS",
    "symbol": "TZS",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "uah",
    "name": "Ukrainian Hryvnia",
    "symbol": "₴",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "ugx",
    "name": "UGX",
    "symbol": "UGX",
    "decimals": 2,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "uyu",
    "name": "UYU",
    "symbol": "UYU",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": false
  },
  {
    "code": "uzs",
    "name": "UZS",
    "symbol": "UZS",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "vnd",
    "name": "Vietnamese Dong",
    "symbol": "₫",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "vuv",
    "name": "VUV",
    "symbol": "VUV",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "wst",
    "name": "WST",
    "symbol": "WST",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "xaf",
    "name": "CFA Franc BEAC",
    "symbol": "XAF",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": true
  },
  {
    "code": "xcd",
    "name": "East Caribbean Dollar",
    "symbol": "XCD",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "xcg",
    "name": "XCG",
    "symbol": "XCG",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "xof",
    "name": "CFA Franc BCEAO",
    "symbol": "XOF",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": false
  },
  {
    "code": "xpf",
    "name": "CFP Franc",
    "symbol": "XPF",
    "decimals": 0,
    "min_major": 50,
    "amex_supported": false
  },
  {
    "code": "yer",
    "name": "YER",
    "symbol": "YER",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "zar",
    "name": "South African Rand",
    "symbol": "R",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  },
  {
    "code": "zmw",
    "name": "ZMW",
    "symbol": "ZMW",
    "decimals": 2,
    "min_major": 0.5,
    "amex_supported": true
  }
]);

if (CURRENCIES.length < 130) {
  throw new Error("STRIPE_CURRENCY_REGISTRY_TOO_SHORT_" + CURRENCIES.length);
}

const BY_CODE = Object.freeze(
  Object.fromEntries(CURRENCIES.map((row) => [row.code, row]))
);

function listStripePresentmentCurrencies() {
  return CURRENCIES.map((row) => ({
    ...row,
    zero_decimal: ZERO_DECIMAL.has(row.code),
    special_two_decimal_zero: SPECIAL_TWO_DECIMAL_ZERO.has(row.code),
    stripe_presentment_verified: true,
    settlement_currency: "eur",
    stripe_account_country: "IT",
    source: "https://docs.stripe.com/currencies"
  }));
}

/** @deprecated Use listStripePresentmentCurrencies — kept for call-site compatibility. */
function listStripeCurrencies60() {
  return listStripePresentmentCurrencies();
}

function getCurrencyMeta(code) {
  const key = String(code || "").trim().toLowerCase();
  const row = BY_CODE[key];
  if (!row) return null;
  return {
    ...row,
    zero_decimal: ZERO_DECIMAL.has(row.code),
    special_two_decimal_zero: SPECIAL_TWO_DECIMAL_ZERO.has(row.code),
    stripe_presentment_verified: true,
    settlement_currency: "eur",
    stripe_account_country: "IT",
    source: "https://docs.stripe.com/currencies"
  };
}

function isSupportedCheckoutCurrency(code) {
  return Boolean(getCurrencyMeta(code));
}

function toMinorUnits(amountMajor, code) {
  const meta = getCurrencyMeta(code);
  if (!meta) return { ok: false, error: "unsupported_currency" };
  const major = Number(amountMajor);
  if (!Number.isFinite(major) || major < 0) return { ok: false, error: "invalid_amount" };
  if (SPECIAL_TWO_DECIMAL_ZERO.has(meta.code)) {
    return { ok: true, amount_minor: Math.round(major) * 100, currency: meta.code };
  }
  if (meta.decimals === 0) {
    return { ok: true, amount_minor: Math.round(major), currency: meta.code };
  }
  const factor = 10 ** meta.decimals;
  return { ok: true, amount_minor: Math.round(major * factor), currency: meta.code };
}

function applyBuyerSellerFeesMajor(listMajor) {
  const list = Number(listMajor);
  if (!Number.isFinite(list) || list < 0) return { ok: false, error: "invalid_list_price" };
  const buyerFee = Math.round(list * 0.02 * 100) / 100;
  const sellerFee = Math.round(list * 0.03 * 100) / 100;
  return {
    ok: true,
    list_price: list,
    buyer_fee_rate: 0.02,
    seller_fee_rate: 0.03,
    buyer_pays: Math.round((list + buyerFee) * 100) / 100,
    seller_receives: Math.round((list - sellerFee) * 100) / 100,
    platform_fee: Math.round((buyerFee + sellerFee) * 100) / 100
  };
}

function searchCurrencies(query) {
  const q = String(query || "").trim().toLowerCase();
  const all = listStripePresentmentCurrencies();
  if (!q) return all;
  return all.filter((row) =>
    row.code.includes(q) ||
    row.name.toLowerCase().includes(q) ||
    String(row.symbol || "").toLowerCase().includes(q)
  );
}

module.exports = {
  CURRENCIES,
  CURRENCIES_60: CURRENCIES,
  ZERO_DECIMAL,
  SPECIAL_TWO_DECIMAL_ZERO,
  THREE_DECIMAL,
  listStripePresentmentCurrencies,
  listStripeCurrencies60,
  getCurrencyMeta,
  isSupportedCheckoutCurrency,
  toMinorUnits,
  applyBuyerSellerFeesMajor,
  searchCurrencies,
  PRESENTMENT_COUNT: CURRENCIES.length
};
