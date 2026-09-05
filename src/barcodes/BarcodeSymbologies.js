import { CODE11_GUARD_START_CHAR, CODE11_GUARD_STOP_CHAR, CODE93_GUARD_CHAR } from '../config/constants.js';
import {
  code11CheckDigits,
  code39CheckChar,
  code93CheckChars,
  interleaved2of5Digits,
  msiCheckDigits,
  normalizeBarcodeData,
  normalizeUpcEanExt,
  plesseyCheckDigits,
} from '../utils/barcodeGeometry.js';
import { code128AutoText, encodeCode128, uccCaseDigits } from './code128Encoder.js';
import { renderFieldDataCommand } from '../utils/zplFieldData.js';

function fieldData(element, value) {
  return renderFieldDataCommand(value, '_', element.fieldHex, element.fieldDataCommand);
}

// ^FD invocation prefix that selects the Code 128 start subset the field was
// imported with (>9 = A, >: = B, >; = C). Subset B is the editor's default.
const CODE128_START_CHAR = { A: '>9', B: '>:', C: '>;' };

function code128StartPrefix(element) {
  return CODE128_START_CHAR[element.code128Subset] || CODE128_START_CHAR.B;
}

/** The ^BC m param in force: 'N', or one of the self-encoding modes 'U' / 'A' / 'D'. */
function code128Mode(element) {
  const mode = element.code128Mode;
  return mode === 'U' || mode === 'A' || mode === 'D' ? mode : 'N';
}

function commonParams(element) {
  return {
    f: element.showText ? 'Y' : 'N',
    o: element.orientation || 'N',
    g: element.printTextAbove ? ',Y' : '',
    gVal: element.printTextAbove ? 'Y' : 'N',
  };
}

class BarcodeSymbology {
  constructor(id) {
    this.id = id;
  }

  renderZpl(element, content) {
    const { f, o, g, gVal } = commonParams(element);
    const mode = code128Mode(element);
    // A mode encodes the data itself, so the field carries no start-subset prefix and
    // the command has to spell out g and e to reach the m parameter.
    if (mode !== 'N') {
      return `^BC${o},${element.height},${f},${gVal},N,${mode}${fieldData(element, content)}`;
    }
    return `^BC${o},${element.height},${f}${g}${fieldData(element, `${code128StartPrefix(element)}${content}`)}`;
  }

  displayText(element, data = '') {
    const mode = code128Mode(element);
    // U prints every digit the field held plus the check digit, even the ones past the
    // 19 the bars carry; A and D print the data as written, parentheses included.
    if (mode === 'U') return uccCaseDigits(data).text;
    if (mode !== 'N') return code128AutoText(data);
    // Invocation codes steer the encoder and never reach the readable line, and
    // characters the active subset cannot carry are not printed at all — both of
    // which only the encoder knows, so the HRI comes from the same pass.
    return encodeCode128(data, element.code128Subset).text;
  }

  forcesHri() {
    return false;
  }

  hasRatio() {
    return false;
  }

  checkDigitControl() {
    return null;
  }

  extraSettings() {
    return '';
  }

  attachProperties(_manager, _element, _attach) {}
}

class CheckDigitBarcodeSymbology extends BarcodeSymbology {
  checkDigitControl() {
    return { label: 'Mod-43 Check Digit' };
  }
}

class Code39Symbology extends CheckDigitBarcodeSymbology {
  hasRatio() { return true; }

  renderZpl(element, content) {
    const { f, o, g } = commonParams(element);
    const e = element.checkDigit ? 'Y' : 'N';
    return `^B3${o},${e},${element.height},${f}${g}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    // The HRI shows what the bars encode, so it reads the same Code 39-folded data.
    const s = normalizeBarcodeData('CODE39', data);
    return `*${s}${element.checkDigit ? code39CheckChar(s) : ''}*`;
  }
}

class Code11Symbology extends CheckDigitBarcodeSymbology {
  hasRatio() { return true; }
  checkDigitControl() { return { label: 'Single Check Digit' }; }

  renderZpl(element, content) {
    const { f, o, g } = commonParams(element);
    const e = element.checkDigit ? 'Y' : 'N';
    return `^B1${o},${e},${element.height},${f}${g}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    return `${CODE11_GUARD_START_CHAR}${data}${code11CheckDigits(data, element.checkDigit)}${CODE11_GUARD_STOP_CHAR}`;
  }
}

