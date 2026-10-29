#!/usr/bin/env bash
# Updates @onlyoffice/docspace-api-sdk to the SDK commit pinned by DocSpace-server.
#
# sdk.json:
#   serverBranch — server branch the tests target, or "auto" to take the branch IO is built from:
#                  IO version 4.0.1.12172 -> hotfix/v4.0.1 or release/v4.0.1, whichever exists in the server;
#                  IO version develop.12172 -> develop (feature/bugfix branches are looked up the same way)
#   ioUrl        — IO portal, used when serverBranch is "auto"
#   commit       — SDK commit currently installed (written by this script)
#
# The SDK commit is the sdk/docspace-api-sdk-typescript submodule pin in DocSpace-server@serverBranch;
# the package is the onlyoffice-docspace-api-sdk-*.tgz committed in that SDK commit.
#
# Usage:
#   npm run sdk:update              update if the pin moved
#   npm run sdk:update -- --check   only report; exit code 1 if outdated
#
# Env:
#   GIT_BASE          repo URL prefix (default: SSH); CI overrides it with its own HTTPS prefix
#   SDK_SUMMARY_FILE  if set, a Markdown summary of the SDK changes is written there
#   GITHUB_OUTPUT     if set (CI), outputs: branch, updated, old, new, tgz, direction (newer|older|diverged|unknown)

set -euo pipefail

cd "$(dirname "$0")/.."

GIT_BASE="${GIT_BASE:-git@git.onlyoffice.com:ONLYOFFICE}"
SERVER_REPO="DocSpace-server"
SDK_REPO="docspace-api-sdk-typescript"
SDK_PATH="sdk/docspace-api-sdk-typescript"

CHECK_ONLY=false
[ "${1:-}" = "--check" ] && CHECK_ONLY=true

output() {
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1=$2" >> "$GITHUB_OUTPUT"
  return 0
}

BRANCH=$(node -p "require('./sdk.json').serverBranch || 'auto'")
OLD=$(node -p "require('./sdk.json').commit || ''")

if [ "$BRANCH" = "auto" ]; then
  IO_URL=$(node -p "require('./sdk.json').ioUrl || ''")
  if [ -z "$IO_URL" ]; then
    echo "serverBranch is \"auto\" but ioUrl is not set in sdk.json" >&2
    exit 2
  fi

  if ! BUILD_INFO=$(curl -sf --max-time 30 "$IO_URL/api/2.0/settings/version/build"); then
    echo "Cannot get the version from $IO_URL" >&2
    exit 2
  fi
  IO_VERSION=$(node -p "JSON.parse(process.argv[1]).response.docSpace" "$BUILD_INFO")
  # buildtools: version = <product version>.<build number>, where the product version is
  # 4.0.1 for release/v4.0.1 and hotfix/v4.0.1, and the branch name for other branches (develop.12172)
  PRODUCT_VERSION="${IO_VERSION%.*}"

  if [[ "$PRODUCT_VERSION" =~ ^[0-9]+(\.[0-9]+)+$ ]]; then
    NAMES="release/v$PRODUCT_VERSION hotfix/v$PRODUCT_VERSION"
  else
    NAMES="$PRODUCT_VERSION feature/$PRODUCT_VERSION bugfix/$PRODUCT_VERSION"
  fi

  if ! HEADS=$(git ls-remote --heads "$GIT_BASE/$SERVER_REPO.git" 2>&1); then
    echo "Cannot read branches of $SERVER_REPO (no access?):" >&2
    echo "$HEADS" >&2
    exit 2
  fi

  CANDIDATES=""
  for name in $NAMES; do
    if grep -q "[[:space:]]refs/heads/$name\$" <<< "$HEADS"; then
      CANDIDATES="$CANDIDATES $name"
    fi
  done
  read -r -a FOUND <<< "$CANDIDATES"

  if [ "${#FOUND[@]}" -ne 1 ]; then
    echo "Cannot detect the server branch for IO $IO_VERSION: found '${CANDIDATES# }'" >&2
    echo "Set serverBranch in sdk.json explicitly" >&2
    exit 2
  fi
  BRANCH="${FOUND[0]}"
  echo "IO $IO_VERSION is built from $SERVER_REPO@$BRANCH"
fi

output branch "$BRANCH"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. SDK commit pinned by the server (one commit, no file contents)
git init -q "$TMP/server"
git -C "$TMP/server" fetch -q --depth 1 --filter=tree:0 "$GIT_BASE/$SERVER_REPO.git" "$BRANCH"
NEW=$(git -C "$TMP/server" ls-tree FETCH_HEAD "$SDK_PATH" | awk '{print $3}')

if [ -z "$NEW" ]; then
  echo "No $SDK_PATH submodule in $SERVER_REPO@$BRANCH" >&2
  exit 2
