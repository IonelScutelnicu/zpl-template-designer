# Local patches to vendored bwip-js

These files (`bwip-js.mjs`, `bwipp.mjs`) are vendored from
[bwip-js](https://github.com/metafloor/bwip-js) **v4.11.1 (2026-05-28)** and are
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
