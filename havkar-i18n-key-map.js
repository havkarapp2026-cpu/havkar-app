/**
 * HAVKAR i18n key map
 * =========================================================
 * data-i18n often uses camelCase keys while offline packs are
 * keyed by English UI phrases. Mapping prevents:
 *  - visible camelCase keys (settingsHubSubtitle)
 *  - machine-stuck words from translating "buySell" literally
 *  - literal translation of the word "tagline"
 * =========================================================
 */
(function (root) {
  "use strict";

  var KEY_TO_ENGLISH = {
    tagline: "Connect • Trade • Work • Help",
    buySell: "Buy & Sell",
    jobs: "Jobs",
    services: "Services",
    wallet: "Wallet",
    tickets: "Tickets",
    accommodation: "Accommodation",
    ads: "Ads",
    delivery: "Delivery",
    events: "Events",
    messengerTitle: "Messenger",
    messengerNav: "Messenger",
    havkarAi: "HAVKAR AI",
    doctorsPharmacies: "Doctors & Pharmacies",
    createAccount: "Create New Account",
    alreadyAccount: "Already have an account?",
    login: "Log In",
    settings: "Settings",
    security: "Security",
    searchSettings: "Search settings",
    settingsHubSubtitle: "Language, support, about, account, and privacy",
    languageAndSmartTranslateHint: "21 languages and translation preferences",
    supportCenterHint: "Help, tickets, and contact support",
    aboutHavkarHint: "Platform, legal pages, and app version",
    hubAccountIdentity: "Account & identity",
    personalInformationHint: "Name, username, and profile photo",
    accountDetails: "Account details",
    accountDetailsHint: "Private account fields (email masked)",
    businessProfile: "Business profile",
    businessProfileHint: "Personal, business, and company profiles",
    hubPersonalize: "Settings & personalization",
    preferencesHint: "Dark mode, location, notifications, and privacy",
    displayCurrency: "Display currency",
    displayCurrencyHint: "133 display currencies + XLM rail status",
    hubMyActivity: "My activity",
    myReviews: "My reviews",
    myReviewsHint: "Reviews you wrote on HAVKAR",
    myListings: "My listings",
    myListingsHint: "Buy & Sell products and ads",
    myTickets: "My tickets & travel",
    myTicketsHint: "Tickets, trips, and travel tools",
    hubFinance: "Finance",
    myWalletHint: "Manage your HAVKAR wallet",
    transactionHistoryHint: "Review your wallet transactions",
    cryptoMarket: "Cryptocurrency market",
    cryptoMarketHint: "View market information",
    hubSecurity: "Security & privacy",
    securityPrivacyHint: "Password reset and privacy controls",
    hubSupportAbout: "Support & about",
    support: "Support",
    supportHint: "Help center and support requests",
    about: "About",
    aboutHint: "About HAVKAR, terms, and privacy",
    hubAdmin: "Exclusive management",
    logOutHint: "Sign out of your account securely",
    notLoggedIn: "Not Logged In",
    loginToViewPrivateSettings:
      "Log in to open wallet, privacy, and private account settings.",
    newConversation: "New conversation",
    voiceCall: "Voice call",
    videoCall: "Video call",
    zeroChats: "0 chats",
    checkingSignIn: "Checking sign-in...",
    noConversationsFound: "No conversations found",
    tryAnotherKeyword: "Try another name or keyword.",
    loadingConversations: "Loading conversations...",
    comingSoon: "Coming soon",
    searchMessages: "Search messages"
  };

  function isCamelCaseKey(key) {
    var s = String(key || "");
    return /^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/.test(s);
  }

  function looksLikeRawKey(value) {
    var s = String(value || "").trim();
    if (!s) return true;
    if (isCamelCaseKey(s)) return true;
    if (/^[a-z]+[A-Z]/.test(s) && !/\s/.test(s)) return true;
    return false;
  }

  /**
   * Stuck MT artifact from translating camelCase tokens or
   * concatenating English words. Single-word natural translations
   * (Accedi, Inloggen, 登录) are NOT stuck.
   */
  function looksStuck(english, translated) {
    var en = String(english || "");
    var tr = String(translated || "");
    if (!en || !tr) return false;
    if (isCamelCaseKey(tr)) return true;
    // Identical text is English UI or an intentional brand (HAVKAR AI), not stuck MT.
    if (tr === en) return false;
    var compactEn = en.replace(/[\s&•·/,]+/g, "").toLowerCase();
    var compactTr = tr.replace(/[\s&•·/,]+/g, "").toLowerCase();
    if (
      /[\s&•·]/.test(en) &&
      compactTr === compactEn
    ) {
      return true;
    }
    var BAD_FA = [
      "خریدفروش",
      "هاوکارآی",
      "پزشکانداروخانهها",
      "پزشکانداروخانه‌ها",
      "شعارتبلیغاتی"
    ];
    var trNorm = tr.replace(/\u200c/g, "");
    for (var i = 0; i < BAD_FA.length; i++) {
      if (trNorm === BAD_FA[i].replace(/\u200c/g, "")) return true;
    }
    return false;
  }

  root.HAVKAR_I18N_KEY_MAP = {
    KEY_TO_ENGLISH: KEY_TO_ENGLISH,
    isCamelCaseKey: isCamelCaseKey,
    looksLikeRawKey: looksLikeRawKey,
    looksStuck: looksStuck,
    resolveEnglish: function (key) {
      var k = String(key || "");
      if (Object.prototype.hasOwnProperty.call(KEY_TO_ENGLISH, k)) {
        return KEY_TO_ENGLISH[k];
      }
      return k;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
