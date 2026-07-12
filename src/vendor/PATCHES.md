# Local patches to vendored bwip-js

These files (`bwip-js.mjs`, `bwipp.mjs`) are vendored from
[bwip-js](https://github.com/metafloor/bwip-js) **v4.11.2 (2026-07-01)** and are
imported directly at runtime. They carry a small number of deliberate local
modifications listed below.

**If you re-vendor / upgrade bwip-js, re-apply each patch and re-run the barcode
tests.** Each patch is marked with a `PATCHED` comment at the edit site and is
guarded by a regression test that fails if the patch is missing.

---

## 1. Micro-PDF417 numeric compaction for all-digit data

- **File:** `bwipp.mjs`, function `bwipp_micropdf417` (source ref `//#24379`)
- **Change:** in the numeric-compaction test
  `(($_.n == $_.msglen) && ($_.n >= 8))`, the threshold `8` is lowered to `1`.
- **Why:** Zebra's `^BF` (and Labelary) encode an all-digit field with **numeric
  compaction** regardless of length. Stock bwip-js only switches to numeric for a
  whole-message digit run of length ≥ 8 (otherwise text compaction), so short
  all-digit data (e.g. `12345`) produced a different bar pattern than the printer /
  Labelary — and 7 all-digit characters even overflowed the 1-column variant.
  Lowering the threshold makes any all-digit field use numeric compaction, matching
  Zebra exactly (verified against Labelary: 0 module differences for `1`, `12345`,
  `1234567`, `12345678`, and `ABCDE` is unaffected).
- **Scope:** only affects fully-numeric Micro-PDF417 fields of length 1–7 (length ≥ 8
  already used numeric). Mixed/alpha data is unchanged. The sibling `bwipp_pdf417`
  (`^B7`, source ref `//#22971`) has the same heuristic but is intentionally **not**
  patched — `^B7` was not validated against Labelary for short all-digit data.
- **Guard test:** `tests/e2e/barcode-symbology.spec.ts` →
  "Micro-PDF417 uses numeric compaction for all-digit data (vendor patch guard)".

---

## 2. Planet / POSTNET accept any digit count (≥ 1)

- **File:** `bwipp.mjs`, functions `bwipp_postnet` (source ref `//#16094`) and
  `bwipp_planet` (source ref `//#16276`)
- **Change:** the length validation `barlen != 5/9/11` (POSTNET) and
  `barlen != 11/13` (Planet) is relaxed to `barlen < 1` at both edit sites; the
  error message text is updated to match.
- **Why:** Zebra's `^BZ`/`^B5` (and Labelary) render a symbol for **any** number
  of digits — the encoder appends the mod-10 check digit and frame bars
  regardless of length (verified on Labelary: `^B5` with 1, 5, 7, and 20 digits
  all render; e.g. 5 digits → 32 bars = frame + (5 data + 1 check) × 5 + frame).
  Stock bwip-js enforces the USPS spec lengths and throws, so the canvas fell
  back to a placeholder box while the Labelary preview showed real bars. The
  encoder bodies are already length-generic; only the validation gates changed.
  (Non-digit `^FD` characters are stripped before bwip-js is called — see
  `normalizeBarcodeData` — matching Labelary, which drops them from bars and HRI.)
- **Scope:** only `postnet` and `planet` symbols with non-USPS lengths (previously
  a hard encode error). Spec-length data produces byte-identical geometry.
- **Guard test:** `tests/e2e/barcode-symbology.spec.ts` →
  "Planet Code / POSTNET render any digit count like Labelary (vendor patch guard)".
