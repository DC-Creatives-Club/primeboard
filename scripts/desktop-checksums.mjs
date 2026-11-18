import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('out/make');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return found.flat();
}
const artifacts = (await files(root)).filter(file => /\.(zip|dmg|exe|deb|rpm|nupkg)$/.test(file)).sort();
if (!artifacts.length) throw new Error('No desktop artifacts found. Run npm run desktop:make first.');
const lines = await Promise.all(artifacts.map(async file => `${createHash('sha256').update(await readFile(file)).digest('hex')}  ${path.relative(root, file).split(path.sep).join('/')}`));
await writeFile(path.join(root, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
console.log(`Checksummed ${artifacts.length} desktop artifacts.`);
