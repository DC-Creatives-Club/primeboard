#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
npm test
npm run build
python3 - <<'PY'
from pathlib import Path
import tarfile
root = Path('dist/web')
with tarfile.open('dist/primeboard-web.tar.gz', 'w:gz', format=tarfile.USTAR_FORMAT) as archive:
    for path in sorted(root.rglob('*')):
        if path.is_file() and not path.is_symlink():
            archive.add(path, arcname=str(path.relative_to(root)), recursive=False)
PY
(
    cd dist
    shasum -a 256 primeboard-web.tar.gz > primeboard-web.sha256
)
ssh application_server 'mkdir -p /home/jackson/primeboard-deploy'
scp dist/primeboard-web.tar.gz dist/primeboard-web.sha256 deploy/install.sh deploy/verify-live.py deploy/diagnose-live.sh deploy/renewal-hook.sh deploy/primeboard.http.conf deploy/primeboard.https.conf deploy/rainboard-redirect.conf application_server:/home/jackson/primeboard-deploy/
ssh application_server 'cd /home/jackson/primeboard-deploy && sha256sum --check primeboard-web.sha256 && bash -n install.sh'
echo 'Staged. After DNS is ready, run: ssh -t application_server "sudo bash /home/jackson/primeboard-deploy/install.sh"'
