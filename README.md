# ZPL Template Designer

A visual, browser-based editor for creating Zebra Programming Language (ZPL) label templates. Design labels interactively on a canvas and generate production-ready ZPL code.

## Features

- **9 element types** — Text, Text Block (`^TB`), Field Block (`^FB`), 1D Barcode (Code 128, Code 39, EAN-13, UPC-A), 2D Barcode (QR Code, Data Matrix, PDF417, Aztec), Box, Line, Circle, Image / Graphic Field (`^GF`)
- **Editor + template gallery** — switch between the visual editor and a curated templates gallery
- **Three preview modes** — Edit canvas, Overlay mode on top of Labelary output, and Labelary Preview mode
- **Canvas interactions** — click to select, drag to move, handle-based resize, arrow-key nudge, and layer cycling
- **Multi-select** — Shift+Click, marquee drag (touch-select), or `Ctrl+A`; move/delete/duplicate the set, and align or distribute selected elements relative to each other
- **Smart guides** — hold `Ctrl` while dragging or resizing to snap to label edges, centers, and nearby elements
- **Canvas context menu** — right-click for copy, paste, duplicate, reorder, align, lock, and delete actions
- **Undo/redo history** — full history panel with named entries
- **Import/export** — import/export templates as JSON, plus experimental import from raw ZPL
- **Shareable links** — compress the current template into a URL hash for quick sharing
- **Google Drive integration** — connect a Drive folder, open private templates, and save changes back
- **Custom fonts** — register custom ZPL fonts via `^CW` commands
- **Print settings** — orientation, mirror, media tracking (`^MN`, incl. continuous media with `^LL`), darkness, speed, home position, label top, and print quantity controls (`^PQ`)
- **ZPL warnings** — Labelary API linter warnings with element-level attribution
- **Onboarding tour** — built-in guided walkthrough for first-time users

## Getting Started

```bash
git clone https://github.com/IonelScutelnicu/zpl-template-designer.git
cd zpl-template-designer
npm install
npx serve . -l 3000
```

Open http://localhost:3000 — no build step required (vanilla JS + Tailwind CDN).

### Optional Google Drive setup

Google Drive features require Google API credentials. See `src/config/drive-config.js` for the required setup and scopes.

## Testing

```bash
npx playwright test
npm run test:labelary-cache
```

Use `npm run test:labelary-cache` when you want to refresh the committed Labelary response cache. It reruns the Playwright suite, keeps every cache image requested by that successful run, and deletes stale `.png` files from `tests/fixtures/labelary-cache`.

## Element Properties

### Text
Position (X, Y), preview text, placeholder token, font size, font width, font override, orientation, reverse print.

### Text Block
Position (X, Y), preview text, placeholder token, font size, font width, block width, block height, font override, orientation, reverse print.

### Field Block
Position (X, Y), preview text, placeholder token, font size, font width, block width, max lines, line spacing, justification (L/C/R/J), hanging indent, font override, orientation, reverse print.

### 1D Barcode
Symbology (Code 128 `^BC`, Code 39 `^B3`, EAN-13 `^BE`, UPC-A `^BU`), position (X, Y), barcode data, placeholder token, height, width multiplier; ratio + mod-43 check digit (Code 39 only); orientation (N/R/I/B), show interpretation line and print it above the code, reverse print.

### 2D Barcode
Symbology (QR Code `^BQ`, Data Matrix `^BX`, PDF417 `^B7`, Aztec `^B0`), position (X, Y), data, placeholder token, reverse print; plus per-symbology settings — QR: magnification, model, error correction (H/Q/M/L); Data Matrix: module size, quality (ECC); PDF417: module width, row height, security level, columns; Aztec: magnification, symbol type (auto/full/compact/rune), error control %, layers.

On-canvas previews for all symbologies are rendered from the real encoded symbol via bwip-js (see `docs/adr/0005`); Labelary remains the authoritative preview.

### Box
Position (X, Y), width, height, thickness, color (B/W), corner rounding (0–8), reverse print.

### Line
Position (X, Y), length, thickness, orientation (horizontal/vertical), color (B/W), reverse print.

### Circle
Position (X, Y), diameter, thickness, color (B/W), reverse print.

### Image (Graphic Field)
Position (X, Y), width, height, threshold, orientation, encoding format (ASCII hex / Base64), aspect ratio lock, reverse print.

## Views

### Editor

