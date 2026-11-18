// CIE 1931 2° observer. All mixing happens in unbounded, linear XYZ.
// Display mapping is deliberately separate from the physical spectrum.
export const C = 299792458;
export const RED_NM = 700;
export const VIOLET_NM = 400;
export const MAX_EXPONENT = 32;
export const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41,
  43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101];
export const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const KEYS = [...ROWS.join('')].map((letter, i) => {
  const wavelength = RED_NM * (VIOLET_NM / RED_NM) ** (i / (PRIMES.length - 1));
  const midi = 48 + i;
  return Object.freeze({ index: i, letter, code: `Key${letter}`, prime: PRIMES[i],
    wavelength, frequencyTHz: C / wavelength / 1000,
    audioHz: 440 * 2 ** ((midi - 69) / 12), note: `${NOTES[midi % 12]}${Math.floor(midi / 12) - 1}` });
});

export function parseCMF(csv) {
  const rows = csv.trim().split(/\r?\n/).map(line => line.split(',').map(Number));
  if (rows.length !== 471 || rows.some((row, i) => row.length !== 4 || row[0] !== 360 + i || row.some(v => !Number.isFinite(v) || v < 0))) {
    throw new Error('The CIE data is incomplete or invalid.');
  }
  return rows;
}

export function matchingAt(wavelength, rows) {
  if (!Number.isFinite(wavelength)) throw new RangeError('Wavelength must be finite.');
  if (wavelength < 360 || wavelength > 830) return [0, 0, 0];
  const lower = Math.floor(wavelength) - 360;
  const t = wavelength - Math.floor(wavelength);
  return rows[lower].slice(1).map((v, j) => v + t * ((rows[Math.min(lower + 1, rows.length - 1)][j + 1]) - v));
}

export function validateExponents(exponents, keyCount = KEYS.length) {
  if (exponents.length !== keyCount || exponents.some(e => !Number.isInteger(e) || e < 0 || e > MAX_EXPONENT)) {
    throw new RangeError(`Expected ${keyCount} integer exponents from 0 to ${MAX_EXPONENT}.`);
  }
}

export function spectrumXYZ(exponents, rows) {
  validateExponents(exponents);
  const xyz = [0, 0, 0];
  exponents.forEach((e, i) => {
    if (e) matchingAt(KEYS[i].wavelength, rows).forEach((v, j) => { xyz[j] += e * v; });
  });
  return xyz;
}

export function primeProduct(exponents) {
  validateExponents(exponents);
  return exponents.reduce((n, e, i) => n * BigInt(PRIMES[i]) ** BigInt(e), 1n);
}

export function decodeProduct(input) {
  const value = input.trim();
  // Bounded trial division by our 26 known primes; never factor arbitrary primes.
  if (!/^[1-9][0-9]{0,1599}$/.test(value)) throw new Error('Enter a positive whole number (up to 1,600 digits).');
  let remaining = BigInt(value);
  const exponents = PRIMES.map(p => {
    const prime = BigInt(p);
    let e = 0;
    while (remaining % prime === 0n) {
      remaining /= prime;
      if (++e > MAX_EXPONENT) throw new Error(`This instrument supports exponents up to ${MAX_EXPONENT}.`);
    }
    return e;
  });
  if (remaining !== 1n) throw new Error('This keyboard supports the first 26 primes, from 2 to 101. Your number has a prime factor outside that range.');
  return exponents;
}

// D65 XYZ -> linear sRGB, from W3C CSS Color 4 sample conversions.
export function xyzToLinearRGB([x, y, z]) {
  return [
    (12831 / 3959) * x - (329 / 214) * y - (1974 / 3959) * z,
    -(851781 / 878810) * x + (1648619 / 878810) * y + (36519 / 878810) * z,
    (705 / 12673) * x - (2585 / 12673) * y + (705 / 667) * z,
  ];
}
export function encodeSRGB(v) { return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; }

export function displayColor(xyz, exposure = 1) {
  if (!Number.isFinite(exposure) || exposure < 0 || xyz.some(v => !Number.isFinite(v) || v < 0)) throw new RangeError('Invalid display input.');
  const raw = xyzToLinearRGB(xyz);
  const outOfGamut = raw.some(v => v < -1e-8);
  // Negative channels cannot be emitted by an sRGB screen. Clip these, then
  // apply a single exposure/tone scale, preserving the remaining channel ratios.
  const positive = raw.map(v => Math.max(0, v));
  const peak = Math.max(...positive);
  const scale = peak ? -Math.expm1(-exposure * peak) / peak : 0;
  const linear = positive.map(v => v * scale);
  const rgb = linear.map(v => Math.round(255 * encodeSRGB(v)));
  return { rgb, linear, outOfGamut, css: `rgb(${rgb.join(' ')})`,
    hex: '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() };
}

export function chromaticity([x, y, z]) {
  const sum = x + y + z;
  return sum ? [x / sum, y / sum] : null;
}
