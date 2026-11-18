import { readFile, writeFile } from 'node:fs/promises';

// The app version can advance while the published desktop downloads stay put.
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
for (const name of ['index.html', 'download.html']) {
  const file = new URL(`../web/${name}`, import.meta.url);
  const html = await readFile(file, 'utf8');
  const marker = /(<span\b[^>]*\bdata-app-version[^>]*>)[^<]*(<\/span>)/g;
  if (!marker.test(html)) throw new Error(`Missing app-version footer in ${name}`);
  const updated = html.replace(marker, `$1v${version}$2`);
  if (updated !== html) await writeFile(file, updated);
}
