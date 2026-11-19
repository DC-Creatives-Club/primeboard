# Video export dependency

Mediabunny 1.66.1 by Vanilagy, licensed under MPL-2.0 (see mediabunny-LICENSE.txt).
This bundled library is separate from Primeboard's MIT-licensed source.
Unmodified upstream source, including TypeScript, is available at
https://registry.npmjs.org/mediabunny/-/mediabunny-1.66.1.tgz
and https://github.com/Vanilagy/mediabunny.

Regenerate the local bundle with `npm ci` then `npm run vendor:video`.
Export loads this bundle on demand; it requires no CDN or network service.
