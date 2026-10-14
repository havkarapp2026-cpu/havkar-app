(function havkarApplySafeArea() {
  function measureSafeTop() {
    if (typeof window.__HAVKAR_SAFE_TOP_TEST === "number") {
      return window.__HAVKAR_SAFE_TOP_TEST;
    }
    var probe = document.createElement("div");
    probe.setAttribute("data-havkar-safe-probe", "1");
    probe.style.cssText = "position:fixed;top:0;left:0;height:env(safe-area-inset-top,0px);width:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none;";
    document.documentElement.appendChild(probe);
    var safeTop = probe.getBoundingClientRect().height;
    probe.remove();
    return safeTop;
  }

  function paddingTop(style) {
    var value = parseFloat(style.paddingTop);
    return isNaN(value) ? 0 : value;
  }

  function expandBox(el, style, safeTop) {
    if (style.boxSizing !== "border-box") return;
    var minHeight = parseFloat(style.minHeight);
    if (!isNaN(minHeight) && style.minHeight !== "0px" && style.minHeight !== "auto") {
      el.style.minHeight = (minHeight + safeTop) + "px";
      return;
    }
    var height = parseFloat(style.height);
    if (!isNaN(height)) {
      el.style.height = (height + safeTop) + "px";
    }
  }

  function apply() {
    if (!document.body) return;
    var safeTop = measureSafeTop();
    if (!(safeTop > 1)) return;

    var handled = false;
    var nodes = document.body.querySelectorAll("*");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var style = getComputedStyle(el);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      if (style.top !== "0px") continue;
      var rect = el.getBoundingClientRect();
      if (rect.top > 1 || rect.height < 1) continue;
      if (style.position === "fixed" && rect.height >= window.innerHeight - 1) continue;
      handled = true;
      if (el.getAttribute("data-havkar-safe-top") === "1") continue;
      el.setAttribute("data-havkar-safe-top", "1");
      var pad = paddingTop(style);
      if (pad + 0.5 >= safeTop) continue;
      el.style.paddingTop = (pad + safeTop) + "px";
      expandBox(el, style, safeTop);
    }

    if (handled) return;

    var first = document.body.firstElementChild;
    var className = first && typeof first.className === "string" ? first.className : "";
    if (first && (first.tagName === "HEADER" || className.indexOf("header") !== -1)) {
      if (first.getAttribute("data-havkar-safe-top") === "1") return;
      var headerStyle = getComputedStyle(first);
      var headerPad = paddingTop(headerStyle);
      first.setAttribute("data-havkar-safe-top", "1");
      if (headerPad + 0.5 >= safeTop) return;
      first.style.paddingTop = (headerPad + safeTop) + "px";
      return;
    }

    if (document.body.getAttribute("data-havkar-safe-top") === "1") return;
    var bodyPad = paddingTop(getComputedStyle(document.body));
    document.body.setAttribute("data-havkar-safe-top", "1");
    if (bodyPad + 0.5 >= safeTop) return;
    document.body.style.paddingTop = (bodyPad + safeTop) + "px";
  }

  function schedule() {
    if (document.readyState === "complete") {
      requestAnimationFrame(apply);
      return;
    }
    window.addEventListener("load", function () {
      requestAnimationFrame(apply);
    }, { once: true });
  }

  schedule();
})();