The editor is the main workspace for building templates, previewing generated ZPL, importing/exporting files, and editing label or element properties.

### Templates gallery

The gallery provides:

- curated example templates from `templates/`
- search, sorting, and filters by source, use case, barcode tags, density, and width
- "My templates" integration for private templates stored in Google Drive
- one-click handoff from gallery into the editor

## ZPL Output Format

The application generates ZPL code in the following format:
```
^XA
^PW[width]
^PR[printSpeed],[slewSpeed],[backfeedSpeed]
^PO[orientation]
^PM[mirror]
^MN[mediaTracking]
^LL[labelLength]
~SD[darkness]
^LH[homeX],[homeY]
^LT[labelTop]
^CI28
^MTT
^CW[fontId],[fontFile]
^CF[fontId],[defaultHeight]
[element commands]
^PQ[quantity],[pauseCount],[replicates]
^XZ
```

Where:
- `^XA`/`^XZ` — Start/End of label format
- `^PW` — Print Width
- `^PR` — Print / Slew / Backfeed speeds
- `^PO` — Print Orientation
- `^PM` — Print Mirror
- `^MN` — Media Tracking (omitted when no mode is selected; emitted for web/gap, continuous, mark, or auto)
- `^LL` — Label Length in dots (emitted only for continuous media)
- `~SD` — Media Darkness
- `^LH`/`^LT` — Label Home / Top
- `^CW`/`^CF` — Font Configuration
- `^PQ` — Print Quantity, Pause Count, Replicates
- Element commands are generated by each element's `render()` method
- Barcode element commands by symbology: `^BC` (Code 128), `^B3` (Code 39), `^BE` (EAN-13), `^BU` (UPC-A), `^BQ` (QR Code), `^BX` (Data Matrix), `^B7` (PDF417), `^B0` (Aztec)

## Keyboard & Mouse Shortcuts

Most actions operate on the current selection, which may be one or several elements (see Multi-select).

| Action | Shortcut |
|---|---|
| Select element | Click element |
| Add / remove from selection | `Shift` + Click |
| Marquee select | Drag on empty canvas |
| Extend marquee selection | `Shift` + Drag on empty canvas |
| Select all | `Ctrl` + `A` |
| Deselect | Click empty area |
| Cycle elements (forward / back) | `Tab` / `Shift` + `Tab` |
| Cycle overlapping layers | `Alt` + Click |
| Move selection | Drag element |
| Nudge selection 1px / 10px | `Arrow keys` / `Shift` + `Arrow keys` |
| Resize element (single selection) | Drag handles |
| Show smart guides (single selection) | Hold `Ctrl` while dragging / resizing |
| Copy / Paste selection | `Ctrl` + `C` / `V` |
| Duplicate selection | `Ctrl` + `D` |
| Delete selection | `Del` |
| Undo | `Ctrl` + `Z` |
| Redo | `Ctrl` + `Shift` + `Z` / `Ctrl` + `Y` |
| Open context menu | Right-click canvas |
| Cancel drag / resize | `Esc` |
| Close history panel (idle) | `Esc` |
| Save to Drive | `Ctrl` + `S` |

## Architecture

The application uses a modular architecture for maintainability and testability:

### Core Files
- `index.html` — Main HTML structure and UI layout
- `src/main.js` — Application entry point
- `src/router.js` — View routing between the editor and gallery
- `src/app.js` — Editor orchestration and initialization
- `src/gallery.js` — Gallery view logic and Drive-backed template browsing
- `src/canvas-renderer.js` — Canvas rendering orchestration
- `src/interaction-handler.js` — Canvas interaction and drag/drop logic

### Element Definitions
- `src/elements/TextElement.js` — Text element with font overrides, placeholders, and orientation support
- `src/elements/TextBlockElement.js` — `^TB` text block element
- `src/elements/FieldBlockElement.js` — `^FB` multi-line text with wrapping and justification
- `src/elements/BarcodeElement.js` — 1D barcode element (Code 128, Code 39, EAN-13, UPC-A)
- `src/elements/QRCodeElement.js` — 2D barcode element (QR Code, Data Matrix, PDF417, Aztec)
- `src/elements/BoxElement.js` — Rectangular box/border element
- `src/elements/LineElement.js` — Horizontal/vertical line element
- `src/elements/CircleElement.js` — Circle element with diameter and thickness
- `src/elements/GraphicFieldElement.js` — Image/graphic field element (`^GF`/`^GFA`)