class Interleaved2of5Symbology extends CheckDigitBarcodeSymbology {
  hasRatio() { return true; }
  checkDigitControl() { return { label: 'Mod-10 Check Digit' }; }

  renderZpl(element, content) {
    const { f, o, g, gVal } = commonParams(element);
    const tail = element.checkDigit ? `,${gVal},Y` : g;
    return `^B2${o},${element.height},${f}${tail}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    return interleaved2of5Digits(data, element.checkDigit);
  }
}

class PlainBarcodeSymbology extends BarcodeSymbology {
  // Plain o,h,f,g layout. INDUSTRIAL/STANDARD 2 of 5 derive a wide:narrow ratio from
  // ^BY; PLANET/POSTNET are height-modulated postal codes with no ratio (hasRatio false).
  constructor(id, command, hasRatio = true) {
    super(id);
    this.command = command;
    this._hasRatio = hasRatio;
  }

  hasRatio() { return this._hasRatio; }

  renderZpl(element, content) {
    const { f, o, g } = commonParams(element);
    return `${this.command}${o},${element.height},${f}${g}${fieldData(element, content)}`;
  }
}

class UspsPostalSymbology extends PlainBarcodeSymbology {
  // ^B5 Planet / ^BZ POSTNET: the printer drops non-digit ^FD characters from the
  // HRI as well as the bars (Labelary: ^FD12A45 prints "1245"), so the display
  // text is the same digit-stripped data the bars encode (check digit not shown).
  displayText(element, data = '') {
    return normalizeBarcodeData(this.id, data);
  }
}

class MsiSymbology extends BarcodeSymbology {
  hasRatio() { return true; }

  renderZpl(element, content) {
    const { f, o, g, gVal } = commonParams(element);
    const e = element.msiCheckMode || 'B';
    const tail = element.msiCheckInText ? `,${gVal},Y` : g;
    return `^BM${o},${e},${element.height},${f}${tail}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    const digits = normalizeBarcodeData('MSI', data);
    return `${digits}${element.msiCheckInText ? msiCheckDigits(digits, element.msiCheckMode) : ''}`;
  }

  extraSettings(panel, element) {
    return `
      ${panel.createSelectGroup("Check Digit", "prop-msi-check-mode", element.msiCheckMode || "B", [["A", "None"], ["B", "1 x Mod 10"], ["C", "2 x Mod 10"], ["D", "Mod 11 + Mod 10"]])}
      ${panel.createToggleGroup("Show Check Digit in HRI", "prop-msi-check-intext", element.msiCheckInText === true)}
    `;
  }

  attachProperties(manager, _element, attach) {
    attach("prop-msi-check-mode", "msiCheckMode");
    manager._attachToggle("prop-msi-check-intext", _element, "msiCheckInText");
  }
}

class PlesseySymbology extends CheckDigitBarcodeSymbology {
  hasRatio() { return true; }
  checkDigitControl() { return { label: 'Print Check Digit' }; }

  renderZpl(element, content) {
    const { f, o, g } = commonParams(element);
    const e = element.checkDigit ? 'Y' : 'N';
    return `^BP${o},${e},${element.height},${f}${g}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    const normalized = normalizeBarcodeData('PLESSEY', data);
    return `${normalized}${element.checkDigit ? plesseyCheckDigits(normalized) : ''}`;
  }
}

class LogmarsSymbology extends BarcodeSymbology {
  hasRatio() { return true; }
  forcesHri() { return true; }

  renderZpl(element, content) {
    const { o, g } = commonParams(element);
    return `^BL${o},${element.height}${g}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    const up = normalizeBarcodeData('LOGMARS', data);
    return `${up}${code39CheckChar(up)}`;
  }
}

