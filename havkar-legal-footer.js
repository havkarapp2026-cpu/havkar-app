(function () {
  var operator = window.HAVKAR_OPERATOR || {};
  var entity = operator.legalEntityName || "HAVKAR DI JALILNIA AMIR";
  var owner = operator.legalName || "Amir Jalilnia";
  var info = operator.infoEmail || "info@havkar.online";
  var support = operator.supportEmail || "support@havkar.online";
  var registration = String(operator.registrationNumber || "").trim();
  var address = String(operator.registeredAddress || "").trim();
  var partita = String(operator.partitaIva || "").trim();
  var rea = String(operator.reaNumber || "").trim();
  var chamber = operator.chamberRegistrationStatus || "";

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function mount(target) {
    if (!target || target.getAttribute("data-havkar-legal-ready") === "1") {
      return;
    }

    target.setAttribute("data-havkar-legal-ready", "1");
    target.classList.add("havkar-legal-footer");

    if (!document.getElementById("havkar-legal-footer-style")) {
      var style = document.createElement("style");
      style.id = "havkar-legal-footer-style";
      style.textContent =
        ".havkar-legal-footer{margin:24px auto 12px;max-width:920px;padding:14px 16px;border-top:1px solid rgba(20,35,26,.12);font:500 .86rem/1.45 Georgia,'Times New Roman',serif;color:#31453a}" +
        ".havkar-legal-footer strong{font-weight:700}" +
        ".havkar-legal-footer a{color:#1b4332;text-decoration:underline}" +
        ".havkar-legal-footer .muted{color:#5f6f66;font-size:.8rem;margin-top:6px}";
      document.head.appendChild(style);
    }

    var line = el("div", null, null);
    line.appendChild(el("strong", null, entity));
    line.appendChild(document.createTextNode(" · Operator: " + owner));
    target.appendChild(line);

    if (registration) {
      target.appendChild(el("div", null, "Registration number: " + registration));
    }
    if (address) {
      target.appendChild(el("div", null, "Registered address: " + address));
    }
    if (rea) {
      target.appendChild(el("div", null, "REA: " + rea));
    }
    if (partita) {
      target.appendChild(el("div", null, "Partita IVA: " + partita));
    } else {
      target.appendChild(
        el(
          "div",
          "muted",
          "Partita IVA is published only after a verified Visura. Bank account details are never shown on public pages."
        )
      );
    }

    var contacts = el("div", "muted", null);
    var a1 = el("a", null, info);
    a1.href = "mailto:" + info;
    var a2 = el("a", null, support);
    a2.href = "mailto:" + support;
    contacts.appendChild(a1);
    contacts.appendChild(document.createTextNode(" · "));
    contacts.appendChild(a2);
    if (chamber) {
      contacts.appendChild(
        document.createTextNode(" · Legal status: " + String(chamber).replace(/_/g, " "))
      );
    }
    target.appendChild(contacts);
  }

  function boot() {
    var nodes = document.querySelectorAll("[data-havkar-legal-footer]");
    if (!nodes.length) {
      var fallback = document.createElement("div");
      fallback.setAttribute("data-havkar-legal-footer", "");
      (document.querySelector("main") || document.body).appendChild(fallback);
      mount(fallback);
      return;
    }
    Array.prototype.forEach.call(nodes, mount);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
