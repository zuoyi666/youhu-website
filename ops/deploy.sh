#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

usage() {
  cat <<'EOF'
Usage: ops/deploy.sh [--check]

Build and verify a Youhu website release, upload it through the configured SSH
host, and ask the server-side root helper to activate it.

Options:
  --check  Complete all local build, archive, and checksum checks without an
           SSH upload or remote activation.
  -h, --help
           Show this help.

Environment:
  YOUHU_WEBSITE_HOST        SSH config host or user@host (default: youhu-prod)
  YOUHU_WEBSITE_RELEASE_ID  Optional release ID using letters, digits, . _ -
EOF
}

fail() {
  printf 'deploy error: %s\n' "$*" >&2
  exit 1
}

check_only=false
case "${1:-}" in
  "") ;;
  --check)
    check_only=true
    shift
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    fail "unknown option: $1"
    ;;
esac
[[ $# -eq 0 ]] || fail "unexpected argument: $1"

deploy_script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
deploy_repo_root=$(cd -- "${deploy_script_dir}/.." && pwd -P)
deploy_tmp_base=${TMPDIR:-/tmp}
deploy_tmp_base=${deploy_tmp_base%/}
[[ -n "${deploy_tmp_base}" && -d "${deploy_tmp_base}" ]] || \
  fail "temporary directory base is unavailable"

deploy_tmp_dir=""
cleanup() {
  if [[ -n "${deploy_tmp_dir}" && -d "${deploy_tmp_dir}" ]]; then
    case "${deploy_tmp_dir}" in
      "${deploy_tmp_base}"/youhu-website-deploy.*)
        rm -rf -- "${deploy_tmp_dir}"
        ;;
      *)
        printf 'refusing to clean unexpected path: %s\n' "${deploy_tmp_dir}" >&2
        ;;
    esac
  fi
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

for deploy_command in git npm node tar scp ssh; do
  command -v "${deploy_command}" >/dev/null 2>&1 || \
    fail "required command is missing: ${deploy_command}"
done
if command -v shasum >/dev/null 2>&1; then
  deploy_sha_command=shasum
elif command -v sha256sum >/dev/null 2>&1; then
  deploy_sha_command=sha256sum
else
  fail "required SHA-256 command is missing: shasum or sha256sum"
fi

deploy_host=${YOUHU_WEBSITE_HOST:-youhu-prod}
[[ "${deploy_host}" =~ ^[A-Za-z0-9][A-Za-z0-9._@-]*$ ]] || \
  fail "YOUHU_WEBSITE_HOST must be an SSH host alias or user@host without spaces"

deploy_commit=$(git -C "${deploy_repo_root}" rev-parse --short=12 HEAD)
deploy_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
deploy_release_id=${YOUHU_WEBSITE_RELEASE_ID:-${deploy_timestamp}-${deploy_commit}}
[[ ${#deploy_release_id} -le 96 ]] || fail "release ID is longer than 96 characters"
[[ "${deploy_release_id}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || \
  fail "release ID contains unsupported characters"

deploy_tmp_dir=$(mktemp -d "${deploy_tmp_base}/youhu-website-deploy.XXXXXX")
deploy_archive="${deploy_tmp_dir}/youhu-website-${deploy_release_id}.tar.gz"
deploy_remote_archive="/tmp/youhu-website-${deploy_release_id}.tar.gz"

cd -- "${deploy_repo_root}"
printf 'Installing locked dependencies...\n'
npm ci --prefer-offline --no-audit --no-fund
printf 'Running repository verification...\n'
npm run verify
printf 'Building the static document root...\n'
npm run build:static

[[ -f dist/index.html && -f dist/assets/site.css && -f dist/assets/site.js ]] || \
  fail "static build is incomplete"

printf 'Creating release archive...\n'
COPYFILE_DISABLE=1 tar -C dist -czf "${deploy_archive}" .
[[ -s "${deploy_archive}" ]] || fail "release archive is empty"
if [[ "${deploy_sha_command}" == shasum ]]; then
  deploy_sha256=$(shasum -a 256 "${deploy_archive}" | awk '{print $1}')
else
  deploy_sha256=$(sha256sum "${deploy_archive}" | awk '{print $1}')
fi
[[ "${deploy_sha256}" =~ ^[A-Fa-f0-9]{64}$ ]] || fail "failed to calculate SHA-256"

printf 'Release: %s\n' "${deploy_release_id}"
printf 'SHA-256: %s\n' "${deploy_sha256}"

if [[ "${check_only}" == true ]]; then
  printf 'Check complete; no SSH upload or remote change was made.\n'
  exit 0
fi

printf 'Uploading archive to %s...\n' "${deploy_host}"
scp -o BatchMode=yes -- \
  "${deploy_archive}" "${deploy_host}:${deploy_remote_archive}"

printf 'Requesting atomic server-side activation...\n'
ssh -o BatchMode=yes -- "${deploy_host}" \
  "sudo -n /usr/local/sbin/youhu-activate-website ${deploy_release_id} ${deploy_remote_archive} ${deploy_sha256}"

printf 'Activated website release %s on %s.\n' \
  "${deploy_release_id}" "${deploy_host}"
