# Primeboard desktop

The desktop app bundles the same instrument, model data, music, and documentation
as the website with Electron. It runs offline and does not need a local server,
Node.js, Python, or a browser installation. Links to outside references open in
the system browser.

## Downloads and installation

Download an installer from the [Primeboard download page](https://primeboard.jacksonwalters.com/download.html)
or the [public release](https://github.com/jacksonwalters/primeboard/releases/tag/v0.1.0).
No GitHub account is needed. Choose the package for your computer:

| Computer | Download | Installation |
| --- | --- | --- |
| Mac with Apple silicon | macOS arm64 `.dmg` | Open the image and drag Primeboard into Applications. |
| Mac with Intel processor | macOS x64 `.dmg` | Open the image and drag Primeboard into Applications. |
| Windows PC | Windows x64 `Setup.exe` | Run the installer; it installs for the current user. |
| Raspberry Pi 5 with 64-bit Raspberry Pi OS | Linux arm64 `.deb` | Install the package, then launch Primeboard from the applications menu. |
| Debian or Ubuntu PC | Linux x64 `.deb` | Install the package, then launch Primeboard from the applications menu. |
| Fedora / RPM-based Linux | Matching architecture `.rpm` | Install with the system package manager. |

ZIP bundles are also produced for every target. Extract the entire archive;
run `Primeboard.app` on Mac, `Primeboard.exe` on Windows, or `Primeboard` on Linux.
Keep the accompanying runtime files with the executable. Linux packages are the
preferred installation route because the package manager resolves dependencies.
For a downloaded Debian package, `sudo apt install ./Primeboard-0.1.0-Linux-arm64.deb`
installs the Pi build (use the actual downloaded filename).

These initial builds are unsigned and not notarized. macOS Gatekeeper and Windows
SmartScreen may require the user to approve the first launch. The Mac bundles
have Electron's required ad-hoc signature; this is not a verified publisher
signature. Do not disable OS security globally. Public distribution should add
an Apple Developer ID and notarization, and Windows code signing. Releases do not
auto-update yet; installing a newer version retains the app's local data.

Release downloads are permanent GitHub Release assets, with a `SHA256SUMS.txt`
file for integrity checks. The **Desktop builds** workflow builds and tests each
platform on its native OS. Its temporary CI artifacts are staging outputs, not
the public download links. Publish the completed installers as a versioned
release before deploying a download page that points to that version.

### Versioning

The current desktop preview is **v0.1.0**. While Primeboard is in initial
development, use patch releases such as `0.1.1` for fixes and minor releases
such as `0.2.0` for feature updates. Version `1.0` is reserved for a future
stable release; signing and store distribution are separate decisions.

`package.json` is the app version used by the native packagers. For each release,
update it and the root version entries in `package-lock.json`, then update the
version and asset links in `web/download.html` and this document. Rebuild all
five targets, verify their checksums, and publish the installers under a matching
`vX.Y.Z` GitHub tag before deploying the download page. Each download filename
includes the version, platform, and architecture. Keep published binaries
unchanged so older links and checksums remain valid.

The earlier experimental build labeled `v1.0.0` remains in the release archive;
`v0.1.0` establishes the preview numbering used going forward.

## MIDI, recordings, and storage

Use **Connect keyboard**, then press the leftmost physical key to calibrate.
MIDI access is allowed only for the bundled instrument, which requests basic
MIDI with `sysex: false` and ignores SysEx messages. Chromium reports this request
under its shared `midiSysex` permission name. No MIDI driver
or extra browser permission prompt is required for a class-compliant controller,
though the operating system must recognize the device. The Pi needs a working
desktop session and audio output. Hardware MIDI and audio latency should be
checked on the actual Pi and controller.

Saved recordings and device calibration live in the desktop app's profile,
separately from browser storage. The usual locations are:

- macOS: `~/Library/Application Support/Primeboard`
- Windows: `%APPDATA%/Primeboard`
- Linux: `$XDG_CONFIG_HOME/Primeboard`, normally `~/.config/Primeboard`

Video, replay-file, and image exports use a native Save dialog. The instrument's
existing save/replace confirmations remain in place. Fullscreen is available in
the View menu; on Windows/Linux press Alt to show the menu bar.

## Development and builds

With Node.js 24 or newer:

```sh
npm ci
npm run desktop:start
npm test
npm run desktop:make
npm run desktop:checksums
```

The default target is the host's OS and architecture. Use `-- --arch=x64` or
`-- --arch=arm64` for packaging another supported architecture. Build native
installers on their matching OS; the GitHub workflow supplies all five build
machines. Linux makers need `fakeroot`, `dpkg`, and `rpm`. Mac DMGs use Apple's
built-in `hdiutil`. Outputs are under `out/make/`; unpacked applications are
under `out/Primeboard-<platform>-<arch>/`. Development uses a separate
`Primeboard Development` profile, so testing leaves installed-app data alone.

Icons are generated from the existing `web/icon.svg`. Only `web/`, `desktop/`,
the production startup dependency, package metadata, and license are bundled.
Tests, development dependencies, deployment scripts, and model-solving tooling
are excluded. The website's `npm run dev`, `npm test`, and `npm run build` commands
continue to work independently.

The app uses a private secure `primeboard://app/` origin so ES modules, fetch,
Web Audio worklets, WebGL, local storage, MIDI, and generated downloads work
without a network listener. Renderers remain sandboxed with Node integration
disabled, and only local assets execute. External URLs can only use HTTP(S),
and only MIDI, clipboard writing, and fullscreen permissions are allowed.
