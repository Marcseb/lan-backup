#!/usr/bin/env bash
# package-release.sh — rebuild and upload companion-server release archives
#
# Usage:
#   GITHUB_PAT=<token> bash package-release.sh [release-id]
#
# Requires: curl, zip, tar, sha256sum (or shasum on macOS), node
# The GITHUB_PAT token needs repo + write:packages scope.
#
# What it does:
#   1. Packages server.js + install scripts + README into .tar.gz and .zip
#   2. Deletes existing release assets for the given release ID
#   3. Uploads the fresh archives as new assets
#   4. Prints SHA-256 checksums for CHECKSUMS.txt
#
# This script was used to publish the v1.0.0 release (ID 344737131) on
# 2026-07-17, adding the POST /peer-transfer and GET /peer-transfer/:id
# endpoints to the packaged server.js.

set -euo pipefail

REPO="Marcseb/lan-backup"
RELEASE_ID="${1:-364144422}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "${GITHUB_PAT:-}" ]]; then
  echo "Error: GITHUB_PAT is not set." >&2
  exit 1
fi

echo "==> Packaging companion server..."
TMP="$(mktemp -d)"
PKG="$TMP/companion-server"
mkdir -p "$PKG"
cp "$SCRIPT_DIR/server.js"   "$PKG/"
cp "$SCRIPT_DIR/install.sh"  "$PKG/" 2>/dev/null || true
cp "$SCRIPT_DIR/install.ps1" "$PKG/" 2>/dev/null || true
cp "$SCRIPT_DIR/README.md"   "$PKG/" 2>/dev/null || true

TAR_GZ="$TMP/companion-server.tar.gz"
ZIP_FILE="$TMP/companion-server.zip"

tar -czf "$TAR_GZ" -C "$TMP" companion-server
(cd "$TMP" && zip -r "$ZIP_FILE" companion-server/)

echo "==> Fetching current release assets for ID $RELEASE_ID..."
ASSETS=$(curl -sf \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/releases/$RELEASE_ID")

ASSET_IDS=$(echo "$ASSETS" | node -e "
  const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  (d.assets||[]).forEach(a => console.log(a.id));
")

for ASSET_ID in $ASSET_IDS; do
  echo "  Deleting asset $ASSET_ID..."
  curl -sf -X DELETE \
    -H "Authorization: Bearer $GITHUB_PAT" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "https://api.github.com/repos/$REPO/releases/assets/$ASSET_ID"
done

UPLOAD_URL="https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets"

echo "==> Uploading companion-server.tar.gz..."
curl -sf -X POST \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/gzip" \
  --data-binary @"$TAR_GZ" \
  "$UPLOAD_URL?name=companion-server.tar.gz&label=Companion+Server+(tar.gz)" > /dev/null

echo "==> Uploading companion-server.zip..."
curl -sf -X POST \
  -H "Authorization: Bearer $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/zip" \
  --data-binary @"$ZIP_FILE" \
  "$UPLOAD_URL?name=companion-server.zip&label=Companion+Server+(zip)" > /dev/null

echo ""
echo "==> SHA-256 checksums (update CHECKSUMS.txt with these):"
if command -v sha256sum &>/dev/null; then
  sha256sum "$TAR_GZ" "$ZIP_FILE" | sed "s|$TMP/||"
else
  shasum -a 256 "$TAR_GZ" "$ZIP_FILE" | sed "s|$TMP/||"
fi

rm -rf "$TMP"
echo ""
echo "Done. Release $RELEASE_ID updated."
