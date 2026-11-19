from pathlib import Path
import hashlib
import io
import json
import shutil
import struct
import sys
import tarfile
import zipfile

root = Path(sys.argv[1])
version = json.loads(Path('package.json').read_text())['version']
artifacts = root / 'artifacts'
release = root / 'release'
payloads = root / 'payloads'
release.mkdir(exist_ok=True)
payloads.mkdir(exist_ok=True)

def digest(path):
    with path.open('rb') as stream:
        value = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(chunk)
        return value.hexdigest()

def deb_members(path):
    with path.open('rb') as stream:
        assert stream.read(8) == b'!<arch>\n'
        while header := stream.read(60):
            assert len(header) == 60 and header[58:] == b'`\n'
            name = header[:16].decode().strip().rstrip('/')
            size = int(header[48:58])
            data = stream.read(size)
            assert len(data) == size
            if size % 2:
                stream.read(1)
            yield name, data

report = []
for arch, deb_arch, machine in [('arm64', 'arm64', 183), ('x64', 'amd64', 62)]:
    folder = artifacts / f'Primeboard-linux-{arch}'
    manifest = folder / 'SHA256SUMS.txt'
    expected_files = set()
    for line in manifest.read_text().splitlines():
        expected, relative = line.split('  ', 1)
        path = (folder / relative).resolve()
        assert path.is_relative_to(folder.resolve())
        assert digest(path) == expected, path
        expected_files.add(path)
    files = {suffix: list(folder.rglob(f'*{suffix}')) for suffix in ['.deb', '.zip']}
    assert all(len(paths) == 1 for paths in files.values()), files
    assert expected_files == {paths[0].resolve() for paths in files.values()}, expected_files
    package, bundle = files['.deb'][0], files['.zip'][0]
    with zipfile.ZipFile(bundle) as archive:
        assert archive.testzip() is None
        asars = [name for name in archive.namelist() if name.endswith('/resources/app.asar') or name == 'resources/app.asar']
        assert len(asars) == 1, asars
        app_asar = archive.read(asars[0])
        (payloads / f'{arch}.asar').write_bytes(app_asar)
        executables = [name for name in archive.namelist() if name.split('/')[-1] == 'Primeboard']
        assert len(executables) == 1
        with archive.open(executables[0]) as stream:
            header = stream.read(64)
        assert header[:6] == b'\x7fELF\x02\x01', header[:6]
        assert struct.unpack_from('<H', header, 18)[0] == machine
    control_ok = payload_ok = sandbox_ok = False
    for name, data in deb_members(package):
        if name.startswith('control.tar'):
            with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                control = next(member for member in archive if member.name.lstrip('./') == 'control')
                text = archive.extractfile(control).read().decode()
                assert f'Version: {version}\n' in text, text
                assert f'Architecture: {deb_arch}\n' in text, text
                control_ok = True
        elif name.startswith('data.tar'):
            with tarfile.open(fileobj=io.BytesIO(data)) as archive:
                for member in archive:
                    if member.name.endswith('/resources/app.asar'):
                        assert archive.extractfile(member).read() == app_asar
                        payload_ok = True
                    elif member.name.endswith('/chrome-sandbox'):
                        assert member.uid == 0 and member.mode & 0o4777 == 0o4755, (member.uid, oct(member.mode))
                        sandbox_ok = True
    assert control_ok and payload_ok and sandbox_ok
    for suffix, paths in files.items():
        destination = release / f'Primeboard-{version}-Linux-{arch}{suffix}'
        shutil.copyfile(paths[0], destination)
        report.append({'name': destination.name, 'size': destination.stat().st_size, 'sha256': digest(destination)})
    print(f'{arch}: CI checksums, ZIP integrity, ELF architecture, DEB version, identical app payload, and sandbox permissions verified.', flush=True)

report.sort(key=lambda item: item['name'])
(release / 'SHA256SUMS.txt').write_text(''.join(f"{item['sha256']}  {item['name']}\n" for item in report))
(root / 'asset-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(f'Prepared {len(report)} release packages and SHA256SUMS.txt.', flush=True)
