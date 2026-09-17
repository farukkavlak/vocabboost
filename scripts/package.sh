#!/usr/bin/env bash
# Builds the extension and zips it for the Chrome Web Store, as release/vocabboost-<version>.zip.
set -euo pipefail

version=$(node -p "require('./extension/package.json').version")
out="release/vocabboost-$version.zip"

npm run build
mkdir -p release
rm -f "$out"
(cd extension/dist && zip -qr -X "../../$out" .)

echo "$out  $(du -h "$out" | cut -f1)"