fi

output old "$OLD"
output new "$NEW"

if [ "$NEW" = "$OLD" ]; then
  echo "SDK is up to date: $NEW ($SERVER_REPO@$BRANCH)"
  output updated false
  exit 0
fi

echo "SDK pin moved: ${OLD:-<unknown>} -> $NEW ($SERVER_REPO@$BRANCH)"

if $CHECK_ONLY; then
  output updated false
  exit 1
fi

# 2. Package from that SDK commit (trees only; the tgz blob is fetched on demand)
git init -q "$TMP/sdk"
git -C "$TMP/sdk" fetch -q --depth 100 --filter=blob:none "$GIT_BASE/$SDK_REPO.git" "$NEW"

TGZ=$(git -C "$TMP/sdk" ls-tree --name-only "$NEW" | grep -E '^onlyoffice-docspace-api-sdk-.*\.tgz$' | head -1 || true)
if [ -z "$TGZ" ]; then
  echo "No onlyoffice-docspace-api-sdk-*.tgz in $SDK_REPO@$NEW" >&2
  exit 2
fi

rm -f onlyoffice-docspace-api-sdk-*.tgz
git -C "$TMP/sdk" cat-file -p "$NEW:$TGZ" > "$TGZ"
npm install --no-audit --no-fund "./$TGZ"

node -e "
  const fs = require('fs');
  const config = JSON.parse(fs.readFileSync('sdk.json', 'utf8'));
  config.commit = '$NEW';
  fs.writeFileSync('sdk.json', JSON.stringify(config, null, 2) + '\n');
"

# Is the new SDK newer than the installed one? IO may switch to develop, whose pin is often older.
DIRECTION="unknown"
if [ -n "$OLD" ]; then
  if git -C "$TMP/sdk" cat-file -e "$OLD^{commit}" 2>/dev/null &&
     git -C "$TMP/sdk" merge-base --is-ancestor "$OLD" "$NEW"; then
    DIRECTION="newer"
  elif git -C "$TMP/sdk" fetch -q --depth 100 --filter=blob:none "$GIT_BASE/$SDK_REPO.git" "$OLD" 2>/dev/null; then
    if git -C "$TMP/sdk" merge-base --is-ancestor "$NEW" "$OLD" 2>/dev/null; then
      DIRECTION="older"
    else
      DIRECTION="diverged"
    fi
  fi
fi

case "$DIRECTION" in
  older)    echo "WARNING: $NEW is OLDER than the installed SDK $OLD ($SERVER_REPO@$BRANCH)" ;;
  diverged) echo "WARNING: $NEW and the installed SDK $OLD are on different SDK branches" ;;
esac

output updated true
output tgz "$TGZ"
output direction "$DIRECTION"

# 3. Optional summary of what changed in the SDK
if [ -n "${SDK_SUMMARY_FILE:-}" ]; then
  {
    case "$DIRECTION" in
      newer)
        echo "### SDK commits"
        git -C "$TMP/sdk" log --format='- %h %ad %an: %s' --date=short "$OLD..$NEW"
        ;;
      older)
        echo "> ⚠️ **Rollback**: \`$BRANCH\` pins an SDK that is OLDER than the installed one."
        echo "> IO is probably temporarily built from \`$BRANCH\`. Usually this PR should not be merged."
        echo ""
        echo "### SDK commits that would be removed"
        git -C "$TMP/sdk" log --format='- %h %ad %an: %s' --date=short "$NEW..$OLD"
        ;;
      diverged)
        echo "> ⚠️ The installed SDK and the \`$BRANCH\` pin are on different SDK branches."
        echo ""
        echo "### Latest SDK commits"
        git -C "$TMP/sdk" log -10 --format='- %h %ad %an: %s' --date=short "$NEW"
        ;;
      *)
        echo "### Latest SDK commits (previous SDK commit is not known)"
        git -C "$TMP/sdk" log -10 --format='- %h %ad %an: %s' --date=short "$NEW"
        ;;
    esac

    if [ "$DIRECTION" != "unknown" ]; then
      echo ""
      echo "### Changed files"
      for dir in api models; do
        STATUS=$(git -C "$TMP/sdk" diff --name-status "$OLD" "$NEW" -- "$dir")
        A=$(grep -c '^A' <<< "$STATUS" || true)
        M=$(grep -c '^M' <<< "$STATUS" || true)
        D=$(grep -c '^D' <<< "$STATUS" || true)
        R=$(grep -c '^R' <<< "$STATUS" || true)
        echo "- \`$dir/\`: added $A, modified $M, deleted $D, renamed $R"
      done
    fi
  } > "$SDK_SUMMARY_FILE"
fi

echo "Installed $TGZ from $SDK_REPO@$NEW"
