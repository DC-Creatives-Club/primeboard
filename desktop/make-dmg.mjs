import { cp, mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Use the native macOS tool; no separate image parser or Finder automation.
export async function makeDmg(result) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'primeboard-dmg-'));
  const destination = path.resolve('out/make/dmg', result.arch);
  const artifact = path.join(destination, `Primeboard-${result.packageJSON.version}-macOS-${result.arch}.dmg`);
  try {
    await mkdir(destination, { recursive: true });
    await cp(path.resolve(`out/Primeboard-darwin-${result.arch}/Primeboard.app`), path.join(temporary, 'Primeboard.app'),
      { recursive: true, verbatimSymlinks: true });
    await symlink('/Applications', path.join(temporary, 'Applications'));
    await promisify(execFile)('hdiutil', ['create', '-volname', 'Primeboard', '-srcfolder', temporary,
      '-format', 'UDZO', '-ov', artifact], { timeout: 180000 });
    return artifact;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
