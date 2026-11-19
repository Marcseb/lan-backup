#!/usr/bin/env bash
# Create local source archives for the LAN Backup companion server.
# This script does not upload or publish files to GitHub.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER="$ROOT/artifacts/lan-backup/companion-server"
OUT="$ROOT/release"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT"
mkdir -p "$STAGE/companion-server"

for file in \
  server.js package.json install.sh install.ps1 README.md \
  lan-backup.png lan-backup.ico lan-backup.icns
do
  if [[ ! -f "$SERVER/$file" ]]; then
    echo "Required server file is missing: $SERVER/$file" >&2
    exit 1
  fi
  cp "$SERVER/$file" "$STAGE/companion-server/$file"
done

tar -czf "$OUT/companion-server.tar.gz" -C "$STAGE" companion-server
(cd "$STAGE" && zip -q -r "$OUT/companion-server.zip" companion-server)

(
  cd "$OUT"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum companion-server.tar.gz companion-server.zip
  else
    shasum -a 256 companion-server.tar.gz companion-server.zip
  fi
) > "$OUT/CHECKSUMS.txt"

echo "Created local archives in $OUT"
