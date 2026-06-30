import { CODE11_GUARD_START_CHAR, CODE11_GUARD_STOP_CHAR, CODE93_GUARD_CHAR } from '../config/constants.js';
import {
  code11CheckDigits,
  code39CheckChar,
  code93CheckChars,
  interleaved2of5Digits,
  msiCheckDigits,
  normalizeUpcEanExt,
  plesseyCheckDigits,
} from '../utils/barcodeGeometry.js';
import { renderFieldDataCommand } from '../utils/zplFieldData.js';

function fieldData(element, value, preservePlaceholders) {
  return renderFieldDataCommand(value, '_', element.fieldHex, { preservePlaceholders });
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

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g } = commonParams(element);
    return `^BC${o},${element.height},${f}${g}${fieldData(element, `>:${content}`, preservePlaceholders)}`;
  }

  displayText(element) {
    return element.previewData || '';
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

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g } = commonParams(element);
    const e = element.checkDigit ? 'Y' : 'N';
    return `^B3${o},${e},${element.height},${f}${g}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    const data = element.previewData || '';
    return `*${data}${element.checkDigit ? code39CheckChar(data) : ''}*`;
  }
}

class Code11Symbology extends CheckDigitBarcodeSymbology {
  hasRatio() { return true; }
  checkDigitControl() { return { label: 'Single Check Digit' }; }

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g } = commonParams(element);
    const e = element.checkDigit ? 'Y' : 'N';
    return `^B1${o},${e},${element.height},${f}${g}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    const data = element.previewData || '';
    return `${CODE11_GUARD_START_CHAR}${data}${code11CheckDigits(data, element.checkDigit)}${CODE11_GUARD_STOP_CHAR}`;
  }
}

class Interleaved2of5Symbology extends CheckDigitBarcodeSymbology {
  hasRatio() { return true; }
  checkDigitControl() { return { label: 'Mod-10 Check Digit' }; }

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g, gVal } = commonParams(element);
    const tail = element.checkDigit ? `,${gVal},Y` : g;
    return `^B2${o},${element.height},${f}${tail}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    return interleaved2of5Digits(element.previewData || '', element.checkDigit);
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

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g } = commonParams(element);
    return `${this.command}${o},${element.height},${f}${g}${fieldData(element, content, preservePlaceholders)}`;
  }
}

class MsiSymbology extends BarcodeSymbology {
  hasRatio() { return true; }

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g, gVal } = commonParams(element);
    const e = element.msiCheckMode || 'B';
    const tail = element.msiCheckInText ? `,${gVal},Y` : g;
    return `^BM${o},${e},${element.height},${f}${tail}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    const data = element.previewData || '';
    return `${data}${element.msiCheckInText ? msiCheckDigits(data, element.msiCheckMode) : ''}`;
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

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g } = commonParams(element);
    const e = element.checkDigit ? 'Y' : 'N';
    return `^BP${o},${e},${element.height},${f}${g}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    const data = element.previewData || '';
    return `${data}${element.checkDigit ? plesseyCheckDigits(data) : ''}`;
  }
}

class LogmarsSymbology extends BarcodeSymbology {
  hasRatio() { return true; }
  forcesHri() { return true; }

  renderZpl(element, content, preservePlaceholders) {
    const { o, g } = commonParams(element);
    return `^BL${o},${element.height}${g}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    const up = (element.previewData || '').toUpperCase();
    return `${up}${code39CheckChar(up)}`;
  }
}

class Code93Symbology extends CheckDigitBarcodeSymbology {
  checkDigitControl() { return { label: 'Print Check Digits' }; }

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g, gVal } = commonParams(element);
    const tail = element.checkDigit ? `,${gVal},Y` : g;
    return `^BA${o},${element.height},${f}${tail}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    const data = element.previewData || '';
    const checks = element.checkDigit ? code93CheckChars(data) : '';
    return `${CODE93_GUARD_CHAR}${data}${checks}${CODE93_GUARD_CHAR}`;
  }
}

class CodabarSymbology extends BarcodeSymbology {
  hasRatio() { return true; }

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g, gVal } = commonParams(element);
    const start = element.startChar || 'A';
    const stop = element.stopChar || 'A';
    const tail = (start !== 'A' || stop !== 'A') ? `,${gVal},${start},${stop}` : g;
    return `^BK${o},N,${element.height},${f}${tail}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    const start = (element.startChar || 'A').toUpperCase();
    const stop = (element.stopChar || 'A').toUpperCase();
    return `${start}${element.previewData || ''}${stop}`;
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

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, g } = commonParams(element);
    return `${this.command}${o},${element.height},${f}${g}${fieldData(element, content, preservePlaceholders)}`;
  }
}

class UpcEanExtSymbology extends EanUpcSymbology {
  constructor() {
    super('UPCEANEXT', '^BS');
  }

  renderZpl(element, content, preservePlaceholders) {
    const { f, o, gVal } = commonParams(element);
    return `^BS${o},${element.height},${f},${gVal}${fieldData(element, content, preservePlaceholders)}`;
  }

  displayText(element) {
    return normalizeUpcEanExt(element.previewData || '');
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
  ['PLANET', new PlainBarcodeSymbology('PLANET', '^B5', false)],
  ['POSTNET', new PlainBarcodeSymbology('POSTNET', '^BZ', false)],
  ['EAN13', new EanUpcSymbology('EAN13', '^BE')],
  ['EAN8', new EanUpcSymbology('EAN8', '^B8')],
  ['UPCA', new EanUpcSymbology('UPCA', '^BU')],
  ['UPCE', new EanUpcSymbology('UPCE', '^B9')],
  ['UPCEANEXT', new UpcEanExtSymbology()],
]);

export function getBarcodeSymbology(id) {
  return registry.get(id || 'CODE128') || registry.get('CODE128');
}
