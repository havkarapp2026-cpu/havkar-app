#!/usr/bin/env python3
"""Regenerate havkar-health-i18n.js for all 21 selectable LANGUAGE_REGISTRY codes."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LANGS = [
    "en", "it", "de", "fr", "es", "pt", "nl", "sv", "pl", "id",
    "zh", "ja", "ko", "hi", "ru", "ckb", "kmr", "tr", "ar", "fa", "ur",
]


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def obj_block(d: dict) -> str:
    parts = []
    for lang in LANGS:
        parts.append(f'{lang}: "{esc(d.get(lang) or d.get("en") or "")}"')
    return "{ " + ", ".join(parts) + " }"


# Import category/group dictionaries from companion data module inline for maintainability.
from health_i18n21_data import CATEGORIES, GROUPS, UI_CORE  # type: ignore


def main() -> None:
    src = (ROOT / "havkar-health-i18n.js").read_text(encoding="utf-8")
    ui_maps: dict[str, dict[str, str]] = {}
    for m in re.finditer(r'"([^"]+)":\s*\{(.*?)\n\s*\}', src, re.S):
        key = m.group(1)
        if not key.startswith("health.") and not key.startswith("lang."):
            continue
        block = m.group(2)
        langs = {
            lm.group(1): lm.group(2)
            for lm in re.finditer(r'(\w+):\s*"((?:\\.|[^"\\])*)"', block)
        }
        ui_maps[key] = langs

    final_ui: dict[str, dict[str, str]] = {}
    all_keys = sorted(set(ui_maps) | set(UI_CORE))
    for key in all_keys:
        entry: dict[str, str] = {}
        existing = ui_maps.get(key, {})
        core = UI_CORE.get(key, {})
        en_val = existing.get("en") or core.get("en") or key
        for lang in LANGS:
            entry[lang] = (
                existing.get(lang)
                or core.get(lang)
                or (en_val if lang == "en" else core.get("en") or en_val)
            )
        final_ui[key] = entry

    # Force curated category-independent keys from UI_CORE for new langs
    for key, core in UI_CORE.items():
        base = final_ui.get(key, {})
        for lang in LANGS:
            if lang in core:
                base[lang] = core[lang]
            elif lang not in base:
                base[lang] = core.get("en") or key
        final_ui[key] = base

    runtime = r'''
  function lang() {
    try {
      var code = String(localStorage.getItem("havkar_language") || localStorage.getItem("selectedLanguage") || localStorage.getItem("language") || "en").trim().toLowerCase();
      if (code === "ku") return "kmr";
      if (code === "ckb-iq" || code === "ckb_iq") return "ckb";
      if (SELECTABLE.indexOf(code) === -1) return "en";
      return code || "en";
    } catch (_e) { return "en"; }
  }
  function pick(map, code) { if (!map) return ""; return map[code] || map.en || ""; }
  function t(key, vars) {
    var code = lang();
    var entry = UI[key];
    var text = entry ? pick(entry, code) : key;
    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach(function (k) { text = text.split("{" + k + "}").join(String(vars[k])); });
    }
    return text;
  }
  function categoryLabel(id, fallback) { var entry = CATEGORIES[id]; if (entry) return pick(entry, lang()); return fallback || id || ""; }
  function groupLabel(id, fallback) { var entry = GROUPS[id]; if (entry) return pick(entry, lang()); return fallback || id || ""; }
  function categoryDescription(id) {
    var label = categoryLabel(id, id);
    return String(t("health.category_desc")).split("{label}").join(label);
  }
  function applyDir() {
    var code = lang();
    var dir = RTL[code] ? "rtl" : "ltr";
    try {
      document.documentElement.lang = code === "kmr" ? "ku" : code;
      document.documentElement.dir = dir;
      document.documentElement.setAttribute("dir", dir);
      localStorage.setItem("havkar_language_dir", dir);
    } catch (_e) {}
  }
  function apply(root) {
    applyDir();
    var scope = root && root.nodeType === 1 ? root : document.body;
    if (!scope) return;
    scope.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n"); if (!key) return;
      var translated = t(key); if (translated && translated !== key) el.textContent = translated;
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder"); if (!key) return;
      var translated = t(key); if (translated && translated !== key) el.setAttribute("placeholder", translated);
    });
    scope.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria"); if (!key) return;
      var translated = t(key); if (translated && translated !== key) el.setAttribute("aria-label", translated);
    });
  }
  root.HAVKAR_HEALTH_I18N = {
    t: t, lang: lang, apply: apply, applyDir: applyDir,
    categoryLabel: categoryLabel, groupLabel: groupLabel, categoryDescription: categoryDescription,
    categories: CATEGORIES, groups: GROUPS, ui: UI, rtl: RTL, selectable: SELECTABLE
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { apply(document.body); });
  else apply(document.body);
})(typeof globalThis !== "undefined" ? globalThis : this);
'''

    lines = [
        "/**",
        " * Key-based Health UI localization for HAVKAR.",
        " * Covers all 21 selectable LANGUAGE_REGISTRY codes.",
        " * RTL: fa, ckb, ar, ur. LTR includes kmr.",
        " */",
        '(function (root) {',
        '  "use strict";',
        "  var RTL = { fa: 1, ar: 1, ckb: 1, ur: 1 };",
        f"  var SELECTABLE = {json.dumps(LANGS)};",
        "  var CATEGORIES = {",
    ]
    for cid, d in CATEGORIES.items():
        lines.append(f"    {cid}: {obj_block(d)},")
    lines.append("  };")
    lines.append("  var GROUPS = {")
    for gid, d in GROUPS.items():
        lines.append(f"    {gid}: {obj_block(d)},")
    lines.append("  };")
    lines.append("  var UI = {")
    for key, d in sorted(final_ui.items()):
        lines.append(f'    "{key}": {obj_block(d)},')
    lines.append("  };")
    lines.append(runtime)

    out = ROOT / "havkar-health-i18n.js"
    out.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", out, "bytes", out.stat().st_size, "ui", len(final_ui), "cats", len(CATEGORIES))
    assert all(lang in CATEGORIES["gp"] for lang in LANGS)
    assert all(lang in final_ui["health.title"] for lang in LANGS)
    print("OK")


if __name__ == "__main__":
    main()
