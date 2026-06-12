# ZPL Template Designer

A visual, browser-based editor for creating Zebra Programming Language (ZPL) label templates. Design labels interactively on a canvas and generate production-ready ZPL code.

## Features

- **9 element types** — Text, Text Block (`^TB`), Field Block (`^FB`), 1D Barcode (Code 128, Code 39, EAN-13, UPC-A), 2D Barcode (QR Code, Data Matrix, PDF417), Box, Line, Circle, Image / Graphic Field (`^GF`)
- **Editor + template gallery** — switch between the visual editor and a curated templates gallery
- **Three preview modes** — Edit canvas, Overlay mode on top of Labelary output, and Labelary Preview mode
- **Canvas interactions** — click to select, drag to move, handle-based resize, arrow-key nudge, and layer cycling
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
Symbology (QR Code `^BQ`, Data Matrix `^BX`, PDF417 `^B7`), position (X, Y), data, placeholder token, reverse print; plus per-symbology settings — QR: magnification, model, error correction (H/Q/M/L); Data Matrix: module size, quality (ECC); PDF417: module width, row height, security level, columns.

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
- Barcode element commands by symbology: `^BC` (Code 128), `^B3` (Code 39), `^BE` (EAN-13), `^BU` (UPC-A), `^BQ` (QR Code), `^BX` (Data Matrix), `^B7` (PDF417)

## Keyboard & Mouse Shortcuts

| Action | Shortcut |
|---|---|
| Cycle elements | `Tab` |
| Cycle reverse | `Shift` + `Tab` |
| Nudge 1px | `Arrow keys` |
| Nudge 10px | `Shift` + `Arrow keys` |
| Delete element | `Del` |
| Copy / Paste | `Ctrl` + `C` / `V` |
| Duplicate element | `Ctrl` + `D` |
| Undo | `Ctrl` + `Z` |
| Redo | `Ctrl` + `Shift+Z` / `Y` |
| Save to Drive | `Ctrl` + `S` |
| Show smart guides | Hold `Ctrl` while dragging / resizing |
| Cancel drag / resize | `Esc` |
| Close history panel (idle) | `Esc` |
| Select element | Click element |
| Open context menu | Right-click canvas |
| Deselect | Click empty area |
| Move element | Drag element |
| Resize element | Drag handles |
| Cycle layers | `Alt` + Click |

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
- `src/elements/QRCodeElement.js` — 2D barcode element (QR Code, Data Matrix, PDF417)
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

The project uses Playwright for end-to-end testing with a dual-project setup optimized for performance and reliability.

### Test Organization

Tests are split into two projects to handle different execution requirements:

- **Core Tests** (~90 tests): Fast, parallel execution
  - Element creation/deletion, property updates, canvas rendering
  - ZPL generation, import/export, visual regression

- **API Integration Tests** (~25 tests): Sequential execution with rate limiting
  - API preview mode, canvas vs API parity testing
  - Respects Labelary API limits (3 requests/second)

### Running Tests

```bash
# Run all tests (both core and API)
npm test

# Run only core tests (fast, parallel)
npm run test:core

# Run only API tests (sequential with rate limiting)
npm run test:api

# Run tests in UI mode
npm run test:ui

# Debug tests
npm run test:debug
```

### Test Files

- Core tests: `*.spec.ts` (run in parallel)
- API tests: `*-api.spec.ts` (run sequentially)

API tests use automatic rate limiting (334ms between calls) to prevent hitting Labelary API limits.

## Tech Stack

- Vanilla JavaScript (ES modules, no framework)
- HTML5 Canvas API
- Tailwind CSS (CDN)
- Labelary API for ZPL preview
- Playwright for E2E testing

## License

ISC
