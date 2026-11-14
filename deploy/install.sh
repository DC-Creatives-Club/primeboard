#!/usr/bin/env bash
set -euo pipefail

# Run after staging: sudo bash /home/jackson/primeboard-deploy/install.sh
# Installs Primeboard and redirects the previous Rainboard host when present.
[[ ${EUID} -eq 0 ]] || { echo 'Run this script with sudo.' >&2; exit 1; }
stage=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
domain=primeboard.jacksonwalters.com
root=/var/www/primeboard.jacksonwalters.com
config=/etc/nginx/sites-available/primeboard.jacksonwalters.com
enabled=/etc/nginx/sites-enabled/primeboard.jacksonwalters.com
old_config=/etc/nginx/sites-available/rainboard.jacksonwalters.com
old_enabled=/etc/nginx/sites-enabled/rainboard.jacksonwalters.com

python3 - <<'PY'
import socket
host = 'primeboard.jacksonwalters.com'
try:
    ips = {r[4][0] for r in socket.getaddrinfo(host, 80, socket.AF_INET)}
except socket.gaierror:
    raise SystemExit('First add DNS: A primeboard -> 137.184.128.197, then wait for it to resolve.')
if ips != {'137.184.128.197'}:
    raise SystemExit(f'{host} resolves to {sorted(ips)}, not solely this server. Check DNS before installing.')
PY

cd -- "$stage"
sha256sum --check primeboard-web.sha256
release=$(sha256sum primeboard-web.tar.gz | cut -c1-16)
destination="$root/releases/$release"
install -d -m 755 "$destination"
tar -xzf primeboard-web.tar.gz -C "$destination" --no-same-owner
test -f "$destination/index.html"
test -f "$destination/data/CIE_xyz_1931_2deg.csv"
chmod -R a+rX "$destination"

# Refuse to replace an unrelated host configuration.
if [[ -e "$config" ]] && ! head -1 "$config" | grep -Fq '# Managed by the Primeboard deployment script.'; then
    echo "Existing $config was not created by Primeboard; inspect it before proceeding." >&2
    exit 1
fi
previous_release=$(readlink "$root/current" || true)
backup="$root/nginx.previous"
had_config=0
if [[ -e "$config" ]]; then cp -p "$config" "$backup"; had_config=1; fi
redirect_old=0
if [[ -e "$old_enabled" ]] && [[ -f /etc/letsencrypt/live/rainboard.jacksonwalters.com/fullchain.pem ]]; then
    if ! head -1 "$old_config" | grep -Eq '^# Managed by the (Rainboard|Primeboard) deployment script\.$'; then
        echo "Existing $old_config has an unknown owner; refusing to replace it." >&2
        exit 1
    fi
    cp -p "$old_config" "$root/rainboard.nginx.previous"
    redirect_old=1
fi
rollback() {
    if [[ "$had_config" == 1 ]]; then cp -p "$backup" "$config"; else rm -f "$enabled" "$config"; fi
    if [[ "$redirect_old" == 1 ]]; then cp -p "$root/rainboard.nginx.previous" "$old_config"; fi
    if [[ -n "$previous_release" ]]; then ln -sfn "$previous_release" "$root/current"; else rm -f "$root/current"; fi
    nginx -t && systemctl reload nginx || true
    echo 'Primeboard installation failed. The previous Nginx configuration was restored.' >&2
}
trap rollback ERR
ln -sfn "$destination" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"

if [[ ! -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]]; then
    install -m 644 "$stage/primeboard.http.conf" "$config"
    ln -sfn "$config" "$enabled"
    nginx -t
    systemctl reload nginx
    # Uses this server's existing Certbot account; no new account or agreement.
    certbot certonly --non-interactive --webroot -w "$root/current" -d "$domain"
fi

install -m 644 "$stage/primeboard.https.conf" "$config"
ln -sfn "$config" "$enabled"
if [[ "$redirect_old" == 1 ]]; then
    install -m 644 "$stage/rainboard-redirect.conf" "$old_config"
fi
nginx -t
systemctl reload nginx
# Each attempt uses a fresh, fully verified TLS context and checks exact content.
# The public hostname is the same route a visitor will use.
if ! python3 "$stage/verify-live.py" "$destination/index.html" >"$root/https-check.log" 2>&1; then
    bash "$stage/diagnose-live.sh" > "$stage/last-failure.txt" 2>&1 || true
    chmod 644 "$stage/last-failure.txt"
    echo "HTTPS verification failed. Diagnostics saved in $stage/last-failure.txt" >&2
    false
fi
cat "$root/https-check.log"
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
install -m 755 "$stage/renewal-hook.sh" /etc/letsencrypt/renewal-hooks/deploy/primeboard
trap - ERR
echo "Primeboard is live: https://$domain (release $release)"
