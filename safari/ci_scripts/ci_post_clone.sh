#!/bin/sh
set -eu

REPOSITORY_ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)

cd "$REPOSITORY_ROOT"

brew install node@22
brew link --overwrite --force node@22

node --version
npm --version
npm ci
