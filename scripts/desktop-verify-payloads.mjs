import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const repo = process.cwd();
const root = process.argv[2];
const {version} = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const require = createRequire(path.join(repo, 'package.json'));
const asar = require('@electron/asar');
function files(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : entry.isFile() ? [full] : [];
  });
}
const sources = [...files(path.join(repo, 'web')), ...['LICENSE', 'desktop/main.mjs', 'desktop/security.mjs'].map(name => path.join(repo, name))];
for (const arch of ['arm64', 'x64']) {
  const archive = path.join(root, 'payloads', `${arch}.asar`);
  const metadata = JSON.parse(asar.extractFile(archive, 'package.json').toString());
  assert.equal(metadata.version, version);
  assert.equal(metadata.license, 'MIT');
  for (const source of sources) {
    const relative = path.relative(repo, source);
    assert(asar.extractFile(archive, relative).equals(fs.readFileSync(source)), `${arch}: ${relative} differs`);
  }
  const bundled = asar.listPackage(archive);
  assert(!bundled.some(name => /^\/(\.git|\.env|tests|scripts|deploy)(\/|$)/.test(name)));
  console.log(`${arch}: version ${version}, MIT license, and all ${sources.length} app source/data files match the release commit.`);
}