### State Management
- `src/state/AppState.js` — Centralized observable state store
  - Elements collection and selection
  - Label settings configuration
  - History management (undo/redo)
  - Event subscription system

### Services (Business Logic)
- `src/services/ElementService.js` — Element CRUD operations
- `src/services/AlignmentService.js` — Element alignment calculations
- `src/services/SerializationService.js` — JSON serialization/deserialization
- `src/services/ZPLGenerator.js` — ZPL code generation
- `src/services/ZPLParser.js` — Experimental import from raw ZPL into editable app state
- `src/services/TemplateManager.js` — JSON import/export file operations
- `src/services/UrlShareService.js` — Shareable URL generation and decoding
- `src/services/SmartGuideService.js` — Alignment guide detection and snapping
- `src/services/DriveTemplateService.js` — Drive-backed create/load/update/trash operations

### UI Components
- `src/ui/PropertiesPanelRenderer.js` — Property form rendering for all element types
- `src/ui/ElementsListRenderer.js` — Elements list sidebar rendering
- `src/ui/PropertyListenersManager.js` — Property change event handling
- `src/ui/HistoryPanel.js` — History panel UI and navigation
- `src/ui/CustomFontsManager.js` — Custom font management UI
- `src/ui/ContextMenu.js` — Canvas context menu actions
- `src/ui/WarningsPanelRenderer.js` — ZPL warning rendering and attribution
- `src/ui/OnboardingWalkthrough.js` — Guided first-run tour

### Specialized Renderers
- `src/rendering/TextRenderer.js` — Text element canvas rendering
- `src/rendering/TextBlockRenderer.js` — `^TB` text block rendering
- `src/rendering/FieldBlockRenderer.js` — `^FB` field block rendering
- `src/rendering/BarcodeRenderer.js` — 1D barcode canvas rendering (bwip-js geometry)
- `src/rendering/QRCodeRenderer.js` — 2D barcode canvas rendering (bwip-js geometry)
- `src/rendering/barcodeRender.js` — Shared barcode draw helpers (linear/matrix/placeholder)
- `src/rendering/BoxRenderer.js` — Box/rectangle with rounded corners
- `src/rendering/LineRenderer.js` — Line rendering (horizontal/vertical)
- `src/rendering/CircleRenderer.js` — Circle rendering
- `src/rendering/GraphicFieldRenderer.js` — Image/graphic field rendering
- `src/rendering/GalleryThumbnailRenderer.js` — Thumbnail generation for the gallery

### Utilities
- `src/config/constants.js` — ZPL fonts and configuration
- `src/config/drive-config.js` — Drive feature configuration
- `src/utils/geometry.js` — Geometry helper functions
- `src/utils/barcodeGeometry.js` — bwip-js-backed barcode geometry, symbology maps, defaults
- `src/vendor/bwip-js.mjs`, `src/vendor/bwipp.mjs` — vendored bwip-js (barcode encoder)
- `src/utils/graphicField.js` — Bitmap encoding, rotation, and image conversion utilities
- `templates/index.js` — Registry for curated gallery templates

### Design Principles

- **Single Responsibility** — Each module has one clear purpose
- **Separation of Concerns** — UI, business logic, and rendering are separated
- **Observable State** — Central state management with event subscriptions
- **Dependency Injection** — Services receive dependencies via constructor
- **Strategy Pattern** — Specialized renderers for each element type

## Testing

The project uses Playwright for end-to-end testing. All specs run under a single `chromium` project in parallel (`fullyParallel`).

### Running Tests

```bash
# Run all tests
npx playwright test

# Run a single spec
npx playwright test tests/e2e/canvas.spec.ts

# Run tests by title
npx playwright test -g "fragment of test name"

# Run tests in UI mode
npm run test:ui

# Debug tests
npm run test:debug
```

### Test Files

- All specs are `*.spec.ts` under `tests/e2e/` and run in parallel.
- The `*-api.spec.ts` naming (e.g. `preview-api.spec.ts`) is a historical convention from tests that hit the Labelary API; they no longer run in a separate project.

> `npm run test:core` and `npm run test:api` are stale scripts in `package.json` that reference Playwright projects which no longer exist — they fail with "Project not found". Run `npx playwright test` directly instead.

## Tech Stack

- Vanilla JavaScript (ES modules, no framework)
- HTML5 Canvas API
- Tailwind CSS (CDN)
- Labelary API for ZPL preview
- Playwright for E2E testing

## License

ISC
