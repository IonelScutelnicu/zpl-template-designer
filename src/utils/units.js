// Measurement unit conversion helpers

export const MM_PER_INCH = 25.4;

export function mmToInch(mm) {
  return mm / MM_PER_INCH;
}

export function inchToMm(inches) {
  return inches * MM_PER_INCH;
}
