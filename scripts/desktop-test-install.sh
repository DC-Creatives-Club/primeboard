#!/usr/bin/env bash
set -euo pipefail

# Exercise real package installation on clean distributions, on the runner's CPU.
# Containers check dependencies and desktop integration; they do not test audio,
# a graphical desktop session, or physical MIDI hardware.
package=$(realpath "${1:?Pass the DEB package to test}")
version=$(dpkg-deb --field "$package" Version)

for distribution in debian:bookworm debian:trixie ubuntu:22.04 ubuntu:24.04; do
  echo "::group::Install on $distribution"
  docker run --rm -i --volume "$package:/tmp/primeboard.deb:ro" \
    --env DEBIAN_FRONTEND=noninteractive "$distribution" bash -s -- "$version" <<'CHECK'
set -euo pipefail
apt-get update -qq
if ! apt-get install -y --no-install-recommends /tmp/primeboard.deb > /tmp/install.log 2>&1; then
  cat /tmp/install.log
  exit 1
fi
test "$(dpkg-query -W -f='${Status}' primeboard)" = 'install ok installed'
test "$(dpkg-query -W -f='${Version}' primeboard)" = "$1"
test "$(dpkg-query -W -f='${Architecture}' primeboard)" = "$(dpkg --print-architecture)"
test -x /usr/bin/primeboard
binary=$(readlink -f /usr/bin/primeboard)
directory=$(dirname "$binary")
test -f "$directory/resources/app.asar"
test "$(stat -c '%u:%a' "$directory/chrome-sandbox")" = '0:4755'
grep -q '^Exec=primeboard' /usr/share/applications/primeboard.desktop
for library in "$binary" "$directory"/*.so; do
  ldd "$library" > /tmp/libraries.log
  if grep -q 'not found' /tmp/libraries.log; then
    cat /tmp/libraries.log
    exit 1
  fi
done
printf 'Installed Primeboard %s (%s); runtime libraries, launcher, and sandbox permissions passed.\n' "$1" "$(dpkg --print-architecture)"
apt-get remove -y primeboard > /tmp/remove.log 2>&1
test ! -e /usr/bin/primeboard
echo 'Package removal passed.'
CHECK
  echo '::endgroup::'
done
