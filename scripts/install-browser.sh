#!/usr/bin/env bash
# Playwright's Chromium or WebKit, and the system packages it needs.
# GitHub's ubuntu-26.04 runners sometimes cannot resolve archive.ubuntu.com, azure.archive.ubuntu.com or
# security.ubuntu.com, and apt-get then stops the install. When archive.ubuntu.com does not resolve, point apt
# at a second full mirror for this job only. mirrors.edge.kernel.org carries resolute, resolute-updates,
# resolute-security and resolute-backports, including amd64v3. Suites, components and Signed-By stay as the
# image set them, and the packages stay signed by Ubuntu's own keys.
set -euo pipefail

mirror=https://mirrors.edge.kernel.org/ubuntu/

# The three hosts only, http or https, with or without the slash after /ubuntu. A path that continues
# (ubuntu-ports) and any other host are left as they are. --rewrite <directory> runs this and nothing else,
# so a test can call it without sudo and without a runner.
sed_program() {
  local host scheme
  for host in 'azure\.archive\.ubuntu\.com' 'archive\.ubuntu\.com' 'security\.ubuntu\.com'; do
    for scheme in http https; do
      printf '%s\n' \
        "s#${scheme}://${host}/ubuntu/#${mirror}#g" \
        "s#${scheme}://${host}/ubuntu #${mirror} #g" \
        "s#${scheme}://${host}/ubuntu\$#${mirror}#g"
    done
  done
}

rewrite_file() {
  local file=$1 tmp prog
  tmp=$(mktemp)
  prog=$(mktemp)
  sed_program > "$prog"
  sed -f "$prog" "$file" > "$tmp"
  rm -f "$prog"
  if cmp -s "$file" "$tmp"; then
    rm -f "$tmp"
    return 0
  fi
  if [ -w "$file" ]; then
    cat "$tmp" > "$file"
  else
    sudo -n tee "$file" < "$tmp" >/dev/null
  fi
  rm -f "$tmp"
}

rewrite_tree() {
  local root=$1 f found=0
  if [ -f "$root/sources.list" ]; then
    rewrite_file "$root/sources.list"
    found=1
  fi
  shopt -s nullglob
  for f in "$root"/*.sources "$root"/sources.list.d/*.sources; do
    rewrite_file "$f"
    found=1
  done
  shopt -u nullglob
  if [ "$found" -eq 0 ]; then
    echo "install-browser: no apt source files in $root" >&2
    exit 1
  fi
}

if [ "${1:-}" = "--rewrite" ]; then
  if [ -z "${2:-}" ] || [ ! -d "$2" ]; then
    echo "usage: scripts/install-browser.sh --rewrite <directory>" >&2
    exit 64
  fi
  rewrite_tree "$2"
  exit 0
fi

case "${1:-}" in
  chromium|webkit) ;;
  *)
    echo "usage: scripts/install-browser.sh <chromium|webkit>" >&2
    exit 64
    ;;
esac

if ! getent hosts archive.ubuntu.com >/dev/null 2>&1; then
  echo "Ubuntu's package hosts do not resolve; pointing apt at a second mirror for this job: $mirror"
  rewrite_tree /etc/apt
fi

cd "$(dirname "$0")/.."
exec pnpm --filter site exec playwright install --with-deps "$1"
