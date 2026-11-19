import { build } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const version = require('../node_modules/mediabunny/package.json').version;
await mkdir(new URL('../web/vendor/', import.meta.url), { recursive: true });
await build({
  stdin: { contents: `export { Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, CanvasSource, AudioBufferSource, canEncodeVideo, canEncodeAudio, Quality } from 'mediabunny';`, resolveDir: process.cwd() },
  outfile: 'web/vendor/mediabunny.js', bundle: true, format: 'esm', platform: 'browser',
  minify: true, legalComments: 'eof', target: 'es2022',
  banner: { js: `// Mediabunny ${version}. MPL-2.0. See mediabunny-LICENSE.txt and README.md in this directory.` },
});
await copyFile('node_modules/mediabunny/LICENSE', 'web/vendor/mediabunny-LICENSE.txt');
await writeFile('web/vendor/README.md', `# Video export dependency\n\nMediabunny ${version} by Vanilagy, licensed under MPL-2.0 (see mediabunny-LICENSE.txt).\nThis bundled library is separate from Primeboard's MIT-licensed source.\nUnmodified upstream source, including TypeScript, is available at\nhttps://registry.npmjs.org/mediabunny/-/mediabunny-${version}.tgz\nand https://github.com/Vanilagy/mediabunny.\n\nRegenerate the local bundle with \`npm ci\` then \`npm run vendor:video\`.\nExport loads this bundle on demand; it requires no CDN or network service.\n`);
