#!/usr/bin/env bash

set -euo pipefail

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_version="${JIAYAN_NODE_VERSION:-24.18.0}"
node_archive_name="node-v${node_version}-linux-x64"
node_root="/tmp/${node_archive_name}"

if [[ ! -x "${node_root}/bin/node" ]]; then
  archive_path="/tmp/${node_archive_name}.tar.xz"
  curl -fsSLo "${archive_path}" \
    "https://nodejs.org/dist/v${node_version}/${node_archive_name}.tar.xz"
  tar -xJf "${archive_path}" -C /tmp
fi

export PATH="${node_root}/bin:${PATH}"

build_directory="$(mktemp -d /tmp/jiayan-build-XXXXXX)"

tar \
  -C "${source_root}" \
  --exclude=.git \
  --exclude=node_modules \
  --exclude="*/node_modules" \
  --exclude="*/dist" \
  -cf - . | tar -C "${build_directory}" -xf -

cd "${build_directory}"

echo "隔离构建目录：${build_directory}"
node --version
npm --version
npm ci --no-audit --no-fund
npm run build:weapp
test -f apps/miniprogram/dist/app.json

dist_target="${source_root}/apps/miniprogram/dist"

if [[ -e "${dist_target}" ]]; then
  mv "${dist_target}" "${build_directory}/previous-dist"
fi

mkdir -p "${dist_target}"
cp -a apps/miniprogram/dist/. "${dist_target}/"
test -f "${dist_target}/app.json"

echo "MINI_PROGRAM_BUILD_OK"
