/**
 * HAVKAR Jobs UI strings (professional, multilingual).
 * Currency ISO names stay English via notranslate; this file covers Jobs chrome only.
 */
(function (root) {
  "use strict";

  var STRINGS = {
    en: {
      pageTitle: "Jobs",
      heroTitle: "Find the right opportunity",
      heroSub: "Discover jobs, hire professionals and grow your career with HAVKAR.",
      searchPh: "Search jobs, companies, skills...",
      locationPh: "Filter by country or city",
      countryPh: "Country",
      cityPh: "City",
      available: "Available jobs",
      publishTip:
        "Job listings go live after the publishing fee is paid and the transaction is confirmed. HAVKAR connects employers with job seekers.",
      postTitle: "Post a job",
      step1: "Listing details",
      step2: "Choose plan",
      step3: "Review & pay",
      next: "Continue",
      back: "Back",
      saveDraft: "Save draft",
      draftSaved: "Draft saved on this device.",
      companies: "Companies",
      myJobs: "My Jobs",
      payStripe: "Pay with Stripe",
      payXlm: "Pay with XLM",
      pendingPay: "Pending payment",
      required: "Please complete the required fields.",
      signInPost: "Please sign in to your HAVKAR account before posting a job.",
      planBasic: "Basic — €9.99 / 30 days",
      planPro: "Professional — €19.99 / 30 days",
      planBiz: "Business (ordinary) — €39.99 / 30 days",
      planFeat:
        "One-time prepaid public listing for 30 days. Activates only after confirmed payment. No auto-renew.",
      corpTitle: "Verified company subscriptions",
      corpNote:
        "Corporate monthly plans are managed in the Companies panel. Ordinary listings use the prepaid plans below.",
      reviewSummary: "Review your listing",
      feeLabel: "Publishing fee (EUR)",
      salaryCurrencyNote:
        "Salary currency is for display only. The publishing fee is paid in EUR (Stripe) or XLM.",
      all: "All",
      fullTime: "Full-time",
      partTime: "Part-time",
      remote: "Remote",
      freelance: "Freelance",
      contract: "Contract",
      lblTitle: "Job title *",
      lblCompany: "Employer / Company *",
      lblCountry: "Country",
      lblCity: "City",
      lblLocation: "Workplace location *",
      lblType: "Employment type",
      lblSalary: "Salary / Payment",
      lblSkills: "Skills",
      lblDesc: "Job description *",
      lblReq: "Hiring requirements",
      lblApplyUrl: "Application link",
      lblContact: "Contact email or phone",
      payLater: "Pay later",
      payPrepaid: "Pay €{amount} prepaid (30 days)",
      payXlmBtn: "Pay with XLM (prepaid listing)",
      payTitle: "Prepaid listing (30 days)",
      payJob: "Job",
      payCompany: "Company",
      payPlan: "Prepaid plan",
      payFee: "30-day listing fee",
      payPendingNotice: "Your advertisement is pending payment. It activates only after Stripe or XLM confirms the fee on the server.",
      payReceiptTitle: "Payment status",
      payReceiptPending: "Awaiting confirmed payment",
      payReceiptActive: "Payment confirmed — listing active",
      payReceiptCancelled: "Checkout cancelled — listing not activated",
      payReceiptId: "Reference",
      choosePlan: "Please choose a publishing plan.",
      draftFail: "Could not save draft on this device.",
      signInPay: "Please sign in before payment. Your advertisement has NOT been activated.",
      checkoutFail: "Jobs Checkout could not be started. Your advertisement has NOT been activated. No charge was created.",
      checkoutStartFail: "Could not start Jobs Checkout. Your advertisement has NOT been activated. No charge was created.",
      signInXlm: "Sign in before paying with XLM. The job was not activated.",
      xlmSubmitted: "XLM settlement submitted. Refresh My Jobs after confirmation.",
      xlmFail: "XLM payment could not complete. The job was not activated.",
      stripeReturnOk: "Stripe Checkout returned successfully. Your listing activates after Stripe confirms payment. Open My Jobs to refresh status.",
      stripeReturnCancel: "Checkout was cancelled. Your listing stays pending payment and was NOT activated.",
      corpSubOk: "Corporate subscription Checkout returned. Renewals appear after Stripe confirms invoice.paid.",
      corpSubCancel: "Corporate subscription Checkout was cancelled. No auto-renew started.",
      saving: "Saving...",
      continuePay: "Continue to payment",
      companiesTitle: "Companies",
      applicationsTitle: "Applications",
      noApplications: "No applications yet",
      noApplicationsHint: "Applicants will appear here after they apply.",
      ownOnlyEdit: "You can only edit your own job listings.",
      ownOnlyDelete: "You can only delete your own job listings.",
      deleteConfirm: "Delete this job listing? This cannot be undone.",
      titleCompanyRequired: "Job title and company are required.",
      locationRequired: "Select Country and City, or enter a workplace location. Remote jobs may omit a pin.",
      descRequired: "Please provide a more detailed job description (at least 10 characters).",
      toolsMissing: "Jobs tools could not be loaded.",
      saveFail: "The job could not be saved.",
      unpaidGate: "The server has not confirmed that this job stayed unpaid. Do not submit it again. Check My Jobs before posting again.",
      signInMyJobs: "Please sign in to view your jobs.",
      signInCompany: "Please sign in before registering a company.",
      companySubmitted: "Company submitted as unverified. Corporate subscriptions stay blocked until HAVKAR verifies the company. No payment was created.",
      signInCorpQuote: "Please sign in before quoting a corporate plan.",
      selectCorpPlan: "Select Business, Business Plus, or Enterprise first.",
      signInCorpPay: "Please sign in before starting a corporate subscription.",
      companyStatusGuest: "Sign in to load your company verification status.",
      step3Notice: "Your job stays Pending payment until Stripe or XLM confirms the prepaid fee on the server. Duplicate charges are blocked.",
      navHome: "Home",
      navSearch: "Search",
      navSaved: "Saved",
      navMessages: "Messages",
      addImage: "Add an image",
      addImageHint: "Upload a professional image for your advertisement",
      addImageNote: "Recommended: company logo, workplace photo or professional advertisement image.",
      selectCountry: "Select country",
      planTitle: "Choose a 30-day prepaid listing plan",
      openCompanies: "Open Companies panel (verified monthly plans)",
      planNameLabel: "Plan",
      amountLabel: "Amount",
      statusLabel: "Status",
      statusPending: "Pending payment",
      continuePayment: "Continue payment",
      editListing: "Edit listing",
      deleteListing: "Delete listing",
      prepaid30: "prepaid / 30 days",
      statusActive: "Active",
      statusExpired: "Expired",
      statusInactive: "Inactive",
      planFeatBasic: "30-day prepaid public listing after confirmed payment. Standard placement in the Jobs list. No auto-renew.",
      planFeatPro: "30-day prepaid public listing after confirmed payment. Higher placement than Basic (sorted by prepaid fee). No auto-renew.",
      planFeatBiz: "30-day prepaid public listing after confirmed payment. Highest placement among ordinary prepaid plans. No auto-renew.",
      planDiffNote: "All ordinary plans share the same 30-day prepaid activation. The real difference today is the fee tier and list placement order.",
      corpBiz: "Business — €49.99 / month",
      corpPlus: "Business Plus — €99.99 / month",
      corpEnt: "Enterprise — €199.99 / month",
      corpBizFeat: "Verified company. Auto-renew monthly. Up to 10 active job ads.",
      corpPlusFeat: "Verified company. Auto-renew monthly. Up to 30 active job ads.",
      corpEntFeat: "Verified company. Auto-renew monthly. Up to 100 active job ads.",
      corpRegLabel: "Register company legal name",
      corpSubmit: "Submit company for verification",
      corpQuote: "Quote corporate subscription",
      corpStart: "Start corporate Stripe subscription",
      corpVerifyNote: "Corporate plans require a verified company. Self-registration stays unverified until HAVKAR Owner/staff confirms it. Auto-renew is Stripe Subscription only (XLM cannot renew monthly).",
      corpMonthlyTitle: "Verified company — monthly subscription",
      savedJobs: "Saved Jobs",
      resumePay: "Continue payment",
      editJob: "Edit",
      deleteJob: "Delete",
      viewApps: "Applications",
      noJobsFound: "No jobs found",
      noJobsHint: "Try another keyword or change the job filter.",
      jobsCount: "jobs",
      planBasicShort: "Basic",
      planProShort: "Professional",
      planBizShort: "Business",
      noOwnJobs: "You have not posted any jobs yet.",
      noOwnJobsHint: "Create your first advertisement and publish your job opportunity.",
      lblImage: "Advertisement image / Company logo",
      lblSalaryCurrency: "Salary currency (display only)",
      locationNote: "Enter Country, City, and workplace address.",
      phTitle: "Example: Pizza Chef",
      phCompany: "Company name",
      phCity: "City",
      phLocation: "Address or workplace (optional detail)",
      phSalary: "Example: €1,800/month",
      phSkills: "Pizza, Cooking, Italian",
      phDesc: "Describe the job, requirements and conditions...",
      phReq: "Experience, language, or schedule",
      phApplyUrl: "https://example.com/apply",
      phContact: "name@company.com or phone number",
      editJobTitle: "Edit job",
      changeImage: "Change image",
      editNotice: "Editing does not activate an unpaid listing. Payment status, plan, and fee stay unchanged.",
      saveChanges: "Save changes",
      applyOnHavkar: "Apply on HAVKAR",
      fabPost: "Post a job",
      fabCompanies: "Companies",
      fabMyJobs: "My Jobs",

    },
    fa: {
      pageTitle: "کار و استخدام",
      heroTitle: "فرصت شغلی مناسب را پیدا کنید",
      heroSub: "آگهی استخدام، جذب نیرو و رشد حرفه‌ای با هاوکار.",
      searchPh: "جستجوی شغل، شرکت یا مهارت...",
      locationPh: "فیلتر کشور یا شهر",
      countryPh: "کشور",
      cityPh: "شهر",
      available: "آگهی‌های موجود",
      publishTip:
        "انتشار آگهی استخدام پس از پرداخت هزینه و تأیید تراکنش انجام می‌شود. هاوکار بستری برای ارتباط کارفرمایان و کارجویان است.",
      postTitle: "ثبت آگهی استخدام",
      step1: "اطلاعات آگهی",
      step2: "انتخاب تعرفه",
      step3: "بررسی و پرداخت",
      next: "ادامه",
      back: "بازگشت",
      saveDraft: "ذخیره پیش‌نویس",
      draftSaved: "پیش‌نویس روی این دستگاه ذخیره شد.",
      companies: "شرکت‌ها",
      myJobs: "آگهی‌های من",
      payStripe: "پرداخت با Stripe",
      payXlm: "پرداخت با XLM",
      pendingPay: "در انتظار پرداخت",
      required: "لطفاً فیلدهای الزامی را کامل کنید.",
      signInPost: "برای ثبت آگهی ابتدا وارد حساب هاوکار شوید.",
      planBasic: "پایه — ۹٫۹۹ یورو / ۳۰ روز",
      planPro: "حرفه‌ای — ۱۹٫۹۹ یورو / ۳۰ روز",
      planBiz: "تجاری عادی — ۳۹٫۹۹ یورو / ۳۰ روز",
      planFeat:
        "آگهی عمومی ۳۰روزه با پرداخت یک‌باره. فقط پس از تأیید قطعی پرداخت منتشر می‌شود. تمدید خودکار ندارد.",
      corpTitle: "اشتراک شرکت‌های تأییدشده",
      corpNote:
        "تعرفه‌های ماهانه شرکتی در پنل شرکت‌ها مدیریت می‌شوند. آگهی عادی فقط از تعرفه‌های پیش‌پرداخت زیر استفاده می‌کند.",
      reviewSummary: "خلاصه آگهی",
      feeLabel: "هزینه انتشار (یورو)",
      salaryCurrencyNote:
        "ارز حقوق فقط برای نمایش است. هزینه انتشار با یورو (Stripe) یا XLM پرداخت می‌شود.",
      all: "همه",
      fullTime: "تمام‌وقت",
      partTime: "پاره‌وقت",
      remote: "دورکاری",
      freelance: "آزادکاری",
      contract: "قراردادی",
      lblTitle: "عنوان شغل *",
      lblCompany: "نام کارفرما / شرکت *",
      lblCountry: "کشور",
      lblCity: "شهر",
      lblLocation: "محل کار *",
      lblType: "نوع همکاری",
      lblSalary: "حقوق / پرداخت",
      lblSkills: "مهارت‌ها",
      lblDesc: "شرح وظایف *",
      lblReq: "شرایط استخدام",
      lblApplyUrl: "لینک درخواست",
      lblContact: "ایمیل یا تلفن تماس",
      payLater: "پرداخت بعداً",
      payPrepaid: "پرداخت {amount} یورو پیش‌پرداخت (۳۰ روز)",
      payXlmBtn: "پرداخت با XLM (آگهی پیش‌پرداخت)",
      payTitle: "انتشار پیش‌پرداخت (۳۰ روز)",
      payJob: "شغل",
      payCompany: "شرکت",
      payPlan: "تعرفه پیش‌پرداخت",
      payFee: "هزینه آگهی ۳۰روزه",
      payPendingNotice: "آگهی شما در انتظار پرداخت است و فقط پس از تأیید Stripe یا XLM در سرور فعال می‌شود.",
      payReceiptTitle: "وضعیت پرداخت",
      payReceiptPending: "در انتظار تأیید پرداخت",
      payReceiptActive: "پرداخت تأیید شد — آگهی فعال است",
      payReceiptCancelled: "پرداخت لغو شد — آگهی فعال نشده است",
      payReceiptId: "شناسه پیگیری",
      choosePlan: "لطفاً یک تعرفه انتشار انتخاب کنید.",
      draftFail: "ذخیره پیش‌نویس روی این دستگاه ممکن نشد.",
      signInPay: "قبل از پرداخت وارد حساب شوید. آگهی شما فعال نشده است.",
      checkoutFail: "شروع پرداخت ممکن نشد. آگهی فعال نشده و هیچ مبلغی کسر نشده است.",
      checkoutStartFail: "ارتباط با درگاه پرداخت برقرار نشد. آگهی فعال نشده است.",
      signInXlm: "برای پرداخت XLM ابتدا وارد شوید. آگهی فعال نشده است.",
      xlmSubmitted: "تراکنش XLM ثبت شد. پس از تأیید، آگهی‌های من را تازه‌سازی کنید.",
      xlmFail: "پرداخت XLM کامل نشد. آگهی فعال نشده است.",
      stripeReturnOk: "بازگشت از Stripe موفق بود. آگهی پس از تأیید سرور فعال می‌شود. وضعیت را در آگهی‌های من ببینید.",
      stripeReturnCancel: "پرداخت لغو شد. آگهی در انتظار پرداخت مانده و فعال نشده است.",
      corpSubOk: "بازگشت از اشتراک شرکتی ثبت شد. تمدید پس از تأیید invoice.paid در Stripe اعمال می‌شود.",
      corpSubCancel: "پرداخت اشتراک شرکتی لغو شد. تمدید خودکار شروع نشده است.",
      saving: "در حال ذخیره...",
      continuePay: "ادامه به پرداخت",
      companiesTitle: "شرکت‌ها",
      applicationsTitle: "درخواست‌ها",
      noApplications: "هنوز درخواستی ثبت نشده",
      noApplicationsHint: "پس از ارسال درخواست توسط کارجو، اینجا نمایش داده می‌شود.",
      ownOnlyEdit: "فقط آگهی‌های خودتان را می‌توانید ویرایش کنید.",
      ownOnlyDelete: "فقط آگهی‌های خودتان را می‌توانید حذف کنید.",
      deleteConfirm: "این آگهی حذف شود؟ این کار قابل بازگشت نیست.",
      titleCompanyRequired: "عنوان شغل و نام کارفرما الزامی است.",
      locationRequired: "کشور و شهر را انتخاب کنید یا محل کار را وارد کنید. آگهی دورکاری می‌تواند بدون آدرس باشد.",
      descRequired: "شرح وظایف باید حداقل ۱۰ نویسه باشد.",
      toolsMissing: "ابزارهای Jobs بارگذاری نشد.",
      saveFail: "ذخیره آگهی ممکن نشد.",
      unpaidGate: "سرور وضعیت درانتظارپرداخت را تأیید نکرد. دوباره ارسال نکنید؛ ابتدا آگهی‌های من را بررسی کنید.",
      signInMyJobs: "برای دیدن آگهی‌های من وارد شوید.",
      signInCompany: "برای ثبت شرکت ابتدا وارد شوید.",
      companySubmitted: "شرکت به‌صورت تأییدنشده ثبت شد. اشتراک شرکتی تا تأیید مدیریت هاوکار مسدود است. پرداختی ایجاد نشد.",
      signInCorpQuote: "برای استعلام تعرفه شرکتی وارد شوید.",
      selectCorpPlan: "ابتدا یکی از طرح‌های شرکتی را انتخاب کنید.",
      signInCorpPay: "برای شروع اشتراک شرکتی وارد شوید.",
      companyStatusGuest: "برای مشاهده وضعیت تأیید شرکت وارد شوید.",
      step3Notice: "آگهی تا تأیید قطعی پرداخت Stripe یا XLM در سرور، در وضعیت انتظار می‌ماند. پرداخت تکراری مسدود است.",
      navHome: "خانه",
      navSearch: "جستجو",
      navSaved: "ذخیره‌ها",
      navMessages: "پیام‌ها",
      addImage: "افزودن تصویر",
      addImageHint: "یک تصویر حرفه‌ای برای آگهی بارگذاری کنید",
      addImageNote: "پیشنهاد: لوگوی شرکت، عکس محیط کار یا تصویر حرفه‌ای آگهی.",
      selectCountry: "انتخاب کشور",
      planTitle: "انتخاب تعرفه آگهی ۳۰روزه پیش‌پرداخت",
      openCompanies: "باز کردن پنل شرکت‌ها (اشتراک ماهانه تأییدشده)",
      planNameLabel: "تعرفه",
      amountLabel: "مبلغ",
      statusLabel: "وضعیت",
      statusPending: "در انتظار پرداخت",
      continuePayment: "ادامه پرداخت",
      editListing: "ویرایش آگهی",
      deleteListing: "حذف آگهی",
      prepaid30: "پیش‌پرداخت / ۳۰ روز",
      statusActive: "فعال",
      statusExpired: "منقضی",
      statusInactive: "غیرفعال",
      planFeatBasic: "آگهی عمومی ۳۰روزه پس از تأیید پرداخت. جایگاه استاندارد در فهرست. بدون تمدید خودکار.",
      planFeatPro: "آگهی عمومی ۳۰روزه پس از تأیید پرداخت. جایگاه بالاتر از پایه (مرتب‌سازی بر اساس مبلغ پیش‌پرداخت). بدون تمدید خودکار.",
      planFeatBiz: "آگهی عمومی ۳۰روزه پس از تأیید پرداخت. بالاترین جایگاه بین تعرفه‌های عادی پیش‌پرداخت. بدون تمدید خودکار.",
      planDiffNote: "هر سه تعرفه عادی همان فعال‌سازی ۳۰روزه را دارند. تفاوت واقعی فعلاً مبلغ و ترتیب نمایش در فهرست است.",
      corpBiz: "Business — ۴۹٫۹۹ یورو / ماه",
      corpPlus: "Business Plus — ۹۹٫۹۹ یورو / ماه",
      corpEnt: "Enterprise — ۱۹۹٫۹۹ یورو / ماه",
      corpBizFeat: "شرکت تأییدشده. تمدید ماهانه خودکار. حداکثر ۱۰ آگهی فعال.",
      corpPlusFeat: "شرکت تأییدشده. تمدید ماهانه خودکار. حداکثر ۳۰ آگهی فعال.",
      corpEntFeat: "شرکت تأییدشده. تمدید ماهانه خودکار. حداکثر ۱۰۰ آگهی فعال.",
      corpRegLabel: "نام قانونی شرکت",
      corpSubmit: "ارسال شرکت برای تأیید",
      corpQuote: "استعلام اشتراک شرکتی",
      corpStart: "شروع اشتراک Stripe شرکتی",
      corpVerifyNote: "اشتراک شرکتی فقط برای شرکت تأییدشده مجاز است. ثبت اولیه تا تأیید مدیریت هاوکار تأییدنشده می‌ماند. تمدید خودکار فقط با Stripe است (XLM تمدید ماهانه ندارد).",
      corpMonthlyTitle: "شرکت تأییدشده — اشتراک ماهانه",
      savedJobs: "آگهی‌های ذخیره‌شده",
      resumePay: "ادامه پرداخت",
      editJob: "ویرایش",
      deleteJob: "حذف",
      viewApps: "درخواست‌ها",
      noJobsFound: "آگهی‌ای یافت نشد",
      noJobsHint: "کلیدواژه دیگری امتحان کنید یا فیلتر را تغییر دهید.",
      jobsCount: "آگهی",
      planBasicShort: "پایه",
      planProShort: "حرفه‌ای",
      planBizShort: "تجاری",
      noOwnJobs: "هنوز آگهی ثبت نکرده‌اید.",
      noOwnJobsHint: "اولین آگهی استخدام را بسازید و پس از پرداخت منتشر کنید.",
      lblImage: "تصویر آگهی / لوگوی شرکت",
      lblSalaryCurrency: "ارز حقوق (فقط نمایش)",
      locationNote: "کشور، شهر و آدرس محل کار را وارد کنید.",
      phTitle: "مثال: آشپز پیتزا",
      phCompany: "نام شرکت",
      phCity: "شهر",
      phLocation: "آدرس یا محل کار (جزئیات اختیاری)",
      phSalary: "مثال: ۱۸۰۰ یورو در ماه",
      phSkills: "پیتزا، آشپزی، ایتالیایی",
      phDesc: "شرح شغل، شرایط و الزامات را بنویسید...",
      phReq: "سابقه، زبان یا برنامه کاری",
      phApplyUrl: "https://example.com/apply",
      phContact: "ایمیل یا شماره تماس",
      editJobTitle: "ویرایش آگهی",
      changeImage: "تغییر تصویر",
      editNotice: "ویرایش آگهی پرداخت‌نشده را فعال نمی‌کند. وضعیت پرداخت، تعرفه و مبلغ بدون تغییر می‌ماند.",
      saveChanges: "ذخیره تغییرات",
      applyOnHavkar: "درخواست استخدام در هاوکار",
      fabPost: "ثبت آگهی",
      fabCompanies: "شرکت‌ها",
      fabMyJobs: "آگهی‌های من",

    },
    it: {
      pageTitle: "Lavoro",
      heroTitle: "Trova l'opportunità giusta",
      heroSub: "Annunci di lavoro, assunzioni e crescita professionale con HAVKAR.",
      searchPh: "Cerca lavori, aziende, competenze...",
      locationPh: "Filtra per paese o città",
      countryPh: "Paese",
      cityPh: "Città",
      available: "Offerte disponibili",
      publishTip:
        "Le offerte di lavoro vengono pubblicate dopo il pagamento della tariffa e la conferma della transazione. HAVKAR collega datori di lavoro e candidati.",
      postTitle: "Pubblica un'offerta",
      step1: "Dettagli annuncio",
      step2: "Scegli piano",
      step3: "Rivedi e paga",
      next: "Continua",
      back: "Indietro",
      saveDraft: "Salva bozza",
      draftSaved: "Bozza salvata su questo dispositivo.",
      companies: "Aziende",
      myJobs: "I miei annunci",
      payStripe: "Paga con Stripe",
      payXlm: "Paga con XLM",
      pendingPay: "In attesa di pagamento",
      required: "Completa i campi obbligatori.",
      signInPost: "Accedi al tuo account HAVKAR prima di pubblicare.",
      planBasic: "Basic — €9,99 / 30 giorni",
      planPro: "Professional — €19,99 / 30 giorni",
      planBiz: "Business (ordinario) — €39,99 / 30 giorni",
      planFeat:
        "Annuncio pubblico prepagato di 30 giorni. Si attiva solo dopo pagamento confermato. Nessun rinnovo automatico.",
      corpTitle: "Abbonamenti aziendali verificati",
      corpNote:
        "I piani mensili aziendali si gestiscono nel pannello Aziende. Gli annunci ordinari usano i piani prepagati sopra.",
      reviewSummary: "Riepilogo annuncio",
      feeLabel: "Tariffa di pubblicazione (EUR)",
      salaryCurrencyNote:
        "La valuta dello stipendio è solo per visualizzazione. La tariffa si paga in EUR (Stripe) o XLM.",
      all: "Tutti",
      fullTime: "Full-time",
      partTime: "Part-time",
      remote: "Remoto",
      freelance: "Freelance",
      contract: "Contratto"
    },
    ar: {
      pageTitle: "الوظائف",
      heroTitle: "اعثر على الفرصة المناسبة",
      heroSub: "إعلانات التوظيف والتوظيف والنمو المهني مع هافكار.",
      searchPh: "ابحث عن وظائف أو شركات أو مهارات...",
      locationPh: "تصفية حسب الدولة أو المدينة",
      countryPh: "الدولة",
      cityPh: "المدينة",
      available: "الوظائف المتاحة",
      publishTip:
        "يُنشر إعلان التوظيف بعد دفع الرسوم وتأكيد المعاملة. هافكار منصة للتواصل بين أصحاب العمل والباحثين عن عمل.",
      postTitle: "نشر إعلان توظيف",
      step1: "تفاصيل الإعلان",
      step2: "اختيار الخطة",
      step3: "مراجعة والدفع",
      next: "متابعة",
      back: "رجوع",
      saveDraft: "حفظ المسودة",
      draftSaved: "تم حفظ المسودة على هذا الجهاز.",
      companies: "الشركات",
      myJobs: "إعلاناتي",
      payStripe: "الدفع عبر Stripe",
      payXlm: "الدفع عبر XLM",
      pendingPay: "بانتظار الدفع",
      required: "يرجى إكمال الحقول المطلوبة.",
      signInPost: "سجّل الدخول إلى حساب هافكار قبل نشر الإعلان.",
      planBasic: "أساسي — ٩٫٩٩ يورو / ٣٠ يومًا",
      planPro: "احترافي — ١٩٫٩٩ يورو / ٣٠ يومًا",
      planBiz: "تجاري عادي — ٣٩٫٩٩ يورو / ٣٠ يومًا",
      planFeat:
        "إعلان عام مدفوع مسبقًا لمدة ٣٠ يومًا. يُفعَّل فقط بعد تأكيد الدفع. بدون تجديد تلقائي.",
      corpTitle: "اشتراكات الشركات الموثّقة",
      corpNote:
        "تُدار الخطط الشهرية للشركات من لوحة الشركات. الإعلانات العادية تستخدم الخطط المدفوعة مسبقًا أعلاه.",
      reviewSummary: "ملخص الإعلان",
      feeLabel: "رسوم النشر (يورو)",
      salaryCurrencyNote:
        "عملة الراتب للعرض فقط. رسوم النشر تُدفع باليورو (Stripe) أو XLM.",
      all: "الكل",
      fullTime: "دوام كامل",
      partTime: "دوام جزئي",
      remote: "عن بُعد",
      freelance: "عمل حر",
      contract: "تعاقدي"
    },
    sv: {
      pageTitle: "Jobb",
      heroTitle: "Hitta rätt möjlighet",
      heroSub: "Jobbannonser, rekrytering och karriärutveckling med HAVKAR.",
      searchPh: "Sök jobb, företag, kompetenser...",
      locationPh: "Filtrera efter land eller stad",
      countryPh: "Land",
      cityPh: "Stad",
      available: "Tillgängliga jobb",
      publishTip:
        "Jobbannonser publiceras efter att publiceringsavgiften betalats och transaktionen bekräftats. HAVKAR kopplar arbetsgivare till arbetssökande.",
      postTitle: "Publicera jobb",
      step1: "Annonsuppgifter",
      step2: "Välj plan",
      step3: "Granska & betala",
      next: "Fortsätt",
      back: "Tillbaka",
      saveDraft: "Spara utkast",
      draftSaved: "Utkast sparat på den här enheten.",
      companies: "Företag",
      myJobs: "Mina jobb",
      payStripe: "Betala med Stripe",
      payXlm: "Betala med XLM",
      pendingPay: "Väntar på betalning",
      required: "Fyll i obligatoriska fält.",
      signInPost: "Logga in på ditt HAVKAR-konto innan du publicerar.",
      planBasic: "Basic — €9,99 / 30 dagar",
      planPro: "Professional — €19,99 / 30 dagar",
      planBiz: "Business (vanlig) — €39,99 / 30 dagar",
      planFeat:
        "Förbetald offentlig annons i 30 dagar. Aktiveras först efter bekräftad betalning. Ingen automatisk förnyelse.",
      corpTitle: "Verifierade företagsabonnemang",
      corpNote:
        "Månadsplaner för företag hanteras i Företagspanelen. Vanliga annonser använder förbetalda planer ovan.",
      reviewSummary: "Sammanfattning",
      feeLabel: "Publiceringsavgift (EUR)",
      salaryCurrencyNote:
        "Lönevaluta är endast för visning. Publiceringsavgiften betalas i EUR (Stripe) eller XLM.",
      all: "Alla",
      fullTime: "Heltid",
      partTime: "Deltid",
      remote: "Distans",
      freelance: "Frilans",
      contract: "Kontrakt"
    }
  };

  function normalizeLang(raw) {
    var lang = String(raw || "en").toLowerCase();
    if (lang.indexOf("fa") === 0 || lang === "per" || lang === "persian") return "fa";
    if (lang.indexOf("it") === 0) return "it";
    if (lang.indexOf("ar") === 0) return "ar";
    if (lang.indexOf("sv") === 0) return "sv";
    if (lang === "ckb" || lang.indexOf("sorani") !== -1) return "fa";
    if (lang === "ku" || lang.indexOf("kurd") === 0) return "fa";
    return STRINGS[lang] ? lang : "en";
  }

  function currentLang() {
    try {
      if (root.HAVKAR_I18N && typeof root.HAVKAR_I18N.getLanguage === "function") {
        return normalizeLang(root.HAVKAR_I18N.getLanguage());
      }
    } catch (_e) {}
    try {
      return normalizeLang(
        localStorage.getItem("havkar_lang") ||
          localStorage.getItem("havkar-language") ||
          document.documentElement.lang
      );
    } catch (_e2) {
      return "en";
    }
  }

  function t(key) {
    var lang = currentLang();
    var bag = STRINGS[lang] || STRINGS.en;
    if (bag[key] != null) return bag[key];
    return STRINGS.en[key] != null ? STRINGS.en[key] : key;
  }

  function isRtl(lang) {
    lang = normalizeLang(lang || currentLang());
    return lang === "fa" || lang === "ar";
  }

  function applyJobsChrome() {
    var lang = currentLang();
    var rtl = isRtl(lang);
    document.documentElement.lang = lang === "fa" ? "fa" : document.documentElement.lang;
    var map = [
      ["#jobsPageTitle", "pageTitle"],
      [".hero-inner h2", "heroTitle"],
      [".hero-inner > p", "heroSub"],
      ["#searchInput", "searchPh", "placeholder"],
      ["#locationInput", "locationPh", "placeholder"],
      ["#filterCountry", "countryPh", "placeholder"],
      ["#filterCity", "cityPh", "placeholder"],
      [".section-title", "available"],
      ["#jobsPublishTip", "publishTip"],
      ["#postModalTitle", "postTitle"],
      ["#jobsStepLabel1", "step1"],
      ["#jobsStepLabel2", "step2"],
      ["#jobsStepLabel3", "step3"],
      ["#jobsWizardNext", "next"],
      ["#jobsWizardBack", "back"],
      ["#jobsSaveDraftBtn", "saveDraft"],
      ["#navCompaniesLabel", "companies"],
      ["#myJobsTitle", "myJobs"],
      ["#salaryCurrencyNote", "salaryCurrencyNote"],
      ["#jobsCorpNote", "corpNote"],
      ["#jobsReviewTitle", "reviewSummary"],
      ["#jobsFeeLabel", "feeLabel"],
      ["#companiesModalTitle", "companiesTitle"],
      ["#paymentModalTitle", "payTitle"],
      ["#jobsStep3Notice", "step3Notice"],
      ["#jobsPlanTitle", "planTitle"],
      ["#jobsPlanDiffNote", "planDiffNote"],
      ["#jobsOpenCompaniesBtn", "openCompanies"],
      ["#jobsPlanNameLabel", "planNameLabel"],
      ["#jobsAmountLabel", "amountLabel"],
      ["#companyVerificationNote", "corpVerifyNote"],
      ["#jobsCorpMonthlyTitle", "corpMonthlyTitle"],
      ["#jobsCorpSubmitBtn", "corpSubmit"],
      ["#jobsCorpQuoteBtn", "corpQuote"],
      ["#jobsCorpStartBtn", "corpStart"],
      ["#jobsCorpRegLabel", "corpRegLabel"],
      ["#savedJobsTitle", "savedJobs"]
    ];
    map.forEach(function (row) {
      var el = document.querySelector(row[0]);
      if (!el) return;
      var val = t(row[1]);
      if (row[2] === "placeholder") el.setAttribute("placeholder", val);
      else el.textContent = val;
    });
    var filters = {
      All: "all",
      "Full-time": "fullTime",
      "Part-time": "partTime",
      Remote: "remote",
      Freelance: "freelance",
      Contract: "contract"
    };
    Object.keys(filters).forEach(function (code) {
      var btn = document.querySelector('.filter[data-filter="' + code + '"]');
      if (btn) btn.textContent = t(filters[code]);
    });
    ["#planBasicTitle", "#planProTitle", "#planBizTitle"].forEach(function (sel, i) {
      var el = document.querySelector(sel);
      if (!el) return;
      el.textContent = t(i === 0 ? "planBasic" : i === 1 ? "planPro" : "planBiz");
    });
    document.querySelectorAll("[data-jobs-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-jobs-i18n");
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll("[data-jobs-ph]").forEach(function (el) {
      var key = el.getAttribute("data-jobs-ph");
      if (key) el.setAttribute("placeholder", t(key));
    });
    var fabPost = document.querySelector('.fab-main, #jobsFabPost, button.fab');
    var fabC = document.getElementById("fabCompaniesBtn");
    var fabM = document.getElementById("fabMyJobsBtn");
    if (fabC) { fabC.setAttribute("aria-label", t("fabCompanies")); fabC.setAttribute("title", t("fabCompanies")); }
    if (fabM) { fabM.setAttribute("aria-label", t("fabMyJobs")); fabM.setAttribute("title", t("fabMyJobs")); }

    var featMap = { basic: "planFeatBasic", pro: "planFeatPro", biz: "planFeatBiz" };
    document.querySelectorAll("[data-jobs-plan-feat]").forEach(function (el) {
      var k = featMap[el.getAttribute("data-jobs-plan-feat")] || "planFeat";
      el.textContent = t(k);
    });
    var typeLabels = {
      "Full-time": "fullTime",
      "Part-time": "partTime",
      Remote: "remote",
      Freelance: "freelance",
      Contract: "contract"
    };
    ["jobType", "editJobType"].forEach(function (id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      Array.prototype.forEach.call(sel.options || [], function (opt) {
        var key = typeLabels[opt.value];
        if (key) opt.textContent = t(key);
      });
    });
    var countrySel = document.getElementById("jobCountry");
    if (countrySel && countrySel.options && countrySel.options[0] && !countrySel.options[0].value) {
      countrySel.options[0].textContent = t("selectCountry");
    }
    var navMap = [
      ["#navHome span", "navHome"],
      ["#navSearch span", "navSearch"],
      ["#navSaved span", "navSaved"],
      ["#navMessages span", "navMessages"]
    ];
    navMap.forEach(function (row) {
      var el = document.querySelector(row[0]);
      if (el) el.textContent = t(row[1]);
    });
    var box = document.getElementById("postModal");
    if (box) {
      box.dir = rtl ? "rtl" : "ltr";
      box.setAttribute("lang", lang);
    }
    var tip = document.getElementById("jobsPublishTip");
    if (tip) {
      tip.dir = rtl ? "rtl" : "ltr";
      tip.setAttribute("lang", lang);
    }
    var selPlan = document.getElementById("selectedPlanName");
    if (selPlan) {
      var cur = String(selPlan.textContent || "").trim();
      var mapShort = { Basic: "planBasicShort", Professional: "planProShort", Business: "planBizShort",
        "پایه": "planBasicShort", "حرفه‌ای": "planProShort", "تجاری": "planBizShort" };
      var k = mapShort[cur];
      if (k) selPlan.textContent = t(k);
    }
    document.body.classList.toggle("jobs-rtl", rtl);
  }

  function alertT(key, fallback) {
    var msg = t(key);
    if (!msg || msg === key) msg = fallback || key;
    try { window.alert(msg); } catch (_e) {}
  }

  root.HAVKAR_JOBS_I18N = {
    STRINGS: STRINGS,
    t: t,
    alertT: alertT,
    currentLang: currentLang,
    normalizeLang: normalizeLang,
    isRtl: isRtl,
    applyJobsChrome: applyJobsChrome
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
