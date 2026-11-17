/**
 * HAVKAR Support knowledge base for all 15 Home tiles.
 * English source content; UI chrome may be localized via havkar-ui-i18n21.
 * Does not invent SLAs, guarantees, or unauthorized live features.
 */
(function (root) {
  "use strict";

  var TILES = [
    {
      id: "buy-sell",
      name: "Buy & Sell",
      href: "buy-sell.html",
      summary: "Marketplace for products and goods with seller messaging and optional checkout.",
      who: "Buyers and sellers with a HAVKAR account.",
      start: "Open Buy & Sell, browse Explore, or publish a listing from your account.",
      create: "Create a listing with photos (and one product video up to 60 seconds where supported).",
      search: "Use search, category, country/city and price filters.",
      maps: "Map panel is available; pins appear only when a listing has real coordinates.",
      payments: "Authorized card/XLM checkout only where rails are armed. Buyer fee 2%, seller fee 3%. Listings are free to publish.",
      cancel: "Follow the listing or order cancellation/refund flow shown for that transaction.",
      safety: "Never pay outside HAVKAR for verified checkout. Report fraud from the listing or Support.",
      faq: [
        ["Are Buy & Sell ads the same as the Ads tile?", "No. Buy & Sell listings stay separate from the Ads marketplace with no automatic cross-posting."],
        ["Can I upload a video?", "Where enabled, one product video up to 60 seconds is supported with secure processing."]
      ]
    },
    {
      id: "jobs",
      name: "Jobs",
      href: "jobs.html",
      summary: "Employers post jobs; applicants apply with profiles and CVs.",
      who: "Employers, companies and job seekers.",
      start: "Open Jobs, filter by country/city/remote, or post a job when signed in.",
      create: "Employers create/edit jobs with expiry. Ordinary listings are paid once for 30 days without automatic renewal.",
      search: "Search by keyword, location, category and remote/on-site.",
      maps: "Map panel supports location-based jobs when coordinates exist. Remote jobs must not show misleading pins.",
      payments: "Company subscriptions and listing fees use authorized payment rails only.",
      cancel: "Employers can close or expire listings; applicants can withdraw applications where offered.",
      safety: "Verify employers carefully. HAVKAR moderates reports.",
      faq: [
        ["Do job listings auto-renew?", "No. Ordinary listings are one-time for 30 days unless a corporate subscription plan applies."]
      ]
    },
    {
      id: "services",
      name: "Services",
      href: "services.html",
      summary: "Service marketplace connecting customers and providers.",
      who: "Customers and service providers.",
      start: "Browse categories, search by country/city, or register as a provider.",
      create: "Providers publish services with availability; customers send requests/bookings.",
      search: "Category, location and keyword filters with map/list discovery.",
      maps: "Map/list discovery is wired; pins and clustering appear when service coordinates exist.",
      payments: "Online payments use authorized rails. Cash services track commission receivables without unauthorized automatic collection. Provider commission 10%.",
      cancel: "Use the request cancellation controls and provider dashboard statuses.",
      safety: "Credentials where required; messaging stays inside HAVKAR.",
      faq: [
        ["What is the provider commission?", "Approved provider commission is 10%."]
      ]
    },
    {
      id: "wallet",
      name: "Wallet",
      href: "wallet.html",
      summary: "Balances, history and authorized Stellar XLM payments.",
      who: "Signed-in HAVKAR users.",
      start: "Open Wallet to view balances and transaction history.",
      create: "Connect an authorized wallet rail; never share private keys.",
      search: "Filter transaction history by status when available.",
      maps: "Not applicable.",
      payments: "XLM is a separate rail from fiat display. Fiat card collection follows Owner-armed Stripe settings. Unsupported networks stay off.",
      cancel: "Refunds follow the original payment rail rules.",
      safety: "HAVKAR never displays private keys. Treat unexpected balance changes as urgent Support cases.",
      faq: [
        ["Why is adding money marked coming soon?", "Some fiat top-up paths remain paused until Owner-authorized collection paths are available."]
      ]
    },
    {
      id: "tickets",
      name: "Tickets",
      href: "tickets.html",
      summary: "Event tickets inside HAVKAR plus travel partner panels.",
      who: "Event organizers, attendees and travelers.",
      start: "Open Tickets for Events, Flights, Trains, Buses, Ferries, Taxi/Transfer or Hotels panels.",
      create: "Organizers create events/tickets where authorized; QR and check-in use HAVKAR ticket security.",
      search: "Search events and partner travel modes according to available panels.",
      maps: "Events integrate maps; travel partners may open external maps.",
      payments: "Event ticket charging follows authorized rails. Omio direct API stays gated; affiliate tracked links may open Omio when configured.",
      cancel: "Refund eligibility depends on the event or partner rules shown at purchase.",
      safety: "QR validation prevents duplicate entry where implemented.",
      faq: [
        ["Is Omio live booking inside HAVKAR?", "Direct Omio API booking stays blocked until partner API credentials and Owner flags exist. Affiliate search/booking links may be available separately."]
      ]
    },
    {
      id: "accommodation",
      name: "Accommodation",
      href: "accommodation.html",
      summary: "Hotels and stays discovery with advanced maps.",
      who: "Travelers and accommodation providers.",
      start: "Search destination, dates and guests; switch map/list views.",
      create: "Providers manage stays through accommodation management tools when authorized.",
      search: "Filters, search-this-area, clustering and GPS.",
      maps: "Advanced mapping with pins, clusters, bounds search and directions.",
      payments: "Live partner booking only when contractually authorized. Unauthorized booking stays disabled.",
      cancel: "Cancellation terms come from the property/partner confirmation.",
      safety: "No fabricated availability or prices.",
      faq: [
        ["Why can’t I complete a hotel booking?", "Live booking remains gated until partner authorization and Owner flags allow it."]
      ]
    },
    {
      id: "ads",
      name: "Ads",
      href: "ads.html",
      summary: "Advertising campaigns separate from Buy & Sell listings.",
      who: "Advertisers and viewers.",
      start: "Open Ads to browse or create campaigns when signed in.",
      create: "Create campaigns with media, dates, budgets and geo targeting.",
      search: "Category, country and city filters for campaigns.",
      maps: "Country/city/radius geo fields are supported in campaign forms. Full interactive map targeting ships when coordinates infrastructure is complete.",
      payments: "Billing only on authorized rails. Impressions/clicks are not fabricated.",
      cancel: "Pause or end campaigns from advertiser tools.",
      safety: "Moderation and reporting apply to ad content.",
      faq: [
        ["Can Ads auto-post to Buy & Sell?", "No. Ads and Buy & Sell remain separate."]
      ]
    },
    {
      id: "delivery",
      name: "Delivery",
      href: "delivery.html",
      summary: "Delivery requests, driver workspace and status lifecycle.",
      who: "Customers and approved drivers.",
      start: "Request Delivery with pickup and destination addresses.",
      create: "Submit a request; drivers progress pending → accepted → picked_up → in_transit → delivered (or cancelled).",
      search: "Active and recent deliveries inside Delivery (not Wallet history).",
      maps: "GPS, address search, route preview and distance where maps are wired.",
      payments: "Paid dispatch only with commercial authorization. Estimates are not fabricated.",
      cancel: "Customers can cancel according to Delivery rules; history remains available.",
      safety: "No fake live driver positions.",
      faq: [
        ["Is Delivery history the same as Wallet history?", "No. Delivery history belongs to the Delivery experience."]
      ]
    },
    {
      id: "events",
      name: "Events",
      href: "events.html",
      summary: "Create and discover events with tickets and maps.",
      who: "Organizers and attendees.",
      start: "Browse events or create an event when signed in.",
      create: "Set venue, date/time, capacity and ticket options.",
      search: "Search, filters, map pins, clustering and search-this-area.",
      maps: "Full event map toolkit with routing/directions.",
      payments: "Ticket checkout uses authorized payment modules.",
      cancel: "Organizer cancellation and ticket refund rules apply per event.",
      safety: "Moderation tools for reported events.",
      faq: [
        ["Do Events and Tickets stay connected?", "Yes. Event ticket flows and Tickets panels share consistent confirmation rules."]
      ]
    },
    {
      id: "chat",
      name: "Chat",
      href: "chat.html",
      summary: "HAVKAR internal messaging between users.",
      who: "Signed-in users.",
      start: "Open Chat to view conversations and send messages.",
      create: "Start or continue one-to-one conversations; attach images/files where enabled.",
      search: "Conversation list search where offered.",
      maps: "Not applicable.",
      payments: "Chat does not process payments.",
      cancel: "Block/report users from conversation tools.",
      safety: "Abuse reporting and authentication required. This is not the future standalone Messenger app.",
      faq: [
        ["Is this the standalone HAVKAR Messenger?", "No. This tile is the existing in-app communication system only."]
      ]
    },
    {
      id: "languages",
      name: "Languages",
      href: "language.html",
      summary: "Choose among 21 HAVKAR interface languages.",
      who: "All users.",
      start: "Open Languages and select a language. Preference persists.",
      create: "Not applicable.",
      search: "Language list includes Sorani (ckb) and Kurmanji (kmr) separately.",
      maps: "Not applicable.",
      payments: "Not applicable.",
      cancel: "Switch language anytime.",
      safety: "RTL applies for fa, ar, ckb, ur.",
      faq: [
        ["Are Sorani and Kurmanji the same?", "No. They are preserved as distinct languages."]
      ]
    },
    {
      id: "health",
      name: "Doctors & Pharmacies",
      href: "health.html",
      summary: "Health directory across 27 categories with provider onboarding.",
      who: "Patients (free platform fee) and licensed providers.",
      start: "Browse categories, search providers, request in-person or message appointments.",
      create: "Providers apply, upload evidence, wait for Owner license review.",
      search: "Category, country/city and map filters.",
      maps: "GPS maps for provider discovery.",
      payments: "Health live billing stays OFF until Owner pricing activation. Patients stay free under current policy.",
      cancel: "Appointment updates through provider/patient tools.",
      safety: "Voice/video telehealth stays publicly gated until clinical checklist is verified. No fake providers.",
      faq: [
        ["Can I start a video consult now?", "Public clinical voice/video remains blocked until contracts, licensing, privacy safeguards and Owner authorization are verified."]
      ]
    },
    {
      id: "support",
      name: "Support",
      href: "support.html",
      summary: "Official help center, FAQs, tickets and company contacts.",
      who: "Everyone.",
      start: "Search help topics or send a support request.",
      create: "Submit a support ticket and track status with your reference.",
      search: "Searchable FAQs and tile guides.",
      maps: "Not applicable.",
      payments: "Support does not charge users to open a ticket.",
      cancel: "Follow up via track-request or email.",
      safety: "info@ and support@ are public. soran@ is confidential Owner-only for investment/ownership talks. Admin/Staff must not access SORAN mail.",
      faq: [
        ["Which email do I use?", "General: info@havkar.online. Support: support@havkar.online. Confidential ownership/investment: soran@havkar.online (Owner only)."]
      ]
    },
    {
      id: "havkar-ai",
      name: "HAVKAR AI",
      href: "havkar-ai.html",
      summary: "AI assistant for planning, writing and guided workflows.",
      who: "Signed-in users within free/paid plan limits.",
      start: "Open HAVKAR AI and start a conversation.",
      create: "Ask for business plans, copy, layouts concepts, campaign drafts and multilingual writing.",
      search: "Conversation history is available in your account history.",
      maps: "Map-assisted suggestions use real geocoding when available; coordinates are never fabricated.",
      payments: "Paid plans and logo generation require verified payment/subscription. Logo usable output is not free. Entitlements are enforced server-side.",
      cancel: "Stop generation on-device; provider may finish already-sent requests.",
      safety: "Conceptual drawings are not certified architecture. Rate limits and abuse controls apply.",
      faq: [
        ["Are free logos available?", "No. Usable logo generation requires verified payment or an active authorized subscription."]
      ]
    },
    {
      id: "about",
      name: "About HAVKAR",
      href: "about.html",
      summary: "Company information, mission and legal disclosures.",
      who: "Everyone.",
      start: "Open About for platform overview and legal entity details.",
      create: "Not applicable.",
      search: "Not applicable.",
      maps: "Not applicable.",
      payments: "Not applicable.",
      cancel: "Not applicable.",
      safety: "Legal entity HAVKAR DI JALILNIA AMIR. Operator Amir Jalilnia. Personal Owner login email is never shown as a public contact.",
      faq: [
        ["Where is company registration shown?", "On About / legal pages — not as a large Home side panel."]
      ]
    }
  ];

  root.HAVKAR_HELP_KB = {
    tiles: TILES,
    company: {
      legalEntityName: "HAVKAR DI JALILNIA AMIR",
      operator: "Amir Jalilnia",
      infoEmail: "info@havkar.online",
      supportEmail: "support@havkar.online",
      soranEmail: "soran@havkar.online",
      registrationNumber: "KR234170",
      reaNumber: "KR-234170",
      registeredAddress: "Francesco Antonio Lucifero 40, 88900 Crotone, Italy",
      partitaIvaPublished: false,
      partitaIvaNote:
        "Partita IVA remains unpublished on public pages until a verified Visura confirms it."
    },
    byId: function (id) {
      return TILES.find(function (t) {
        return t.id === id;
      }) || null;
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
