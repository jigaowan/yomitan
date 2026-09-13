#!/bin/sh
set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$SRCROOT/.." && pwd)
VERSION=${YOMITAN_EXTENSION_VERSION:-}
WEB_EXTENSION_DIR="$REPOSITORY_ROOT/builds/yomitan-safari-web-extension"
EXTENSION_RESOURCES_DIR="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH"
RESOURCE_STATE_DIR="$DERIVED_FILE_DIR/yomitan-web-extension"
RESOURCE_INVENTORY="$RESOURCE_STATE_DIR/top-level-resources.txt"

if [ -z "$VERSION" ]; then
    VERSION=$(git -C "$REPOSITORY_ROOT" describe --tags --abbrev=0 --match '*.*.*.*' HEAD)
fi

cd "$REPOSITORY_ROOT"

if [ -f "$RESOURCE_INVENTORY" ]; then
    while IFS= read -r resource_name; do
        case "$resource_name" in
            ""|.|..|*/*)
                printf 'Invalid generated resource name: %s\n' "$resource_name" >&2
                exit 1
                ;;
        esac
        rm -rf "$EXTENSION_RESOURCES_DIR/$resource_name"
    done < "$RESOURCE_INVENTORY"
fi

npm run build:safari -- --version "$VERSION"

/usr/bin/ditto "$WEB_EXTENSION_DIR" "$EXTENSION_RESOURCES_DIR"

mkdir -p "$RESOURCE_STATE_DIR"
find "$WEB_EXTENSION_DIR" -mindepth 1 -maxdepth 1 -exec basename {} \; \
    | LC_ALL=C sort > "$RESOURCE_INVENTORY"
