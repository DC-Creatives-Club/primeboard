#!/usr/bin/env bash
set -euo pipefail
if [[ ${RENEWED_LINEAGE:-} == /etc/letsencrypt/live/primeboard.jacksonwalters.com ]]; then
    nginx -t
    systemctl reload nginx
fi
