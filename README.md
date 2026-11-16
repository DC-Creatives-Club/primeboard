# Primeboard

A playable keyboard of prime numbers, spectral light, and sine tones.
Public app: **https://primeboard.jacksonwalters.com**.

The browser app is static HTML, CSS, and JavaScript, with no runtime packages,
accounts, telemetry, external assets, or backend. The CIE table is bundled locally.
The former `synesthesiaer` Python CLI is retired and its legacy files removed.
This repository no longer builds or publishes a Python package.
Existing PyPI releases have not been deleted or changed.

## Run

With Node.js 22 or newer:

```sh
npm run dev       # http://127.0.0.1:5173
npm test          # color, input, audio, song, and surface-mode checks
npm run build    # deployable static files in dist/web/
```

No dependency installation is necessary. Any static HTTP server can serve `web/`
directly. ES modules and the local CSV fetch require HTTP, rather than `file://`.

## Play

- **Eigenmodes** preserves the 2D square-plate visualization: Colored nodes,
  Vibration strength, and Moving field. Its original presets, freeze control,
  note labels, and optional Prime encoding are available in this view. See the
  [square-plate model](web/modes.txt) for its basis and musical retuning.
- **Rounded cube** displays a rounded thin metal surface, with one computed surface
  eigenmode per prime. Drag the cube to turn it, or focus it and use arrow keys.
  **Inspect a mode** loads a single pattern with Sustain on. Chords combine
  patterns; bright lines trace their zeros. **Pause motion**, **Reset view**, and
  **Save image** support inspection and PNG export. **Light** restores the
  original display. Reduced-motion preferences start the animation paused.
- **Classical library**, below the keyboard and settings, offers ten public-domain
  themes and excerpts: *Ode to Joy*, *Für Elise*, *Minuet in G*, *Eine kleine
  Nachtmusik*, Bach's *Prelude in C major*, *Gymnopédie No. 1*, *Brahms’ Lullaby*,
  Chopin's *Prelude in A major*, *Old French Song*, and Mozart's *Ah! vous
  dirai-je, maman* theme. These are short arrangements for the 26-key instrument.
  **Play song** synchronizes key highlights, colors, exact integers, and audio.
  Pause/resume, restart, stop, and three speeds are available. Selecting a song
  stops playback and resets its position while preserving the selected speed;
  press Play to start it. Playing a key or loading a number/preset takes over;
  leaving the window pauses the song. Lead/upper parts use weight 2 and supporting
  parts use weight 1; long song notes keep fixed weights. The hold-intensity
  control continues to apply to live keys. See
  [music provenance and arrangement notes](web/music/README.txt).
- Type QWERTY letters, click keys, or touch multiple keys. Drag across the keys to play.
- Every press starts at exponent 1. Holding increases it at a configurable interval
  (default 500 ms, independent of OS key repeat), up to 32.
- Toggle **Sustain** (or press Space outside controls) to retain released notes.
  Pressing a sustained key again adds 1 to its exponent.
- **Clear** or Escape resets the mixture. Leaving the window or hiding the page
  also clears it, preventing stuck sound and unnoticed background accumulation.
- **Sound** is off initially. Enable it to play sine tones, C3 through C♯5,
  using browser Web Audio. Each tone's amplitude is proportional to the square
  root of its exponent, so holding a key increases its power. Chords are summed
  before a shared output compressor and soft limiter; master volume is bounded.
- Try a preset or enter a positive integer whose prime factors are among the
  first 26 primes (2 through 101). The integer and exponents are exact `BigInt` values.
- **Screen exposure** changes only the preview. It does not change the number,
  spectral power, XYZ, or sound.

Physical letter positions use `KeyboardEvent.code`, with QWERTY labels. Click the
keyboard or Enable sound to give it focus. Letter keys continue to work after
adjusting sliders; typing in the number field remains normal text entry. Some
physical keyboards limit simultaneous keys; pointer input and sustain also work.

## The model

For zero-based key index `i = 0..25`, assign prime `p_i` and wavelength
`lambda_i = 700 * (400/700)^(i/25)` nm. This makes optical frequencies `c/lambda_i`
logarithmically spaced from red to violet. This is a useful slice of the visible
spectrum, not a claim that human vision ends exactly at 400 and 700 nm.

The state consists of integer exponents `e_i` from 0 to 32:

```text
n = product(p_i ^ e_i)
S_lambda(lambda) = sum(e_i * delta(lambda - lambda_i))
(X, Y, Z) = sum(e_i * (x_bar(lambda_i), y_bar(lambda_i), z_bar(lambda_i)))
```

An exponent is relative integrated radiant power, not photon count. A delta line's
integrated weight is unchanged by switching from wavelength to frequency; a
continuous spectral density would require the appropriate Jacobian. Mixing does
not create a new frequency, average wavelengths, or mix gamma-encoded RGB.

