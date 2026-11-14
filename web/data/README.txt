Primeboard color data and display model

Dataset: CIE (2019), Colour-matching functions of CIE 1931 standard
colorimetric observer. International Commission on Illumination, Vienna.
DOI: https://doi.org/10.25039/CIE.DS.xvudnb9b
Source: https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer
Download: https://files.cie.co.at/Publications-datasets/CIE_xyz_1931_2deg.csv
License: Creative Commons Attribution-ShareAlike 4.0 International
https://creativecommons.org/licenses/by-sa/4.0/
The CSV and its metadata are unmodified. The data license is separate
from Primeboard's MIT software license.
SHA-256: fa663e3535a7e0763a745993a1f0a192eb0275ac46ad2d1befd7626841e713c1

The table contains 471 rows: wavelength 360..830 nm at 1 nm intervals,
then x-bar, y-bar, z-bar. Linear interpolation, zero outside the table.

26 keys map the first 26 primes (2..101) onto log-spaced optical
frequencies from c/(700 nm) to c/(400 nm). For zero-based key i:
lambda_i = 700 * (400/700)^(i/25) nm.
The equal-tempered sound mapping is MIDI note 48+i (C3..C#5), A4=440 Hz.

State e_i is an integer 0..32. n = product(p_i^e_i), calculated with BigInt.
Each e_i is integrated relative radiant power at the spectral line,
not a photon count or per-nanometer sample height. The wavelength-domain
spectral measure is S_lambda(lambda) = sum(e_i delta(lambda-lambda_i)).
Its XYZ integral is exactly sum(e_i CMF(lambda_i)), up to tabulation,
linear interpolation, and floating-point arithmetic.
The corresponding frequency-domain delta line has the same integrated
power e_i; no extra c/lambda^2 factor multiplies a line's integrated weight.
For a continuous spectral density, changing variables requires a Jacobian.

XYZ values are relative, with no claim of absolute watts or cd/m^2.
Chromaticity: x = X/(X+Y+Z), y = Y/(X+Y+Z); undefined for no light.
Two different spectra can yield the same XYZ (metamerism); display mapping
can collapse additional differences. Only the integer encoding is injective.

Display only: use the D65 XYZ-to-linear-sRGB matrix in W3C CSS Color 4.
https://www.w3.org/TR/css-color-4/#color-conversion-code
Let r = max(0, M XYZ) componentwise and m = max(r).
For m>0, linear display RGB = r * (1-exp(-exposure*m))/m; otherwise black.
Then apply the standard sRGB encoding transfer function and quantize to 8 bits.
Clipping negative channels changes chromaticity for out-of-gamut colors.
The shared tone scale preserves ratios after clipping and allows brightness
to grow with exponent without hard highlight clipping. This is an artistic,
explicit display transform, not an exact reproduction of monochromatic light.
Key colors normalize single-line XYZ for visibility; mixture XYZ never does.