class Code93Symbology extends CheckDigitBarcodeSymbology {
  checkDigitControl() { return { label: 'Print Check Digits' }; }

  renderZpl(element, content) {
    const { f, o, g, gVal } = commonParams(element);
    const tail = element.checkDigit ? `,${gVal},Y` : g;
    return `^BA${o},${element.height},${f}${tail}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    const s = normalizeBarcodeData('CODE93', data);
    const checks = element.checkDigit ? code93CheckChars(s) : '';
    return `${CODE93_GUARD_CHAR}${s}${checks}${CODE93_GUARD_CHAR}`;
  }
}

class CodabarSymbology extends BarcodeSymbology {
  hasRatio() { return true; }

  renderZpl(element, content) {
    const { f, o, g, gVal } = commonParams(element);
    const start = element.startChar || 'A';
    const stop = element.stopChar || 'A';
    const tail = (start !== 'A' || stop !== 'A') ? `,${gVal},${start},${stop}` : g;
    return `^BK${o},N,${element.height},${f}${tail}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    const start = (element.startChar || 'A').toUpperCase();
    const stop = (element.stopChar || 'A').toUpperCase();
    return `${start}${normalizeBarcodeData('CODABAR', data)}${stop}`;
  }

  extraSettings(panel, element) {
    const opts = [["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"]];
    return `<div class="grid grid-cols-2 gap-3">
      ${panel.createSelectGroup("Start Character", "prop-codabar-start", element.startChar || "A", opts)}
      ${panel.createSelectGroup("Stop Character", "prop-codabar-stop", element.stopChar || "A", opts)}
    </div>`;
  }

  attachProperties(_manager, _element, attach) {
    attach("prop-codabar-start", "startChar");
    attach("prop-codabar-stop", "stopChar");
  }
}

class EanUpcSymbology extends BarcodeSymbology {
  constructor(id, command) {
    super(id);
    this.command = command;
  }

  renderZpl(element, content) {
    const { f, o, g } = commonParams(element);
    return `${this.command}${o},${element.height},${f}${g}${fieldData(element, content)}`;
  }
}

class UpcEanExtSymbology extends EanUpcSymbology {
  constructor() {
    super('UPCEANEXT', '^BS');
  }

  renderZpl(element, content) {
    const { f, o, gVal } = commonParams(element);
    return `^BS${o},${element.height},${f},${gVal}${fieldData(element, content)}`;
  }

  displayText(element, data = '') {
    return normalizeUpcEanExt(data);
  }
}

const registry = new Map([
  ['CODE128', new BarcodeSymbology('CODE128')],
  ['CODE39', new Code39Symbology('CODE39')],
  ['CODE93', new Code93Symbology('CODE93')],
  ['CODE11', new Code11Symbology('CODE11')],
  ['CODABAR', new CodabarSymbology('CODABAR')],
  ['INTERLEAVED2OF5', new Interleaved2of5Symbology('INTERLEAVED2OF5')],
  ['INDUSTRIAL2OF5', new PlainBarcodeSymbology('INDUSTRIAL2OF5', '^BI')],
  ['STANDARD2OF5', new PlainBarcodeSymbology('STANDARD2OF5', '^BJ')],
  ['LOGMARS', new LogmarsSymbology('LOGMARS')],
  ['MSI', new MsiSymbology('MSI')],
  ['PLESSEY', new PlesseySymbology('PLESSEY')],
  ['PLANET', new UspsPostalSymbology('PLANET', '^B5', false)],
  ['POSTNET', new UspsPostalSymbology('POSTNET', '^BZ', false)],
  ['EAN13', new EanUpcSymbology('EAN13', '^BE')],
  ['EAN8', new EanUpcSymbology('EAN8', '^B8')],
  ['UPCA', new EanUpcSymbology('UPCA', '^BU')],
  ['UPCE', new EanUpcSymbology('UPCE', '^B9')],
  ['UPCEANEXT', new UpcEanExtSymbology()],
]);

export function getBarcodeSymbology(id) {
  return registry.get(id || 'CODE128') || registry.get('CODE128');
}
