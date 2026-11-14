#!/usr/bin/env bash
# Called by the installer before rollback, so the failing live state is captured.
set -u
printf 'Primeboard files and symlink:\n'
ls -l /etc/nginx/sites-available/primeboard.jacksonwalters.com /etc/nginx/sites-enabled/primeboard.jacksonwalters.com
printf '\nEffective Primeboard configuration:\n'
nginx -T 2>&1 | awk '/^# configuration file / { show = ($0 ~ /primeboard/) } show { print }'
printf '\nNginx master executable and command:\n'
pid=$(cat /run/nginx.pid)
readlink "/proc/$pid/exe"
ps -p "$pid" -o pid,ppid,args
printf '\nCertificate actually served over loopback:\n'
timeout 10 openssl s_client -connect 127.0.0.1:443 -servername primeboard.jacksonwalters.com </dev/null 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
printf '\nCertificate served on the public address:\n'
timeout 10 openssl s_client -connect 137.184.128.197:443 -servername primeboard.jacksonwalters.com </dev/null 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
printf '\nNginx journal:\n'
curl -q --noproxy '*' -v --connect-timeout 5 --max-time 10 https://primeboard.jacksonwalters.com/ -o /dev/null 2>&1
curl -q --noproxy '*' --http1.1 -v --connect-timeout 5 --max-time 10 https://primeboard.jacksonwalters.com/ -o /dev/null 2>&1
journalctl -u nginx --since '-10 minutes' --no-pager -n 60
printf '\nNginx reload errors:\n'
grep -E '\[(emerg|alert|crit)\]' /var/log/nginx/error.log /var/log/nginx/error.log.1 | tail -25
printf '\nHTTPS check output:\n'
cat /var/www/primeboard.jacksonwalters.com/https-check.log