Unique prime factorization is a lossless encoding of this finite spectral state.
Multiplying encoded numbers adds spectral weights (where the resulting weights
fit the instrument's limit). Squaring a number doubles XYZ and preserves
chromaticity. Different spectra can share the same XYZ (metamerism), so the final
color is not a unique encoding of the integer.

Official [CIE 1931 2° data](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer)
is sampled at 1 nm and linearly interpolated. The app exposes unmodified relative
luminance Y and chromaticity x,y; hover the luminance readout for full XYZ.

### Screen limitations

XYZ is converted to linear sRGB using the D65 matrix from
[W3C CSS Color 4](https://www.w3.org/TR/css-color-4/#color-conversion-code).
Pure spectral light usually lies outside the sRGB gamut. Negative channels are
clipped, then a shared exposure scale compresses brightness:

```text
r = max(0, M * XYZ)       # componentwise
m = max(r)
display_linear = r * (1 - exp(-exposure * m)) / m  # black when m = 0
```

Apply the standard sRGB transfer function last. This explicit preview transform
does not claim exact screen reproduction of spectral light. The numeric XYZ
stays untouched; the screen glow is decorative, and the displayed hex value is
the computed color. Keycap colors are normalized for visibility.

Equal radiant power is not equal perceived brightness. Deep red and violet may
look dim. Full spectrum is a sum of 26 equal-power lines, not a calibrated D65
illuminant or a promise of white.

### Sound from the same exponents

Each prime also maps to a fixed audible frequency, `440 * 2^((48+i-69)/12)` Hz.
The positive-frequency power spectrum is proportional to
`sum(e_i * delta(f - f_i))`. The corresponding steady-state signal is
`s(t) = A0 * sum(sqrt(e_i) * sin(2*pi*f_i*t + phase_i))`, with `A0 = 0.18`.
Distinct tones add; a sine's average power is its squared amplitude divided by
two. Multiplying numbers adds spectral power weights. It does not mean adding
two phase-coherent copies of the same sine at full amplitude.

Adding a note leaves the other oscillators' target gains unchanged. Smooth
attack/release envelopes prevent clicks. After the linear sum, a compressor
and a final soft limiter bound loud chords before master volume. This output
processing, like the color preview's tone mapping, can change the delivered
spectrum when engaged; the encoded powers and raw sine mixture stay separate.

### Rounded metal surface

The geometry joins planar faces, cylindrical edges, and spherical corners:
the boundary of `[-0.7,0.7]^3 + B_0.3`. An offline cotangent FEM solve supplies
26 nonconstant Laplace–Beltrami eigenfunctions on a welded closed surface.
The browser mixes this basis using a scalar surface-biharmonic bending
approximation: `rho h u_tt + D Delta_S^2 u = 0`. Its modal frequencies are
proportional to the Laplace–Beltrami eigenvalues, and displacement weights
`sqrt(e_i) lambda_1/lambda_i` make modal energy proportional to each exponent.

This is a simplified thin-metal interpretation, not full curved-shell elasticity:
stretching, tangential motion, curvature coupling, supports, and physical material
calibration are absent. Visual frequencies are slowed; audio keeps its existing
equal-tempered tuning. Single modes show stationary nodal lines; mixtures show
moving zero contours, not simulated sand. See [model and reproduction notes](web/data/modes/README.txt).

Regeneration optionally requires Python with `scripts/requirements-modes.txt`;
run `python scripts/solve_modes.py --check` in that environment. The shipped data
has passed mesh refinement (maximum eigenvalue change 0.64%) and an analytical
sphere check (0.71% maximum error). Normal development and deployment use the
bundled data and need only Node.js.

## Deployment

Use the existing `application_server` SSH host. See [deployment instructions](deploy/README.md).
The app needs one DNS A record and an Nginx static host with HTTPS; no app service,
database, process manager, or Python environment is needed.

## Layout

- `web/color.js`: pure spectral math, exact integer encoding, display conversion.
- `web/instrument.js`: source-aware input ownership, holds, sustain, reset.
- `web/audio.js`: persistent Web Audio voices, attack/release, bounded output.
- `web/app.js`: keyboard, pointer, accessibility, graph, and UI integration.
- `web/song.js`: ten-song library, spectra, and audio-clock transport.
- `web/modes.js`: decoding and energy-weighted mixing of surface modes.
- `web/plate-modes.js`, `web/plate-display.js`: square-plate basis and all three 2D readouts.
- `web/cube-view.js`: WebGL2 rendering, rotation, motion, and PNG export.
- `scripts/solve_modes.py`: rounded geometry, FEM eigenproblem, and numerical checks.
- `web/music/catalog.js`: bundled note events, generated offline; no runtime MIDI parser.
- `music-sources/`: original public-domain score/MIDI downloads and arrangement manifest.
- `scripts/import-music.mjs`: dependency-free, offline score importer; regenerate with
  `node scripts/import-music.mjs`. Tests verify source checksums and generated data.
- `web/data/`: official CIE data, metadata, attribution, and detailed model notes.
- `tests/`: Node's built-in test runner; no test dependencies.

Software: MIT. CIE data: **CC BY-SA 4.0**, separately attributed in the app and
[`web/data/README.txt`](web/data/README.txt). The CSV is unmodified and its published
SHA-256 checksum is checked by the tests.
